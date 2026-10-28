// #114: the remembered-approvals store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAlways, isChained, keyOf, rememberable, storePath } from "./always.js";

const bash = (command, kind = "execute") => ({ kind, rawInput: { command } });
const fresh = () => storePath(mkdtempSync(join(tmpdir(), "nixi-always-")));

test("only a plain, unchained, non-secret, non-herdr shell command can be remembered", () => {
  assert.ok(rememberable(bash("uname -r")));
  assert.ok(rememberable(bash(["systemctl", "--user", "status", "nixi"])));
  for (const command of ["a; b", "a && b", "a | b", "a > f", "echo $(id)", "a\nb", ["bash", "-lc", "a; b"]])
    assert.ok(!rememberable(bash(command)), JSON.stringify(command));
  assert.ok(!rememberable(bash("cat ~/.ssh/id_ed25519")), "secret path");
  assert.ok(!rememberable(bash("herdr agent list")), "herdr");
  assert.ok(!rememberable(bash("uname -r", "edit")), "not execute");
  assert.ok(!rememberable(bash("   ")), "empty");
  assert.ok(isChained(bash(["bash", "-lc", "a; b"])));
  // a tool call that runs in another directory is not this folder's to remember
  assert.ok(rememberable({ kind: "execute", rawInput: { command: "ls", cwd: "/p" } }, "/p"));
  assert.ok(!rememberable({ kind: "execute", rawInput: { command: "ls", cwd: "/elsewhere" } }, "/p"));
  assert.ok(!rememberable({ kind: "execute", rawInput: { command: "ls", workdir: "/elsewhere" } }, "/p"));
});

test("the key is the exact command: ends trimmed, nothing else", () => {
  assert.equal(keyOf(bash("  uname  -r  ")), "uname  -r");
  assert.equal(keyOf(bash(["echo", "a b"])), "echo 'a b'");
});

test("record, match, list, touch, forget and clear stay within one agent and folder", async () => {
  const path = fresh();
  const always = createAlways(path);
  assert.equal(await always.record("claude", "/p", "uname -r"), true);
  assert.equal(await always.record("claude", "/p", "uname -r"), false, "no duplicate");
  await always.record("claude", "/p", "date");
  await always.record("codex", "/p", "uname -r");
  await always.record("claude", "/q", "uname -r");
  assert.ok(await always.match("claude", "/p", "uname -r"));
  assert.ok(!await always.match("claude", "/p", "uname -a"), "one character different");
  assert.ok(!await always.match("opencode", "/p", "uname -r"), "another agent");
  assert.ok(!await always.match("claude", "/r", "uname -r"), "another folder");
  assert.deepEqual((await always.list("claude", "/p")).map((e) => [e.n, e.command]), [[1, "uname -r"], [2, "date"]]);
  assert.equal(await always.touch("claude", "/p", "date"), true);
  assert.equal(await always.forget("claude", "/p", 1), 1);
  assert.deepEqual((await always.list("claude", "/p")).map((e) => e.command), ["date"]);
  assert.equal(await always.forget("claude", "/p", 9), 0, "out of range removes nothing");
  assert.equal(await always.clear("claude", "/p"), 1);
  assert.deepEqual(await always.list("claude", "/p"), []);
  assert.ok(await always.match("codex", "/p", "uname -r"), "clear left other agents alone");
  assert.ok(await always.match("claude", "/q", "uname -r"), "clear left other folders alone");
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("an unreadable or foreign store is never overwritten", async () => {
  const path = fresh();
  const always = createAlways(path);
  await always.record("claude", "/p", "date");
  for (const bad of ["{not json", "[]", '{"version": 2, "entries": []}', '{"version": 1}']) {
    writeFileSync(path, bad);
    await assert.rejects(always.record("claude", "/p", "uname -r"));
    await assert.rejects(always.match("claude", "/p", "date"));
    assert.equal(readFileSync(path, "utf8"), bad, "left as it was");
  }
});

test("a held lock is waited for; a crashed writer's old lock is taken over", async () => {
  const path = fresh();
  const always = createAlways(path);
  await always.record("claude", "/p", "date");
  mkdirSync(`${path}.lock`);
  let done = false;
  const pending = always.record("claude", "/p", "id").then((r) => { done = true; return r; });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(done, false, "waits while another nixi holds the lock");
  rmdirSync(`${path}.lock`);
  assert.equal(await pending, true);
  mkdirSync(`${path}.lock`);
  utimesSync(`${path}.lock`, new Date(0), new Date(0));
  assert.equal(await always.record("claude", "/p", "uname -r"), true, "stale lock taken over");
  assert.equal(existsSync(`${path}.lock`), false);
});

test("a change that changes nothing writes nothing", async () => {
  const path = fresh();
  const always = createAlways(path);
  await always.record("claude", "/p", "date");
  const before = statSync(path).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(await always.touch("claude", "/p", "gone"), false);
  assert.equal(await always.forget("claude", "/p", 5), 0);
  assert.equal(statSync(path).mtimeMs, before);
});

test("concurrent writes keep every entry", async () => {
  const always = createAlways(fresh());
  await Promise.all(["a", "b", "c", "d"].map((c) => always.record("claude", "/p", c)));
  assert.equal((await always.list("claude", "/p")).length, 4);
});
