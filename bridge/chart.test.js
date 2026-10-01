import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChartFilter } from "./chart.js";
import { runBridge } from "./testing/run-bridge.js";

const BLOCK = "```nixi-chart\ntitle: Store\nnixpkgs 12\nhome 3\n```\n";

function run(chunks, dir) {
  const filter = createChartFilter(dir);
  return chunks.map((c) => filter.push(c)).join("") + filter.flush();
}
function sandbox(fn) {
  return () => {
    const dir = mkdtempSync(join(tmpdir(), "nixi-chart-"));
    try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  };
}

test("a valid block becomes an image with a non-empty alt, however it is split", sandbox((dir) => {
  const text = `Sizes:\n${BLOCK}Done.\n`;
  const whole = run([text], dir);
  assert.match(whole, /^Sizes:\n\n!\[Store\]\(file:\/\/.+\/[0-9a-f]{16}\.svg\)\nDone\.\n$/);
  for (let i = 1; i < text.length; i++) assert.equal(run([text.slice(0, i), text.slice(i)], dir), whole, `split at ${i}`);
  assert.equal(readdirSync(dir).length, 1, "the same chart is one file");
  const [, path] = whole.match(/file:\/\/(.+\.svg)/);
  assert.match(readFileSync(path, "utf8"), /^<svg xmlns=/);
}));

test("a chart without a title still has an alt", sandbox((dir) => {
  assert.match(run(["```nixi-chart\na 1\n```\n"], dir), /!\[chart\]\(file:/);
}));

test("a rejected, unclosed or unrelated block is released untouched", sandbox((dir) => {
  for (const text of [
    "```nixi-chart\nnot a chart\n```\n",
    "```nixi-chart\na -1\n```\n",
    "```nixi-chart\na 1\n",                 // never closes
    "```nixi-chart\na 1\n``",               // closes with something that is not a fence
    "```js\nlet a = 1\n```\n",
    "plain `nixi-chart` text\n",
    "```nixi-chart",
  ]) assert.equal(run([text], dir), text, text);
  assert.deepEqual(readdirSync(dir), []);
}));

test("ordinary text is not held back", () => {
  const filter = createChartFilter("/nonexistent");
  assert.equal(filter.push("Press SUPER"), "Press SUPER");
  assert.equal(filter.push("+RETURN\n"), "+RETURN\n");
  assert.equal(filter.push("``"), "", "a partial line that could open a chart waits");
  assert.equal(filter.push("`js\n"), "```js\n");
});

test("through the bridge, at Guide: split chart drawn, bad one left as code", async () => {
  const run = await runBridge({ messages: [{ type: "prompt", text: "PLEASE_CHART" }] });
  const shown = run.events.filter((e) => e.type === "text").map((e) => e.text).join("");
  assert.match(shown, new RegExp(
    `^Sizes:\\n\\n!\\[Store\\]\\(file://${run.home}/\\.local/share/nixi/media/[0-9a-f]{16}\\.svg\\)\\nDone\\.\\n\`\`\`nixi-chart\\nbad line\\n\`\`\`\\n$`));
});
