// Chart rendering for the Nixi overlay, kept Qt-free so it can be unit tested
// under node (bridge/media-model.test.js) -- the same shape as TourModel.js.
// CommonJS on purpose: no import/export and no require, so the bridge can
// require it and QML could import it.
//
// The image allowlist that used to live here now lives in TextFormat.js, where
// master grew one independently for the same reason (#42). One control, not two.

var MAX_ROWS = 24
var MAX_LABEL = 48
var MAX_TITLE = 80
var MAX_VALUE = 1e15

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function clean(s, max) {
  s = s.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

// The body of a ```nixi-chart block: an optional "title: ..." line, then one
// "label value" per line. Returns { title, svg } or null; null means malformed
// and the caller leaves the block as the ordinary code block it already is.
function chartSvg(block) {
  try {
    var lines = String(block == null ? "" : block).split("\n")
      .map(function(l) { return l.trim() })
      .filter(function(l) { return l !== "" })
    var title = ""
    var t = lines.length ? /^title:\s*(.*)$/i.exec(lines[0]) : null
    if (t) { title = clean(t[1], MAX_TITLE); lines.shift() }
    if (lines.length === 0 || lines.length > MAX_ROWS) return null

    var rows = []
    var max = 0
    for (var i = 0; i < lines.length; i++) {
      var m = /^(.+?)\s+(\S+)$/.exec(lines[i])
      if (!m || !/^[0-9.eE+]+$/.test(m[2])) return null
      var v = Number(m[2])
      if (!isFinite(v) || v < 0) return null
      v = Math.min(v, MAX_VALUE)
      var label = clean(m[1], MAX_LABEL)
      if (label === "") return null
      rows.push({ label: label, value: v })
      if (v > max) max = v
    }

    var W = 480, BAR = 340, top = title ? 28 : 8, ROW = 34
    var H = top + rows.length * ROW
    var out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + " " + H + '">'
    if (title) out += '<text x="8" y="18" font-size="14" font-weight="bold" fill="#9aa0a6">' + esc(title) + "</text>"
    rows.forEach(function(r, n) {
      var y = top + n * ROW
      var w = max > 0 ? Math.max(1, Math.round(r.value / max * BAR)) : 1
      out += '<text x="8" y="' + (y + 12) + '" font-size="12" fill="#9aa0a6">' + esc(r.label) + "</text>"
      out += '<rect x="8" y="' + (y + 16) + '" width="' + w + '" height="12" fill="#5b8def"/>'
      out += '<text x="' + (w + 14) + '" y="' + (y + 27) + '" font-size="11" fill="#9aa0a6">' +
        esc(String(+r.value.toFixed(2))) + "</text>"
    })
    return { title: title, svg: out + "</svg>" }
  } catch (e) {
    return null
  }
}

if (typeof module !== "undefined") {
  module.exports = {
      chartSvg: chartSvg
  }
}
