#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { Readable, Writable } from "node:stream";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolveHarness, resolveExecutable, resolveAdapter, adapterOverride, parseCommand } from "./harness-policy.js";
import { explainHarnessError, needsNewSession } from "./harness-errors.js";
import { groundPrompt } from "./grounding.js";
import { createLearnedFilter, appendLearned } from "./learned.js";
import { resolveTrust, trustPolicy, claudePermissions, opencodePermissions } from "./trust-policy.js";
import { permissionDetail } from "./permission-detail.js";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
} from "@agentclientprotocol/sdk";

function startupValue(resolve) {
  try { return resolve(); }
  catch (error) {
    emit({ type: "fatal", message: error.message });
    process.exit(1);
  }
}
const agentName = startupValue(() => resolveHarness());
function configuredAgentCommand() {
  const raw = adapterOverride(agentName);
  if (!raw) return resolveAdapter(agentName);
  const command = parseCommand(raw);
  if (!command) throw new Error("NIXI_ACP_COMMAND must be a non-empty JSON array of non-empty strings");
  return command;
}
const agentCommand = startupValue(configuredAgentCommand);
// The agent runs in nixi's config directory when it exists, so Claude Code loads
// nixi's CLAUDE.md -- the tutor brief that points it at the nixi skill and the
// local manual. Without it, HOME, as upstream did.
const nixiConfigDir = join(process.env.HOME || "", ".config", "nixi");
const cwd = process.env.NIXI_CWD
  || (process.env.HOME && existsSync(nixiConfigDir) ? nixiConfigDir : "")
  || process.env.HOME || process.cwd();
// Nixi chose this directory and never writes .codex into it, so the directory
// being there is always either a mistake or someone else's doing. codex loads
// <cwd>/.codex/config.toml as a project config layer when the directory is
// trusted in the user's own ~/.codex/config.toml, and an mcp_servers entry
// there runs AT SESSION START, outside any permission request -- so neither
// Guide nor Mechanic ever sees it (#74).
//
// Not parsed. Whether a given file is dangerous is codex's business, and its
// config format and trust rules both move; existence is the durable signal.
// A diagnostic rather than a refusal: the file is inert unless the directory
// is ALSO trusted, so refusing would block sessions that are provably safe.
function noticeUnaccountedEnvironment() {
  if (existsSync(join(cwd, ".codex")))
    emit({ type: "diagnostic", text: `Unexpected .codex directory in ${cwd} — Nixi never creates one. If you did not put it there, remove it: codex can run commands from it at session start.` });
  // These three cannot be pinned by the build -- two are HOME-relative and
  // NIXI_CWD is derived from whether ~/.config/nixi exists -- so saying they
  // are set is the honest equivalent of pinning them (#74, after #76/#77).
  for (const name of ["NIXI_CWD", "NIXI_DIR", "NIXI_DATA"])
    if (process.env[name])
      emit({ type: "diagnostic", text: `${name} is set in the environment; Nixi does not set it. It changes where the agent runs or what it is told.` });
}

const settingsDir = join(process.env.HOME || process.cwd(), ".config", "omarchy");
const settingsPath = join(settingsDir, "nixi.json");

// "Ask for everything" (#27). Read once, synchronously: the agent's permission
// rules are fixed when it is spawned (OpenCode) or its session starts (Claude),
// so a change applies from the next session.
const askBeforeReading = (() => {
  try { return JSON.parse(readFileSync(settingsPath, "utf8")).askBeforeReading === true; }
  catch { return false; }
})();

let permissionMode = "permission";
// Guide unless nixi.json says otherwise; unknown values are Guide too.
let trust = "guide";

async function loadSettings() {
  try {
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    permissionMode = settings.permissionMode === "yolo" ? "yolo" : "permission";
    trust = resolveTrust(settings.trust);
  } catch {}
}

async function mergeSettings(patch) {
  await mkdir(settingsDir, { recursive: true });
  // The UI writes its own keys (font scale) to this file. Merge rather than
  // replace so changing one setting cannot drop the others.
  let settings = {};
  try {
    const parsed = JSON.parse(await readFile(settingsPath, "utf8"));
    if (parsed && typeof parsed === "object") settings = parsed;
  } catch {}
  Object.assign(settings, patch);
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, {
    mode: 0o600,
  });
}

async function savePermissionMode(mode) {
  const nextMode = mode === "yolo" ? "yolo" : "permission";
  if (nextMode === "yolo" && trust !== "mechanic")
    throw new Error("YOLO is only available in Mechanic");
  await mergeSettings({ permissionMode: nextMode });
  permissionMode = nextMode;
}

function currentPolicy() {
  return trustPolicy(agentName, trust, permissionMode);
}

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function messageText(content) {
  if (typeof content === "string") return content;
  return content?.type === "text" ? content.text || "" : "";
}

// Config options may be grouped one level deep.
function matchingValue(config, wanted) {
  if (!wanted) return "";
  const options = (config?.options || []).flatMap((option) => option.options ?? [option]);
  return options.some((option) => option.value === wanted) ? wanted : "";
}

async function applyRequestedModel(configOptions) {
  if (process.env.NIXI_INSPECT_CONFIG === "1")
    emit({ type: "config_options", configOptions });
  const requests = [
    { wanted: process.env.NIXI_MODEL, ids: ["model"], categories: ["model"] },
    { wanted: process.env.NIXI_REASONING_EFFORT,
      ids: ["reasoning_effort"], categories: ["thought_level"] },
  ];
  for (const request of requests) {
    if (!request.wanted) continue;
    const config = (configOptions || []).find((option) =>
      request.ids.includes(option.id) || request.categories.includes(option.category));
    // Claude's adapter resolves exact version IDs against its SDK metadata,
    // including versioned IDs exposed under aliases such as opus[1m].
    const value = matchingValue(config, request.wanted)
      || (agentName === "claude" && config?.category === "model" ? request.wanted : "");
    if (!config || !value) {
      throw new Error(`Configured ACP option unavailable: ${request.wanted}`);
    }
    const response = await connection.setSessionConfigOption({
      sessionId,
      configId: config.id,
      value,
    });
    configOptions = response.configOptions || configOptions;
    if (process.env.NIXI_INSPECT_CONFIG === "1")
      emit({ type: "config_options", configOptions });
  }
}

const childEnvironment = { ...process.env };
// ACP is the transport adapter; the installed system harness owns execution.
// Explicit deployment overrides retain precedence. Never silently use the
// adapter's transitive harness dependency when the system install is absent.
if (agentName === "codex")
  childEnvironment.CODEX_PATH = startupValue(() => resolveExecutable(agentName));
else if (agentName === "claude")
  childEnvironment.CLAUDE_CODE_EXECUTABLE = startupValue(() => resolveExecutable(agentName));
// Replaces any value from the environment: Nixi's permission rules are what
// make Guide safe with OpenCode, so the user's env must not be able to weaken them.
if (agentName === "opencode") {
  childEnvironment.OPENCODE_CONFIG_CONTENT = JSON.stringify(opencodePermissions(askBeforeReading));
  // ...and the cwd must not be able to weaken them either (#63). The agent's
  // cwd is ~/.config/nixi, which is unmanaged, so OpenCode was reading a second
  // config layer from a directory the agent can write to. Nixi's rules do not
  // win against it: an `opencode.json` there introduces `bash`/`edit`/`write`,
  // the keys the `"*": "ask"` wildcard never names, and a named key beats the
  // wildcard -- while a `.opencode/agent/*.md` permission block is appended
  // AFTER Nixi's rules, and the last matching rule is the one that applies, so
  // it overrides even `plan_exit: "deny"`. Both make a write produce no
  // permission request at all, which is precisely what Guide cannot cancel.
  //
  // This is #66's answer in OpenCode's dialect: remove the capability rather
  // than police a path. It drops only the cwd-derived layer -- the user's own
  // ~/.opencode and ~/.config/opencode still load, so it constrains the AGENT
  // against itself and leaves what the PERSON configured alone.
  childEnvironment.OPENCODE_DISABLE_PROJECT_CONFIG = "1";
}
if (agentName === "codex") {
  let codexConfig = {};
  try { codexConfig = JSON.parse(process.env.CODEX_CONFIG || "{}"); } catch {}
  if (process.env.NIXI_MODEL) codexConfig.model = process.env.NIXI_MODEL;
  if (process.env.NIXI_REASONING_EFFORT)
    codexConfig.model_reasoning_effort = process.env.NIXI_REASONING_EFFORT;
  childEnvironment.CODEX_CONFIG = JSON.stringify(codexConfig);
}

const child = spawn(agentCommand[0], agentCommand.slice(1), {
  cwd,
  env: childEnvironment,
  stdio: ["pipe", "pipe", "pipe"],
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  for (const line of String(chunk).split("\n")) {
    if (line.trim()) emit({ type: "diagnostic", text: line.trim() });
  }
});

const pendingPermissions = new Map();
let permissionSequence = 0;
let sessionId = null;
let connection = null;
let turnRunning = false;
let steeringSupported = false;
let shuttingDown = false;
// Settles when the child exits. A spawn error rejects once(); the exit path
// only races this against a timeout, so a failed spawn just ends the wait.
const childExited = once(child, "exit").catch(() => {});

const client = {
  sessionUpdate(params) {
    const update = params.update || {};
    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const text = learned.push(messageText(update.content) || "");
        lastMessageId = update.messageId || lastMessageId;
        if (text) emit({ type: "text", text, messageId: update.messageId || "" });
        break;
      }
      case "tool_call":
      case "tool_call_update":
        emit({
          type: "tool",
          title: update.title || update.name || "Using a tool",
          status: update.status || "in_progress",
        });
        break;
      case "agent_thought_chunk":
        emit({ type: "status", text: "Thinking…" });
        break;
      default:
        break;
    }
    return Promise.resolve();
  },

  requestPermission(params) {
    const requestId = `permission-${++permissionSequence}`;
    const title = params.toolCall?.title || params.toolCall?.name || "Use a tool";
    const options = (params.options || []).map((option) => ({
      id: option.optionId,
      label: option.name,
      kind: option.kind,
    }));
    const policy = currentPolicy();
    // Guide: nothing that asks for permission ever runs, and nothing is shown
    // to approve. This, not the session mode, is Guide's guarantee.
    if (policy.permission === "cancel") {
      emit({ type: "status", text: `Guide · not run: ${title}` });
      return Promise.resolve({ outcome: { outcome: "cancelled" } });
    }
    if (policy.permission === "yolo") {
      const outcome = choose(options, "allow_once");
      if (outcome.outcome.outcome === "selected") emit({ type: "status", text: `YOLO · ${title}` });
      return Promise.resolve(outcome);
    }
    const { detail, omitted } = permissionDetail(params.toolCall);
    emit({ type: "permission", id: requestId, title, options, detail, omitted });
    return new Promise((resolve) => {
      pendingPermissions.set(requestId, { resolve, options });
    });
  },
};

async function start() {
  await loadSettings();
  const stream = ndJsonStream(
    Writable.toWeb(child.stdin),
    Readable.toWeb(child.stdout),
  );
  connection = new ClientSideConnection(() => client, stream);
  const initialized = await connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: { session: { configOptions: {} } },
  });
  steeringSupported = initialized?._meta?.steering?.supported === true;
  const model = process.env.NIXI_MODEL;
  const session = await connection.newSession({ cwd, mcpServers: [],
    ...(agentName === "claude" ? {
      _meta: { claudeCode: { options: {
        ...(model ? { model } : {}),
        // The agent's cwd is ~/.config/nixi, so Claude Code would read
        // .claude/settings.json and PreToolUse hooks from a directory the agent
        // can write to -- letting an approved write grant it standing
        // permissions, or install a hook that runs a shell command with no
        // prompt (#63). The adapter's default is ["user","project","local"];
        // naming only "user" drops the two that live in the cwd.
        //
        // "user", not [], because Nixi is a card on someone else's machine: it
        // constrains what the AGENT can do to itself and leaves what the PERSON
        // configured alone. CLAUDE.md is unaffected -- measured, not assumed:
        // the tutor brief still loads under restricted sources.
        settingSources: ["user"],
        settings: {
          ...(model ? { model, availableModels: [model] } : {}),
          permissions: claudePermissions(askBeforeReading),
        },
      } } },
    } : {}),
  });
  sessionId = session.sessionId;
  sessionModes = session.modes || null;
  configOptions = session.configOptions || [];
  await applyRequestedModel(configOptions);
  await applyTrustMode();
  // Before ready, not after: the card reads this stdout from the moment it
  // spawns the bridge, so there is nothing to wait for -- and anything emitted
  // after ready races every consumer that treats ready as "the session is up
  // and I can look at what arrived".
  noticeUnaccountedEnvironment();
  emit({
    type: "ready",
    steeringSupported,
    permissionMode,
    trust,
  });
}

// One filter per turn: a LEARNED line split across chunks is still caught.
let learned = createLearnedFilter();
let lastMessageId = "";
const learnedDir = process.env.NIXI_DATA || join(process.env.HOME || process.cwd(), ".local", "share", "nixi");

async function finishLearned() {
  const { visible, facts } = learned.flush();
  if (visible) emit({ type: "text", text: visible, messageId: lastMessageId });
  // Guide does not write. LEARNED.md is a write, and one that steers later
  // sessions -- nixi-context reads it as a notes source and grounding.js
  // prepends the result to future prompts. #41 settled that reading is not
  // changing and writing is, which is why Guide keeps unprompted reads; the
  // same distinction says it must not accumulate durable state that alters its
  // own future behaviour behind a promise that nothing changes (#51).
  if (resolveTrust(trust) === "guide" || facts.length === 0) return;
  try {
    await appendLearned(facts, learnedDir);
    // Kept, so say so. Hiding the write was deliberate -- a bare LEARNED: line
    // is noise -- but the user could not see their tutor forming a belief about
    // their machine, or correct it.
    emit({ type: "learned", facts });
  } catch (error) {
    emit({ type: "diagnostic", text: `Could not record LEARNED facts: ${error.message}` });
  }
}

async function prompt(text) {
  if (!connection || !sessionId) throw new Error("ACP session is not ready");
  if (turnRunning) throw new Error("The agent is already handling a prompt");
  turnRunning = true;
  emit({ type: "status", text: "Thinking…" });
  try {
    const grounding = await groundPrompt(text);
    if (grounding.error) emit({ type: "diagnostic", text: `nixi-context unavailable: ${grounding.error}` });
    learned = createLearnedFilter();
    const response = await connection.prompt({
      sessionId,
      prompt: [{ type: "text", text: grounding.prompt }],
    });
    await finishLearned();
    emit({ type: "done", stopReason: response.stopReason || "end_turn" });
  } finally {
    turnRunning = false;
  }
}

async function steer(text) {
  if (!connection || !sessionId) throw new Error("ACP session is not ready");
  if (!turnRunning) throw new Error("There is no active turn to steer");
  if (!steeringSupported) throw new Error("This ACP agent does not support steering");
  const response = await connection.request("_session/steering", {
    sessionId,
    prompt: [{ type: "text", text }],
  });
  const outcome = response?.outcome || "failed";
  if (outcome === "failed") throw new Error("The agent could not apply the steering prompt");
  ack("steer", true, { outcome });
}

function answerPermission(message) {
  const pending = pendingPermissions.get(message.id);
  if (!pending) return;
  pendingPermissions.delete(message.id);
  pending.resolve(select(pending.options, String(message.optionId || "")));
  const picked = pending.options.find((item) => item.id === String(message.optionId || ""));
  emit({ type: "status", text: String(picked?.kind || "").startsWith("allow") ? "Working…" : "Tool denied" });
}

// The ACP answer for the option of this kind, or cancelled if there is none.
// Honour the option the user actually picked. choose() below selects a KIND on
// the user's behalf, which is right for YOLO and the allow-all path and wrong
// for an answer -- collapsing every answer to allow_once is what discarded the
// agent's "allow always" entirely (#53).
function select(options, id) {
  // The SDK delivers options to the client as { id, label, kind }; only the
  // ACP response back to the agent calls the field optionId. choose() below
  // already matched on .id -- select() must too.
  const option = options.find((item) => item.id === id);
  return { outcome: option ? { outcome: "selected", optionId: option.id } : { outcome: "cancelled" } };
}

// #44: one acknowledgement shape for every request the card makes. There were
// three near-identical triples -- trust/trust_error, permission_mode/
// permission_mode_error, steered/steering_error -- each with its own pending
// flag on the card and its own reset path. Two of the three forgot to reset,
// which is #40. One shape means one place to clear, so that class of bug
// cannot recur per-request-kind.
//
// `of` names the request being answered and matches the inbound message type,
// so a reader can follow one word from the card's write to the bridge's reply.
function ack(of, ok, extra = {}) {
  emit({ type: "ack", of, ok, ...extra });
}

function choose(options, kind) {
  const option = options.find((item) => item.kind === kind);
  return { outcome: option ? { outcome: "selected", optionId: option.id } : { outcome: "cancelled" } };
}

function cancelAllPendingPermissions() {
  for (const [id, pending] of pendingPermissions.entries()) {
    pendingPermissions.delete(id);
    pending.resolve({ outcome: { outcome: "cancelled" } });
  }
}

let sessionModes = null;
let configOptions = [];

// The session mode is the second layer under the permission policy. An agent
// that does not offer the mode is still safe in Guide, because every request is
// cancelled regardless -- so a missing mode is reported, not fatal.
// An agent that never answers leaves the card's trustPending set forever, so
// /mechanic, /guide and the YOLO badge become silent no-ops for the life of the
// conversation (#40). Bounded like shutdown()'s close, but this one REJECTS:
// the caller has to be able to tell a hang from a success. ref: false so the
// losing timer cannot hold the bridge open.
const MODE_TIMEOUT_MS = Number(process.env.NIXI_MODE_TIMEOUT_MS) || 8000;
async function withModeTimeout(promise) {
  const expired = Symbol("expired");
  const result = await Promise.race([promise, delay(MODE_TIMEOUT_MS, expired, { ref: false })]);
  if (result === expired)
    throw new Error(`the agent did not answer within ${MODE_TIMEOUT_MS / 1000}s`);
  return result;
}

// targetTrust is explicit so the mode can be applied BEFORE the global `trust`
// is updated -- currentPolicy() reads that global, so computing the policy
// after the move would apply the mode we are leaving.
async function applyTrustMode(targetTrust = trust) {
  const { modeId } = trustPolicy(agentName, targetTrust, permissionMode);
  const offered = (sessionModes?.availableModes || []).map((mode) => mode.id);
  if (offered.includes(modeId)) {
    await withModeTimeout(connection.setSessionMode({ sessionId, modeId }));
    return;
  }
  // OpenCode offers its modes as a config option rather than ACP session modes.
  const option = (configOptions || []).find((item) => item.category === "mode");
  if (option && (option.options || []).some((item) => item.value === modeId)) {
    const response = await withModeTimeout(connection.setSessionConfigOption({ sessionId, configId: option.id, value: modeId }));
    configOptions = response.configOptions || configOptions;
    return;
  }
  emit({ type: "diagnostic", text: `Session mode ${modeId} is not offered by this agent; relying on permission handling` });
}

function allowAllPendingPermissions() {
  for (const [id, pending] of pendingPermissions.entries()) {
    pendingPermissions.delete(id);
    pending.resolve(choose(pending.options, "allow_once"));
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  cancelAllPendingPermissions();
  // Bound graceful ACP close before signalling the child. Remain alive long
  // enough to reap it; a detached kill timer cannot help after bridge exit.
  try {
    if (connection && sessionId)
      await Promise.race([connection.closeSession({ sessionId }), delay(350)]);
  } catch {}
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await Promise.race([childExited, delay(500)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([childExited, delay(150)]);
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    emit({ type: "error", message: "Invalid UI command" });
    return;
  }
  if (message.type === "prompt") {
    prompt(String(message.text || "")).catch((error) => {
      turnRunning = false;
      const fatal = needsNewSession(error);
      emit({ type: fatal ? "fatal" : "error", message: explainHarnessError(error, agentName) });
      if (fatal) shutdown().finally(() => process.exit(1));
    });
  } else if (message.type === "steer") {
    steer(String(message.text || "")).catch((error) => {
      ack("steer", false, { message: error.message || String(error) });
    });
  } else if (message.type === "permission") {
    answerPermission(message);
  } else if (message.type === "trust") {
    const next = resolveTrust(message.trust);
    // Apply the ACP mode FIRST, then persist and publish. The old order set
    // `trust` before the mode call, so a failure reported the level the session
    // had NOT moved to (#40). On failure nothing is written and `trust` still
    // holds the level actually in force, which is what the failed ack carries.
    (async () => {
      if (connection && sessionId) await applyTrustMode(next);
      await mergeSettings({ trust: next });
      trust = next;
      // Leaving Mechanic must not leave an approval waiting in the card.
      if (trust === "guide") cancelAllPendingPermissions();
      ack("trust", true, { trust });
    })().catch((error) => {
      ack("trust", false, { trust, message: `Could not change trust level: ${error.message}` });
    });
  } else if (message.type === "permission_mode") {
    savePermissionMode(message.mode).then(() => {
      if (permissionMode === "yolo") allowAllPendingPermissions();
      ack("permission_mode", true, { mode: permissionMode });
    }).catch((error) => {
      ack("permission_mode", false, { mode: permissionMode, message: `Could not save permission mode: ${error.message}` });
    });
  } else if (message.type === "cancel" && connection && sessionId) {
    connection.cancel({ sessionId }).catch(() => {});
  } else if (message.type === "close") {
    shutdown().finally(() => process.exit(0));
  }
});
input.on("close", () => shutdown());

child.on("exit", (code, signal) => {
  if (!shuttingDown) {
    emit({ type: "fatal", message: `ACP agent exited (${signal || code})` });
    process.exit(code || 0);
  }
});
child.on("error", (error) => {
  emit({ type: "fatal", message: error.message });
  process.exit(1);
});

process.on("SIGTERM", () => shutdown().finally(() => process.exit(0)));
process.on("SIGINT", () => shutdown().finally(() => process.exit(0)));

start().catch((error) => {
  emit({ type: "fatal", message: explainHarnessError(error, agentName) });
  child.kill("SIGTERM");
  process.exit(1);
});
