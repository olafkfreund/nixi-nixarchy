---
status: approved
issue: 96
intent: intent/2026-10-23-96-guide-shell-secret-reads.md
---

# Spec: Secret files stay protected from shell commands too

## What was measured (2026-10-23, Claude via claude-agent-acp, nixi's real bridge, through the companion)

| Rule added to `claudePermissions().ask` | At Guide, asked to read a file with the shell | Result |
|---|---|---|
| none (today) | `head ~/nixi-p1-canary.age` | **ran with no request**: Claude auto-allows read-only shell commands even in plan mode |
| `Bash(*nixi-p1-canary*)` | `ls -la ~/nixi-p1-canary.age && head …` | became a permission request, which **Guide cancelled** |
| `Bash` (bare) | `cat /etc/hostname` | became a request, which **Guide cancelled** ("Guide · not run"); the agent then used the Read tool for that non-secret file |

The `~/.config/op/` canary was also cancelled through the existing `Read(~/.config/op/**)` ask
rule. **An ask rule beats Claude's auto-approval of read-only commands.** That is the lever.

Constraint found while measuring: the rules go to Claude **once, at `newSession`**, in
`_meta.claudeCode.options.settings.permissions` (`bridge/bridge.js` ~371-388). A mid-session
switch between Guide and Mechanic changes the bridge's handling (cancel or card) but not the
rules Claude holds.

## Design

### 1. Rules depend on the level the session starts at (`bridge/trust-policy.js`)

`claudePermissions(askBeforeReading, trust)` takes the trust level the session starts at:

- **A session that starts at Guide:** `ask` adds **`Bash`**, every shell command. Each one becomes
  a request, which Guide cancels, so Guide has no shell. If the user switches to Mechanic later in
  that session, every shell command shows a card. That is noisier but safe, and lasts only until
  the next conversation.
- **A session that starts at Mechanic:** `ask` adds **Bash patterns for the secret paths**
  (below). A shell command that mentions one shows a card. Other read-only commands behave as
  today. If the user switches to Guide mid-session, secret-path commands are asked and therefore
  cancelled. Other read-only, non-secret shell commands can still auto-run until the next
  conversation. This residual is documented. It reads no secret, and Guide's
  "cannot change the machine" holds because writes are still requests and are cancelled.
- `deny: EXEC_WRITES` and the Read/Grep/Glob `SECRET_READS` are unchanged.

### 2. Bash secret patterns (generated from `SECRET_PATHS`)

`SECRET_BASH` maps each entry to wildcard Bash rules that match the path anywhere in the command
text:

- `~/X/**` and `~/X` → `Bash(*~/X*)`, `Bash(*$HOME/X*)`, `Bash(*${HOME}/X*)`,
  `Bash(*<home>/X*)`. `<home>` is the real home directory, passed in, so absolute
  `/home/u/.ssh` is caught.
- `/run/agenix/**` and similar → `Bash(*/run/agenix*)`.
- `**/.env`, `**/.env.*` → `Bash(*.env*)`. `**/*.age` → `Bash(*.age*)`.
- The `//**/…` entries from #95 P1 map to the same Bash forms. Duplicates are removed.

This is best effort for Mechanic, and the docs say so. A command can build a path the patterns
don't see (`cd ~; cat .s""sh/id_*`). Guide doesn't rely on it: a Guide-started session asks
for every command.

### 3. Tutor brief (`share/CLAUDE.md`, `skills/nixi/SKILL.md`)

One line: at Guide there is no shell, so answer from the local manual, `KNOWLEDGE.md` and the
file tools. Live checks like `omarchy menu keybindings --print` are only for Mechanic. Without
this, the brief sends the agent into cancelled commands.

### 4. Codex and opencode: measure, record, fix only if shown

- **codex-acp at Guide** runs in Codex's read-only sandbox, which permits file reads. Measure the
  canary read through the companion with Codex as nixi's agent. If it reads a `SECRET_PATHS`
  file, file a follow-up issue (Codex has no per-path read rule in nixi today); don't widen #96.
- **opencode** has its own `OPENCODE_PERMISSIONS` (`read` rules, no `.age`). Measure the same way
  and record the result.
- The architecture doc states the per-agent guarantee as measured.

### 5. Docs

- `docs/architecture.md` "Nixi: grounding, trust…": the measured table above; that rules are
  fixed per session; the per-start-level rule sets; the Mechanic best-effort note; the mid-session
  residual.
- README "Trust": Guide has no shell (in conversations that start at Guide), and a shell command
  that names a secret path asks first at Mechanic.

## Alternatives rejected

- **Ask for every shell command at both levels:** airtight, but every `ls` at Mechanic shows a
  card. The user chose patterns for Mechanic (intent Q3).
- **Deny Bash at Guide:** the same effect as ask+cancel at Guide, but a session that later
  switches to Mechanic would have no shell at all until restarted. Ask degrades to cards
  instead.
- **Restart the ACP session on a trust switch so the rules always match the level:** it throws
  away the conversation (it breaks the one-session invariant and the user's context).
- **A PreToolUse hook that calls the bridge:** hooks from the agent's directory are excluded
  (#63), and a flag-settings hook adds a second enforcement path to keep in sync. Rules are
  measured to work.
- **Relying on the model refusing:** it did refuse once (the `op` canary). That isn't a
  guarantee.

## Risks

- **Noisier Mechanic after a Guide start:** accepted, it lasts one conversation. The card says
  why: the detail shows the command.
- **Patterns miss obfuscated paths at Mechanic:** documented as best effort. Guide-started
  sessions are airtight.
- **The Claude CLI may change its auto-allow or wildcard semantics.** The live canary check is
  part of verification and is re-run on adapter bumps (a note in `docs/model-verification.md`).
- **`*.env*` and `*.age*` patterns cause false-positive cards** (`cat environment.yml` doesn't
  match `.env`, but `vim .envrc` does). Accepted at Mechanic: it costs an extra card, not safety.
- **Hosts:** every nixi user. The change narrows behaviour and opens nothing.

## Verification

- **Unit (`bridge/trust-policy.test.js`):**
  - Guide start → `ask` contains `Bash`.
  - Mechanic start → `ask` contains the generated secret Bash patterns (`Bash(*~/.ssh*)`,
    `Bash(*<home>/.ssh*)`, `Bash(*.age*)`, `Bash(*.env*)`, …) and not bare `Bash`.
  - Both keep `SECRET_READS` and `deny`.
  - The size floor is bumped.
- **Bridge (`bridge/bridge.js`):** a test that `newSession` receives the start-level-dependent
  permissions (fake agent logs `_meta`).
- **Live, through the companion with Claude** (the `canary.py` method):
  1. Guide start: a shell read of `~/x.age` is cancelled. A shell read of `/etc/hostname` is
     cancelled too.
  2. Mechanic start: a shell read of `~/x.age` shows a card. `ls ~/.config/hypr` runs without one.
  3. Mechanic → Guide in one session: a shell read of `~/x.age` is cancelled.
- **Live, Codex and opencode:** measured and recorded (section 4).
- **Throughout:** `node --test bridge/` and `python3 tools/test_nixi.py` stay green.
