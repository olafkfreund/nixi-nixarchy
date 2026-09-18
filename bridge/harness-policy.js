import { readFileSync, accessSync, statSync, constants } from "node:fs";
import { join } from "node:path";

export const AGENTS = ["claude", "codex", "opencode"];

export function agentLabel(agent) {
  return { claude: "Claude Code", codex: "Codex", opencode: "OpenCode" }[agent] || agent;
}

export function resolveHarness(env = process.env) {
  let agent = String(env.NIXI_AGENT || "").trim();
  if (!agent) {
    try { agent = readFileSync(join(env.HOME, ".config/omarchy/defaults/agent"), "utf8").trim(); }
    catch (error) {
      if (error.code !== "ENOENT") throw new Error("Nixi could not read Omarchy’s default agent. Check its file permissions.");
    }
  }
  // Claude Code is Nixi's default agent: a fresh desktop with no Omarchy
  // default agent gets a working card rather than an error (nixarchy#709).
  //
  // But "claude" only keeps that promise where claude's adapter is installed,
  // and it is not always. nixarchy pins adapters through `services.nixi.agents`,
  // whose upstream default carries claude only when `allowUnfree` is set -- so a
  // machine that says no to unfree, or one that pins opencode and codex
  // deliberately (nixarchy#731, where claude-agent-acp and the unfree
  // claude-code are 651 MiB of a public 5 GB cache for two packages that are
  // fetched rather than built), lands on the one agent it cannot start. The
  // fallback that exists to prevent an error produces one.
  //
  // So fall back to an agent that can actually be STARTED, claude first, which
  // leaves every machine that has claude's adapter behaving exactly as before.
  // An agent somebody explicitly chose is still honoured below and still fails
  // loudly if its adapter is missing: an explicit choice deserves an explicit
  // error, and silently starting a different agent than the one asked for would
  // be worse than saying so.
  if (!agent) {
    const startable = AGENTS.find((candidate) => adapterAvailable(candidate, env));
    if (startable) return startable;
    throw new Error(`No ACP adapter is installed for any agent Nixi supports. Install one of ${AGENTS.map(agentLabel).join(", ")} and its adapter (claude-agent-acp, codex-acp, or opencode, which needs none), or choose an agent in Nixi (Super+,).`);
  }
  if (!AGENTS.includes(agent))
    throw new Error(`Omarchy’s selected agent (${agent}) is not supported by Nixi yet. Choose Claude, Codex or OpenCode in Nixi (Super+,).`);
  return agent;
}

export function resolveExecutable(agent, env = process.env) {
  const override = env[{ codex: "CODEX_PATH", opencode: "OPENCODE_PATH" }[agent] || "CLAUDE_CODE_EXECUTABLE"];
  const executable = override || agent;
  const found = firstExecutable(executable.includes("/") ? [executable] : onPath(executable, env));
  if (found) return found;
  throw new Error(`${agentLabel(agent)} could not be launched: ${override ? "the configured executable is missing or not executable" : "it is not on the system PATH"}. Repair the system installation or choose another harness in Nixi (Super+,).`);
}

function onPath(name, env) {
  return (env.PATH || "").split(":").filter(Boolean).map(directory => join(directory, name));
}

function firstExecutable(candidates) {
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

// Nixi does not bundle the ACP adapters. Upstream's npm copies bring
// @anthropic-ai/claude-agent-sdk and its platform binaries, which are not
// open-source licensed, into node_modules; building those into a Nix package
// would ship them past Nix's license check. The adapters come from the user's
// own system instead (nixpkgs' claude-agent-acp and codex-acp), resolved the
// same way the harness itself is, so a missing one fails at startup with a
// message that says what to install -- not as a bare spawn ENOENT.
//
// OpenCode needs no adapter: it speaks ACP itself as `opencode acp`.
// Can this agent be started at all? Not "is its adapter on PATH": bridge.js
// also accepts NIXI_CLAUDE_ACP_COMMAND / NIXI_CODEX_ACP_COMMAND /
// NIXI_OPENCODE_COMMAND (and NIXI_ACP_COMMAND for any of them), and
// nix/package.nix sets exactly those for the agents a build pins. A probe that
// only looked at PATH would call a pinned agent unavailable and fall past a
// harness that works. Kept beside resolveAdapter so the two stay in step; the
// variable names are also read in bridge.js's configuredAgentCommand.
function adapterAvailable(agent, env = process.env) {
  const override = { codex: "NIXI_CODEX_ACP_COMMAND", opencode: "NIXI_OPENCODE_COMMAND" }[agent]
    || "NIXI_CLAUDE_ACP_COMMAND";
  if (String(env[override] || env.NIXI_ACP_COMMAND || "").trim()) return true;
  try { resolveAdapter(agent, env); return true; }
  catch { return false; }
}

export function resolveAdapter(agent, env = process.env) {
  if (agent === "opencode") return [resolveExecutable(agent, env), "acp"];
  const name = agent === "codex" ? "codex-acp" : "claude-agent-acp";
  const found = firstExecutable(onPath(name, env));
  if (found) return [found];
  const variable = agent === "codex" ? "NIXI_CODEX_ACP_COMMAND" : "NIXI_CLAUDE_ACP_COMMAND";
  // Two routes, nixarchy's first: this fork ships on nixarchy machines, where
  // `services.nixi.agents` is what pins an adapter and merges with the list
  // nixarchy already sets. `pkgs.<name>` works anywhere and stays for a plain
  // NixOS machine. Naming only the second sent nixarchy users around the
  // mechanism built for them (nixarchy#741).
  //
  // Claude's route carries a prerequisite the message has to state, or it
  // hands the user a configuration that cannot build: claude-agent-acp
  // references the unfree claude-code, so it THROWS where allowUnfree is off.
  // Measured with `env -u NIXPKGS_ALLOW_UNFREE`, because the variable in an
  // interactive shell answers for the config otherwise: claude-agent-acp
  // throws, codex-acp evaluates. So the clause is Claude's alone -- putting it
  // on both would be a warning Codex users cannot act on.
  const unfree = agent === "claude" ? " It needs unfree allowed, which nixarchy sets by default." : "";
  throw new Error(`${agent === "codex" ? "Codex" : "Claude Code"}'s ACP adapter (${name}) is not on the system PATH. On nixarchy add services.nixi.agents = [ "${agent}" ] to your Home Manager configuration; on plain NixOS add pkgs.${name}.${unfree} Either way: rebuild, then run omarchy-restart-shell -- a rebuild alone does not reach a shell that is already running. Or point ${variable} at an adapter you already have.`);
}
