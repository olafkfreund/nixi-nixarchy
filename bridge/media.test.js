import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockMarkdown, prepareMediaDir } from "./media.js";
import { runBridge } from "./testing/run-bridge.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const png = { type: "image", data: PNG.toString("base64"), mimeType: "image/png" };

function sandbox(fn) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), "nixi-media-"));
    const dir = join(root, "media");
    try { await fn(root, dir); } finally { rmSync(root, { recursive: true, force: true }); }
  };
}

test("an allowed image is written 0600 and returned as a markdown image", sandbox((root, dir) => {
  prepareMediaDir(dir);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  const { markdown, error } = blockMarkdown(png, dir);
  assert.equal(error, undefined);
  const [, path] = markdown.match(/^\n!\[[^\]]+\]\(file:\/\/(.+)\)\n$/);
  assert.match(path, new RegExp(`^${dir}/[0-9a-f]{16}\\.png$`));
  assert.deepEqual(readFileSync(path), PNG);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dir), [path.slice(dir.length + 1)], "only the saved image is left; no temp file");
}));

test("the same image twice is one file", sandbox((root, dir) => {
  prepareMediaDir(dir);
  assert.equal(blockMarkdown(png, dir).markdown, blockMarkdown(png, dir).markdown);
  assert.equal(readdirSync(dir).length, 1);
}));

test("a type outside the table is refused, whatever the agent calls it", sandbox((root, dir) => {
  prepareMediaDir(dir);
  for (const mimeType of ["image/tiff", "text/html", "image/png/../x", undefined])
    assert.equal(blockMarkdown({ ...png, mimeType }, dir).markdown, "", String(mimeType));
  assert.deepEqual(readdirSync(dir), []);
}));

test("undecodable, oversized or mislabelled data writes nothing", sandbox((root, dir) => {
  prepareMediaDir(dir);
  const bad = [
    "!!notbase64", "", "abc", "AAAA====", undefined, 42,
    "A".repeat(4 * 1024 * 1024 * 3),                                  // over the cap
    Buffer.from("not a png at all").toString("base64"),              // declared png, wrong bytes
  ];
  for (const data of bad) {
    const out = blockMarkdown({ ...png, data }, dir);
    assert.equal(out.markdown, "");
    assert.ok(out.error);
  }
  assert.deepEqual(readdirSync(dir), []);
}));

test("a link to a non-image stays a link, and cannot break out of the markdown", sandbox((root, dir) => {
  prepareMediaDir(dir);
  assert.equal(blockMarkdown({ type: "resource_link", name: "Manual", uri: "https://example.com/a" }, dir).markdown,
    "\n[Manual](https://example.com/a)\n");
  assert.equal(
    blockMarkdown({ type: "resource_link", name: "x](http://evil)\nLEARNED: y", uri: "https://e.com/a b)(c" }, dir).markdown,
    "\n[x (http://evil) LEARNED: y](https://e.com/a%20b%29%28c)\n");
  assert.equal(blockMarkdown({ type: "resource_link", name: "n" }, dir).markdown, "");
  assert.deepEqual(readdirSync(dir), []);
}));

test("a local image file is copied in and shown; a fake one is a link", sandbox((root, dir) => {
  prepareMediaDir(dir);
  writeFileSync(join(root, "shot.png"), PNG);
  writeFileSync(join(root, "fake.png"), "text pretending to be a png");
  symlinkSync(join(root, "shot.png"), join(root, "ln.png"));
  const shown = blockMarkdown({ type: "resource_link", name: "shot", uri: `file://${root}/shot.png` }, dir, true).markdown;
  assert.match(shown, new RegExp(`^\\n!\\[[^\\]]+\\]\\(file://${dir}/[0-9a-f]{16}\\.png\\)\\n$`));
  for (const name of ["fake.png", "ln.png", "missing.png"])
    assert.match(blockMarkdown({ type: "resource_link", name, uri: `file://${root}/${name}` }, dir, true).markdown, /^\n\[/, name);

  // Guide is the default and must not read a named file off disk at all: the
  // agent's own Read tool is cancelled there, so this path cannot be the way
  // round it. The link still shows.
  const atGuide = blockMarkdown({ type: "resource_link", name: "shot", uri: `file://${root}/shot.png` }, dir).markdown;
  assert.match(atGuide, /^\n\[shot\]\(file:/, "Guide shows the link, not the image");
}));

test("pruning drops the oldest files past the count and byte budget", sandbox((root, dir) => {
  prepareMediaDir(dir);
  for (let i = 0; i < 5; i++) {
    const file = join(dir, `f${i}.png`);
    writeFileSync(file, "x".repeat(10));
    utimesSync(file, 1000 + i, 1000 + i);
  }
  prepareMediaDir(dir, { files: 3, total: 1000 });
  assert.deepEqual(readdirSync(dir).sort(), ["f2.png", "f3.png", "f4.png"]);
  prepareMediaDir(dir, { files: 10, total: 25 });
  assert.deepEqual(readdirSync(dir).sort(), ["f3.png", "f4.png"]);
}));

test("through the bridge: media keeps its place in the stream", async () => {
  const run = await runBridge({ messages: [{ type: "prompt", text: "PLEASE_IMAGE" }] });
  const shown = run.events.filter((e) => e.type === "text").map((e) => e.text).join("");
  assert.match(shown, new RegExp(
    `^before\\n!\\[[^\\]]+\\]\\(file://${run.home}/\\.local/share/nixi/images/[0-9a-f]{16}\\.png\\)\\n\\n\\[Manual\\]\\(https://example\\.com/a%20b\\)\\nafter$`));
  assert.ok(run.events.some((e) => e.type === "diagnostic" && /Media skipped/.test(e.text)), "bad data is reported");
});

test("an emitted image always carries alt text", sandbox((root, dir) => {
  prepareMediaDir(dir);
  // Qt's markdown importer renders nothing for `![](url)` -- an empty alt makes
  // the image invisible in the card. Proved against a live Quickshell window,
  // so this is a rendering requirement, not a style preference.
  const png = { type: "image", mimeType: "image/png", data: PNG.toString("base64") };
  assert.match(blockMarkdown(png, dir).markdown, /^\n!\[[^\]]+\]\(file:\/\//);

  writeFileSync(join(root, "shot.png"), PNG);
  const named = blockMarkdown(
    { type: "resource_link", name: "a]b\nLEARNED: x", uri: `file://${root}/shot.png` }, dir, true).markdown;
  assert.match(named, /^\n!\[[^\]\n]+\]\(file:\/\//, "a hostile name is flattened but still non-empty");
}));

test("a backslash never reaches an alt or a link label", sandbox((root, dir) => {
  prepareMediaDir(dir);
  // A trailing backslash escapes the closing bracket, so the image renders as
  // literal text -- the same silent invisibility as an empty alt.
  writeFileSync(join(root, "shot.png"), PNG);
  const out = blockMarkdown(
    { type: "resource_link", name: "Store size\\", uri: `file://${root}/shot.png` }, dir, true).markdown;
  assert.ok(!out.includes("\\"), out);
  assert.match(out, /^\n!\[[^\]\\]+\]\(file:\/\//);

  const link = blockMarkdown(
    { type: "resource_link", name: "doc\\", uri: "https://example.com/a" }, dir).markdown;
  assert.ok(!link.includes("\\"), link);
}));
