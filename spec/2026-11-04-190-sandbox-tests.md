---
status: draft
issue: 190
intent: intent/2026-11-04-190-sandbox-tests.md
---

# Spec: run the plugin network-sandbox tests somewhere

All changes land in olafkfreund/nixoarchy-snowflake, in tests, `flake.nix` and
docs. `app/` and `plugins/` don't change. Everything below was tried in a
scratch copy of `main` at `f6462c2`, with no repo edits; "What was tried" gives
the results.

## Design

### 1. A dev shell (`flake.nix`)

Add `devShells.default`, a `pkgs.mkShell` with `python3`, `bubblewrap`, `passt`
and `iproute2`, setting `NIXI_SANDBOX_TESTS = "require"`. The one documented
command is:

```bash
nix develop -c python3 -B tests/test_plugin_sandbox.py
```

It takes `passt` from the flake's locked nixpkgs, the same one the package is
built with. The shell sets strict mode itself, so this command can't quietly
skip. `tests/test_plugin_sandbox.py:423` already has a `__main__` block, so no
`cd` is needed.

### 2. A strict mode (`tests/test_plugin_sandbox.py`)

Add a `setUpModule` that does nothing unless `NIXI_SANDBOX_TESTS=require`. When
set, it raises `RuntimeError` naming whichever of `bwrap`, `pasta` or `ip` isn't
working. It uses the existing `plugins.bwrap_ok()`, `plugins.pasta_ok()` and
`shutil.which("ip")`, which are the conditions behind every skip in this file.
That includes the class-level `bwrap` skip at line 34, which would otherwise
hide all 36 sandbox tests. Without the variable, runs behave as they do today.

### 3. The news test proves refusal (`tests/test_news_plugin.py`)

There are two news tests, and neither proves refusal today:

- **`test_invalid_feeds_make_one_facts_card_without_network` (line 101).** It
  makes `build_opener` raise `AssertionError`, but `fetch` runs in a thread, so
  the error can't fail the test. With `url_ok` disabled it prints "network
  called" and still ends in `OK`. **Change it** to patch `news.fetch` with a
  recorder and assert that nothing was fetched.
- **`test_news_refuses_unsafe_feed_urls_in_real_sandbox`
  (`tests/test_plugin_sandbox.py:398`).** Nothing answers those URLs inside the
  sandbox, so it passes either way. What it does prove is that the plugin
  finishes in time and returns one facts card from inside the sandbox. **Rename
  it** `test_news_with_unreachable_feeds_finishes_in_real_sandbox` and keep its
  assertions.

The URL check is plain Python that runs before any network use, so the sandbox
adds nothing to proving it. The changed test also runs in every normal run,
because it doesn't need pasta.

### 4. A wrapper check (`flake.nix`)

Add `checks.<system>.wrapper-has-sandbox-tools`, a `runCommand` of about five
lines that greps the built wrapper for the `bubblewrap`, `passt` and `iproute2`
bin paths. This meets the "only if it stays small" condition. `nix flake check`
picks it up.

### 5. Documenting the rule (`README.md`, new `CLAUDE.md`)

- **`README.md`:** a short "Working on it" section before "Need help?" with the
  command and the rule: a PR touching `app/plugins.py`,
  `tests/test_plugin_sandbox.py` or the wrapper's PATH (`nix/package.nix`) needs
  a passing run, and the PR says so. If it touches the wrapper's PATH, it also
  needs `nix build .#checks.x86_64-linux.wrapper-has-sandbox-tools`.
- **`CLAUDE.md`, new:** a few lines pointing to that section. Most PRs here come
  from agents, and the repo has no agent instructions, so they wouldn't read
  the README section otherwise.

### 6. Proposed addition: the own-services test catches forwarding

**This goes beyond what the user approved (decision 1 below).**

`test_network_plugins_cannot_reach_this_computers_own_services` listens on port
0, so the kernel picks an ephemeral port (32768-60999 on p620). With pasta's
`-T none` changed to `-T auto`, which forwards the host's loopback ports into
the plugin's namespace, the test **still passes**. On non-ephemeral port 28888
the same change fails it with `['connected'] != ['refused']`. So its TCP half
can't see the regression it exists to catch.

The cause looks like pasta leaving ephemeral ports out of `auto`. That is
inferred from these two runs; I haven't read pasta's source.

The fix is to make `serve()` (`tests/test_plugin_sandbox.py:97`) bind a free port
below the ephemeral range, by trying a small fixed range until one binds. It
also serves `test_no_network_unless_the_manifest_says_so`, which isn't affected.

## Alternatives rejected

- **A long `nix shell` one-liner, no flake change:** nothing would set strict
  mode, so forgetting it brings back the quiet skip. `nixpkgs#passt` also comes
  from the registry, not the flake's lock. (It happened to match on p620.)
- **Proving refusal inside the real sandbox:** it would need a doctored copy of
  the plugin, to prove something that happens before any network use.
- **Adding a new news test beside line 101:** that would leave a test whose name
  and comment claim something false.
- **Adding `ip` to the three pasta-only guards (lines 112, 366, 397) and to
  `test_argv_shape`:** without `ip` they fail loudly, which is safe, and strict
  mode already requires `ip`. Not worth the diff.
- **A PR template or a git hook:** `gh pr create --body` ignores a template, and
  a hook isn't shared through the repo.
- **A VM test or GitHub Actions:** the user chose option A.

## Risks

- **The rule isn't enforced.** Nothing stops a PR that skips the command. The
  user accepted this with option A, and #193 tracks automatic runs for the rest
  of the suite.
- **Strict mode depends on the host.** On a machine where user namespaces or
  `/dev/net/tun` are restricted, the command fails. That is the intended result,
  but it was only tried on p620.
- **Still only as good as the tests.** Passing doesn't prove the sandbox is
  complete. The limits listed in the intent remain, including that
  `..._other_addresses` takes its list from `_host_addrs` itself. The live
  own-services test also probes only `127.0.0.1`; `--no-map-gw` is checked only
  by the flag assertion in `test_argv_shape`.
- **Port range in the addition.** A fixed range assumes the host's ephemeral
  range starts above it. On a host with an unusual range, the test would go back
  to not catching forwarding, without any error.
- **New store path.** `nix/package.nix` uses `src = ../.`, so these files change
  the package's hash, as any commit does. Its installed contents don't change.
- **`wrapper-has-sandbox-tools` builds the package,** so it needs the package's
  closure. It took about 7 seconds on p620, where that was already cached.

## Verification

Each of these was tried in the scratch copy, and the plan repeats them on the
real change:

1. `nix develop -c python3 -B tests/test_plugin_sandbox.py`: `Ran 37`, `OK`,
   nothing skipped.
2. `python3 -B tests/test_plugin_sandbox.py` in a plain p620 shell:
   `OK (skipped=6)`, unchanged.
3. `NIXI_SANDBOX_TESTS=require python3 -B tests/test_plugin_sandbox.py` in the
   same shell: fails and names `pasta`, exit 1.
4. `python3 -B -m unittest test_news_plugin` from `tests/`: `OK`. With `url_ok`
   disabled in a scratch copy, the changed test fails.
5. `nix build .#checks.x86_64-linux.wrapper-has-sandbox-tools`: passes. With
   `passt` removed from `nix/package.nix` in a scratch copy, it fails.
6. If the addition is approved: changing `-T none` to `-T auto` in a scratch copy
   fails the own-services test.
7. `git diff --stat` shows nothing under `app/` or `plugins/`.

### What was tried

| Change in the scratch copy | Test | Result |
| -------------------------- | ---- | ------ |
| Removed the route step | `..._other_addresses` | fails, as it should |
| Removed `--disable-userns` and `--cap-drop ALL` | `..._with_pasta` | fails, as it should |
| `-T auto`, ephemeral listener (today) | `..._own_services` | **passes: can't catch it** |
| `-T auto`, listener on 28888 | `..._own_services` | fails, as it should |
| `url_ok` disabled, line 101 as it is | `test_invalid_feeds_...` | **passes: can't catch it** |
| `url_ok` disabled, line 101 changed | `test_invalid_feeds_...` | fails, as it should |
| `url_ok` disabled | real-sandbox news test | passes, hence the rename |
| `passt` removed from the wrapper | `wrapper-has-sandbox-tools` | fails, as it should |

The RSS example test wasn't tried this way.

## Decisions

1. **Include the own-services fix (design section 6)?** It wasn't in the approved
   answers. It's a few lines in `serve()`. Without it, the main test named in
   #190 misses the regression it's for. Recommended: **yes**.
2. **Add a `CLAUDE.md` to the snowflake repo?** The rule was approved, but where
   it lives wasn't. Recommended: **yes**, because a README-only rule won't reach
   the agents who open most PRs. The alternative is README only.
