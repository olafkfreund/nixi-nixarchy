import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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


// #50: what the card shows must be unambiguous about what will run. The two
// tests below cover the rendering half; the settle window that stops a request
// being answered before it renders is QML timing and has no coverage here --
// it is asserted against the source in tools/test_nixi.py
// (test_permission_settle_window) and its 400 ms can only be judged on a real
// desktop. Nothing in this file pretends otherwise.

test("an argument containing a space is quoted, so it reads as one argument", () => {
  // The issue's own example: join(" ") showed this as two paths.
  assert.deepEqual(permissionDetail({ rawInput: { command: ["rm", "-rf", "/tmp/a b"] } }),
    { detail: "rm -rf '/tmp/a b'", omitted: 0 });
});

test("the quoting is real POSIX quoting: a shell parses it back to the same argv", () => {
  // Not "what the function emits" -- what /bin/sh makes of what it emits. The
  // args are the awkward ones: a space, an embedded single quote, an empty
  // element (invisible before this), a tab, a double quote, something that
  // would expand, something that would glob.
  const args = ["/tmp/a b", "it's here", "", "x\ty", 'a"b', "$HOME/x", "*"];
  const { detail } = permissionDetail({ rawInput: { command: ["printf", "%s\\n", ...args] } });
  const printed = execFileSync("sh", ["-c", detail], { encoding: "utf8", cwd: "/" });
  assert.deepEqual(printed.split("\n").slice(0, -1), args);
  assert.ok(detail.includes("'it'\\''s here'"), detail);
});

test("an argv needing no quoting is unchanged, so a quote stays a signal", () => {
  const { detail } = permissionDetail({ rawInput: { command: ["git", "log", "--oneline", "-n", "20", "origin/master..HEAD"] } });
  assert.equal(detail, "git log --oneline -n 20 origin/master..HEAD");
  assert.ok(!detail.includes("'"), detail);
});

test("a field carried beside command is shown, not dropped", () => {
  // Bash's rawInput today. `command` returned early, so `description` and
  // `timeout` never reached the card being approved.
  const rawInput = { command: "rm -rf /tmp/probe", description: "Clean up", timeout: 120000 };
  assert.deepEqual(permissionDetail({ rawInput }), {
    detail: 'rm -rf /tmp/probe\n' + JSON.stringify({ description: "Clean up", timeout: 120000 }, null, 2),
    omitted: 0,
  });
  // The command stays first: it is the part that must be read.
  assert.ok(permissionDetail({ rawInput }).detail.startsWith("rm -rf /tmp/probe\n"));
});

test("a command that is neither string nor array is still shown", () => {
  const { detail } = permissionDetail({ rawInput: { command: { argv: ["ls"] }, cwd: "/tmp" } });
  assert.ok(detail.includes('"argv"') && detail.includes('"/tmp"'), detail);
});
