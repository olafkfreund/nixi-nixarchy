// #90 through the real bridge: the backup, the Hyprland check and /undo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBridge } from "./testing/run-bridge.js";

const bindings = ".config/hypr/bindings.lua";
const edit = (text) => ({ type: "prompt", text: `PLEASE_HYPR ${text}` });
const allow = (event) => ({ type: "permission", id: event.id, optionId: "allow" });
const setup = (extra = {}) => ({
  hyprctl: true, files: { [bindings]: "old\n" }, settings: { trust: "mechanic" }, onPermission: allow, ...extra,
});
const read = (home, path = bindings) => readFileSync(join(home, path), "utf8");
const notices = (events) => events.filter((e) => e.type === "notice").map((e) => e.text);
// What the machine looked like at that point in the message sequence.
const snap = (seen, state = ".local/state") => ({ home }) => {
  seen.file = read(home);
  const dir = join(home, state, "nixi", "changes");
  seen.turns = existsSync(dir) ? readdirSync(dir) : [];
  seen.backups = seen.turns.map((t) => readdirSync(join(dir, t)).filter((n) => n !== "manifest.json")
    .map((n) => readFileSync(join(dir, t, n), "utf8")));
};

test("Mechanic + allow from the card: backed up, then written (a)", async () => {
  const seen = {};
  await runBridge(setup({ messages: [edit("new"), snap(seen)] }));
  assert.equal(seen.file, "new\n");
  assert.deepEqual(seen.backups, [["old\n"]]);
});

test("YOLO: the same backup, with no card prompt (b), under XDG_STATE_HOME", async () => {
  const state = mkdtempSync(join(tmpdir(), "nixi-state-"));
  const seen = {};
  const run = await runBridge(setup({
    settings: { trust: "mechanic", permissionMode: "yolo" }, env: { XDG_STATE_HOME: state },
    messages: [edit("new"), ({ home }) => { seen.file = read(home); }],
  }));
  assert.equal(seen.file, "new\n");
  assert.ok(!run.events.some((e) => e.type === "permission"));
  const turns = readdirSync(join(state, "nixi", "changes"));
  assert.equal(turns.length, 1);
  assert.deepEqual(readdirSync(join(state, "nixi", "changes", turns[0])).sort().length, 2);
});

test("an edit is never offered allow_always; a command still is (c)", async () => {
  const offered = {};
  const decline = (event) => { offered[event.title] = event.options.map((o) => o.kind); return { type: "permission", id: event.id, optionId: "reject" }; };
  await runBridge(setup({ env: { FAKE_AGENT_OPTIONS: "always" }, onPermission: decline,
    messages: [edit("new"), { type: "prompt", text: "PLEASE_RUN it" }] }));
  assert.deepEqual(offered["Edit bindings.lua"], ["allow_once", "reject_once", "reject_always"]);
  assert.ok(offered["Run a long command"].includes("allow_always"));
});

test("a rejected edit is not backed up", async () => {
  const seen = {};
  await runBridge(setup({ onPermission: (e) => ({ type: "permission", id: e.id, optionId: "reject" }),
    messages: [edit("new"), snap(seen)] }));
  assert.deepEqual(seen.turns, []);
  assert.equal(seen.file, "old\n");
});

test("a Hyprland error the edit caused restores the file and says so (d)", async () => {
  const seen = {};
  const run = await runBridge(setup({ messages: [edit("BROKEN"), (c) => { seen.log = read(c.home, "hyprctl.log"); seen.file = read(c.home); }] }));
  assert.equal(seen.file, "old\n");
  assert.match(notices(run.events).join("\n"), /bindings\.lua.*bad bind/s);
  assert.match(seen.log, /^reload$/m);
});

test("an error that was already there is not blamed on the edit (e)", async () => {
  const seen = {};
  const run = await runBridge(setup({ files: { [bindings]: "old\n", "hypr-baseline-errors": "error: old problem\n" },
    messages: [edit("good"), snap(seen)] }));
  assert.equal(seen.file, "good\n");
  assert.deepEqual(notices(run.events), []);
});

test("/undo restores the file and never reaches the agent (f)", async () => {
  const seen = {};
  const run = await runBridge(setup({ messages: [edit("new"), { type: "undo" }, snap(seen)] }));
  assert.equal(seen.file, "old\n");
  assert.equal(run.agent.filter((e) => e.method === "prompt").length, 1);
  assert.match(notices(run.events).join("\n"), /Undone/);
});

test("/undo refuses after a hand edit, and touches nothing (g)", async () => {
  const seen = {};
  const run = await runBridge(setup({ messages: [edit("new"),
    ({ home }) => writeFileSync(join(home, bindings), "by hand\n"), { type: "undo" }, snap(seen)] }));
  assert.equal(seen.file, "by hand\n");
  assert.match(notices(run.events).join("\n"), /Not undone.*bindings\.lua/);
});

test("/undo at Guide is refused (h)", async () => {
  const run = await runBridge(setup({ settings: { trust: "guide" }, messages: [{ type: "undo" }] }));
  assert.match(notices(run.events).join("\n"), /type \/mechanic first/);
});

test("Guide cancels the edit: no backup, no change (i)", async () => {
  const seen = {};
  await runBridge(setup({ settings: { trust: "guide" }, messages: [edit("new"), snap(seen)] }));
  assert.equal(seen.file, "old\n");
  assert.deepEqual(seen.turns, []);
});

test("a turn that fails still closes its change set, and is checked (j)", async () => {
  const seen = {};
  const run = await runBridge(setup({ messages: [edit("BROKEN THEN_FAIL"), snap(seen)] }));
  assert.ok(run.events.some((e) => e.type === "error"), "the turn should have failed");
  assert.equal(seen.file, "old\n");
  assert.match(notices(run.events).join("\n"), /bindings\.lua/);
});
