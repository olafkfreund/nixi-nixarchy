---
status: draft
issue: 184
spec: spec/2026-11-04-184-chromium-cores.md
coders:
  1: codex   # small, tricky logic: raw clone through ctypes, exit codes that must not read a crash as a denial
  2: codex   # the same edit in eight harnesses, and it has the helper's signature fresh from step 1
  3: codex   # short test file tied closely to the helper from step 1
  4: codex   # only if #178 is already on main: the same one-call edit as step 2
reviewers:
  - codex    # read-only `codex review --base origin/main` on the code PR diff
  - agy      # read-only `--mode plan` review of tests/_browser.py and the flag decision, exported to named files
---

# Plan: test browsers stop dumping core

## Decisions (from the approved spec and the user)

- **Cause:** all 22 cores on 2026-11-04 stop at `credentials.cc:131` because
  `clone(CLONE_NEWUSER)` fails with `ENOSYS` under agy's sandbox. `EPERM`
  aborts Chromium too, at another line.
- **A failed launch stays a test failure,** even with `--no-sandbox`. It's not a
  skip. The `chromium did not start` assertion stays.
- **There is no `stop_browser()`.** Each harness keeps its `finally` loop.
- **Probe:** a raw `clone`, the call Chromium makes, in a fresh child process
  with a 10 s timeout, once per test process. Not `chromium --version`,
  `unshare -U` or `os.unshare`: they miss it or are the abort itself.
- **Only exit 1 (a real denial) adds `--no-sandbox`.** Exit 2, a signal, a
  timeout or a probe that can't run keep the sandbox on.
- **Unsandboxed browsers reach only this machine:** `--no-sandbox` always comes
  with `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`.
- **Flags don't change.** A GPU-forced Chrome hung an AMD GPU twice (#138).
- Stdlib only. Tests only: nothing under `app/` or `bin/` changes.
- Each harness keeps its own `BROWSER` line and `skipUnless`.
- `test_voice_fit` keeps its extras and `env`, and loses its unconditional
  `--no-sandbox`.
- **Out of scope:** the 5 cores from agents' own scripts. #192 is closed as not
  planned, so expect fewer cores, not zero.
- **#184 stays open until step 7 passes.** Only that step meets the real filter.

Code is in olafkfreund/nixoarchy-snowflake. These artifacts stay in
olafkfreund/nixi-nixarchy. Line numbers are from `origin/main` at `3aa5b01`; if
main has moved, find each launch with `grep -n '\[BROWSER,\|BROWSER, "--headless' tests/test_*_fit.py`.

## Steps

**0. Set up** (lead, no edits to tracked files)
- In `/mnt/code/Source-home/GitHub/nixoarchy-snowflake`:
  `git fetch origin && git worktree add ../nixoarchy-snowflake-184 -b fix/184-chromium-cores origin/main`
- Save the script under "Simulated filter" below to the scratchpad.
- Record the baseline there: `python3 -m unittest discover -s tests 2>&1 | tail -4`.
  The spec saw 11 skips (6 `test_plugin_sandbox`, 4 `test_bridge`, 1
  `test_window_webkit`). If today's differ, the recorded number is the baseline.
- Traps: don't touch `nixoarchy-snowflake-main`. `nixoarchy-snowflake-178` has
  uncommitted work: read it, never edit it.

**1. New file `tests/_browser.py`** (coder: Codex)

```python
"""Start the local-only headless test browser. The sandbox goes off only where it can't start (#184)."""
import functools
import subprocess
import sys

# Runs in a fresh child: a raw clone from a process with other threads could deadlock its clone child on the GIL.
# 0 = allowed, 1 = denied, 2 = inconclusive. An exception must not exit 1, the code for a real denial.
_CHILD = """
import os
try:
    import ctypes
    nr = {"x86_64": 56, "aarch64": 220}.get(os.uname().machine)  # SYS_clone; flake.nix builds these two
    if nr is None:
        os._exit(0)
    libc = ctypes.CDLL(None)
    libc.syscall.argtypes = [ctypes.c_long] * 6                  # syscall is variadic
    libc.syscall.restype = ctypes.c_long
    r = libc.syscall(nr, 0x10000000 | 17, 0, 0, 0, 0)            # CLONE_NEWUSER | SIGCHLD
    if r == 0:
        os._exit(0)
    if r < 0:
        os._exit(1)
    os._exit(0 if os.waitpid(r, 0)[1] == 0 else 2)
except Exception:
    os._exit(2)
"""


def _probe():
    """The child's exit code, or None if it couldn't run or timed out."""
    # shortcut: the probe only checks clone, upgrade it if a host with that restriction runs the suite.
    try:
        return subprocess.run([sys.executable, "-c", _CHILD], timeout=10,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
    except (OSError, subprocess.SubprocessError):
        return None


_probed = functools.cache(_probe)


def _flags(code):
    """Only a real denial turns the sandbox off, and then only local names resolve."""
    return ["--no-sandbox", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] if code == 1 else []


def start_browser(browser, cdp_port, data_dir, *extra, env=None):
    """Returns the Popen. The GPU flags must not change: a GPU-forced Chrome hung an AMD GPU twice (#138)."""
    return subprocess.Popen([browser, "--headless=new", "--disable-gpu", "--use-angle=swiftshader",
                             "--enable-unsafe-swiftshader", "--disable-gpu-compositing", *_flags(_probed()), *extra,
                             f"--user-data-dir={data_dir}", f"--remote-debugging-port={cdp_port}",
                             "--no-first-run", "about:blank"],
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
```

- Check: `PYTHONPATH=tests python3 -c "import _browser as b; print(b._probe(), b._flags(1), b._flags(0))"`
  prints `0` or `1`, both flags, then `[]`.
- Traps: Python exits 1 on an uncaught exception, so without the `try` a broken
  `ctypes` would read as a denial and silently drop the sandbox. Only
  `os._exit` in the child, never `sys.exit`. `_probed` is the spec's cached
  `_can_sandbox()`, renamed because it holds the exit code. `_browser.py` must
  not match `test_*.py`, so discovery ignores it. The resolver rule is one argv
  item, comma and spaces included.

**2. The eight harnesses** (coder: Codex)
- Add `from _browser import start_browser` right after `from pathlib import Path`.
- Replace the browser `Popen` with one call. `test_voice_fit` keeps its extras and `env`:

| File (`tests/`) | Import after line | Lines to replace | New line |
| --------------- | ----------------- | ---------------- | -------- |
| `test_accessories_fit.py` | 16 | 56-60 | `procs.append(start_browser(BROWSER, cdp, home / "chromium"))` |
| `test_caption_fit.py` | 16 | 55-59 | same |
| `test_mirror_fit.py` | 16 | 55-59 | same |
| `test_settings_fit.py` | 16 | 53-57 | same |
| `test_stages_fit.py` | 16 | 55-59 | same |
| `test_token_fit.py` | 16 | 55-59 | same |
| `test_weather_fit.py` | 15 | 54-58 | same |
| `test_voice_fit.py` | 12 | 135-147 | `procs.append(start_browser(BROWSER, cdp, home / "chromium", "--no-proxy-server", "--autoplay-policy=no-user-gesture-required", env=env))` |

- Check: `python3 -m py_compile tests/test_*_fit.py`, and
  `grep -lE -- '--headless|--no-sandbox' tests/test_*.py` prints nothing.
- Traps: leave the server `Popen`, the `chromium did not start` assertion, the
  `finally` loop and `BROWSER` alone. `subprocess` and `sys` stay imported for the
  server. Don't mention either flag in a comment: step 3's guard reads the text.
  Harnesses must keep `127.0.0.1`, because `localhost` isn't excluded from the
  resolver rule. Voice runs sandboxed for the first time on an unrestricted shell;
  step 5 checks that. Page tests may not work inside Codex's own sandbox, so the
  lead runs them.

**3. New file `tests/test_browser.py`** (coder: Codex)

```python
"""Test browsers start through _browser.py, and the sandbox goes off only on a real denial (#184)."""
import unittest
from pathlib import Path

from _browser import _flags, _probe

HERE = Path(__file__).resolve()
TESTS = HERE.parent
ROOT = TESTS.parent


def _harnesses():
    return [f for f in sorted(TESTS.glob("test_*.py")) if f != HERE]


class GuardTest(unittest.TestCase):
    def test_harnesses_use_the_helper(self):
        hits = [f.name for f in _harnesses() if "--headless" in f.read_text() or "--no-sandbox" in f.read_text()]
        self.assertEqual(hits, [], "start the browser with _browser.start_browser")

    def test_never_in_the_app(self):
        hits = [str(f.relative_to(ROOT)) for base in ("app", "bin") for f in sorted((ROOT / base).rglob("*"))
                if f.is_file() and b"--no-sandbox" in f.read_bytes()]
        self.assertEqual(hits, [])

    def test_the_scans_see_what_they_should(self):   # guards against a scan that silently matches nothing
        self.assertIn("test_token_fit.py", [f.name for f in _harnesses()])
        self.assertIn("--headless", (TESTS / "_browser.py").read_text())


class FlagTest(unittest.TestCase):
    def test_only_a_denial_turns_the_sandbox_off(self):
        for code in (0, 2, -31, None):               # allowed, inconclusive, killed by a signal, timed out
            self.assertEqual(_flags(code), [])
        self.assertEqual(_flags(1), ["--no-sandbox", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"])

    def test_the_real_probe_gives_an_answer(self):
        self.assertIn(_probe(), (0, 1))


if __name__ == "__main__":
    unittest.main()
```

- Check: `python3 -m unittest discover -s tests -p 'test_browser.py'` passes.
- Traps: don't mock `subprocess.run` or touch the `_probed` cache. `unittest
  discover` runs every module in one process, so a stale value would leak into the
  harnesses. Read `app/` and `bin/` as bytes, because they hold binary files. The
  real `_probe()` call is uncached and must return 0 or 1, as the spec says: an
  inconclusive probe means its code is broken, and this test should say so. That's
  one extra child per suite; the browsers' decision still comes from `_probed()`.

**4. `tests/test_character_fit.py`, if #178 got there first** (coder: Codex)
- Before opening the PR: `git fetch origin && git cat-file -e origin/main:tests/test_character_fit.py`.
  Exit 0 means #178 is on main. (Not `git grep`: it searches contents, and that file
  never names itself.)
- **#178 is on main (it landed first):** rebase, and step 3's guard fails until this
  edit is made. Add the import after `from pathlib import Path` (line 17 at `c9cd2b0`)
  and replace the `Popen` in `setUpClass` (lines 50-54) with
  `cls.procs.append(start_browser(BROWSER, cls.cdp, home / "chromium"))`.
  Note the `cls.cdp`. The `assert _wait(...)` line stays.
- **#178 isn't on main (this lands first):** skip this step and make no edit on
  `feat/178-characters`. When #178 merges main, the guard fails until #178 makes
  the same edit. Step 6 leaves that edit on #178 as a comment.
- Check: `python3 -m unittest discover -s tests -p 'test_browser.py'` passes on the
  rebased branch.
- Traps: `feat/178-characters` is local and has uncommitted work, so don't rebase or
  commit there. If #178 lands while this PR is open, take the first branch.

**5. Verify on a real shell** (lead, no edits)

Run everything from the worktree root. First confirm the shell is unrestricted:
`PYTHONPATH=tests python3 -c "import _browser as b; print(b._probe())"` prints 0.
Set `sim=<scratchpad>/seccomp_sim.py`, `start=$(date '+%F %T')`.

1. `python3 -m unittest discover -s tests` matches step 0's baseline with the same
   skips, plus `test_browser`.
2. No `--no-sandbox` where the sandbox can start. Run
   `python3 -m unittest discover -s tests -p test_token_fit.py &`, then
   `until out=$(ps -eo args | grep '[n]ixi-tokenfit.*about:blank'); do sleep 0.2; done; printf '%s\n' "$out" | grep -c -- --no-sandbox; wait`
   prints 0. It captures the line once, so a finished test can't pass on empty
   output, and `about:blank` picks the browser itself, not its child processes.
3. For each of `clone+unshare ENOSYS`, `clone ENOSYS` and `clone+unshare EPERM`:
   `python3 "$sim" <filter> <errno> python3 -m unittest discover -s tests -p 'test_*_fit.py'`
   gives OK with no skips, and item 2's `ps` line during that run prints a non-zero
   count. If #178 has landed, its own skips (missing artwork, no base ref) are allowed;
   record them.
4. `coredumpctl list --since "$start" --no-pager` shows no new Chromium core from a
   `nixi-*fit` data dir.
5. `pgrep -af '[n]ixi-.*fit'` finds nothing.
6. A failed launch still fails. This edits nothing:
   `PYTHONPATH=tests python3 -c "import unittest, test_token_fit as t; t.BROWSER = '/bin/false'; unittest.main(t, argv=['x'])"`
   fails with `chromium did not start` after about 20 s.

- Traps: other agents run Chromium on p620 at the same time. For any listed core,
  `coredumpctl info <pid> | grep user-data-dir` says whose it is. Keep `[n]` in the
  patterns, or `pgrep -f` matches its own shell. A missing binary raises in `Popen`
  and an unknown flag is ignored, so neither tests item 6. If voice fails sandboxed in
  item 1 or 2, that's a finding: report it, don't add `--no-sandbox` back.

**6. Commit, review, PR** (lead)
- Commit each step in the code worktree, naming the step: `test(browser): ... (#184, plan step N)`.
- Review: a fresh Opus agent given only this plan's path and `git diff origin/main...`,
  plus `reviewers:` through `second-opinion`. Verdict for each finding, fix the confirmed.
- Open the PR in olafkfreund/nixoarchy-snowflake. It links the intent, spec and plan,
  says Codex did steps 1-4, and uses `Refs olafkfreund/nixi-nixarchy#184`, not `Fixes`.
- If step 4 was skipped, comment on #178 with the one edit from step 4.
- Traps: review compares the diff to this plan. A deviation updates this file in the
  same commit as the code.

**7. The real filter, required before closing #184** (lead dispatches agy, no edits)
- After the merge, set `start=$(date '+%F %T')`, then in a clean worktree at
  `origin/main`, on a throwaway branch (`agent-run` refuses `main`), one `agent-run agy` with this
  prompt: "Do not edit, commit, deploy or restart. Run
  `python3 -m unittest discover -s tests -p 'test_*_fit.py'` and report the last 20
  lines of output verbatim."
- Pass: the page tests pass, and `coredumpctl list --since "$start"` shows no new core
  from a `nixi-*fit` data dir. Then close #184 with the result.
- If a page test fails with `chromium did not start`: `--no-sandbox` isn't enough in
  there. There's no core and no silent pass, but #184 stays open and the user decides.
- Traps: `agent-run` reports `ok: false, reason: empty diff` when nothing changed, which
  is expected here, so read the answer in `log`. The worktree is read-only in agy's
  sandbox, which only stops `__pycache__`. If agy's sandbox blocks the run itself, report
  it verbatim: that isn't a pass. If #178 has landed, its pixel test runs `git worktree
  add`, which the read-only sandbox can block. That failure says nothing about Chromium,
  so judge by whether the browsers started.

## Simulated filter

x86_64 only, for step 5. Not committed. Dry run on 2026-11-04 with no Chromium, using
step 1's child: no filter gave probe 0, each of the three filters gave probe 1, and
`os.unshare` under `clone ENOSYS` still worked, matching the spec's table.

```python
#!/usr/bin/env python3
"""seccomp_sim.py clone|clone+unshare ENOSYS|EPERM cmd...: run cmd with CLONE_NEWUSER failing."""
import ctypes, errno, os, struct, sys
which, err, cmd = sys.argv[1], getattr(errno, sys.argv[2]), sys.argv[3:]
LD, JEQ, JSET, RET = 0x20, 0x15, 0x45, 0x06
ALLOW, DENY = 0x7fff0000, 0x00050000 | err
op = lambda code, k, jt=0, jf=0: struct.pack("HBBI", code, jt, jf, k)
prog = [op(LD, 0),                                      # the syscall number
        op(JEQ, 56, 2, 0),                              # clone
        op(JEQ, 272 if "unshare" in which else 56, 1, 0),
        op(RET, ALLOW),
        op(LD, 16),                                     # args[0], low word: the flags
        op(JSET, 0x10000000, 0, 1),                     # CLONE_NEWUSER
        op(RET, DENY),
        op(RET, ALLOW)]
buf = ctypes.create_string_buffer(b"".join(prog))
class Fprog(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.c_void_p)]
fprog = Fprog(len(prog), ctypes.addressof(buf))
libc = ctypes.CDLL(None, use_errno=True)
libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong]
if libc.prctl(38, 1, None, 0, 0) or libc.prctl(22, 2, ctypes.byref(fprog), 0, 0):   # NO_NEW_PRIVS, SECCOMP filter
    sys.exit(f"seccomp: {os.strerror(ctypes.get_errno())}")
os.execvp(cmd[0], cmd)
```

## Tests

Steps 1-3 name each check. Step 5 is the whole proof on this machine: same skips, the
sandbox on where it can start, all harnesses passing under all three filters, no core,
no browser left, and a failed launch failing. Step 7 is the only proof against agy's
real filter.

## Rollback

Revert the code PR. It touches only `tests/`, and the eight harnesses go back to their
own launches. Remove the code worktree with `git worktree remove ../nixoarchy-snowflake-184`.
