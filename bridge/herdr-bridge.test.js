import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runBridge } from "./testing/run-bridge.js";

const send = { type: "prompt", text: "PLEASE_HERDR now" };
const env = { FAKE_AGENT_OPTIONS: "always" };

test("Guide cancels a herdr write without a card (#95)", async () => {
  const { agent, events } = await runBridge({ env, messages: [send] });
  assert.equal(agent.find((e) => e.method === "permissionOutcome").outcome.outcome, "cancelled");
  assert.ok(!events.some((e) => e.type === "permission"));
});

test("Mechanic: a herdr write gets a click-only card without allow_always (#95)", async () => {
  const { events } = await runBridge({
    env, settings: { trust: "mechanic" }, messages: [send],
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "reject" }),
  });
  const card = events.find((e) => e.type === "permission");
  assert.equal(card.confirm, "click");
  assert.ok(!card.options.some((o) => o.kind === "allow_always"));
  assert.ok(card.options.some((o) => o.kind === "allow_once"));
});

test("YOLO still shows the card (#95)", async () => {
  const { events } = await runBridge({
    env, settings: { trust: "mechanic", permissionMode: "yolo" }, messages: [send],
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "reject" }),
  });
  assert.equal(events.filter((e) => e.type === "permission").length, 1);
});

test("a yes appends one 0600 audit line (#95)", async () => {
  let line, mode;
  await runBridge({
    env, settings: { trust: "mechanic" },
    messages: [send, ({ home }) => {
      const path = join(home, ".local", "share", "nixi", "sends.log");
      line = readFileSync(path, "utf8").trim().split("\n");
      mode = statSync(path).mode & 0o777;
    }],
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "allow" }),
  });
  assert.equal(line.length, 1);
  const entry = JSON.parse(line[0]);
  assert.equal(entry.pane, "1-2");
  assert.equal(entry.text, '"run the tests"');
  assert.equal(entry.decision, "allow");
  assert.equal(mode, 0o600);
});
