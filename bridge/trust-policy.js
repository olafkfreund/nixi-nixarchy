// What Nixi lets the agent do, per trust level.
//
// Guide is the default and must stay safe: the agent may explain, never change
// the machine. Neither adapter offers a mode that guarantees that by itself --
// asked over ACP, Claude describes `plan` as "Create a plan before making
// changes" and Codex's closest, `read-only`, as "Always ask to edit external
// files and use the internet". So Guide's guarantee is the bridge CANCELLING
// every permission request, with the session mode as a second layer.
//
// Mechanic asks before each change: every request is shown in the card and
// needs an explicit yes. YOLO (auto-approve) is upstream's and is only honoured
// from Mechanic; it can never be reached from Guide.

export const TRUST_LEVELS = ["guide", "mechanic"];

export function resolveTrust(value) {
  return TRUST_LEVELS.includes(value) ? value : "guide";
}

const MODES = {
  claude: { guide: "plan", mechanic: "default" },
  codex: { guide: "read-only", mechanic: "read-only" },
  opencode: { guide: "plan", mechanic: "build" },
};

// OpenCode's own defaults resolve every tool to "allow": a write runs without
// any permission request, so Guide's cancel would have nothing to cancel, and
// its plan mode still allows bash. Nixi's rules are appended after OpenCode's
// built-in ones and win: everything asks except reading and searching, and the
// agent may not leave plan mode itself. `*` also covers MCP and plugin tools
// from the user's opencode.json. Verified on p620 (plan step 17b).
export const OPENCODE_PERMISSIONS = {
  permission: {
    "*": "ask",
    read: { "*": "allow", "*.env": "ask", "*.env.*": "ask" },
    grep: "allow",
    glob: "allow",
    list: "allow",
    lsp: "allow",
    todowrite: "allow",
    question: "allow",
    plan_exit: "deny",
  },
};

// permission: "cancel" (never shown), "ask" (queued in the card), "yolo" (auto allow_once)
export function trustPolicy(agent, trust, permissionMode) {
  const level = resolveTrust(trust);
  const modeId = (MODES[agent] || MODES.claude)[level];
  if (level === "guide") return { trust: level, modeId, permission: "cancel" };
  return { trust: level, modeId, permission: permissionMode === "yolo" ? "yolo" : "ask" };
}
