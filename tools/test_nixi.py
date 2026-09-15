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
    SKIP = ("docs/FORK.md", "flake.lock", "tools/test_nixi.py")
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
                  "omarchy-notification-send", ".config/omarchy/defaults/agent",
                  ".config/omarchy/extensions/omarchy-menu.jsonc"):
        assert token in blob, "runtime integration point lost in the rename: " + token
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
               test_nixi_rows_are_searchable):
        fn()
    print("\nall checks passed")
