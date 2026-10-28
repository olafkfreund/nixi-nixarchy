---
status: approved
issue: 114
spec: spec/2026-10-28-114-remember-always.md
---

# Plan: an "always" stays answered

## Approved decisions (from the spec, so this file stands alone)

- **Why "always" never sticks.** claude-agent-acp turns `allow_always` into rules in
  `<cwd>/.claude/settings.local.json` (`~/.config/nixi/.claude/`). nixi never loads that file
  (`settingSources: ["user"]`, #63/#66), so each "always" lasts one session. Codex and OpenCode
  persistence: unverified.
- **The bridge owns remembered answers. Adapters are never told "always".** The user picks the
  `allow_always` option → the bridge records the entry and answers the adapter with its
  **`allow_once`** option.
- **Only shell commands** (`kind: "execute"`) that are offered `allow_always` today:
  - not chained (S26);
  - not a herdr write (#95);
  - not an edit, delete or move (#90);
  - not matching `secretBashRules()` (#96).

  Fetch and MCP tools keep today's behaviour: `allow_always` is forwarded, and nixi doesn't
  remember them.
- **The key is exact:** `agent` + bridge `cwd` + the full command string. An argv array is joined
  as `permissionDetail` shows it (`shellQuote`). Only leading and trailing whitespace is trimmed.
  No prefix, glob or first word.
- **Answer order in `requestPermission`:** Guide cancels → YOLO → **remembered** → card. A
  remembered match answers `allow_once` itself, with no card, emits `status: "Remembered ·
  <title>"`, and updates `lastUsed`. The secret check is re-run at match time.
- **Store:** `$XDG_STATE_HOME/nixi/always.json` (default `~/.local/state/nixi/always.json`),
  mode `0600`, `{ "version": 1, "entries": [{ agent, cwd, command, added, lastUsed }] }`. #103
  write rules:
  - re-read + merge + atomic tmp/rename, serialized;
  - never overwrite an unreadable file or a non-object: leave it, emit a diagnostic, remember
    nothing.

  The store path is denied to agent writes, like `EXEC_WRITE_PATHS`.
- **Scope** per agent + per cwd. **Lifetime** until revoked, with no expiry.
- **Managed through:** `/always`, `/always forget <n>` and `/always clear` in the card (they work
  at Guide too), plus a Remembered list with remove buttons in the card's agent panel.
- **Voice** can never add an entry ("always" is click-only, S18). The companion shows only the
  `Remembered` status it already receives as a `status` event, so **no fork change**.
- **Existing `settings.local.json`:** left alone, and the README says it can be deleted. No
  migration.
- **Accepted residual (the user decided):** an exact command can run a script whose content
  changes later. Also, a one-off approved shell command could write the store.

## Steps

**1. Deny agent writes to the store** — `bridge/trust-policy.js:159-178` (`EXEC_WRITE_PATHS`,
`EXEC_WRITES`) and `:201-209` (`claudePermissions`). *Session model.*
- Add `~/.local/state/nixi/always.json` to `EXEC_WRITE_PATHS`, with a comment: a write would grant
  standing permissions.
- If `XDG_STATE_HOME` is set to another directory, `claudePermissions` also denies Write/Edit on
  the resolved store path. Pass it in as a new argument from `bridge.js`, where the path is
  resolved (`:314`).
- `opencodePermissions` (`:99`) doesn't use `EXEC_WRITE_PATHS`. Add an `edit` deny for the store
  path there.
- Verify: `node --test bridge/trust-policy.test.js`, plus a new assertion that both agents' rules
  deny the store.
- Traps:
  - Codex can't be fenced (#97). That is a documented residual: at Mechanic, Codex asks before
    each edit.
  - Don't reorder the existing denies.
- Deviation (implemented): one anchor-free pattern, `**/nixi/always.json` (Claude) and
  `*nixi/always.json` (OpenCode `edit`), covers any `XDG_STATE_HOME`, so `claudePermissions`
  gets no new argument. The OpenCode env test now expects `edit: {"*": "ask", store: "deny"}`.
- Opus review fix: the bare `**/nixi/always.json` was wrong. Claude reads `**/` relative to the
  session directory (#95), so it never matched `~/.local/state`. It is now
  `~/.local/state/nixi/always.json` plus `//**/nixi/always.json` (absolute, any XDG_STATE_HOME).

**2. The store module** — a new `bridge/always.js`, with its tests in `bridge/always.test.js`.
*Session model.*
- `storePath(stateHome)`, plus these functions:
  - `rememberable(toolCall)`: `kind === "execute"`, the command is a string or array, not chained
    (export S26's `isChained` from `bridge.js`, or move `CHAINED` here and import it into
    `bridge.js`), not `isHerdrWrite`, and not matching any `secretBashRules()` substring (the
    rules are `Bash(*x*)`, so it tests `includes(x)`);
  - `keyOf(toolCall)`: the trimmed string, or the argv joined with `permission-detail.js`'s
    `shellQuote`, exported for this;
  - `load()`;
  - `match(agent, cwd, command)`;
  - `record(...)`, `touch(...)`, `forget(agent, cwd, n)`, `clear(agent, cwd)`, `list(agent, cwd)`.
- Writes follow `mergeSettings` (`bridge.js:109-130`):
  - one promise chain;
  - re-read before merging;
  - `writeFile(tmp, …, { mode: 0o600 })` then `rename`;
  - `mkdir -p` the directory;
  - on a read error other than ENOENT, or a non-object, or a `version` other than 1: throw, and
    write nothing.
- Verify: `node --test bridge/always.test.js`.
- Traps:
  - Never normalise beyond trimming the ends.
  - `forget` and `clear` only remove. They never add.

**3. Answer from the store, and record on "always"** — `bridge/bridge.js` `requestPermission`
(`:401-440`) and `answerPermission` (`:626-634`). *Session model.*
- In `requestPermission`, after the YOLO branch (`:426-430`) and before
  `permissionDetail` (`:431`): if `policy.permission` is the ask mode and the request is
  `rememberable` and `match()` finds an entry, then:
  - `touch()`;
  - emit `status: "Remembered · <title>"`;
  - `return guarded(toolCall, choose(options, "allow_once"), options)`.
- In `answerPermission`: if the picked option's kind is `allow_always` and the request is
  `rememberable`, then:
  - `record()` (on error, emit a diagnostic and still continue);
  - emit notice "Remembered: <command> — /always to review";
  - resolve with `choose(pending.options, "allow_once")` instead of the picked option.
- A non-rememberable `allow_always` (fetch, MCP) is forwarded unchanged, as today.
- Verify: `node --test bridge/*.test.js` (all 204 existing tests, plus step 6's new ones).
- Traps:
  - **Guide first.** The `policy.permission === "cancel"` branch (`:417`) must stay above the
    lookup.
  - YOLO is untouched.
  - The herdr write's `confirm: "click"` path is never remembered.
  - `guarded()` keeps the #90 edit backup path. It's unreachable for `execute`, but keep the call
    shape.

**4. `/always` in the bridge** — `bridge/bridge.js`, in the stdin message handlers (the no-session
branch `:768-777` and the session branch `:780-800`). *Session model.*
- `message.type === "always"` with `action`:
  - `list` → emit `{ type: "always_list", entries: [{ n, command, added, lastUsed }] }` for this
    agent and cwd, plus a readable `notice`;
  - `forget` with `n` → remove, then emit the list;
  - `clear` → remove all, then emit the list.
- Allowed at any trust level and with no session (it only reads or narrows).
- Verify: covered by step 6's tests.
- Trap: unknown actions emit a notice and do nothing.

- Opus review fixes to steps 2-3 (implemented): a switch to Guide during the awaited lookup
  cancels; a `mkdir` lock across the two bridges, and no write when nothing changed; a tool call
  whose `cwd`/`workdir` differs from the bridge's is not remembered; nothing is recorded or
  answered without an `allow_once` option; the panel clears stale rows until its list arrives.
  Accepted: an argv `["FOO=1","cmd"]` and the string `FOO=1 cmd` share a key (each agent uses one
  form); Claude's Bash keeps an earlier `cd` (documented).

**5. The card** — `Conversation.qml:950-975` (slash commands) and `HarnessSelector.qml` (the agent
panel, SUPER+,). *Coder.*
- `/always`, `/always forget <n>` and `/always clear` are matched exactly, like `/undo`
  (`:960-965`). Each writes `{type:"always", action, n}` when `bridgeReady && agent.running`,
  else `showNixiMessage("/always needs the agent bridge running.")`.
- An `always_list` event updates a `rememberedEntries` model in `Ask.qml`.
- `HarnessSelector.qml`: a "Remembered" section under the agent list showing each command and its
  last-used date, with a remove button that sends `forget`. When empty, it says "Nothing
  remembered".
- Verify:
  - `nix flake check` (including the qmllint check, if present);
  - live: SUPER+, shows the section.
- Traps:
  - Match the existing font scaling (`root.fontScale`) and `Commons.Color.menu.*`.
  - The panel never writes `nixi.json` for this (#103 ownership: the bridge owns the store).
- Implemented by coder "always-ui". Deviations: `rememberedEntries` is a `var` array in `Ask.qml`;
  the panel's list/forget requests are quiet, swallowing only the bridge's own listing notice
  (`Remembered for …` / `Nothing remembered for …`), never any other notice (lead's fix).


**6. Tests** — `bridge/always.test.js`, `bridge/testing/fake-agent.js` (reuse `PLEASE_PLAIN` and
`PLEASE_ARGV` from S26, and add `PLEASE_SECRET`: `cat ~/.ssh/id_ed25519`, unchained), and
`bridge/trust-policy.test.js`. *Session model.*
- Each assertion below would fail if the rule it guards were broken:
  - "always" on `uname -r` → a store entry, the agent receives `allow-once` (its allow_once id),
    and the next request with the same command gets no `permission` event and a `Remembered ·`
    status;
  - **at Guide**, with the entry present → `cancelled`, and no `Remembered` status;
  - **a chained command** (`PLEASE_RUN`, `PLEASE_ARGV`) → never offered `allow_always`, and
    nothing recorded even if `allow_always` is forced in the answer;
  - **a secret path** (`PLEASE_SECRET`) → not recorded, and an entry seeded by hand for it still
    gets a card (the match-time recheck);
  - **another agent** (same store, `agent: "codex"` entry) → a card;
  - **another cwd** (an entry with a different `cwd`) → a card;
  - a one-character-different command → a card;
  - YOLO → `allow_once` as before, and nothing recorded;
  - an unreadable or invalid store → unchanged on disk, a diagnostic, and the answer is still
    allow_once;
  - the store's mode is `0600`;
  - `/always`, `forget 1` and `clear` → `always_list` reflects each change, at Guide too;
  - both agents' permission rules deny the store path (step 1).
- Verify: `(cd bridge && node --test ./*.test.js)`, all green.

**7. Docs** — `README.md` "Trust" (`:192-245`), `SECURITY.md`, `docs/architecture.md`. *Coder.*
- README: what "always" covers (one exact shell command, for this agent, in this folder), what it
  never covers (edits, chained commands, herdr writes, secrets, Guide, voice), where it's stored,
  and how to review it (`/always`, the agent panel). Also: `~/.config/nixi/.claude/settings.local.json`
  is left over from before and can be deleted.
- SECURITY.md: a row for remembered approvals, with the residuals (script contents, a one-off
  approved shell write, Codex unfenced).
- architecture.md: the store, its write rules, the answer order (Guide → YOLO → remembered →
  card), and the `always` / `always_list` messages.
- Verify: `git diff --stat`, and every claim matches steps 1-4.

**8. Live check on p620** — lead, at Mechanic with Claude.
- Approve "always" for `uname -r`, start a new chat, ask again → no card, and a `Remembered`
  status.
- `~/.config/nixi/.claude/settings.local.json` is unchanged (checksum before and after).
- `/always` lists the entry; `/always forget 1` brings the card back.
- At Guide → the request is still refused.

## Implementers

- Steps 1–4 and 6 (trust code and its tests): **the session model.**
- Steps 5 and 7: **`coder`.** The plan has 3+ file-editing steps, so the coder rule applies, but
  the coordinator's instruction keeps bridge trust code with the session model.
- Step 8: the lead.
- Review: a fresh Opus agent, given this plan and `git diff`.

## Changes from the spec

- The spec's "Settings section" becomes a "Remembered" section in the card's agent panel
  (`HarnessSelector.qml`, SUPER+,). The card has no separate settings page.
- Store protection also covers OpenCode (an `edit` deny) and a non-default `XDG_STATE_HOME`. The
  spec named only `EXEC_WRITE_PATHS`.

## Tests

| Command | Expected |
|---|---|
| `(cd bridge && node --test ./*.test.js)` | all pass, including step 6's 12 cases |
| `nix flake check` | passes (`hm-module-eval` and the bridge build) |
| Live (step 8) | no card on a remembered command; card at Guide refusal; `settings.local.json` unchanged |

## Rollback

Revert the merge commit. Without the code, the bridge forwards `allow_always` to the adapter
again, and the store file is ignored. To forget everything, delete
`~/.local/state/nixi/always.json`; nothing else reads it.
