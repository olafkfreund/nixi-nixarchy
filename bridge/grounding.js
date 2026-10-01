// Grounds a question in the local nixarchy + Omarchy manual before it reaches
// the agent. nixi-context prints the best-matching manual excerpt, or nothing;
// the excerpt is appended as context so most questions are answered without the
// agent spending tool calls searching for it.
//
// Grounding is an optimisation, not a dependency: a missing, slow or failing
// nixi-context leaves the question exactly as typed, and the agent still has
// nixi's CLAUDE.md from its working directory.
import { execFile } from "node:child_process";
import { parseCommand } from "./harness-policy.js";

const CONTEXT_LIMIT = 1800;   // a tool row with its rules (≤900) and a manual excerpt (≤700)
const TIMEOUT_MS = 3000;

function contextCommand(env) {
  return parseCommand(String(env.NIXI_CONTEXT_COMMAND || "")) || ["nixi-context"];
}

export function groundPrompt(text, env = process.env) {
  const [program, ...args] = contextCommand(env);
  return new Promise((resolve) => {
    execFile(program, [...args, text], { timeout: TIMEOUT_MS, env, maxBuffer: 1 << 20 }, (error, stdout) => {
      const context = error ? "" : String(stdout || "").trim();
      if (!context) return resolve({ prompt: text, error: error ? String(error.code || error.message) : null });
      resolve({
        // Background, not a script. "Answer directly from this" (nixi-server's
        // old wording) made a troubleshooting excerpt outrank the method's
        // "prefer nixarchy's own tools", and let a key be stated unchecked (#31).
        prompt: text + "\n\n(Local context for this question — background from the manual and "
          + "Nixi's notes, not the whole answer. Follow your method: when a nixarchy tool below "
          + "fits, lead with it after checking it is on; state a key only after checking it "
          + "with `omarchy menu keybindings --print`.\n" + context.slice(0, CONTEXT_LIMIT) + ")",
        error: null,
      });
    });
  });
}
