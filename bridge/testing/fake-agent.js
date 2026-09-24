#!/usr/bin/env node
// A minimal ACP agent for bridge tests. It speaks the real protocol over stdio,
// so a test asserts on what the bridge actually SENT, not on what it meant to.
// Every request is appended as one JSON line to $FAKE_AGENT_LOG.
//
// Lives in bridge/testing/, outside the bridge/*.js the package ships.
import { appendFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

const log = (entry) => appendFileSync(process.env.FAKE_AGENT_LOG, JSON.stringify(entry) + "\n");

// setSessionMode calls so far; FAKE_AGENT_HANG=mode uses it to spare the
// one at session start. See setSessionMode below.
let modeCalls = 0;

new AgentSideConnection((conn) => ({
  async initialize() {
    return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} };
  },
  async newSession(params) {
    log({ method: "newSession", cwd: params.cwd, meta: params._meta ?? null, opencodeConfig: process.env.OPENCODE_CONFIG_CONTENT ?? null });
    // FAKE_AGENT_MODES=config: modes only as a config option, the way OpenCode offers them.
    if (process.env.FAKE_AGENT_MODES === "config") return {
      sessionId: "fake-session",
      configOptions: [{ id: "mode", name: "Session Mode", category: "mode", type: "select", currentValue: "build",
        options: [{ value: "build", name: "build" }, { value: "plan", name: "plan" }] }],
    };
    return {
      sessionId: "fake-session",
      modes: {
        currentModeId: "default",
        availableModes: [
          { id: "default", name: "Manual" },
          { id: "plan", name: "Plan" },
          { id: "read-only", name: "Read only" },
        ],
      },
      // A model option, as Claude's adapter offers one, so NIXI_MODEL can be applied.
      configOptions: [{ id: "model", name: "Model", category: "model", type: "select", currentValue: "default",
        options: [{ value: "default", name: "Default" }] }],
    };
  },
  async setSessionMode(params) {
    log({ method: "setSessionMode", modeId: params.modeId });
    // FAKE_AGENT_HANG=mode: accept the request and never answer, the way a
    // wedged agent does. The bridge must time out rather than wait forever,
    // or the card's trust controls are dead for the conversation (#40).
    // Only from the SECOND call on: the first is the one at session start,
    // which runs before `ready` is emitted, so hanging it would fail the
    // session instead of exercising a later trust change.
    if (process.env.FAKE_AGENT_HANG === "mode" && ++modeCalls > 1) await new Promise(() => {});
    return {};
  },
  async setSessionConfigOption(params) {
    log({ method: "setSessionConfigOption", configId: params.configId, value: params.value });
    return {};
  },
  async authenticate() { return {}; },
  async cancel() {},
  async prompt(params) {
    const text = (params.prompt || []).map((block) => block.text || "").join("");
    log({ method: "prompt", text });
    // A prompt asking for a change triggers a permission request, so tests can
    // observe how the bridge answers it.
    // PLEASE_EDIT carries a diff and PLEASE_RUN a 2 KB command, for the detail.
    const toolCall = text.includes("PLEASE_WRITE") ? { toolCallId: "t1", title: "Write ~/probe", kind: "edit" }
      : text.includes("PLEASE_EDIT") ? { toolCallId: "t2", title: "Edit /tmp/probe", kind: "edit",
        content: [{ type: "diff", path: "/tmp/probe", oldText: "a\n", newText: "b\n" }] }
      : text.includes("PLEASE_RUN") ? { toolCallId: "t3", title: "Run a long command", kind: "execute",
        rawInput: { command: "echo " + "x".repeat(2048 - "echo  && echo TAIL".length) + " && echo TAIL" } }
      : null;
    if (toolCall) {
      const outcome = await conn.requestPermission({
        sessionId: params.sessionId,
        toolCall,
        // FAKE_AGENT_OPTIONS=always: also offer the persistent choices, the way
        // claude-agent-acp and codex-acp both do. Behind a flag so the existing
        // tests' two-option expectations are untouched (#53).
        options: process.env.FAKE_AGENT_OPTIONS === "always" ? [
          { optionId: "allow", name: "Allow", kind: "allow_once" },
          { optionId: "allow-all", name: "Allow always", kind: "allow_always" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
          { optionId: "reject-all", name: "Never allow", kind: "reject_always" },
        ] : [
          { optionId: "allow", name: "Allow", kind: "allow_once" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      });
      log({ method: "permissionOutcome", outcome: outcome.outcome });
    }
    // PLEASE_LEARN: an answer ending in a LEARNED line, split mid-marker.
    const chunks = text.includes("PLEASE_LEARN") ? ["Use nixarchy apply.\nLEAR", "NED: apps queue in apps.nix"] : ["ok"];
    for (const chunk of chunks)
      await conn.sessionUpdate({
        sessionId: params.sessionId,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: chunk } },
      });
    return { stopReason: "end_turn" };
  },
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
