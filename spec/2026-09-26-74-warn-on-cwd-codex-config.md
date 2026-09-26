---
status: draft
issue: 74
intent: intent/2026-09-26-74-warn-on-cwd-codex-config.md
---

# Spec: Notice what Nixi cannot account for

## Design

Two halves, joined by one idea: **Nixi should say when its own environment is
not what it arranged.** Neither half tries to decide whether the difference is
malicious; both just refuse to be silent about it.

### Half 1 — an unexpected `.codex/` in the working directory

`bridge/bridge.js`, once at startup, after `cwd` is resolved (`:43-45`):

```js
// codex loads <cwd>/.codex/config.toml as a project config layer when the
// directory is trusted in the user's own ~/.codex/config.toml, and an
// mcp_servers entry there runs AT SESSION START, outside any permission
// request (#74). Nixi chose this directory and never writes .codex into it,
// so its presence is always either a mistake or someone else's doing. Not
// parsed: whether a given file is dangerous is codex's business, not Nixi's.
if (existsSync(join(cwd, ".codex")))
  emit({ type: "diagnostic", text: `Unexpected .codex directory in ${cwd} — Nixi never creates one. If you did not put it there, remove it: codex can run commands from it at session start.` });
```

Warn rather than refuse (approved): the file is inert unless the directory is
*also* trusted, so refusing would block sessions that are provably safe. Every
agent (approved): only codex reads the path, but an unexplained file in a
directory Nixi owns is worth surfacing regardless, and it is one branch fewer.

### Half 2 — the residual path variables

The intent folded these in. Working through them individually rather than
pinning them uniformly, because **only one of the four has a value the build
can know**:

| Variable | Default | Knowable at build time? |
| --- | --- | --- |
| `NIXI_FALLBACK_DIR` | `$out/share/nixi` (`package.nix:115`) | **yes — a store path** |
| `NIXI_DIR` | `~/.config/nixi` (`nixi-context:22`) | no — `HOME`-relative |
| `NIXI_DATA` | `~/.local/share/nixi` (`nixi-context:28`, `bridge.js:310`) | no — `HOME`-relative |
| `NIXI_CWD` | derived: `~/.config/nixi` if it exists, else `HOME` (`bridge.js:43-45`) | no — derived at runtime |

So:

**`NIXI_FALLBACK_DIR` → `--set`.** Exactly #76's change, applied to the one it
missed. It points at bundled knowledge inside the package; an environment value
replaces what the agent is told is true. `nix/package.nix:115`.

**The other three are not pinnable, and pretending otherwise would be worse
than leaving them.** There is no constant a build could write: `HOME` is not
known when the derivation is built, and `NIXI_CWD` is a *derived* value — the
bridge picks it by testing whether `~/.config/nixi` exists. Freezing a guess
into the wrapper would replace a correct runtime decision with a stale one.

They get the same treatment as half 1 instead — say when they are set:

```js
for (const name of ["NIXI_CWD", "NIXI_DIR", "NIXI_DATA"])
  if (process.env[name])
    emit({ type: "diagnostic", text: `${name} is set in the environment; Nixi does not set it. It changes where the agent runs or what it is told.` });
```

This keeps the property the intent actually wants — *nothing about Nixi's
environment is silently different from what Nixi arranged* — without inventing
values that cannot be correct.

## Alternatives rejected

- **Pin `NIXI_DIR` / `NIXI_DATA` / `NIXI_CWD` in the wrapper anyway**, to e.g.
  `$HOME/.config/nixi`. Rejected: `makeWrapper` would have to emit a literal,
  and `$HOME` at build time is the builder's, not the user's. For `NIXI_CWD` it
  is worse — the bridge deliberately falls back to `HOME` when
  `~/.config/nixi` is absent, and a pinned value would break that.
- **Make the bridge ignore the three variables.** Stronger, but it breaks
  `tools/test_nixi.py:81,767`, which sets `NIXI_DIR` and `NIXI_DATA` to drive
  `bin/nixi-context` against fixtures. Removing a capability the test suite
  depends on, to close a hole that requires local code execution to exploit, is
  the wrong trade.
- **Parse `<cwd>/.codex/config.toml` and warn only when it looks dangerous.**
  Rejected in the intent: it couples Nixi to codex's config format and trust
  semantics, both of which move. Existence is the durable signal.
- **Refuse to start on `.codex/`.** Rejected by the approver; the file is inert
  unless the directory is separately trusted.

## Risks

- **Diagnostic noise.** `tools/test_nixi.py` sets `NIXI_DIR`/`NIXI_DATA`, so
  its runs will now emit these lines. That is correct behaviour, not a defect,
  but it changes test output and the plan must check nothing asserts on an
  exact diagnostic stream.
- **A warning nobody reads.** The card's `diagnostic` stream is not prominent —
  acknowledged in the intent and accepted with the "warn" decision. This makes
  the situation *discoverable*, not impossible.
- **`--set` on `NIXI_FALLBACK_DIR`** removes an override nobody in this repo
  uses. Same trade as #76, one variable later.
- **Startup cost:** one `existsSync` and three `process.env` reads.

## Verification

1. **`tools/test_nixi.py`** — a new test asserting the bridge contains the
   `.codex` check and the three-variable loop, since CI cannot execute the
   bridge's startup path against a synthetic cwd.
2. **`bridge/` behavioural test** — `bridge/testing/run-bridge.js` already
   builds a temporary `HOME` and can create `<cwd>/.codex`. A real test that
   the `diagnostic` is emitted is worth more than a string assertion, and this
   is the one place it is cheap to do properly.
3. **Negative test, required.** Remove the check, confirm the behavioural test
   fails; restore. On #76 an assertion that could never match passed two builds
   before the regex was tested directly.
4. **`--set` verified in the built wrapper:** `NIXI_FALLBACK_DIR` appears as
   `export …='…'`, with no `${` default-expansion form, and the
   `installCheckPhase` assertion from #76 extended to cover it.
5. **Suites:** `node --test`, `tools/test_nixi.py`, `nix build`, `nix flake check`.
6. **Runtime on a real desktop:** create `~/.config/nixi/.codex/`, open the
   card, confirm the diagnostic appears and the session still works; remove it
   afterwards. Assert the loaded plugin is the new build first.
