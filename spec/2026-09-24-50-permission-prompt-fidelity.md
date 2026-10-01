---
status: approved
issue: 50
intent: intent/2026-09-24-50-permission-prompt-fidelity.md
---

# Spec: The permission card shows what will run, and cannot be answered unseen

The intent left four open questions. Each is answered below with the reasoning,
and the answers are what this spec is for.

## Two regressions found first

Reading the current `Conversation.qml` before designing against it turned up two
faults that #58 (`998ead4`, merged hours ago) left behind. Both sit in the exact
lines this work touches, so both are fixed here.

**1. `options` never reaches the card.** `bridge.js:235` emits
`{ type: "permission", id, title, options, detail, omitted }`. The QML handler
(`:1072`) calls `enqueuePermission(event.id, event.title, event.detail,
event.omitted)` and `enqueuePermission` (`:1017`) builds its request object from
those four fields alone. `options` is dropped on the floor. #58 rewrote the card
to render `Repeater { model: root.pendingPermission.options || [] }` and rewired
`Y`/`N` through `optionIdForKind()`, which reads the same array — so on master
the card renders **zero buttons**, `optionIdForKind()` always returns `""`, and
both shortcuts are `enabled: false`. The permission card cannot be answered at
all. `git show 998ead4 -- Conversation.qml` confirms `enqueuePermission` was
never touched.

**2. The composer still answers with a boolean.** `Conversation.qml:1534`, in
the prompt's `Keys.onPressed`, calls `root.answerPermission(event.key ===
Qt.Key_Y)`. #58 changed `answerPermission` to take an option id; a boolean
reaches `optionById(true)`, finds nothing, and returns — after
`event.accepted = true` has swallowed the key. So the composer's `Y`/`N` branch
silently eats the keystroke. Since the prompt normally holds focus, this branch,
not the `Shortcut` pair, is the path a user's keys take.

This slightly contradicts the issue's framing of weakness 3: on today's master
autorepeat cannot approve the *next* request, because it cannot approve the
*current* one either. The hazard is real and is restored the moment the above is
fixed — which this change does in the same diff — so the settle window is not
speculative. It is required by the fix.

## Design

### 1. argv is rendered with POSIX shell quoting, minimally applied

`rawInputText` renders an argv array by quoting each element that needs it:

```js
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,.\/-]+$/;
const shellQuote = (arg) => SHELL_SAFE.test(String(arg))
  ? String(arg) : `'${String(arg).replace(/'/g, "'\\''")}'`;
```

`["rm", "-rf", "/tmp/a b"]` becomes `rm -rf '/tmp/a b'`.

**Chosen over JSON, on the grounds the intent asked for: which does a user read
correctly under time pressure.** The detail pane is monospace and holds a
command. Shell-quoted form is the same text the user would type in a terminal,
so no decoding step stands between reading and understanding — the quotes read
as "this argument is one thing" because that is what quotes already mean there.
`["rm","-rf","/tmp/a b"]` is equally unambiguous but asks the reader to parse
punctuation into arguments before they can judge the command, and it introduces
a second escaping scheme (`\"`, `\\`) whose backslashes are themselves easy to
misread in a path. Under time pressure the format that needs no translation
wins.

Quoting *only* the arguments that need it matters as much as the choice of
scheme. `["rm", "-rf", "/tmp/probe"]` still renders `rm -rf /tmp/probe`,
byte-identical to today, so nothing familiar changes — and the appearance of a
quote becomes a signal in itself: this argument contains something surprising.
Quoting everything would make the marker worthless by making it constant.

An empty argv element renders `''`, which is the point: today it is invisible.

### 2. No field is dropped: `command` first, then everything else

`rawInputText` stops returning early. It renders `command` (string as-is, array
shell-quoted) and then, below it, every *other* key as pretty JSON:

```js
const { command, ...rest } = rawInput;
```

**The intent asked which fields an allowlist should contain. The answer is that
there should be no allowlist.** An allowlist makes a field that is not on it
invisible, which is precisely the shown-versus-executed gap being fixed — it
converts a bug we can see into a bug that arrives silently with the next tool.
Grounding it in "what tools actually carry" makes this concrete: Bash carries
`description`, `timeout` and `run_in_background`; Read carries `limit` and
`offset`; Grep carries `output_mode`, `-i`, `-n`, `head_limit` and six more;
WebFetch carries a `prompt`. A list drawn from that set today is a list that is
already wrong for the tool added next month, and nobody will notice, because the
failure mode of an allowlist is silence.

There is no cost to showing everything. `rawInput` that is *only* unknown fields
already renders as whole JSON today (the existing fallback), so the only
behaviour that changes is that a `command` no longer hides its siblings. The
`CAP_BYTES` / `CAP_LINES` bounds are untouched and still cut agent-controlled
text, with the existing "choose Deny" notice.

### 3. Autorepeat is suppressed structurally, not by timing

Before choosing a duration: a held key should never answer *anything*, current
request or next. Qt gives this directly.

- `Shortcut { autoRepeat: false }` on the `Y` and `N` shortcuts — Qt does not
  activate the shortcut on a repeat at all.
- `if (event.isAutoRepeat) return` in the composer's permission branch.

This is exact rather than a race against the compositor's repeat delay, and it
removes the dependence on a number nothing in this repo controls: Hyprland's
default `repeat_delay` is 600 ms, so a 400 ms window sized to beat autorepeat
would not have beaten a *fresh* hold at all — the first repeat lands at 600 ms,
outside it. Deciding the duration first and checking the number second would
have shipped a window that looked right and closed the wrong 400 ms.

### 4. The settle window is 400 ms, and it disables the buttons too

`showNextPermission()` clears `permissionSettled` and starts a 400 ms timer;
`answerPermission()` refuses while it is false, and so does
`permissionKeysLive`.

**400 ms** is Qt's own `QStyleHints::mouseDoubleClickInterval` default. With
autorepeat handled structurally, the window only has to cover a *second physical
input* — and the pair of clicks the platform itself would call a double-click is
exactly the pair that falls inside 400 ms. Picking the platform's own number
means the guard covers the platform's own definition of the hazard rather than a
guess near it. It is also far below the ~1 s at which a UI is felt to have
stalled, and it costs nothing on a single request, where the human takes seconds
to read.

**It applies to the mouse as well as the keyboard.** The intent wondered whether
disabling a visible button was too noticeable. It is the opposite of a problem:
a briefly greyed button is *feedback* — the visible signal that the card in
front of you is a new question — where a silently disarmed key gives the user
nothing and a swallowed keystroke reads as a broken app. And after #58 the
durable choices are **mouse-only** by design, so a keyboard-only settle window
would leave the standing-approval button, the highest-consequence target on the
card, as the one thing still answerable in the same pixel 10 ms later. That
inverts the priority.

## Alternatives rejected

**Require the card to be dismissed and re-summoned between requests.** Correct
and unusable; the intent's third outcome forbids it. Training the user to fight
the UI trains the reflex the fix exists to prevent.

**Move the next card's buttons to different pixels.** Defeats a double-click
without a delay, but only by making the card's geometry jump, which is worse to
use and does nothing about the keyboard.

**A longer window (1 s+) with no autorepeat suppression.** Would have to beat
`repeat_delay`, which is user-configurable and not ours; a user with
`repeat_delay = 200` defeats any fixed number. Suppression is exact and shorter.

**An allowlist of `rawInput` fields.** See 2.

**JSON for argv.** See 1.

## Risks

- **A hostile argv can make the quoting lie.** It cannot: `shellQuote` is total
  over strings, and a single quote inside an argument is escaped with the
  standard `'\''` idiom. A worked case with embedded quotes is in the tests.
- **A long `rest` JSON pushes the command off screen.** The detail pane scrolls
  and `command` is rendered *first*, so the thing most needing to be read is
  the thing at the top. The caps and the "choose Deny" notice are unchanged.
- **The settle window could be felt as lag on a queue.** 400 ms per request,
  and only after an answer. Judged acceptable; the runtime check below is what
  decides.
- **PlainText must stay PlainText.** Nothing here changes `textFormat`, and
  `test_permission_detail_is_plain` already fails if it does (#21, #42).
- **What is enforced does not change.** No bridge permission logic is touched:
  only `permission-detail.js` rendering and the QML's timing.
- Host-specific risk: the settle window's *feel* is compositor-facing and CI
  cannot judge it.

## Verification

1. **Automated, `bridge/permission-detail.test.js`** — argv with a space, with
   an embedded single quote, with an empty element, and an all-safe argv that
   must stay byte-identical to today; `command` plus siblings shown together;
   `command` alone unchanged; a non-string non-array `command`.
2. **Automated, `tools/test_nixi.py`** — source assertions in the file's
   existing idiom, run by `nix flake check`'s selfcheck: `enqueuePermission`
   carries `options`; the composer passes an option id and not a boolean, and
   returns on `isAutoRepeat`; both `Y`/`N` shortcuts set `autoRepeat: false`;
   `permissionKeysLive` and `answerPermission` both test the settled flag;
   `showNextPermission` clears it and restarts the timer; the option buttons
   are `enabled` by it. These are source assertions, not behavioural ones — the
   400 ms itself needs a GUI and is checked at runtime below. Each is written to
   fail if its guard is deleted, and each was proved to do so.
3. **Automated.** `node --test bridge/*.test.js`; `nix flake check`.
4. **Runtime, the actual complaint.** In Mechanic, queue two requests, hold `Y`
   through the first: the second must survive. Double-click Allow with a second
   queued: the second must survive. CI cannot do either.
5. **Runtime, no regression.** One request answered by `Y`, by `N`, and by each
   button still works, and the 400 ms is not felt.
