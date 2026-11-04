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

Add `devShells.<system>.default`, a `pkgs.mkShell` with `python3`, `bubblewrap`,
`passt` and `iproute2`, setting `NIXI_SANDBOX_TESTS = "require"`. The one
documented command, from the repo root, is:

```bash
nix develop -c python3 -B tests/test_plugin_sandbox.py
```

It takes `passt` from the flake's locked nixpkgs, the same one the package is
built with. The shell sets strict mode itself, so this command can't quietly
skip. `tests/test_plugin_sandbox.py:423` already has a `__main__` block.

### 2. A strict mode (`tests/test_plugin_sandbox.py`)

Add a `setUpModule` that does nothing unless `NIXI_SANDBOX_TESTS=require`. When
set, it raises `RuntimeError` naming whichever of `bwrap`, `pasta` or `ip` isn't
working. It repeats the skip conditions exactly: `shutil.which("bwrap") and
plugins.bwrap_ok()` (line 34), `plugins.pasta_ok()` and `shutil.which("ip")`.
Without the variable, runs behave as they do today.

The approved answer names pasta. `bwrap` and `ip` are included because their
skips would hide the same tests: the class-level `bwrap` skip hides all 36
sandbox tests.

### 3. The news tests prove refusal

The plugin adds a feed's name to `source` only after `url_ok` accepts it
(`plugins/examples/news/run`, `main`), so a refused feed and a tried-and-failed
feed give different results:

| | `source` |
| - | -------- |
| Refused | `2 couldn't be reached` |
| Tried and failed | `Private, Local · 2 couldn't be reached` |

Both tests use `assertIn`, which accepts either. Change each to `assertEqual`
on `"2 couldn't be reached"`:

- `test_news_refuses_unsafe_feed_urls_in_real_sandbox`
  (`tests/test_plugin_sandbox.py:413`), which keeps its name and now proves it,
  against the unmodified plugin in the real sandbox.
- `test_invalid_feeds_make_one_facts_card_without_network`
  (`tests/test_news_plugin.py:111`). Its `build_opener` trap raises in a thread
  and so can't fail the test. The exact assertion fills that gap, and this test
  runs in every normal run because it doesn't need pasta.

### 4. A wrapper check (`flake.nix`)

Add `checks.<system>.wrapper-has-sandbox-tools`, in the same `assert` style as
`status-module-assertions`. It asserts that the `postFixup` of `nixi-companion`
contains the `bubblewrap`, `passt` and `iproute2` bin paths, and needs about
three lines. It only evaluates, so it doesn't build the package: it took 0.2
seconds, and the derivation doesn't reference `nixi-companion`.

`bubblewrap` goes beyond the approved `passt` and `iproute2`, but costs one word
and guards all stage plugins.

### 5. Documenting the rule (`README.md`, new `CLAUDE.md`)

- **`README.md`:** a short "Working on it" section before "Need help?" with the
  command and the rule: a PR touching `app/plugins.py`,
  `tests/test_plugin_sandbox.py` or the wrapper's PATH (`nix/package.nix`) needs
  a passing run, and the PR says so. If it touches the wrapper's PATH, it also
  needs `nix build .#checks.x86_64-linux.wrapper-has-sandbox-tools`.
- **`CLAUDE.md`, new (decision 2):** a few lines pointing to that section. The
  repo has no agent instructions today, so agents wouldn't otherwise read it.

### 6. Proposed addition: catch port forwarding (decision 1)

**This goes beyond what the user approved.**

`test_network_plugins_cannot_reach_this_computers_own_services` listens on port
0, so the kernel picks an ephemeral port (32768-60999 on p620). With pasta's
`-T none` changed to `-T auto`, which forwards the host's loopback ports into
the plugin's namespace, the test **still passes**. On non-ephemeral port 28888
the same change fails it with `['connected'] != ['refused']`. So its TCP half
can't see the regression it exists to catch.

The cause looks like pasta leaving ephemeral ports out of `auto`. That is
inferred from these runs; I haven't read pasta's source. Two small changes:

- **The flags:** `test_argv_shape` asserts `-t none -u none -T none -U none`.
  It doesn't check them today. This covers all four directions and runs in every
  normal run.
- **The live probe:** `serve()` (`tests/test_plugin_sandbox.py:97`) binds a free
  port below the host's real ephemeral range, read from
  `/proc/sys/net/ipv4/ip_local_port_range`. If it finds none, the test errors
  instead of quietly using an ephemeral port.

## Alternatives rejected

- **A long `nix shell` one-liner, no flake change:** nothing would set strict
  mode, so forgetting it brings back the quiet skip. `nixpkgs#passt` also comes
  from the registry, not the flake's lock. (It happened to match on p620.)
- **Renaming the sandbox news test and recording calls to `fetch`:** the first
  draft of this spec did that. The rename contradicted the approved answer, and
  a recorder called from daemon threads could fire after the assertion. The
  exact `source` assertion avoids both.
- **Grepping the built wrapper:** it would make `nix flake check` build the full
  WebKit, whisper and piper closure, which none of today's checks do. It would
  not be much stronger either, because it still only finds a string.
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
- **The wrapper check reads the recipe, not the result.** It would miss something
  that changes PATH later. `bin/nixi-companion:21` prepends `~/.local/bin` and
  keeps the rest, which is fine today.
- **The news assertion is tied to the `source` format.** Rewording it fails both
  tests. That failure is loud, and the fix is to update the string.
- **Still only as good as the tests.** Passing doesn't prove the sandbox is
  complete. The limits listed in the intent remain, including that
  `..._other_addresses` takes its list from `_host_addrs` itself. The live
  own-services test probes only `127.0.0.1` over IPv4 and one abstract socket;
  `--no-map-gw` and the UDP flags are checked only as flags.
- **New store path.** `nix/package.nix` uses `src = ../.`, so these files change
  the package's hash, as any commit does. Its installed contents don't change.

## Verification

Each of these was tried in the scratch copy, and the plan repeats them on the
real change:

1. `nix develop -c python3 -B tests/test_plugin_sandbox.py`: `Ran 37`, `OK`,
   nothing skipped.
2. `python3 -B tests/test_plugin_sandbox.py` in a plain p620 shell:
   `OK (skipped=6)`, unchanged.
3. `NIXI_SANDBOX_TESTS=require python3 -B tests/test_plugin_sandbox.py` in the
   same shell: fails and names `pasta`, exit 1.
4. `python3 -B -m unittest test_news_plugin` from `tests/`: `OK`.
5. `nix build .#checks.x86_64-linux.wrapper-has-sandbox-tools`: passes.
6. The changes in the table below, each in a scratch copy, give the results
   shown.
7. `git diff --stat` shows nothing under `app/` or `plugins/`.

### What was tried

| Change in the scratch copy | Test | Result |
| -------------------------- | ---- | ------ |
| Removed the route step | `..._other_addresses` | fails, as it should |
| Removed `--disable-userns` and `--cap-drop ALL` | `..._with_pasta` | fails, as it should |
| `url_ok` disabled, tests as they are today | both news tests | **pass: can't catch it** |
| `url_ok` disabled, `assertEqual` | both news tests | fail, as they should |
| `-T auto`, tests as they are today | `..._own_services` | **passes: can't catch it** |
| `-T auto`, with section 6 | `..._own_services`, `test_argv_shape` | both fail, as they should |
| `passt` removed from `nix/package.nix` | `wrapper-has-sandbox-tools` | fails, as it should |

The RSS example test wasn't tried this way.

## Decisions

1. **Include the port-forwarding fix (section 6)?** It wasn't in the approved
   answers. It's one assertion and a few lines in `serve()`. Without it, the main
   test named in #190 misses the regression it's for. Recommended: **yes**. The
   flag assertion alone is the smaller option, but it doesn't prove pasta's
   actual behaviour.
2. **Add a `CLAUDE.md` to the snowflake repo?** The rule was approved, but where
   it lives wasn't. Recommended: **yes**, because a README-only rule may not reach
   agents. The alternative is README only.
