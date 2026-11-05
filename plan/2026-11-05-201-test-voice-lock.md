---
status: approved
issue: 201
spec: spec/2026-11-05-201-test-voice-lock.md
coders:
  1: codex   # small, tricky: the helper, the guard and its import order
  2: agy     # large mechanical edit: one line in each of ten page tests; the lead runs them
  3: agy     # large mechanical edit: the same small wrap around ten early imports
reviewers:
  - codex    # found the test_mirror import trap in the spec
  - agy      # found the guard and audio problems in the spec
---

# Plan: Nixi's tests stay off the live desktop's runtime folder

## Approved decisions

- Every test server and `_ServerEnv` test gets a throwaway runtime folder, always set, never unset. A test may
  put things in it.
- One small helper, `tests/nixi_env.py`, with `run_dir()` (one per process, made on first use, removed at exit) and
  `server_env(env, home)`.
- Page tests change the server's environment only; the browser's stays as it is.
- A guard in `_ServerEnv` raises if `server.FLOOR.path` isn't under `tempfile.gettempdir()`.
- Nothing watches the live folder. `app/` doesn't change, and no test's checks change.
- If `test_voice_fit` needs real audio, that one server keeps the audio sockets through `PIPEWIRE_RUNTIME_DIR` and
  `PULSE_RUNTIME_PATH`, and this plan records it.
- D-Bus is out of scope.

## Steps

Work is on `fix/201-test-voice-lock` from `olafkfreund/nixoarchy-snowflake` main, in worktree
`../nixoarchy-snowflake-201`, merging main again before each step, since `tests/` is shared. Line numbers are from
main `b4de326`; search by name if they've moved.

1. `tests/nixi_env.py` (new), `tests/test_nixi_env.py` (new), `tests/test_speakable.py`:
   - the helper as in the spec, using `functools.cache` for `run_dir`, plus `check_floor_path(path)`, which raises unless `path` is
     under `tempfile.gettempdir()`, naming the path;
   - `_ServerEnv.setUpClass` (line 16): set `XDG_RUNTIME_DIR` to `nixi_env.run_dir()` with the other variables, before
     `import server`; next to the `CONF_PATH` check (line 27), call `nixi_env.check_floor_path(server.FLOOR.path)`;
   - `test_nixi_env.py`: `server_env` sets the variable to `<home>/run`, makes it with mode 0700, and doesn't change its input; `run_dir`
     returns the same folder twice; `check_floor_path` raises on `/run/user/<uid>/x` and accepts a path under temp. It imports
     neither `server` nor `floor`.
   → `cd tests && python3 -m unittest test_nixi_env test_speakable`.
   Traps: never import `server` outside `_ServerEnv`. `tearDownClass` restores the environment and removes `cls.tmp`, not the run folder.
   Don't commit. Never read /run/agenix or any key.

2. Page tests, each passing `nixi_env.server_env(env, home)` to the server's `Popen` or `runpy` start, and leaving the browser's
   `env` alone: `test_accessories_fit`, `test_agent_voice_fit` (replacing its inline dict from #54), `test_caption_fit`,
   `test_character_fit`, `test_mirror_fit`, `test_settings_fit`, `test_stages_fit`, `test_token_fit`, `test_voice_fit`,
   `test_weather_fit`.
   → agy: `python3 -B -m py_compile` on each file. Lead: each once alone, from `tests/`. If `test_voice_fit` fails on audio, the lead applies
   the audio rule above and records it here.
   Traps: edit with file tools; agy's sandbox has the worktree read-only for commands. Page tests need Chromium with
   `--disable-gpu`, so the lead runs them. In `test_character_fit` the server starts from a copied tree (line 66): keep its path. Don't commit.

3. Early imports, each wrapped in `with mock.patch.dict(os.environ, {"XDG_RUNTIME_DIR": nixi_env.run_dir()}):`, adding the imports needed:
   - `test_floor.py:13`, at module level; line 17 is a child's source string, so leave it;
   - `import server` in `setUp` or `setUpClass`: `test_bridge:74`, `test_desk_stages:37`, `test_location:25`, `test_location_api:25`,
     `test_mirror:34`, `test_nixi_ask:23`, `test_sessions:31`, `test_stage_stream:24`;
   - `import window as w` in `test_window_token:34`, which is in `setUpModule`.
   First re-run the search, and report any new file:
   `grep -nE "^\s*(import|from) (floor|server|window)\b" tests/*.py`.
   → agy: `python3 -B -m unittest` on each edited file. Lead: `test_floor test_speakable`, `test_speakable test_floor`,
   `test_mirror test_speakable`, each in that order, and each edited file before `test_speakable`.
   Traps: `test_floor_wiring` needs nothing. These tests may already set `HOME` around the import: follow what's there. Don't commit.

4. Lead: verify, commit, review and merge.
   - The guard is wired in: temporarily remove the variable from `_ServerEnv`, and run `test_speakable` alone with `XDG_RUNTIME_DIR` set to a
     scratch folder under `~/.cache`, which isn't under temp. It must raise, naming that path. Restore. This never touches the live folder.
   - A page server's lock is in its own folder: read `/proc/<pid>/environ` of a server during one `test_caption_fit` run.
   - Parallel: 8 copies at once of `test_settings_fit` and of `test_caption_fit`.
   - Full suite: OK, the same number of tests or more, no new skips, `config.json`'s timestamp unchanged.
   - PR with `@codex review`; Opus, Codex and agy review the diff read-only.
   - Close #201 on merge. There's no deploy, since only `tests/` changes.

## Deviations (after code review)

- `test_nixi_ask`'s `test_open_in_nixi` sets the throwaway folder for the whole test, not only the import. Without it, run from a shell
  without Hyprland, it could tell the live window to step aside (Opus, from reading the code).
- `test_voice_fit` passed without the real audio sockets, so the audio exception wasn't needed.
- Known limit, left as is: the guard can't fire if `TMPDIR` is itself the live folder. The `CONF_PATH` guard has the same limit.

## Tests

```bash
cd tests && python3 -m unittest discover -s .
```

## Rollback

Revert the merge. Nothing outside `tests/` changes.
