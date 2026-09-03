#!/usr/bin/env python3
"""Nixi installer — every mutation descriptor-bound, atomic, rollback-safe.

    install.py                 core only: widget files, server service, menu entry
    install.py --with-watcher  | --without-watcher   coaching watcher service
    install.py --with-skill    | --without-skill     agent skill (~/.claude/skills)
    install.py --with-hooks    | --without-hooks     boot/update hooks + weekly timer
    install.py --all           core + every integration (documented consent)
    install.py --refresh       re-place core + whatever is already installed
    install.py --status        JSON: which integrations are installed
    install.py --no-systemd    (tests) place files only

Rules, per the marketplace security review: destination directories are
opened once and validated (ours, not group/world-writable); files are
written to an O_EXCL random temp in that directory, fsync'd, renamed over a
target that must be a regular file or absent (never through a symlink —
dotfile-managed installs are left alone with a message), then the directory
is fsync'd. Every replaced file's previous bytes are kept so a failure
restores everything placed so far. Primitives mirror nixi-server.
"""
import json
import os
import secrets
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
FEATURES = ("watcher", "skill", "hooks")
_LOG = []


def log(msg):
    _LOG.append(str(msg))
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
    for f in ("CLAUDE.md", "KNOWLEDGE.md", "ui.html", "faq.json", "AGENTS.md"):
        j.place(DIR, f, read_src(src("share", f)), dir_mode=0o700)
    vendor = os.path.join(DIR, "vendor")
    for f in sorted(os.listdir(src("share", "vendor"))):
        if f.endswith(".js"):
            j.place(vendor, f, read_src(src("share", "vendor", f)))
    for b in ("nixi", "nixi-server", "nixi-update-manual"):
        j.place(BIN, b, read_src(src("bin", b)), mode=0o755)
    j.place(UNITS, "nixi.service", read_src(src("systemd", "nixi.service")))
    version = json.loads(read_src(src("manifest.json")))["version"]
    j.place(DATA, "source_root", (ROOT + "\n").encode(), mode=0o600, dir_mode=0o700)
    j.place(DATA, ".installed-version", (version + "\n").encode(), mode=0o600, dir_mode=0o700)
    merge_menu(j)
    svc.enable_now("nixi.service")


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
    if '"help"' in s:
        return
    import re
    row = ('"help": {"icon": "\U000f0625", "label": "Help", '
           '"description": "Ask anything about nixarchy", "action": "nixi", '
           '"aliases": ["how", "nixi", "ayuda"]}')
    if s.strip():
        j.place(EXT_DIR, "omarchy-menu.jsonc.bak-nixi", s.encode())
    if not re.sub(r"//.*", "", s).strip().strip("{}").strip():
        out = "{\n  " + row + "\n}\n"
    else:
        i = s.rindex("}")
        body = s[:i].rstrip()
        sep = "," if body.endswith(("}", '"', "]")) and not body.endswith("{") else ""
        out = body + sep + "\n  " + row + "\n}\n"
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
    for f in sorted(os.listdir(src("skills", "nixi"))):
        if f.endswith(".md"):
            j.place(SKILLS, f, read_src(src("skills", "nixi", f)))
    j.place(DIR, "SKILL.md", read_src(src("skills", "nixi", "SKILL.md")), dir_mode=0o700)


def disable_skill(j, svc):
    for f in ("SKILL.md",):
        j.remove(SKILLS, f)
        j.remove(DIR, f)
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
    args = [a for a in argv if a not in ("--no-systemd", "--log")]
    if args == ["--status"]:
        print(json.dumps(status()))
        return 0
    want_on, want_off, core = [], [], True
    for a in args:
        if a == "--all":
            want_on = list(FEATURES)
        elif a == "--refresh":
            want_on = [f for f, on in status().items() if on]
        elif a.startswith("--with-") and a[7:] in FEATURES:
            want_on.append(a[7:])
        elif a.startswith("--without-") and a[10:] in FEATURES:
            want_off.append(a[10:])
            core = False
        else:
            print("unknown flag: " + a, file=sys.stderr)
            return 64
    if want_on and not core:
        core = True
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
        write_log()
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
        log("Installed. Run nixi for the chat widget; find Help in the Omarchy "
            "menu (SUPER+SPACE); optional key: o.bind(\"SUPER + H\", \"Nixi (nixarchy help)\", "
            "\"nixi\") in ~/.config/hypr/bindings.lua")
    for f in want_on:
        log("enabled: " + f)
    for f in want_off:
        log("disabled: " + f)
    write_log()
    return 0


def write_log():
    """The setup log lives in the private state dir, written through the
    same descriptor-bound primitive as everything else (never a shell
    redirection through a symlink)."""
    if "--log" not in sys.argv:
        return
    try:
        dfd = _dirfd(DATA, create=True)
        try:
            _write(dfd, "setup.log", ("\n".join(_LOG) + "\n").encode(), 0o600)
        finally:
            os.close(dfd)
    except Exception:
        pass


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
