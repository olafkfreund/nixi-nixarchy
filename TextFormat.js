// Display formatting for agent replies, kept Qt-free so it can be unit tested
// under node (bridge/text-format.test.js) -- the same shape as TourModel.js.
//
// Everything here runs on UNTRUSTED text: the body is whatever the agent wrote,
// and Conversation.qml renders the result as TextEdit.MarkdownText. Qt resolves
// images in a Markdown document through QQuickPixmap, which loads remote URLs,
// so rendering a reply is on its own enough to make an outbound request --
// measured on Qt 6.11.2, which fetched an http:// image with its query string
// intact and no user action (#42). safeImages() is what stops that.

// Only a local file under an explicitly allowed root may render; everything
// else becomes its alt text, so the reader still sees that something was there.
//
// The default is "" -- allow NOTHING. No feature writes images an agent would
// reference today (bridge/preview.js thumbnails go to the XDG cache and are
// never referenced from Markdown), so the safe default is to render no image at
// all. Conversation.qml passes the real root, because this file stays Qt-free
// and cannot expand ~ itself. A caller that passes nothing gets the closed door,
// which is the behaviour to keep if the local-image feature is never built.

// Resolve "." and ".." without touching the filesystem, then require the result
// to sit under root. Normalising AFTER the prefix test is the classic hole, so
// the order here matters.
function containedPath(path, root) {
  if (typeof path !== "string" || path === "") return null
  var decoded
  try { decoded = decodeURIComponent(path) } catch (error) { return null }
  if (decoded.indexOf("\u0000") >= 0) return null
  if (decoded.charAt(0) !== "/") return null
  var parts = decoded.split("/")
  var stack = []
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i]
    if (part === "" || part === ".") continue
    if (part === "..") { stack.pop(); continue }
    stack.push(part)
  }
  var resolved = "/" + stack.join("/")
  var prefix = root.charAt(root.length - 1) === "/" ? root : root + "/"
  return (resolved === root || resolved.indexOf(prefix) === 0) ? resolved : null
}

// True only for a file:// or absolute path that stays inside root.
function allowedImageSource(source, root) {
  if (typeof root !== "string" || root === "") return false
  var value = String(source || "").trim()
  if (value === "") return false
  // A source may be wrapped in <> or carry a "title" after the URL.
  if (value.charAt(0) === "<") value = value.slice(1, value.indexOf(">") < 0 ? undefined : value.indexOf(">"))
  value = value.split(/\s+/)[0]
  if (/^file:\/\//i.test(value)) return containedPath(value.replace(/^file:\/\//i, ""), root) !== null
  // Anything with a scheme -- http, https, data, javascript, protocol-relative
  // -- is refused outright. Only a bare absolute path can be local.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.indexOf("//") === 0) return false
  return containedPath(value, root) !== null
}

// Replace every image whose source is not a contained local file with its alt
// text. Applied per line, outside fenced code, by spacedMarkdown.
function safeImagesInLine(line, root) {
  var out = ""
  var i = 0
  while (i < line.length) {
    var start = line.indexOf("![", i)
    if (start < 0) { out += line.slice(i); break }
    var altEnd = line.indexOf("](", start)
    if (altEnd < 0) { out += line.slice(i); break }
    // Markdown allows balanced parens inside a URL, so scan with a depth
    // counter rather than matching to the first ")" -- a regex doing that
    // leaves the trailing paren behind on ![x](javascript:alert(1)).
    var depth = 1
    var j = altEnd + 2
    for (; j < line.length && depth > 0; j++) {
      if (line.charAt(j) === "(") depth++
      else if (line.charAt(j) === ")") depth--
    }
    if (depth !== 0) { out += line.slice(i); break }
    var alt = line.slice(start + 2, altEnd)
    var source = line.slice(altEnd + 2, j - 1)
    out += line.slice(i, start)
    out += allowedImageSource(source, root) ? line.slice(start, j)
      : (alt ? "[" + alt + "]" : "[image]")
    i = j
  }
  return out
}

// Qt renders consecutive Markdown paragraphs with no vertical gap at all,
// and folds a whitespace-only line away as blank. A paragraph holding one
// non-breaking space survives and reads as a single blank line, so those are
// inserted at paragraph breaks for display only; the stored message is not
// touched. Fenced code is copied verbatim, where such a line would become
// part of the code -- and where an ![...] is example text, not an image.
function spacedMarkdown(text, root) {
  var imageRoot = typeof root === "string" ? root : ""
  var value = String(text || "")
  if (value.indexOf("\n") < 0) return safeImagesInLine(value, imageRoot)
  var lines = value.split("\n")
  var out = []
  var fenced = false
  var pendingBreak = false
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    var fence = /^\s{0,3}(```|~~~)/.test(line)
    if (fence) fenced = !fenced
    if (!fenced && !fence && line.trim() === "") {
      if (out.length > 0) pendingBreak = true
      continue
    }
    if (pendingBreak) {
      pendingBreak = false
      // A blank line before a list item marks a loose list. A paragraph
      // inserted there would split the list in two and restart ordered
      // numbering, so the original break is emitted unchanged instead.
      if (/^\s*([-*+]|\d+[.)])\s/.test(line)) out.push("")
      else out.push("", " ", "")
    }
    // Inside a fence, and on the fence lines themselves, the text is copied
    // verbatim: rewriting there would corrupt code the user copies out.
    out.push(fenced || fence ? line : safeImagesInLine(line, imageRoot))
  }
  return out.join("\n")
}

// Only http and https may be handed to the desktop. The link target and its
// visible label are both agent-authored, so a label need not describe where it
// goes, and xdg-open dispatches any other scheme to a registered handler.
function openableLink(link) {
  return /^https?:\/\//i.test(String(link || ""))
}

if (typeof module !== "undefined") {
  module.exports = {
    spacedMarkdown: spacedMarkdown,
    safeImagesInLine: safeImagesInLine,
    allowedImageSource: allowedImageSource,
    containedPath: containedPath,
    openableLink: openableLink
  }
}
