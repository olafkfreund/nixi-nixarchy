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
@functools.cache
def run_dir():
    """One throwaway runtime folder per test process, made on first use and removed at exit."""
    run = tempfile.mkdtemp(prefix="nixi-test-run-")
    atexit.register(shutil.rmtree, run, ignore_errors=True)
    return run

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

- `setUpClass` sets `XDG_RUNTIME_DIR` to `nixi_env.run_dir()` with the other variables, before `import server`.
  `tearDownClass` already restores the environment. The folder is per process and isn't deleted with `cls.tmp`.
- That matters because `server` is imported once and cached, and `floor.FLOOR` fixes its path at that import, so the
  folder has to outlive the first test class.
- **The guard:** next to the existing `CONF_PATH` check, `setUpClass` raises unless `server.FLOOR.path` is under
  `tempfile.gettempdir()`, the same test `CONF_PATH` uses, with a message naming the path. So a throwaway folder from another
  test passes, and the live `/run/user/<uid>` fails.

### 4. Two tests that import too early

- `test_floor.py:13` has `from floor import Floor` at module level, under the real environment. That creates `FLOOR` with the
  real path, which `server` then reuses, so the guard would fail whenever it runs first. The import goes inside
  `with mock.patch.dict(os.environ, {"XDG_RUNTIME_DIR": nixi_env.run_dir()}):`.
- `test_mirror.py:34` imports `server` in `setUpClass`, before `setUp` sets its own folder at line 57. The same patch wraps that
  import.

`test_floor_wiring` needs nothing: line 23 is in a child's source string, and line 80 runs after `_ServerEnv` has imported `server`.

Before starting, check with `grep` that no other test imports `floor`, `server` or `window` at module level. `window.py:126` fixes its
socket path at import in the same way.

### Not changed

The environment isn't set process-wide at import, because the browsers inherit `os.environ` in other test files. No
watcher runs on the live folder, as approved.

## Alternatives rejected

- **Set `XDG_RUNTIME_DIR` once at the top of every test process:** browsers and other subprocesses would lose it too, which the
  intent rules out.
- **Change `app/floor.py` to take a path from a test variable:** the fix belongs in the tests, and the other eight uses of the
  folder (four in `server.py`, four in `window.py`) would stay exposed.
- **Pinning `floor.FLOOR.path` in `_ServerEnv` after import:** works, but hides an import under the real folder rather than
  catching it, and the guard would then prove nothing.
- **Inline `dict(...)` in each page test:** ten copies of the same line, and the `mkdir` is easy to forget.

## Risks

- **`test_voice_fit` plays real audio through the server** (`test_voice_settings_and_playback_path`). PipeWire and PulseAudio clients
  find their socket in this folder, so isolating it may break that path. The rule: run it first. If playback is what it checks, its
  server keeps the audio sockets through `PIPEWIRE_RUNTIME_DIR` and `PULSE_RUNTIME_PATH`, set to the real folder for that one test, and
  the plan records it. Anything else that breaks gets an explicit fix or a recorded deviation.
- **This doesn't cover everything live.** `DBUS_SESSION_BUS_ADDRESS` names its own path, so `notify-send` from a test server
  could still reach the desktop. `HYPRLAND_INSTANCE_SIGNATURE` stays set, but `hypr/` under the new folder is empty, so nothing
  connects. D-Bus is out of scope here.
- **A new test file with its own server** could forget the helper. The guard only covers `_ServerEnv`.
- **`tests/` is shared** with other work. Merge main first.

## Verification

- `test_nixi_env.py`: `server_env` makes the folder and sets the variable without changing the input; the guard raises when
  `FLOOR.path` is the live `/run/user/<uid>` path.
- From `tests/`, import order: `test_floor test_speakable`, `test_speakable test_floor`, and `test_mirror test_speakable`.
- Each page test, once alone.
- **Parallel:** 8 copies at once of `test_settings_fit` and of `test_caption_fit`, which today share the real lock.
- A page server's lock is in its own folder: read `/proc/<pid>/environ` during one test run, or a small check in the helper's test.
- Full suite: OK, the same number of tests or more, no new skips, and `config.json`'s timestamp unchanged.
- Nothing is run on the live desktop for this.
