// #146: every bridge follows nixi.json while it runs, so a switch made in one client (the card) reaches
// another (the companion) without a restart. The file is written mid-run, as another client would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runBridge } from "./testing/run-bridge.js";

const file = (home) => join(home, ".config", "omarchy", "nixi.json");
const put = (settings) => async ({ home }) => {
  mkdirSync(join(home, ".config", "omarchy"), { recursive: true });
  writeFileSync(file(home), typeof settings === "string" ? settings : JSON.stringify(settings));
  await new Promise((r) => setTimeout(r, 600));            // the 150 ms debounce, with room
};
const write = { type: "prompt", text: "PLEASE_WRITE it" };
const reject = (event) => ({ type: "permission", id: event.id, optionId: "reject" });
const outcomes = (run) => run.agent.filter((e) => e.method === "permissionOutcome").map((e) => e.outcome);
const cards = (run) => run.events.filter((e) => e.type === "permission").length;
const settingsEvents = (run) => run.events.filter((e) => e.type === "settings");

test("switching out of YOLO in the file makes the next request ask", async () => {
  const run = await runBridge({ settings: { trust: "mechanic", permissionMode: "yolo" },
    messages: [put({ trust: "mechanic", permissionMode: "permission" }), write], onPermission: reject });
  assert.equal(cards(run), 1);
  assert.deepEqual(outcomes(run), [{ outcome: "selected", optionId: "reject" }]);
  assert.deepEqual(settingsEvents(run).map((e) => [e.trust, e.permissionMode, e.source]), [["mechanic", "permission", "file"]]);
});

test("Guide in the file: the next request is cancelled with no card", async () => {
  const run = await runBridge({ settings: { trust: "mechanic" },
    messages: [put({ trust: "guide" }), write], onPermission: reject });
  assert.equal(cards(run), 0);
  assert.deepEqual(outcomes(run), [{ outcome: "cancelled" }]);
});

test("Guide in the file cancels a request already waiting for an answer", async () => {
  const run = await runBridge({ settings: { trust: "mechanic" }, messages: [async (ctx) => {
    ctx.send(write);
    const card = await ctx.until((e) => e.type === "permission", "card");
    await put({ trust: "guide" })(ctx);
    ctx.send({ type: "permission", id: card.id, optionId: "allow" });   // too late: Guide already cancelled it
    await ctx.until((e) => e.type === "done" || e.type === "error", "turn end");
  }] });
  assert.deepEqual(outcomes(run), [{ outcome: "cancelled" }]);
});

test("Mechanic in the file: the next request shows a card", async () => {
  const run = await runBridge({ settings: { trust: "guide" },
    messages: [put({ trust: "mechanic" }), write], onPermission: reject });
  assert.equal(cards(run), 1);
});

test("YOLO in the file is ignored at Guide", async () => {
  const run = await runBridge({ settings: { trust: "guide" },
    messages: [put({ trust: "guide", permissionMode: "yolo" }), write], onPermission: reject });
  assert.deepEqual(outcomes(run), [{ outcome: "cancelled" }]);
  assert.equal(settingsEvents(run).length, 0);
});

test("an unreadable file changes nothing and says so once", async () => {
  const run = await runBridge({ settings: { trust: "mechanic", permissionMode: "yolo" },
    messages: [put("{not json"), put("{still not"), write,
      put({ trust: "mechanic", permissionMode: "yolo" })],     // valid again, so the harness can read it back
    onPermission: reject });
  assert.deepEqual(outcomes(run), [{ outcome: "selected", optionId: "allow" }]);
  assert.equal(run.events.filter((e) => e.type === "diagnostic" && /unreadable/.test(e.text)).length, 1);
});

test("a deleted file means the strictest level", async () => {
  const run = await runBridge({ settings: { trust: "mechanic", permissionMode: "yolo" },
    messages: [async (ctx) => { rmSync(file(ctx.home)); await new Promise((r) => setTimeout(r, 600)); }, write],
    onPermission: reject });
  assert.deepEqual(outcomes(run), [{ outcome: "cancelled" }]);
});

test("a switch sent on stdin acks as before and is not applied twice", async () => {
  const run = await runBridge({ settings: { trust: "mechanic", permissionMode: "yolo" },
    messages: [{ type: "permission_mode", mode: "permission" }, async () => new Promise((r) => setTimeout(r, 600)), write],
    onPermission: reject });
  assert.ok(run.events.some((e) => e.type === "ack" && e.of === "permission_mode" && e.ok && e.mode === "permission"));
  assert.equal(settingsEvents(run).length, 0);
  assert.equal(cards(run), 1);
});

test("Codex: a trust change in the file ends the session", async () => {
  const run = await runBridge({ settings: { trust: "guide" }, env: { NIXI_AGENT: "codex" },
    messages: [async (ctx) => {
      await put({ trust: "mechanic" })(ctx);
      await ctx.until((e) => e.type === "fatal", "fatal");
    }] });
  assert.ok(run.events.some((e) => e.type === "fatal" && /start a new conversation/.test(e.message)));
});

// Review (#146): the races that could loosen a bridge. A slow agent keeps a follow waiting on its mode call.
const putNow = (settings) => ({ home }) => {
  mkdirSync(join(home, ".config", "omarchy"), { recursive: true });
  writeFileSync(file(home), JSON.stringify(settings));
};
const wait = (ms) => async () => new Promise((r) => setTimeout(r, ms));

test("a slow follow to Mechanic+YOLO never overrides a newer Guide", async () => {
  const run = await runBridge({ settings: { trust: "guide" }, env: { FAKE_AGENT_SLOW_MODE: "1200" },
    messages: [putNow({ trust: "mechanic", permissionMode: "yolo" }), wait(400),
      putNow({ trust: "guide", permissionMode: "yolo" }), wait(2600), write], onPermission: reject });
  assert.deepEqual(outcomes(run), [{ outcome: "cancelled" }]);
  assert.ok(!settingsEvents(run).some((e) => e.trust === "mechanic"));
});

test("a mode change that fails while following Guide still leaves the bridge at Guide", async () => {
  const run = await runBridge({ settings: { trust: "mechanic", permissionMode: "yolo" },
    env: { FAKE_AGENT_HANG: "mode", NIXI_MODE_TIMEOUT_MS: "400" },
    messages: [put({ trust: "guide" }), wait(900), write], onPermission: reject });
  assert.deepEqual(outcomes(run), [{ outcome: "cancelled" }]);
});

test("a file change during a stdin switch is read after the switch, and cannot loosen it", async () => {
  const run = await runBridge({ settings: { trust: "mechanic" }, env: { FAKE_AGENT_SLOW_MODE: "1000" },
    messages: [async (ctx) => {
      ctx.send({ type: "trust", trust: "guide" });
      await new Promise((r) => setTimeout(r, 200));
      putNow({ trust: "mechanic", permissionMode: "yolo" })(ctx);       // lands while the switch is applying
      await ctx.until((e) => e.type === "ack" && e.of === "trust", "trust ack");
      await new Promise((r) => setTimeout(r, 800));
    }, write], onPermission: reject });
  assert.deepEqual(outcomes(run), [{ outcome: "cancelled" }]);
});
