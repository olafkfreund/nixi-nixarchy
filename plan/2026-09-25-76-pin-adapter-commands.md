---
status: draft
issue: 76
spec: spec/2026-09-25-76-pin-adapter-commands.md
---

# Plan: Pin the commands Nixi launches

## The approved decisions, carried over

Implementable without opening the intent or spec.

1. **Four variables move from `--set-default` to `--set`**:
   `NIXI_CLAUDE_ACP_COMMAND`, `NIXI_CODEX_ACP_COMMAND`, `NIXI_OPENCODE_COMMAND`
   (`nix/package.nix:53,55,57`) and `NIXI_CONTEXT_COMMAND` (`:159`).
   `makeWrapper` emits `export VAR=${VAR-default}` for the first form and
   `export VAR='value'` for the second; only the second is unconditional.

2. **`NIXI_ACP_COMMAND` is left exactly as it is.** No code change. The
   per-agent name is read first in `bridge/harness-policy.js:adapterOverride`,
   so once the three per-agent variables are unconditionally set, the wildcard
   cannot be reached on a Nix deployment. It still works for `PATH` installs,
   and `bridge/testing/run-bridge.js:42` keeps using it.

3. **The env-var route for adapter development is given up.** The substitute —
   `services.nixi.package = pkgs.nixi.override { claudeAcp = …; }` — is
   documented in the module. No `allowCommandOverride` option: the pin is
   unconditional, with no code path around it.

4. **A build assertion is added** so a future edit back to `--set-default`
   fails the build. The existing check at `nix/package.nix:239` greps only for
   the variable *name*, which `--set` also emits, so it cannot tell the two
   spellings apart.

5. **`NIXI_BRIDGE_COMMAND` is out of scope**, filed as #77 and done next. It is
   read by `Quickshell.env()` in the card's own process, so no `makeWrapper`
   flag reaches it; it needs a QML change and a `tools/test_nixi.py` assertion.

6. **The residual surface is not claimed to be closed**: `NIXI_DIR`,
   `NIXI_FALLBACK_DIR`, `NIXI_DATA` (`bin/nixi-context:22-28`) and `NIXI_CWD`
   (`bridge/bridge.js:43`). `NIXI_DIR` in particular means the grounding-text
   question survives this change.

## Steps

1. **`nix/package.nix:48-50` — rewrite the comment before touching the flags.**
   It currently reads:

   > `# store paths become the bridge's defaults; --set-default keeps NIXI_* from the`
   > `# environment in charge.`

   That states the behaviour being removed. Replace with a statement of the new
   invariant and why: the build pins these commands, the environment cannot
   redirect them, and adapter development goes through a package override.
   → verify by reading the diff: no occurrence of "in charge" remains.

2. **`nix/package.nix:53,55,57` — `--set-default` → `--set`** in the three
   `adapterFlags` entries. Nothing else on those lines changes; the
   `lib.escapeShellArg (builtins.toJSON …)` values stay as they are.
   → verify by `grep -c 'set-default NIXI_.*ACP\|set-default NIXI_OPENCODE'
   nix/package.nix` returning 0.

3. **`nix/package.nix:159` — `--set-default` → `--set`** for
   `NIXI_CONTEXT_COMMAND` on the `makeWrapper` call at `:158`.
   → verify by `grep -n 'set-default NIXI_CONTEXT' nix/package.nix` returning
   nothing.

4. **`nix/package.nix:239` — add the spelling assertion** next to the existing
   `NIXI_CONTEXT_COMMAND` presence check, keeping that check:

   ```bash
   ! grep -qE 'NIXI_(CLAUDE_ACP|CODEX_ACP|OPENCODE|CONTEXT)_COMMAND=\$\{' $plugin/bridge/nixi-node \
     || { echo "an adapter or context command is still overridable from the environment"; exit 1; }
   ```

   `${` occurs only in the `${VAR-default}` form, so this distinguishes the two
   spellings. The message names the property, not the flag, so it still reads
   correctly if the mechanism changes.
   → verify by step 8.

5. **`nix/hm-module.nix:46-51` — document the substitute** in the `package`
   option's `description`. One short paragraph plus the override example, said
   plainly: the adapter commands are pinned by the build and cannot be
   redirected from the environment, so a locally built adapter goes here.
   → verify by `nix eval` of the module's option docs, and by step 9.

6. **Check `install.py` is genuinely unaffected** before claiming it. The
   imperative path does not build a wrapper, so it should not appear in the
   diff at all — confirm by grepping it for the four variable names and
   expecting nothing that sets them.
   → verify by `grep -n 'NIXI_.*_COMMAND' install.py` reviewed by eye.

## Tests

Run in this order; each is expected to pass.

```bash
# 1. Bridge suite unchanged -- proves decision 2 (NIXI_ACP_COMMAND) was right.
cd bridge && node --test ./*.test.js     # expect: 106 pass, 0 fail

# 2. Repo string assertions.
python3 tools/test_nixi.py                # expect: ok

# 3. Build, which runs installCheckPhase including the new assertion.
nix build .#nixi --no-link                # expect: exit 0

# 4. The generated wrapper says --set, not --set-default.
grep -E '^export NIXI_(CLAUDE_ACP|CODEX_ACP|OPENCODE|CONTEXT)_COMMAND=' \
  "$(nix build .#nixi --no-link --print-out-paths)/share/omarchy/plugins/io.github.olafkfreund.nixi/bridge/nixi-node"
# expect: four lines, each `export VAR='…'`, none containing `${`

# 5. Whole flake.
nix flake check                           # expect: exit 0
```

**Negative test for the new assertion** — it must actually fail when the
property is violated. Temporarily revert one flag to `--set-default`, rebuild,
and confirm the build fails with the new message; then restore. An assertion
never seen to fail is not evidence.

**Runtime check on razer** (the property itself, not the spelling):

```bash
NIXI_CODEX_ACP_COMMAND='["/bin/false"]' <plugin>/bridge/nixi-node <plugin>/bridge/bridge.js
```

with `NIXI_AGENT=codex`. Expect a `ready` event: the pinned adapter wins and
the hostile value is ignored. Against a `--set-default` build the same command
fails to start, which is the before/after pair. Assert the loaded plugin is the
new build before drawing any conclusion — swapping the symlink without
`omarchy restart shell` silently tests the old code.

## Rollback

Single commit touching two files, no runtime code, no state or schema change.
`git revert` restores the previous behaviour completely; a rebuild returns the
`${VAR-default}` wrapper. Anyone whose env-var override broke gets it back at
that point with no further action.
