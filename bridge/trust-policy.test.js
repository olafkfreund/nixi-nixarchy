import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTrust, trustPolicy, OPENCODE_PERMISSIONS } from "./trust-policy.js";
import { runBridge } from "./testing/run-bridge.js";

test("every row of the trust table", () => {
  const rows = [
    // agent,    trust,      permissionMode -> modeId,     permission
    ["claude", "guide",    "permission", "plan",      "cancel"],
    ["claude", "guide",    "yolo",       "plan",      "cancel"],  // YOLO is unreachable from Guide
    ["claude", "mechanic", "permission", "default",   "ask"],
    ["claude", "mechanic", "yolo",       "default",   "yolo"],
    ["codex",  "guide",    "permission", "read-only", "cancel"],
    ["codex",  "guide",    "yolo",       "read-only", "cancel"],
    ["codex",  "mechanic", "permission", "read-only", "ask"],
    ["codex",  "mechanic", "yolo",       "read-only", "yolo"],
    ["opencode", "guide",    "permission", "plan",    "cancel"],
    ["opencode", "guide",    "yolo",       "plan",    "cancel"],
    ["opencode", "mechanic", "permission", "build",   "ask"],
    ["opencode", "mechanic", "yolo",       "build",   "yolo"],
  ];
  for (const [agent, trust, permissionMode, modeId, permission] of rows)
    assert.deepEqual(trustPolicy(agent, trust, permissionMode), { trust, modeId, permission },
      `${agent} / ${trust} / ${permissionMode}`);
});

test("anything that is not a known trust level is Guide", () => {
  for (const value of [undefined, null, "", "GUIDE", "yolo", "admin", 1, {}])
    assert.equal(resolveTrust(value), "guide", String(value));
  assert.equal(trustPolicy("claude", "root", "yolo").permission, "cancel");
});

const write = { type: "prompt", text: "PLEASE_WRITE a file" };

test("Guide: plan mode, and a permission request is cancelled without reaching the card", async () => {
  const { agent, events } = await runBridge({ messages: [write] });
  assert.equal(agent.find((e) => e.method === "setSessionMode")?.modeId, "plan");
  assert.equal(agent.find((e) => e.method === "permissionOutcome")?.outcome.outcome, "cancelled");
  assert.ok(!events.some((e) => e.type === "permission"), "Guide showed a permission prompt");
  assert.equal(events.find((e) => e.type === "ready").trust, "guide");
});

test("Guide ignores a saved YOLO", async () => {
  const { agent, events } = await runBridge({
    settings: { trust: "guide", permissionMode: "yolo" }, messages: [write],
  });
  assert.equal(agent.find((e) => e.method === "permissionOutcome")?.outcome.outcome, "cancelled");
  assert.ok(!events.some((e) => e.type === "permission"));
});

test("Mechanic: default mode, the request is shown, and a no is a no", async () => {
  const { agent, events } = await runBridge({
    settings: { trust: "mechanic" },
    messages: [write],
    onPermission: (event) => ({ type: "permission", id: event.id, allow: false }),
  });
  assert.equal(agent.find((e) => e.method === "setSessionMode")?.modeId, "default");
  assert.ok(events.some((e) => e.type === "permission"), "Mechanic did not ask");
  const outcome = agent.find((e) => e.method === "permissionOutcome").outcome;
  assert.deepEqual(outcome, { outcome: "selected", optionId: "reject" });
});

test("Mechanic: a yes is a yes", async () => {
  const { agent } = await runBridge({
    settings: { trust: "mechanic" },
    messages: [write],
    onPermission: (event) => ({ type: "permission", id: event.id, allow: true }),
  });
  assert.deepEqual(agent.find((e) => e.method === "permissionOutcome").outcome,
    { outcome: "selected", optionId: "allow" });
});

test("switching to Guide mid-session re-modes the session and cancels from then on", async () => {
  const { agent, home, settingsAfter } = await runBridge({
    settings: { trust: "mechanic", fontScale: 1.2 },
    messages: [{ type: "trust", trust: "guide" }, write],
    onPermission: () => { throw new Error("Guide must not show a prompt"); },
  });
  const modes = agent.filter((e) => e.method === "setSessionMode").map((e) => e.modeId);
  assert.deepEqual(modes, ["default", "plan"]);
  assert.equal(agent.find((e) => e.method === "permissionOutcome").outcome.outcome, "cancelled");
  assert.equal(settingsAfter.trust, "guide");
  assert.equal(settingsAfter.fontScale, 1.2, "switching trust dropped another setting");
  assert.ok(home);
});

test("YOLO cannot be switched on from Guide", async () => {
  const { events, settingsAfter } = await runBridge({
    messages: [{ type: "permission_mode", mode: "yolo" }],
  });
  assert.ok(events.some((e) => e.type === "permission_mode_error"), "YOLO was accepted in Guide");
  assert.notEqual(settingsAfter?.permissionMode, "yolo");
});

test("Codex maps both levels to read-only", async () => {
  const guide = await runBridge({ env: { NIXI_AGENT: "codex" } });
  const mechanic = await runBridge({ env: { NIXI_AGENT: "codex" }, settings: { trust: "mechanic" } });
  assert.equal(guide.agent.find((e) => e.method === "setSessionMode")?.modeId, "read-only");
  assert.equal(mechanic.agent.find((e) => e.method === "setSessionMode")?.modeId, "read-only");
});

const opencode = { NIXI_AGENT: "opencode", FAKE_AGENT_MODES: "config" };

test("OpenCode: the mode is set through its mode config option", async () => {
  const guide = await runBridge({ env: opencode, messages: [write] });
  const mechanic = await runBridge({ env: opencode, settings: { trust: "mechanic" } });
  const set = (run) => run.agent.find((e) => e.method === "setSessionConfigOption");
  assert.deepEqual(set(guide), { method: "setSessionConfigOption", configId: "mode", value: "plan" });
  assert.deepEqual(set(mechanic), { method: "setSessionConfigOption", configId: "mode", value: "build" });
  assert.ok(!guide.agent.some((e) => e.method === "setSessionMode"), "used ACP session modes OpenCode does not offer");
  assert.equal(guide.agent.find((e) => e.method === "permissionOutcome")?.outcome.outcome, "cancelled");
});

test("OpenCode always starts with Nixi's permission rules, whatever the environment says", async () => {
  const weak = JSON.stringify({ permission: { "*": "allow" } });
  const run = await runBridge({ env: { ...opencode, OPENCODE_CONFIG_CONTENT: weak } });
  const sent = JSON.parse(run.agent.find((e) => e.method === "newSession").opencodeConfig);
  assert.deepEqual(sent, OPENCODE_PERMISSIONS);
  assert.equal(sent.permission["*"], "ask", "anything not listed must ask");
  assert.equal(sent.permission.plan_exit, "deny");
  for (const tool of ["edit", "bash", "webfetch", "task", "write", "patch"])
    assert.equal(sent.permission[tool], undefined, `${tool} must fall through to ask`);
});

test("other agents never receive OpenCode's config", async () => {
  const run = await runBridge({ env: { OPENCODE_CONFIG_CONTENT: "" } });
  assert.equal(run.agent.find((e) => e.method === "newSession").opencodeConfig, "");
});
