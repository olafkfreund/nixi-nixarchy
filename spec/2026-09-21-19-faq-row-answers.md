---
status: approved
issue: 19
intent: intent/2026-09-21-19-faq-row-answers.md
---

# Spec: Choosing a FAQ row shows its answer

## Design

**The fix is one line.** In `Conversation.qml`, the `onFaqAnswered` handler
(line 968; the call is on 969) changes `root.messages.append({ role: "You", body: question })` to
`messages.append(...)`. That is the bare id, the way `showNixiMessage()` on
the next line and every other use of the model already reach it. Nothing
else changes: the row still keeps the card open (`lastRunKeepsOpen`), still
shows the written answer as Nixi's message, and still starts no agent turn.

**A test that would have caught it.** `test_nixi_rows_are_searchable` in
`tools/test_nixi.py` gains one assertion: `Conversation.qml` never reaches a
model through `root.` when that model is declared by id rather than as a
property. It is written as a small general rule, not a string match for this
one line. It collects every `ListModel { id: X }` in the file and fails if
`root.X` appears anywhere. It is seen to fail on today's file before the fix.

**The docs.** The "choosing one does nothing yet" sentence and its #19 link
go from `README.md` (the line under the scene table) and from
`docs/index.html` (the note under "No AI needed"). Each page then says
plainly that FAQ answers appear in the card with no agent. No new
screenshot: #26 re-records the showcase and adds a FAQ scene.

## Testing on razer (shared by #19, #20 and #21)

QML errors only show at runtime, so each fix is tried on razer:

1. Build this branch on p620: `nix build .#nixi`.
2. `nix copy --to ssh://razer <result>`. This adds the build to razer's
   store; it replaces nothing.
3. On razer, move the plugin symlink
   `~/.config/omarchy/plugins/io.github.olafkfreund.nixi` to the new build's
   `share/omarchy/plugins/io.github.olafkfreund.nixi`, keeping the old target
   in a note, and restart the shell (`omarchy-restart-shell`). The bar
   restarts for a second.
4. Test (below), with a screenshot, driving the desktop through ai-mirror
   after asking you for control, as on 2026-09-21.
5. Point the symlink back at the Home Manager path, and restart the shell
   again. `readlink` must show the original target.

Home Manager would also put the link back on razer's next switch, so a missed
step 5 cannot outlive a rebuild. Nothing is written into razer's
configuration.

## Alternatives rejected

- **Declare `property alias messages`** on `root` so that `root.messages`
  works: it makes the one wrong call right by adding API, where changing the
  call fixes it by removing a difference.
- **A qmllint run in CI**: run on `Conversation.qml` here, qmllint (Qt 6
  from nixpkgs) prints 1,363 warnings, mostly Quickshell imports it cannot
  resolve, and none on line 969. It would not have caught this without first
  teaching it the Quickshell modules. That is worth its own issue, not this
  fix.

## Risks

- None to behaviour elsewhere: `messages` is referred to by its id in every
  other place.
- The razer test briefly restarts the shell twice. It is done only while you
  have granted control.

## Verification

- `python3 tools/test_nixi.py`: the new assertion fails on `master`'s
  `Conversation.qml` and passes after the fix.
- `nix flake check`, and the bridge tests at 41/41.
- On razer: type `install`, choose **Install an app** (click, then Return).
  The question and its answer appear in the card, the shell log has no
  `TypeError`, and a screenshot is kept for the PR. The symlink is then
  restored and checked.
