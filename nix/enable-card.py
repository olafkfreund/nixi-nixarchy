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
    if card and not any(entry_id(e) == card for e in plugins):
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


MARKER_HEADER = "nixi-enabled-ids-v1"
LEGACY_MARKER = object()


def handled_ids(marker):
    """What a previous run recorded: a set of ids, LEGACY_MARKER for a marker
    written before this format, or None when there is none.

    The three states have to stay distinct. The marker is what makes turning the
    card OFF in Setup stick (nixarchy#709), so a legacy marker must NOT be read
    as "nothing done" -- that would re-enable a card the user deliberately
    disabled. It means "the card was handled", which is exactly what the old
    code recorded, and nothing about the button."""
    try:
        with open(marker) as handle:
            lines = [line.strip() for line in handle if line.strip()]
    except OSError:
        return None
    if lines and lines[0] == MARKER_HEADER:
        return set(lines[1:])
    # Anything else was written by an older nixi, or by hand. Do not guess at
    # its shape: a heuristic that reads arbitrary content as an id list turns a
    # marker the user relies on into one that re-enables what they turned off.
    return LEGACY_MARKER


def _main(argv):
    shell_json, marker, card = argv[1], argv[2], argv[3]
    button = argv[4] if len(argv) > 4 else ""
    defaults = argv[5:]
    wanted = {card} | ({button} if button else set())
    # Keyed on WHICH ids were handled, not merely that a run happened. The old
    # bare existence check made services.nixi.barWidget.enable one-shot: turning
    # it on after a run without it did nothing, silently, forever (#55).
    handled = handled_ids(marker)
    if handled is None:
        handled = set()
    elif handled is LEGACY_MARKER:
        handled = {card}
    if wanted <= handled:
        return 0
    todo = wanted - handled
    # Only what is outstanding. An id already recorded is left alone even if the
    # user has since removed it -- that is the point of the marker (nixarchy#709).
    adding_card = card in todo
    add_button = button and button in todo
    wanted |= handled
    original = None
    stat_before = None
    if os.path.lexists(shell_json):
        if os.path.islink(shell_json):
            print("nixi: %s is a symlink; not editing it, enable Nixi in Setup > Plugins" % shell_json)
            return 0
        try:
            with open(shell_json, "rb") as handle:
                original = handle.read()
            stat_before = os.stat(shell_json)
            config = json.loads(original.decode("utf-8"))
        except (OSError, ValueError, UnicodeDecodeError) as error:
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
        # Omarchy's own defaults file, which the user neither owns nor edits. A
        # malformed one used to raise straight out of activation and fail the
        # whole home-manager switch, for an opt-in convenience (#55).
        try:
            with open(source) as handle:
                config = json.load(handle)
        except (OSError, ValueError) as error:
            print("nixi: %s is unreadable (%s); not editing it, enable Nixi in Setup > Plugins" % (source, error))
            return 0
        config["version"] = 1
        os.makedirs(os.path.dirname(shell_json), exist_ok=True)
    # The button belongs to the card. If the card is not being added and is not
    # already enabled, the user turned it off -- and a bar button for a card
    # that is off is useless, so it must not appear either.
    if add_button and not adding_card:
        plugins = config.get("plugins")
        add_button = isinstance(plugins, list) and any(entry_id(e) == card for e in plugins)
    try:
        changed, notes = enable(config, card if adding_card else "", button if add_button else "")
    except ValueError as error:
        print("nixi: %s: %s; not editing it" % (shell_json, error))
        return 0
    if changed:
        # The running shell watches this file and Setup > Plugins writes it, so
        # re-check rather than clobber. A lock would be stronger and wrong: a
        # blocked activation is worse than a skipped opt-in write, and the retry
        # is the next rebuild.
        if stat_before is not None:
            try:
                now = os.stat(shell_json)
            except OSError as error:
                print("nixi: %s went away (%s); not editing it" % (shell_json, error))
                return 0
            if (now.st_mtime_ns, now.st_size) != (stat_before.st_mtime_ns, stat_before.st_size):
                print("nixi: %s changed while nixi was reading it; not editing it" % shell_json)
                return 0
        # Once, and only if absent: the point is to keep the bytes from before
        # nixi first touched the file, not a copy nixi itself produced.
        backup = shell_json + ".bak-nixi"
        if original is not None and not os.path.exists(backup):
            try:
                with open(backup, "wb") as handle:
                    handle.write(original)
            except OSError as error:
                print("nixi: could not write %s (%s); continuing" % (backup, error))
        atomic_write(shell_json, json.dumps(config, indent=2, ensure_ascii=False) + "\n")
    for note in notes:
        print("nixi: " + note)
    if changed:
        print("nixi: enabled %s in %s" % (card, shell_json))
    os.makedirs(os.path.dirname(marker), exist_ok=True)
    with open(marker, "w") as handle:
        handle.write("".join(line + "\n" for line in [MARKER_HEADER] + sorted(wanted)))
    return 0


def main(argv):
    """Never fail the rebuild. Enabling the card is opt-in convenience, and
    there is no failure of it worth costing someone their home-manager switch
    (#55). The cause is printed, never swallowed."""
    try:
        return _main(argv)
    except Exception as error:  # noqa: BLE001 -- see the docstring
        print("nixi: could not enable the card (%s: %s); enable Nixi in Setup > Plugins"
              % (type(error).__name__, error))
        return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
