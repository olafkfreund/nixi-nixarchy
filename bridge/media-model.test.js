import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// MediaModel.js is shared with QML, so it is CommonJS like TourModel.js.
const require = createRequire(import.meta.url);
const Media = require("../MediaModel.js");

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

