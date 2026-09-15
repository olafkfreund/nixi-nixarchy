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
import sys
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
        # The overlay's grounding CLI.
        srv = load("srv", "bin/nixi-context")
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


def test_no_runtime_rename():
    """The fork renamed branding only. If any of these ever disappears, the
    widget silently stops talking to the desktop."""
    files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True,
                           text=True, check=True).stdout.split()
    # docs/FORK.md is the one file whose JOB is to name the old identifiers.
    # docs/FORK.md records the old names on purpose; this file spells them
    # out as search needles. Neither is shipped branding.
    SKIP = ("docs/FORK.md", "flake.lock", "tools/test_nixi.py", "intent/", "spec/", "plan/")
    blob = ""
    for f in files:
        if f.endswith((".png", ".gif", ".jpg")) or f.startswith(SKIP):
            continue
        try:
            blob += open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
        except OSError:
            pass
    # The config-editor launch and the theme file were the old widget's own
    # integration points and went with it (plan step 16); the card uses
    # Omarchy's theme through qs.Commons instead.
    for token in ("omarchy menu keybindings --print", "omarchy-launch-webapp",
                  "omarchy-launch-or-focus",
                  # the overlay's own: how nixi and the button reach the card,
                  # and where the menu model and data live
                  "omarchy-shell shell toggle", "omarchy-shell shell summon",
                  "share/omarchy/shell/plugins/menu/MenuModel.js", "OMARCHY_PATH",
                  "omarchy-notification-send", ".config/omarchy/defaults/agent",
                  ".config/omarchy/extensions/omarchy-menu.jsonc"):
        assert token in blob, "runtime integration point lost in the rename: " + token
    # Each entry point reaches the card itself; one file mentioning the call
    # must not cover for another that lost it.
    for f, calls in (("bin/nixi", ("omarchy-shell shell toggle", "omarchy-shell shell summon")),
                     ("button/BarWidget.qml", ("omarchy-shell shell toggle",))):
        text = open(os.path.join(ROOT, f)).read()
        for call in calls:
            assert call in text, "%s no longer calls %s" % (f, call)
    # ...and none of the old branding survived
    for stale in ("omarchy-help", "OMARCHY_HELP", "X-Archy-Token"):
        assert stale not in blob, "stale branding still present: " + stale
    print("  ok  omarchy runtime integration intact, old branding gone")


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


def test_faq_schema():
    """The card's search rows render e.cat / e.q / e.a as strings."""
    faq = json.load(open(os.path.join(ROOT, "share/faq.json")))
    assert faq and all(
        set(e) == {"cat", "q", "a"} and all(isinstance(v, str) and v for v in e.values())
        for e in faq), "faq.json does not match what the card renders"
    joined = json.dumps(faq)
    assert "nixarchy apply" in joined
    assert not _recommends_arch(joined), "FAQ recommends Arch package management"
    print("  ok  faq schema + NixOS-correct install answer")


def test_tour_and_learning_data():
    """The overlay reads the tour and learning path from share/*.json. Every
    step must be a matcher Tour.qml understands, and none may wait for the old
    browser widget -- the overlay has no 127.0.0.1 window, so such a step would
    never complete."""
    tour = json.load(open(os.path.join(ROOT, "share", "tour.json")))
    learn = json.load(open(os.path.join(ROOT, "share", "learn.json")))
    raw = open(os.path.join(ROOT, "share", "tour.json")).read()
    assert "127.0.0.1" not in raw, "a tour step still waits for the browser widget"

    known = {"event", "check", "self", "classAny", "dataContainsAny"}
    for i, step in enumerate(tour["steps"]):
        assert isinstance(step.get("text"), str) and step["text"].strip(), f"step {i} has no text"
        assert isinstance(step.get("count"), int) and step["count"] >= 1, f"step {i} count"
        m = step.get("match") or {}
        assert set(m) <= known, f"step {i} uses an unknown matcher key: {set(m) - known}"
        assert len({"event", "check", "self"} & set(m)) == 1, f"step {i} needs exactly one of event/check/self"
        if "classAny" in m or "dataContainsAny" in m:
            assert "event" in m, f"step {i}: classAny/dataContainsAny only qualify an event"
        if "check" in m:
            assert m["check"] == "defaultAgent", f"step {i}: unknown check {m['check']}"
        if "self" in m:
            assert m["self"] == "opened", f"step {i}: unknown self matcher {m['self']}"
    assert tour["steps"][-1]["match"] == {"self": "opened"}, "the last step must complete on summon"

    # The card renders CommonMark: a lone \n is a space, and a plain line after
    # a bullet joins that bullet ("try it Bonus: ..."). Only a list item may
    # follow a single newline.
    for i, step in enumerate(tour["steps"]):
        assert not re.search(r"(?<!\n)\n(?!\n|- )", step["text"]), \
            f"step {i}: a single newline collapses in the card; use a blank line"

    # Google Chrome is p620's default browser; the old matcher missed it.
    browser = next(s["match"] for s in tour["steps"] if "dataContainsAny" in s["match"])
    assert "chrome" in browser["dataContainsAny"], "the browser step cannot complete in Chrome"

    ids = [t["id"] for t in learn["topics"]]
    assert len(ids) == len(set(ids)), "duplicate learning topic ids"
    print("  ok  tour and learning data are valid and never wait for the old widget")


def _tracked():
    return subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True,
                          text=True, check=True).stdout.split()


def test_rebrand_is_complete():
    """omarchy-ask's own names must not survive the rebrand (plan step 3).
    docs/FORK.md and LICENSE record the origin; intent/spec/plan discuss it."""
    allowed = ("docs/FORK.md", "LICENSE", "intent/", "spec/", "plan/", "tools/test_nixi.py")
    pattern = re.compile(r"[Oo]marchy [Aa]sk|clickety-clacks\.ask|ask\.json|\bASK_")
    for f in _tracked():
        if f.startswith(allowed) or f.endswith((".png", ".gif", ".jpg")):
            continue
        text = open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
        m = pattern.search(text)
        assert not m, "omarchy-ask branding survives in %s: %r" % (f, m.group(0))
    print("  ok  no omarchy-ask branding outside the fork record")


def test_qml_is_portable():
    """The card must run from any plugin directory -- a store path, a test id
    -- and on NixOS (plan step 4)."""
    for f in [f for f in _tracked() if f.endswith(".qml")]:
        text = open(os.path.join(ROOT, f)).read()
        assert "/usr/share/omarchy" not in text, f + " reads Arch's /usr/share/omarchy"
        assert not re.search(r"plugins/io\.github\.olafkfreund\.nixi[^\"]*/bridge", text), \
            f + " hard-codes the bridge under one plugin id; use bridgeScript()"
    menu = open(os.path.join(ROOT, "MenuSearch.qml")).read()
    assert 'Quickshell.env("OMARCHY_PATH")' in menu, "menu data no longer comes from OMARCHY_PATH"
    print("  ok  QML has no Arch paths and no hard-coded plugin location")


def test_lock_bundles_no_adapter():
    """Adapters come from the user's system, never node_modules: upstream's
    npm copies ship non-free SDK binaries past Nix's license check (step 5)."""
    lock = json.load(open(os.path.join(ROOT, "bridge", "package-lock.json")))
    for name in lock.get("packages", {}):
        for banned in ("@anthropic-ai/", "@openai/", "claude-agent-acp", "codex-acp"):
            assert banned not in name, "bridge lock bundles %s (%s)" % (banned, name)
    print("  ok  the bridge lock bundles no agent adapter")


def test_old_widget_stays_gone():
    """The browser widget, its server and voice input were removed (plan step
    16). Only the checks that they are absent, and the installer's list of what
    to delete from an old install, may name them."""
    allowed = ("docs/FORK.md", "intent/", "spec/", "plan/", "tools/test_nixi.py",
               ".github/workflows/ci.yml", "install.py")
    pattern = re.compile(r"/voice|/listen/|pw-record|whisper|NIXI_WHISPER|ui\.html|8642|X-Nixi-Token")
    for f in _tracked():
        if f.startswith(allowed) or f.endswith((".png", ".gif", ".jpg")):
            continue
        text = open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
        m = pattern.search(text)
        assert not m, "the old widget is back in %s: %r" % (f, m.group(0))
    print("  ok  the old widget, server and voice input stay gone")


def test_old_plugin_dir_migration():
    """0.9.x left a real directory where 0.10 links the plugin, which fails
    Home Manager's checkLinkTargets on every upgraded machine. The migration
    may remove it only when it holds nothing but Home Manager's own links."""
    script = os.path.join(ROOT, "nix", "migrate-plugin-dir.sh")
    hm = "/nix/store/2l4gxghyqargbik6bx57rvkck6rrc8qh-home-manager-files/.config/omarchy/plugins/x/"
    root = tempfile.mkdtemp()
    try:
        def plugin_dir(name, entries):
            d = os.path.join(root, name)
            os.mkdir(d)
            for entry, target in entries:
                if target is None:
                    open(os.path.join(d, entry), "w").write("mine")
                else:
                    os.symlink(target, os.path.join(d, entry))
            return d

        def run(d, **env):
            return subprocess.run(["bash", script, d], capture_output=True, text=True,
                                  env={**os.environ, **env}, check=True)

        ours = plugin_dir("ours", [("manifest.json", hm + "manifest.json"), ("BarWidget.qml", hm + "BarWidget.qml")])
        out = run(ours, DRY_RUN="1")
        assert os.path.isdir(ours) and "would remove" in out.stdout, "dry run deleted something"
        run(ours)
        assert not os.path.lexists(ours), "Home Manager's old directory was not removed"

        checkout = plugin_dir("checkout", [("manifest.json", hm + "manifest.json"), ("install.py", None)])
        out = run(checkout)
        assert os.path.isfile(os.path.join(checkout, "install.py")), "a user's file was deleted"
        assert "move it aside" in out.stderr, "a foreign directory was kept silently"

        elsewhere = plugin_dir("elsewhere", [("manifest.json", "/home/someone/manifest.json")])
        run(elsewhere)
        assert os.path.islink(os.path.join(elsewhere, "manifest.json")), "a link not made by Home Manager was deleted"

        target = plugin_dir("target", [])
        linked = os.path.join(root, "linked")
        os.symlink(target, linked)
        run(linked)
        run(os.path.join(root, "absent"))
        assert os.path.islink(linked) and os.path.isdir(target), "an existing 0.10 link was touched"
        print("  ok  the 0.9 plugin directory is removed only when it is Home Manager's")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_enable_card():
    """The card is enabled once per home (nixarchy#709), without ever costing
    the user their bar: a user shell.json REPLACES Omarchy's defaults, so the
    file is only ever extended, or created whole from the defaults."""
    script = os.path.join(ROOT, "nix", "enable-card.py")
    card, button = "io.github.olafkfreund.nixi", "io.github.olafkfreund.nixi-button"
    root = tempfile.mkdtemp()
    try:
        defaults = os.path.join(root, "defaults.json")
        json.dump({"version": 1, "idle": {"x": 1}, "bar": {"layout": {"left": [{"id": "a"}], "center": [{"id": "b"}], "right": []}}, "plugins": []},
                  open(defaults, "w"))

        def case(name, config=None, raw=None, marker=False, with_defaults=True):
            d = os.path.join(root, name)
            os.makedirs(d)
            path, mark = os.path.join(d, "shell.json"), os.path.join(d, "state", "enabled-once")
            if raw is not None:
                open(path, "w").write(raw)
            elif config is not None:
                json.dump(config, open(path, "w"), indent=2)
            if marker:
                os.makedirs(os.path.dirname(mark))
                open(mark, "w").write("x")
            before = open(path).read() if os.path.exists(path) else None
            out = subprocess.run([sys.executable, script, path, mark, card, button]
                                 + ([defaults] if with_defaults else []),
                                 capture_output=True, text=True, check=True).stdout
            after = json.load(open(path)) if os.path.exists(path) and raw is None or (raw is not None and before != open(path).read()) else None
            return path, mark, before, after, out

        user = {"version": 1, "idle": {"keep": True}, "bar": {"layout": {"left": [], "center": [{"id": "clock"}], "right": []}}, "plugins": [{"id": "vimarchy"}]}

        path, mark, _, after, _ = case("nowhere", json.loads(json.dumps(user)))
        assert {"id": card} in after["plugins"] and {"id": "vimarchy"} in after["plugins"], after
        assert after["idle"] == {"keep": True} and {"id": "clock"} in after["bar"]["layout"]["center"], "other keys lost"
        assert {"id": button} in after["bar"]["layout"]["center"] and os.path.exists(mark)

        old = json.loads(json.dumps(user)); old["bar"]["layout"]["right"] = [{"id": card}]
        _, _, _, after, out = case("in-bar", old)
        assert {"id": card} in after["plugins"] and {"id": card} not in after["bar"]["layout"]["right"], "0.9 bar slot not moved"
        assert "moved" in out

        done = json.loads(json.dumps(user)); done["plugins"].append({"id": card}); done["bar"]["layout"]["center"].append({"id": button})
        path, mark, before, _, _ = case("already", done)
        assert open(path).read() == before and os.path.exists(mark), "an enabled card was rewritten"

        turned_off = json.loads(json.dumps(user))
        path, mark, before, _, _ = case("marker", turned_off, marker=True)
        assert open(path).read() == before, "a card the user turned off was re-enabled"

        path, mark, _, after, _ = case("missing")
        assert after["idle"] == {"x": 1} and after["bar"]["layout"]["left"] == [{"id": "a"}], "not created from the defaults"
        assert {"id": card} in after["plugins"] and after["version"] == 1

        path, mark, _, _, out = case("missing-no-defaults", with_defaults=False)
        assert not os.path.exists(path) and not os.path.exists(mark) and "Setup > Plugins" in out, "a bare shell.json would replace the whole bar"

        for name, raw in (("broken", "{not json"), ("unversioned", json.dumps({"plugins": []}))):
            path, mark, before, _, out = case(name, raw=raw)
            assert open(path).read() == before and not os.path.exists(mark), name + " file was edited"

        d = os.path.join(root, "linked"); os.makedirs(d)
        real = os.path.join(root, "real.json"); json.dump(user, open(real, "w"))
        os.symlink(real, os.path.join(d, "shell.json"))
        subprocess.run([sys.executable, script, os.path.join(d, "shell.json"), os.path.join(d, "m"), card, button], check=True, capture_output=True)
        assert json.load(open(real)) == user, "wrote through a symlinked shell.json"
        assert os.path.islink(os.path.join(d, "shell.json")), "replaced a symlinked (dotfile-managed) shell.json with a file"
        print("  ok  the card is enabled once, and shell.json is only ever extended")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_nixi_rows_are_searchable():
    """The FAQ, the tour and the learning path are reachable from the card's
    search, not only as typed commands -- and an FAQ answer is shown in the
    card rather than launching something."""
    menu = open(os.path.join(ROOT, "MenuSearch.qml")).read()
    card = open(os.path.join(ROOT, "Conversation.qml")).read()
    assert "share/faq.json" in menu, "the FAQ is not loaded into the search"
    for flag in ("isNixiFaq", "isNixiAction"):
        assert flag in menu, "search has no %s row" % flag
    assert "lastRunKeepsOpen = true" in menu.split("if (row.isNixiFaq)")[1][:400], \
        "answering an FAQ closes the card"
    assert "onFaqAnswered" in card and "onNixiActionRequested" in card, \
        "the card ignores its own search rows"
    print("  ok  FAQ, tour and learn are searchable from the card")


if __name__ == "__main__":
    for fn in (test_updater_precedence, test_local_search, test_no_runtime_rename, test_units_have_a_nixos_path, test_faq_schema, test_tour_and_learning_data,
               test_rebrand_is_complete, test_qml_is_portable, test_lock_bundles_no_adapter, test_old_widget_stays_gone, test_old_plugin_dir_migration, test_enable_card,
               test_nixi_rows_are_searchable):
        fn()
    print("\nall checks passed")
