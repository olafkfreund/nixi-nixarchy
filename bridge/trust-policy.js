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

export function resolveTrust(value) {
  return value === "mechanic" ? "mechanic" : "guide";
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

// askBeforeReading (nixi.json) turns OpenCode's reads back into asks: "ask for
// everything" means every agent.
export function opencodePermissions(askBeforeReading) {
  if (!askBeforeReading) return OPENCODE_PERMISSIONS;
  return { permission: { ...OPENCODE_PERMISSIONS.permission,
    read: "ask", grep: "ask", glob: "ask", list: "ask" } };
}

// Claude asks before every Read/Grep/Glob outside its cwd (~/.config/nixi), so
// in Mechanic one edit came after five or six lookup prompts and Allow became a
// reflex (#27). Claude Code itself applies these rules, from its own tool names:
// the bridge never trusts an agent's self-reported ACP `kind`. Only those three
// tools are allowed; Bash, edits, web and MCP tools still ask. Secrets ask even
// in Mechanic: Claude checks deny > ask > allow across all settings sources, so
// these win over the allow, and the user's own ask/deny rules win too.
const CLAUDE_SECRET_READS = [
  "Read(~/.ssh/**)", "Read(~/.gnupg/**)", "Read(~/.aws/**)",
  "Read(~/.kube/**)", "Read(~/.config/gcloud/**)", "Read(~/.azure/**)",
  "Read(~/.docker/config.json)", "Read(~/.config/gh/**)", "Read(~/.config/op/**)",
  "Read(~/.config/sops/**)", "Read(~/.local/share/keyrings/**)",
  "Read(~/.claude/.credentials.json)", "Read(~/.netrc)",
  "Read(/run/agenix/**)", "Read(/run/secrets/**)",
  "Read(**/.env)", "Read(**/.env.*)", "Read(**/*.age)",
];

export function claudePermissions(askBeforeReading) {
  return {
    allow: askBeforeReading ? [] : ["Read", "Grep", "Glob"],
    ask: CLAUDE_SECRET_READS,
  };
}

// permission: "cancel" (never shown), "ask" (queued in the card), "yolo" (auto allow_once)
export function trustPolicy(agent, trust, permissionMode) {
  const level = resolveTrust(trust);
  const modeId = (MODES[agent] || MODES.claude)[level];
  if (level === "guide") return { modeId, permission: "cancel" };
  return { modeId, permission: permissionMode === "yolo" ? "yolo" : "ask" };
}
