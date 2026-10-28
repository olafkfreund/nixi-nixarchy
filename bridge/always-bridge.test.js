// #114 through the real bridge: a remembered "always" is answered allow_once by the
// bridge, and never at Guide, in YOLO, for another agent or folder, or for a chained command.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBridge } from "./testing/run-bridge.js";

const cwd = tmpdir();
const store = (home) => join(home, ".local", "state", "nixi", "always.json");
const plain = { type: "prompt", text: "PLEASE_PLAIN it" };
const chained = { type: "prompt", text: "PLEASE_RUN it" };
const seed = (entries) => ({ home }) => {
  mkdirSync(join(home, ".local", "state", "nixi"), { recursive: true });
  writeFileSync(store(home), JSON.stringify({ version: 1, entries }));
};
const entry = (command, extra = {}) => ({ agent: "claude", cwd, command, added: "t", lastUsed: "t", ...extra });
const longCommand = "echo " + "x".repeat(2048 - "echo  && echo TAIL".length) + " && echo TAIL";
const outcomes = (run) => run.agent.filter((e) => e.method === "permissionOutcome").map((e) => e.outcome);
const cards = (run) => run.events.filter((e) => e.type === "permission").length;
const base = (extra) => ({ env: { FAKE_AGENT_OPTIONS: "always", NIXI_CWD: cwd }, settings: { trust: "mechanic" }, ...extra });

test("\"always\" is kept by the bridge; the agent hears allow_once, then is answered without a card", async () => {
  const seen = {};
  const run = await runBridge(base({
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "allow-all" }),
    messages: [plain, plain, ({ home }) => {
      seen.store = JSON.parse(readFileSync(store(home), "utf8"));
      seen.mode = statSync(store(home)).mode & 0o777;
    }],
  }));
  assert.deepEqual(outcomes(run), [{ outcome: "selected", optionId: "allow" }, { outcome: "selected", optionId: "allow" }]);
  assert.equal(cards(run), 1, "the second time was answered from the store");
  assert.deepEqual(seen.store.entries.map((e) => [e.agent, e.cwd, e.command]), [["claude", cwd, "uname -r"]]);
  assert.equal(seen.mode, 0o600);
  assert.ok(run.events.some((e) => e.type === "status" && /^Remembered · /.test(e.text)));
});

test("Guide cancels a remembered command like any other", async () => {
  const run = await runBridge(base({ settings: { trust: "guide" }, messages: [seed([entry("uname -r")]), plain] }));
  assert.deepEqual(outcomes(run), [{ outcome: "cancelled" }]);
  assert.equal(cards(run), 0);
});

test("YOLO stays allow_once and records nothing", async () => {
  const seen = {};
  const run = await runBridge(base({ settings: { trust: "mechanic", permissionMode: "yolo" },
    messages: [plain, ({ home }) => { seen.exists = existsSync(store(home)); }] }));
  assert.deepEqual(outcomes(run), [{ outcome: "selected", optionId: "allow" }]);
  assert.equal(seen.exists, false);
});

for (const [label, seeded, message] of [
  ["another agent", entry("uname -r", { agent: "codex" }), plain],
  ["another folder", entry("uname -r", { cwd: "/elsewhere" }), plain],
  ["a one-character-different command", entry("uname -a"), plain],
  ["a chained command, even if stored", entry(longCommand), chained],
]) {
  test(`${label} still gets a card`, async () => {
    const run = await runBridge(base({
      onPermission: (event) => ({ type: "permission", id: event.id, optionId: "reject" }),
      messages: [seed([seeded]), message],
    }));
    assert.equal(cards(run), 1);
    assert.deepEqual(outcomes(run), [{ outcome: "selected", optionId: "reject" }]);
  });
}

test("\"always\" on a chained command is never offered, so never stored", async () => {
  const seen = {};
  const run = await runBridge(base({
    onPermission: (event) => { seen.kinds = event.options.map((o) => o.kind); return { type: "permission", id: event.id, optionId: "allow" }; },
    messages: [chained, ({ home }) => { seen.exists = existsSync(store(home)); }],
  }));
  assert.ok(!seen.kinds.includes("allow_always"));
  assert.equal(seen.exists, false);
  assert.equal(cards(run), 1);
});

test("an unreadable store is left alone and the card still asks", async () => {
  const seen = {};
  const run = await runBridge(base({
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "reject" }),
    messages: [({ home }) => { mkdirSync(join(home, ".local", "state", "nixi"), { recursive: true }); writeFileSync(store(home), "{broken"); },
      plain, ({ home }) => { seen.text = readFileSync(store(home), "utf8"); }],
  }));
  assert.equal(cards(run), 1);
  assert.equal(seen.text, "{broken");
  assert.ok(run.events.some((e) => e.type === "diagnostic" && /Remembered approvals/.test(e.text)));
});

test("/always lists, forgets and clears only this agent's entries here", async () => {
  const lists = [];
  const run = await runBridge(base({
    messages: [seed([entry("uname -r"), entry("date"), entry("id", { agent: "codex" })]),
      async ({ send, until, events }) => {
        for (const m of [{ action: "list" }, { action: "forget", n: 1 }, { action: "clear" }]) {
          const before = events.filter((e) => e.type === "always_list").length;
          send({ type: "always", ...m });
          await until(() => events.filter((e) => e.type === "always_list").length > before, "always_list");
          lists.push(events.filter((e) => e.type === "always_list").at(-1).entries.map((e) => e.command));
        }
      }],
  }));
  assert.deepEqual(lists, [["uname -r", "date"], ["date"], []]);
  assert.ok(run.events.some((e) => e.type === "notice" && /Nothing remembered for claude here/.test(e.text)));
});
