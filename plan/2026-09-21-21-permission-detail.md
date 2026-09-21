---
status: approved
issue: 21
spec: spec/2026-09-21-21-permission-detail.md
---

# Plan: A permission prompt shows what is being approved

## Approved decisions

- **`bridge/permission-detail.js`**: `permissionDetail(toolCall) → { detail,
  omitted }`, plain text built from:
  - `rawInput`: a string `command` whole; an argv array joined by spaces;
    any other non-empty object as `JSON.stringify(…, null, 2)`;
  - `diff` content: the `path`, then `- ` + each `oldText` line and `+ ` +
    each `newText` line (a missing `oldText` means only `+` lines);
  - `content` items with a text block: `item.content.text`. Terminal items
    are skipped.
  - The cap is 16 KB or 400 lines, whichever comes first. After it comes one
    line: "… N more characters not shown. If you cannot see all of what you
    are approving, choose Deny."; `omitted` is N.
- The bridge emits `{ type: "permission", id, title, options, detail,
  omitted }`. Guide and YOLO are unchanged, because they return before the
  emit.
- **The card:**
  - the permission queue carries `detail` and `omitted`;
  - the title `Text` gets `textFormat: Text.PlainText` (it keeps its
    five-line elide);
  - the detail is a read-only, selectable, monospace `TextEdit`
    (`PlainText`) in a `Flickable` capped at 45% of the window, and hidden
    when empty;
  - the cut line is shown in the warning colour.
- **Docs:** scene 5 drops the #21 "cut short" note and keeps #27's
  read-only note, linked.
- **Out of scope:** the read-only prompt flood (#27).
- **Shared:** razer tests run one at a time; merge order #19, #20, #21, each
  rebased on `master` first. This branch rebases after #20, because both
  touch the scene-5 sentence.

## Steps

1. **`bridge/permission-detail.test.js`** (new) with the spec's seven cases.
   Run it before the module exists.
   → verify: it fails (module not found).
2. **`bridge/permission-detail.js`** (new): the function, with `CAP_BYTES =
   16 * 1024` and `CAP_LINES = 400` as named constants and no dependencies.
   → verify: step 1's tests pass.
3. **`bridge/testing/fake-agent.js`**: add `PLEASE_EDIT` (a `requestPermission`
   whose `toolCall` has `kind: "edit"` and `content: [{ type: "diff", path:
   "/tmp/probe", oldText: "a\n", newText: "b\n" }]`) and `PLEASE_RUN` (`kind:
   "execute"`, `rawInput: { command: <a 2 KB string ending "&& echo TAIL"> }`).
   Add two tests in `bridge/trust-policy.test.js`:
   - Mechanic: the emitted `permission` event's `detail` contains `- a`,
     `+ b` and `TAIL`, and `omitted` is 0;
   - Guide: no `permission` event is emitted for either.

   → verify: both fail before step 4.

   *Deviation (implementation):* only the Mechanic test fails before step 4.
   The Guide test passes before and after it: Guide returns before the emit,
   and step 4 does not change that. It stays as a guard for PLEASE_EDIT and
   PLEASE_RUN.
4. **`bridge/bridge.js`**: import `permissionDetail`; in `requestPermission`,
   right before the `emit({ type: "permission" … })`, compute it and add
   `detail` and `omitted` to the event.
   → verify: the step 3 tests pass, and the whole suite passes (41 plus the
   new ones).
5. **`Conversation.qml`, the data**:
   - `property string pendingPermissionDetail: ""` and
     `property int pendingPermissionOmitted: 0`;
   - `enqueuePermission(id, title, detail, omitted)` stores all four in the
     queue entry; `showNextPermission` and `clearPermissions` set and clear
     them;
   - the `permission` event handler passes `event.detail` and
     `event.omitted`.

   → verify: `grep` shows every assignment of `pendingPermissionTitle` has a
   matching `pendingPermissionDetail` one.
6. **`Conversation.qml`, the dialog**:
   - the title `Text` gets `textFormat: Text.PlainText`;
   - after it, a `Flickable` (`width: parent.width`, `height:
     Math.min(detailText.implicitHeight, root.height * 0.45)`, `clip: true`,
     `contentHeight: detailText.implicitHeight`, `visible: detail !== ""`)
     holding a `TextEdit` (`id: detailText`, `readOnly: true`,
     `selectByMouse: true`, `textFormat: TextEdit.PlainText`, `wrapMode:
     TextEdit.WrapAnywhere`, monospace family, caption size, foreground
     colour), plus a `ScrollBar.vertical`;
   - when `pendingPermissionOmitted > 0`, a `Text` under it in the warning
     colour says the same as the bridge's cut line.

   → verify: `tools/test_nixi.py`'s new static check (step 7) passes.

   *Deviation (implementation):* the shell's `Color` has no warning role, so
   the cut line uses `Color.urgent`. That `Text` shows the bridge's own last
   line of `detail`, and the `TextEdit` shows the rest, so the notice appears
   once and says exactly what the bridge wrote.
7. **`tools/test_nixi.py`**: `test_permission_detail_is_plain()` asserts
   that the permission card's title and detail declare `PlainText` and the
   detail sits in a `Flickable`. Register it.
   → verify: it fails on `master`'s file and passes on this branch.
8. **Docs**: in `README.md` and `docs/index.html` scene 5, drop "a long
   command can be [cut short in the prompt](…/21), so read the agent's
   message too". Keep "Mechanic also asks before read-only lookups" and link
   it to #27.
   → verify: `grep -c "issues/21" README.md docs/index.html` is 0;
   `grep -c "issues/27"` is 1 in each.
9. **Repo checks**: as in #19's step 4, with the new tests.
   → verify: all pass.
10. **razer**: the same swap as #19's step 5, with this build. In Mechanic
    with Claude:
    1. "put btop on SUPER+ALT+T" (as on 2026-09-21); allow the read-only
       prompts until the write.
    2. Screenshot the write prompt, which must show the whole command,
       including what follows `&&`. Then **Deny** it, so nothing changes
       (checked with `diff` against a backup taken first).
    3. Ask it to "change the comment on line 1 of /tmp/nixi21-probe.txt"
       (a file created for the test) to get an Edit prompt. Screenshot the
       path and the `-`/`+` lines, then Allow, and check the file.

    Delete the probe file, restore the link, and set `/guide`.
    → verify: full command shown; diff shown; `bindings.lua` unchanged;
    link restored; trust back to Guide.
11. **Commit and PR**: `fix: a permission prompt shows what is being
    approved (#21)`, with the template, artifacts and screenshots. Rebase on
    `master` after #20 merges and resolve the scene-5 sentence then.
    → verify: CI green; review threads resolved.

## Tests

| check | expected |
| --- | --- |
| `permission-detail.test.js` | 7/7 |
| bridge suite | 41 + 2 new + 7 new, all pass |
| `test_permission_detail_is_plain`, before fix | fails |
| `python3 tools/test_nixi.py`, `nix flake check`, plugin validate | pass |
| razer | whole command and edit diff visible; nothing changed by the denied write |

## Rollback

Revert the commit. The card and bridge go back to title-only prompts. The
razer link, probe file and trust level are handled in step 10.
