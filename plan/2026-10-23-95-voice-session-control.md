---
status: approved
issue: 95
spec: spec/2026-10-23-95-voice-session-control.md
---

# Plan: Ask about, and add to, running agent sessions by voice

## Approved decisions (from the spec, so this file stands alone)

- **Repos and branches:**
  - nixi `feat/95-voice-session-control`, from `master`. Worktree:
    `/mnt/code/Source-home/GitHub/nixi-nixarchy-95`.
  - The companion fork `olafkfreund/nixoarchy-snowflake`, branch
    `feat/95-voice-session-control`, made from `feat/94-snowflake-companion` because it builds
    on #94's bridge mode. Worktree: `/mnt/code/Source-home/GitHub/nixoarchy-snowflake-95`.
- **The rule:** the companion may *read* herdr locally (`agent list`, `agent read`, nothing
  else). It never *writes* to a session. Every send goes through nixi's bridge and its permission
  card.
- **Slice 0:** anchor `SECRET_PATHS` `**/.env`, `**/.env.*` and `**/*.age` absolutely as well
  (`//**/…`), with a test.
- **Slice 1, status (Guide-safe):**
  - Session resolution: match the spoken name against `cwd` basename, `terminal_title_stripped`
    and agent name. Exactly one match proceeds; several get a question; none gets "can't find".
  - The read: `herdr agent read <pane> --source recent --lines 40 --format text`, argv
    allowlisted, `timeout=3`, capped at 4 KB, secret-looking lines dropped.
  - It is sent to nixi's agent as untrusted data between markers, asking for a 1–3 sentence
    spoken summary.
- **Slice 2, show me (Guide-safe):** `setsid uwsm-app -- xdg-terminal-exec herdr --session <S>
  agent attach <pane>`, never `--takeover`. Closing the window leaves the session running
  (proven live first).
- **Slice 3, send (Mechanic, Claude only):**
  - nixi's agent runs Bash `herdr agent prompt <pane> "<text>"`.
  - In the bridge, a "herdr write" is any command segment starting `herdr [--session S] agent
    prompt|send-keys` or `herdr … pane send-text|send-keys`. For those: Guide cancels; Mechanic
    always shows the card, even in YOLO, with `allow_always` stripped; the permission event
    carries `confirm: "click"`; one audit JSON line per decision goes to
    `~/.local/share/nixi/sends.log` (0600).
  - The companion disables voice yes for `confirm: "click"` cards.
- **Slice 4 (desktop control)** is not in this plan. It gets its own spec and plan later.

## Who does what

One `coder` agent for this task, named "herdr", given one step at a time through SendMessage.
The lead reviews and commits every step. Codex and agy review with `second-opinion` after P2.4.
An Opus reviewer gets this plan and both diffs at the end.

## Steps

**P0. Setup (lead).** Create the fork worktree `nixoarchy-snowflake-95` on a new branch from
`feat/94-snowflake-companion`. Verify with `git log -1` in both worktrees.

**P1. Secret paths anchored** (nixi `bridge/trust-policy.js:92-100`,
`bridge/trust-policy.test.js`)
- Add `"//**/.env"`, `"//**/.env.*"` and `"//**/*.age"` to `SECRET_PATHS`. Keep the relative
  entries.
- Test: `claudePermissions(false).ask` contains `Read(//**/*.age)`, `Grep(//**/.env)` and
  `Glob(//**/.env.*)`.
- Verify: `node --test bridge/` is all green. Live, with the companion and Mechanic: a canary
  `~/nixi-s9-canary.age` is no longer read without a card. Use #94's
  `scratchpad/s9.py` check, with the events route as POST.
- Traps: Claude's syntax treats `//` as absolute and `**/x` as relative to the session directory
  (`~/.config/nixi`); the relative forms stay for project-local files. opencode's permissions
  (`OPENCODE_PERMISSIONS`) take the same path list, so check its format accepts `//`. If not,
  map the entries for opencode.

**P1 result (2026-10-23, live):** the rule strings are right, but the gap stays open. At Guide
the agent read the `~/…age` canary with **Bash** (`ls -la … && head -c 200 … | od -c`), which
Claude auto-allows as a read-only command even in plan mode, so it never reaches the bridge's
cancel. `SECRET_PATHS` only covers Read/Grep/Glob. A `~/.config/op` canary was refused by the
model's own judgement, not by nixi's rules. Read-only Bash bypassing the secret rules at Guide
is a nixi trust-model issue. It is to be raised with the user as its own issue, not widened into
#95 unasked.

**P2. herdr-write detection** (new nixi `bridge/herdr-policy.js` + `bridge/herdr-policy.test.js`)
- `isHerdrWrite(toolCall)`: take the command from `toolCall.rawInput.command` (the same field
  `permission-detail.js` reads), split it on `;`, `&&`, `||`, `|` and newlines, and return true
  if any segment matches
  `^\s*(?:\S*/)?herdr\s+(?:--session\s+\S+\s+)?(?:agent\s+(?:prompt|send-keys)|pane\s+(?:send-text|send-keys))\b`.
- Tests:
  - true for: plain, with `--session`, `/nix/store/…/herdr`, chained after `cd x &&`.
  - false for: `herdr agent read`, `herdr agent list`, `echo herdr agent prompt` (not at the
    start of a segment), and non-Bash tools.
- Verify: `node --test bridge/herdr-policy.test.js`.
- Traps: no shell parsing beyond splitting. A quoted `;` inside the prompt text can only add a
  false positive, never hide a write, and false positives fail safe (an extra card).

**P3. Bridge enforcement and audit** (nixi `bridge/bridge.js` `requestPermission` ~322-348,
new test in `bridge/trust-policy.test.js` or `bridge/herdr-bridge.test.js` using
`testing/run-bridge.js`)
- If `isHerdrWrite(params.toolCall)`: filter out `allow_always`; skip the YOLO auto-select and
  queue the card; add `confirm: "click"` to the emitted `permission` event. Guide's cancel stays
  first and unchanged.
- In `answerPermission`, for a herdr write, append `{ts, pane, cwd, text, decision, optionKind}`
  to `~/.local/share/nixi/sends.log`. Create it 0600, and append only. Take pane and text by
  re-parsing the command. If parsing fails, log the whole command, capped at 500 chars.
- Tests through the fake agent (read `testing/fake-agent.js` for how to make it request
  permission for a given Bash command; add an env flag if needed):
  - Guide → cancelled, no card.
  - Mechanic → a card with `confirm: "click"` and no `allow_always`.
  - YOLO → still a card.
  - A yes appends one audit line.
- Verify: `node --test bridge/`, unchanged count + new tests, all green.
- Traps: don't touch `EDIT_KINDS` behaviour for other tools. The audit line never includes
  terminal output.

**P4. Docs (nixi)** (`docs/architecture.md`, `README.md`)
- Architecture: the "companion reads herdr, never writes" exception; herdr-write handling in the
  bridge; `sends.log`.
- README: a short "Agent sessions by voice" section.
- Verify: the review reads them.

**P5. Session status in the companion** (fork `app/server.py`, `app/quick.py`, new
`tests/test_sessions.py`)
- `quick.py`: phrases "how is (the) X session (doing|going)", "status of (the) X (session)" →
  `{"session_status": "X"}`; "show me (the) X session" → `{"session_show": "X"}`; "tell (the) X
  session: TEXT" / "on X: TEXT" → `{"session_send": ["X", "TEXT"]}`.
- `server.py`:
  - `herdr_agents()` runs `["herdr","agent","list"]` (timeout 3) and parses `result.agents`.
    Bad JSON or a non-zero exit gives `[]` and a spoken "I can't read herdr right now".
  - `resolve_session(name, agents)` returns one, several or none, as specified.
  - `herdr_read(pane)` validates the pane with `[A-Za-z0-9:_.-]{1,64}` and runs only
    `["herdr","agent","read",pane,"--source","recent","--lines","40","--format","text"]`.
  - `redact(text)` drops lines matching secret patterns and caps the result at 4 KB.
  - `status_prompt(agent, text)` builds the marked prompt from the spec.
  - The `session_status` result runs `run_bridge(status_prompt(...))` like a normal ask.
- Tests: resolution (one, several, none); argv (allowlist, bad pane rejected); redaction; cap;
  the prompt has markers and the warning line.
- Verify: `python3 -m unittest tests.test_sessions -v`. Live: "how is the Factory session
  doing?" summarises `w1A:p1` correctly.
- Traps: herdr needs `HERDR_SOCKET_PATH`/`--session` when there are several herdr sessions.
  Use the agent's own `HERDR_SESSION` from `agent list` if present, otherwise the default.
  Never pass the raw spoken name to herdr: only a resolved pane id.

**P6. "Show me"** (fork `app/server.py`)
- `session_show` resolves, then runs
  `Popen(["setsid","uwsm-app","--","xdg-terminal-exec","herdr",*session_args,"agent","attach",pane], start_new_session=True)`,
  falling back to `xdg-terminal-exec` alone if `uwsm-app` is missing. Nixi says "Opening the
  Factory session."
- Verify, live:
  - the window opens on that pane;
  - typing works;
  - closing the window leaves `herdr agent list` showing the agent with the same pane and
    status;
  - the herdr UI is not disturbed.
  If closing does disturb it, stop and report; don't ship P6.
- Traps: no `--takeover`.

**P7. Send through nixi** (fork `app/server.py`, `app/static/index.html`)
- `session_send` resolves (one match required), then sends `run_bridge` a prompt asking nixi's
  agent to run exactly `herdr agent prompt <pane> <shell-quoted text>` and nothing else, plus a
  one-line reason.
- The companion reads back "I'll ask to send '<text>' to <title> — check the card", and the
  card comes from the bridge (P3).
- `ask_bridge`/the page: when the permission event has `confirm: "click"`, voice answers are
  ignored, and the hint says "click to confirm sends".
- When the agent isn't Claude, Nixi answers "sending to sessions works with Claude as nixi's
  agent for now".
- Verify, live in Mechanic: "tell the Factory session: say hello" shows the card with the exact
  command; a voice "yes" does nothing; a click delivers the text to `w1A:p1`; `sends.log` has a
  line.
- Traps: shell-quote the text with `shlex.quote`. The agent may still rephrase the command, so
  the card shows what will really run, and that is what gets approved.

**P8. No writes from the companion** (fork `tests/test_no_herdr_writes.py`)
- A test greps `app/` and `bin/` for `agent prompt`, `send-keys`, `send-text` and
  `pane send`, and fails on any hit outside comments and the prompt text that asks nixi's agent.
- Verify: `python3 -m unittest tests.test_no_herdr_writes`.

**P9. Review (lead)**
- `second-opinion`: Codex `review --base master` on nixi, `--base feat/94-snowflake-companion`
  on the fork; agy in plan mode on both diffs.
- A fresh Opus reviewer with this plan and both diffs.
- The lead fixes confirmed findings and records changes of plan here.

## Tests

| Command | Expected |
|---|---|
| `node --test bridge/` (nixi) | all pass (existing 163 + new) |
| `python3 tools/test_nixi.py` (nixi) | pass |
| `python3 -m unittest tests.test_sessions tests.test_no_herdr_writes tests.test_bridge -v` (fork; `NIXI_SRC` set) | all pass |
| `nix flake check` (both) | pass |
| Live: status / show me / send against `w1A:p1` | as in P5–P7 |

## Rollback

- nixi: revert the merge. P1 keeps value on its own (it can stay even if P2–P4 go). Removing P3
  only returns herdr commands to ordinary Mechanic Bash handling.
- Fork: revert the #95 merge. #94 behaviour is unaffected, and quick phrases fall back to normal
  asks.
- Data: `~/.local/share/nixi/sends.log` can be deleted.
