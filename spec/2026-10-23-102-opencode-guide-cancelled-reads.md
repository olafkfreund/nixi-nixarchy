---
status: approved
issue: 102
intent: intent/2026-10-23-102-opencode-guide-cancelled-reads.md
---

# Spec: opencode at Guide answers instead of giving up, and keeps secrets out

## What was measured (2026-10-23, opencode 2.0.32 via `opencode acp`, nixi's bridge, Guide)

| nixi sends opencode | Prompt | Events | Result |
|---|---|---|---|
| today's `OPENCODE_PERMISSIONS` | read `/etc/hostname` | read pending → `Guide · not run` → failed → `done: cancelled` | no answer |
| today's, but Guide answers **reject** instead of cancelled | the same | the same | no answer: opencode ends the turn on any refusal |
| `external_directory: "allow"` | read `/etc/hostname` | read completed → text | **answers** |
| plus `read` `"~/.ssh/*": "deny"` | read `~/.ssh/<canary>` | `done: cancelled`, no tool event | not read, no answer |
| plus `read` `"*.age": "deny"` | read `~/x.age` | the model tries a shell `ls` → `Guide · not run` → `done: cancelled` | not read, no answer |

Conclusions:
- opencode ends a turn on **any** refusal (ACP reject, ACP cancel, config deny). nixi can't make
  it continue.
- Today Guide is unusable with opencode, because every read outside `~/.config/nixi` asks and is
  therefore refused. Allowing `external_directory` removes those requests, so ordinary reads just
  work.
- Config-level `deny` keeps secrets out of opencode's read tool, and the shell still asks (so it
  is cancelled at Guide, and shows a card at Mechanic).

## Design

### 1. opencode rules (`bridge/trust-policy.js` `OPENCODE_PERMISSIONS` / `opencodePermissions`)

- Add `external_directory: "allow"`. Reading outside `~/.config/nixi` no longer asks. Writes
  still ask: `"*": "ask"` covers edit/write/bash, so Guide cancels them and Mechanic shows a card.
- `read` becomes `{ "*": "allow", ...secret denies }`, generated from `SECRET_PATHS` (one list,
  as for Claude):
  - `~/X/**` → `"<home>/X/*"` and `"~/X/*"` deny (both spellings, home expanded);
  - exact files (`~/.netrc`, `~/.docker/config.json`, …) → deny, by path;
  - `**/.env`, `**/.env.*` → `"*.env"`, `"*.env.*"` deny (they used to *ask*; deny is now right,
    since a refusal ends the turn either way and deny doesn't depend on a card);
  - `**/*.age` → `"*.age"` deny; `/run/agenix/**`, `/run/secrets/**` → `"/run/agenix/*"`,
    `"/run/secrets/*"` deny.
- **grep / glob / list** are allowed today and could reach inside secret directories. Plan step
  S1 measures whether opencode applies path patterns to them. If it does, they get the same
  denies. If not, they become `"ask"` for paths outside `~/.config/nixi`, or the docs state the
  gap.
- The `askBeforeReading` variant keeps its "ask for read/grep/glob/list" behaviour, and the
  secret denies apply there too.

### 2. A turn that ends with no answer gets explained (`bridge/bridge.js`, every agent)

When a turn ends with `stopReason: "cancelled"` and no text was produced, and the bridge refused
a permission during that turn (Guide's cancel), the bridge emits one `notice`: "The agent stopped
instead of answering — at Guide it can't do what it tried (<title of the refused request>).
Try Mechanic, or ask differently." Claude normally carries on after a refusal, so this mostly
affects opencode, but it is harmless for everyone.

### 3. Stalled-turn guard (`bridge/bridge.js`, every agent)

- When a turn emits no event for **120 s** while no tool call is in progress, the bridge cancels
  it (`connection.cancel`) and emits `error`: "The agent stopped responding, so this turn was
  ended." The card and the companion unlock.
- While a tool call is in progress (pending or in_progress with no completed or failed yet), the
  limit is **15 minutes**, so long `nix build`s at Mechanic aren't cut off.
- Any event resets the timer. A pending permission card is the *user's* time: the guard pauses
  while a card waits.

### 4. Docs

`docs/architecture.md` and README "Trust": the measured table, opencode's end-on-refusal
behaviour, the new rules, the guard, and the Mechanic behaviour. `docs/model-verification.md`:
the opencode canary re-check.

## Alternatives rejected

- **Answer Guide requests with reject instead of cancel:** measured to end the turn anyway.
- **Refuse opencode at Guide (as #97 does for Codex):** not needed. With `external_directory`
  allowed and secret denies, measured Guide reads work and secrets are kept out. That stays the
  fallback if S1 shows grep/glob/list can't be restricted and the gap is unacceptable.
- **A turn timeout that also counts tool runs:** it would cut off long builds.

## Risks

- **`external_directory: "allow"` widens what opencode reads without asking**, to any file the
  user can read other than the denied secrets. That is the same as Claude's Read allowance today
  (#27). The secret denies are what make it acceptable.
- **opencode's pattern syntax differs from Claude's.** The live checks (plan) prove each deny
  spelling, including `~` vs absolute.
- **The guard is new to every agent:** a false cancel on a slow model. 120 s without even a
  "thinking" event is long; any streamed event resets it; a waiting card pauses it.
- **Hosts:** every nixi user, through the guard and the notice. opencode rules only for opencode
  users.

## Verification

- **Unit:**
  - `opencodePermissions` output: `external_directory` allow; secret denies from `SECRET_PATHS`
    in both spellings; the `askBeforeReading` variant keeps its asks plus the denies.
  - The notice on a cancelled, empty turn (fake agent).
  - The guard: fires after the limit without events; doesn't fire with a tool in progress or a
    card pending (fake agent with a short test limit).
- **Live (opencode, through the bridge):**
  - Guide: `/etc/hostname` answers; `~/.ssh/<canary>`, `~/x.age` and a `.env` aren't read (the
    notice explains); grep in `~/.ssh` per S1.
  - Mechanic: the same secret reads aren't read, and a shell `cat ~/.ssh/<canary>` shows a card.
- **The companion hang:** reproduce the `~/.ssh` request through the companion; it now ends (the
  notice, or the guard).
- **Throughout:** `node --test bridge/` and `python3 tools/test_nixi.py` green.
