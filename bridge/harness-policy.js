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
  if (!agent) return "claude";
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
export function resolveAdapter(agent, env = process.env) {
  if (agent === "opencode") return [resolveExecutable(agent, env), "acp"];
  const name = agent === "codex" ? "codex-acp" : "claude-agent-acp";
  const found = firstExecutable(onPath(name, env));
  if (found) return [found];
  const variable = agent === "codex" ? "NIXI_CODEX_ACP_COMMAND" : "NIXI_CLAUDE_ACP_COMMAND";
  throw new Error(`${agent === "codex" ? "Codex" : "Claude Code"}'s ACP adapter (${name}) is not on the system PATH. On NixOS add pkgs.${name} to your configuration, or point ${variable} at it.`);
}
