---
status: draft
issue: 184
intent: intent/2026-11-04-184-chromium-cores.md
---

# Spec: test browsers stop dumping core

The code lives in olafkfreund/nixoarchy-snowflake (`tests/`), so the code PR
goes there. These artifacts stay here, with issue #184.

## What the evidence shows

I read all 22 Chromium and Chrome cores recorded on 2026-11-04 before this
work started, using `coredumpctl` and the text in each core.

- **Every abort has the same cause.** All 22 stop at
  `credentials.cc:131: Check failed: . : Function not implemented (38)`.
  The `clone(CLONE_NEWUSER)` call failed with `ENOSYS`, an errno that
  Chromium's check doesn't accept.
- **Every abort came from agy's sandbox.** All 22 have `ANTIGRAVITY_AGENT` in
  their environment and the hostname `sandbox` (the machine is `p620`).
  `agy-implement` runs `agy --mode accept-edits --sandbox`. The intent also
  named Codex and Claude Code's sandboxed shell, but none of these cores shows
  either one restricting the namespace. That's one day's cores, so it doesn't
  prove they allow it, and the probe below doesn't depend on which tool it is.
  `CLAUDECODE=1` appears because agy was started from a Claude pane.
- **Most aborts come from the tests, not all.** 17 of the 22 come from four
  tests' harnesses plus accessories: settings 7, stages 5, mirror 2, caption 2,
  accessories 1. The other 5 are agents' own scripts: 3 with `/tmp/chr-test`
  and 2 with no user-data-dir. This fix can't reach those 5.
- **The tests already report a failed start.** A failed launch fails the test
  with `chromium did not start` (`test_token_fit.py:61`). All 11 skips in the
  suite are non-browser, so no page test is hiding: 6 `test_plugin_sandbox`
  (pasta, #190), 4 `test_bridge` (`NIXI_SRC`), 1 `test_window_webkit` (`gi`).
- **The binary doesn't change the answer.** The cores span Chromium 155,
  156.0.8078.47 and 156.0.8078.79, plus one Google Chrome. The wrappers add
  only Ozone and Wayland flags, nothing about the sandbox. There's no SUID
  helper at `/run/wrappers/bin/__chromium-suid-sandbox`, so user namespaces are
  the only sandbox available.

### What I tested

I simulated the restriction with a small seccomp filter that fails
`CLONE_NEWUSER`, then ran each candidate under it. Chromium 156.0.8078.79,
x86_64.

| Filter | `--version` | `os.unshare` in a fork | raw `clone` | `chromium` sandboxed | `chromium --no-sandbox` |
| ------ | ----------- | ---------------------- | ----------- | -------------------- | ----------------------- |
| none | not run | ok | ok | works | not run |
| `clone` and `unshare` → `ENOSYS` | prints the version, no abort | 38 | 38 | **aborts** at `credentials.cc:131` | works, no core |
| `clone` only → `ENOSYS` | not run | **ok (misses it)** | 38 | not run | not run |
| `clone` and `unshare` → `EPERM` | not run | 1 | 1 | **aborts** at `setuid_sandbox_host.cc:172` | not run |

This settles how to probe:

- Starting Chromium itself as the probe is the bug: it aborts and dumps core.
- `chromium --version` never reaches the sandbox check, so it can't detect
  the problem.
- `unshare -U true` and `os.unshare` make a different syscall from Chromium.
  The cores prove agy's filter fails `clone`, but not whether it also fails
  `unshare`. The `clone`-only row is my own simulation, so it shows what could
  happen, not what agy does. `os.unshare` may well work there. I can't confirm
  it, and a wrong "ok" brings back the core this fix exists to stop.
- A raw `clone(CLONE_NEWUSER | SIGCHLD)` is the call Chromium makes, so it needs
  no assumption about the filter. It returned an errno in every case and never
  aborted. Any errno counts as "can't start", because `EPERM` aborts Chromium
  too, just at a different line.

These runs caused **2 core dumps**, both expected, at 22:23:16 (PID 830890)
and 22:23:21 (PID 833876). The shutdown test below caused none.

## Design

Add one new file, `tests/_browser.py`, stdlib only.

```python
def start_browser(browser, cdp_port, data_dir, *extra, env=None):
    """Start the local-only headless test browser. Returns the Popen."""
```

- **Flags stay as they are.** The helper owns the flags the harnesses share
  today: `--headless=new --disable-gpu --use-angle=swiftshader
  --enable-unsafe-swiftshader --disable-gpu-compositing`, the data dir, the CDP
  port, `--no-first-run`, `about:blank` and the `DEVNULL` output. The GPU flags
  must not change: a GPU-forced Chrome hung an AMD GPU twice (#138).
- **The probe runs once per test process.** `_probe()` runs a fresh
  `sys.executable -c` child with a 10 second timeout and returns its exit code.
  A cached `_can_sandbox()` calls it. The flag decision takes the exit code as
  plain input, so tests never touch the cache.
- **What the child does.** It calls `syscall(SYS_clone, CLONE_NEWUSER | SIGCHLD,
  0, 0, 0, 0)` through `ctypes`, with `argtypes` of six `c_long` and a `c_long`
  `restype`, because `syscall` is variadic. Then:
  - returned 0: this is the clone child, so `os._exit(0)` at once;
  - returned below 0: exit 1, no child exists and there's nothing to wait for;
  - returned a pid: `waitpid`, then exit 0 if the clone child exited cleanly and
    2 if not.
- **It runs in a child process on purpose.** A raw clone from a process with
  other threads could deadlock the clone child on the GIL, and the full suite
  may have server threads running.
- **Only a real denial turns the sandbox off.** Exit 1 adds `--no-sandbox`. Any
  other result (exit 2, a signal, a timeout, a probe that can't run) is
  inconclusive and keeps the sandbox on, as the intent requires. The worst
  outcome is a core and a failed test, not a browser silently unsandboxed.
- **Architecture.** `flake.nix` builds for `x86_64-linux` (`SYS_clone` 56) and
  `aarch64-linux` (220). On any other architecture the probe exits 0, keeping
  the sandbox on.
- **Unsandboxed browsers can only reach this machine.** With `--no-sandbox` the
  helper also adds `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`.
  That turns "local-only" from a claim into something enforced. Tested with
  fresh data dirs and `--no-sandbox`: a local page on `127.0.0.1` loaded, while
  `https://example.com/` and `https://1.1.1.1/` loaded without the rule and not
  with it. Harnesses must keep using `127.0.0.1`, as they do now, because
  `localhost` isn't excluded.

Each harness changes in the same way:

- `from _browser import start_browser`, the pattern
  `from test_speakable import ...` already uses. `_browser.py` doesn't match
  `test_*.py`, so discovery ignores it.
- Each harness keeps its own `BROWSER` line and `skipUnless`, so no machine
  starts or stops running a test because of this change.
- The browser `Popen` becomes `start_browser(BROWSER, cdp, home / "chromium")`.
- The `assertTrue(_wait(...), "chromium did not start")` and the `finally`
  block stay as they are.

The harnesses to change are `accessories`, `caption`, `mirror`, `settings`,
`stages`, `token`, `voice` and `weather`. The intent named six; `settings` and
`voice` have been added since, and they share the same launch.

- `test_voice_fit` keeps its own extras and `env`:
  `start_browser(BROWSER, cdp, data, "--no-proxy-server",
  "--autoplay-policy=no-user-gesture-required", env=env)`. It loses its
  unconditional `--no-sandbox` (line 138), which breaks the intent's "only when
  the sandbox can't start".
- `test_character_fit` is on `feat/178-characters` and starts its browser in
  `setUpClass`. Whichever PR lands second moves it to the helper.

**No `stop_browser()`.** The intent suggested one, but there's nothing for it to
do. After `terminate()` Chromium exited in 0.03 s with 0 of its 12-13 processes
left, sandboxed or not. After `kill()` also 0 were left. The existing `finally`
loop already covers the server and the browser together, and a second path would
only add code.

**A failed start stays a failure.** With the fallback in place, a browser that
still can't start is a real fault, so the existing assertion is the right report.
A crash mid-test still fails through the node check's exit code.

**Add `tests/test_browser.py`**, with two small checks:

1. A guard in the style of `test_no_herdr_writes.py`, skipping its own file:
   - no other `tests/test_*.py` may contain `--headless` or `--no-sandbox`, which
     stops the old pattern coming back, including from #178;
   - nothing under `app/` or `bin/` may contain `--no-sandbox` (true today, I
     checked), which is the intent's "never in the app";
   - like that file's `test_the_scans_see_what_they_should`, it checks the scan
     can see something: the glob finds `test_token_fit.py`, and `_browser.py`
     does contain `--headless`.
2. The flag decision as a plain function of the exit code: 0 and 2 give no
   `--no-sandbox`, and neither does a timeout; 1 gives it, along with the resolver
   rule. Plus one real `_probe()` call that must return 0 or 1, so the probe's own
   code runs. Nothing mocks `subprocess.run` or sets the cache, because
   `unittest discover` runs every module in one process and a stale value would
   leak into the harnesses.

Nothing changes under `app/`, and `bin/nixi-companion`'s browser launch is
untouched.

## Alternatives rejected

- **Always pass `--no-sandbox`** (what `test_voice_fit` does today). It's the
  smallest change, but the approved intent says only when the sandbox can't
  start.
- **Skip page tests where the sandbox is blocked.** It stops the cores but loses
  the coverage in agy runs, which are exactly the runs writing this code.
- **Key off `ANTIGRAVITY_AGENT`.** It matches all 22 cores but tests the tool
  rather than the capability, so another restricted runner would still abort.
- **Probe with `chromium --version`, `unshare -U` or `os.unshare`.** See the
  table above. `os.unshare` would drop `ctypes` and the syscall numbers, so it
  becomes the better choice if agy's filter turns out to cover `unshare` too.
- **Start Chromium and retry on failure.** The first attempt is the abort.
- **`--disable-namespace-sandbox`.** Per Chromium's source as I remember it (not
  checked here), it only skips this check and moves on to the SUID sandbox,
  which isn't installed here.
- **Set up `security.chromiumSuidSandbox`.** That's a system change, and a
  setuid helper can't work under `no_new_privs` anyway.
- **Disable core dumps** (`RLIMIT_CORE`, `core_pattern`) or add `--no-sandbox` to
  the shared wrapper or `chromium-flags.conf`. The intent's constraints rule out
  both: no hiding crashes system-wide, no user-wide change.

## Risks

- **Agents' own scripts still abort.** 5 of the 22 cores weren't tests
  (`/tmp/chr-test` and bare `--dump-dom` runs), and this fix can't reach them.
  Expect a smaller count, not zero, until that's handled separately.
- **"No core" isn't proven until a real agy run.** I simulated the filter,
  because agy's headless mode gives me no shell to run a probe in. The cores do
  show the real filter fails `clone`, and the probe makes that same call. What's
  unproven is whether `--no-sandbox` is enough in there. If agy's sandbox blocks
  something else it needs, the test fails with `chromium did not start`, without
  passing silently or dumping core. There are no voice cores from the harness
  that already passes `--no-sandbox`, but that doesn't prove it ran under agy.
  So #184 stays open until verification step 6 passes.
- **The sandbox is off in restricted runs.** That's acceptable only because these
  browsers load the test's own local server: every `*_fit.mjs` navigates to the
  local `url`, and the resolver rule blocks names outside it.
  `stages_fit.mjs:474` and `caption_fit.mjs:95` contain external URLs as inert
  strings.
- **A probe that passes wrongly.** Where `clone` succeeds but the namespace can't
  be used (Ubuntu's AppArmor restriction), Chromium still aborts: one core and a
  failed test, the same as today. It doesn't apply on p620.
  `shortcut: the probe only checks clone, upgrade it if a host with that
  restriction runs the suite.`
- **A seccomp filter that kills instead of failing.** The probe counts as
  inconclusive, so the sandbox stays on and Chromium dies too: a failed test,
  possibly with a Python core under `SIGSYS`. The real filter returns `ENOSYS`, so
  this is hypothetical and gets no code.
- **Merge overlap.** #178 may land first, adding a harness in the old pattern. The
  guard test catches that whichever order they land in.

## Verification

1. `python3 -m unittest discover -s tests` matches today's baseline with the same
   11 skips, and `test_browser` passes.
2. On an unrestricted shell, `ps` during a harness shows no `--no-sandbox`, so
   the sandbox stays on where it can start.
3. Under the simulated filter (the plan will carry the script), run all eight
   `test_*_fit` harnesses for each of `clone+unshare/ENOSYS`, `clone/ENOSYS` and
   `clone+unshare/EPERM`. All pass, and `coredumpctl list --since <start>` shows
   no new Chromium core.
4. After the suite, `pgrep -f nixi-.*fit` finds nothing.
5. Temporarily pass `/bin/false` as the browser: the test fails with `chromium
   did not start`, showing a failed launch isn't a silent pass. (A missing binary
   raises in `Popen` instead, and Chromium ignores an unknown flag, so neither
   tests this.)
6. **Required before closing #184:** on the next real agy coder run on p620, the
   page tests pass and `coredumpctl list` shows no new core from a `nixi-*fit`
   data dir. Only this step tests the real filter.
