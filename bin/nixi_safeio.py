"""The safe-IO floor every Nixi program writes through — one copy, audited once.

These helpers carry the marketplace security review's requirements: a directory
under $HOME is reached by walking every path component with
O_NOFOLLOW|O_DIRECTORY from the $HOME anchor, validating each one (ours, never
world-writable, group-writable only when the group is provably ours alone), and
a file is replaced by writing an O_EXCL temp in that directory, fsync'ing it and
renaming it over a target that must be a regular file or absent -- never through
a symlink. Callers keep the returned directory descriptor and do every further
operation relative to it, so nothing is re-resolved by name.

They lived in three places (install.py, bin/nixi-watch, bin/nixi-update-manual)
as byte-identical copies, which meant a fix could land in one and rot in the
other two (#60). This module is that copy; nothing else belongs in it.

It has NO .py-suffixed importers to find it by package name: it must sit in the
same directory as the programs that import it, because what makes a bare
`import nixi_safeio` work for a suffix-less program in ~/.local/bin or in a Nix
store bin/ is that CPython puts the script's own directory (symlinks resolved)
at sys.path[0]. Both install paths place it there -- install.py's core placement
and nix/package.nix's installPhase -- and tools/test_nixi.py asserts they do.
Programs outside a bin/ directory (install.py, tools/test_nixi.py) add that
directory to sys.path themselves.
"""
import os
import secrets
import stat


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
