---
status: approved
issue: 20
spec: spec/2026-09-21-20-permission-keys.md
---

# Plan: Y and N answer a permission prompt

## Approved decisions

- While a prompt is up (`root.pendingPermissionId !== ""`):
  - **Y/N with an empty composer** (no modifier other than Shift): answer the
    prompt, and the key is accepted, so no letter is typed.
  - **Y/N with text in the composer**: they type as usual, and the dialog
    stays.
  - **Return/Enter**: accepted and ignored. No submit, and no search row runs.
- Both `Shortcut { "Y" / "N" }` pairs (overlay and pinned) are enabled only
  when a prompt is up **and** `prompt.text.length === 0`.
- A hint line under the dialog's buttons, shown only while the composer has
  text: "Clear the message box to answer with Y or N".
- The README and site scene 5 no longer say Y/N do not work. The #21 and
  #27 parts of that sentence stay until those land.
- Shared with #19 and #21: razer tests run one at a time; merge order is
  #19, #20, #21, each rebased on `master` first.

## Steps

1. **`tools/test_nixi.py`**: add `test_permission_keys_guard()`, registered
   in `__main__`, asserting that:
   - the composer's `Keys.onPressed` body contains a branch testing
     `pendingPermissionId`, `text.length === 0`, `Qt.Key_Y` and `Qt.Key_N`,
     and that accepts `Qt.Key_Return`;
   - every `Shortcut` whose `sequence` is `"Y"` or `"N"` has
     `text.length === 0` in its `enabled`.

   → verify: it fails on the current file.
2. **`Conversation.qml`, the composer**: at the top of `prompt`'s
   `Keys.onPressed` (right after `root.noteKeyboardActivity()`), add:

   ```qml
   if (root.pendingPermissionId !== "") {
     var bare = (event.modifiers & ~(Qt.ShiftModifier | Qt.KeypadModifier)) === Qt.NoModifier
     if (bare && text.length === 0
         && (event.key === Qt.Key_Y || event.key === Qt.Key_N)) {
       root.answerPermission(event.key === Qt.Key_Y)
       event.accepted = true
       return
     }
     if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
       event.accepted = true
       return
     }
   }
   ```

   Shift and the keypad flag are masked out, so a capital Y and a keypad
   key both count; Ctrl+Y, Alt+Y and Super+Y do not.
   → verify: it reads correctly, and the static test's composer half passes.
3. **`Conversation.qml`, the shortcuts**: both pairs (around lines 1405 and
   2944) change to
   `enabled: root.pendingPermissionId !== "" && prompt.text.length === 0`.
   → verify: the static test passes in full.
4. **`Conversation.qml`, the hint**: in the permission card's `Column`, after
   the `Row` of buttons, add a `Text` with `visible: prompt.text.length >
   0`, caption size and muted colour, reading "Clear the message box to
   answer with Y or N".
   → verify: `grep -c "Clear the message box" Conversation.qml` is 1.

   *Deviation (implementation):* the hint also has `wrapMode: Text.Wrap`, so
   it wraps on a narrow card. Step 1's test gained a small brace-matching
   helper, `_block()`, and also asserts there are exactly four Y/N
   shortcuts. In step 5, the site's Y/N sentence was deleted outright; the
   note now starts "Mechanic also asks…". The README uses the plan's
   "**Y** or **Allow**" wording.
5. **Docs**: in `README.md` scene 5 and `docs/index.html` scene 5, drop
   "Click the buttons: Y and N [do not work yet](…/20)" and its
   `docs/index.html` equivalent. The Allow/Deny wording stays neutral: "each
   step needs your yes: **Y** or Allow".
   → verify: `grep -c "issues/20" README.md docs/index.html` is 0 for both.
6. **Repo checks**: as in #19's step 4.
   → verify: all pass.
7. **razer**: the same swap as #19's step 5, with this build. In Mechanic
   (`/mechanic`) with Claude, run the spec's five checks, first in the
   overlay and then pinned (Ctrl+P). To make prompts, ask "run `ls ~` and
   then `ls /tmp`" (two read-only commands, so two prompts). Screenshot
   checks 1, 3 and 4. Restore the link and switch Nixi back to `/guide`.
   → verify: all five checks pass in both window kinds; the link is restored;
   `trust` in `~/.config/omarchy/nixi.json` is `guide` again.
8. **Commit and PR**: `fix: Y and N answer a permission prompt (#20)`, with
   the PR template, the artifacts, and the screenshots. Rebase on `master`
   after #19 merges.
   → verify: CI green; review threads resolved.

## Tests

| check | expected |
| --- | --- |
| `test_permission_keys_guard`, before fix | fails |
| `python3 tools/test_nixi.py` | all checks passed |
| bridge tests, `nix flake check`, plugin validate | pass (bridge unchanged, 41/41) |
| razer, overlay and pinned | Y allows, N denies, no stray letter; text blocks Y/N and shows the hint; Return sends nothing |

## Rollback

Revert the commit. razer's symlink and trust level are restored in step 7.
