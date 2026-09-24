#!/usr/bin/env python3
"""Nixi installer — every mutation descriptor-bound, atomic, rollback-safe.

    install.py                 core: knowledge, programs, bar button, bridge deps, menu entry
    install.py --with-watcher  | --without-watcher   coaching watcher service
    install.py --with-skill    | --without-skill     agent skill (~/.claude/skills)
    install.py --with-hooks    | --without-hooks     boot/update hooks + weekly timer
    install.py --all           core + every integration
    install.py --refresh       re-place core + whatever is already installed
    install.py --status        JSON: which integrations are installed
    install.py --no-systemd    (tests) place files only

Rules, per the marketplace security review: destination directories are
opened once and validated (ours, not group/world-writable); files are
written to an O_EXCL random temp in that directory, fsync'd, renamed over a
target that must be a regular file or absent (never through a symlink —
dotfile-managed installs are left alone with a message), then the directory
is fsync'd. Every replaced file's previous bytes are kept so a failure
restores everything placed so far.

This is the plugin-manager path: `omarchy plugin add` has already put this
repository in ~/.config/omarchy/plugins/, which IS the overlay card. What it
cannot do is fetch the bridge's npm dependencies or install the bar button,
which Omarchy requires to be a second plugin.
"""
import json
import os
import secrets
import shutil
import stat
import subprocess
import sys

ROOT = os.path.dirname(os.path.realpath(__file__))
HOME = os.path.expanduser("~")
DIR = os.path.join(HOME, ".config", "nixi")
DATA = os.path.join(HOME, ".local", "share", "nixi")
BIN = os.path.join(HOME, ".local", "bin")
UNITS = os.path.join(HOME, ".config", "systemd", "user")
SKILLS = os.path.join(HOME, ".claude", "skills", "nixi")
HOOKS_BOOT = os.path.join(HOME, ".config", "omarchy", "hooks", "post-boot.d")
HOOKS_UPD = os.path.join(HOME, ".config", "omarchy", "hooks", "post-update.d")
EXT_DIR = os.path.join(HOME, ".config", "omarchy", "extensions")
NO_SYSTEMD = "--no-systemd" in sys.argv
PLUGINS = os.path.join(HOME, ".config", "omarchy", "plugins")
FEATURES = ("watcher", "skill", "hooks")


def log(msg):
    print(msg, file=sys.stderr if msg.startswith(("install failed", "rollback")) else sys.stdout)


_UID = os.getuid()
_HOME = os.path.abspath(os.path.expanduser("~"))


def _group_exclusive(gid):
    """A group-writable directory is acceptable only if the group is provably
    ours alone: our primary group, no other account has it as primary, and
    no member other than us."""
    import grp
    import pwd
    if gid != os.getgid():
        return False
    try:
        g = grp.getgrgid(gid)
        me = pwd.getpwuid(_UID).pw_name
    except KeyError:
        return False
    if any(m != me for m in g.gr_mem):
        return False
    return not any(p.pw_gid == gid and p.pw_uid != _UID for p in pwd.getpwall())


def _dir_ok(st):
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != _UID or (st.st_mode & 0o002):
        return False
    if st.st_mode & 0o020:
        return _group_exclusive(st.st_gid)
    return True


def _dirfd(path, create=False, mode=0o700):
    """Open a directory under $HOME by walking every component from the
    $HOME anchor with O_NOFOLLOW|O_DIRECTORY, validating each directory
    (ours, never world-writable, group-writable only if exclusive). A
    symlink anywhere on the path is refused. Returns the leaf descriptor;
    callers keep it for every relative operation that follows."""
    path = os.path.abspath(path)
    if path != _HOME and not path.startswith(_HOME + os.sep):
        raise PermissionError("outside $HOME: " + path)
    fd = os.open(_HOME, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        if not _dir_ok(os.fstat(fd)):
            raise PermissionError("untrusted $HOME")
        for comp in [c for c in path[len(_HOME):].split(os.sep) if c]:
            flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
            try:
                nfd = os.open(comp, flags, dir_fd=fd)
            except FileNotFoundError:
                if not create:
                    raise
                os.mkdir(comp, mode, dir_fd=fd)
                nfd = os.open(comp, flags, dir_fd=fd)
            os.close(fd)
            fd = nfd
            if not _dir_ok(os.fstat(fd)):
                raise PermissionError("untrusted directory: " + path)
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_src(path, cap=8_000_000):
    """Bounded read of a source file from the plugin checkout."""
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_size > cap:
            raise ValueError("bad source: " + path)
        out = bytearray()
        while len(out) <= cap:
            b = os.read(fd, 1 << 16)
            if not b:
                break
            out.extend(b)
        return bytes(out)
    finally:
        os.close(fd)


def _read_existing(dfd, name, cap=8_000_000):
    """Previous bytes of a regular, non-symlink target (for rollback)."""
    try:
        st = os.stat(name, dir_fd=dfd, follow_symlinks=False)
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(st.st_mode):
        raise PermissionError("refusing to touch non-regular file: " + name)
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=dfd)
    try:
        if os.fstat(fd).st_size > cap:
            raise ValueError("existing file too large: " + name)
        out = bytearray()
        while True:
            b = os.read(fd, 1 << 16)
            if not b:
                return bytes(out)
            out.extend(b)
    finally:
        os.close(fd)


class Journal:
    """Every placement is recorded so a failure restores prior state."""

    def __init__(self):
        self.entries = []   # (dirpath, name, previous_bytes_or_None, mode)

    def place(self, dirpath, name, data, mode=0o644, dir_mode=0o755):
        dfd = _dirfd(dirpath, create=True, mode=dir_mode)
        try:
            prev = _read_existing(dfd, name)
            prev_mode = None
            if prev is not None:
                prev_mode = stat.S_IMODE(os.stat(name, dir_fd=dfd, follow_symlinks=False).st_mode)
            _write(dfd, name, data, mode)
            self.entries.append((dirpath, name, prev, prev_mode))
        finally:
            os.close(dfd)

    def remove(self, dirpath, name):
        try:
            dfd = _dirfd(dirpath)
        except (OSError, PermissionError):
            return
        try:
            prev = _read_existing(dfd, name)
            if prev is None:
                return
            prev_mode = stat.S_IMODE(os.stat(name, dir_fd=dfd, follow_symlinks=False).st_mode)
            os.unlink(name, dir_fd=dfd)
            os.fsync(dfd)
            self.entries.append((dirpath, name, prev, prev_mode))
        finally:
            os.close(dfd)

    def rollback(self):
        for dirpath, name, prev, prev_mode in reversed(self.entries):
            try:
                dfd = _dirfd(dirpath)
                try:
                    if prev is None:
                        try:
                            os.unlink(name, dir_fd=dfd)
                        except FileNotFoundError:
                            pass
                        os.fsync(dfd)
                    else:
                        _write(dfd, name, prev, prev_mode or 0o644)
                finally:
                    os.close(dfd)
            except Exception as e:
                log(f"rollback: could not restore {dirpath}/{name}: {e}")


def _write(dfd, name, data, mode):
    tmp = ".%s.%s.tmp" % (name, secrets.token_hex(8))
    try:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     mode, dir_fd=dfd)
        try:
            view = memoryview(data)
            while view:
                view = view[os.write(fd, view):]
            os.fsync(fd)
        finally:
            os.close(fd)
        try:
            cur = os.stat(name, dir_fd=dfd, follow_symlinks=False)
            if not stat.S_ISREG(cur.st_mode):
                raise PermissionError("refusing to replace non-regular file: " + name)
        except FileNotFoundError:
            pass
        os.rename(tmp, name, src_dir_fd=dfd, dst_dir_fd=dfd)
        os.fsync(dfd)
    except BaseException:
        try:
            os.unlink(tmp, dir_fd=dfd)
        except OSError:
            pass
        raise


def systemctl(*args):
    """Run a user-manager command; returns the exit code (checked by callers)."""
    if NO_SYSTEMD:
        return 0
    try:
        return subprocess.run(["systemctl", "--user", *args], stdin=subprocess.DEVNULL,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              timeout=60, start_new_session=True).returncode
    except Exception:
        return 1


def must(rc, what):
    if rc != 0:
        raise RuntimeError(what + " failed (systemctl rc=%d)" % rc)


def is_enabled(unit):
    if NO_SYSTEMD:
        return os.path.exists(os.path.join(UNITS, unit))
    return systemctl("is-enabled", "--quiet", unit) == 0


def is_active(unit):
    if NO_SYSTEMD:
        return False
    return systemctl("is-active", "--quiet", unit) == 0


class Services:
    """Journal of service state so rollback restores enable/active status."""

    def __init__(self):
        self.prior = {}   # unit -> (enabled, active)

    def snapshot(self, unit):
        if unit not in self.prior:
            self.prior[unit] = (is_enabled(unit), is_active(unit))

    def enable_now(self, unit):
        self.snapshot(unit)
        must(systemctl("daemon-reload"), "daemon-reload")
        must(systemctl("enable", "--now", unit), "enable " + unit)

    def disable_now(self, unit):
        self.snapshot(unit)
        must(systemctl("disable", "--now", unit), "disable " + unit)

    def rollback(self):
        for unit, (enabled, active) in self.prior.items():
            systemctl("daemon-reload")
            systemctl("enable" if enabled else "disable", unit)
            systemctl("start" if active else "stop", unit)


# ------------------------------------------------------------------- pieces
def src(*parts):
    return os.path.join(ROOT, *parts)


def install_core(j, svc):
    remove_old_widget(j, svc)
    for f in ("CLAUDE.md", "KNOWLEDGE.md", "faq.json", "AGENTS.md"):
        j.place(DIR, f, read_src(src("share", f)), dir_mode=0o700)
    for b in ("nixi", "nixi-context", "nixi-update-manual"):
        j.place(BIN, b, read_src(src("bin", b)), mode=0o755)
    # The bar button is its own plugin: Omarchy gives a third-party plugin a
    # bar widget or an overlay, never both.
    button = os.path.join(PLUGINS, json.loads(read_src(src("button", "manifest.json")))["id"])
    for f in ("manifest.json", "BarWidget.qml"):
        j.place(button, f, read_src(src("button", f)))
    merge_menu(j)
    install_bridge_deps()
    if not os.path.realpath(ROOT).startswith(os.path.realpath(PLUGINS) + os.sep):
        log("card: this checkout is not in %s, so the shell will not load it; "
            "install it with `omarchy plugin add` (or use the Home Manager module)" % PLUGINS)


# What a 0.9.x install placed and the overlay no longer uses. The server unit
# must be stopped before its program disappears, or it restart-loops.
OLD_FILES = ((BIN, "nixi-server"), (UNITS, "nixi.service"), (DIR, "ui.html"),
             (os.path.join(DIR, "vendor"), "marked.min.js"),
             (os.path.join(DIR, "vendor"), "purify.min.js"),
             (os.path.join(DATA, "models"), "ggml-base.en.bin"),
             (os.path.join(DATA, "models"), "ggml-silero-v5.1.2.bin"))


def remove_old_widget(j, svc):
    if os.path.exists(os.path.join(UNITS, "nixi.service")) and is_enabled("nixi.service"):
        svc.disable_now("nixi.service")
    removed = [n for d, n in OLD_FILES if os.path.lexists(os.path.join(d, n))]
    for d, n in OLD_FILES:
        j.remove(d, n)
    for d in (os.path.join(DIR, "vendor"), os.path.join(DATA, "models")):
        try:
            os.rmdir(d)
        except OSError:
            pass
    if removed:
        must(systemctl("daemon-reload"), "daemon-reload")
        log("removed the old widget: " + ", ".join(removed))


def install_bridge_deps():
    """`npm ci` for the bridge. Not journalled: node_modules is a build
    artefact inside this checkout, and a failed run leaves the card saying
    what is missing rather than a half-installed desktop."""
    bridge = src("bridge")
    if os.environ.get("NIXI_SKIP_NPM") in ("1", "true", "yes"):
        return
    if not shutil.which("npm"):
        log("bridge: npm is not on PATH, so the card cannot start an agent; "
            "add pkgs.nodejs, then run install.py --refresh")
        return
    r = subprocess.run(["npm", "ci", "--omit=dev", "--no-audit", "--no-fund"], cwd=bridge,
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.PIPE, timeout=600)
    if r.returncode != 0:
        raise RuntimeError("npm ci in bridge/ failed: "
                           + r.stderr.decode("utf-8", "replace").strip()[-300:])
    log("bridge: dependencies installed")


# The card finds each agent's ACP adapter on PATH at runtime (the Home Manager
# module pins them instead), and file search needs fd.
ADAPTERS = (("claude", "claude-agent-acp"), ("codex", "codex-acp"), ("opencode", "opencode"))


def requirements():
    found = {agent: bool(shutil.which(cmd)) for agent, cmd in ADAPTERS}
    return {"agents": found, "fileSearch": bool(shutil.which("fd"))}


def merge_menu(j):
    """Add the Help entry to the user's menu extensions, non-destructively:
    parsed loosely, backed up first, written atomically."""
    dfd = _dirfd(EXT_DIR, create=True)
    try:
        try:
            cur = _read_existing(dfd, "omarchy-menu.jsonc", cap=262144)
        except PermissionError:
            log("menu: omarchy-menu.jsonc is not a regular file — leaving it alone; add the 'help' entry yourself")
            return
    finally:
        os.close(dfd)
    s = (cur or b"").decode("utf-8", "replace")
    import re
    if '"help"' in s:
        # Upgrade path. The entry is the user's now, so it is left alone with
        # one exception: the icon nixi itself wrote before 0.11 (help-circle,
        # U+F0625) is swapped for sparkles in place. Scoped to the help entry's
        # own braces so an identical glyph on a neighbouring row is not touched.
        # Without this the new icon would only ever reach fresh installs.
        b = s.find("{", s.index('"help"'))
        depth, e = 0, b
        while b != -1 and e < len(s):
            if s[e] == "{":
                depth += 1
            elif s[e] == "}":
                depth -= 1
                if depth == 0:
                    break
            e += 1
        entry = s[b:e + 1] if b != -1 and e < len(s) else ""
        if "\U000f0625" in entry:
            j.place(EXT_DIR, "omarchy-menu.jsonc.bak-nixi", s.encode())
            j.place(EXT_DIR, "omarchy-menu.jsonc",
                    (s[:b] + entry.replace("\U000f0625", "\U000f0674") + s[e + 1:]).encode())
            log("menu: the Help icon is now sparkles")
        return
    row = ('"help": {"icon": "\U000f0674", "label": "Help", '
           '"description": "Ask anything about nixarchy", "action": "nixi", '
           '"aliases": ["how", "nixi", "ayuda"]}')
    if s.strip():
        j.place(EXT_DIR, "omarchy-menu.jsonc.bak-nixi", s.encode())
    # Insert before the closing brace whenever there IS one, comments and all.
    # This used to strip comments to decide whether the file was *effectively*
    # empty and then, in that branch, synthesise a fresh file -- discarding the
    # comments it had only stripped for the test. nixarchy seeds this file once
    # with a commented example and never again (nixarchy#220), so the
    # documentation did not come back. Only a file with no object at all is
    # written from scratch.
    if "}" in s:
        i = s.rindex("}")
        body = s[:i].rstrip()
        stripped = re.sub(r"//.*", "", body).strip()
        sep = "," if stripped.endswith(("}", '"', "]")) and not stripped.endswith("{") else ""
        out = body + sep + "\n  " + row + "\n}\n"
    else:
        out = "{\n  " + row + "\n}\n"
    j.place(EXT_DIR, "omarchy-menu.jsonc", out.encode())
    log("menu: Help entry added (backup: omarchy-menu.jsonc.bak-nixi)")


def enable_watcher(j, svc):
    j.place(BIN, "nixi-watch", read_src(src("bin", "nixi-watch")), mode=0o755)
    j.place(UNITS, "nixi-watch.service",
            read_src(src("systemd", "nixi-watch.service")))
    svc.enable_now("nixi-watch.service")


def disable_watcher(j, svc):
    svc.disable_now("nixi-watch.service")
    j.remove(UNITS, "nixi-watch.service")
    j.remove(BIN, "nixi-watch")
    must(systemctl("daemon-reload"), "daemon-reload")


def enable_skill(j, svc):
    skill = read_src(src("skills", "nixi", "SKILL.md"))
    j.place(SKILLS, "SKILL.md", skill)
    j.place(DIR, "SKILL.md", skill, dir_mode=0o700)


def disable_skill(j, svc):
    j.remove(SKILLS, "SKILL.md")
    j.remove(DIR, "SKILL.md")
    try:
        os.rmdir(SKILLS)
    except OSError:
        pass


def enable_hooks(j, svc):
    j.place(HOOKS_BOOT, "nixi-welcome.hook", read_src(src("hooks", "nixi-welcome.hook")), mode=0o755)
    j.place(HOOKS_UPD, "nixi-manual-refresh.hook",
            read_src(src("hooks", "nixi-manual-refresh.hook")), mode=0o755)
    for u in ("nixi-manual.service", "nixi-manual.timer"):
        j.place(UNITS, u, read_src(src("systemd", u)))
    svc.enable_now("nixi-manual.timer")


def disable_hooks(j, svc):
    svc.disable_now("nixi-manual.timer")
    j.remove(HOOKS_BOOT, "nixi-welcome.hook")
    j.remove(HOOKS_UPD, "nixi-manual-refresh.hook")
    for u in ("nixi-manual.service", "nixi-manual.timer"):
        j.remove(UNITS, u)
    must(systemctl("daemon-reload"), "daemon-reload")


def status():
    return {
        "watcher": os.path.exists(os.path.join(UNITS, "nixi-watch.service"))
                   and is_enabled("nixi-watch.service"),
        "skill": os.path.exists(os.path.join(SKILLS, "SKILL.md")),
        "hooks": os.path.exists(os.path.join(HOOKS_UPD, "nixi-manual-refresh.hook")),
    }


ENABLE = {"watcher": enable_watcher, "skill": enable_skill, "hooks": enable_hooks}
DISABLE = {"watcher": disable_watcher, "skill": disable_skill, "hooks": disable_hooks}


def main(argv):
    args = [a for a in argv if a != "--no-systemd"]
    if args == ["--status"]:
        print(json.dumps(status()))
        return 0
    want_on, want_off = [], []
    for a in args:
        if a == "--all":
            want_on = list(FEATURES)
        elif a == "--refresh":
            want_on = [f for f, on in status().items() if on]
        elif a.startswith("--with-") and a[7:] in FEATURES:
            want_on.append(a[7:])
        elif a.startswith("--without-") and a[10:] in FEATURES:
            want_off.append(a[10:])
        else:
            print("unknown flag: " + a, file=sys.stderr)
            return 64
    # --without-X alone only removes X; anything else also (re)installs the core.
    core = bool(want_on) or not want_off
    j, svc = Journal(), Services()
    try:
        if core:
            install_core(j, svc)
        for f in want_on:
            ENABLE[f](j, svc)
        for f in want_off:
            DISABLE[f](j, svc)
    except Exception as e:
        log("install failed: %s — rolling back" % e)
        svc.rollback()
        j.rollback()
        return 1
    # The first manual fetch is a convenience, not part of the install: it is
    # already best-effort, and CI (and air-gapped installs) want it skipped
    # rather than waited on.
    if core and os.environ.get("NIXI_SKIP_MANUAL") not in ("1", "true", "yes"):
        try:
            r = subprocess.run([os.path.join(BIN, "nixi-update-manual")],
                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.PIPE, timeout=300,
                               start_new_session=True)
            if r.returncode != 0:
                # Usually the unauthenticated GitHub API rate limit (60/hour
                # per IP). Not fatal -- the weekly timer retries, and answers
                # still work from the bundled knowledge -- but silence here
                # left users with no manual and no idea why.
                log("manual: not fetched (%s). Offline answers still work; "
                    "retry later with nixi-update-manual."
                    % (r.stderr.decode("utf-8", "replace").strip()[-200:]
                       or "exit %d" % r.returncode))
        except Exception as e:
            log("manual: not fetched (%s); retry with nixi-update-manual" % e)
    if core:
        need = requirements()
        agents = [a for a, ok in need["agents"].items() if ok]
        log("agents with an ACP adapter on PATH: %s" % (", ".join(agents) or
            "none -- add pkgs.claude-agent-acp, pkgs.codex-acp or pkgs.opencode"))
        if not need["fileSearch"]:
            log("file search: fd is not on PATH, so @-mentioning files is off; add pkgs.fd")
        log("Installed. Turn on Nixi and Nixi button once in Setup > Plugins, then run "
            "nixi (or SUPER+SPACE > Help); optional key: o.bind(\"SUPER + H\", "
            "\"Nixi (nixarchy help)\", \"nixi\") in ~/.config/hypr/bindings.lua")
    for f in want_on:
        log("enabled: " + f)
    for f in want_off:
        log("disabled: " + f)
    # A bare `install.py` enables NO optional feature, and used to end with the
    # same sentence as `--all`. On a second machine that produced one unit
    # where the first had four, with nothing to say so: the only external tell
    # was `nixi-watch.service` reporting "could not be found" rather than
    # "inactive". Say which features are off and how to turn them on.
    if core:
        off = [f for f, on in status().items() if not on]
        if off:
            log("not enabled: %s — add with %s, or --all"
                % (", ".join(off), " ".join("--with-" + f for f in off)))
        else:
            log("all optional features are enabled")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
