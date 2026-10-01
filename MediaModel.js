// Rich-media logic for the Nixi overlay, kept Qt-free so it can be unit tested
// under node (bridge/media-model.test.js) -- the same shape as TourModel.js.
// CommonJS on purpose: QML imports this file and has no module loader, so no
// import/export and no require. Every function returns a new value.
//
// sanitize() runs in the QML text binding on every streamed chunk, so it must
// stay cheap and must never throw -- a throw stops the reply rendering mid-turn.

var MAX_ROWS = 24
var MAX_LABEL = 48
var MAX_TITLE = 80
var MAX_VALUE = 1e15

// DEFAULT DENY. Every "![" outside a fenced block loses its "!" -- becoming an
// ordinary link -- unless what follows it matches ALLOWED exactly and names a
// file inside the media directory.
//
// The earlier version matched images with a regex and passed anything it did
// not recognise through untouched. That is default-ALLOW on no-match, and
// CommonMark has more image forms than a regex of that shape can hold: nested
// brackets in the alt (`![see [this] shot](url)`), an escaped bracket
// (`![a\]b](url)`), and the shortcut reference (`![leak]` with a later
// `[leak]: url`) all slipped past and were fetched for real by the card --
// proved against a listener, which logged all three.
//
// So the question is inverted. Nothing is an image until it is proved to be a
// local one, and an unrecognised form loses its "!" like everything else.
var FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
// ![alt](url) on one line: no brackets, backslash or whitespace anywhere in the
// alt or the url. A backslash could escape the closing bracket; whitespace
// could hide a second destination. Anything richer is not worth admitting.
var ALLOWED = /^!\[([^\[\]\\]*)\]\((file:\/\/\/[^\s()<>\\\]\[]*)\)/

// An image renders only from a file:// path inside the media directory. The
// trailing separator stops "/media-evil/" passing as "/media/"; ".." and an
// encoded dot are refused before any prefix comparison.
function allowed(url, dir) {
  if (!dir || url.slice(0, 8) !== "file:///") return false
  if (url.indexOf("..") !== -1 || /%2e/i.test(url) || url.indexOf("\\") !== -1) return false
  var path = url.slice(7)
  return path.length > dir.length && path.slice(0, dir.length) === dir
}

// Linear: one pass, no backtracking. The binding re-runs this over the whole
// accumulated body on every streamed chunk, so it cannot afford an ambiguous
// pattern -- the previous one went quadratic on an unterminated "![a](".
function denyImages(line, dir) {
  var out = ""
  var i = 0
  while (true) {
    var at = line.indexOf("![", i)
    if (at < 0) return out + line.slice(i)
    out += line.slice(i, at)
    var match = ALLOWED.exec(line.slice(at))
    if (match && allowed(match[2], dir)) {
      out += match[0]
      i = at + match[0].length
    } else {
      // Drop the "!": an image nobody proved local is a link.
      out += "["
      i = at + 2
    }
  }
}

function sanitize(markdown, mediaDir) {
  try {
    var text = String(markdown == null ? "" : markdown)
    if (text.indexOf("![") === -1) return text
    var dir = String(mediaDir || "").replace(/\/+$/, "") + "/"
    if (dir === "/") dir = ""
    var lines = text.split("\n")
    var fence = null   // { ch, len } while inside a fenced block
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      var f = FENCE.exec(line)
      if (fence) {
        if (f && f[1][0] === fence.ch && f[1].length >= fence.len && f[2].trim() === "") fence = null
        continue
      }
      if (f) { fence = { ch: f[1][0], len: f[1].length }; continue }
      if (line.indexOf("![") === -1) continue
      lines[i] = denyImages(line, dir)
    }
    return lines.join("\n")
  } catch (e) {
    // Fail closed. An error inside the allowlist must not hand the renderer an
    // image it never checked -- that is the whole control. Dropping the "!"
    // turns every image, in every form, into an ordinary link.
    try { return String(markdown == null ? "" : markdown).replace(/!\[/g, "[") }
    catch (again) { return "" }
  }
}

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
    sanitize: sanitize,
    chartSvg: chartSvg
  }
}
