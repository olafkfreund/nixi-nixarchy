import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionDetail, CAP_BYTES, CAP_LINES } from "./permission-detail.js";

const cutLine = (n) =>
  `… ${n.toLocaleString("en-US")} more characters not shown. If you cannot see all of what you are approving, choose Deny.`;

test("a string command and an argv array are shown whole", () => {
  const command = "omarchy-shell reload && echo " + "x".repeat(500) + " && echo TAIL";
  assert.deepEqual(permissionDetail({ rawInput: { command } }), { detail: command, omitted: 0 });
  assert.deepEqual(permissionDetail({ rawInput: { command: ["rm", "-rf", "/tmp/probe"] } }),
    { detail: "rm -rf /tmp/probe", omitted: 0 });
});

test("an edit diff, and a new file with no oldText", () => {
  const edit = permissionDetail({ content: [{ type: "diff", path: "/tmp/a", oldText: "one\ntwo\n", newText: "one\nthree\n" }] });
  assert.deepEqual(edit, { detail: "/tmp/a\n- one\n- two\n+ one\n+ three", omitted: 0 });
  const created = permissionDetail({ content: [{ type: "diff", path: "/tmp/new", newText: "hello\n" }] });
  assert.deepEqual(created, { detail: "/tmp/new\n+ hello", omitted: 0 });
});

test("several diffs in one call, and text content; terminals are skipped", () => {
  const { detail } = permissionDetail({
    content: [
      { type: "diff", path: "/tmp/a", oldText: "a", newText: "b" },
      { type: "terminal", terminalId: "term-1" },
      { type: "diff", path: "/tmp/c", oldText: "c", newText: "d" },
      { type: "content", content: { type: "text", text: "Why: tidy up" } },
    ],
  });
  assert.equal(detail, "/tmp/a\n- a\n+ b\n\n/tmp/c\n- c\n+ d\n\nWhy: tidy up");
  assert.ok(!detail.includes("term-1"));
});

test("an unknown rawInput is shown as JSON", () => {
  const rawInput = { file_path: "/etc/hosts", limit: 20 };
  assert.deepEqual(permissionDetail({ rawInput }), { detail: JSON.stringify(rawInput, null, 2), omitted: 0 });
});

test("nothing at all gives an empty detail", () => {
  for (const toolCall of [undefined, null, {}, { title: "Write ~/probe" }, { rawInput: {}, content: [] }])
    assert.deepEqual(permissionDetail(toolCall), { detail: "", omitted: 0 }, JSON.stringify(toolCall));
});

test("a 1 MB newText is cut at the cap, with omitted exact", () => {
  const newText = "x".repeat(1024 * 1024);
  const full = "/tmp/big\n+ " + newText;
  const { detail, omitted } = permissionDetail({ content: [{ type: "diff", path: "/tmp/big", newText }] });
  assert.equal(omitted, full.length - CAP_BYTES);
  assert.equal(detail, full.slice(0, CAP_BYTES) + "\n" + cutLine(omitted));

  // Many short lines hit the line cap first.
  const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n");
  const byLines = permissionDetail({ rawInput: { command: lines } });
  const kept = lines.split("\n").slice(0, CAP_LINES).join("\n");
  assert.equal(byLines.omitted, lines.length - kept.length);
  assert.equal(byLines.detail, kept + "\n" + cutLine(byLines.omitted));
});

test("markup is passed through unchanged; the card renders it as plain text", () => {
  const toolCall = { title: "<b>Run</b>", rawInput: { command: "echo '<font color=red>hi</font>'" } };
  assert.deepEqual(permissionDetail(toolCall), { detail: "echo '<font color=red>hi</font>'", omitted: 0 });
});
