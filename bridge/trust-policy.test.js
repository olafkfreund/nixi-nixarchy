import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTrust, trustPolicy, OPENCODE_PERMISSIONS, SECRET_PATHS, claudePermissions, opencodePermissions } from "./trust-policy.js";
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
    assert.deepEqual(trustPolicy(agent, trust, permissionMode), { modeId, permission },
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
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "reject" }),
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
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "allow" }),
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

const edit = { type: "prompt", text: "PLEASE_EDIT /tmp/probe" };
const run = { type: "prompt", text: "PLEASE_RUN a long command" };

test("Mechanic: the prompt carries what is being approved, whole", async () => {
  const { events } = await runBridge({
    settings: { trust: "mechanic" },
    messages: [edit, run],
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "reject" }),
  });
  const shown = events.filter((e) => e.type === "permission");
  assert.equal(shown.length, 2);
  const detail = shown.map((e) => e.detail).join("\n");
  for (const part of ["- a", "+ b", "TAIL"]) assert.ok(detail.includes(part), `missing ${part}`);
  assert.equal(shown[1].detail.length, 2048);
  assert.deepEqual(shown.map((e) => e.omitted), [0, 0]);
});

test("Guide: neither an edit nor a command reaches the card", async () => {
  const { agent, events } = await runBridge({ messages: [edit, run] });
  assert.ok(!events.some((e) => e.type === "permission"), "Guide showed a permission prompt");
  assert.deepEqual(agent.filter((e) => e.method === "permissionOutcome").map((e) => e.outcome.outcome),
    ["cancelled", "cancelled"]);
});

test("Claude may read, grep and glob without asking; nothing else, and never secrets (#27)", () => {
  const open = claudePermissions(false);
  const strict = claudePermissions(true);
  assert.deepEqual(open.allow, ["Read", "Grep", "Glob"]);
  assert.deepEqual(strict.allow, []);
  for (const rules of [open, strict]) {
    for (const secret of ["Read(~/.ssh/**)", "Read(~/.aws/**)", "Read(~/.config/gcloud/**)", "Read(~/.azure/**)",
                          "Read(/run/agenix/**)", "Read(**/.env)", "Read(**/*.age)"])
      assert.ok(rules.ask.includes(secret), secret);
  }
  assert.deepEqual(open.ask, strict.ask);
});

test("askBeforeReading makes OpenCode's reads ask too, and changes nothing else (#27)", () => {
  assert.equal(opencodePermissions(false), OPENCODE_PERMISSIONS);
  const strict = opencodePermissions(true).permission;
  for (const key of ["read", "grep", "glob", "list"]) assert.equal(strict[key], "ask", key);
  for (const [key, value] of Object.entries(OPENCODE_PERMISSIONS.permission))
    if (!["read", "grep", "glob", "list"].includes(key)) assert.deepEqual(strict[key], value, key);
  assert.equal(OPENCODE_PERMISSIONS.permission.grep, "allow", "the shared default was mutated");
});

const sentPermissions = (run) =>
  run.agent.find((e) => e.method === "newSession").meta?.claudeCode?.options?.settings?.permissions;

test("Claude's session starts with Nixi's read rules; askBeforeReading withdraws the allow (#27)", async () => {
  assert.deepEqual(sentPermissions(await runBridge()), claudePermissions(false));
  assert.deepEqual(sentPermissions(await runBridge({ settings: { askBeforeReading: true } })),
    claudePermissions(true));
  assert.deepEqual(sentPermissions(await runBridge({ settings: { askBeforeReading: "yes" } })),
    claudePermissions(false), "only true counts");
});

test("the read rules ride alongside a configured model (#27)", async () => {
  const run = await runBridge({ env: { NIXI_MODEL: "x" } });
  const options = run.agent.find((e) => e.method === "newSession").meta.claudeCode.options;
  assert.equal(options.model, "x");
  assert.equal(options.settings.model, "x");
  assert.deepEqual(options.settings.availableModels, ["x"]);
  assert.deepEqual(options.settings.permissions, claudePermissions(false));
});

test("askBeforeReading reaches OpenCode's rules; other agents get no Claude meta (#27)", async () => {
  const run = await runBridge({ env: opencode, settings: { askBeforeReading: true } });
  const newSession = run.agent.find((e) => e.method === "newSession");
  assert.deepEqual(JSON.parse(newSession.opencodeConfig), opencodePermissions(true));
  assert.equal(newSession.meta, null);
});

// #40 -- a hung setSessionMode used to leave the card's trustPending set for the
// life of the conversation, so /mechanic, /guide and the YOLO badge became
// silent no-ops. These two cover the bound and the ordering it depends on.

test("an agent that never answers setSessionMode is bounded, and trust is not moved (#40)", async () => {
  const run = await runBridge({
    env: { FAKE_AGENT_HANG: "mode", NIXI_MODE_TIMEOUT_MS: "300" },
    messages: [{ type: "trust", trust: "mechanic" }],
  });
  const error = run.events.find((e) => e.type === "trust_error");
  assert.ok(error, `expected trust_error, got ${JSON.stringify(run.events.map((e) => e.type))}`);
  assert.ok(!run.events.some((e) => e.type === "trust"),
    "reported success for a mode change the agent never acknowledged");
  // The level it reports must be the one still in force, never the one asked for.
  assert.equal(error.trust, "guide");
  // And nothing may be persisted: a restart must not come back in Mechanic
  // after a switch that did not take.
  assert.notEqual(run.settingsAfter?.trust, "mechanic");
});

test("a successful switch still persists and reports the new trust (#40)", async () => {
  const run = await runBridge({ messages: [{ type: "trust", trust: "mechanic" }] });
  const ack = run.events.find((e) => e.type === "trust");
  assert.equal(ack?.trust, "mechanic");
  assert.ok(!run.events.some((e) => e.type === "trust_error"));
  assert.equal(run.settingsAfter.trust, "mechanic");
  // Applying the mode before persisting must not skip the mode call itself.
  const modes = run.agent.filter((e) => e.method === "setSessionMode").map((e) => e.modeId);
  assert.deepEqual(modes, ["plan", "default"], "startup mode then the switch to Mechanic");
});

// #41 -- Claude matches permission rules per TOOL NAME. The secret list was
// Read(...) patterns only, so Grep and Glob, the other two tools the allow
// grants, reached every listed path with no prompt.

test("every secret path is guarded for all three allowed read tools (#41)", () => {
  const { allow, ask } = claudePermissions(false);
  assert.deepEqual(allow, ["Read", "Grep", "Glob"], "the allow this list has to cover");
  for (const tool of allow)
    for (const path of SECRET_PATHS)
      assert.ok(ask.includes(`${tool}(${path})`), `${tool} may reach ${path} unprompted`);
  assert.equal(ask.length, allow.length * SECRET_PATHS.length, "generated, not hand-listed");
});

test("the secret path list cannot silently shrink (#41)", () => {
  assert.ok(SECRET_PATHS.length >= 18, `only ${SECRET_PATHS.length} secret paths`);
  for (const path of ["~/.ssh/**", "~/.gnupg/**", "/run/agenix/**", "**/.env", "**/*.age"])
    assert.ok(SECRET_PATHS.includes(path), `${path} is no longer guarded`);
  // Paths, not rules: a "Read(...)" here would not generate Grep/Glob cover.
  for (const path of SECRET_PATHS) assert.ok(!path.includes("("), `${path} looks like a rule`);
});

test("Guide and Mechanic still grant the same reads; only askBeforeReading withdraws them (#41)", () => {
  // Guide reading without a prompt is deliberate and documented (#41), so this
  // asserts the behaviour the docs now describe rather than a trust gate.
  assert.deepEqual(claudePermissions(false).allow, ["Read", "Grep", "Glob"]);
  assert.deepEqual(claudePermissions(true).allow, []);
  assert.deepEqual(claudePermissions(true).ask, claudePermissions(false).ask,
    "secrets stay guarded whether or not reads are allowed");
});

// #53 -- the agent offers allow_always and both installed adapters send it
// (claude-agent-acp 21 references, codex-acp 25). The card used to answer with
// a boolean, which collapsed every choice to allow_once and discarded it.

const always = { FAKE_AGENT_OPTIONS: "always" };

test("the chosen option reaches the agent, not a derived one (#53)", async () => {
  for (const [optionId, expected] of [["allow-all", "allow-all"], ["reject-all", "reject-all"],
                                      ["allow", "allow"], ["reject", "reject"]]) {
    const run = await runBridge({
      env: always, settings: { trust: "mechanic" }, messages: [write],
      onPermission: (event) => ({ type: "permission", id: event.id, optionId }),
    });
    const outcome = run.agent.find((e) => e.method === "permissionOutcome").outcome;
    assert.deepEqual(outcome, { outcome: "selected", optionId: expected },
      `chose ${optionId}, agent got ${JSON.stringify(outcome)}`);
  }
});

test("the card is offered every option the agent sends, with its own labels (#53)", async () => {
  let seen = null;
  await runBridge({
    env: always, settings: { trust: "mechanic" }, messages: [write],
    onPermission: (event) => { seen = event.options; return { type: "permission", id: event.id, optionId: "reject" }; },
  });
  assert.equal(seen.length, 4, "the card did not receive every option");
  assert.deepEqual(seen.map((o) => o.kind),
    ["allow_once", "allow_always", "reject_once", "reject_always"]);
  // The label is the agent's own wording -- Nixi must not invent a scope it
  // was never told. And a kind we do not know must still be offered.
  assert.equal(seen.find((o) => o.kind === "allow_always").label, "Allow always");
  assert.ok(seen.every((o) => o.id && o.label), "an option arrived without id or label");
});

// NOT tested, because it is not reachable: ACP enumerates the four permission
// kinds and the SDK rejects anything else with "Invalid params" before the
// request leaves the agent. Measured -- a fifth option with an invented kind
// fails the whole turn, so the card can never be offered one.

test("an optionId the agent never offered cancels rather than guessing (#53)", async () => {
  const run = await runBridge({
    env: always, settings: { trust: "mechanic" }, messages: [write],
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "not-a-real-option" }),
  });
  assert.deepEqual(run.agent.find((e) => e.method === "permissionOutcome").outcome,
    { outcome: "cancelled" }, "a bogus optionId was resolved to something");
});

test("YOLO still auto-selects allow_once, never allow_always (#53)", async () => {
  const run = await runBridge({
    env: always, settings: { trust: "mechanic", permissionMode: "yolo" }, messages: [write],
  });
  assert.deepEqual(run.agent.find((e) => e.method === "permissionOutcome").outcome,
    { outcome: "selected", optionId: "allow" }, "YOLO reached for a persistent option");
  assert.ok(!run.events.some((e) => e.type === "permission"), "YOLO showed a prompt");
});

test("Guide still cancels, and is offered no option at all (#53)", async () => {
  const run = await runBridge({ env: always, messages: [write] });
  assert.deepEqual(run.agent.find((e) => e.method === "permissionOutcome").outcome,
    { outcome: "cancelled" });
  assert.ok(!run.events.some((e) => e.type === "permission"), "Guide showed a permission prompt");
});

// #63 -- the agent's cwd is ~/.config/nixi, so Claude Code would read
// .claude/settings.json and PreToolUse hooks from a directory the agent can
// write to. One approved write there could grant it standing permissions, or
// install a hook that runs a shell command with no prompt.

test("the agent cannot load settings from its own working directory (#63)", async () => {
  const run = await runBridge({});
  const options = run.agent.find((e) => e.method === "newSession").meta.claudeCode.options;
  // The adapter's default is ["user","project","local"]. project and local are
  // the two that live in the cwd; user is the person's own config and stays,
  // because Nixi constrains the agent, not its owner.
  assert.deepEqual(options.settingSources, ["user"],
    `settingSources is ${JSON.stringify(options.settingSources)} -- the agent can load its own settings`);
});

test("only Claude gets the settings restriction; the others get no meta at all (#63)", async () => {
  for (const env of [{ NIXI_AGENT: "codex" }, { NIXI_AGENT: "opencode" }]) {
    const run = await runBridge({ env });
    assert.equal(run.agent.find((e) => e.method === "newSession").meta, null,
      `${env.NIXI_AGENT} received Claude meta`);
  }
});

// #63 -- #66 stopped Claude loading settings from its own cwd. OpenCode was
// reading a whole second config layer from the same directory, and Nixi's rules
// do not beat it: a cwd opencode.json supplies `bash`/`edit`/`write`, which the
// "*": "ask" wildcard never names, and a cwd .opencode/agent/*.md permission
// block is appended after Nixi's rules, where the last match wins. Either way a
// write stops producing a permission request -- so Guide has nothing to cancel.
//
// Asserted from the CHILD's environment as recorded at newSession, not from
// what the bridge constructed: this is upstream's flag name, so a rename there
// has to surface as a failure rather than as a silently ineffective env var.

test("OpenCode cannot be handed a second config layer by its own cwd (#63)", async () => {
  const newSession = (run) => run.agent.find((e) => e.method === "newSession");
  const opencodeRun = newSession(await runBridge({ env: opencode }));
  assert.equal(opencodeRun.disableProjectConfig, "1",
    `OPENCODE_DISABLE_PROJECT_CONFIG reached the adapter as ${JSON.stringify(opencodeRun.disableProjectConfig)}` +
    " -- the cwd's opencode.json and .opencode/agent/*.md still apply");
  // It rides with the rules, not instead of them, under both read settings.
  assert.deepEqual(JSON.parse(opencodeRun.opencodeConfig), opencodePermissions(false));
  const strict = newSession(await runBridge({ env: opencode, settings: { askBeforeReading: true } }));
  assert.equal(strict.disableProjectConfig, "1");
  assert.deepEqual(JSON.parse(strict.opencodeConfig), opencodePermissions(true));
  // And no other adapter is handed an OpenCode knob: Claude's cwd is closed by
  // settingSources, and setting a stray env var for Codex would be cargo cult.
  for (const env of [{}, { NIXI_AGENT: "codex" }])
    assert.equal(newSession(await runBridge({ env })).disableProjectConfig, null,
      `${env.NIXI_AGENT || "claude"} was given OpenCode's flag`);
});

// Codex is deliberately NOT covered by a test here, and that is the finding,
// not an omission. codex-acp reads <cwd>/.codex/config.toml and grants itself
// the trust that gates it -- createSessionConfig() sets
// projects.<sessionRoot>.trust_level = "trusted" on every session, where
// sessionRoot is the ACP cwd. There is no settingSources equivalent and no env
// var that withholds that trust, so there is nothing for Nixi to assert from
// outside. A test here could only restate a constant. See
// spec/2026-09-24-63-adapter-project-config.md, Finding 2, and the follow-up
// issue; asserting something vacuous would make this look covered when it is
// not, which is the failure mode the whole issue is about.
