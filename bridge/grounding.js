// Grounds a question in the local nixarchy + Omarchy manual before it reaches
// the agent. nixi-context prints the best-matching manual excerpt, or nothing;
// the excerpt is appended as context so most questions are answered without the
// agent spending tool calls searching for it.
//
// Grounding is an optimisation, not a dependency: a missing, slow or failing
// nixi-context leaves the question exactly as typed, and the agent still has
// nixi's CLAUDE.md from its working directory.
import { execFile } from "node:child_process";

const CONTEXT_LIMIT = 1200;
const TIMEOUT_MS = 3000;

function contextCommand(env) {
  const raw = String(env.NIXI_CONTEXT_COMMAND || "").trim();
  if (!raw) return ["nixi-context"];
  try {
    const command = JSON.parse(raw);
    if (Array.isArray(command) && command.length && command.every((part) => typeof part === "string" && part))
      return command;
  } catch {}
  return ["nixi-context"];
}

export function groundPrompt(text, env = process.env) {
  const [program, ...args] = contextCommand(env);
  return new Promise((resolve) => {
    execFile(program, [...args, text], { timeout: TIMEOUT_MS, env, maxBuffer: 1 << 20 }, (error, stdout) => {
      const context = error ? "" : String(stdout || "").trim();
      if (!context) return resolve({ prompt: text, grounded: false, error: error ? String(error.code || error.message) : null });
      resolve({
        // Same wording nixi-server used, which the agent already answers well.
        prompt: text + "\n\n(Local search context — answer directly from this when it suffices, "
          + "verify live only if it doesn't:\n" + context.slice(0, CONTEXT_LIMIT) + ")",
        grounded: true,
        error: null,
      });
    });
  });
}
