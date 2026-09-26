---
status: approved
issue: 79
spec: spec/2026-09-26-79-drop-huginn-internal.md
---

# Plan: Remove HUGINN_INTERNAL

## The approved decisions, carried over

1. **Remove, do not document.** No reader exists outside this repository:
   `omarchy-4.0.4` as packaged (1489 files) and the resolved shell tree
   quickshell runs (1407 files, symlinks followed) both return zero matches,
   case-insensitive, each with a positive control.
2. **Two sites only:** `Conversation.qml:199` and `bridge/bridge.js:142`.
3. **The `env` prefix stays.** It still carries `NIXI_AGENT`, `NIXI_MODEL` and
   `NIXI_REASONING_EFFORT`, followed by the interpreter literal pinned in #77.
4. **`CODEX_PATH` and `CLAUDE_CODE_EXECUTABLE` stay**, along with the comment
   above them, which describes those rather than the marker.
5. **An absence assertion goes in `tools/test_nixi.py`**, weak by nature but
   the only guard CI can offer for QML, and it gets a negative test.

## Steps

1. **`Conversation.qml:199` — drop the assignment from the array.**

   ```qml
   readonly property var bridgeCommand: ["env",
     "NIXI_AGENT=" + agentName, "NIXI_MODEL=" + modelName,
     "NIXI_REASONING_EFFORT=" + reasoningEffort,
     "node", root.bridgeScript("bridge.js")]
   ```

   The bare `node` literal must survive untouched — `nix/package.nix:175` uses
   `--replace-fail` on it and fails the build if it moves (#77).
   → verify by `grep -c '"node"' Conversation.qml` unchanged, and step 5's build.

2. **`bridge/bridge.js:142` — drop the property.**

   ```js
   const childEnvironment = { ...process.env };
   ```

   The conditional `CODEX_PATH` / `CLAUDE_CODE_EXECUTABLE` assignments below,
   and the comment above them, are unchanged.
   → verify by reading the diff: three lines of context either side untouched.

3. **`tools/test_nixi.py` — new `test_no_huginn_marker`.** Assert `HUGINN`
   appears in neither `Conversation.qml` nor `bridge/bridge.js`, with a message
   naming the file and saying why (a marker with no reader reads as
   load-bearing and is not).
   → verify by step 4.

4. **Negative test, required.** Reintroduce `HUGINN_INTERNAL` into each file in
   turn, confirm `tools/test_nixi.py` fails naming that file, restore both.
   Both files, not one: an assertion that only ever checked the first would
   pass while the second regressed, and this test exists precisely because the
   name is easy to reinstate by pattern-matching.

5. **Build and suites.**

## Tests

```bash
python3 tools/test_nixi.py            # expect: all checks passed
cd bridge && node --test ./*.test.js  # expect: 106 pass, 0 fail
nix build .#nixi --no-link            # expect: exit 0
nix flake check                       # expect: exit 0
```

**Runtime, on a real desktop.** Build with adapters pinned, swap the plugin,
`omarchy restart shell`, and **assert the loaded plugin is the new build before
concluding anything** — `grep -c HUGINN` on the symlink target's
`Conversation.qml` must be 0, and the installed one must be 1. Then:

- open the card, send a prompt, confirm the agent answers — the only thing this
  change could break is a malformed argv;
- find the bridge process and check the marker is gone from its environment:

  ```bash
  tr '\0' '\n' < /proc/<bridge-pid>/environ | grep -c HUGINN   # expect 0
  ```

Check the **bridge** process, not quickshell. quickshell never carried this
variable, so a check there returns 0 either way and proves nothing — that
mistake was already made once while investigating this issue.

Restore the plugin symlink and restart the shell afterwards.

## Rollback

Two one-line deletions and one test. `git revert` restores the marker exactly.
Nothing persists, nothing migrates, no Nix or protocol change.
