import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveHarness, resolveExecutable, resolveAdapter } from "./harness-policy.js";

test("system default, explicit override, and missing/unsupported defaults", () => {
  const home = mkdtempSync(join(tmpdir(), "ask-policy-"));
  try {
    const env = { HOME: home };
    assert.throws(() => resolveHarness(env), /No default agent/);
    assert.equal(resolveHarness({ ...env, NIXI_AGENT: "claude" }), "claude");
    mkdirSync(join(home, ".config/omarchy/defaults"), { recursive: true });
    const path = join(home, ".config/omarchy/defaults/agent");
    writeFileSync(path, "codex\n");
    assert.equal(resolveHarness(env), "codex");
    writeFileSync(path, "claude\n");
    assert.equal(resolveHarness(env), "claude");
    assert.equal(resolveHarness({ ...env, NIXI_AGENT: "codex" }), "codex");
    writeFileSync(path, "gemini\n");
    assert.throws(() => resolveHarness(env), /not supported/);
  } finally { rmSync(home, { recursive: true }); }
});

test("PATH and executable overrides, without bundled fallback", () => {
  const bin = mkdtempSync(join(tmpdir(), "ask-path-"));
  try {
    const env = { PATH: bin };
    assert.throws(() => resolveExecutable("codex", env), /system PATH/);
    mkdirSync(join(bin, "codex"));
    assert.throws(() => resolveExecutable("codex", env), /system PATH/);
    const executable = join(bin, "custom-harness");
    writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    assert.equal(resolveExecutable("codex", { ...env, CODEX_PATH: executable }), executable);
    assert.equal(resolveExecutable("codex", { ...env, CODEX_PATH: "custom-harness" }), executable);
    assert.equal(resolveExecutable("claude", { ...env, CLAUDE_CODE_EXECUTABLE: executable }), executable);
    assert.throws(() => resolveExecutable("codex", { ...env, CODEX_PATH: "/nonexistent/ask-test" }), /configured executable/);
  } finally { rmSync(bin, { recursive: true }); }
});

test("startup failures reach the popup as structured fatal events", () => {
  const home = mkdtempSync(join(tmpdir(), "ask-startup-"));
  // Adapters are resolved from PATH before the harness executable, so a case
  // that tests the harness must have an adapter present, or the adapter error
  // fires first and hides the thing under test.
  const adapters = join(home, "adapters");
  mkdirSync(adapters);
  writeFileSync(join(adapters, "codex-acp"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  try {
    for (const [overrides, expected] of [
      [{ NIXI_AGENT: "" }, /No default agent/],
      [{ NIXI_AGENT: "gemini" }, /not supported/],
      [{ NIXI_AGENT: "codex", CODEX_PATH: "/nonexistent/ask-test", PATH: adapters }, /configured executable/],
      [{ NIXI_AGENT: "codex", NIXI_CODEX_ACP_COMMAND: "invalid" }, /JSON array/],
      // No adapter anywhere: the card must say what to install, not surface a
      // bare spawn ENOENT from an adapter nobody told it was missing.
      [{ NIXI_AGENT: "claude", PATH: home }, /claude-agent-acp.*not on the system PATH.*pkgs\.claude-agent-acp/],
    ]) {
      const result = spawnSync(process.execPath, [new URL("bridge.js", import.meta.url).pathname], {
        env: { ...process.env, HOME: home, NIXI_ACP_COMMAND: "", NIXI_CODEX_ACP_COMMAND: "", ...overrides },
        encoding: "utf8", timeout: 10000,
      });
      assert.equal(result.status, 1, result.stderr);
      const event = JSON.parse(result.stdout.trim());
      assert.equal(event.type, "fatal");
      assert.match(event.message, expected);
    }
  } finally { rmSync(home, { recursive: true }); }
});

test("ACP adapters come from the system PATH, never a bundled node_modules copy", () => {
  const bin = mkdtempSync(join(tmpdir(), "nixi-adapter-"));
  try {
    const env = { PATH: bin };
    for (const [agent, name] of [["claude", "claude-agent-acp"], ["codex", "codex-acp"]]) {
      assert.throws(() => resolveAdapter(agent, env), new RegExp(`${name}\\) is not on the system PATH`));
      assert.throws(() => resolveAdapter(agent, env), new RegExp(`pkgs\\.${name}`));
      const adapter = join(bin, name);
      writeFileSync(adapter, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
      const resolved = resolveAdapter(agent, env);
      assert.equal(resolved, adapter);
      assert.doesNotMatch(resolved, /node_modules/);
    }
    // A directory named like the adapter is not an adapter.
    const decoy = mkdtempSync(join(tmpdir(), "nixi-decoy-"));
    try {
      mkdirSync(join(decoy, "codex-acp"));
      assert.throws(() => resolveAdapter("codex", { PATH: decoy }), /not on the system PATH/);
    } finally { rmSync(decoy, { recursive: true }); }
  } finally { rmSync(bin, { recursive: true }); }
});
