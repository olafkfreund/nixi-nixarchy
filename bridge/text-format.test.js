import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// TextFormat.js is shared with QML, so it is CommonJS-compatible like
// TourModel.js, not an ES module.
const require = createRequire(import.meta.url);
const T = require("../TextFormat.js");

const ROOT = "/home/u/.local/share/nixi/images";
const md = (text, root = ROOT) => T.spacedMarkdown(text, root);

// --- the vulnerability this file exists for (#42) -------------------------
// Confirmed on Qt 6.11.2 before the fix: a Markdown document containing an
// http:// image caused QQuickPixmap to fetch it on render, query string
// intact, with no user action. Rendering a reply was the whole exploit.

test("a remote image never survives to the renderer (#42)", () => {
  for (const src of [
    "http://evil.example/p?d=SECRET",
    "https://evil.example/p",
    "//evil.example/p",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "HtTpS://evil.example/p",
  ]) assert.equal(md(`![leak](${src})`), "[leak]", src);
});

test("an image with no alt text still leaves a visible marker (#42)", () => {
  assert.equal(md("![ ](http://evil.example/p)"), "[ ]");
  assert.equal(md("![](http://evil.example/p)"), "[image]");
});

test("a contained local file renders unchanged (#42)", () => {
  const ok = `![diagram](${ROOT}/a.png)`;
  assert.equal(md(ok), ok);
  assert.equal(md(`![d](file://${ROOT}/a.png)`), `![d](file://${ROOT}/a.png)`);
});

test("a path that escapes the root is refused (#42)", () => {
  for (const src of [
    `${ROOT}/../../../etc/passwd`,
    `${ROOT}/../.ssh/id_ed25519`,
    "/etc/passwd",
    `file://${ROOT}/../../../etc/shadow`,
    `${ROOT}/%2e%2e/%2e%2e/etc/passwd`,
  ]) assert.equal(md(`![x](${src})`), "[x]", src);
});

test("with no root configured, no image renders at all (#42)", () => {
  // The default is a closed door: nothing writes agent-referenced images today.
  assert.equal(T.spacedMarkdown(`![x](${ROOT}/a.png)`), "[x]");
  assert.equal(T.spacedMarkdown(`![x](${ROOT}/a.png)`, ""), "[x]");
});

test("only http and https may be opened (#42)", () => {
  for (const ok of ["http://a.example", "https://a.example/x?y=1", "HTTPS://A"])
    assert.ok(T.openableLink(ok), ok);
  for (const no of ["file:///etc/passwd", "javascript:alert(1)", "ftp://a", "",
                    "mailto:a@b", "//a.example", "data:text/html,x"])
    assert.ok(!T.openableLink(no), no);
});

// --- what must not regress ------------------------------------------------

test("fenced code passes through byte-identical, images included", () => {
  // spacedMarkdown's own comment: inserting anything inside a fence corrupts
  // the code the user copies out. An ![...] in a fence is example text.
  const fenced = "before\n\n```\n![x](http://evil.example/p)\nplain  text\n\n\ncode\n```\n\nafter";
  const out = md(fenced);
  const body = out.slice(out.indexOf("```"), out.lastIndexOf("```") + 3);
  assert.equal(body, "```\n![x](http://evil.example/p)\nplain  text\n\n\ncode\n```");
});

test("a single-line string is returned with images handled and nothing else", () => {
  assert.equal(md("just text"), "just text");
  assert.equal(md("![x](http://evil.example/p)"), "[x]");
});

test("a blank line before a list item does not restart ordered numbering", () => {
  // A paragraph inserted there would split the list in two.
  const out = md("intro\n\n1. one\n2. two").split("\n");
  assert.ok(!out.includes(" "), `inserted a paragraph into a list: ${JSON.stringify(out)}`);
});

test("a paragraph break still gets its spacer", () => {
  assert.ok(md("one\n\ntwo").includes(" "), "lost the paragraph spacer");
});

test("unbalanced fences terminate", () => {
  assert.doesNotThrow(() => md("a\n```\nb\nc"));
});
