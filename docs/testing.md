# Regression testing

Nixi currently uses a focused manual integration suite because its most
important behavior crosses Quickshell, Hyprland, Node, and a real ACP adapter.
Run this checklist on Omarchy Quattro before a release.

## Static checks

From the repository root:

```sh
node --check bridge/bridge.js
node --test bridge/*.test.js
python3 tools/test_nixi.py
git diff --check

check_dir=$(mktemp -d /tmp/nixi-check.XXXXXX)
rsync -a --exclude .git --exclude node_modules ./ "$check_dir/"
omarchy plugin validate "$check_dir"
```

The clean copy is required because npm creates symlinks under
`bridge/node_modules/.bin`, while Omarchy correctly rejects symlinks in a
distributable plugin tree.

## Installation smoke test

For opt-in live system-harness verification, run
`node bridge/model-smoke.js --full`. This sends 41 short tool-free prompts
using existing logins and verifies model/effort metadata and response text.
Omit `--full` for the default plus eight models at low effort.

```sh
omarchy plugin add https://github.com/olafkfreund/nixi-nixarchy.git --enable --yes
~/.config/omarchy/plugins/io.github.olafkfreund.nixi/install.sh
omarchy restart shell
```

Confirm the configured shortcut opens a centered overlay with an input caret,
square marker, GUIDE label, and bottom-right pin icon, and no text above the
input. With
`useHyprlandShortcutSubmap` enabled, confirm `hyprctl submap` reports
`nixi` while the overlay is mapped and `default` after close or pin.
Confirm a main-map chord such as Ctrl+Return reaches Nixi inside the overlay and
its original global binding still exists and works after dismissal.

## Conversation checklist

1. Submit a short prompt and confirm streamed text appears incrementally.
2. Submit a prompt that produces multiple assistant messages around a tool
   call; confirm separate ACP message IDs render as separate paragraphs.
3. Confirm assistant text is sans-serif, user prompts remain serif/italic, and
   there is breathing room before the next input.
4. Click a Markdown link and confirm the desktop URL handler opens it.
5. Use arrows, Page Up/Down, and Ctrl+H/J/K/L/U/D to scroll. Confirm each
   press supplies momentum, held/repeated keys build speed, opposite keys
   brake or reverse it, and the transcript coasts to a stop after release.
6. Scroll a long transcript with a trackpad and with a touch drag. Confirm the
   surface coasts after release and stops cleanly at both ends.
7. Press Ctrl+, from the composer and the transcript. Confirm the motion editor
   opens as a companion popup immediately right of Nixi and both remain usable.
   Drag its curve endpoint and verify impulse,
   friction, distance, and duration update live in every open conversation;
   close and reopen Nixi and confirm the values persisted. Reset restores the
   defaults.
8. Press Super+, from both overlay and pinned windows. Confirm the selector
   shows Codex/Claude/OpenCode, model, and thinking controls (disabled, reading
   "OpenCode settings", for OpenCode); Escape cancels and Return
   saves. Open a new conversation and confirm the bridge uses the selection,
   then restart the shell and confirm it persists. Verify an already-open
   conversation retains its existing ACP session.
9. Type `Hey what is 5+5`, `sum 10 34 100 110 123`, `72 F to C`, and
   `5 GiB in MB`. Confirm the calculator is always the first row, its equation
   is subordinate to the answer, long equations elide in the middle, and
   selecting it copies the answer. Confirm prose containing an isolated number
   does not produce a calculator row.
9. Type text matching files and repositories. Confirm compact `matched files`
   and `matched git repos` rows rank near the top without flooding ordinary
   menu results. Select each and confirm Nixi enters the corresponding inline
   result mode. Repeat by typing `@`, `^`, and `%`; confirm the square marker
   becomes the boxed prefix and Backspace on an empty query restores the
   square. Confirm `%` groups windows under workspace headers without making
   those headers selectable. Confirm hover/keyboard selection reveals the complete action hint.
   Confirm focused modes scroll inside a bounded result viewport and that all
   backend matches remain reachable rather than stopping after eight rows.
   Confirm Return opens the result, Ctrl+Return opens its containing folder,
   and Shift+Return copies the absolute path. Confirm all three actions close
   the transient overlay but leave a pinned Nixi window open. Confirm the first
   ten visible rows show Ctrl+1 through
   Ctrl+0, that each shortcut only moves the selection, and that the numbering
   follows the visible viewport 0.5 seconds after scrolling stops. Confirm
   repeating the same shortcut performs the row's normal Return action.
   Confirm arrows scroll the list when selection crosses a viewport edge;
   after independent scrolling leaves selection off-screen, Down snaps to the
   first visible row and Up snaps to the last visible row.
   Configure distinct `fileOpenCommand` and `fileEditCommand` argv arrays;
   confirm Return and Alt+Return append the selected path to the corresponding
   command. Remove them and confirm the legacy fallbacks still run.
   Coast into either end of the transcript and file list. Confirm momentum
   terminates as soon as the boundary is reached rather than leaving the
   surface in a running coast state.
10. While a long response streams, scroll upward. Confirm later chunks do not
   pull the viewport down. Return to the bottom and confirm following resumes.
11. With Codex selected, submit a turn that remains active long enough to type
    a correction. Confirm the composer remains enabled, Return inserts the
    correction into the transcript, and the subsequent response follows the
    correction without ending the session. With an agent that does not
    advertise `_meta.steering.supported`, confirm the composer remains hidden
    while its turn is active.

## Permission checklist

These run at Mechanic (`/mechanic`); "Ask mode" is the permission mode, as
opposed to YOLO.

1. In Ask mode, request a tool operation. Confirm the centered dialog appears
   above long tool/status text and both buttons work.
2. Repeat using `Y`, then using `N`.
3. Queue more than one permission and confirm the queue count and ordering.
4. Switch to YOLO, restart Omarchy Shell, and confirm YOLO remains selected.
5. Trigger a tool in YOLO and confirm ACP's allow option is selected without a
   dialog.
6. Switch back to Ask and confirm the persisted setting changes.

## Nixi checklist

1. Open the card with `nixi`, the bar button and SUPER+SPACE → Help. Each opens
   an empty card. On a home that never had Nixi, the first switch has already
   enabled it; turn it off in Setup > Plugins, switch again, and confirm it stays
   off and SUPER+H shows "Nixi is turned off".
2. Type `install`. Confirm the FAQ answer row and nixarchy's Install row appear
   and the Install action has no `pacman`. Type `tour` and `learn`; confirm the
   Tour and Learning rows.
3. At GUIDE, ask Nixi to create a file in `/tmp`. Confirm no permission dialog
   appears and no file is created. Click GUIDE; confirm it only says how to
   leave Guide.
4. Type `/mechanic`. Repeat the request; confirm the dialog appears, No leaves
   no file, Yes creates it. Click MECHANIC to reach YOLO; `/guide` returns to
   GUIDE and a queued dialog disappears.
5. Ask "how do I install an app". Confirm the answer uses `nixarchy apply`.
6. Correct the agent on a fact. Confirm no `LEARNED:` line is shown and
   `~/.local/share/nixi/LEARNED.md` gains a dated line.
7. `/tour`: step 1 appears once, as separate lines. Open a terminal; the next
   step appears. Close the card, reopen it: it is empty. `/tour` resumes at the
   same step.
8. With Super+, select each installed agent in turn and repeat 3 and 4.
9. Handed-over questions (`nixi --ask`, nixi#37):
   - **No card open:** `nixi --ask "how do I add a font?"` opens a card that
     asks and answers.
   - **Card open and idle:** the question is asked there. No second card
     opens.
   - **Card busy, mid-answer:** `nixi --ask "and a theme?"` only fills the
     prompt. The running answer continues, and Enter sends it.
   - **Slash text:** `nixi --ask "/mechanic"` only fills the prompt. The
     trust level is unchanged until you press Enter yourself.
   - **Card pinned:** a fresh overlay asks the question. The pinned window is
     untouched.
   - **Existing actions:** `nixi --tour` still starts the tour.

## Pinning and concurrency checklist

1. Start a conversation and note its bridge PID.
2. Click the pin icon. Confirm Hyprland maps a normal window titled
   `Nixi` and the bridge PID does not change.
3. Repeat with `Ctrl+P`, from a focused prompt and from a clicked transcript
   selection, and confirm both pin the conversation the same way.
4. Continue the conversation in that window and confirm prior context remains.
5. Invoke the global shortcut once. A fresh overlay must open immediately;
   the pinned window must remain.
6. Confirm there are now two bridge processes.
7. Close the fresh overlay. The pinned window and its bridge must remain.
8. Close the pinned window. Its final bridge process must exit.
9. Leave a pinned conversation unfocused while its reply completes. Confirm
   Hyprland receives one urgency event, focus and workspace do not change, and
   focusing the Nixi window clears its attention state. Repeat while Nixi is
   focused and confirm it does not enter the attention list. Repeat with two
   pinned conversations using native window urgency; confirm only
   the conversation that completed is marked.

Useful observations:

```sh
pgrep -af '/io.github.olafkfreund.nixi/bridge/bridge.js'
hyprctl clients -j | jq '.[] | select(.title == "Nixi")'
journalctl --user --since '5 minutes ago' --no-pager \
  | rg 'Ask.qml|Conversation.qml|ReferenceError|TypeError|qml.*error'
```

## Release acceptance

- Static checks pass.
- No QML errors appear during open, permission, pin, second-open, or close.
- Guide, and Ask mode within Mechanic, remain the defaults on a clean settings
  directory.
- The exact open → pin → one shortcut sequence succeeds.
- The manifest version equals the intended tag without the leading `v`.
- The source tree and installed plugin contain every QML entry/dependency file.

The guarded GitHub release workflow and maintainer procedure are documented in
[`release.md`](release.md).
