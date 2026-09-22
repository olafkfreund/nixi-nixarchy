#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Readable, Writable } from "node:stream";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolveHarness, resolveExecutable, resolveAdapter } from "./harness-policy.js";
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
  const specificName = { codex: "NIXI_CODEX_ACP_COMMAND", opencode: "NIXI_OPENCODE_COMMAND" }[agentName]
    || "NIXI_CLAUDE_ACP_COMMAND";
  const raw = String(process.env[specificName]
    || process.env.NIXI_ACP_COMMAND || "").trim();
  if (!raw) return resolveAdapter(agentName);
  let command;
  try { command = JSON.parse(raw); }
  catch { throw new Error("NIXI_ACP_COMMAND must be a JSON array of arguments"); }
  if (!Array.isArray(command) || command.length === 0
      || command.some((argument) => typeof argument !== "string" || argument === ""))
    throw new Error("NIXI_ACP_COMMAND must be a non-empty JSON array of non-empty strings");
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
  if (!content) return "";
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text || "";
  return "";
}

function flatOptions(options) {
  const result = [];
  for (const option of options || []) {
    if (Array.isArray(option.options)) result.push(...option.options);
    else result.push(option);
  }
  return result;
}

function matchingValue(config, wanted) {
  if (!wanted) return "";
  const option = flatOptions(config?.options).find(candidate => candidate.value === wanted);
  return option?.value || "";
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

const childEnvironment = { ...process.env, HUGINN_INTERNAL: "1" };
// ACP is the transport adapter; the installed system harness owns execution.
// Explicit deployment overrides retain precedence. Never silently use the
// adapter's transitive harness dependency when the system install is absent.
if (agentName === "codex")
  childEnvironment.CODEX_PATH = startupValue(() => resolveExecutable(agentName));
else if (agentName === "claude")
  childEnvironment.CLAUDE_CODE_EXECUTABLE = startupValue(() => resolveExecutable(agentName));
// Replaces any value from the environment: Nixi's permission rules are what
// make Guide safe with OpenCode, so the user's env must not be able to weaken them.
if (agentName === "opencode")
  childEnvironment.OPENCODE_CONFIG_CONTENT = JSON.stringify(opencodePermissions(askBeforeReading));
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
let childExitResolve;
const childExited = new Promise((resolve) => { childExitResolve = resolve; });

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
          id: update.toolCallId || "",
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
      const option = options.find((item) => item.kind === "allow_once");
      if (option) {
        emit({ type: "status", text: `YOLO · ${title}` });
        return Promise.resolve({ outcome: { outcome: "selected", optionId: option.id } });
      }
      return Promise.resolve({ outcome: { outcome: "cancelled" } });
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
  emit({
    type: "ready",
    agent: agentName,
    sessionId,
    capabilities: initialized.agentCapabilities || {},
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
  try { await appendLearned(facts, learnedDir); }
  catch (error) { emit({ type: "diagnostic", text: `Could not record LEARNED facts: ${error.message}` }); }
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
  emit({ type: "steered", outcome });
}

function answerPermission(message) {
  const pending = pendingPermissions.get(message.id);
  if (!pending) return;
  pendingPermissions.delete(message.id);
  const wantedKind = message.allow ? "allow_once" : "reject_once";
  const option = pending.options.find((item) => item.kind === wantedKind);
  if (option) {
    pending.resolve({ outcome: { outcome: "selected", optionId: option.id } });
  } else {
    pending.resolve({ outcome: { outcome: "cancelled" } });
  }
  emit({ type: "status", text: message.allow ? "Working…" : "Tool denied" });
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
async function applyTrustMode() {
  const { modeId } = currentPolicy();
  const offered = (sessionModes?.availableModes || []).map((mode) => mode.id);
  if (offered.includes(modeId)) {
    await connection.setSessionMode({ sessionId, modeId });
    return;
  }
  // OpenCode offers its modes as a config option rather than ACP session modes.
  const option = (configOptions || []).find((item) => item.category === "mode");
  if (option && (option.options || []).some((item) => item.value === modeId)) {
    const response = await connection.setSessionConfigOption({ sessionId, configId: option.id, value: modeId });
    configOptions = response.configOptions || configOptions;
    return;
  }
  emit({ type: "diagnostic", text: `Session mode ${modeId} is not offered by this agent; relying on permission handling` });
}

function allowAllPendingPermissions() {
  for (const [id, pending] of pendingPermissions.entries()) {
    const option = pending.options.find((item) => item.kind === "allow_once");
    pendingPermissions.delete(id);
    pending.resolve(option
      ? { outcome: { outcome: "selected", optionId: option.id } }
      : { outcome: { outcome: "cancelled" } });
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { resolve } of pendingPermissions.values()) {
    resolve({ outcome: { outcome: "cancelled" } });
  }
  pendingPermissions.clear();
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
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
      emit({ type: "steering_error", message: error.message || String(error) });
    });
  } else if (message.type === "permission") {
    answerPermission(message);
  } else if (message.type === "trust") {
    const next = resolveTrust(message.trust);
    mergeSettings({ trust: next }).then(async () => {
      trust = next;
      // Leaving Mechanic must not leave an approval waiting in the card.
      if (trust === "guide") cancelAllPendingPermissions();
      if (connection && sessionId) await applyTrustMode();
      emit({ type: "trust", trust });
    }).catch((error) => {
      emit({ type: "trust_error", trust, message: `Could not change trust level: ${error.message}` });
    });
  } else if (message.type === "permission_mode") {
    savePermissionMode(message.mode).then(() => {
      if (permissionMode === "yolo") allowAllPendingPermissions();
      emit({ type: "permission_mode", mode: permissionMode });
    }).catch((error) => {
      emit({
        type: "permission_mode_error",
        mode: permissionMode,
        message: `Could not save permission mode: ${error.message}`,
      });
    });
  } else if (message.type === "cancel" && connection && sessionId) {
    connection.cancel({ sessionId }).catch(() => {});
  } else if (message.type === "close") {
    shutdown().finally(() => process.exit(0));
  }
});
input.on("close", () => shutdown());

child.on("exit", (code, signal) => {
  childExitResolve({ code, signal });
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
