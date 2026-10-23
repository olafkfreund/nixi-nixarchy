// mergeSettings keeps keys it does not own and never leaves a temp file (#103).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runBridge } from "./testing/run-bridge.js";

test("a trust switch keeps the card's keys, leaves no temp file, writes 0600 (#103)", async () => {
  let dir, mode;
  const run = await runBridge({
    settings: { fontScale: 1.4, permissionMode: "yolo", askBeforeReading: true },
    messages: [{ type: "trust", trust: "mechanic" }, ({ home }) => {
      dir = readdirSync(join(home, ".config", "omarchy"));
      mode = statSync(join(home, ".config", "omarchy", "nixi.json")).mode & 0o777;
    }],
  });
  assert.deepEqual(run.settingsAfter,
    { fontScale: 1.4, permissionMode: "yolo", askBeforeReading: true, trust: "mechanic" });
  assert.deepEqual(dir, ["nixi.json"]);
  assert.equal(mode, 0o600);
});

test("a permission-mode switch and a trust switch sent together both persist (#103)", async () => {
  const run = await runBridge({
    // At Mechanic, so YOLO is allowed whichever message the bridge handles first.
    settings: { fontScale: 1.4, trust: "mechanic" },
    // Written together, without waiting for the first ack, so the two writes overlap.
    messages: [async ({ write, until, events }) => {
      write({ type: "permission_mode", mode: "yolo" });
      write({ type: "trust", trust: "mechanic" });
      await until(() => events.filter((e) => e.type === "ack").length >= 2, "both acks");
    }],
  });
  assert.equal(run.settingsAfter.trust, "mechanic");
  assert.equal(run.settingsAfter.permissionMode, "yolo");
  assert.equal(run.settingsAfter.fontScale, 1.4);
});

test("a trust switch leaves an unparsable nixi.json alone and says so (#103)", async () => {
  let raw;
  const run = await runBridge({
    messages: [({ home }) => {
      mkdirSync(join(home, ".config", "omarchy"), { recursive: true });
      writeFileSync(join(home, ".config", "omarchy", "nixi.json"), '{"fontScale": 1.4,');
    }, { type: "trust", trust: "mechanic" }, ({ home }) => {
      raw = readFileSync(join(home, ".config", "omarchy", "nixi.json"), "utf8");
      writeFileSync(join(home, ".config", "omarchy", "nixi.json"), "{}"); // the harness parses it afterwards
    }],
  });
  assert.equal(raw, '{"fontScale": 1.4,');
  const ack = run.events.find((e) => e.type === "ack" && e.of === "trust");
  assert.equal(ack.ok, false);
});
