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

new AgentSideConnection((conn) => ({
  async initialize() {
    return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} };
  },
  async newSession(params) {
    log({ method: "newSession", cwd: params.cwd, opencodeConfig: process.env.OPENCODE_CONFIG_CONTENT ?? null });
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
      configOptions: [],
    };
  },
  async setSessionMode(params) {
    log({ method: "setSessionMode", modeId: params.modeId });
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
    if (text.includes("PLEASE_WRITE")) {
      const outcome = await conn.requestPermission({
        sessionId: params.sessionId,
        toolCall: { toolCallId: "t1", title: "Write ~/probe", kind: "edit" },
        options: [
          { optionId: "allow", name: "Allow", kind: "allow_once" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      });
      log({ method: "permissionOutcome", outcome: outcome.outcome });
    }
    await conn.sessionUpdate({
      sessionId: params.sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } },
    });
    return { stopReason: "end_turn" };
  },
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
