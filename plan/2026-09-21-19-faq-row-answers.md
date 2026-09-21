---
status: approved
issue: 19
spec: spec/2026-09-21-19-faq-row-answers.md
---

# Plan: Choosing a FAQ row shows its answer

## Approved decisions

- Fix `Conversation.qml:969` from `root.messages.append(...)` to
  `messages.append(...)`. Nothing else in the card changes.
- A general test: for every `ListModel { id: X }` in `Conversation.qml`,
  `root.X` must not appear. It is seen to fail before the fix.
- Remove the "choosing one does nothing yet" note from `README.md` and
  `docs/index.html`, and say plainly that FAQ answers show in the card with
  no agent. No new screenshot (that is #26).
- Test on razer by building, `nix copy` to razer, a plugin symlink swap, a
  shell restart, the test, then restoring the symlink and checking it.
- Shared with #20 and #21: razer tests run one at a time, and the merge
  order is #19, then #20, then #21, each rebased on `master` first.

## Steps

1. **`tools/test_nixi.py`**: in `test_nixi_rows_are_searchable`, add the
   rule. Collect `re.findall(r'ListModel\s*\{\s*id:\s*(\w+)', card)` and
   assert that no `root.<id>` occurs. Run it on the unfixed file.
   → verify: it fails naming `root.messages`.
2. **`Conversation.qml`**: change line 969.
   → verify: step 1's test passes; `grep -c "root.messages" Conversation.qml`
   is 0.
3. **Docs**: in `README.md`, replace "The FAQ rows show up in search too,
   but choosing one [does nothing yet](…/19)." with a sentence saying that
   choosing a FAQ row shows its written answer, with no agent. In
   `docs/index.html`, the note under "No AI needed" becomes a plain caption
   saying the same, without the warning styling.
   → verify: `grep -c "issues/19" README.md docs/index.html` is 0 for both.
4. **Repo checks**: `python3 tools/test_nixi.py`, `node --test
   bridge/*.test.js` (41/41), `nix flake check`, `git diff --check`, and
   `omarchy plugin validate` on a clean copy.
   → verify: all pass.
5. **razer**:
   1. `nix build .#nixi -o $JOB/n19`, then `nix copy --to ssh://razer`.
   2. Record `readlink ~/.config/omarchy/plugins/io.github.olafkfreund.nixi`,
      point the link at `<build>/share/omarchy/plugins/io.github.olafkfreund.nixi`,
      and run `omarchy-restart-shell`.
   3. Ask for control through ai-mirror (ask, then wait for your yes).
   4. Open the card, type `install`, click **Install an app**, press Return.
   5. Screenshot the card (cropped).
   6. `journalctl --user --since -5min | grep -c "Conversation.qml.*TypeError"`.
   7. Restore the link, `omarchy-restart-shell`, `readlink` again, and
      release control.

   → verify: the question and the answer appear in the card; 0 TypeErrors;
   the link is back on its Home Manager target.

   *Deviation (implementation):* a plain `nix build .#nixi` pins no ACP
   adapter. Home Manager builds Nixi with `package.override` and the user's
   adapters, so the swapped-in card reported "claude-agent-acp is not on the
   system PATH". FAQ answers need no agent, so the fix still showed, but #20
   and #21 need Claude. The test build is now
   `nixi.override { claudeAcp; codexAcp; opencodeAcp }`, using the exact store
   paths razer's Home Manager `nixi-node` already pins, read from that
   wrapper. With that build on razer, the FAQ answer appeared, 0 TypeErrors
   were logged, and the link was restored.
6. **Commit and PR**: `fix: choosing a FAQ row shows its answer (#19)`,
   using the repo's PR template, linking intent, spec and plan, with the
   razer screenshot.
   → verify: CI green; any review thread fixed and resolved.

## Tests

| check | expected |
| --- | --- |
| new assertion, before fix | fails on `root.messages` |
| `python3 tools/test_nixi.py` | all checks passed |
| `node --test bridge/*.test.js` | 41/41 |
| `nix flake check`, `omarchy plugin validate` | pass |
| razer | FAQ answer shown, no TypeError, symlink restored |

## Rollback

Revert the commit. On razer, the symlink is already restored by step 5; if
it were not, Home Manager's next switch restores it.
