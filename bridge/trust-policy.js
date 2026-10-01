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

// Agents whose MCP permission path Nixi has VERIFIED, not assumed. Read from
// claude-agent-acp 0.81.2: ACP `mcpServers` are mapped into the Claude Code
// SDK's own mcpServers option (dist/acp-agent.js:6214), and an `mcp__*` tool
// call arrives at canUseTool (:5552) which ends in requestPermissionFromClient
// (:5657) -- an ordinary ACP session/request_permission. So a server attached
// here is INSIDE the permission layer.
//
// That is not true in general. Issue #74 established that an MCP server named
// by a project config file is spawned at session start, outside the turn
// sandbox, with no permission request at all. Codex and OpenCode are not on
// this list because nobody has proved the attached-server path for them; an
// agent joins it when someone does, not when it seems likely.
export const MCP_CAPABLE_AGENTS = ["claude"];

// permission: "cancel" (never shown), "ask" (queued in the card), "yolo" (auto allow_once)
// mcpServers: what newSession may attach. Empty at Guide -- a desktop the agent
// can drive after a dialog is still a desktop it can drive, and Guide's promise
// is that it cannot act on the machine at all.
export function trustPolicy(agent, trust, permissionMode, aiMirror = null) {
  const level = resolveTrust(trust);
  const modeId = (MODES[agent] || MODES.claude)[level];
  if (level === "guide") return { trust: level, modeId, permission: "cancel", mcpServers: [] };
  const mcpServers = aiMirror && MCP_CAPABLE_AGENTS.includes(agent)
    ? [{ name: "ai-mirror", command: aiMirror[0], args: aiMirror.slice(1), env: [] }]
    : [];
  return { trust: level, modeId, permission: permissionMode === "yolo" ? "yolo" : "ask", mcpServers };
}
