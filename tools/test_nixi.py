#!/usr/bin/env python3
"""One runnable check for the logic that would break silently.

    python3 tools/test_nixi.py

Covers the non-obvious parts, not the whole surface: the manual updater's
source-precedence rules, the offline search ranking, the learned-fact broker,
and the invariant that no runtime Omarchy integration point got renamed during
the fork. Everything runs offline against temp dirs -- no network, no systemd.
"""
import importlib.machinery
import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(name, path):
    spec = importlib.util.spec_from_loader(
        name, importlib.machinery.SourceFileLoader(name, os.path.join(ROOT, path)))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# Mentioning pacman/AUR to say they do NOT work here is correct and wanted;
# telling the user to reach for them is the regression worth catching.
ARCH_RECOMMENDATIONS = ("Install \u2192 AUR", "Install -> AUR", "pacman -S",
                        "yay -S", "from the AUR", "AUR for community")


def _recommends_arch(text):
    return [p for p in ARCH_RECOMMENDATIONS if p in text]


def test_updater_precedence():
    """nixarchy must own a slug; omarchy may only backfill. And only real
    manual pages count as pages."""
    up = load("up", "bin/nixi-update-manual")
    nix, oma = up.SOURCES
    assert nix["repo"] == "olafkfreund/nixarchy", "nixarchy must be fetched FIRST"
    assert oma["repo"] == "omacom/omarchy-site"

    # markdown source: docs/manual/<slug>.md, nothing deeper, nothing else
    s = _slug = up._slug_of
    assert s("docs/manual/gaming.md", "docs/manual", "md") == "gaming"
    assert s("docs/manual/img/x.md", "docs/manual", "md") is None, "no subdirs"
    assert s("docs/manual/_config.yml", "docs/manual", "md") is None
    # html source: manual/<slug>/index.html at exactly depth 1
    assert s("manual/hotkeys/index.html", "manual", "html") == "hotkeys"
    assert s("manual/a/b/index.html", "manual", "html") is None
    assert s("manual/hotkeys/other.html", "manual", "html") is None
    # slugs are constrained (they become filenames)
    assert s("docs/manual/../evil.md", "docs/manual", "md") is None
    assert s("docs/manual/UPPER.md", "docs/manual", "md") is None
    print("  ok  updater precedence + slug filtering")


def test_local_search():
    """The offline tier must find a bundled fact and must stay silent on
    nonsense rather than returning a bad match."""
    data = tempfile.mkdtemp()
    conf = tempfile.mkdtemp()
    try:
        shutil.copy(os.path.join(ROOT, "share/KNOWLEDGE.md"), conf)
        os.environ["NIXI_DATA"], os.environ["NIXI_DIR"] = data, conf
        srv = load("srv", "bin/nixi-server")
        srv._keybinds = lambda: ""          # no subprocesses in a test

        hit = srv.local_answer("how do I install an app")
        assert hit and "nixarchy apply" in hit, hit
        # "there is no AUR" is the right thing to say; RECOMMENDING it is not.
        assert not _recommends_arch(hit), hit

        assert srv.local_answer("zzzz qqqq wwww") is None, "should not force a match"
        print("  ok  offline search finds NixOS install answer, stays silent otherwise")
    finally:
        shutil.rmtree(data, ignore_errors=True)
        shutil.rmtree(conf, ignore_errors=True)


def test_learned_broker():
    """LEARNED: lines are stripped from the reply and persisted; the tutor
    itself never writes."""
    data = tempfile.mkdtemp(dir=os.path.expanduser("~/.cache"))
    os.chmod(data, 0o700)
    try:
        os.environ["NIXI_DATA"] = data
        os.environ["NIXI_DIR"] = data
        srv = load("srv2", "bin/nixi-server")
        out = srv.absorb_learned("Press SUPER+K.\nLEARNED: this box has 3 monitors")
        assert out == "Press SUPER+K.", repr(out)
        body = open(os.path.join(data, "LEARNED.md")).read()
        assert "3 monitors" in body, body
        assert oct(os.stat(os.path.join(data, "LEARNED.md")).st_mode)[-3:] == "600"
        print("  ok  learned-fact broker appends privately, strips the marker")
    finally:
        shutil.rmtree(data, ignore_errors=True)


def test_no_runtime_rename():
    """The fork renamed branding only. If any of these ever disappears, the
    widget silently stops talking to the desktop."""
    files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True,
                           text=True, check=True).stdout.split()
    # docs/FORK.md is the one file whose JOB is to name the old identifiers.
    # docs/FORK.md records the old names on purpose; this file spells them
    # out as search needles. Neither is shipped branding.
    SKIP = ("share/vendor/", "docs/FORK.md", "flake.lock", "tools/test_nixi.py")
    blob = ""
    for f in files:
        if f.endswith((".png", ".gif", ".jpg")) or f.startswith(SKIP):
            continue
        try:
            blob += open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
        except OSError:
            pass
    for token in ("omarchy menu keybindings --print", "omarchy-launch-webapp",
                  "omarchy-launch-or-focus", "omarchy-launch-config-editor",
                  "omarchy-notification-send", ".config/omarchy/defaults/agent",
                  ".config/omarchy/extensions/omarchy-menu.jsonc",
                  "local/state/omarchy/current/theme"):
        assert token in blob, "runtime integration point lost in the rename: " + token
    # ...and none of the old branding survived
    for stale in ("omarchy-help", "OMARCHY_HELP", "X-Archy-Token"):
        assert stale not in blob, "stale branding still present: " + stale
    print("  ok  omarchy runtime integration intact, old branding gone")


def test_port_is_configurable():
    """services.nixi.port moves the server, so every program that talks to it
    must read NIXI_PORT. The watcher used to hard-code 8642, which made the
    option silently wrong."""
    for prog in ("bin/nixi-server", "bin/nixi-watch", "bin/nixi"):
        text = open(os.path.join(ROOT, prog)).read()
        assert "NIXI_PORT" in text, prog + " ignores NIXI_PORT"
        # 8642 may appear only as the default beside NIXI_PORT, never bare.
        for line in text.splitlines():
            if "8642" in line:
                assert "NIXI_PORT" in line, "%s hard-codes 8642: %s" % (prog, line.strip())
    print("  ok  every program honours NIXI_PORT")


def test_units_have_a_nixos_path():
    """systemd user units start with a bare PATH. NixOS keeps essentially
    nothing in /usr/bin, so an Arch-shaped PATH makes the /usr/bin/env
    shebang fail with status 127 and the service never starts."""
    import glob
    for unit in glob.glob(os.path.join(ROOT, "systemd", "*.service")):
        text = open(unit).read()
        line = next((l for l in text.splitlines()
                     if l.startswith("Environment=PATH=")), None)
        assert line, os.path.basename(unit) + " sets no PATH"
        assert "/run/current-system/sw/bin" in line or "/etc/profiles" in line, \
            "%s has no NixOS path: %s" % (os.path.basename(unit), line)
    print("  ok  systemd units carry a NixOS-usable PATH")


def test_window_rule_is_valid_lua():
    """The class pattern is injected into Lua. Inside a QUOTED Lua string a
    backslash-dot is an invalid escape and Hyprland rejects the entire rule,
    which silently leaves the widget tiled instead of a pinned panel."""
    text = open(os.path.join(ROOT, "bin", "nixi-server")).read()
    call = next((l for l in text.splitlines() if "hl.window_rule" in l), None)
    assert call, "window rule call not found"
    assert "[[" in call, "class pattern must use a Lua long string: " + call.strip()
    # a regex escape must never sit inside a double-quoted Lua string
    quoted = re.findall(r'class\s*=\s*"([^"]*)"', call)
    assert not any("\\." in q for q in quoted), \
        "backslash escape inside a quoted Lua string: " + call.strip()
    print("  ok  window rule survives Lua parsing")


def test_faq_schema():
    """ui.html renders e.cat / e.q / e.a as strings."""
    faq = json.load(open(os.path.join(ROOT, "share/faq.json")))
    assert faq and all(
        set(e) == {"cat", "q", "a"} and all(isinstance(v, str) and v for v in e.values())
        for e in faq), "faq.json does not match what ui.html renders"
    joined = json.dumps(faq)
    assert "nixarchy apply" in joined
    assert not _recommends_arch(joined), "FAQ recommends Arch package management"
    print("  ok  faq schema + NixOS-correct install answer")


if __name__ == "__main__":
    for fn in (test_updater_precedence, test_local_search, test_learned_broker,
               test_no_runtime_rename, test_port_is_configurable,
               test_units_have_a_nixos_path, test_window_rule_is_valid_lua,
               test_faq_schema):
        fn()
    print("\nall checks passed")
