---
status: draft
issue: 201
intent: intent/2026-11-05-201-test-voice-lock.md
---

# Spec: Nixi's tests stay off the live desktop's runtime folder

All changes are in `tests/` in `olafkfreund/nixoarchy-snowflake`. `app/` doesn't change.

## Design

### 1. One small helper, `tests/nixi_env.py`

```python
RUN = tempfile.mkdtemp(prefix="nixi-test-run-")   # one per test process, 0700, removed at exit
atexit.register(shutil.rmtree, RUN, ignore_errors=True)

def server_env(env, home):
    """A copy of env for a server process, with its own runtime folder inside its throwaway home."""
    run = Path(home) / "run"
    run.mkdir(mode=0o700, exist_ok=True)
    return dict(env, XDG_RUNTIME_DIR=str(run))
```

The name doesn't start with `test_`, so discovery skips it. Importing it changes nothing else.

### 2. Page tests: the server's environment only

These start a server with `Popen` or `runpy` and pass it `env`: `test_accessories_fit`, `test_agent_voice_fit`,
`test_caption_fit`, `test_character_fit`, `test_mirror_fit`, `test_settings_fit`, `test_stages_fit`, `test_token_fit`,
`test_voice_fit` and `test_weather_fit`. Each passes `nixi_env.server_env(env, home)` to the server and leaves the
browser's `env` alone. `test_agent_voice_fit`'s inline dict from #54 is replaced by the helper. Each server has its own
lock, so parallel runs no longer queue on each other.

`test_mirror_http`, `test_floor` and `test_floor_wiring` already give their subprocess a folder of their own, and don't
change for this.

### 3. `_ServerEnv` (`tests/test_speakable.py`)

- `setUpClass` sets `XDG_RUNTIME_DIR` to `nixi_env.RUN` with the other variables, before `import server`.
  `tearDownClass` already restores the environment. `RUN` is per process and isn't deleted with `cls.tmp`.
- That matters because `server` is imported once and cached, and `floor.FLOOR` fixes its path at that import, so the
  folder has to outlive the first test class.
- **The guard:** next to the existing `CONF_PATH` check, `setUpClass` raises unless `server.FLOOR.path` is under
  `nixi_env.RUN`, with a message naming the path.

### 4. `from floor import Floor` at module level

`test_floor` and `test_floor_wiring` import `floor` at module level under the real environment. Importing it creates
`FLOOR` with the real path, which `server` then reuses, so the guard would fail whenever they run first. Each import
goes inside `with mock.patch.dict(os.environ, {"XDG_RUNTIME_DIR": nixi_env.RUN}):`. Those tests only use `Floor` with
paths they give it, so their checks don't change.

### Not changed

The environment isn't set process-wide at import, because the browsers inherit `os.environ` in other test files. No
watcher runs on the live folder, as approved.

## Alternatives rejected

- **Set `XDG_RUNTIME_DIR` once at the top of every test process:** browsers and other subprocesses would lose it too, which the
  intent rules out.
- **Change `app/floor.py` to take a path from a test variable:** the fix belongs in the tests, and the other four uses of the
  folder would stay exposed.
- **Pinning `floor.FLOOR.path` in `_ServerEnv` after import:** works, but hides an import under the real folder rather than
  catching it, and the guard would then prove nothing.
- **Inline `dict(...)` in each page test:** ten copies of the same line, and the `mkdir` is easy to forget.

## Risks

- **Things a server finds through this folder stop working in tests,** which is the point, but a test may have relied on one
  by accident. Audio is the likely one: PipeWire and PulseAudio clients find their socket here, so `test_voice_fit` and any
  test that plays sound may behave differently. The full suite shows it. Such a test gets an explicit fix, or the plan records a deviation.
- **This doesn't cover everything live.** `DBUS_SESSION_BUS_ADDRESS` names its own path, so `notify-send` from a test server
  could still reach the desktop. `HYPRLAND_INSTANCE_SIGNATURE` stays set, but `hypr/` under the new folder is empty, so nothing
  connects. D-Bus is out of scope here.
- **A new test file with its own server** could forget the helper. The guard only covers `_ServerEnv`.
- **`tests/` is shared** with other work. Merge main first.

## Verification

- `test_nixi_env.py`: `server_env` makes the folder and sets the variable without changing the input; the guard raises when
  `FLOOR.path` is outside `RUN`.
- From `tests/`, import order: `python3 -m unittest test_floor test_speakable`, and `test_speakable test_floor`.
- Each page test, once alone.
- **Parallel:** 8 copies at once of `test_settings_fit` and of `test_caption_fit`, which today share the real lock.
- A page server's lock is in its own folder: read `/proc/<pid>/environ` during one test run, or a small check in the helper's test.
- Full suite: OK, the same number of tests or more, no new skips, and `config.json`'s timestamp unchanged.
- Nothing is run on the live desktop for this.
