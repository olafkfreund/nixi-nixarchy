---
status: draft
issue: 114
intent: intent/2026-10-28-114-remember-always.md
---

# Spec: an "always" stays answered

## What happens today (measured on p620, 2026-10-28)

- At Mechanic, the card forwards the user's pick to the agent adapter unchanged (#53). An
  "always" goes out as the adapter's `allow_always` option.
- **Claude** (claude-agent-acp 0.93.0) turns `allow_always` into Claude Code "permission updates"
  with `destination: "localSettings"`. Those are written to `<cwd>/.claude/settings.local.json`,
  and for nixi the cwd is `~/.config/nixi`. That file on p620 has 33 rules, several of them
  wildcards Claude chose itself: `Bash(systemctl list-units *)`, `Bash(nixarchy doctor *)`,
  `Bash(systemctl cat *)`. Today's btop click added two exact rules.
- nixi deliberately never loads that file. The bridge passes `settingSources: ["user"]`, so a
  directory the agent can write to can't grant it standing permissions (#63, #66;
  `bridge.js` ~480-490). The rule only lives for the running session. **So every "always" is a
  dead write that never comes back, plus a growing file of wildcard rules on disk.** That is the
  bug the user sees.
- **Codex** (codex-acp 2.1.1) and **OpenCode**: where their `allow_always` is kept wasn't
  verified. The adapters are binaries/bundles not read for this spec. It's at least per session,
  and whatever they persist is outside nixi's control.
- The voice companion in nixi mode has no store of its own. Its card answer goes to the bridge
  (`ask_bridge`, "never touches self.always").

## Design

**The bridge owns remembered answers. The adapters are never told "always".**

1. **What can be remembered.** Only a shell command (`kind: "execute"`) that today is offered
   `allow_always`:
   - not a chained command (S26);
   - not a herdr write (#95);
   - not an edit, delete or move (#90);
   - not a command matching a secret rule (`secretBashRules()`, #96).

   Other kinds (fetch, MCP tools) keep today's behaviour, in which `allow_always` goes to the
   adapter. They aren't remembered by nixi. *Proposed — user to confirm at spec review.*
2. **The key is exact.** The key is `agent` + the bridge's `cwd` + the full command string.
   - An argv array is joined exactly as `permissionDetail` shows it (`shellQuote`).
   - No trimming beyond leading and trailing whitespace. No prefix, no first word, no glob.
   - A command that differs by one character asks again (fails safe).
3. **Recording.** When the user picks the `allow_always` option for a rememberable request, the
   bridge:
   - writes the entry;
   - answers the adapter with its **`allow_once`** option, so no adapter-side rule is created and
     Claude's `settings.local.json` stops growing;
   - emits a notice: "Remembered: `<command>` (/always to review)".

   If the write fails, the answer is still allow_once for this time, plus a diagnostic. Nothing
   is lost, and nothing is wrongly remembered.
4. **Answering.** In `requestPermission`, **after** the Guide check (Guide still cancels
   everything first) and after the YOLO branch:
   - if the policy is "ask" and the request is rememberable and its key is in the store, the
     bridge answers `allow_once` itself;
   - no card is shown;
   - it emits `status: "Remembered · <title>"`, so the card and the companion both show it;
   - it updates the entry's `lastUsed`.

   The secret check is re-run at match time, so a rule added later wins over an old entry.
5. **Store.** `$XDG_STATE_HOME/nixi/always.json` (default `~/.local/state/nixi/always.json`),
   created `0600`:
   `{ "version": 1, "entries": [{ "agent", "cwd", "command", "added", "lastUsed" }] }`.
   - Writes follow #103:
     - re-read, merge and write atomically (tmp + rename), serialized through one promise chain
       (the `mergeSettings` pattern);
     - never overwrite a file that is unreadable or not a JSON object: leave it, emit a
       diagnostic, remember nothing new;
     - two bridges (the card and the companion) can both write, and each re-reads before merging.
   - **The path is added to `EXEC_WRITE_PATHS`**, so an agent edit can't grant itself standing
     permissions by writing the store.
6. **Seeing and revoking**, through the card's command line, handled in the bridge like `/undo`:
   - `/always` lists this agent's and this folder's entries, numbered, with the last-used date;
   - `/always forget <n>` removes one entry;
   - `/always clear` removes all of this agent's and folder's entries.

   `/always` works at Guide too: it only reads, and forgetting only narrows. A **Settings
   section** in the card lists the same entries with a remove button. The companion only shows
   the "Remembered" status, and voice can never add an entry, because "always" stays click-only
   (S18).

### Proposed decisions (user to confirm at spec review)

| Question | Proposed |
|---|---|
| Scope | Per agent + per bridge `cwd`. Claude's yes doesn't apply to Codex, and one folder's doesn't apply to another. |
| Lifetime | Until revoked; the visible list with last-used dates is the control. No expiry. |
| Who answers | The bridge, as `allow_once` to the adapter. Same behaviour for every agent, and no adapter-side permanent rules. |
| Where managed | `/always` in the card, plus a Settings list. The companion shows status only. |
| Which kinds | Shell commands only (point 1). |
| Existing `~/.config/nixi/.claude/settings.local.json` | Left alone (it's never loaded). The README says it can be deleted. No migration: its wildcard rules aren't exact. |

### Docs

- README "Trust": a paragraph on "always" covering what it covers, where it is kept, `/always`,
  and what it never covers.
- SECURITY.md: a row for remembered approvals.
- `docs/architecture.md`: the store, its write rules, and the answer order (Guide → YOLO →
  remembered → card).

## Alternatives rejected

- **Let the adapters persist it (today).** Claude writes wildcard rules it chooses into a cwd
  file. Loading that file would undo #63: a directory the agent can write to would grant it
  standing permissions. Codex and OpenCode each persist differently, or not at all.
- **Load `settings.local.json`** (`settingSources` + "local"): rejected for the same reason
  (#63/#66).
- **Prefix or wildcard keys** ("always allow `systemctl cat *`"): one yes would cover commands the
  user never saw. Exact only.
- **A global scope:** a yes given in one folder or to one agent would silently widen to all.
- **The store in the companion:** it covers voice only, not the card, and the bridge is where
  trust is enforced.
- **Expiring entries:** the list with last-used dates is clearer. It can be added later.

## Risks

- **A remembered command whose meaning changes.** An exact string can run a script whose content
  later changes (`~/bin/foo`). The store pins the text, not what it runs.
  - Partly covered: `EXEC_WRITE_PATHS` already denies writes to `~/.local/bin/nixi-*` and other
    exec paths, and `/always` shows what is remembered.
  - Accepted residual, documented.
- **The store as an attack target.** Covered by `EXEC_WRITE_PATHS` for agent edits. A shell
  command could still write it. Shell commands always ask at Mechanic, and a `>` redirect is
  chained, so it can never be remembered, but a one-off approved `cp` could still write it.
  Documented, the same as `~/.claude/settings.json` today.
- **Two bridges writing at once:** handled by re-read + merge + atomic rename. The last writer
  wins per entry, and no entry is lost.
- **Mismatch noise:** commands with timestamps or temp paths never match, and so keep asking.
  That fails safe.
- **Adapters that send no `allow_always`:** nothing is recordable, and behaviour is unchanged.

## Verification

- Bridge tests (`node --test`), with the fake agent:
  - "always" on a plain command → a store entry, the adapter gets `allow_once`, and the same
    command next turn gets no card plus a `Remembered` status;
  - a one-character-different command → a card;
  - at Guide → cancelled even when remembered;
  - another agent or cwd → a card;
  - chained, herdr-write, edit and secret-naming commands → never recorded;
  - an unreadable store → not overwritten, plus a diagnostic;
  - `/always`, `forget` and `clear` → the list changes;
  - store mode is `0600`;
  - `EXEC_WRITE_PATHS` contains the store.
- `nix flake check` passes.
- Live on p620 at Mechanic: approve "always" for `uname -r`, open a new chat, ask again → no card.
  `~/.config/nixi/.claude/settings.local.json` is unchanged. `/always` lists the entry, and
  `forget` brings the card back.
