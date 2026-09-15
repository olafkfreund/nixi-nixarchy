import { test } from "node:test";
import assert from "node:assert/strict";
import { runBridge } from "./testing/run-bridge.js";

const question = "how do I install an app";

test("the manual excerpt from nixi-context reaches the agent with the question", async () => {
  const { agent, contextArgs } = await runBridge({
    context: "From the notes — Apps: the Install menu queues into apps.nix; nixarchy apply applies it.",
    messages: [{ type: "prompt", text: question }],
  });
  assert.equal(contextArgs, question, "nixi-context was not asked the user's question");
  const sent = agent.find((entry) => entry.method === "prompt");
  assert.ok(sent, "the agent never received a prompt");
  assert.match(sent.text, /how do I install an app/);
  assert.match(sent.text, /nixarchy apply applies it/);
  // The question comes first: the excerpt is context for it, not a new instruction.
  assert.ok(sent.text.indexOf(question) < sent.text.indexOf("nixarchy apply"));
});

test("with no matching excerpt the prompt is sent exactly as typed", async () => {
  const { agent } = await runBridge({ context: "", messages: [{ type: "prompt", text: question }] });
  assert.equal(agent.find((entry) => entry.method === "prompt").text, question);
});

test("a missing nixi-context does not stop the conversation", async () => {
  const { agent, events } = await runBridge({ context: null, messages: [{ type: "prompt", text: question }] });
  assert.equal(agent.find((entry) => entry.method === "prompt").text, question);
  assert.ok(events.some((event) => event.type === "done"), "the turn never finished");
});

test("the agent runs in nixi's config directory, where its CLAUDE.md lives", async () => {
  const { agent, home } = await runBridge({ configDir: true });
  assert.equal(agent.find((entry) => entry.method === "newSession").cwd, `${home}/.config/nixi`);
});

test("without a nixi config directory the agent falls back to HOME", async () => {
  const { agent, home } = await runBridge({});
  assert.equal(agent.find((entry) => entry.method === "newSession").cwd, home);
});
