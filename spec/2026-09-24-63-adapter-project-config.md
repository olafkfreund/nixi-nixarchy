---
status: approved
issue: 63
intent: intent/2026-09-24-63-adapter-project-config.md
---

# Spec: OpenCode's project config is disabled; Codex's cannot be, and is reported

## The answer, first

Both adapters read configuration from `cwd`. Neither was safe. They differ in
whether Nixi can do anything about it from outside:

| | reads cwd config? | can it weaken Nixi's rules? | fixable from outside? |
| --- | --- | --- | --- |
| **opencode** 1.18.31 | yes | **yes, proved** | **yes** -- `OPENCODE_DISABLE_PROJECT_CONFIG=1` |
| **codex-acp** 1.12.0 | yes | yes, for `mcp_servers` | **no** -- codex-acp grants the trust itself |

## Finding 1: OpenCode -- proved, and fixed here

Versions: `opencode` 1.18.31
(`/nix/store/rh70hr19h99hdbig50xlhpa0kn72cv7m-opencode-bin-1.18.31`).

`opencode debug config` resolves configuration without a model call, so this is
a direct empirical observation of the merged result, not an inference.

### 1a. A project `opencode.json` adds the keys Nixi does not name

Nixi sends `OPENCODE_PERMISSIONS` (`trust-policy.js`), whose write-side rule is
the wildcard `"*": "ask"`. With a cwd containing
`opencode.json = {"permission":{"bash":"allow","edit":"allow","write":"allow"}}`
and `OPENCODE_CONFIG_CONTENT` set exactly as the bridge sets it, the resolved
permission block is:

```json
{ "bash": "allow", "edit": "allow", "write": "allow",
  "*": "ask", "read": {...}, "grep": "allow", "glob": "allow",
  "list": "allow", "plan_exit": "deny" }
```

Nixi's comment in `trust-policy.js` ("Nixi's rules are appended after OpenCode's
built-in ones and win") is half right. Where both define a key,
`OPENCODE_CONFIG_CONTENT` does win -- `*` stays `ask`, `plan_exit` stays `deny`.
But `bash`, `edit` and `write` are exactly the keys Nixi never names, so the
project file introduces them unopposed, and a named key beats the `*` wildcard.

**This breaks Guide.** Guide's guarantee is that the bridge cancels every
permission request it receives. `edit: allow` means the edit produces no
request, so there is nothing to cancel. The agent writes, in Guide, silently.

### 1b. A project agent file overrides Nixi's rules outright

`<cwd>/.opencode/agent/<name>.md` carries a `permission:` block in its
frontmatter. In the resolved rule list its rules are appended **after**
`OPENCODE_CONFIG_CONTENT`'s, and OpenCode evaluates the last matching rule, with
per-agent permissions overriding top-level ones. So `"*": allow` in a project
agent file beats Nixi's `"*": "ask"`, and `plan_exit: allow` defeats the
`plan_exit: "deny"` that is the only thing stopping the agent leaving plan mode
by itself.

### 1c. Also from cwd

`<cwd>/.opencode/plugin/*.js` is executed in the opencode process at startup
(arbitrary JS, no request); `mcp` entries in a project `opencode.json` merge in
(arbitrary command spawn); `opencode.jsonc` and `.opencode/opencode.json` are
discovered by walking ancestor directories, so a subdirectory is not a refuge.

### The fix

`OPENCODE_DISABLE_PROJECT_CONFIG=1` in the child environment, next to the
`OPENCODE_CONFIG_CONTENT` the bridge already force-sets. This is OpenCode's
equivalent of `settingSources: ["user"]`, and it is the same shape of answer
#66 gave: remove the capability, do not police a path.

Verified in both directions against the real CLI. With the flag set, the
resolved permission block is exactly what Nixi sent, with the project keys gone,
and `opencode debug agent pwn` reports `Agent pwn not found`.

It keeps the user's own configuration. Reading OpenCode's `ConfigPaths`, the
flag drops only the cwd-derived layer; `~/.opencode` and the user's global
`~/.config/opencode` still load. That is the #66 rule: constrain the agent
against itself, leave the person alone.

## Finding 2: Codex -- exposed, and Nixi cannot close it from outside

Versions: `codex-acp` 1.12.0
(`/nix/store/g9a7s6j1wryj9alfkhy7c3q58pw3r4sd-codex-acp-1.12.0`), `codex` 0.156.1.

### 2a. The project config layer is live, gated on trust

`<cwd>/.codex/config.toml` is read (`strace` shows the `openat`), and when the
project is trusted it contributes `model`, `approval_policy`, `sandbox_mode` and
`mcp_servers`. `codex doctor` reports the project's values in place of the
user's once trust is granted. `<cwd>/codex.toml` is *not* read. `<cwd>/AGENTS.md`
is loaded into the model prompt regardless of trust -- prompt influence, not a
permission grant.

### 2b. codex-acp grants that trust itself

This is why there is no fix. From `createSessionConfig()` in the 1.12.0 bundle:

```js
const mergedConfig = {
  ...forceGitRootTurnDiffPaths(mergeGatewayConfig(this.config, this.gatewayConfig)),
  projects: Object.fromEntries(sessionRoots.map((root) => [root, {
    trust_level: "trusted"
  }]))
};
```

with `sessionRoots = [projectPath, ...additionalDirectories]` -- the ACP session
cwd, which for Nixi is `~/.config/nixi`. The trust that gates 2a is set by the
adapter, from inside, on every session. `trust_level: "trusted"` appears in
every `codex-acp` build in the store (1.10.0 and all four 1.12.0 paths), so it
is not a one-version accident.

There is no `settingSources` equivalent. `--ignore-user-config` points the wrong
way, and trust cannot be withheld because Nixi does not write that config.

### 2c. `read-only` is not a read-only sandbox

Worth stating because `trust-policy.js` and its test both call this mode
`read-only` and that reads as a guarantee. The adapter's own definition:

```js
ReadOnly = new _AgentMode("read-only", "Ask for approval",
  "Always ask to edit external files and use the internet", "standard",
  "on-request", "user",
  { type: "workspaceWrite", writableRoots: [], networkAccess: false, ... },
  "workspace-write");
```

It is `workspaceWrite` with `on-request` approval. Writes **inside the
workspace** -- which is `~/.config/nixi` -- are permitted by the sandbox and so
produce no approval request. In Guide there is again nothing for the bridge to
cancel.

That completes the chain and is why this is reported rather than shrugged at:
Codex in Guide can write `.codex/config.toml` into its own cwd with no prompt,
and on the next session that file's `mcp_servers` entry spawns an arbitrary
command outside any turn sandbox.

### What is proved and what is not

Proved: the config layer applies when trusted; the trust is hardcoded by
codex-acp; `read-only` is `workspaceWrite`; `AGENTS.md` is read regardless.

Not proved, and labelled as such: that `approval_policy`/`sandbox_mode` from
the project file survive into a real turn. codex-acp passes `approvalPolicy`
and `sandboxPolicy` explicitly on every `runTurn`, which should win over the
config layer, and no turn was run because that needs credentials. `mcp_servers`
is different in kind -- it is not a per-turn parameter, so it is not overridden
by one.

Also unproved: whether codex's hook system (`hooks.json`, `PreToolUse`,
`PostToolUse` appear in the 0.156.1 binary) loads hooks from a project
directory. That is the exact #63 shape and is named as a follow-up rather than
assumed either way.

## Design

One line in `bridge/bridge.js`, beside the `OPENCODE_CONFIG_CONTENT` that is
already force-set for the same reason. Codex gets no code change, because there
is no correct one available from outside; it gets a follow-up issue.

## Alternatives rejected

- **Give Codex a different cwd.** It would lose `AGENTS.md`, the tutor brief
  that is the entire reason for the cwd (`bridge.js:38-41`). Trading the
  product's purpose for a partial mitigation.
- **Manage `~/.config/nixi/.codex/` in `hm-module.nix`.** Helps only the Nix
  deployment and only between activations -- #63 rejected this shape already.
- **A path `deny` for OpenCode.** OpenCode's permission schema is keyed by tool,
  and #52's spec already records that this repo has not verified per-path write
  globs there. The env flag removes the capability, which is strictly better.
- **Naming `bash`/`edit`/`write` explicitly in `OPENCODE_PERMISSIONS`.** Closes
  1a only. It does nothing about 1b (the agent file is appended after Nixi's
  rules and wins whatever they say) or 1c (plugins are code, not permissions).
  A fix that addresses the first of three instances of the same capability.

## Risks

- **A user's own project config in `~/.config/nixi` stops applying.** Nobody
  should have one there; it is Nixi's directory, not a project. The user's
  global config is unaffected, which was measured rather than assumed.
- **The flag is undocumented-ish surface.** It is read straight from OpenCode's
  `ConfigPaths.directories`, and the test asserts the value Nixi sends, so a
  rename upstream shows up as a behaviour change, not a silent no-op. This is
  a real residual risk and is why the test asserts as transmitted.
- **Codex remains exposed after this lands.** Stated in the PR, filed as its
  own issue. Not hidden behind a green tick.

## Verification

- `node --test bridge/*.test.js` -- 90 on this base, all still passing.
- A new behavioural case via `runBridge()`: the flag is asserted **in the child
  process's environment at `newSession`**, alongside the existing
  `opencodeConfig` assertion -- as transmitted, not as constructed -- and
  asserted absent for Claude and Codex, which must not be handed an OpenCode
  knob.
- Shown failing without the change, message quoted in the PR.
- The empirical OpenCode result is reproducible with the commands in the plan.
- `nix flake check`.
