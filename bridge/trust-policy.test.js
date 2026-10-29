import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTrust, trustPolicy, OPENCODE_PERMISSIONS, SECRET_PATHS, EXEC_WRITE_PATHS, claudePermissions, opencodePermissions, opencodePathDenies, opencodeSecretDenies, secretBashRules } from "./trust-policy.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    assert.deepEqual(trustPolicy(agent, trust, permissionMode), { modeId, permission, mcpServers: [] },
      `${agent} / ${trust} / ${permissionMode}`);
});

test("ai-mirror is attached only at Mechanic, and only where the path is proved", () => {
  const command = ["/nix/store/x/bin/ai-mirror", "mcp"];
  const servers = (agent, trust, mode = "permission") =>
    trustPolicy(agent, trust, mode, command).mcpServers;

  // Guide's promise is that the agent cannot act on the machine. A desktop it
  // can drive after ai-mirror's own dialog is still a desktop it can drive.
  for (const agent of ["claude", "codex", "opencode"])
    assert.deepEqual(servers(agent, "guide"), [], `${agent} at Guide`);
  assert.deepEqual(servers("claude", "root"), [], "an unknown level is Guide");

  // Only Claude: #74 showed MCP servers can sit outside the permission layer,
  // and the attached-server path is read and proved for Claude alone.
  assert.deepEqual(servers("claude", "mechanic"), [{
    name: "ai-mirror", command: command[0], args: ["mcp"], env: [],
  }]);
  for (const agent of ["codex", "opencode"])
    assert.deepEqual(servers(agent, "mechanic"), [], `${agent} is not proved`);

  // No package pinned means no desktop control at all, at any level.
  assert.deepEqual(trustPolicy("claude", "mechanic", "permission", null).mcpServers, []);
  assert.deepEqual(trustPolicy("claude", "mechanic", "yolo", command).mcpServers.length, 1);
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
  assert.ok(events.some((e) => e.type === "ack" && e.of === "permission_mode" && !e.ok),
    "YOLO was accepted in Guide");
  assert.notEqual(settingsAfter?.permissionMode, "yolo");
});

test("Codex starts at Mechanic in read-only", async () => {
  const mechanic = await runBridge({ env: { NIXI_AGENT: "codex" }, settings: { trust: "mechanic" } });
  assert.equal(mechanic.agent.find((e) => e.method === "setSessionMode")?.modeId, "read-only");
});

// #97: Codex's sandbox reads secrets at any level, so Guide refuses it, but the
// bridge stays up so the switch to Mechanic can reach it.
const reason = /Guide can't keep secrets from Codex/;
const until = async (ok) => { for (let i = 0; i < 250 && !ok(); i++) await new Promise((r) => setTimeout(r, 20)); };

test("Codex at Guide: reason shown, no session, child reaped, commands answered, switch restarts at Mechanic", async () => {
  // A stand-in adapter that ignores SIGTERM and records its pid, to prove the child is reaped.
  const pidFile = join(mkdtempSync(join(tmpdir(), "nixi-codex-")), "pid");
  const stub = `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);`;
  let alive = true;
  const run = await runBridge({
    env: { NIXI_AGENT: "codex", NIXI_ACP_COMMAND: JSON.stringify([process.execPath, "-e", stub]) },
    messages: [
      async () => { try { process.kill(Number(readFileSync(pidFile, "utf8")), 0); } catch { alive = false; } },
      { type: "prompt", text: "hi" },
      { type: "steer", text: "x" }, { type: "permission_mode", mode: "yolo" },
      { type: "undo" }, { type: "trust", trust: "guide" }, { type: "trust", trust: "mechanic" },
      async ({ events }) => until(() => events.some((e) => e.type === "fatal")),
    ],
  });
  assert.equal(alive, false, "the codex-acp child outlived the refusal");
  assert.match(run.events.find((e) => e.type === "notice")?.text, reason);
  assert.match(run.events.find((e) => e.type === "error")?.message, reason);
  const ack = (of, ok) => run.events.find((e) => e.type === "ack" && e.of === of && e.ok === ok);
  assert.match(ack("steer", false)?.message, reason);
  assert.match(ack("permission_mode", false)?.message, reason);
  assert.ok(ack("trust", true), "trust acks");
  assert.ok(run.events.some((e) => e.type === "notice" && /Nothing to undo/.test(e.text)));
  assert.equal(run.settingsAfter.trust, "mechanic");
  assert.match(run.events.find((e) => e.type === "fatal")?.message, /Trust set to Mechanic/);
  assert.ok(!run.agent.some((e) => e.method === "newSession"), "a Codex session started at Guide");
});

test("Codex: an unknown trust setting is Guide, so refused", async () => {
  for (const options of [
    { settings: { trust: "MECHANIC" } },
    { settings: { trust: 123 } }, // runBridge reads nixi.json back, so it cannot be made invalid JSON
  ]) {
    const run = await runBridge({ env: { NIXI_AGENT: "codex" }, ...options });
    assert.match(run.events.find((e) => e.type === "notice")?.text, reason);
    assert.ok(!run.agent.some((e) => e.method === "newSession"));
  }
});

test("Codex refused: close ends the bridge", async () => {
  let ended = false;
  await runBridge({
    env: { NIXI_AGENT: "codex" },
    messages: [{ type: "close" }, async ({ exited }) => { await until(exited); ended = exited(); }],
  });
  assert.ok(ended, "the bridge kept running after close");
});

test("Codex: Mechanic to Guide is refused and trust stays mechanic", async () => {
  const run = await runBridge({
    env: { NIXI_AGENT: "codex" }, settings: { trust: "mechanic" },
    messages: [{ type: "trust", trust: "guide" }],
  });
  const ack = run.events.find((e) => e.type === "ack" && e.of === "trust");
  assert.equal(ack.ok, false);
  assert.match(ack.message, /Guide can't keep secrets from Codex/);
  assert.equal(ack.trust, "mechanic");
  assert.equal(run.settingsAfter.trust, "mechanic");
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
  assert.deepEqual(sent, opencodePermissions(false));
  assert.equal(sent.permission["*"], "ask", "anything not listed must ask");
  assert.equal(sent.permission.plan_exit, "deny");
  for (const tool of ["bash", "webfetch", "task", "write", "patch"])
    assert.equal(sent.permission[tool], undefined, `${tool} must fall through to ask`);
  assert.deepEqual(sent.permission.edit, {
    "*": "ask",
    ...Object.fromEntries(opencodePathDenies(EXEC_WRITE_PATHS).map((path) => [path, "deny"])),
    "*nixi/always.json": "deny", "*nixi/always.json.*": "deny",
  });
});

test("OpenCode denies every unattended-write path in edit (#116)", () => {
  const edit = opencodePermissions(false).permission.edit;
  for (const path of EXEC_WRITE_PATHS) {
    if (path.startsWith("//")) continue;
    for (const pattern of opencodePathDenies([path]))
      assert.equal(edit[pattern], "deny", `${path} -> ${pattern}`);
  }
});

test("other agents never receive OpenCode's config", async () => {
  const run = await runBridge({ env: { OPENCODE_CONFIG_CONTENT: "" } });
  assert.equal(run.agent.find((e) => e.method === "newSession").opencodeConfig, "");
});

test("the session is created with ai-mirror only at Mechanic", async () => {
  // Asserts on what the bridge actually SENT over ACP, not on the policy object.
  const command = JSON.stringify(["/nix/store/x/bin/ai-mirror", "mcp"]);
  const attached = async (trust) => {
    const run = await runBridge({
      settings: { trust },
      env: { NIXI_AI_MIRROR_COMMAND: command },
    });
    return run.agent.find((entry) => entry.method === "newSession").mcpServers;
  };

  assert.deepEqual(await attached("guide"), [], "Guide attaches nothing");
  assert.deepEqual(await attached("mechanic"), [{
    name: "ai-mirror", command: "/nix/store/x/bin/ai-mirror", args: ["mcp"], env: [],
  }], "Mechanic attaches ai-mirror");

  // No pinned package: no desktop control even at Mechanic.
  const none = await runBridge({ settings: { trust: "mechanic" } });
  assert.deepEqual(none.agent.find((e) => e.method === "newSession").mcpServers, []);
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

test("no agent may write the remembered-approvals store, at any trust level (#114)", () => {
  for (const trust of ["guide", "mechanic"])
    for (const ask of [false, true])
      for (const tool of ["Write", "Edit", "MultiEdit", "NotebookEdit"])
        for (const path of ["~/.local/state/nixi/always.json", "//**/nixi/always.json",  // anchored, #95
                            "~/.local/state/nixi/always.json.*", "//**/nixi/always.json.*"])  // lock, temp
          assert.ok(claudePermissions(ask, trust).deny.includes(`${tool}(${path})`), `${tool} ${path} ${trust}`);
  for (const ask of [false, true])
    assert.equal(opencodePermissions(ask).permission.edit["*nixi/always.json"], "deny");
  assert.equal(opencodePermissions(false).permission.edit["*"], "ask", "every other edit still asks");
});

test("askBeforeReading makes OpenCode's reads ask too, and changes nothing else (#27)", () => {
  assert.deepEqual(opencodePermissions(false), OPENCODE_PERMISSIONS);
  const strict = opencodePermissions(true).permission;
  assert.equal(strict.read["*"], "ask");
  assert.deepEqual({ ...strict.read, "*": "allow" }, OPENCODE_PERMISSIONS.permission.read, "secret denies must stay");
  for (const [key, value] of Object.entries(OPENCODE_PERMISSIONS.permission))
    if (key !== "read") assert.deepEqual(strict[key], value, key);
});

test("OpenCode: external reads allowed, secrets denied by config, search tools ask (#102)", () => {
  const { permission } = opencodePermissions(false);
  assert.equal(permission.external_directory, "allow");
  assert.equal(permission["*"], "ask");
  assert.equal(permission.plan_exit, "deny");
  for (const tool of ["grep", "glob", "list"]) assert.equal(permission[tool], "ask", tool);
  const { "*": base, ...denies } = permission.read;
  assert.equal(base, "allow");
  assert.ok(Object.values(denies).every((v) => v === "deny"));
  assert.deepEqual(opencodeSecretDenies(), [
    "*.ssh/*", "*.ssh", "*.gnupg/*", "*.gnupg", "*.aws/*", "*.aws", "*.kube/*", "*.kube",
    "*.config/gcloud/*", "*.config/gcloud", "*.azure/*", "*.azure", "*.docker/config.json",
    "*.config/gh/*", "*.config/gh", "*.config/op/*", "*.config/op", "*.config/sops/*", "*.config/sops",
    "*.local/share/keyrings/*", "*.local/share/keyrings", "*.claude/.credentials.json", "*.netrc",
    "/run/agenix/*", "/run/agenix", "/run/secrets/*", "/run/secrets",
    "/run/agenix.d/*", "/run/agenix.d", "/run/secrets.d/*", "/run/secrets.d",
    "*.env", "*.env.*", "*.age"]);
  assert.deepEqual(Object.keys(denies), opencodeSecretDenies());
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

test("Claude's shell rules follow the level the session starts at (#96)", async () => {
  const guide = sentPermissions(await runBridge({ settings: { trust: "guide" } }));
  assert.ok(guide.ask.includes("Bash"));
  const mech = sentPermissions(await runBridge({ settings: { trust: "mechanic" } }));
  assert.ok(!mech.ask.includes("Bash"));
  assert.ok(mech.ask.includes("Bash(*.age*)"));
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
  const error = run.events.find((e) => e.type === "ack" && e.of === "trust" && !e.ok);
  assert.ok(error, `expected trust_error, got ${JSON.stringify(run.events.map((e) => e.type))}`);
  assert.ok(!run.events.some((e) => e.type === "ack" && e.of === "trust" && e.ok),
    "reported success for a mode change the agent never acknowledged");
  // The level it reports must be the one still in force, never the one asked for.
  assert.equal(error.trust, "guide");
  // And nothing may be persisted: a restart must not come back in Mechanic
  // after a switch that did not take.
  assert.notEqual(run.settingsAfter?.trust, "mechanic");
});

test("a successful switch still persists and reports the new trust (#40)", async () => {
  const run = await runBridge({ messages: [{ type: "trust", trust: "mechanic" }] });
  const ack = run.events.find((e) => e.type === "ack" && e.of === "trust" && e.ok);
  assert.equal(ack?.trust, "mechanic");
  assert.ok(!run.events.some((e) => e.type === "ack" && e.of === "trust" && !e.ok));
  assert.equal(run.settingsAfter.trust, "mechanic");
  // Applying the mode before persisting must not skip the mode call itself.
  const modes = run.agent.filter((e) => e.method === "setSessionMode").map((e) => e.modeId);
  assert.deepEqual(modes, ["plan", "default"], "startup mode then the switch to Mechanic");
});

// #106 -- a switch to Guide awaits the agent's mode call before `trust` moves.
// In that window nothing may be approved: held cards are cancelled on receipt,
// YOLO is refused and new requests get Guide's policy. FAKE_AGENT_HANG=mode
// holds the switch open.

const hang = { FAKE_AGENT_HANG: "mode" };
const acks = (run, of) => run.events.filter((e) => e.type === "ack" && e.of === of);
const outcomes = (run) => run.agent.filter((e) => e.method === "permissionOutcome").map((e) => e.outcome.outcome ?? e.outcome);
// Prompt, wait for the card, then start the held switch to Guide.
const cardThenGuide = async ({ until, write: send }) => {
  send(write);
  await until((e) => e.type === "permission", "permission card");
  send({ type: "trust", trust: "guide" });
};

test("YOLO during a switch to Guide is refused and the held card is cancelled (#106)", async () => {
  const run = await runBridge({
    env: hang, settings: { trust: "mechanic" },
    messages: [cardThenGuide, { type: "permission_mode", mode: "yolo" },
      ({ until }) => until((e) => e.type === "done", "turn end")],
  });
  assert.equal(acks(run, "permission_mode")[0].ok, false);
  assert.deepEqual(outcomes(run), ["cancelled"]);
  assert.notEqual(run.settingsAfter.permissionMode, "yolo");
});

test("a request in the window gets Guide's policy even when YOLO was already on (#106)", async () => {
  const run = await runBridge({
    env: hang, settings: { trust: "mechanic", permissionMode: "yolo" },
    messages: [({ write: send }) => send({ type: "trust", trust: "guide" }), write],
  });
  assert.deepEqual(outcomes(run), ["cancelled"]);
  assert.ok(run.events.some((e) => e.type === "status" && e.text.startsWith("Guide · not run")));
});

test("an allow sent for a card cancelled by the switch does nothing (#106)", async () => {
  const run = await runBridge({
    env: hang, settings: { trust: "mechanic" },
    messages: [cardThenGuide,
      ({ events, write: send }) => send({ type: "permission", id: events.find((e) => e.type === "permission").id, optionId: "allow" }),
      ({ until }) => until((e) => e.type === "done", "turn end")],
  });
  assert.deepEqual(outcomes(run), ["cancelled"]);
});

test("a switch to Guide that fails clears the window and keeps Mechanic (#106, #40)", async () => {
  const run = await runBridge({
    env: { ...hang, NIXI_MODE_TIMEOUT_MS: "300" }, settings: { trust: "mechanic" },
    messages: [{ type: "trust", trust: "guide" }, { type: "permission_mode", mode: "yolo" }],
  });
  const [trustAck] = acks(run, "trust");
  assert.equal(trustAck.ok, false);
  assert.equal(trustAck.trust, "mechanic");
  assert.equal(run.settingsAfter.trust, "mechanic");
  assert.equal(acks(run, "permission_mode")[0].ok, true, "the flag outlived the switch");
  assert.equal(run.settingsAfter.permissionMode, "yolo");
});

test("undo is refused during a switch to Guide (#106)", async () => {
  const run = await runBridge({
    env: hang, settings: { trust: "mechanic" },
    messages: [({ write: send }) => send({ type: "trust", trust: "guide" }), { type: "undo" }],
  });
  assert.ok(run.events.some((e) => e.type === "notice" && e.text.startsWith("Undo changes your machine")));
});

test("a turn that ends during a switch to Guide writes no LEARNED.md (#106, #51)", async () => {
  const run = await runBridge({
    env: hang, settings: { trust: "mechanic" },
    messages: [({ write: send }) => send({ type: "trust", trust: "guide" }),
      { type: "prompt", text: "PLEASE_LEARN something" }],
  });
  assert.equal(run.learnedAfter, null);
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
  assert.equal(ask.filter((r) => !r.startsWith("Bash")).length, allow.length * SECRET_PATHS.length,
    "generated, not hand-listed");
});

test("herdr commands always ask, whatever the user allows (#95)", () => {
  for (const trust of ["guide", "mechanic"]) for (const askBeforeReading of [true, false]) {
    const { ask } = claudePermissions(askBeforeReading, trust);
    assert.ok(ask.includes("Bash(*herdr*)") && ask.includes("Bash(*HERDR_SOCKET*)"), `${trust} ${askBeforeReading}`);
  }
});

test("secret globs are anchored absolutely as well (#95)", () => {
  const { ask } = claudePermissions(false);
  for (const rule of ["Read(//**/*.age)", "Grep(//**/.env)", "Glob(//**/.env.*)"])
    assert.ok(ask.includes(rule), `${rule} missing`);
});

test("the secret path list cannot silently shrink (#41)", () => {
  assert.ok(SECRET_PATHS.length >= 23, `only ${SECRET_PATHS.length} secret paths`);
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

// #96 -- an ask rule on Bash beats Claude's auto-approval of read-only commands.
test("rules follow the level a session starts at (#96)", () => {
  const guide = claudePermissions(false, "guide");
  assert.ok(guide.ask.includes("Bash"), "Guide has no shell");
  const mech = claudePermissions(false, "mechanic");
  assert.ok(!mech.ask.includes("Bash"), "Mechanic keeps non-secret shell commands quiet");
  for (const rule of ["Bash(*.ssh*)", "Bash(*.config/gh*)", "Bash(*.netrc*)",
    "Bash(*.docker/config.json*)", "Bash(*/run/agenix*)", "Bash(*.env*)", "Bash(*.age*)"])
    assert.ok(mech.ask.includes(rule), `${rule} missing`);
  assert.equal(new Set(mech.ask).size, mech.ask.length, "no duplicates");
  assert.deepEqual(claudePermissions(false, "bogus"), guide, "unknown trust is Guide");
  for (const p of [guide, mech]) {
    assert.ok(p.ask.includes("Read(~/.ssh/**)"));
    assert.deepEqual(p.deny, claudePermissions(false).deny);
  }
});

test("the Mechanic shell list is exactly this (#96)", () => {
  assert.deepEqual(secretBashRules().sort(), [
    "Bash(*.age*)", "Bash(*.aws*)", "Bash(*.azure*)", "Bash(*.claude/.credentials.json*)",
    "Bash(*.config/gcloud*)", "Bash(*.config/gh*)", "Bash(*.config/op*)", "Bash(*.config/sops*)",
    "Bash(*.docker/config.json*)", "Bash(*.env*)", "Bash(*.gnupg*)", "Bash(*.kube*)",
    "Bash(*.local/share/keyrings*)", "Bash(*.netrc*)", "Bash(*.ssh*)",
    "Bash(*/run/agenix*)", "Bash(*/run/agenix.d*)", "Bash(*/run/secrets*)", "Bash(*/run/secrets.d*)",
  ].sort());
});

test("no generated shell pattern is trivial (#96)", () => {
  for (const rule of secretBashRules()) {
    const inner = rule.slice("Bash(*".length, -"*)".length);
    assert.ok(inner.length >= 4 && /[a-z]/.test(inner), `${rule} would match nearly every command`);
  }
});

// #53 -- the agent offers allow_always and both installed adapters send it
// (claude-agent-acp 21 references, codex-acp 25). The card used to answer with
// a boolean, which collapsed every choice to allow_once and discarded it.

const always = { FAKE_AGENT_OPTIONS: "always" };
// #90: edits (kind edit/delete/move) never offer allow_always, so these two
// #53 tests use an execute request, where every option still reaches the card.
// The edit side is asserted in changes-bridge.test.js. S26: an unchained one,
// since a chained command (PLEASE_RUN's "&&") is never offered allow_always.
const execute = { type: "prompt", text: "PLEASE_PLAIN a command" };

test("the chosen option reaches the agent, not a derived one (#53)", async () => {
  // #114: "always" for a plain command is kept by the bridge, and the agent hears allow_once.
  for (const [optionId, expected] of [["allow-all", "allow"], ["reject-all", "reject-all"],
                                      ["allow", "allow"], ["reject", "reject"]]) {
    const run = await runBridge({
      env: always, settings: { trust: "mechanic" }, messages: [execute],
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
    env: always, settings: { trust: "mechanic" }, messages: [execute],
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
    const run = await runBridge({ env, settings: { trust: "mechanic" } });
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
  const opencodeRunHome = await runBridge({ env: opencode });
  const opencodeRun = newSession(opencodeRunHome);
  assert.equal(opencodeRun.disableProjectConfig, "1",
    `OPENCODE_DISABLE_PROJECT_CONFIG reached the adapter as ${JSON.stringify(opencodeRun.disableProjectConfig)}` +
    " -- the cwd's opencode.json and .opencode/agent/*.md still apply");
  // It rides with the rules, not instead of them, under both read settings.
  assert.deepEqual(JSON.parse(opencodeRun.opencodeConfig), opencodePermissions(false));
  const strictRun = await runBridge({ env: opencode, settings: { askBeforeReading: true } });
  const strict = newSession(strictRun);
  assert.equal(strict.disableProjectConfig, "1");
  assert.deepEqual(JSON.parse(strict.opencodeConfig), opencodePermissions(true));
  // And no other adapter is handed an OpenCode knob: Claude's cwd is closed by
  // settingSources, and setting a stray env var for Codex would be cargo cult.
  for (const env of [{}, { NIXI_AGENT: "codex" }])
    assert.equal(newSession(await runBridge({ env, settings: { trust: "mechanic" } })).disableProjectConfig, null,
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
// #52 -- a write the user approves once, which then runs with nobody present:
// a menu `when:` guard on the next reload, a post-boot.d hook at boot, a
// PreToolUse hook on the agent's next tool call. `ask` cannot express this,
// because Mechanic already asks for every write (see line 51). Only `deny` does.

// Named here rather than imported, so a tool quietly dropped from the module's
// list fails instead of moving the expectation with it.
const WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

test("every unattended-write path is denied for every write tool (#52)", () => {
  const { deny } = claudePermissions(false);
  for (const tool of WRITE_TOOLS)
    for (const path of EXEC_WRITE_PATHS)
      assert.ok(deny.includes(`${tool}(${path})`), `${tool}(${path})`);
  // The #41 property, on the write side: the list is GENERATED over the tool
  // names, so a path added later covers every tool automatically. A hand-written
  // Write(...) list would leave Edit free to reach the same paths.
  assert.equal(deny.length, WRITE_TOOLS.length * EXEC_WRITE_PATHS.length,
    "deny is not the full cross product -- it was hand-listed, or a tool was dropped");
});

test("the unattended-write list cannot silently shrink (#52)", () => {
  assert.ok(EXEC_WRITE_PATHS.length >= 8, `only ${EXEC_WRITE_PATHS.length} paths`);
  // The three findings that motivated the rule. #66 closed the agent's own cwd
  // by dropping project settings entirely; ~/.claude/** is the scope that still
  // loads, so it is the one a path rule still has to cover.
  for (const path of ["~/.claude/settings.json", "~/.claude/hooks/**",
                      "~/.config/opencode/**", "~/.opencode/**", "~/.config/omarchy/hooks/**", "~/.config/omarchy/extensions/**"])
    assert.ok(EXEC_WRITE_PATHS.includes(path), path);
  // A rule pasted where a path belongs would generate Write(Write(...)).
  for (const path of EXEC_WRITE_PATHS) assert.ok(!path.includes("("), path);
});

test("the deliberate exclusions stay excluded (#52)", () => {
  // Denying everything that executes would ban the README's flagship Mechanic
  // demo and contradict SKILL.md:90. The line is who pulls the trigger, and a
  // keybinding waits for the user. If a later broadening takes hypr with it,
  // this fails rather than shipping.
  const { deny } = claudePermissions(false);
  for (const excluded of ["~/.config/hypr/", "~/.config/omarchy/nixi.json", "/.bashrc", "/.zshrc"])
    assert.ok(!deny.some((rule) => rule.includes(excluded)),
      `${excluded} is denied; that was an explicit non-goal, so it needs its own approval`);
  // Not a deny of the cwd's .claude: #66 removed the capability instead.
  assert.ok(!EXEC_WRITE_PATHS.some((path) => path.startsWith("~/.config/nixi/")),
    "policing a path whose capability settingSources already removed (#66)");
});

test("the deny reaches the session as transmitted, under both read settings (#52)", async () => {
  // As transmitted at newSession, not as constructed: bridge.js must pass the
  // whole permissions object through, deny included.
  const plain = sentPermissions(await runBridge());
  const strict = sentPermissions(await runBridge({ settings: { askBeforeReading: true } }));
  for (const rules of [plain, strict]) {
    assert.ok(Array.isArray(rules.deny), `deny never reached newSession: ${JSON.stringify(rules)}`);
    for (const tool of WRITE_TOOLS)
      assert.ok(rules.deny.includes(`${tool}(~/.config/omarchy/hooks/**)`), tool);
    assert.ok(rules.deny.includes("Write(~/.claude/settings.json)"));
  }
  // askBeforeReading withdraws the read allow and must not disturb the deny.
  assert.deepEqual(strict.deny, plain.deny);
  assert.deepEqual(plain.allow, ["Read", "Grep", "Glob"]);
  assert.deepEqual(strict.allow, []);
});

// #44 -- three request/ack/error triples became one ack shape. The point is not
// tidiness: each triple had its own pending flag and its own reset path, and two
// of the three forgot to reset, which is #40. One shape means one place to
// clear, so that bug cannot recur per-request-kind.

test("every request is answered with the same ack shape (#44)", async () => {
  for (const [message, of] of [
    [{ type: "trust", trust: "mechanic" }, "trust"],
    [{ type: "permission_mode", mode: "yolo" }, "permission_mode"],
  ]) {
    const run = await runBridge({ settings: { trust: "mechanic" }, messages: [message] });
    const acks = run.events.filter((e) => e.type === "ack");
    assert.ok(acks.length > 0, `no ack for ${of}; got ${JSON.stringify(run.events.map((e) => e.type))}`);
    const mine = acks.find((e) => e.of === of);
    assert.ok(mine, `no ack carrying of="${of}"`);
    assert.equal(typeof mine.ok, "boolean", "an ack must say whether it succeeded");
  }
});

test("the old per-kind event names are gone (#44)", async () => {
  const run = await runBridge({
    settings: { trust: "mechanic" },
    messages: [{ type: "trust", trust: "guide" }],
  });
  const types = new Set(run.events.map((e) => e.type));
  for (const dead of ["trust", "trust_error", "permission_mode",
                      "permission_mode_error", "steered", "steering_error"]) {
    assert.ok(!types.has(dead),
      `${dead} is still emitted -- a second ack shape defeats the collapse`);
  }
});

test("a failed request acks with ok:false and keeps the level in force (#44)", async () => {
  const run = await runBridge({
    env: { FAKE_AGENT_HANG: "mode", NIXI_MODE_TIMEOUT_MS: "300" },
    settings: { trust: "mechanic" },
    messages: [{ type: "trust", trust: "guide" }],
  });
  const ack = run.events.find((e) => e.type === "ack" && e.of === "trust");
  assert.ok(ack, "a hung request produced no ack at all -- the card would wait forever");
  assert.equal(ack.ok, false);
  // The same guarantee #40 established: never report a level the session is not in.
  assert.equal(ack.trust, "mechanic");
});

// #102: opencode ends a turn on any refusal; the user must be told why it is empty.
test("Guide: an empty cancelled turn after a refusal gets one notice; a normal turn gets none (#102)", async () => {
  const { events } = await runBridge({ messages: [{ type: "prompt", text: "PLEASE_WRITE THEN_CANCEL" }, { type: "prompt", text: "hello" }] });
  const notices = events.filter((e) => e.type === "notice" && e.text.includes("stopped instead of answering"));
  assert.equal(notices.length, 1);
  assert.ok(notices[0].text.includes("Write ~/probe"));
  assert.ok(events.findIndex((e) => e === notices[0]) < events.findIndex((e) => e.type === "done"));
});

test("Guide: a cancelled turn that had some text still gets the notice (#102)", async () => {
  const { events } = await runBridge({ messages: [{ type: "prompt", text: "PLEASE_WRITE THEN_CANCEL WITH_TEXT" }] });
  assert.ok(events.some((e) => e.type === "text"));
  assert.equal(events.filter((e) => e.type === "notice" && e.text.includes("stopped instead of answering")).length, 1);
});

test("Guide: the stop button after a refusal does not get the Guide notice (#102)", async () => {
  const { events } = await runBridge({ messages: [async ({ events, send }) => {
    const waitFor = (predicate) => new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => events.some(predicate) ? resolve() : Date.now() - started > 10000 ? reject(new Error("timed out")) : setTimeout(poll, 20);
      poll();
    });
    send({ type: "prompt", text: "PLEASE_WRITE THEN_CANCEL WAIT_STOP" });
    await waitFor((e) => e.type === "status" && e.text.startsWith("Guide · not run"));
    send({ type: "cancel" });
    await waitFor((e) => e.type === "done");
  }] });
  assert.ok(events.some((e) => e.type === "done" && e.stopReason === "cancelled"));
  assert.ok(!events.some((e) => e.type === "notice" && e.text.includes("stopped instead of answering")));
});

const stall = { NIXI_TURN_STALL_MS: "300" };

test("stall guard: a silent turn is cancelled and reported (#102)", async () => {
  const { events, agent } = await runBridge({ env: stall, messages: [{ type: "prompt", text: "STALL_SILENT" }, () => new Promise((r) => setTimeout(r, 300))] });
  assert.ok(events.some((e) => e.type === "error" && e.message.includes("stopped responding")));
  assert.ok(agent.some((e) => e.method === "cancel"));
});

const waitFor = (events, predicate, ms = 10000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = () => events.some(predicate) ? resolve() : Date.now() - started > ms ? reject(new Error("timed out")) : setTimeout(poll, 20);
  poll();
});

test("stall guard: it ends the session (error, then fatal) and takes no further prompt (#102)", async () => {
  const { events, agent } = await runBridge({ env: stall, messages: [async ({ events, send, exited }) => {
    send({ type: "prompt", text: "STALL_SILENT" });
    await waitFor(events, (e) => e.type === "fatal");
    await waitFor(events, () => exited());
  }] });
  const kinds = events.map((e) => e.type).filter((t) => t === "error" || t === "fatal");
  assert.deepEqual(kinds, ["error", "fatal"]);
  assert.equal(agent.filter((e) => e.method === "prompt").length, 1);
});

test("stall guard: a tool that finished no longer earns the long limit (#102)", async () => {
  const started = Date.now();
  // idle limit 1 s, tool limit 6 s: an error well before 6 s means the idle limit applied.
  const { events } = await runBridge({ env: { NIXI_TURN_STALL_MS: "1000" }, messages: [{ type: "prompt", text: "STALL_TOOLDONE" }] });
  assert.ok(events.some((e) => e.type === "error"));
  assert.ok(Date.now() - started < 4500, `took ${Date.now() - started} ms`);
});

test("stall guard: closing stdin clears the timer, so the bridge exits promptly (#102)", async () => {
  let exitedAt = null;
  await runBridge({ messages: [async ({ events, send, end, exited }) => {
    send({ type: "prompt", text: "STALL_SILENT" });
    await waitFor(events, (e) => e.type === "status" && e.text === "Thinking…");
    const started = Date.now();
    end();
    await waitFor(events, () => exited(), 4000);
    exitedAt = Date.now() - started;
  }] });
  assert.ok(exitedAt < 4000, `still running ${exitedAt} ms after stdin closed`);
});

test("stall guard: a duplicate prompt does not disarm it (#102)", async () => {
  const { events } = await runBridge({ env: stall, messages: [async ({ events, send }) => {
    send({ type: "prompt", text: "STALL_SILENT" });
    await waitFor(events, (e) => e.type === "status");
    send({ type: "prompt", text: "second" });
    await waitFor(events, (e) => e.type === "fatal");
  }] });
  assert.ok(events.some((e) => e.type === "error" && e.message.includes("already handling")));
  assert.ok(events.some((e) => e.type === "error" && e.message.includes("stopped responding")));
});

test("Mechanic: a cancelled turn gets no Guide notice (#102)", async () => {
  const { events } = await runBridge({
    settings: { trust: "mechanic" }, messages: [{ type: "prompt", text: "PLEASE_WRITE THEN_CANCEL" }],
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "reject" }),
  });
  assert.ok(events.some((e) => e.type === "done" && e.stopReason === "cancelled"));
  assert.ok(!events.some((e) => e.type === "notice" && e.text.includes("stopped instead of answering")));
});

test("Stop while the prompt is still being grounded ends the turn without starting it (#102)", async () => {
  const { events, agent } = await runBridge({ context: "x", messages: [async ({ events, send }) => {
    send({ type: "prompt", text: "hello" });
    send({ type: "cancel" });
    await waitFor(events, (e) => e.type === "done");
  }] });
  assert.ok(events.some((e) => e.type === "done"));
  assert.equal(agent.filter((e) => e.method === "prompt").length, 0);
});

test("stall guard: a running tool gets the longer limit (#102)", async () => {
  const { events } = await runBridge({ env: stall, messages: [{ type: "prompt", text: "STALL_TOOL" }] });
  assert.ok(!events.some((e) => e.type === "error"), JSON.stringify(events));
  assert.ok(events.some((e) => e.type === "done"));
});

test("stall guard: a pending card pauses it (#102)", async () => {
  const run = await runBridge({
    env: stall, settings: { trust: "mechanic" }, messages: [{ type: "prompt", text: "PLEASE_RUN" }],
    // Blocks the test process (not the bridge) for 3x the limit before answering the card.
    onPermission: (event) => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 900);
      return { type: "permission", id: event.id, optionId: "allow" };
    },
  });
  assert.ok(!run.events.some((e) => e.type === "error"), JSON.stringify(run.events));
});
