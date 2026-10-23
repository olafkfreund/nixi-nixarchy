# Architecture and invariants

This document records the design constraints that are easy to lose when
changing the visible QML. They are part of the product contract, not incidental
implementation details.

## Components

`Ask.qml` is the Omarchy plugin entry point and conversation manager. It owns
no ACP process. It tracks one optional unpinned overlay plus any number of
independent pinned conversations.

`Conversation.qml` owns one conversation's UI, message model, permission queue,
overlay window, optional normal window, and bridge process. Pinning reparents
the live card and permission layer into a `FloatingWindow`; it must not copy
messages, restart the bridge, or create a replacement ACP session.

`bridge/bridge.js` adapts newline-delimited JSON between QML and ACP. It starts
one agent child -- `claude-agent-acp`, `codex-acp`, or `opencode acp` --
initializes one ACP session, and keeps that session until the conversation
closes.

```text
Omarchy Shell
  └─ Ask.qml manager
       ├─ Conversation.qml ─ bridge.js ─ ACP agent/session
       ├─ pinned Conversation.qml ─ bridge.js ─ ACP agent/session
       └─ pinned Conversation.qml ─ bridge.js ─ ACP agent/session
```

## Lifecycle invariants

1. One conversation owns exactly one bridge process and one ACP session.
2. Pinning changes window ownership only. The bridge PID, message model,
   permission queue, and ACP session remain the same.
3. Pinning clears the manager's `activeOverlay` reference but retains the
   conversation object.
4. `Ask.qml.opened` describes only the active unpinned overlay. Omarchy Shell
   consults this property before deciding whether its toggle should summon or
   hide the plugin. Do not redefine it to include pinned windows: doing so
   recreates the post-pin double-hotkey bug.
5. Summoning Ask while pinned conversations exist creates a new conversation.
6. Closing an overlay or normal window shuts down and destroys only its owning
   conversation. `closeAll()` exists as an explicit maintenance/test hook; the
   ordinary shell `close()` never closes pinned conversations.
7. Closing cancels unresolved permissions, asks ACP to close the session, sends
   SIGTERM to the agent, and uses SIGKILL only as a short shutdown fallback.
8. When a turn finishes in an unfocused pinned conversation, its toplevel asks
   the compositor for attention through `contentItem.Window.window.alert(0)`.
   Quickshell's FloatingWindow wrapper exposes neither `alert` nor `active`;
   both must be accessed on the native Qt window. No title/PID lookup, external
   attention command, or Yoohoo dependency is involved. Overlay and focused
   conversations never request attention. The compositor owns activation policy.

## Permission invariants

The durable mode is `permission` or `yolo`, stored in
`~/.config/omarchy/nixi.json`. Missing, malformed, or unknown values resolve to
`permission`.

- Ask mode queues every ACP permission request and requires an explicit button
  or `Y` / `N` response.
- YOLO selects only an option whose kind is exactly `allow_once`.
- If no allow option exists, YOLO cancels the request. It must never invent an
  option ID or bypass ACP.
- Switching to YOLO resolves already queued permissions through the same ACP
  option-selection rule.
- The UI does not commit or clear its permission queue until the bridge has
  persisted the requested mode and acknowledged it. A failed write retains
  Ask mode and the visible request.
- Tool input, query parameters, credentials, and permission payloads are not
  written to the settings file.

## Message and scrolling invariants

ACP text is streamed as chunks. `bridge.js` forwards each chunk's `messageId`.
`Conversation.qml` appends chunks with the same ID to the current assistant
message and starts a separate visual paragraph when the ID changes. Do not use
tool activity or timing gaps to infer message boundaries.

Before appending a chunk, the conversation records whether the viewport is at
the tail. It schedules `scrollToEnd()` only when that was true. This preserves
automatic streaming for readers at the bottom without pulling someone away
from text they deliberately scrolled up to read.

Submitting applies the same tail test. A reader at the tail has the new prompt
anchored to the top of the viewport; a reader who scrolled up keeps their
position and is never moved. Anchoring works by adding `tailSpace` past the
transcript so the newest prompt can reach the top, then shrinking that room as
the reply grows. The maximum scroll offset therefore stays at `anchorY`, which
holds the prompt still while the reply fills the space beneath it, and ordinary
tail-following resumes once the reply outgrows the viewport. Anchoring is
skipped when the transcript still fits inside the card, because nothing
scrolls. Do not reset the anchor when a reply finishes: collapsing the room
would jump the transcript.

The input's `>` is visual chrome and is never included in the submitted text.

## Durable state and privacy

Nixi intentionally stores no transcript. QML holds rendered messages in
memory; closing the owning conversation clears them. The app-owned durable
state includes permission, display, motion, search, optional file open/edit
commands, and the selected harness, model, and reasoning effort in `nixi.json`.
Existing conversations retain their ACP session when these defaults change;
new conversations receive a frozen copy. That file has two writers —
`bridge.js` for the mode, `Ask.qml` for
the scale — so each must merge into the existing contents rather than replace
them.

The font scale is owned by the `Ask.qml` manager, not by a conversation, so
every overlay and pinned window shares one value and one writer persists it. Agent CLIs remain responsible for any data they
store independently.

Bridge stdout is reserved for machine-readable UI events. Agent stderr is
converted to diagnostic events but is not rendered or persisted by the UI.
Avoid logging raw ACP request bodies because they may contain sensitive tool
arguments.

## Nixi: grounding, trust, tour and learned facts

These are Nixi's additions to the upstream card. Each has a test that fails
if the invariant breaks.

**Grounding** (`bridge/grounding.js`). Before every prompt the bridge runs
`nixi-context` with the question (3 s timeout) and appends its excerpt of the
local manuals. A missing or failing `nixi-context` sends the question
unchanged and emits a diagnostic; it never blocks the turn. The agent runs in
`~/.config/nixi` when it exists, so its `CLAUDE.md`/`AGENTS.md` is the tutor
brief.

**Trust** (`bridge/trust-policy.js`). `guide` or `mechanic`, stored beside the
permission mode in `nixi.json`; anything else is Guide.

- Guide: every ACP permission request the bridge receives is cancelled and never
  reaches the card. The agent is also put in its most restrictive mode, through
  ACP session modes or, for OpenCode, the `mode` config option.

  Read, Grep and Glob are the documented exception, in both trust levels. They
  are granted in the permissions object handed to Claude Code at `newSession`
  (`claudePermissions`, `bridge/trust-policy.js`), and Claude Code applies that
  allowlist itself — so those three tools **never reach ACP as a permission
  request at all**, and there is nothing for Guide to cancel. This is why Guide
  reads without asking: not a gap in the cancel, but three tools that never
  generate a request. Everything that writes, executes or reaches the network
  still does, and in Guide every one of those is cancelled.

  `SECRET_PATHS` is the limit on that allowance. Its rules are generated for all
  three read tools, because Claude matches rules per tool name — a list of
  `Read(...)` patterns alone left Grep and Glob able to reach the same paths
  unprompted (#41).

  **Shell commands and secrets (#96).** At Guide, Claude (plan mode)
  auto-approves read-only shell commands (`head`, `cat /etc/hostname`), so they
  never reach ACP either, and `head ~/x.age` ran with no request. Measured: an
  `ask` rule, bare `Bash` or a wildcard `Bash(*...*)`, beats that auto-approval,
  so the command becomes a request and Guide cancels it. Rules are fixed per
  session (passed at `newSession`), so they follow the level the session
  **starts** at:

  | start level | extra `ask` rules | effect |
  |---|---|---|
  | Guide | bare `Bash` | no shell at all; the tutor answers from the manual, `KNOWLEDGE.md` and file tools |
  | Mechanic | `Bash(*X*)` per `SECRET_PATHS` entry (`secretBashRules`) | every shell command asks (default mode); a secret-path command asks even when the user has allow rules or answered "always allow" for that command |

  The Mechanic set is best effort: `X` is the path without `~/`, so the `~/`,
  `$HOME/`, absolute, `~user/` and `../../` spellings all match, but not a path
  a shell builds at run time. Residual: after a Mechanic to Guide switch inside
  one session, non-secret read-only commands, and anything already granted
  "always allow" in that session, can run until the next conversation, because
  the rules cannot change mid-session; secret-path commands are still cancelled.
  opencode, same canary at Guide (measured 2026-10-23): inconclusive (empty reply).
- **Codex (#97).** Measured with the same canary (a throwaway `~/.ssh` file):
  Codex reads it at Guide, because its `read-only` sandbox permits every file read
  and nixi has no per-path read rule for it. So **Codex can't be used at Guide**:
  a session that would start there gets no agent: the bridge shows a notice ("Guide
  can't keep secrets from Codex — use Claude for Guide, or switch to Mechanic"),
  sends `ready`, and kills the codex-acp child. Prompts get that reason as an
  error, and only `trust` and `close` work (other commands are answered with the
  reason). Switching to Mechanic is saved and followed by a `fatal` asking for a
  new conversation. A Mechanic to Guide switch inside a live Codex session is
  refused (`ack` false). `NIXI_ACP_COMMAND` (a user-set variable) can still run
  another adapter under a different agent name; the check keys on the resolved
  agent name (pre-existing, not a #97 regression). At **Mechanic,
  Codex can read secrets without asking** (its reads never reach a permission
  request); treat that as a warning, not a protection.
  Not available yet (path A): codex 0.163 permission profiles
  (`default_permissions` + `[permissions.x] filesystem = { ":root" = "read",
  "<path>" = "none" }`) make the kernel deny named files and folders, but
  codex-acp 2.1.1 fails `newSession` with `Internal error` when `CODEX_CONFIG`
  carries one. Globs such as `~/**/*.age` fail closed and scan home before every
  command, so only named folders could be fenced, not `.env`/`.age` elsewhere.
  Bubblewrap can't mount `none` on a symlink and `/run/agenix` is one
  (→ `/run/agenix.d/N`), so entries must be `realpath`-resolved. Revisit when
  codex-acp passes profiles through.
- Mechanic: requests are queued in the card as upstream does. YOLO applies only
  here; a saved YOLO is ignored at Guide, and switching to Guide cancels queued
  requests.
- `/guide`, `/mechanic` and `/undo` are handled in `Conversation.qml.submit()` and
  never reach the agent. `/undo` is answered by the bridge and works only at
  Mechanic: it changes the machine, and Guide promises nothing does.
- `bridge/changes.js` (#90) backs up files before the agent edits them. For a
  permission request of kind `edit`, `delete` or `move` answered with an allow
  option at Mechanic, the bridge copies each `toolCall.locations[].path` and only
  then answers, so the agent cannot skip the backup. Such requests never offer
  "allow always". Copies and a `manifest.json` (with sha256 before and after) go
  in `${XDG_STATE_HOME:-~/.local/state}/nixi/changes/<turn>/`, mode 0700/0600,
  newest 20 turns kept. At the end of a turn that touched `~/.config/hypr/`, the
  bridge runs `hyprctl reload` and `hyprctl configerrors`; errors not present
  before the edit restore those files. `/undo` restores the newest change set,
  all or nothing, and refuses if a file changed since. Symlinks, Nix store paths
  and files over 1 MiB are not copied, and shell edits are not covered.
- OpenCode is always spawned with `OPENCODE_CONFIG_CONTENT` set to Nixi's
  permission rules, replacing any inherited value. Without them its defaults
  run tools with no request for Guide to cancel.

**Tour and learning path** (`Tour.qml`, `TourModel.js`, `share/tour.json`,
`share/learn.json`). The tour lives in the `Ask.qml` manager, not in a
conversation, because a conversation is destroyed when its card closes and the
tour asks the user to go and do things on the desktop. Steps advance on
Hyprland socket events, a default-agent check, or the card being summoned. The
card opens empty: a step is shown when `/tour` starts or resumes it, or when it
advances while a card is open -- never merely because the card opened.
`TourModel.js` is Qt-free and exported for `node --test`.

**Default agent and enabling** (`bridge/harness-policy.js`,
`nix/enable-card.py`). With no Omarchy default agent and no selection, the
bridge uses Claude Code. The Home Manager module adds the card to `shell.json`
`plugins[]` once, behind `~/.local/state/nixi/enabled-once`, because the shell
accepts a toggle for a plugin that is not enabled and does nothing. A user
`shell.json` replaces Omarchy's defaults rather than merging, so the step only
extends an existing file or creates one whole from the defaults; `bin/nixi`
checks `listPlugins` and says when the card is off.

**Learned facts** (`bridge/learned.js`). A reply line starting `LEARNED:` is
withheld from the card, even when split across chunks, and appended to
`~/.local/share/nixi/LEARNED.md` at the end of the turn. The bridge writes
it, not the agent, so it works at Guide where agent writes are cancelled.

## Compatibility boundary

The plugin targets Omarchy Quattro 4.0.0 and newer. It relies on the Quattro
shell-plugin manifest and lifecycle contract, `PanelWindow`, `FloatingWindow`,
and components from `qs.Commons` and `qs.Ui`. Omarchy 3 is unsupported.

The verified baseline is Omarchy `4.0.0-1`. Changes to public Omarchy shell
components, Quickshell window semantics, or ACP permission option kinds require
the regression checklist in `docs/testing.md`.
