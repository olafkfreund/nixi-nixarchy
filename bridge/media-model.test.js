import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// MediaModel.js is shared with QML, so it is CommonJS like TourModel.js.
const require = createRequire(import.meta.url);
const Media = require("../MediaModel.js");

const dir = "/home/u/.local/share/nixi/media";

test("an image outside the media directory becomes a plain link", () => {
  for (const url of [
    "http://127.0.0.1:8731/x.png?secret=LEAKED",
    "https://example.com/x.png",
    "data:image/png;base64,AAAA",
    "file:///etc/passwd",
    "file://host/home/u/.local/share/nixi/media/a.png",
  ]) {
    assert.equal(Media.sanitize(`see ![leak](${url}) ok`, dir), `see [leak](${url}) ok`, url);
  }
  assert.equal(Media.sanitize("![a][r]\n\n[r]: http://x/y.png", dir), "[a][r]\n\n[r]: http://x/y.png", "reference style");
  assert.equal(Media.sanitize('![a](http://x/y.png "t")', dir), '[a](http://x/y.png "t")', "with a title");
  assert.equal(Media.sanitize("![a](<http://x/y z.png>)", dir), "[a](<http://x/y z.png>)", "angle brackets");
});

test("an image inside the media directory survives", () => {
  const md = `![](file://${dir}/abc123.png)`;
  assert.equal(Media.sanitize(md, dir), md);
  assert.equal(Media.sanitize(md, dir + "/"), md, "trailing slash on the directory");
});

test("a lookalike directory or a dot-dot path does not pass", () => {
  assert.equal(Media.sanitize(`![](file://${dir}-evil/a.png)`, dir), `[](file://${dir}-evil/a.png)`);
  assert.equal(Media.sanitize(`![](file://${dir})`, dir), `[](file://${dir})`, "the directory itself");
  assert.equal(Media.sanitize(`![](file://${dir}/../../x.png)`, dir), `[](file://${dir}/../../x.png)`);
  assert.equal(Media.sanitize(`![](file://${dir}/%2e%2e/x.png)`, dir), `[](file://${dir}/%2e%2e/x.png)`);
  assert.equal(Media.sanitize(`![](file://${dir}/a.png)`, ""), `[](file://${dir}/a.png)`, "no directory, nothing allowed");
});

test("an image inside a fenced block is text and is left alone", () => {
  const md = "before\n```md\n![x](http://a/b.png)\n```\n![y](http://a/c.png)\n~~~\n![z](http://a/d.png)\n~~~";
  assert.equal(
    Media.sanitize(md, dir),
    "before\n```md\n![x](http://a/b.png)\n```\n[y](http://a/c.png)\n~~~\n![z](http://a/d.png)\n~~~"
  );
  const open = "```\n![x](http://a/b.png)";
  assert.equal(Media.sanitize(open, dir), open, "an unclosed fence (mid-stream) stays code");
  const mixed = "````\n```\n![x](http://a/b.png)\n```\n````\n![y](http://a/c.png)";
  assert.equal(Media.sanitize(mixed, dir), mixed.replace("![y]", "[y]"), "a shorter fence does not close a longer one");
});

test("sanitize never throws", () => {
  for (const v of [undefined, null, 42, "", "![", "![]()", "![a](", {}]) {
    assert.equal(typeof Media.sanitize(v, dir), "string");
  }
  assert.equal(typeof Media.sanitize("![a](http://x)", undefined), "string");
});

test("a well-formed chart yields a standalone svg", () => {
  const c = Media.chartSvg("title: Store size\nnixpkgs 12.5\nhome-manager 3\n");
  assert.equal(c.title, "Store size");
  assert.match(c.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+" viewBox="0 0 \d+ \d+">/);
  assert.equal((c.svg.match(/<rect /g) || []).length, 2);
  assert.ok(c.svg.endsWith("</svg>"));
  assert.equal(Media.chartSvg("a 1").title, "", "title is optional");
  assert.ok(Media.chartSvg("a 0\nb 0"), "all-zero values still draw");
});

test("a malformed chart block returns null", () => {
  for (const bad of ["", "title: only a title", "no value here", "a b", "a 1 2x", "justlabel", undefined, null, 7]) {
    assert.equal(Media.chartSvg(bad), null, String(bad));
  }
});

test("hostile chart input is bounded or refused", () => {
  assert.equal(Media.chartSvg("a -1"), null, "negative");
  assert.equal(Media.chartSvg("a Infinity"), null, "infinity");
  assert.equal(Media.chartSvg("a NaN"), null, "nan");
  assert.equal(Media.chartSvg("a 1e999"), null, "overflows to infinity");
  assert.equal(Media.chartSvg("a abc"), null, "non-numeric");
  const rows = (n) => Array.from({ length: n }, (_, i) => `r${i} ${i}`).join("\n");
  assert.ok(Media.chartSvg(rows(24)), "24 rows is the limit");
  assert.equal(Media.chartSvg(rows(25)), null, "more than 24 rows");

  const long = Media.chartSvg(`${"x".repeat(5000)} 1`);
  assert.ok(long.svg.length < 2000, "a long label is cut");
  assert.ok(!long.svg.includes("x".repeat(49)));
  assert.ok(Media.chartSvg(`title: ${"t".repeat(5000)}\na 1`).svg.length < 2000, "a long title is cut");

  const big = Media.chartSvg("a 1e300\nb 1");
  assert.ok(!/e\+|Infinity|NaN/.test(big.svg), "clamped values stay printable");

  const evil = Media.chartSvg('title: <script>&"\n<b onload="x"> & co 3');
  assert.ok(!/<script|<b /i.test(evil.svg));
  assert.match(evil.svg, /&lt;script&gt;&amp;&quot;/);
  assert.match(evil.svg, /&lt;b onload=&quot;x&quot;&gt; &amp; co/);
});

test("sanitize fails closed when something inside it throws", () => {
  // The allowlist is the control that stops the card fetching a remote image.
  // If it ever breaks, it must drop images rather than pass them through
  // unchecked -- and it still must not throw into the QML binding.
  const hostile = { toString() { throw new Error("boom"); } };
  assert.equal(Media.sanitize(hostile, "/home/u/.local/share/nixi/media"), "");

  const onlyDirThrows = { toString() { throw new Error("boom"); } };
  const out = Media.sanitize("![x](http://evil/?a=1)", onlyDirThrows);
  assert.ok(!out.includes("!["), "no image survives the fallback");
  assert.ok(out.includes("http://evil/?a=1"), "the text is still readable as a link");
});

test("no image survives unless it is proved local, whatever form it takes", () => {
  const dir = "/home/u/.local/share/nixi/media";
  // Every one of these reached the network through the first version of this
  // allowlist. The first three were fetched for real by the card -- a listener
  // logged GET /a.png?via=NESTED, /b.png?via=ESCAPED and /c.png?via=SHORTCUT --
  // because that version matched images with a regex and let anything it did
  // not recognise through. These are the regression tests for default-deny.
  const bypasses = [
    "![see [this] shot](http://evil/a.png)",        // balanced brackets in the alt
    "![a\\]b](http://evil/b.png)",                  // backslash-escaped bracket
    "![leak]\n\n[leak]: http://evil/c.png",         // shortcut reference
    "![a](\nhttp://evil/d.png)",                    // destination on the next line
    "![a\nb](http://evil/e.png)",                   // alt spanning two lines
    "![a][r]\n\n[r]: http://evil/f.png",            // full reference
    "![a][]\n\n[a]: http://evil/g.png",             // collapsed reference
    "![a](<http://evil/h.png>)",                    // angle-bracketed destination
    '![a](http://evil/i.png "title")',              // destination with a title
    "![d](data:image/png;base64,AAAA)",             // data uri
    "![o](file:///etc/shadow.png)",                 // outside the media directory
    `![s](file://${dir}-evil/x.png)`,               // sibling directory
    `![u](file://${dir}/../../secret.png)`,         // traversal
    `![e](file://${dir}/%2e%2e/secret.png)`,        // encoded traversal
  ];
  for (const input of bypasses)
    assert.ok(!/!\[/.test(Media.sanitize(input, dir)), input);

  // and the one that must still work
  assert.match(Media.sanitize(`![image](file://${dir}/abc123.png)`, dir),
    new RegExp(`^!\\[image\\]\\(file://${dir}/abc123\\.png\\)$`));
});

test("sanitize stays linear on a hostile line", () => {
  // The first version's pattern was ambiguous and went quadratic on an
  // unterminated "![a](" -- 266ms for one 20k line, re-run on every chunk.
  const line = "![a](" + "x".repeat(20000);
  const started = Date.now();
  Media.sanitize(line, "/home/u/.local/share/nixi/media");
  assert.ok(Date.now() - started < 50, `took ${Date.now() - started}ms`);
});
