---
status: draft
issue: 116
intent: intent/2026-10-29-116-always-passthrough-opencode-exec.md
---

# Spec: no standing "yes" leaks past nixi's trust model

## Design

### 1. "Always" is offered only where #114 meant it

In `requestPermission` (`bridge/bridge.js:400-407`), `allow_always` is kept only when
one of these holds:

- the call is `kind: "execute"` and `rememberable(toolCall, cwd)` is true, so the
  bridge keeps it in its own store (#114);
- the call is a kind #114 deliberately left alone: anything that is not `execute`,
  `read`, `search` or an `EDIT_KINDS` kind (`fetch`, `think`, `other`/MCP tools,
  or no kind).

So "always" is now hidden for:

- every `read` and `search` request (they only ask for a secret path or under
  `askBeforeReading`);
- every non-rememberable shell command (secret path, another `cwd`/`workdir`,
  chained, herdr).

The herdr and chained filters stay for every kind, as today. The existing edit
filter stays.

*Decided (intent open question):* **hide** "always", rather than showing it and
answering once. A button that silently means "once" would mislead.

`answerPermission` keeps its two branches. A hidden option can't be picked: `select`
only matches offered ids, so nothing else changes there.

Cost: under `askBeforeReading` the user can't say "always" to reads any more. That
choice already means "ask me for every read", so asking again is what it promises.

### 2. OpenCode gets the same unattended-execution denies

- Refactor `opencodeSecretDenies()` (`bridge/trust-policy.js:52-64`) into
  `opencodePathDenies(paths)`: the same anchor-free transform, `//` entries skipped.
  `opencodeSecretDenies()` becomes `opencodePathDenies(SECRET_PATHS)`, with
  identical output.
- `opencodeRules().edit` becomes `{ "*": "ask", ...deny(opencodePathDenies(EXEC_WRITE_PATHS)),
  "*nixi/always.json": "deny", "*nixi/always.json.*": "deny" }`. The two explicit
  store patterns stay, because they cover a non-default `XDG_STATE_HOME`, which the
  `//` entries do for Claude.
- **Add `~/.config/opencode/**` to `EXEC_WRITE_PATHS`.** It's OpenCode's own
  permission config, and the bridge loads it (only project config is disabled,
  `bridge/bridge.js:265-267`). It is OpenCode's `~/.claude/settings.json`, and both
  agents are denied writing it, as with Claude's settings.
- An OpenCode deny is enforced by OpenCode itself and raises no request (#102), so
  YOLO can't answer it. That is what closes the YOLO path.

### 3. Docs

The SECURITY.md "Remembered approvals" row says "always" is offered only for
commands nixi keeps. Its exec-write row (or the README "Trust" text) says the
unattended-execution paths are denied for Claude and OpenCode, Codex excepted (#97).

## Alternatives rejected

- **Show "always" and answer once:** the label lies.
- **Strip `allow_always` from every kind:** it would reverse #114's decision for
  fetch and MCP tools without evidence that they reach a secret.
- **Hand-write OpenCode patterns for the exec paths:** a second list drifts. Generating
  from `EXEC_WRITE_PATHS` is #41's lesson: one list, every consumer.

## Risks

- **A user who relied on "always" for `askBeforeReading` reads** now gets asked
  each time. That's intended, and goes in the docs.
- **OpenCode's `*` crosses `/`** (measured for the secret denies, #102), so
  `*.claude/hooks/*` also matches deeper paths. Over-matching a deny is safe.
- **`~/.config/opencode/**` denied:** asking nixi to edit OpenCode's config now fails
  for both agents. That's the same trade as `~/.claude/settings.json`.

## Verification

- `trust-policy.test.js`:
  - the OpenCode `edit` deepEqual is updated;
  - every `EXEC_WRITE_PATHS` entry (not `//`) has an OpenCode deny;
  - `opencodeSecretDenies()` output is unchanged;
  - `~/.config/opencode/**` is in `EXEC_WRITE_PATHS`.
- Bridge tests (`node --test`, fake agent with `FAKE_AGENT_OPTIONS=always`):
  - a secret-path command (`PLEASE_SECRET`) → no `allow_always` on the card;
  - a command with another `cwd` → none;
  - a read request → none;
  - a plain command (`PLEASE_PLAIN`) → still offered;
  - a `fetch` request → still offered.
- `nix flake check` passes.
- Live on p620 (OpenCode, Mechanic and YOLO): ask it to write
  `~/.config/systemd/user/nixi-test.service`. It is refused by config, with no card,
  even in YOLO.
