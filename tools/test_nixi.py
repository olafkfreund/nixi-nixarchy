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
# bin/ holds nixi_safeio.py, which the programs loaded below import by name: in
# every real layout it sits in their own directory, which is their sys.path[0].
# Loading them from here instead means saying where it is (#60).
sys.path.insert(0, os.path.join(ROOT, "bin"))


def load(name, path):
    # Dropping the cached nixi_safeio makes the loaded program re-import it, so
    # its $HOME anchor is recomputed against the environment this call is made
    # in. Tests that install into a fake HOME rely on that, and used to get it
    # for free when every program carried its own copy of the helpers (#60).
    sys.modules.pop("nixi_safeio", None)
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
    s = up._slug_of
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
    files = _tracked()
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

        # ---- #55 -------------------------------------------------------
        # A malformed Omarchy defaults file is not the user's doing and must
        # never fail their rebuild: return 0, write nothing, say what to do.
        bad = os.path.join(root, "bad-defaults.json")
        open(bad, "w").write("{not json")
        d = os.path.join(root, "bad-src"); os.makedirs(d)
        path, mark = os.path.join(d, "shell.json"), os.path.join(d, "state", "m")
        run = subprocess.run([sys.executable, script, path, mark, card, button, bad],
                             capture_output=True, text=True)
        assert run.returncode == 0, "a malformed defaults file failed the activation"
        assert not os.path.exists(path) and "Setup > Plugins" in run.stdout, run.stdout

        # An unreadable argv, a missing argument, anything at all: still 0.
        run = subprocess.run([sys.executable, script], capture_output=True, text=True)
        assert run.returncode == 0 and "could not enable the card" in run.stdout, run.stdout

        # barWidget.enable off, then on: the button must appear the second time.
        # It was one-shot -- the marker was checked before the ids were looked at.
        d = os.path.join(root, "button-later"); os.makedirs(d)
        path, mark = os.path.join(d, "shell.json"), os.path.join(d, "state", "m")
        json.dump(json.loads(json.dumps(user)), open(path, "w"), indent=2)
        base = [sys.executable, script, path, mark, card]
        subprocess.run(base + [""], check=True, capture_output=True)
        after = json.load(open(path))
        assert {"id": card} in after["plugins"] and {"id": button} not in after["bar"]["layout"]["center"]
        subprocess.run(base + [button], check=True, capture_output=True)
        after = json.load(open(path))
        assert {"id": button} in after["bar"]["layout"]["center"], "barWidget.enable is still one-shot"

        # The backup holds the bytes from BEFORE nixi first wrote, and is
        # written once -- not overwritten with a copy nixi itself produced.
        backup = path + ".bak-nixi"
        assert os.path.exists(backup), "no backup was written"
        assert json.loads(open(backup).read()) == user, "backup is not the original"

        # A legacy marker means the card was handled. It must NOT be read as
        # "nothing done": that would re-enable a card the user turned off.
        d = os.path.join(root, "legacy-off"); os.makedirs(d)
        path, mark = os.path.join(d, "shell.json"), os.path.join(d, "state", "m")
        off = json.loads(json.dumps(user))
        json.dump(off, open(path, "w"), indent=2)
        os.makedirs(os.path.dirname(mark))
        open(mark, "w").write("enabled once; delete to let nixi enable the card again\n")
        before = open(path).read()
        subprocess.run([sys.executable, script, path, mark, card, button], check=True, capture_output=True)
        assert open(path).read() == before, "a legacy marker re-enabled a card the user turned off"

        # ...but with the card still ON, a legacy marker plus a newly requested
        # button does add the button. That is the #55 fix for existing machines.
        d = os.path.join(root, "legacy-on"); os.makedirs(d)
        path, mark = os.path.join(d, "shell.json"), os.path.join(d, "state", "m")
        on = json.loads(json.dumps(user)); on["plugins"].append({"id": card})
        json.dump(on, open(path, "w"), indent=2)
        os.makedirs(os.path.dirname(mark))
        open(mark, "w").write("enabled once; delete to let nixi enable the card again\n")
        subprocess.run([sys.executable, script, path, mark, card, button], check=True, capture_output=True)
        assert {"id": button} in json.load(open(path))["bar"]["layout"]["center"], \
            "a legacy marker blocked the button for a card that is on"

        # NOT covered by a test: the mtime re-check before atomic_write. It
        # needs a write landing between two syscalls inside the script, which a
        # subprocess test cannot interleave. Verified by reading the code only.

        d = os.path.join(root, "linked"); os.makedirs(d)
        real = os.path.join(root, "real.json"); json.dump(user, open(real, "w"))
        os.symlink(real, os.path.join(d, "shell.json"))
        subprocess.run([sys.executable, script, os.path.join(d, "shell.json"), os.path.join(d, "m"), card, button], check=True, capture_output=True)
        assert json.load(open(real)) == user, "wrote through a symlinked shell.json"
        assert os.path.islink(os.path.join(d, "shell.json")), "replaced a symlinked (dotfile-managed) shell.json with a file"
        print("  ok  the card is enabled once, and shell.json is only ever extended")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_nixi_launcher():
    """`nixi` must never silently do nothing: the shell accepts a toggle for a
    plugin that is not enabled and returns 0 (nixarchy#709)."""
    card = "io.github.olafkfreund.nixi"
    root = tempfile.mkdtemp()
    try:
        def run(plugins_json, answers=True, args=()):
            d = tempfile.mkdtemp(dir=root)
            log = os.path.join(d, "calls")
            open(os.path.join(d, "omarchy-shell"), "w").write(
                "#!/bin/sh\n"
                'echo "shell $*" >> "%s"\n' % log
                + ('[ "$2" = listPlugins ] && { cat <<\'EOF\'\n%s\nEOF\n exit 0; }\n' % plugins_json if answers
                   else '[ "$2" = listPlugins ] && { echo "omarchy-shell is not responding" >&2; exit 1; }\n')
                + "exit 0\n")
            open(os.path.join(d, "omarchy-notification-send"), "w").write(
                '#!/bin/sh\necho "notify $*" >> "%s"\n' % log)
            for f in ("omarchy-shell", "omarchy-notification-send"):
                os.chmod(os.path.join(d, f), 0o755)
            # Stubs first, then the inherited PATH: a fixed host PATH has no bash
            # inside the Nix build sandbox (flake check).
            r = subprocess.run(["bash", os.path.join(ROOT, "bin", "nixi"), *args], capture_output=True, text=True,
                               env={"PATH": d + ":" + os.environ.get("PATH", ""), "HOME": d})
            calls = open(log).read() if os.path.exists(log) else ""
            return r, calls

        on = '[{"id":"%s","name":"Nixi","kinds":["overlay"],"enabled":true,"active":false}]' % card
        off = '[{"id":"%s","name":"Nixi","kinds":["overlay"],"enabled":false,"active":false},' \
              '{"id":"%s-button","name":"Nixi button","kinds":["bar-widget"],"enabled":true}]' % (card, card)
        missing = '[{"id":"vimarchy","enabled":true}]'

        r, calls = run(on)
        assert r.returncode == 0 and "shell toggle %s" % card in calls and "notify" not in calls, (r, calls)
        r, calls = run(on, args=("--tour",))
        assert r.returncode == 0 and "shell summon %s" % card in calls, calls
        for name, payload in (("disabled", off), ("missing", missing)):
            r, calls = run(payload)
            assert r.returncode == 1, name
            assert "toggle" not in calls, name + ": toggled a card that is off"
            assert "notify" in calls and "Setup > Plugins" in r.stderr, name + ": failed silently"
        r, calls = run(on, answers=False)
        assert r.returncode == 1 and "toggle" not in calls and "not answering" in r.stderr, (r.stderr, calls)
        # --ask summons (never toggles) with the question as JSON the card can
        # parse back exactly, quotes, backslash, newline and tab included (nixi#37).
        question = 'say "hi" \\ back\nnow\tthen'
        r, calls = run(on, args=("--ask", question))
        marker = "shell summon %s " % card
        summons = [l.partition(marker)[2] for l in calls.splitlines() if marker in l]
        assert r.returncode == 0 and len(summons) == 1 and "toggle" not in calls, (r, calls)
        assert json.loads(summons[0]) == {"action": "ask", "prompt": question}, summons[0]
        r, calls = run(off, args=("--ask", "x"))
        assert r.returncode == 1 and "summon" not in calls, (r, calls)
        r, calls = run(on, args=("--ask",))
        assert r.returncode == 64 and "summon" not in calls, (r, calls)
        print("  ok  nixi explains a card that is off instead of doing nothing")
        print("  ok  nixi --ask hands the card a question as exact JSON")
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
    # A model declared by id is not a property of root: `root.<id>` is
    # undefined at runtime, and the handler throws (#19).
    for model in re.findall(r"ListModel\s*\{\s*id:\s*(\w+)", card):
        assert "root.%s" % model not in card, \
            "Conversation.qml reaches ListModel %r as root.%s, which is undefined" % (model, model)
    print("  ok  FAQ, tour and learn are searchable from the card")


def test_prefers_nixarchy_plugins():
    """Nixi leads with nixarchy's own panels for the five jobs they exist for,
    and checks each is on before recommending it (#23)."""
    ids = ("nixarchy.pkg", "nixarchy.devenv", "nixarchy.microvm",
           "nixarchy.podman", "nixarchy.distrobox")
    knowledge = open(os.path.join(ROOT, "share/KNOWLEDGE.md")).read()
    missing = [i for i in ids if i not in knowledge]
    assert not missing, f"KNOWLEDGE.md does not name {missing}"
    assert "nixarchy-plugin --enabled" in knowledge, "KNOWLEDGE.md has no live check"

    skill = open(os.path.join(ROOT, "skills/nixi/SKILL.md")).read()
    assert "Prefer nixarchy's own tools" in skill, "the skill has no prefer-the-panel step"
    assert "nixarchy-plugin" in skill, "the skill never checks a plugin"
    assert "nixarchy-plugin --enabled" in open(os.path.join(ROOT, "share/CLAUDE.md")).read()

    faq = {e["q"]: e["a"] for e in json.load(open(os.path.join(ROOT, "share/faq.json")))}
    for q in ("Run a container", "Software that only ships for Ubuntu or Arch",
              "Try something in a throwaway VM"):
        assert q in faq, f"FAQ has no entry {q!r}"
    # A static answer cannot check the machine, so each one that sends people
    # to a panel must also say what to do when that panel is off.
    for q, a in faq.items():
        if any(p in a for p in ("Install → Packages", "Dev environments", "Apps → Podman",
                                "Trigger → Boxes", "Trigger → Sandbox")):
            assert "Setup → Plugins" in a, f"FAQ {q!r} names a panel but not how to turn it on"
    install = faq["Install an app"]
    assert "Packages" in install and install.index("Packages") < install.index("nixarchy apply"), \
        "the install answer does not lead with the package manager panel"

    learn = {t["id"]: t["question"] for t in
             json.load(open(os.path.join(ROOT, "share/learn.json")))["topics"]}
    assert "package manager" in learn["install"] and "NixOS will not run" in learn["install"]
    assert "containers" in learn["devenv"] and "VMs" in learn["devenv"]
    print("  ok  Nixi prefers nixarchy's own panels, after checking them")


def _block(src, start):
    """The text of the brace block that opens at or after `start`."""
    i = src.index("{", start)
    depth = 0
    for j in range(i, len(src)):
        depth += {"{": 1, "}": -1}.get(src[j], 0)
        if depth == 0:
            return src[i:j + 1]
    raise AssertionError("unbalanced braces")


def test_lookups_use_file_tools():
    # #27: in Mechanic every shell command needs a yes, so lookups done with
    # grep/ls/cat in a shell flood the card with prompts. The skill and both
    # briefs send the agent to its file tools instead.
    skill = open(os.path.join(ROOT, "skills/nixi/SKILL.md")).read()
    for path in ("skills/nixi/SKILL.md", "share/CLAUDE.md", "share/AGENTS.md"):
        assert "file tools" in open(os.path.join(ROOT, path)).read(), path
    for piped in ("| grep", "ls /usr", "test -d"):
        assert piped not in skill, f"the skill still teaches a shell lookup: {piped}"


def test_settings_keep_bridge_keys():
    """The UI and the bridge both write nixi.json. The UI must write its keys on
    top of what it read, or a font-size change deletes trust and
    askBeforeReading, which only the bridge writes (#27 review)."""
    ask = open(os.path.join(ROOT, "Ask.qml")).read()
    flush = _block(ask, ask.index("function flushSettings"))
    assert "Object.assign({}, settingsOnDisk" in flush, "flushSettings replaces nixi.json with UI keys only"
    load = _block(ask, ask.index("function loadSettings"))
    assert "settingsOnDisk = data" in load, "loadSettings does not remember the file it read"
    print("  ok  a UI settings write keeps the bridge's own keys")


def test_permission_keys_guard():
    """Y and N answer a permission prompt from the composer too, but only while
    it is empty, and Return does not send while the prompt is up (#20)."""
    card = open(os.path.join(ROOT, "Conversation.qml")).read()
    handler = _block(card, card.index("Keys.onPressed", card.index("id: prompt\n")))
    assert "pendingPermission.id" in handler, "the composer ignores a permission prompt"
    guard = _block(handler, handler.index("pendingPermission.id"))
    for token in ("text.length === 0", "Qt.Key_Y", "Qt.Key_N", "Qt.Key_Return"):
        assert token in guard, f"the composer's permission branch has no {token}"
    # One pair, in WindowShortcuts, shared by the overlay and the pinned window.
    shortcuts = [s for s in re.findall(r"Shortcut\s*\{[^}]*\}", card)
                 if re.search(r'sequence:\s*"[YN]"', s)]
    assert len(shortcuts) == 2, f"expected 2 Y/N shortcuts, found {len(shortcuts)}"
    for s in shortcuts:
        assert "conversation.permissionKeysLive" in s, "a Y/N shortcut ignores the typed-text guard"
    live = re.search(r"property bool permissionKeysLive:(.*)", card).group(1)
    assert "text.length === 0" in live, "a Y/N shortcut fires over typed text"
    # The composer answers with an OPTION ID. #58 changed answerPermission's
    # signature and left this caller passing a boolean, which found no option
    # and returned -- after event.accepted had already eaten the key (#50).
    assert "answerPermission(event.key === Qt.Key_Y)" not in guard, \
        "the composer answers with a boolean; answerPermission takes an option id"
    assert "optionIdForKind" in guard, "the composer does not answer with an option id"
    print("  ok  Y and N answer a prompt, and never over typed text")


def test_permission_settle_window():
    """A permission request cannot be answered before it has been on screen long
    enough to read: a held key answers once, and the next request in the queue
    is unanswerable for 400 ms however it is aimed at (#50).

    These are source assertions. The 400 ms itself is compositor-facing and can
    only be judged on a real desktop -- what is checked here is that every gate
    the design depends on is still in the file, so removing one fails CI. Each
    was confirmed to fail when its gate was deleted.
    """
    card = open(os.path.join(ROOT, "Conversation.qml")).read()

    # The agent's options have to reach the card at all: the Repeater renders one
    # button per option and the keys resolve through them, so an enqueue that
    # drops them leaves a card with no buttons and dead Y/N (#58 did exactly
    # that). Without this the settle window guards nothing.
    enqueue = _block(card, card.index("function enqueuePermission"))
    assert "options" in enqueue, "enqueuePermission drops the agent's options"
    call = re.search(r"enqueuePermission\(event\.[^)]*\)", card).group(0)
    assert "event.options" in call, "the permission event's options are not passed on"

    # One flag, cleared when a request is shown, set by one timer.
    assert "property bool permissionSettled" in card, "no settle flag"
    live = re.search(r"property bool permissionKeysLive:(.*)", card).group(1)
    assert "permissionSettled" in live, "Y and N are live before the card settles"
    show = _block(card, card.index("function showNextPermission"))
    assert "permissionSettled = false" in show, "showing the next request leaves it answerable"
    assert "permissionSettle.restart()" in show, "the settle window is never started"
    timer = card[card.index("id: permissionSettle"):]
    timer = timer[:timer.index("}")]
    assert "interval: 400" in timer, "the settle window is not 400 ms"

    # The gate itself, in the one function all three answer paths route through.
    answer = _block(card, card.index("function answerPermission"))
    assert "!permissionSettled" in answer, "answerPermission does not check the settle window"

    # A held key answers once, whatever the compositor's repeat_delay is.
    shortcuts = [s for s in re.findall(r"Shortcut\s*\{[^}]*\}", card)
                 if re.search(r'sequence:\s*"[YN]"', s)]
    assert len(shortcuts) == 2, f"expected 2 Y/N shortcuts, found {len(shortcuts)}"
    for s in shortcuts:
        assert "autoRepeat: false" in s, "a held Y or N repeats into the next request"
    handler = _block(card, card.index("Keys.onPressed", card.index("id: prompt\n")))
    assert "isAutoRepeat" in handler, "the composer answers on autorepeat"

    # The mouse too: after #53 a click can grant STANDING approval, so the
    # button is the path that most needs the window, and a greyed button is the
    # visible signal that this is a new question.
    buttons = card.split("id: permissionLayer")[1].split("id: cardFade")[0]
    buttons = buttons[buttons.index("Repeater {"):]
    assert "enabled: root.permissionSettled" in buttons, \
        "the permission buttons are clickable before the card settles"
    # qs.Ui.Button paints no disabled state, so `enabled` alone is invisible.
    assert "opacity: root.permissionSettled" in buttons, \
        "a settling permission button looks exactly like a clickable one"
    print("  ok  a request cannot be answered before it has been seen")


def test_permission_detail_is_plain():
    """The permission card shows what is being approved as plain text: an
    agent-supplied title or detail cannot restyle or hide part of itself, and a
    long detail scrolls inside the card instead of being cut short (#21)."""
    qml = open(os.path.join(ROOT, "Conversation.qml")).read()
    card = qml.split("id: permissionLayer")[1].split("id: cardFade")[0]
    title = card.split("text: root.pendingPermission.title")[1].split("}")[0]
    assert "textFormat: Text.PlainText" in title, "the permission title is not PlainText"
    assert "Flickable {" in card, "the permission detail does not scroll"
    detail = card.split("Flickable {")[1].split("ScrollBar.vertical")[0]
    assert "TextEdit {" in detail and "root.pendingPermission.detail" in detail, \
        "the permission detail is not in the Flickable"
    assert "textFormat: TextEdit.PlainText" in detail, "the permission detail is not PlainText"
    assert "readOnly: true" in detail, "the permission detail is editable"
    # Conversation {} is created with no size, so root.height is 0 and a
    # detail capped by it collapses to nothing (#21, seen on razer).
    assert "root.height" not in card.split("Flickable {")[1].split("TextEdit {")[0], \
        "the permission detail is sized from root, which has no height"
    print("  ok  the permission card shows its detail as plain, scrolling text")


def _legacy_local_answer(c, q):
    """bin/nixi-context's local_answer() as it was before #31, kept to prove
    that questions no tool matches still get exactly the same excerpt."""
    qt = c._tokens(q)
    if not qt:
        return None
    qset = set(qt)
    best, score = None, 0.0
    for head, body, tag in c._sections():
        ht, bt = c._tokens(head), c._tokens(body)
        if not bt:
            continue
        hmatch = len(qset & set(ht))
        s = 3.0 * hmatch                            # title/filename hits: undamped
        if hmatch and ht:
            s += 1.5 * hmatch / len(set(ht))        # focused titles beat long ones
        freq = sum(min(bt.count(w), 3) for w in qset)   # repeated terms matter
        s += freq / (1 + 0.02 * len(bt))
        if s > score:
            best, score = (head, body, tag), s
    # keybinding questions: grep the live bindings too
    kb_hit = ""
    if any(w in qset for w in ("key", "keys", "shortcut", "keybinding", "bind",
                               "super", "press", "hotkey")):
        kb = c._keybinds()
        hits = [l for l in kb.splitlines()
                if any(w in l.lower() for w in qt)][:4]
        kb_hit = "\n".join(hits)
    if score < 3.8 and not kb_hit:
        return None
    parts = []
    if best:
        body = best[1]
        body = body if len(body) <= 700 else body[:700].rsplit(" ", 1)[0] + " …"
        parts.append(f"From the {'manual' if best[2] == 'manual' else 'notes'} — {best[0]}:\n{body}")
    if kb_hit:
        parts.append("Your live keybindings say:\n" + kb_hit)
    return "\n\n".join(parts)



TOOL_QUESTIONS = {
    "how do I install btop?": "nixarchy.pkg",
    "how do I install an app?": "nixarchy.pkg",
    "how do I remove an app": "nixarchy.pkg",
    "I need a Python environment for one project": "nixarchy.devenv",
    "can I try something in a throwaway VM?": "nixarchy.microvm",
    "how do I run a container?": "nixarchy.podman",
    "this app only ships a .deb": "nixarchy.distrobox",
}


def test_tools_route():
    """For the five jobs nixarchy has a panel for, the grounding excerpt leads
    with that panel's row from KNOWLEDGE.md, and a weak, unrelated manual
    section no longer rides along; everything else is unchanged (#31)."""
    data, conf = tempfile.mkdtemp(), tempfile.mkdtemp()
    try:
        shutil.copytree(os.path.join(ROOT, "tools", "fixtures", "manual-grounding"),
                        os.path.join(data, "manual"))
        shutil.copy(os.path.join(ROOT, "share/KNOWLEDGE.md"), conf)
        os.environ["NIXI_DATA"], os.environ["NIXI_DIR"] = data, conf
        c = load("ctx31", "bin/nixi-context")
        c._keybinds = lambda: ""
        for q, tool in TOOL_QUESTIONS.items():
            hit = c.local_answer(q) or ""
            ids = re.findall(r"nixarchy\.(?:pkg|devenv|microvm|podman|distrobox)", hit)
            assert ids and ids[0] == tool, f"{q!r} leads with {ids[:1]}, not {tool}"
        absent = {"how do I install btop?": "Dual boot",
                  "can I try something in a throwaway VM?": "Using it",
                  "how do I run a container?": "Or: add it to NixOS",
                  "this app only ships a .deb": "I picked an app in Install"}
        for q, section in absent.items():
            assert section not in c.local_answer(q), f"{q!r} still carries {section!r}"
        present = {"how do I install an app?": "I picked an app in Install",
                   "I need a Python environment for one project": "Per-project environments"}
        for q, section in present.items():
            assert section in c.local_answer(q), f"{q!r} lost {section!r}"
        for q in ("how do I close an app", "open a terminal app",
                  "what is the scratchpad", "change the theme"):
            assert c.local_answer(q) == _legacy_local_answer(c, q), f"{q!r} changed"
        print("  ok  the five jobs lead with nixarchy's own tool; other questions unchanged")
    finally:
        shutil.rmtree(data, ignore_errors=True)
        shutil.rmtree(conf, ignore_errors=True)


def test_unit_parity():
    """CONTRIBUTING.md:52 makes install.py and nix/hm-module.nix parity a rule
    and asks for a job that checks it. This is that check, in the place CI
    already runs (checks.selfcheck) rather than a new job.

    ExecStart and PATH are deliberately NOT compared: one path installs to
    ~/.local/bin and the other to a store path, and no parity rule should
    collapse that. What must match is ordering and restart policy -- the fields
    that decide whether the unit works, and the ones that had drifted (#56)."""
    units = os.path.join(ROOT, "systemd")
    module = open(os.path.join(ROOT, "nix", "hm-module.nix")).read()

    def field(text, key):
        m = re.search(r"^%s=(.*)$" % re.escape(key), text, re.M)
        return m.group(1).strip() if m else None

    watch = open(os.path.join(units, "nixi-watch.service")).read()
    # The file version started at default.target, so the watcher ran before the
    # shell existed, failed, and burned its start limit -- dead for the session.
    for key, want in (("PartOf", "graphical-session.target"),
                      ("After", "graphical-session.target"),
                      ("WantedBy", "graphical-session.target"),
                      ("Restart", "on-failure"),
                      ("RestartSec", "2"),
                      ("Type", "exec")):
        got = field(watch, key)
        assert got == want, "nixi-watch.service %s=%s, expected %s" % (key, got, want)
        assert want in module, "nix/hm-module.nix lost %s=%s" % (key, want)

    timer = open(os.path.join(units, "nixi-manual.timer")).read()
    for key, want in (("Persistent", "true"), ("RandomizedDelaySec", "6h"),
                      ("WantedBy", "timers.target")):
        got = field(timer, key)
        assert got == want, "nixi-manual.timer %s=%s, expected %s" % (key, got, want)
        assert want in module, "nix/hm-module.nix lost %s=%s" % (key, want)

    manual = open(os.path.join(units, "nixi-manual.service")).read()
    assert field(manual, "Type") == "oneshot" and '"oneshot"' in module

    # The button's version is hand-maintained beside the package's single
    # source; nix/package.nix asserts they match at build time, and this catches
    # it before a build is even attempted.
    top = json.load(open(os.path.join(ROOT, "manifest.json")))
    button = json.load(open(os.path.join(ROOT, "button", "manifest.json")))
    assert top["version"] == button["version"], \
        "button/manifest.json is %s, manifest.json is %s" % (button["version"], top["version"])

    # A comment describing an assertion that does not exist is worse than none.
    flake = open(os.path.join(ROOT, "flake.nix")).read()
    assert "assets non-empty" not in flake, "flake.nix claims an assertion that is not there"

    print("  ok  the two unit definitions agree, and the versions do too")


def test_safeio_is_shared():
    """The safe-IO floor is the best-audited code here -- descriptor-bound
    $HOME-anchored walks, per-component uid/mode checks, O_EXCL temp plus
    renameat -- and it used to exist three times, byte-identically, in
    install.py, bin/nixi-watch and bin/nixi-update-manual (#60). Three copies is
    not redundancy: the next fix lands in one and rots in the other two, and the
    one-file diff looks complete.

    So this asserts there is exactly ONE definition of each helper, that it is
    in bin/nixi_safeio.py, and that everyone else imports it. Paste any helper
    back into a second file and this fails."""
    helpers = ("_group_exclusive", "_dir_ok", "_dirfd", "_write")
    consumers = ("install.py", "bin/nixi-watch", "bin/nixi-update-manual")
    home = "bin/nixi_safeio.py"

    sources = {rel: open(os.path.join(ROOT, rel)).read()
               for rel in consumers + (home,)}
    for h in helpers:
        where = [rel for rel, text in sources.items()
                 if re.search(r"^def %s\(" % h, text, re.M)]
        assert where == [home], "%s is defined in %s, want only %s" % (h, where, home)
    where = [rel for rel, text in sources.items()
             if re.search(r"^_UID = os\.getuid\(\)", text, re.M)]
    assert where == [home], "_UID is defined in %s, want only %s" % (where, home)

    for rel in consumers:
        assert re.search(r"^from nixi_safeio import ", sources[rel], re.M), \
            "%s no longer imports the shared safe-IO module" % rel
        # A local grp/pwd import is the tell-tale of a pasted-back copy.
        assert "import grp" not in sources[rel], "%s looks like it grew a copy again" % rel

    # CONTRIBUTING.md:52 -- both install paths must place it, in the same
    # directory as the suffix-less programs that import it by name.
    assert 'j.place(BIN, "nixi_safeio.py"' in sources["install.py"], \
        "install.py does not place nixi_safeio.py in ~/.local/bin"
    package = open(os.path.join(ROOT, "nix", "package.nix")).read()
    assert "install -Dm644 bin/nixi_safeio.py $out/bin/nixi_safeio.py" in package, \
        "nix/package.nix does not place nixi_safeio.py in the store bin/"
    assert "import nixi_safeio" in package, \
        "nix/package.nix does not prove the module is importable from $out/bin"

    print("  ok  the safe-IO helpers live in exactly one file, placed by both paths")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    print("\nall checks passed")
