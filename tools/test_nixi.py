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


def test_voice_stays_local():
    """The browser SpeechRecognition API would ship the microphone to Google,
    and is a silent no-op on any Chromium without Google API keys (nixpkgs'
    has none). Reaching for it is the regression to catch."""
    ui = open(os.path.join(ROOT, "share/ui.html")).read()
    for api in ("webkitSpeechRecognition", "SpeechRecognition",
                "speechSynthesis", "speech.googleapis.com"):
        assert api not in ui, "ui.html reaches for %s; audio must stay local" % api
    srv = open(os.path.join(ROOT, "bin/nixi-server")).read()
    assert "whisper-cli" in srv, "no local transcriber"
    # Capture belongs to the desktop, not the page: pw-record behaves the same
    # in every browser and needs no per-origin microphone permission.
    assert "pw-record" in srv, "no local recorder"
    for api in ("MediaRecorder", "getUserMedia", "btoa("):
        assert api not in ui, \
            "ui.html records audio itself (%s); the desktop does that" % api
    print("  ok  voice never leaves the machine")


def test_transcript_is_never_auto_sent():
    """A misheard word in Mechanic mode would act on the machine. The
    transcript goes in the input box; only a human keypress submits it."""
    ui = open(os.path.join(ROOT, "share/ui.html")).read()
    m = re.search(r"mic\.addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{(.*?)\n\}\);",
                  ui, re.S)
    assert m, "could not find the mic click handler"
    # Comments in here talk *about* ask(); only real calls count.
    body = re.sub(r"//[^\n]*", "", m.group(1))
    assert "input.value" in body, "transcript never reaches the input box"
    assert not re.search(r"\bask\s*\(", body), \
        "voice path calls ask() directly -- speech must not auto-submit"
    assert not re.search(r"form\.(submit|requestSubmit)\b", body), \
        "voice path submits the form -- speech must not auto-submit"
    print("  ok  speech lands in the box, never auto-sent")


def test_whisper_flags_exist():
    """Flags are version specific: -nt/-np/--prompt/-m/-l are whisper-cli 1.9's
    names. A renamed flag makes every transcription fail at runtime only."""
    srv = open(os.path.join(ROOT, "bin/nixi-server")).read()
    m = re.search(r'\["whisper-cli",(.*?)\]', srv, re.S)
    assert m, "whisper-cli invocation not found"
    args = m.group(1)
    for flag in ("-m", "-l", "-nt", "-np", "--prompt"):
        assert '"%s"' % flag in args, "whisper-cli invocation lost %s" % flag
    r = re.search(r'\["pw-record",(.*?)\]', srv, re.S)
    assert r, "pw-record invocation not found"
    # whisper wants 16k mono s16, and recording straight into it is what let
    # ffmpeg go; losing any of these silently reintroduces a transcode step.
    for a in ('"16000"', '"1"', '"s16"'):
        assert a in r.group(1), "pw-record no longer records whisper's format: " + a
    # The domain prompt is the difference between "nixarchy" and "Nixaki".
    assert "nixarchy" in srv.split("VOICE_PROMPT")[1][:400], \
        "the whisper prompt no longer biases towards nixarchy vocabulary"
    print("  ok  whisper invoked with flags that exist")


def test_both_install_paths_know_about_voice():
    """There are two installers -- the Nix module and install.py's unit file --
    and they have drifted before (the Arch-shaped PATH that made the service
    exit 127). Whatever one can do, the other must at least be able to reach."""
    unit = open(os.path.join(ROOT, "systemd", "nixi.service")).read()
    module = open(os.path.join(ROOT, "nix", "hm-module.nix")).read()
    if "NIXI_WHISPER_MODEL" in module:
        assert "NIXI_WHISPER_MODEL" in unit, (
            "the Nix module can do voice but the plain systemd unit cannot; "
            "plugin installs would get a mic button that never appears")
    print("  ok  both install paths can reach voice")


def test_mic_button_describes_what_it_does():
    """The button shipped saying "Hold to talk" while the handler was a click
    toggle, and only the title was ever updated -- so a screen reader
    announced the wrong interaction, permanently."""
    ui = open(os.path.join(ROOT, "share/ui.html")).read()
    tag = re.search(r'<button id="mic"[^>]*>', ui)
    assert tag, "mic button not found"
    assert "hold" not in tag.group(0).lower(), \
        "mic button still advertises hold-to-talk: " + tag.group(0)
    # aria-label has to move with the title, or it keeps the first state.
    assert "mic.setAttribute('aria-label'" in ui, \
        "aria-label is never updated as the button changes state"
    # Exactly one assignment, and it is the helper's own: any other caller
    # setting the title directly would leave aria-label behind again.
    helper = ui.split("function micLabel(")[1].split("\n}")[0]
    assert len(re.findall(r"mic\.title\s*=", ui)) == 1, \
        "title is set outside micLabel(); aria-label will drift from it"
    assert "mic.title" in helper, "micLabel does not set the title"
    print("  ok  mic button label matches its behaviour")


def test_voice_deps_reach_every_entry_point():
    """`nixi` starts its own server whenever the health check fails, and that
    copy inherits the user's interactive PATH. Putting whisper only on the
    systemd unit gives voice that works from the service and silently does
    not work from the launcher -- the same two-paths drift that made the
    service exit 127."""
    mod = open(os.path.join(ROOT, "nix", "hm-module.nix")).read()
    assert "makeWrapper" in mod and "nixi-server" in mod, \
        "voice dependencies are not wrapped onto the programs"
    wrapper = mod.split("nixiPkg =")[1].split("\n  # Units run")[0]
    for need in ("voice.package", "pipewire"):
        assert need in wrapper, "wrapper does not provide " + need
    # Both binaries, or the launcher-spawned server is left without them.
    assert "for p in nixi nixi-server" in wrapper, \
        "only one binary is wrapped; the other entry point loses voice"
    # The wrapped package, not the bare one, must be what gets installed.
    assert "home.packages = [ nixiPkg ]" in mod, \
        "the unwrapped package is installed, so nothing carries the deps"
    print("  ok  voice deps reach both the service and the launcher")


def test_installer_model_pins_match_the_flake():
    """install.py fetches the same two models the Nix module pins, so the
    plugin path is not left with voice inert. Two sources of the same hash
    drift, and I typed both of these wrong by eye the first time."""
    import base64
    mod = open(os.path.join(ROOT, "nix", "hm-module.nix")).read()
    inst = open(os.path.join(ROOT, "install.py")).read()
    sris = re.findall(r'hash = "sha256-([^"]+)"', mod)
    assert len(sris) >= 2, "expected the speech and VAD models to be pinned"
    for sri in sris:
        hexd = base64.b64decode(sri).hex()
        assert '"%s"' % hexd in inst, (
            "install.py does not carry the flake's pin %s...; a plugin install "
            "would fetch something the flake never verified" % hexd[:16])
    print("  ok  installer and flake pin the same models")


def test_no_speech_is_caught_and_explained():
    """Whisper INVENTS text from clips with no speech: digital silence decodes
    as " You", a quiet room as "(wind howling)". That is caught by VAD, not by
    a loudness threshold -- the first version gated on RMS 1100 and merely
    discarded audio whisper transcribes fine (correct at RMS 576 down to 34),
    so a user spoke and got back an empty string."""
    srv = open(os.path.join(ROOT, "bin/nixi-server")).read()
    body = srv.split("def transcribe(")[1].split("\ndef ")[0]
    assert "--vad" in body, "no voice-activity detection; whisper will invent"
    # The loudness check may only catch a dead mic, never ordinary quiet speech.
    m = re.search(r'SILENCE_RMS = int\(os\.environ\.get\([^,]+,\s*"(\d+)"\)', srv)
    assert m, "SILENCE_RMS default not found"
    assert int(m.group(1)) <= 50, (
        "the loudness gate is back above dead-mic level (%s); whisper "
        "transcribes correctly down to RMS 34, so this discards real speech"
        % m.group(1))
    # Every empty result must say which of the several causes it was.
    assert body.count("return \"\",") >= 2, "an empty transcript with no reason"
    assert "no signal at all" in body and "no speech in it" in body, \
        "the empty cases are not distinguished for the user"
    ui = open(os.path.join(ROOT, "share/ui.html")).read()
    assert "j.note" in ui, "the widget throws away the reason the server gave"

    # The module OVERRIDES the server's defaults through the wrapper, so
    # checking bin/nixi-server alone proves nothing about a flake install.
    # This shipped once with the server at 15 and the module still at 1100,
    # which made the whole fix inert for every Home Manager user.
    mod = open(os.path.join(ROOT, "nix", "hm-module.nix")).read()
    assert "NIXI_VAD_MODEL" in mod, \
        "the module fetches a VAD model and never tells the server where it is"
    dflt = re.search(r"silenceThreshold = lib\.mkOption \{.*?default = (\d+);",
                     mod, re.S)
    assert dflt, "silenceThreshold default not found in the module"
    assert int(dflt.group(1)) == int(m.group(1)), (
        "module default (%s) overrides the server's (%s); the flake install "
        "would behave differently from every other one"
        % (dflt.group(1), m.group(1)))
    print("  ok  no-speech caught by VAD, and every empty result explains itself")


def test_recorder_is_always_released():
    """The widget can be closed mid-recording. Without a watchdog and an exit
    hook the microphone would stay open with nothing left to stop it."""
    srv = open(os.path.join(ROOT, "bin/nixi-server")).read()
    assert "threading.Timer(MAX_SECONDS" in srv, "no recording watchdog"
    quit_fn = srv.split("def _shutdown(")[1].split("\ndef ")[0]
    assert "_discard()" in quit_fn, "server exit leaves the recorder running"
    stop = srv.split("def _stop_proc(")[1].split("\ndef ")[0]
    # SIGKILL leaves a WAV whose RIFF length header was never rewritten.
    assert "terminate()" in stop, "recorder must be SIGTERMed so the WAV closes"
    print("  ok  recorder is always released")


def test_voice_scratch_stays_under_home():
    """Recordings are created through the descriptor-bound helper like every
    other private file -- /tmp is refused by _dirfd and is world-readable --
    and must not outlive the request that made them."""
    srv = open(os.path.join(ROOT, "bin/nixi-server")).read()
    make = srv.split("def _new_clip(")[1].split("\ndef ")[0]
    # The docstring discusses /tmp; only executable lines count.
    make = make.split('"""')[2] if make.count('"""') >= 2 else make
    make = re.sub(r"#[^\n]*", "", make)
    assert "_dirfd(" in make, "recordings bypass the descriptor-bound helper"
    assert "O_EXCL" in make and "O_NOFOLLOW" in make, "clip created unsafely"
    assert "/tmp" not in make and "tempfile" not in make, \
        "recordings are written outside $HOME"
    # Both the normal path and the watchdog have to delete the clip.
    for fn in ("stop_recording", "_discard"):
        body = srv.split("def %s(" % fn)[1].split("\ndef ")[0]
        assert "os.unlink" in body, "%s leaves the recording on disk" % fn
    print("  ok  recordings stay under $HOME and are deleted")


if __name__ == "__main__":
    for fn in (test_updater_precedence, test_local_search, test_learned_broker,
               test_no_runtime_rename, test_port_is_configurable,
               test_units_have_a_nixos_path, test_window_rule_is_valid_lua,
               test_faq_schema, test_voice_stays_local,
               test_transcript_is_never_auto_sent, test_whisper_flags_exist,
               test_both_install_paths_know_about_voice,
               test_mic_button_describes_what_it_does,
               test_voice_deps_reach_every_entry_point,
               test_installer_model_pins_match_the_flake,
               test_no_speech_is_caught_and_explained,
               test_recorder_is_always_released,
               test_voice_scratch_stays_under_home):
        fn()
    print("\nall checks passed")
