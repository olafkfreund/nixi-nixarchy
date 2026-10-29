import { test } from "node:test";
import assert from "node:assert/strict";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { runBridge } from "./testing/run-bridge.js";

async function read({ trust, askBeforeReading = false, alias = false }) {
  return runBridge({
    env: { NIXI_AGENT: "opencode" },
    settings: { trust, askBeforeReading },
    files: { "canary.age": "secret canary", "plain.txt": "ordinary text" },
    onPermission: (event) => ({ type: "permission", id: event.id, optionId: "allow" }),
    messages: [async ({ home, send, until }) => {
      const path = join(home, alias ? "alias.txt" : "plain.txt");
      if (alias) symlinkSync(join(home, "canary.age"), path);
      send({ type: "prompt", text: `PLEASE_OCREAD ${path}` });
      await until((event) => event.type === "done", "read turn");
    }],
  });
}

for (const trust of ["guide", "mechanic"]) {
  test(`OpenCode ${trust}: an alias to a secret is rejected without a card`, async () => {
    const run = await read({ trust, alias: true });
    assert.deepEqual(run.agent.find((event) => event.method === "permissionOutcome")?.outcome,
      { outcome: "selected", optionId: "reject" });
    assert.ok(!run.events.some((event) => event.type === "permission"));
    assert.ok(run.events.some((event) => event.type === "status" && event.text === "Read refused: secret path"));
  });

  test(`OpenCode ${trust}: an ordinary file is allowed without a card`, async () => {
    const run = await read({ trust });
    assert.deepEqual(run.agent.find((event) => event.method === "permissionOutcome")?.outcome,
      { outcome: "selected", optionId: "allow" });
    assert.ok(!run.events.some((event) => event.type === "permission"));
  });
}

test("OpenCode Mechanic: askBeforeReading shows a card", async () => {
  const run = await read({ trust: "mechanic", askBeforeReading: true });
  assert.ok(run.events.some((event) => event.type === "permission"));
  assert.deepEqual(run.agent.find((event) => event.method === "permissionOutcome")?.outcome,
    { outcome: "selected", optionId: "allow" });
});
