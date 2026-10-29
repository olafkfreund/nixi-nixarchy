// What Nixi lets the agent do, per trust level.
//
// Guide is the default and must stay safe: the agent may explain, never CHANGE
// the machine. Neither adapter offers a mode that guarantees that by itself --
// asked over ACP, Claude describes `plan` as "Create a plan before making
// changes" and Codex's closest, `read-only`, as "Always ask to edit external
// files and use the internet". So Guide's guarantee is the bridge CANCELLING
// every permission request it receives, with the session mode as a second layer.
//
// "Every request it receives" is exact, and the difference matters (#41).
// Reading is not changing, and Guide deliberately allows it: a tutor that
// cannot look at your configuration cannot teach you about it. Read, Grep and
// Glob are granted below in BOTH trust levels, and Claude Code applies that
// allowlist itself -- so those three never reach ACP as a permission request,
// and there is nothing for the bridge to cancel. Everything that writes,
// executes, or reaches the network still produces a request, and in Guide every
// one of those is cancelled.
//
// Secrets ask in both levels, for all three read tools. That is the one part of
// the read allowance that is not open: see SECRET_PATHS.
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
// built-in ones and win: everything asks except reading, and the agent may not
// leave plan mode itself. `*` also covers MCP and plugin tools from the user's
// opencode.json. Verified on p620 (plan step 17b).
//
// #102: opencode 2.0.32 ends the whole turn on any refusal, and its own
// external_directory check asks for every read outside the project, so Guide
// could not read /etc/hostname. external_directory is allowed; `read` is
// allowed except SECRET_PATHS, which are config denies (a deny is enforced by
// opencode itself, no card). Measured: grep/glob apply no path denies, so
// grep/glob/list ask for every path instead of silently reaching ~/.ssh.
//
// opencode matches a path relative to its project root when the file is inside
// it (the cwd falls back to $HOME), as well as absolute ones, so the patterns
// are anchor-free: `*.ssh/*` matches `.ssh/k` and `/home/u/.ssh/k`, and `*.ssh`
// the directory itself, which its read tool lists. Over-matching is fine for a deny.
export function opencodePathDenies(paths) {
  const denies = [];
  for (const path of paths) {
    if (path.startsWith("//")) continue; // Claude's absolute spelling; these cover it already
    const dir = path.endsWith("/**");
    const base = dir ? path.slice(0, -3) : path;
    const free = base.startsWith("~/") ? `*${base.slice(2)}` : base.startsWith("**/") ? `*${base.slice(3).replace(/^\*/, "")}` : base;
    denies.push(...(dir ? [`${free}/*`, free] : [free]));
  }
  return denies;
}

export const opencodeSecretDenies = () => opencodePathDenies(SECRET_PATHS);

function opencodeRules(readDefault) {
  const read = { "*": readDefault };
  for (const pattern of opencodeSecretDenies()) read[pattern] = "deny";
  return { permission: {
    "*": "ask",
    external_directory: "allow",
    read,
    edit: {
      "*": "ask",
      ...Object.fromEntries(opencodePathDenies(EXEC_WRITE_PATHS).map((p) => [p, "deny"])),
      "*nixi/always.json": "deny", "*nixi/always.json.*": "deny",  // remembered approvals (#114)
    },
    grep: "ask",
    glob: "ask",
    list: "ask",
    lsp: "allow",
    todowrite: "allow",
    question: "allow",
    plan_exit: "deny",
  } };
}

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

// askBeforeReading (nixi.json) turns OpenCode's reads back into asks: "ask for
// everything" means every agent. The secret denies stay.
export function opencodePermissions(askBeforeReading) {
  return opencodeRules(askBeforeReading ? "ask" : "allow");
}

// Claude asks before every Read/Grep/Glob outside its cwd (~/.config/nixi), so
// in Mechanic one edit came after five or six lookup prompts and Allow became a
// reflex (#27). Claude Code itself applies these rules, from its own tool names:
// the bridge never trusts an agent's self-reported ACP `kind`. Only those three
// tools are allowed; Bash, edits, web and MCP tools still ask. Secrets ask even
// in Mechanic: Claude checks deny > ask > allow across all settings sources, so
// these win over the allow, and the user's own ask/deny rules win too.
//
// Paths, not rules: the rules are generated over every tool the allow grants.
// Claude matches a rule per TOOL NAME, so a list of Read(...) patterns left
// Grep and Glob -- two of the three allowed read tools -- free to reach the
// same paths with no prompt (#41). Keeping one path list is what makes a path
// added later cover all three automatically, which is the property whose
// absence caused that.
export const SECRET_PATHS = [
  "~/.ssh/**", "~/.gnupg/**", "~/.aws/**",
  "~/.kube/**", "~/.config/gcloud/**", "~/.azure/**",
  "~/.docker/config.json", "~/.config/gh/**", "~/.config/op/**",
  "~/.config/sops/**", "~/.local/share/keyrings/**",
  "~/.claude/.credentials.json", "~/.netrc",
  "/run/agenix/**", "/run/secrets/**",
  // The symlink targets of the two above on NixOS; Read/opencode match the literal path (#102).
  "/run/agenix.d/**", "/run/secrets.d/**",
  "**/.env", "**/.env.*", "**/*.age",
  // `**/x` is relative to the session directory; `//` is absolute (#95). Without
  // these a canary ~/foo.age was read with no card. OpenCode has its own list.
  "//**/.env", "//**/.env.*", "//**/*.age",
];

// Writes that will later run with nobody present (#52).
//
// `ask` would be a no-op here: Mechanic is Claude's `default` mode, where every
// Write/Edit already prompts -- the test below asserts it. SECRET_PATHS above
// works because it claws paths back out of a standing allow; there is no write
// allow to claw back from. Only `deny` moves.
//
// The line is NOT "deny what executes". That would ban ~/.config/hypr/**, which
// is the README's flagship Mechanic demo and which SKILL.md tells the agent to
// edit -- it would deny the product's purpose. The line is WHO PULLS THE
// TRIGGER. A keybinding runs when the user presses the key and a menu row when
// the user picks it: a person is present, so those keep asking. A menu `when:`
// guard runs on the next reload, a post-boot.d hook at boot, a PreToolUse hook
// on the agent's next tool call. Nobody pulled anything. Those are denied.
//
// ~/.claude/** is here and ~/.config/nixi/.claude/** is not, which looks
// backwards until you read #66: settingSources ["user"] already stops the cwd's
// project settings loading at all, so denying that path would police a
// capability that is gone -- but "user" is precisely the scope still loaded.
//
// ~/.local/bin is narrow where ~/.config/systemd/user is broad: every file in
// the latter is a unit, unattended by definition, while a file in the former
// only runs unattended if a unit names it. The pair holds together -- writing a
// unit to reach some other binary is itself denied. Loosening either alone
// opens both.
export const EXEC_WRITE_PATHS = [
  "~/.claude/settings.json",         // the agent's own permission rules (user scope)
  "~/.claude/settings.local.json",
  "~/.claude/hooks/**",              // PreToolUse: a shell command, no prompt
  "~/.config/opencode/**",          // OpenCode's own permission config, loaded (#116)
  "~/.config/omarchy/hooks/**",      // post-boot.d runs at every boot
  "~/.config/omarchy/extensions/**", // #52 as filed: `when:` guards are bash
  "~/.config/omarchy/plugins/**",    // bridge scripts spawn on card load
  "~/.config/systemd/user/**",       // units and drop-ins
  "~/.local/bin/nixi-*",             // the binaries those units run at login
  // Remembered approvals (#114): a write would grant standing yeses. `//**` (absolute, #95) also
  // covers a non-default XDG_STATE_HOME; a bare `**/` would only match under the session dir.
  "~/.local/state/nixi/always.json",
  "//**/nixi/always.json",
  // ...and its lock and temp files: a planted lock would stall every remembered request.
  "~/.local/state/nixi/always.json.*",
  "//**/nixi/always.json.*",
];

export const OPENCODE_PERMISSIONS = opencodeRules("allow");

const READ_TOOLS = ["Read", "Grep", "Glob"];
const SECRET_READS = READ_TOOLS.flatMap((tool) => SECRET_PATHS.map((path) => `${tool}(${path})`));

// Generated over the tool names for the reason #41 records: Claude matches a
// rule per TOOL NAME, so a hand-written Write(...) list would leave Edit free to
// reach the same paths. MultiEdit and NotebookEdit are named because naming a
// tool that does not exist costs nothing, and omitting one that does is the bug.
const WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];
const EXEC_WRITES = WRITE_TOOLS.flatMap((tool) => EXEC_WRITE_PATHS.map((path) => `${tool}(${path})`));

// Bash patterns from SECRET_PATHS, for sessions that start at Mechanic (#96).
// Mechanic (Claude's default mode) already asks for shell commands; these matter
// because an `ask` rule beats the user's own allow rules and an earlier "always
// allow" (deny > ask > allow), so a secret-path command still shows a card.
// One pattern per path, without `~/`, so `~/`, `$HOME/`, absolute, `~user/` and
// `../../` spellings all match. Best effort: a shell can build a path any way.
export function secretBashRules() {
  const rules = new Set();
  for (const path of SECRET_PATHS) {
    const p = path.replace(/\/\*\*$/, "");
    if (p.startsWith("~/")) rules.add(p.slice(2));
    else if (p.includes("**/")) rules.add(p.split("/").pop().replace(/^\*|\.\*$/g, ""));
    else rules.add(p);
  }
  return [...rules].map((r) => `Bash(*${r}*)`);
}

// Rules are fixed per session, so they follow the level it STARTS at (#96). At
// Guide a bare `Bash` ask makes every shell command a request, which Guide
// cancels: otherwise `head ~/x.age` ran with no request at all. An unknown trust
// is Guide.
export function claudePermissions(askBeforeReading, trust = "guide") {
  return {
    allow: askBeforeReading ? [] : READ_TOOLS,
    // ask beats the user's own allow rules (Bash(env:*), Bash(python3:*) ...), which
    // would otherwise let Claude run a herdr write without ever asking the bridge, so
    // the bridge's click-only card (#95) could not be skipped by a standing allow.
    ask: [...SECRET_READS, "Bash(*herdr*)", "Bash(*HERDR_SOCKET*)",
      ...(resolveTrust(trust) === "guide" ? ["Bash"] : secretBashRules())],
    deny: EXEC_WRITES,
  };
}

// permission: "cancel" (never shown), "ask" (queued in the card), "yolo" (auto allow_once)
// mcpServers: what newSession may attach. Empty at Guide -- a desktop the agent
// can drive after a dialog is still a desktop it can drive, and Guide's promise
// is that it cannot act on the machine at all.
export function trustPolicy(agent, trust, permissionMode, aiMirror = null) {
  const level = resolveTrust(trust);
  const modeId = (MODES[agent] || MODES.claude)[level];
  if (level === "guide") return { modeId, permission: "cancel", mcpServers: [] };
  const mcpServers = aiMirror && MCP_CAPABLE_AGENTS.includes(agent)
    ? [{ name: "ai-mirror", command: aiMirror[0], args: aiMirror.slice(1), env: [] }]
    : [];
  return { modeId, permission: permissionMode === "yolo" ? "yolo" : "ask", mcpServers };
}
