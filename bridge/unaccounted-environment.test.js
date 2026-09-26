import { test } from "node:test";
import assert from "node:assert/strict";
import { runBridge } from "./testing/run-bridge.js";

// #74: codex loads <cwd>/.codex/config.toml as a project config layer when the
// directory is trusted in the user's own ~/.codex/config.toml, and an
// mcp_servers entry there runs at session start, outside any permission
// request. Nixi chose that directory and never writes .codex into it, so its
// presence is always either a mistake or someone else's doing.

const diagnostics = (events) =>
  events.filter((event) => event.type === "diagnostic").map((event) => event.text).join("\n");

test("an unexpected .codex directory in the working directory is reported", async () => {
  const { events } = await runBridge({ context: "notes", configDir: true, codexProjectDir: true });
  const text = diagnostics(events);
  assert.match(text, /\.codex/, "the bridge said nothing about a planted .codex directory");
  assert.match(text, /never creates one/, "the notice does not say Nixi never creates it");
});

// The other direction matters as much: a check that fires unconditionally
// passes the test above while crying wolf on every ordinary session.
test("an ordinary working directory produces no .codex notice", async () => {
  const { events } = await runBridge({ context: "notes", configDir: true });
  assert.doesNotMatch(diagnostics(events), /\.codex/,
    "the bridge reported a .codex directory that was never created");
});

test("path variables set in the environment are reported, and silent when unset", async () => {
  const withVars = await runBridge({
    context: "notes", configDir: true,
    env: { NIXI_DATA: "/tmp/nixi-test-data" },
  });
  assert.match(diagnostics(withVars.events), /NIXI_DATA is set in the environment/,
    "NIXI_DATA was set and the bridge did not say so");

  // runBridge sets NIXI_CWD for nothing, so a plain run must stay quiet about
  // it -- otherwise the notice is noise on every session.
  const plain = await runBridge({ context: "notes", configDir: true });
  assert.doesNotMatch(diagnostics(plain.events), /NIXI_DATA is set/,
    "NIXI_DATA was reported when it was never set");
});
