---
status: draft
issue: 190
author: olafkfreund
---

# Intent: run the plugin network-sandbox tests somewhere

## Problem

Six tests in `tests/test_plugin_sandbox.py` (olafkfreund/nixoarchy-snowflake)
skip in a normal `python3 -m unittest` run on p620, because `pasta` isn't on
that PATH. The run still ends in `OK (skipped=6)`, so it looks clean.

They are the only tests that run a network plugin in the real sandbox:

| Test (line) | What it checks |
| ----------- | -------------- |
| `test_network_plugins_cannot_reach_this_computers_own_services` (113) | no access to host loopback or abstract sockets |
| `test_network_plugins_cannot_reach_this_computers_other_addresses` (127) | no access to the host's other addresses |
| `test_the_routes_cannot_be_removed_from_inside` (141) | the plugin can't delete the blocking routes |
| `test_no_nested_userns_no_mounts_no_capabilities_with_pasta` (166) | no capabilities or new namespaces under pasta |
| `test_rss_headlines_example_against_a_local_feed` (367) | the RSS example works; with the network off it can't |
| `test_news_refuses_unsafe_feed_urls_in_real_sandbox` (398) | the news plugin, given private and local feed URLs, ends in "couldn't be reached" (this doesn't prove it refused them; see "What was run") |

Nothing else runs them, so a change that breaks this protection would pass
every check we have:

- **No CI.** `.github/workflows/` was deleted in `4f24f4c` (#94). The only
  GitHub Actions entry is GitHub's own Copilot code review.
- **No check phase in the package.** `nix/package.nix` has no `doCheck`.
- **No test in the flake checks.** `flake.nix` has three checks, and none runs
  the unit tests. The `checkPhase` in `nix/plugin.nix` only validates a plugin
  manifest.

### How serious it is

This is a gap in testing. I found no hole in the running sandbox, and missing
pasta doesn't open one, but this is not proof that the sandbox is complete.
Checked against snowflake `main` at `7af143c`:

- **The deployed package carries its own pasta.** `nix/package.nix:118-119`
  puts `iproute2` and `passt` on the wrapper's PATH. The server running on
  p620 has both on its PATH (read from `/proc/<pid>/environ`). Only an
  interactive shell lacks pasta, which is why only the tests are affected.
- **The deployed sandbox code matches `main`:** `pasta_ok()` through
  `sandbox_argv()`, `_launch` and `ROUTER` are identical in the installed
  store path.
- **A network plugin fails closed when pasta is missing:**
  - `_launch` raises `StageError` before anything starts
    (`app/plugins.py:824-825`). The user sees "plugins that use the internet need
    pasta (passt), and it doesn't work here" (`app/server.py:4871`).
  - If pasta disappears after `pasta_ok()` remembered `True`, pasta is still
    the program being started (`app/plugins.py:592`). `Popen` raises `OSError`
    and the run ends in "couldn't start it" (`:858`). `bwrap --share-net` is
    only ever started by pasta, and `_run_copy`, called from `_launch`, is the
    only caller of `sandbox_argv` in `app/` (`:855`).
  - If the host's addresses can't be read, the run stops (`:558`). If a
    blocking route can't be added, or `ip` is gone, `ROUTER` exits before it
    starts the plugin (`:536`) and the run ends in "it failed" (`:900`).
  - A refused run can still show the plugin's last good result, marked
    "couldn't refresh" (`:800-804`). The plugin itself doesn't run.
- **The refusal is tested without pasta.**
  `test_a_network_plugin_will_not_run_without_pasta` and
  `test_a_network_plugin_will_not_run_without_the_address_list` run and pass
  in the normal run.

Limits of the protection itself, which fail-closed doesn't cover:

- Only addresses `_host_addrs` returns are blocked. If it succeeds but leaves
  one out, that address stays open, and `..._other_addresses` can't notice,
  because it takes its list from the same function (`tests/...:128`).
- An address that appears during a run stays open for that run, at most
  `TIME_MAX` (`:546`). The code says so.
- Network plugins can reach the LAN by design (`:591`).

What remains is the risk of an unnoticed regression:

- A change to the pasta flags, `ROUTER` or `_host_addrs` could open a network
  plugin's path to this computer's own services, and the test run would stay
  `OK`.
- Removing `passt` from the wrapper would stop the news and RSS plugins (they
  would refuse to run), and no check would catch it.

### What was run

With `nix shell nixpkgs#passt nixpkgs#iproute2`, which gives the same `passt`
store path as the deployed package:

- `python3 -B -m unittest test_plugin_sandbox`: without pasta, `Ran 37, OK
  (skipped=6)`. With pasta, `Ran 37, OK`, nothing skipped. **All six pass.**
- With the route step removed in memory (no repo edit),
  `..._other_addresses` fails as it should. `..._routes_cannot_be_removed...`
  still passes, because it guards removal and not whether the routes exist.
  The news test still passes with `url_ok` disabled in a scratch copy of the
  plugin, because nothing answers those URLs inside the sandbox anyway. The URL
  rule has its own tests (`tests/test_stages.py:132`,
  `tests/test_news_plugin.py:67`), but this test doesn't prove the plugin
  applies it. The other three weren't tested this way.
- In a sandboxed Nix build on p620 (`sandbox = relaxed`), `bwrap` works but
  `pasta` doesn't: "Failed to open() /dev/net/tun: No such file or directory".
  So the issue's "Nix build's checks" can't be a plain `checkPhase` without
  giving builds that device, which the constraints below rule out. Other
  builder setups weren't tried.
- `ip` is on p620's shell PATH only through the user profile. `test_argv_shape`
  needs it and has no skip guard. Three of the six (lines 112, 366, 397) check
  only for pasta, so with pasta but no `ip` they would fail, not skip.

## Proposed outcome

- There is one known way to run the suite in which these six tests really
  run, and it gives a pass or fail for them.
- A run that couldn't exercise them can't be mistaken for one that did.

## Affected users and systems

- Developers and agents changing plugins in nixoarchy-snowflake. The change
  lands there; this repo holds the artifacts and the issue.
- Nothing changes for people running the companion, unless a check finds a
  real problem.
- Only p620 was checked. Other hosts use the same package, but their running
  servers weren't inspected.

## Constraints

- No production behaviour changes. The sandbox code and `PASTA_EXTRA`
  (tests only, `app/plugins.py:529`) stay as they are.
- A network plugin must keep failing closed. The tests must not weaken that,
  and must not map host loopback outside the one RSS test that already does.
- No host configuration changes (such as `extra-sandbox-paths` or relaxed
  sandboxing) just to make tests run.
- No new dependency for people running the app.

## Open questions

1. **Where should the six tests run?**
   - **A. A dev shell or one documented command** that puts `passt` and
     `iproute2` on PATH. It is the smallest option and already known to work,
     but someone has to remember to run it. **Recommended**, because there is
     no CI to attach anything else to.
   - **B. A NixOS VM test in the flake `checks`,** run by `nix flake check`.
     It would have a real `/dev/net/tun`, but it's slower, needs KVM and isn't
     proven. It still only runs when someone runs it.
   - **C. Bring back GitHub Actions.** The only automatic option, but the
     workflows were deleted on purpose. Whether a hosted runner allows bwrap
     and pasta is unverified.
2. **What should a run without pasta do?** Keep skipping (the plain command
   stays easy, and the skip stays quiet), or fail when asked to run everything
   (for example with an environment variable)? A alone doesn't meet the second
   outcome without this. Recommended: keep the skip by default and add the
   strict mode.
3. **When is a pass required?** Only on demand, or before any change to the
   sandbox is merged? With no CI, the second is a rule people and agents have
   to follow. Recommended: required for any PR touching `app/plugins.py`,
   `tests/test_plugin_sandbox.py` or the wrapper's PATH.
4. **Should the news test be made to prove refusal?** Today it would pass
   with the check removed. Recommended: yes, it's a test whose name promises
   more than it checks.
5. **Should the other 31 tests in this file, and the rest of the suite, run in
   a check too?** Nothing runs them automatically either. Whether they would
   pass inside a Nix build is untested. Recommended: out of scope here, as its
   own issue.
6. **Should a check confirm the package's wrapper carries `passt` and
   `iproute2`?** The tests don't cover that, because they use the test PATH.
   It is a small addition and guards availability, not security.
7. **Is the priority low?** Given the fail-closed findings, I'd treat it as
   test hygiene and not as a security fix. Is that right?
