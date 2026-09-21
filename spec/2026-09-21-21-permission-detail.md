---
status: draft
issue: 21
intent: intent/2026-09-21-21-permission-detail.md
---

# Spec: A permission prompt shows what is being approved

## Decisions carried from the intent review

- The read-only prompt flood is **out of scope**; it is now #27.
- Open question 2 (how much detail before a cut) is **proposed below**:
  16 KB or 400 lines, whichever comes first, with the cut stated.

## Design

### Bridge: build the detail once, as plain text

A new module, `bridge/permission-detail.js`, exports one pure function,
`permissionDetail(toolCall)`, which returns `{ detail, omitted }`. It builds
from the ACP tool call's own fields (`@agentclientprotocol/sdk`
`types.gen.d.ts`):

- **`rawInput`**
  - if it has a string `command`: that command, whole;
  - if `command` is an array (argv): the elements joined by spaces;
  - otherwise, when it is a non-empty object: `JSON.stringify(rawInput,
    null, 2)`. This covers a Read's `file_path`, a fetch's URL, and anything
    an agent sends that we do not special-case, so nothing is silently
    dropped.
- **`content` items of `type: "diff"`**, one block per file: the path, then
  each line of `oldText` prefixed `- ` and each line of `newText` prefixed
  `+ `. A missing `oldText` means a new file, so there are only `+` lines.
  This is deliberately not a computed unified diff: it shows exactly the
  strings the agent will write, with no algorithm in between to trust.
- **`content` items of `type: "content"`** whose content block is text
  (`item.content.type === "text"`): `item.content.text`. Terminal items are
  skipped, because they refer to output, not to what will run.
- **The cap:** after 16 KB or 400 lines, whichever comes first, the detail
  is cut. `omitted` counts the characters left out, and one final line says:
  "… N more characters not shown. If you cannot see all of what you are
  approving, choose Deny."

`requestPermission` in `bridge/bridge.js` then emits
`{ type: "permission", id, title, options, detail, omitted }`. The title
stays as it is. Guide and YOLO return before the emit, as now, so neither is
touched.

### Card: show it, plainly, and scroll

In `Conversation.qml`:

- `enqueuePermission` and `showNextPermission` carry `detail` and `omitted`
  alongside the id and title, in the queue too, so a second request cannot
  show the first one's detail.
- **The title** `Text` gets `textFormat: Text.PlainText`. Today it is the
  default `AutoText`, so a title that looks like HTML renders as styled
  text; an agent-supplied `<b>` or `<font color=…>` could restyle or hide
  part of what is being approved. The five-line elide stays for the title
  only, because the detail below now carries the full text.
- **The detail** goes below the title: a read-only, selectable `TextEdit`
  (`textFormat: TextEdit.PlainText`, monospace) inside a `Flickable`, whose
  height is capped at 45% of the window. A long command or diff scrolls
  inside the dialog (mouse wheel, touchpad, and PageUp/PageDown when the
  detail has focus) and never widens the card. It is hidden when `detail` is
  empty, so an agent that sends only a title looks exactly as it does today.
- When `omitted > 0`, the last line is shown in the warning colour.

### Docs

The "a long command can be cut short in the prompt" sentence and its #21
link go from `README.md` scene 5 and from `docs/index.html` scene 5. The
"Mechanic also asks before read-only lookups" sentence stays, now linked to
#27.

## Alternatives rejected

- **Only removing the five-line elide**: it would show the title in full,
  but the title is the agent's summary, not the command or the change.
- **A computed unified diff**: it needs a diff algorithm in the bridge, and
  its output is a claim about the change rather than the change itself.
- **Rendering diffs with colour or markup**: agent input would then be
  parsed as markup. Plain text with `+`/`-` prefixes carries the meaning
  without that.
- **No cap**: a multi-megabyte `newText` would freeze the shell's text
  layout. A cap stated in the dialog, with "choose Deny" advice, keeps
  consent informed.

## Risks

- **Agents that send neither `rawInput` nor diff content** get today's
  dialog. That is correct, and no worse than now.
- **`rawInput` can contain secrets** the agent is about to pass on a command
  line. They were already in the agent's command; the card now shows them to
  the person approving, which is the point. They are not logged: the bridge
  emits them only to the card, and the card keeps no transcript.
- **What each agent actually sends varies.** The razer run checks Claude.
  Codex and OpenCode are covered by the bridge tests' fake agent, which sends
  both shapes.

## Verification

- **`bridge/permission-detail.test.js`** (new), covering:
  - a string command and an argv array, both shown whole;
  - an edit diff, and a new file with no `oldText`;
  - several diffs in one call;
  - an unknown `rawInput`, shown as JSON;
  - nothing at all, giving an empty detail;
  - a 1 MB `newText`, cut at the cap with `omitted` exact;
  - a title containing `<b>`, passed through unchanged (it is the card that
    renders it as plain text).
- **`bridge/trust-policy.test.js`**: the fake agent (`bridge/testing/
  fake-agent.js`) gains `PLEASE_EDIT` (a diff) and `PLEASE_RUN` (a 2 KB
  command). In Mechanic, the emitted `permission` event carries the full
  detail. In Guide, no event is emitted at all, as today.
- **`tools/test_nixi.py`**: a static check that the permission title and
  detail are `PlainText` and the detail sits in a `Flickable`.
- `nix flake check`; the bridge tests, now 41 plus the new ones.
- **On razer**, using the shared method in #19's spec, in Mechanic with
  Claude:
  1. Ask for the same key binding as on 2026-09-21. The write prompt shows
     the whole command, including what follows `&&`.
  2. An edit prompt shows the path and the `-`/`+` lines.
  3. A long detail scrolls inside the dialog.

  Screenshots go in the PR.
