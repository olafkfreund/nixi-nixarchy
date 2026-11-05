---
status: draft
issue: 190
spec: spec/2026-11-04-190-sandbox-tests.md
coders:
  1: codex   # small test-module hook that must repeat the skip conditions exactly
  2: codex   # small tricky test logic: argv slice order and the port search
  3: codex   # two one-line assertion changes, kept with the other test edits
  4: codex   # a little Nix with one evaluation trap, given here in full
  5: codex   # two short docs, the last piece of the same change
reviewers:
  - codex    # second model on the diff, read-only (codex review --base origin/main)
  - agy      # second model on the tests' logic, read-only, given exported files
---

# Plan: run the plugin network-sandbox tests somewhere

## Approved decisions (from the spec, so this file stands alone)

All code changes land in **olafkfreund/nixoarchy-snowflake**, in tests,
`flake.nix` and docs. Nothing under `app/` or `plugins/` changes. This repo
(nixi-nixarchy) only holds the issue and the artifacts.

Six tests in `tests/test_plugin_sandbox.py` skip without `pasta`, and the run
still ends in `OK`. The approved outcome:

1. **One documented command**, from the repo root, in a new dev shell (`python3`,
   `bubblewrap`, `passt`, `iproute2`) on the flake's locked nixpkgs:
   `nix develop -c python3 -B tests/test_plugin_sandbox.py`.
2. **Strict mode.** `NIXI_SANDBOX_TESTS=require`, which the dev shell sets, makes
   the module fail and name whichever of `bwrap`, `pasta` or `ip` doesn't work.
   Without the variable, runs behave as today: a run without pasta keeps skipping.
3. **The news tests prove refusal.** A refused feed gives
   `source == "2 couldn't be reached"`; a tried-and-failed feed gives
   `Private, Local · 2 couldn't be reached`. Both tests use `assertEqual` on the
   first. The sandbox test keeps its name.
4. **A wrapper check**, `checks.<system>.wrapper-has-sandbox-tools`: evaluation
   only, asserts `postFixup` of `nixi-companion` has the `bubblewrap`, `passt` and
   `iproute2` bin paths.
5. **The rule, in the README:** a PR touching `app/plugins.py`,
   `tests/test_plugin_sandbox.py` or the wrapper's PATH (`nix/package.nix`) needs
   a passing run, and the PR says so. Touching the wrapper's PATH also needs the
   wrapper check. Nothing enforces this; the user accepted that (option A).
6. **Spec decision 1, approved: the port-forwarding fix, both parts.**
   `test_argv_shape` asserts `-t none -u none -T none -U none`, and `serve()` binds
   a free port below the host's real ephemeral range, erroring if there is none.
   With `-T auto`, the current test on an ephemeral port still passes.
7. **Spec decision 2, approved: a short `CLAUDE.md`** in the snowflake repo
   pointing to the README section.

Rejected, don't add: a `nix shell` one-liner, a rename of the news test, recording
calls to `fetch`, grepping the built wrapper, adding `ip` to the three pasta-only
guards (lines 112, 366, 397) or to `test_argv_shape`, a PR template, a git hook, a
VM test, GitHub Actions. The rest of the suite is #193, not this task.

## Setup (lead)

Line numbers below are at snowflake `origin/main` `7efdc88`. Commit `f6462c2`, where
the spec was tried, has identical copies of these files.

```bash
cd /mnt/code/Source-home/GitHub/nixoarchy-snowflake-main && git fetch origin
git worktree add /mnt/code/Source-home/GitHub/nixoarchy-snowflake-190 -b fix/190-sandbox-tests origin/main
git -C /mnt/code/Source-home/GitHub/nixoarchy-snowflake-190 diff --stat 7efdc88 HEAD -- tests/test_plugin_sandbox.py tests/test_news_plugin.py flake.nix README.md
```

If that diff isn't empty, find each anchor by its quoted text, not its number. Do
the rest in the `-190` worktree. Hand each step to Codex with `agent-run codex`
(the `handoff` skill): Codex edits, the lead reviews, runs the check and commits.

**Codex's sandbox blocks sockets, so the lead runs every sandbox test.** Codex can't
run `bwrap` or `pasta`, or bind in `serve()`. A skip there would still print `OK`,
which proves nothing. Codex's own check is a parse only.

## Steps

1. `tests/test_plugin_sandbox.py`, before line 34 (`@unittest.skipUnless(shutil.which("bwrap")...`): add `setUpModule`, leaving two blank lines around it.

   ```python
   def setUpModule():
       if os.environ.get("NIXI_SANDBOX_TESTS") != "require":
           return
       missing = [n for n, ok in (("bwrap", shutil.which("bwrap") and plugins.bwrap_ok()), ("pasta", plugins.pasta_ok()), ("ip", shutil.which("ip"))) if not ok]
       if missing:
           raise RuntimeError("NIXI_SANDBOX_TESTS=require, but these don't work here: " + ", ".join(missing))
   ```

   Check (Codex): `python3 -c "import ast; ast.parse(open('tests/test_plugin_sandbox.py').read())"`.
   Check (lead): `python3 -B tests/test_plugin_sandbox.py` gives `OK (skipped=6)`, and `NIXI_SANDBOX_TESTS=require python3 -B tests/test_plugin_sandbox.py` exits 1 naming `pasta`, in a shell with no pasta.
   Traps: `setUpModule` fails every test in the module, including `ExamplesCheckTest`, which is the intent. Keep the conditions the same as the skip guards; `bwrap_ok` and `pasta_ok` remember their answer, so calling them again costs nothing.

2. `tests/test_plugin_sandbox.py`, two edits:
   - Between lines 61 and 62, add:

     ```python
             self.assertEqual(a[a.index("-t"):a.index("-t") + 8], ["-t", "none", "-u", "none", "-T", "none", "-U", "none"])
     ```

   - Replace `serve()`, lines 97-102, with:

     ```python
         def serve(self):
             srv = socket.socket()
             self.addCleanup(srv.close)
             low = int(Path("/proc/sys/net/ipv4/ip_local_port_range").read_text().split()[0])
             for port in range(low - 1, 1023, -1):         # below the ephemeral range: with `-T auto`, pasta didn't forward ephemeral ports, so one couldn't catch it (#190)
                 try:
                     srv.bind(("127.0.0.1", port))
                 except OSError:
                     continue
                 srv.listen(5)
                 return port
             raise RuntimeError("no free port below %d" % low)
     ```

   Check (Codex): the parse above.
   Check (lead): `nix develop -c python3 -B tests/test_plugin_sandbox.py` gives `Ran 37`, `OK`, once step 4 is in; until then use `nix shell nixpkgs#passt -c python3 -B tests/test_plugin_sandbox.py`. Then the `-T auto` row under Tests.
   Traps: line 62 cuts `a` down to the `bwrap` part, so the new assertion must come before it. `serve()` must never fall back to port 0. Its only callers are lines 109 and 114, which both wrap it in `str()`, so it keeps returning an int. Leave the `_other_addresses` listener (line 132) alone: it isn't in the spec.

3. Replace the `assertIn` with `assertEqual`:
   - `tests/test_plugin_sandbox.py:413`: `self.assertEqual(got["source"], "2 couldn't be reached")`
   - `tests/test_news_plugin.py:111`: `self.assertEqual(card["source"], "2 couldn't be reached")`

   Check (lead): `cd tests && python3 -B -m unittest test_news_plugin` gives `OK`; the sandbox one runs under step 2's command. Then the `url_ok` row under Tests.
   Traps: keep the test names. Don't edit `plugins/examples/news/run`; the mutation is in a scratch copy only.

4. `flake.nix`, two edits:
   - Before line 51 (`checks = forSystems (`), add:

     ```nix
           # nix develop -c python3 -B tests/test_plugin_sandbox.py: the sandbox tests run, or the run fails (#190)
           devShells = forSystems (
             system:
             let
               pkgs = nixpkgs.legacyPackages.${system};
             in
             {
               default = pkgs.mkShell {
                 packages = [
                   pkgs.python3
                   pkgs.bubblewrap
                   pkgs.passt
                   pkgs.iproute2
                 ];
                 NIXI_SANDBOX_TESTS = "require";
               };
             }
           );

     ```

   - After line 123 (end of `status-module-assertions`), inside the same attribute set, add:

     ```nix

               # the wrapper's PATH carries what the plugin sandbox needs (#190); reads the recipe, so it doesn't build the package
               wrapper-has-sandbox-tools =
                 assert nixpkgs.lib.all (
                   p: nixpkgs.lib.hasInfix (builtins.unsafeDiscardStringContext (nixpkgs.lib.makeBinPath [ p ])) self.packages.${system}.nixi-companion.postFixup
                 ) [ pkgs.bubblewrap pkgs.passt pkgs.iproute2 ];
                 pkgs.runCommand "wrapper-has-sandbox-tools" { } "touch $out";
     ```

   Check (lead): `nix build --no-link .#checks.x86_64-linux.wrapper-has-sandbox-tools` passes in seconds, and `nix develop -c python3 -B tests/test_plugin_sandbox.py` gives `Ran 37`, `OK`, nothing skipped.
   Traps: without `unsafeDiscardStringContext`, `hasInfix` fails: "is not allowed to refer to a store path" (it builds a regex; tried on the locked nixpkgs). The spec's "same style as `status-module-assertions`" means the `assert`, then `runCommand`. Don't run `nix fmt`: it would reformat lines this task doesn't touch. If `flake.lock` changes, undo that; this needs no input change.

5. Docs:
   - `README.md`, before line 82 (`## Need help?`), add:

     ````markdown
     ## Working on it

     The plugin sandbox tests skip without `pasta`, and the run still says `OK`. This command runs them all, and fails if it can't:

     ```bash
     nix develop -c python3 -B tests/test_plugin_sandbox.py
     ```

     A PR that touches `app/plugins.py`, `tests/test_plugin_sandbox.py` or the wrapper's PATH (`nix/package.nix`) needs a passing run, and the PR says so. If it touches the wrapper's PATH, it also needs `nix build .#checks.x86_64-linux.wrapper-has-sandbox-tools`.

     ````

   - New `CLAUDE.md` at the repo root:

     ```markdown
     # Working in this repo

     Before opening a PR, read [Working on it](README.md#working-on-it): some changes need the plugin sandbox tests run, and the PR must say they passed.
     ```

   Check (lead): `grep -n '^## ' README.md` shows `## Working on it` right before `## Need help?`; `git status --short` shows `CLAUDE.md` as new, not ignored.
   Traps: `git add CLAUDE.md` before any Nix command that should see it. The README is the user's front page, so add nothing else to it.

## Tests

The lead runs these in the `-190` worktree, after step 5. The mutations go in a
scratch copy (`git archive HEAD | tar -x -C <scratch>`), never in the worktree.

1. `nix develop -c python3 -B tests/test_plugin_sandbox.py`: `Ran 37`, `OK`, nothing skipped. Tried: passes.
2. `python3 -B tests/test_plugin_sandbox.py` in a plain p620 shell: `OK (skipped=6)`, unchanged. Tried: passes.
3. `NIXI_SANDBOX_TESTS=require python3 -B tests/test_plugin_sandbox.py` in that shell: fails, names `pasta`, exit 1.
4. `cd tests && python3 -B -m unittest test_news_plugin`: `OK`. Tried: passes.
5. `nix build --no-link .#checks.x86_64-linux.wrapper-has-sandbox-tools`: passes. Tried: passes.
6. `git diff --stat origin/main` shows nothing under `app/` or `plugins/`, and no `flake.lock`.
7. Mutations in the scratch copy, each undone after:

   | Change | Test | Must give |
   | ------ | ---- | --------- |
   | `app/plugins.py:592` `"-T", "none"` → `"-T", "auto"` | `..._own_services`, `test_argv_shape` | both fail, `['connected'] != ['refused']`. Tried: yes |
   | `plugins/examples/news/run:146`, drop `or not url_ok(url)` | both news tests | both fail |
   | `nix/package.nix:119`, delete the `passt` line | `wrapper-has-sandbox-tools` | assertion fails. Tried: yes |

"Tried" means on this plan's exact code, in a scratch copy of `7efdc88`. The RSS
example test wasn't mutation-tested, and doesn't change.

Then: a fresh Opus reviewer with this plan's path and `git diff origin/main`, plus
the `reviewers:` above, read-only. Findings are advice for the lead to check.

Open the PR in nixoarchy-snowflake. It links the intent, spec and plan in
nixi-nixarchy, says Codex did steps 1-5 and the lead ran the sandbox tests, and pastes
the result of test 1, as the new rule asks. Its body has
`Closes olafkfreund/nixi-nixarchy#190`. Merge the artifact branch
`fix/190-sandbox-tests` in nixi-nixarchy with its own PR.

## Risks carried from the spec

- The rule isn't enforced. Accepted with option A.
- Strict mode depends on the host: user namespaces and `/dev/net/tun`. Only tried on p620.
- The wrapper check reads the recipe, not the result.
- The news assertion is tied to the `source` format. If it's reworded, both tests fail loudly; update the string.
- Passing doesn't prove the sandbox is complete. `_other_addresses` takes its list from `_host_addrs` itself, and the live own-services test probes only `127.0.0.1` and one abstract socket.
- These files change the package's store path, as any commit does. Its installed contents don't change.

## Rollback

`git revert` the merge in nixoarchy-snowflake. Nothing is deployed by this task, and
no host configuration changes, so nothing else needs undoing.
