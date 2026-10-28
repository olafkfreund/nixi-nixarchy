#!/usr/bin/env node

import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { Readable, Writable } from "node:stream";
import { join } from "node:path";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { existsSync, readFileSync, mkdirSync, appendFileSync, chmodSync } from "node:fs";
import { resolveHarness, resolveExecutable, resolveAdapter, adapterOverride, parseCommand, resolveAiMirror } from "./harness-policy.js";
import { explainHarnessError, needsNewSession } from "./harness-errors.js";
import { groundPrompt } from "./grounding.js";
import { createLearnedFilter, appendLearned } from "./learned.js";
import { blockMarkdown, prepareMediaDir } from "./media.js";
import { createChartFilter } from "./chart.js";
import { resolveTrust, trustPolicy, claudePermissions, opencodePermissions } from "./trust-policy.js";
import { isHerdrWrite, herdrWriteDetail } from "./herdr-policy.js";
import { createAlways, isChained, keyOf, rememberable, storePath } from "./always.js";
import { permissionDetail } from "./permission-detail.js";
import { createChanges } from "./changes.js";
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
// Desktop control. Null unless a build pinned ai-mirror, and even then the trust
// policy decides whether a session may attach it (never at Guide).
const aiMirrorCommand = startupValue(() => resolveAiMirror());
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
  if (process.env.NIXI_TURN_STALL_MS)
    emit({ type: "diagnostic", text: "NIXI_TURN_STALL_MS is set in the environment; Nixi does not set it. It shortens how long a silent turn is allowed." });
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
// Switches to Guide received and not yet settled: `trust` only moves once the
// agent confirms, but nothing may be approved in that window (#106). A count,
// so a second /guide still covers the window when the first settles.
let leavingMechanic = 0;
const effectiveTrust = () => (leavingMechanic > 0 ? "guide" : trust);

async function loadSettings() {
  try {
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    permissionMode = settings.permissionMode === "yolo" ? "yolo" : "permission";
    trust = resolveTrust(settings.trust);
  } catch {}
}

// One write at a time per bridge, and rename() so the card never reads a
// half-written file (#103).
let settingsQueue = Promise.resolve();
let settingsWrites = 0;
function mergeSettings(patch) {
  const run = settingsQueue.then(async () => {
    await mkdir(settingsDir, { recursive: true });
    // The UI writes its own keys (font scale) to this file. Merge a fresh read
    // rather than replace so changing one setting cannot drop the others.
    // Only a missing file starts empty. Anything unreadable fails the switch
    // rather than replacing the card's keys with this one patch.
    let settings = {};
    try {
      settings = JSON.parse(await readFile(settingsPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`${settingsPath} is not valid JSON or not readable`);
    }
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
      throw new Error(`${settingsPath} does not hold a JSON object`);
    Object.assign(settings, patch);
    const tmp = `${settingsPath}.tmp-${process.pid}-${++settingsWrites}`;
    try {
      await writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
      await rename(tmp, settingsPath);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  });
  settingsQueue = run.catch(() => {});
  return run;
}

async function savePermissionMode(mode) {
  const nextMode = mode === "yolo" ? "yolo" : "permission";
  if (nextMode === "yolo" && effectiveTrust() !== "mechanic")
    throw new Error("YOLO is only available in Mechanic");
  await mergeSettings({ permissionMode: nextMode });
  // A switch to Guide that arrived during the write: take the YOLO back (#106).
  if (nextMode === "yolo" && effectiveTrust() !== "mechanic") {
    await mergeSettings({ permissionMode: "permission" });
    throw new Error("YOLO is only available in Mechanic");
  }
  permissionMode = nextMode;
}

function currentPolicy() {
  return trustPolicy(agentName, effectiveTrust(), permissionMode, aiMirrorCommand);
}

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
  armStall(); // any event is progress (#102)
}

// #102: opencode's process once died mid-turn with no `done`, locking the UI.
// No update of any kind for IDLE (no tool running) or TOOL (one running) ends
// the SESSION: error, then fatal, then exit. The card shows its restart
// button and the companion starts a fresh bridge. A pending card pauses it.
// IDLE is 5 minutes and unmeasured: long enough that a slow model is not cut
// off, short enough to unlock a dead agent. NIXI_TURN_STALL_MS is for tests
// only: it can shorten the limits, never lengthen them, so it cannot switch
// the guard off.
const stallOverride = Number(process.env.NIXI_TURN_STALL_MS);
const stallScale = stallOverride > 0 && stallOverride < 300000 ? stallOverride / 300000 : 1;
const STALL_IDLE_MS = 300000 * stallScale;
const STALL_TOOL_MS = 15 * 60000 * stallScale;
const toolsInProgress = new Set();
let stallTimer = null;
let stalled = false;

function armStall() {
  clearTimeout(stallTimer);
  stallTimer = null;
  if (!turnRunning || stalled || shuttingDown || pendingPermissions.size > 0) return;
  stallTimer = setTimeout(async () => {
    stalled = true;
    refusedThisTurn = ""; // the error says it; no second notice from a cancelled done
    connection?.cancel({ sessionId }).catch(() => {});
    emit({ type: "error", message: "The agent stopped responding, so this turn was ended." });
    try { for (const text of await changes.endTurn()) emit({ type: "notice", text }); } catch {}
    emit({ type: "fatal", message: "The agent stopped responding — start a new conversation." });
    shutdown().finally(() => process.exit(1));
  }, toolsInProgress.size ? STALL_TOOL_MS : STALL_IDLE_MS);
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (content?.type === "text") return content.text || "";
  // Media becomes markdown here, synchronously, so it keeps its place in the
  // stream. The text goes through the LEARNED filter like any other, but it
  // starts at a line break and its first character is "!" or "[", so it can
  // never read as a LEARNED line.
  // Guide never reads a named local file off disk; see blockMarkdown.
  const { markdown, error } = blockMarkdown(content, mediaDir, currentPolicy().permission !== "cancel");
  if (error) emit({ type: "diagnostic", text: `Media skipped: ${error}` });
  return markdown;
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
// #102: opencode ends a turn on any refusal, leaving nothing on screen. Track
// what Guide refused, to explain a turn that ends cancelled after it.
let refusedThisTurn = "";
let userStopped = false; // the stop button, not a refusal, ended the turn

// #90: Mechanic backs up a file before the agent is allowed to write it. The
// agent writes after we answer, so the answer waits for the copy. Shell edits
// arrive as `execute` and are not covered. Edits get no "allow always" (see
// requestPermission): a standing yes would skip this backup on later edits.
const EDIT_KINDS = new Set(["edit", "delete", "move"]);
const stateHome = process.env.XDG_STATE_HOME || join(process.env.HOME || process.cwd(), ".local", "state");
// Remembered approvals (#114): exact commands the user answered "always", per agent and folder.
const always = createAlways(storePath(stateHome));
const changes = createChanges({
  stateDir: join(stateHome, "nixi", "changes"),
  cwd,
  home: process.env.HOME || process.cwd(),
  exec: (args) => new Promise((resolve) =>
    execFile("hyprctl", args, { timeout: 5000 }, (error, stdout) => resolve({ ok: !error, stdout: String(stdout || "") }))),
});

async function guarded(toolCall, outcome, options) {
  // Only an allow* answer is a yes; a reject must not copy anything.
  const picked = options.find((o) => o.id === outcome.outcome.optionId);
  if (!String(picked?.kind || "").startsWith("allow")) return outcome;
  if (effectiveTrust() !== "mechanic" || !EDIT_KINDS.has(toolCall?.kind)) return outcome;
  for (const text of await changes.backup(toolCall)) emit({ type: "notice", text });
  return outcome;
}
let steeringSupported = false;
let shuttingDown = false;
// Settles when the child exits. A spawn error rejects once(); the exit path
// only races this against a timeout, so a failed spawn just ends the wait.
const childExited = once(child, "exit").catch(() => {});

// #74: an MCP server named by a project config file is spawned at session start,
// outside the permission layer, and Nixi cannot stop it. It can notice it.
// claude-agent-acp forwards _meta.claudeCode.mcpServer = { name, source } on a
// permission request (dist/acp-agent.js:5627), where source "sdk" means the host
// registered it -- that is Nixi's own ai-mirror and nothing else. A request from
// any other server is one Nixi never attached, so it is reported.
//
// This is detection, not a control: the request is still handled by the policy
// below, cancelled at Guide like everything else. Its absence is logged once,
// because an adapter bump that drops the field would otherwise go quiet.
let mcpNoticed = false;
let mcpFieldSeen = false;
function noticeMcpSource(params) {
  const tool = params.toolCall?._meta?.claudeCode;
  if (!tool) return;
  if (tool.mcpServer === undefined) {
    if (!mcpFieldSeen && String(tool.toolName || "").startsWith("mcp__")) {
      mcpFieldSeen = true;
      emit({ type: "diagnostic", text: "This adapter does not say which MCP server a tool came from; unregistered servers cannot be noticed." });
    }
    return;
  }
  mcpFieldSeen = true;
  const registered = attachedMcpServers.indexOf(tool.mcpServer.name) >= 0;
  if (tool.mcpServer.source === "sdk" && registered) return;
  if (mcpNoticed) return;
  mcpNoticed = true;
  emit({ type: "diagnostic", text: `A tool arrived from an MCP server Nixi did not attach: ${String(tool.mcpServer.name).slice(0, 60)} (${String(tool.mcpServer.source).slice(0, 20)}). Nixi's permission rules still apply to it.` });
}

const client = {
  sessionUpdate(params) {
    armStall(); // any update is progress, shown or not (#102)
    const update = params.update || {};
    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const text = charts.push(learned.push(messageText(update.content) || ""));
        lastMessageId = update.messageId || lastMessageId;
        if (text) emit({ type: "text", text, messageId: update.messageId || "" });
        break;
      }
      case "tool_call":
      case "tool_call_update":
        if (update.status === "completed" || update.status === "failed") toolsInProgress.delete(update.toolCallId);
        else toolsInProgress.add(update.toolCallId);
        if (update.status === "completed") {
          changes.completed(update.toolCallId).catch((error) =>
            emit({ type: "diagnostic", text: `Could not record the finished edit: ${error.message}` }));
        }
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
    armStall();
    const requestId = `permission-${++permissionSequence}`;
    const title = params.toolCall?.title || params.toolCall?.name || "Use a tool";
    const options = (params.options || []).map((option) => ({
      id: option.optionId,
      label: option.name,
      kind: option.kind,
    })).filter((option) => !(EDIT_KINDS.has(params.toolCall?.kind) && option.kind === "allow_always"))
      // A standing yes to typing into another session would turn one click into all (#95).
      .filter((option) => !(isHerdrWrite(params.toolCall) && option.kind === "allow_always"))
      .filter((option) => !(isChained(params.toolCall) && option.kind === "allow_always"));
    noticeMcpSource(params);
    const policy = currentPolicy();
    // Guide: nothing that asks for permission ever runs, and nothing is shown
    // to approve. This, not the session mode, is Guide's guarantee.
    if (policy.permission === "cancel") {
      refusedThisTurn = title;
      toolsInProgress.delete(params.toolCall?.toolCallId); // refused: it will not run
      if (isHerdrWrite(params.toolCall)) auditSend(params.toolCall, null);
      emit({ type: "status", text: `Guide · not run: ${title}` });
      return Promise.resolve({ outcome: { outcome: "cancelled" } });
    }
    // A herdr write skips YOLO's auto-yes: the click is the only guard (#95).
    const herdrWrite = isHerdrWrite(params.toolCall);
    if (policy.permission === "yolo" && !herdrWrite) {
      const outcome = choose(options, "allow_once");
      if (outcome.outcome.outcome === "selected") emit({ type: "status", text: `YOLO · ${title}` });
      return guarded(params.toolCall, outcome, options);
    }
    return (async () => {
      // #114: after Guide and YOLO, never before. rememberable() rechecks secrets and chaining
      // at match time, and the adapter only ever hears allow_once.
      if (policy.permission === "ask" && rememberable(params.toolCall)) {
        const command = keyOf(params.toolCall);
        let hit = false;
        try { hit = await always.match(agentName, cwd, command); }
        catch (error) { emit({ type: "diagnostic", text: `Remembered approvals: ${error.message}` }); }
        if (hit) {
          always.touch(agentName, cwd, command).catch(() => {});
          emit({ type: "status", text: `Remembered · ${title}` });
          return guarded(params.toolCall, choose(options, "allow_once"), options);
        }
      }
      const { detail, omitted } = permissionDetail(params.toolCall);
      const summary = params.toolCall?.rawInput?.description;  // plain words for the companion's question (S26)
      emit({ type: "permission", id: requestId, title, options, detail, omitted,
        ...(typeof summary === "string" && summary.trim() ? { summary: summary.trim() } : {}),
        ...(herdrWrite ? { confirm: "click" } : {}) });
      return new Promise((resolve) => {
        pendingPermissions.set(requestId, { resolve, options, toolCall: params.toolCall });
        armStall();
      });
    })();
  },
};

// #97: Codex's read-only sandbox reads every file, and codex-acp 2.1.1 rejects
// the permission profile that would fence secrets, so Guide can't be kept.
const CODEX_GUIDE_REFUSAL = "Guide can't keep secrets from Codex — use Claude for Guide, or switch to Mechanic";

let codexRefused = false;

async function start() {
  await loadSettings();
  if (agentName === "codex" && trust === "guide") {
    // No session. Stay up (ready) so the card's switch to Mechanic can reach us;
    // the stdin loop below answers only trust, close and prompt in this state.
    codexRefused = true;
    await killChild(); // the module-load spawn is kept; its exit is expected, not a fatal
    emit({ type: "notice", text: CODEX_GUIDE_REFUSAL });
    emit({ type: "ready", steeringSupported: false, permissionMode, trust });
    return;
  }
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
  // Fixed for the life of the session: ACP has no way to attach or detach a
  // server afterwards. A session started at Guide therefore has no desktop
  // control even if the user switches to Mechanic later -- see the note in the
  // trust handler, which says so rather than leaving it a mystery.
  const session = await connection.newSession({ cwd, mcpServers: currentPolicy().mcpServers,
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
          permissions: claudePermissions(askBeforeReading, trust),
        },
      } } },
    } : {}),
  });
  sessionId = session.sessionId;
  attachedMcpServers = currentPolicy().mcpServers.map((server) => server.name);
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
// After it: the card sees text with each nixi-chart block already drawn.
let charts = createChartFilter("");
let lastMessageId = "";
const learnedDir = process.env.NIXI_DATA || join(process.env.HOME || process.cwd(), ".local", "share", "nixi");
// Images the agent sends, written by the bridge. Pruned once, here at startup.
const mediaDir = join(learnedDir, "images");
try { prepareMediaDir(mediaDir); }
catch (error) { emit({ type: "diagnostic", text: `Media directory unavailable: ${error.message}` }); }

async function finishLearned() {
  const { facts, visible: tail } = learned.flush();
  const visible = charts.push(tail) + charts.flush();
  if (visible) emit({ type: "text", text: visible, messageId: lastMessageId });
  // Guide does not write. LEARNED.md is a write, and one that steers later
  // sessions -- nixi-context reads it as a notes source and grounding.js
  // prepends the result to future prompts. #41 settled that reading is not
  // changing and writing is, which is why Guide keeps unprompted reads; the
  // same distinction says it must not accumulate durable state that alters its
  // own future behaviour behind a promise that nothing changes (#51).
  if (effectiveTrust() === "guide" || facts.length === 0) return;
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
  refusedThisTurn = "";
  userStopped = false;
  stalled = false;
  toolsInProgress.clear();
  emit({ type: "status", text: "Thinking…" });
  try {
    const grounding = await groundPrompt(text);
    // Stop pressed while grounding: connection.cancel had nothing to cancel yet.
    if (userStopped) { emit({ type: "done", stopReason: "cancelled" }); return; }
    if (grounding.error) emit({ type: "diagnostic", text: `nixi-context unavailable: ${grounding.error}` });
    learned = createLearnedFilter();
    charts = createChartFilter(mediaDir);
    const response = await connection.prompt({
      sessionId,
      prompt: [{ type: "text", text: grounding.prompt }],
    });
    if (stalled) return; // the guard has ended the session
    await finishLearned();
    for (const text of await changes.endTurn()) emit({ type: "notice", text });
    if (response.stopReason === "cancelled" && refusedThisTurn && !userStopped)
      emit({ type: "notice", text: `The agent stopped instead of answering — at Guide it can't do what it tried (${refusedThisTurn.slice(0, 80)}). Try Mechanic, or ask differently.` });
    emit({ type: "done", stopReason: response.stopReason || "end_turn" });
  } finally {
    turnRunning = false;
    armStall(); // clears the timer
    // A failed or cancelled turn skips the endTurn above; without this its change
    // set stays open and the next turn's edits join it. A no-op after success.
    for (const text of await changes.endTurn()) emit({ type: "notice", text });
    // A cancelled or failed turn never reaches finishLearned, so anything the
    // chart filter is still holding -- a block whose closing fence never
    // arrived -- would be dropped. flush() is idempotent: on the success path
    // it has already run and returns nothing.
    const held = charts.flush();
    if (held) emit({ type: "text", text: held, messageId: lastMessageId });
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

// One JSON line per decision on a herdr write (#95). Append-only, 0600, and the
// command only: never terminal output.
let sendsLogChecked = false;
function auditSend(toolCall, picked) {
  const detail = herdrWriteDetail(toolCall)
    || { pane: "", text: String(toolCall?.rawInput?.command || "") };
  try {
    const path = join(learnedDir, "sends.log");
    mkdirSync(learnedDir, { recursive: true });
    appendFileSync(path, JSON.stringify({
      ts: new Date().toISOString(), ...detail, text: detail.text.slice(0, 500), cwd,
      // No picked option = cancelled (Guide, shutdown, trust change, an unknown id).
      decision: !picked ? "cancelled" : String(picked.kind).startsWith("allow") ? "allow" : "deny",
      optionKind: picked?.kind || "cancelled",
    }) + "\n", { mode: 0o600 });
    // appendFile's mode only applies to a new file; tighten one that already existed.
    if (!sendsLogChecked) { sendsLogChecked = true; try { chmodSync(path, 0o600); } catch {} }
  } catch (error) {
    emit({ type: "diagnostic", text: `Could not write the send audit: ${error.message}` });
  }
}

function answerPermission(message) {
  const pending = pendingPermissions.get(message.id);
  if (!pending) return;
  pendingPermissions.delete(message.id);
  const picked = pending.options.find((item) => item.id === String(message.optionId || ""));
  // #114: "always" for a plain command is kept by the bridge; the adapter gets allow_once, so no
  // adapter-side rule (Claude's own can be wildcards) ever widens it. Anything else is forwarded as picked.
  if (picked?.kind === "allow_always" && rememberable(pending.toolCall)) {
    const command = keyOf(pending.toolCall);
    always.record(agentName, cwd, command)
      .then(() => emit({ type: "notice", text: `Remembered: ${command} — /always to review` }))
      .catch((error) => emit({ type: "diagnostic", text: `Remembered approvals: ${error.message}` }));
    pending.resolve(guarded(pending.toolCall, choose(pending.options, "allow_once"), pending.options));
  } else {
    pending.resolve(guarded(pending.toolCall, select(pending.options, String(message.optionId || "")), pending.options));
  }
  if (!String(picked?.kind || "").startsWith("allow")) toolsInProgress.delete(pending.toolCall?.toolCallId);
  if (isHerdrWrite(pending.toolCall)) auditSend(pending.toolCall, picked);
  emit({ type: "status", text: String(picked?.kind || "").startsWith("allow") ? "Working…" : "Tool denied" });
}

// /always list | forget <n> | clear, for this agent in this folder (#114). Never adds.
async function alwaysCommand(message) {
  const action = String(message.action || "list");
  try {
    if (action === "forget") {
      if (!(await always.forget(agentName, cwd, Number(message.n)))) emit({ type: "notice", text: `No remembered approval ${message.n}.` });
    } else if (action === "clear") await always.clear(agentName, cwd);
    else if (action !== "list") return emit({ type: "notice", text: `Unknown /always action: ${action}. Use list, forget <n> or clear.` });
    const entries = await always.list(agentName, cwd);
    emit({ type: "notice", text: entries.length
      ? `Remembered for ${agentName} here:\n${entries.map((e) => `${e.n}. ${e.command}`).join("\n")}\n/always forget <n> or /always clear to take one back.`
      : `Nothing remembered for ${agentName} here.` });
    emit({ type: "always_list", entries });
  } catch (error) {
    emit({ type: "diagnostic", text: `Remembered approvals: ${error.message}` });
  }
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
    toolsInProgress.delete(pending.toolCall?.toolCallId);
    if (isHerdrWrite(pending.toolCall)) auditSend(pending.toolCall, null);
    pending.resolve({ outcome: { outcome: "cancelled" } });
  }
}

let sessionModes = null;
let configOptions = [];
// The MCP servers this session was created with. ACP fixes them at newSession,
// so a later trust change cannot add or remove one -- which is exactly why the
// diagnostic below must compare against THIS, not against the current policy.
let attachedMcpServers = [];

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
  if (effectiveTrust() !== "mechanic") return;
  for (const [id, pending] of pendingPermissions.entries()) {
    if (isHerdrWrite(pending.toolCall)) continue; // still needs its own click (#95)
    pendingPermissions.delete(id);
    pending.resolve(guarded(pending.toolCall, choose(pending.options, "allow_once"), pending.options));
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(stallTimer);
  cancelAllPendingPermissions();
  // Bound graceful ACP close before signalling the child. Remain alive long
  // enough to reap it; a detached kill timer cannot help after bridge exit.
  try {
    if (connection && sessionId)
      await Promise.race([connection.closeSession({ sessionId }), delay(350)]);
  } catch {}
  await killChild();
}

// SIGTERM, wait, SIGKILL, wait: the child is gone when this returns.
async function killChild() {
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
  // /always only reads or narrows, so it works at any trust level and with no session (#114).
  if (message.type === "always") return alwaysCommand(message);
  if (codexRefused) {
    if (message.type === "prompt") emit({ type: "error", message: CODEX_GUIDE_REFUSAL });
    else if (message.type === "trust") {
      if (resolveTrust(message.trust) === "guide") return ack("trust", true, { trust: "guide" });
      mergeSettings({ trust: "mechanic" }).then(() => {
        ack("trust", true, { trust: "mechanic" });
        emit({ type: "fatal", message: "Trust set to Mechanic — start a new conversation to use Codex" });
        process.exit(0);
      }).catch((error) => ack("trust", false, { trust: "guide", message: `Could not change trust level: ${error.message}` }));
    } else if (message.type === "close") process.exit(0);
    else if (message.type === "steer") ack("steer", false, { message: CODEX_GUIDE_REFUSAL });
    else if (message.type === "permission_mode")
      ack("permission_mode", false, { mode: permissionMode, message: CODEX_GUIDE_REFUSAL });
    else if (message.type === "undo") emit({ type: "notice", text: "Nothing to undo: no session." });
    return;
  }
  if (message.type === "prompt") {
    prompt(String(message.text || "")).catch((error) => {
      if (stalled) return; // the guard already reported; the closed connection is its doing
      const fatal = needsNewSession(error);
      emit({ type: fatal ? "fatal" : "error", message: explainHarnessError(error, agentName) });
      if (fatal) shutdown().finally(() => process.exit(1));
    });
  } else if (message.type === "steer") {
    steer(String(message.text || "")).catch((error) => {
      ack("steer", false, { message: error.message || String(error) });
    });
  } else if (message.type === "undo") {
    // Undo changes the machine; Guide promises nothing does. Leaving Guide is typed.
    if (turnRunning) emit({ type: "notice", text: "Undo is refused while a turn is running." });
    else if (effectiveTrust() === "guide") emit({ type: "notice", text: "Undo changes your machine: type /mechanic first." });
    else changes.undo().then((result) => emit({ type: "notice", text: result.message }));
  } else if (message.type === "permission") {
    answerPermission(message);
  } else if (message.type === "trust") {
    const next = resolveTrust(message.trust);
    // Apply the ACP mode FIRST, then persist and publish. The old order set
    // `trust` before the mode call, so a failure reported the level the session
    // had NOT moved to (#40). On failure nothing is written and `trust` still
    // holds the level actually in force, which is what the failed ack carries.
    // A switch to Guide is stricter, so it bites on receipt, not on confirmation (#106).
    const leaving = next === "guide";
    if (leaving) {
      leavingMechanic++;
      cancelAllPendingPermissions();
    }
    (async () => {
      if (agentName === "codex" && next === "guide") throw new Error(CODEX_GUIDE_REFUSAL);
      if (connection && sessionId) await applyTrustMode(next);
      await mergeSettings({ trust: next });
      trust = next;
      // Leaving Mechanic must not leave an approval waiting in the card.
      if (trust === "guide") cancelAllPendingPermissions();
      ack("trust", true, { trust });
      // The session's MCP servers were fixed when it was created. Switching up
      // to Mechanic cannot attach ai-mirror to a session that started at Guide,
      // and silently lacking desktop control would read as a broken feature.
      // Rebuilding the session here would instead discard the conversation.
      if (trust === "mechanic" && attachedMcpServers.length === 0
          && currentPolicy().mcpServers.length > 0)
        emit({ type: "diagnostic", text: "Desktop control starts with a new session: this one began at Guide." });
    })().catch((error) => {
      ack("trust", false, { trust, message: `Could not change trust level: ${error.message}` });
    }).finally(() => {
      if (leaving) leavingMechanic--;
    });
  } else if (message.type === "permission_mode") {
    savePermissionMode(message.mode).then(() => {
      if (permissionMode === "yolo") allowAllPendingPermissions();
      ack("permission_mode", true, { mode: permissionMode });
    }).catch((error) => {
      ack("permission_mode", false, { mode: permissionMode, message: `Could not save permission mode: ${error.message}` });
    });
  } else if (message.type === "cancel" && connection && sessionId) {
    userStopped = true;
    connection.cancel({ sessionId }).catch(() => {});
  } else if (message.type === "close") {
    shutdown().finally(() => process.exit(0));
  }
});
input.on("close", () => shutdown());

child.on("exit", (code, signal) => {
  if (!shuttingDown && !codexRefused) {
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
