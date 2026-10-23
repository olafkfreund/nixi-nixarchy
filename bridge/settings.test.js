// mergeSettings keeps keys it does not own and never leaves a temp file (#103).
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
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

test("a trust switch then a permission-mode switch both persist (#103)", async () => {
  const run = await runBridge({
    settings: { fontScale: 1.4 },
    messages: [{ type: "trust", trust: "mechanic" }, { type: "permission_mode", mode: "yolo" }],
  });
  assert.equal(run.settingsAfter.trust, "mechanic");
  assert.equal(run.settingsAfter.permissionMode, "yolo");
  assert.equal(run.settingsAfter.fontScale, 1.4);
});
