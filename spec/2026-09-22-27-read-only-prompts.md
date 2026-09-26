---
status: approved
issue: 27
intent: intent/2026-09-22-27-read-only-prompts.md
---

# Spec: Mechanic stops asking before read-only lookups

## Revision (2026-09-22, after the razer test)

The design below works as specified, but it was aimed at the wrong cause:

- **p620:** the real claude-agent-acp 0.79.0 honours the rules. A Read
  outside the working directory ran without a prompt, and `~/.ssh` still
  asked.
- **razer, through the card, new build, Mechanic:** 4 prompts before any
  edit, **all Bash** (`grep`, `ls`, `tail`, and a recursive `grep` of `/`).
  Claude made no Read, Grep or Glob calls, so the rules never applied.

The flood comes from Claude doing its lookups in the shell, and shell
commands still ask (answer 2). Part of that is Nixi's own doing: the
skill's method tells the agent to run `ls /usr/share/omarchy/bin | grep -i
<topic>`.

**Addition (option A, approved 2026-09-22):** Nixi tells the agent to look
at files with its file tools, not the shell. Everything below still stands;
this adds to it.

- **`skills/nixi/SKILL.md`, Method step 1**, gains a rule: look at files and
  search them with your file-reading and search tools (for Claude: Read,
  Grep, Glob), never with `cat`, `ls`, `grep`, `head`, `tail` or `find` in a
  shell. Keep the shell for commands that only exist as commands, such as
  `omarchy menu keybindings --print`, `hyprctl` or `nixarchy-plugin`, and
  run each on its own, without pipes or `;`. The reason is given in one
  line: in Mechanic every shell command needs the user's yes, and file
  tools don't.
- The `ls /usr/share/omarchy/bin | grep -i <topic>` line becomes "list
  `/usr/share/omarchy/bin` with your file tools (Glob)".
- The rule is worded by kind of tool, not by Claude's tool names, because
  the skill is shared with Codex and OpenCode. OpenCode's read, grep and
  glob tools are already allowed without asking.
- **`share/CLAUDE.md` and `share/AGENTS.md`** (the short version) gain the
  same rule in one sentence.
- **`tools/test_nixi.py`** gains a check: the skill and both briefs state
  the rule, and the skill no longer tells the agent to pipe shell commands
  for lookups.

**Expected result on razer:** "put btop on SUPER+ALT+T" in Mechanic asks
for `omarchy menu keybindings --print` (a command, so it asks by design)
and for the edit. That is about 2 prompts instead of 5 or 6, each for
something the user can read at a glance. The rule depends on the model
following it, so the razer run is the test. If Claude still uses the
shell, stop and come back here.

## Answers to the intent's open questions

1. **Trusting `kind`:** no. The decision is made by Claude Code, from its
   own tool names, through permission rules that Nixi hands it. The bridge
   stays unchanged and still shows every request that reaches it. This is
   the same shape as Nixi's OpenCode rules (`OPENCODE_PERMISSIONS`).
2. **Read-only shell commands** (`grep`, `ls`, `cat` through Bash) still ask.
3. **`fetch`** (WebFetch, WebSearch) still asks.
4. **"Ask for everything":** yes, as a setting (decided 2026-09-22). By
   default reads don't ask. `"askBeforeReading": true` in
   `~/.config/omarchy/nixi.json` brings back today's behaviour.

## Design

### Why Claude asks today

The bridge starts Claude in `~/.config/nixi`, so that directory is the
session's working directory (`cwd` in `bridge/bridge.js`). In `default`
mode, Claude Code reads freely inside its working directory and asks for
anything outside it. Adding a key binding means reading
`~/.config/hypr/…`, so every `Read`, `Grep` and `Glob` there becomes a
`requestPermission`, and the bridge shows each one (`requestPermission`,
`bridge/bridge.js`).

### The change

**`bridge/trust-policy.js`** gains `claudePermissions(askBeforeReading)`.
It returns a Claude settings `permissions` object:

```js
{
  allow: ["Read", "Grep", "Glob"],   // [] when askBeforeReading
  ask: [                              // secrets always ask
    "Read(~/.ssh/**)", "Read(~/.gnupg/**)", "Read(~/.aws/**)",
    "Read(~/.kube/**)", "Read(~/.config/gh/**)", "Read(~/.config/op/**)",
    "Read(~/.config/sops/**)", "Read(~/.local/share/keyrings/**)",
    "Read(~/.claude/.credentials.json)", "Read(~/.netrc)",
    "Read(/run/agenix/**)", "Read(/run/secrets/**)",
    "Read(**/.env)", "Read(**/.env.*)", "Read(**/*.age)",
  ],
}
```

Claude Code checks rules as deny, then ask, then allow, across every
settings source. So a secret path asks even though `Read` is allowed, and
the user's own deny and ask rules in `~/.claude/settings.json` still win.
Claude Code applies `Read(…)` path rules to `Grep` and `Glob` as well.

Only `Read`, `Grep` and `Glob` are allowed. `Bash`, `Edit`, `Write`,
`NotebookEdit`, `WebFetch`, `WebSearch` and MCP tools keep asking, because
none of them is listed.

**`bridge/bridge.js`**:

- `loadSettings()` reads `askBeforeReading` (only `true` counts; anything
  else is false).
- For Claude, `newSession` always sends `_meta.claudeCode.options.settings`
  with `permissions: claudePermissions(askBeforeReading)`, merged with the
  existing model settings. Today `_meta` is only sent when `NIXI_MODEL` is
  set.
- For OpenCode, when `askBeforeReading` is true, `OPENCODE_PERMISSIONS`'s
  `read`, `grep`, `glob` and `list` become `"ask"`. "Ask for everything"
  then means every agent asks.
- Codex is unchanged (see Risks).

The rules are fixed when the session starts. Changing `askBeforeReading`
takes effect the next time the card starts a session. That is documented;
the setting has no live toggle and no slash command.

**Guide** is unchanged by design: every write still asks and is cancelled
by the bridge. See Risks for the one visible difference.

**Docs:** `README.md` and `docs/index.html` drop the "Mechanic also asks
before read-only lookups (#27)" notes. They say instead that Mechanic reads
without asking (except secrets) and asks before anything else, and document
`askBeforeReading` in the README's settings table.

## Alternatives rejected

- **The bridge answers `kind: read`/`search` itself.** Suggested in #27.
  The agent labels its own calls, so a wrong or hostile label would slip a
  write past the card. The bridge also sees only `kind`, not the tool name:
  the adapter puts the name in `_meta` only for subagent and MCP calls. Any
  secret-path check would have to parse each agent's `rawInput`.
- **A `.claude/settings.json` in `~/.config/nixi`, written by Home
  Manager.** It would work only for Home Manager installs. It could not be
  switched off by `askBeforeReading` without a rebuild, and it could be
  edited out of step with the bridge. Passing the rules per session keeps
  one place in charge.
- **A different Claude mode for Mechanic** (`acceptEdits`). It would stop
  asking for edits too, which is the opposite of what Mechanic promises.
- **Allow Bash commands that look read-only** (`Bash(grep:*)`, `Bash(ls:*)`).
  Rejected in the approved answer to Q2: pipes, redirects and `$(…)` make
  "read-only" a guess.

## Risks

- **Guide reads more.** If Guide today cancels reads outside
  `~/.config/nixi` (`Guide · not run: Read …`), then with this change Guide
  reads them. That is still read-only, and it matches Guide's promise to
  explain but never change, and the skill's "verify live" rule. It is still
  a visible change. Measure it on razer before and after, and report it in
  the PR.
- **Secret paths not in the list** (for example a key in a project folder
  under an unusual name) are readable without a prompt in Mechanic. They
  already are inside `~/.config/nixi`, and in Guide's plan mode. People who
  want a prompt for every read set `askBeforeReading`.
- **A future Claude tool that only reads** (not `Read`/`Grep`/`Glob`)
  would keep asking. That is safe; it can be added later.
- **The adapter's settings channel changes.** `_meta.claudeCode.options.settings`
  is what claude-agent-acp 0.79.0 reads (`acp-agent.js`: `...(settings &&
  { settings })`). If a future adapter drops it, Nixi falls back to asking,
  which is safe. The bridge test pins what Nixi sends.
- **Codex:** Mechanic maps Codex to `read-only`, which should not ask for
  reads. It has not been measured. If Codex also floods, that becomes its
  own issue, not a silent part of this one.

## Verification

- `bridge/trust-policy.test.js`: `claudePermissions(false)` allows exactly
  `Read`, `Grep` and `Glob`, and never `Bash`, `Edit`, `Write` or `Web*`.
  `claudePermissions(true)` allows nothing. Both keep every secret `ask`
  rule. The OpenCode rules flip to `ask` when `askBeforeReading` is set.
- A bridge test with `bridge/testing/fake-agent.js`: the `newSession`
  request for Claude carries the permissions, with and without
  `NIXI_MODEL`, and the model settings still arrive.
- `npm test` in `bridge/` and `tools/test_nixi.py` pass.
- On razer, through the card, with Claude in Mechanic:
  1. "put btop on SUPER+ALT+T" raises one prompt, for the edit, not five or
     six.
  2. "show me ~/.ssh/config" raises a prompt.
  3. With `"askBeforeReading": true` and a new session, step 1 prompts for
     reads again.
  4. Guide: the same request changes nothing. Record what it now reads.
  5. *(Revision.)* Step 1's prompts are only commands that have no file-tool
     equivalent (the key list) and the edit: no `grep`, `ls`, `cat` or
     `tail` in a prompt.

The "Guide reads more" risk turned out not to apply: on razer, Guide's plan
mode already reads outside `~/.config/nixi` without asking.
