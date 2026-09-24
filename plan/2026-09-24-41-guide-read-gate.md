---
status: draft
issue: 41
spec: spec/2026-09-24-41-guide-read-gate.md
---

# Plan: Document what Guide actually does, and close the Grep/Glob gap

Approved decisions, carried over so this file stands alone:

- **Guide keeps unprompted `Read`/`Grep`/`Glob`.** This is now a deliberate,
  documented design decision: a read-only tutor that can inspect the machine it
  is teaching about. `claudePermissions` is **not** trust-gated.
- The documentation is what changes, in five places, and must draw the
  distinction the current wording conflates: Guide prevents *changing* the
  machine, and permits *reading* it without asking.
- The secret-path list is still fixed, because it covers only one of the three
  allowed read tools. Generate it over all three names from the single existing
  path list -- never three literal copies.

## Steps

1. `bridge/trust-policy.js:57-66`: rename the constant to `SECRET_PATHS` and
   strip the `Read(...)` wrapper from its 16 entries, leaving bare paths
   (`~/.ssh/**`, `/run/agenix/**`, `**/.env`, …). The list's contents do not
   change.
   -> verify by the list having the same 16 entries, none containing `(`.

2. `bridge/trust-policy.js:69-74`: build the `ask` list by mapping
   `["Read", "Grep", "Glob"]` over `SECRET_PATHS`, giving 48 rules from one
   source. `allow` is unchanged for both trust levels.
   -> verify by the new test in step 6.

3. `bridge/trust-policy.js:1-12`: rewrite the header comment to state the actual
   invariant -- Guide cancels every permission request that reaches the bridge,
   and `Read`/`Grep`/`Glob` are applied by Claude Code's own settings so they
   never produce one. Note that secrets ask in both levels. This comment is the
   origin of the false claim and is the canonical statement the prose references.
   -> verify by reading it against the code with both open.

4. `README.md:156-158`: replace "The bridge **cancels every permission request**
   before it reaches you" with wording that keeps the true part and corrects the
   false part: the bridge cancels every permission request it receives; reading
   and searching happen without a prompt so Nixi can look at your configuration;
   sensitive paths still ask. Keep "Nothing on your machine changes" -- it is
   accurate.
   -> verify by a reader being able to predict, from the paragraph alone, that
   Guide reads files without asking.

5. `README.md:33` (walkthrough caption) and `README.md:163-166` (the per-agent
   table rows reading "requests cancelled"): same correction, one clause each.
   -> verify by `grep -n 'cancels every permission request' README.md` returning
   no unqualified instance.

6. `docs/architecture.md:134-136`: qualify "every ACP permission request is
   cancelled in the bridge and never reaches the card", and add the mechanism --
   Claude Code applies the allowlist itself, so those three tools never reach
   ACP at all. This is the sentence that explains *why* there is nothing to
   cancel.
   -> verify by the explanation naming the mechanism, not just the outcome.

7. `bridge/trust-policy.test.js`: add cases asserting (a) the generated `ask`
   list contains a `Read(`, a `Grep(` and a `Glob(` entry for the same path,
   (b) `SECRET_PATHS.length` is at least 16 so the list cannot silently shrink,
   (c) `allow` is unchanged for guide and mechanic. The existing behavioural
   harness already asserts what the bridge sends at `newSession`, so the
   generated object is checked as transmitted, not just as constructed.
   -> verify by `node --test bridge/trust-policy.test.js`.

## Tests

```bash
node --test bridge/*.test.js
# expect: all pass, including the three new trust-policy assertions

nix flake check --print-build-logs
# expect: checks.package, checks.selfcheck, checks.hm-module-eval pass

# No unqualified claim survives anywhere
grep -rn 'cancels every permission request' README.md docs/ bridge/
# expect: every hit is qualified by the reads exception
```

Runtime checks, after rebuild and `omarchy-restart-shell`:

1. **The gap, closed.** In Mechanic, ask the agent to grep a pattern under
   `~/.ssh/`. Expected: a permission prompt. Before this change there is none.
2. **The same for Glob.** Ask it to glob `~/.ssh/**`. Expected: a prompt.
3. **No regression.** In Mechanic, an ordinary `Grep` under `~/.config/nixi`
   runs with no prompt.
4. **Guide unchanged.** In Guide, reads still happen without a prompt -- this is
   now the documented behaviour, and this check exists to confirm the change did
   **not** alter it.
5. **Pattern semantics actually fire.** The sharpest risk in the spec: an `ask`
   rule that is well-formed but never matches looks like protection and is not.
   Checks 1 and 2 are what prove the generated `Grep(`/`Glob(` forms match real
   tool invocations, so neither may be skipped.

## Rollback

`git revert` the implementation commit.

- The docs half carries no runtime effect; reverting only restores inaccurate
  prose.
- The `SECRET_PATHS` refactor changes the shape of an exported constant. Nothing
  outside `trust-policy.js` and its test imports it (`grep -rn
  CLAUDE_SECRET_READS bridge/` before starting, to confirm this still holds).
- If the tripled `ask` list proves too noisy in Mechanic -- the accepted risk,
  since it lands in the level #27 originally complained about -- the narrower
  fallback is to generate `Grep`/`Glob` rules for the credential paths only
  (`~/.ssh`, `~/.gnupg`, `/run/agenix`, `**/.env`, `**/*.age`) rather than all
  16. That keeps the material protection and drops the prompts most likely to
  fire during ordinary work.
