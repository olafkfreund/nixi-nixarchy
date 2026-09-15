#!/usr/bin/env python3
"""Enable the Nixi card in the Omarchy shell, once per home (nixarchy#709).

An Omarchy plugin is enabled when its id is referenced anywhere in
~/.config/omarchy/shell.json: `plugins[]` for an overlay, `bar.layout.*` for a
bar widget (shell/services/PluginRegistry.qml isEnabled). Toggling a plugin
that is not enabled succeeds silently, so without this SUPER+H does nothing on
a fresh desktop.

Runs once: after a successful pass it writes a marker, so a user who later
turns the card off in Setup > Plugins stays off.

The shell does not merge a user shell.json with its defaults -- a valid user
file REPLACES them (shell.qml applyShellConfig). So a missing file is created
from Omarchy's defaults, the way the shell itself writes one, never from
scratch: a file holding only `plugins` would take the whole bar away. An
unreadable or unversioned file is left alone and reported.

The running shell watches the file (FileView watchChanges) and reloads it, so
an atomic replace is picked up live.

usage: enable-card.py SHELL_JSON MARKER CARD_ID [BUTTON_ID] [DEFAULTS...]
"""
import json
import os
import sys
import tempfile

SECTIONS = ("left", "center", "right")


def entry_id(entry):
    return entry.get("id") if isinstance(entry, dict) else None


def bar_sections(config):
    layout = config.get("bar", {}).get("layout", {}) if isinstance(config.get("bar"), dict) else {}
    return layout if isinstance(layout, dict) else {}


def in_bar(config, plugin_id):
    return any(entry_id(e) == plugin_id
               for section in bar_sections(config).values() if isinstance(section, list)
               for e in section)


def enable(config, card, button):
    """Return (changed, notes). Mutates config."""
    notes = []
    plugins = config.setdefault("plugins", [])
    if not isinstance(plugins, list):
        raise ValueError("`plugins` is not a list")
    changed = False
    if not any(entry_id(e) == card for e in plugins):
        # 0.9's bar widget used the card's id; that slot is what enabled it.
        for name, section in bar_sections(config).items():
            if isinstance(section, list) and any(entry_id(e) == card for e in section):
                bar_sections(config)[name] = [e for e in section if entry_id(e) != card]
                notes.append("moved %s from bar.layout.%s to plugins" % (card, name))
        plugins.append({"id": card})
        changed = True
    if button and not in_bar(config, button):
        center = bar_sections(config).get("center")
        if isinstance(center, list):
            center.append({"id": button})
            changed = True
        else:
            notes.append("no bar.layout.center to place %s in; add it from Setup" % button)
    return changed, notes


def atomic_write(path, text):
    directory = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(prefix=".shell.json.", dir=directory)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(text)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def main(argv):
    shell_json, marker, card = argv[1], argv[2], argv[3]
    button = argv[4] if len(argv) > 4 else ""
    defaults = argv[5:]
    if os.path.exists(marker):
        return 0
    if os.path.lexists(shell_json):
        if os.path.islink(shell_json):
            print("nixi: %s is a symlink; not editing it, enable Nixi in Setup > Plugins" % shell_json)
            return 0
        try:
            with open(shell_json) as handle:
                config = json.load(handle)
        except (OSError, ValueError) as error:
            print("nixi: %s is unreadable (%s); not editing it, enable Nixi in Setup > Plugins" % (shell_json, error))
            return 0
        if not isinstance(config, dict) or config.get("version") != 1:
            print("nixi: %s is not a version 1 shell config; not editing it" % shell_json)
            return 0
    else:
        source = next((d for d in defaults if os.path.isfile(d)), None)
        if source is None:
            print("nixi: no shell.json and no Omarchy defaults found; enable Nixi in Setup > Plugins")
            return 0
        with open(source) as handle:
            config = json.load(handle)
        config["version"] = 1
        os.makedirs(os.path.dirname(shell_json), exist_ok=True)
    try:
        changed, notes = enable(config, card, button)
    except ValueError as error:
        print("nixi: %s: %s; not editing it" % (shell_json, error))
        return 0
    if changed:
        atomic_write(shell_json, json.dumps(config, indent=2, ensure_ascii=False) + "\n")
    for note in notes:
        print("nixi: " + note)
    if changed:
        print("nixi: enabled %s in %s" % (card, shell_json))
    os.makedirs(os.path.dirname(marker), exist_ok=True)
    with open(marker, "w") as handle:
        handle.write("enabled once; delete to let nixi enable the card again\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
