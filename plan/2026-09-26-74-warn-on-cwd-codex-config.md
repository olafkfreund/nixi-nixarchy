---
status: approved
issue: 74
spec: spec/2026-09-26-74-warn-on-cwd-codex-config.md
---

# Plan: Notice what Nixi cannot account for

## The approved decisions, carried over

1. **Warn, never refuse.** A `diagnostic`, not a `fatal`. The file is inert
   unless the directory is also trusted in the user's `~/.codex/config.toml`.
2. **Every agent.** One condition, no `agentName` branch.
3. **Do not parse the file.** Existence is the signal; whether its contents are
   dangerous is codex's business and its format moves.
4. **`NIXI_FALLBACK_DIR` → `--set`.** It is a store path, so a build can pin
   it. This is #76's change applied to the variable it missed.
5. **`NIXI_DIR`, `NIXI_DATA`, `NIXI_CWD` are NOT pinned.** No build can know
   them: two are `HOME`-relative and `NIXI_CWD` is *derived* at runtime from
   whether `~/.config/nixi` exists. They are warned about instead.

## Steps

1. **`bridge/bridge.js` — the `.codex` check**, immediately after `cwd` is
   resolved (`:43-45`), guarded so it runs once at startup. Message names the
   path and says Nixi never creates one, with the reason (codex can run
   commands from it at session start).
   → verify by step 6's behavioural test.

2. **`bridge/bridge.js` — the environment notice**, beside it:

   ```js
   for (const name of ["NIXI_CWD", "NIXI_DIR", "NIXI_DATA"])
     if (process.env[name]) emit({ type: "diagnostic", text: `${name} is set in the environment; Nixi does not set it.` });
   ```

   `emit` is already defined and used for diagnostics at `:188`, `:329`, `:340`.
   → verify by step 6.

3. **`nix/package.nix:115` — `--set-default` → `--set`** for
   `NIXI_FALLBACK_DIR` on the `nixi-context` wrapper.
   → verify by step 7 and the extended assertion.

4. **`nix/package.nix:268` — extend the #76 assertion** to cover it:

   ```
   NIXI_(CLAUDE_ACP|CODEX_ACP|OPENCODE|CONTEXT)_COMMAND=[$][{]
   ```
   becomes a second grep, or the alternation grows to include
   `NIXI_FALLBACK_DIR=[$][{]`. Keep the character classes — written `=''${`
   the `$` is an ERE anchor and `{` opens an interval, so the pattern matches
   nothing and the check silently passes. That bug shipped in #76's first
   draft and only a negative test found it.
   → verify by step 8's negative test.

5. **`bridge/testing/run-bridge.js` — a new option** `codexProjectDir`, which
   creates `<home>/.config/nixi/.codex` before starting. It already creates
   `~/.config/nixi` under `options.configDir` (`:32`), so this is one line
   beside it.
   → verify by step 6 using it.

6. **`bridge/*.test.js` — a behavioural test**, not a string assertion:
   with `configDir: true, codexProjectDir: true`, the events contain a
   `diagnostic` mentioning `.codex`; without it, none does. Both directions,
   because a test that only checks the positive passes when the check fires
   unconditionally.

7. **Suites and build.**

8. **Negative tests, required — two of them.**
   - Remove the `.codex` check from `bridge.js`; the behavioural test must
     fail. Restore.
   - Revert `NIXI_FALLBACK_DIR` to `--set-default`; the build must fail with
     the assertion's message. Restore.

   On #76 an assertion that could never match passed two full builds before the
   regex was tested directly. Neither of these is optional.

## Tests

```bash
cd bridge && node --test ./*.test.js   # expect: 107+ pass, 0 fail
python3 tools/test_nixi.py             # expect: all checks passed
nix build .#nixi --no-link             # expect: exit 0
nix flake check                        # expect: exit 0
```

**Checked already, so the plan does not have to discover it:** no existing test
asserts on the diagnostic stream (`grep '"diagnostic"' bridge/*.test.js` is
empty), so the new lines cannot break an exact-output assertion. `test_nixi.py`
sets `NIXI_DIR`/`NIXI_DATA` and will now emit the notice — expected, not a
defect.

**Runtime on a real desktop.** Build with adapters pinned, swap the plugin,
`omarchy restart shell`, and **assert the loaded plugin is the new build before
concluding anything** — that mistake cost an hour on #38. Then:

- `mkdir ~/.config/nixi/.codex`, open the card, send a prompt: the diagnostic
  appears and the session still works;
- `rmdir` it, restart, confirm the diagnostic is gone.

Remove the directory and restore the plugin symlink afterwards.

## Rollback

`git revert`. Three files, no state, no schema, no protocol change. The
`--set` half reverts to `--set-default` exactly as #76's would.
