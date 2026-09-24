import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Ui
// Pure display formatting, unit tested under node (bridge/text-format.test.js).
import "TextFormat.js" as TextFormat

Item {
  id: root

  // Bridge scripts are resolved next to this file, the way Ask.qml already
  // loads HarnessSelector.qml, not from a fixed ~/.config/omarchy/plugins/<id>/
  // path: a Nix store install, a symlinked checkout and a second plugin id all
  // put the plugin somewhere else, and the fixed path then silently points at
  // a directory with no bridge in it.
  function bridgeScript(name) {
    return decodeURIComponent(String(Qt.resolvedUrl("bridge/" + name)).replace(/^file:\/\//, ""))
  }

  signal closed()
  signal copyConfirmed()
  signal permissionModeConfirmed(string mode)
  signal tourRequested()
  signal learnRequested()
  property bool opened: false
  property bool layoutReady: false
  property bool waiting: false
  property bool bridgeReady: false
  property bool steeringSupported: false
  property bool steeringPending: false
  property bool composerTailPinned: false
  property bool resultsRevealPending: false
  property bool outsideDismissArmed: false
  property bool sessionLost: false
  property bool pinned: false
  property string windowTitle: "Nixi"
  property string statusText: ""
  property int activeReply: -1
  property string activeReplyMessageId: ""
  property string queuedPrompt: ""
  // The request on screen. noPermission (id "") means none, so bindings can
  // read its fields without a null check.
  readonly property var noPermission: ({ id: "", title: "", detail: "", omitted: 0, options: [] })
  property var pendingPermission: noPermission
  property var permissionQueue: []
  // False for the first 400 ms a request is on screen, so it cannot be answered
  // before it has been seen (#50). answerPermission() is the single gate; this
  // also disarms the keys and greys the buttons, which is the visible signal
  // that the card in front of you is a NEW question.
  property bool permissionSettled: false
  property string permissionMode: "permission"
  property bool permissionModePending: false
  // Nixi trust level, owned by the bridge (see bridge/trust-policy.js). Guide
  // explains and never changes the machine; Mechanic asks before each change.
  property string trust: "guide"
  property bool trustPending: false

  // Font scale is owned by the manager so every conversation and both window
  // modes share one value, and so a single writer persists it.
  property real fontScale: 1
  signal fontScaleStepRequested(real step)
  signal fontScaleResetRequested()
  signal motionTunerRequested()
  signal harnessSelectorRequested()
  signal sessionRestartRequested()
  property real keyboardLineImpulse: 335
  property real keyboardPageImpulse: 689
  property real keyboardDeceleration: 608
  property var fileOpenCommand: []
  property var fileEditCommand: []
  property bool motionTunerOpen: false
  property bool harnessSelectorOpen: false
  property string agentName: ""
  property string modelName: ""
  property string reasoningEffort: ""
  property string searchMode: ""
  property string lastVisibleShortcut: ""
  readonly property bool permissionKeysLive: pendingPermission.id !== "" && permissionSettled && prompt.text.length === 0
  property string hoverPreviewPath: ""
  property bool filePreviewVisible: false
  property int filePreviewRequestId: 0
  property string filePreviewThumbnail: ""
  property string filePreviewName: ""
  property string filePreviewText: ""
  onMenuIndexChanged: {
    if (root.searchMode !== "@" || menuIndex < 0
        || menuIndex >= menuSearch.rows.length) {
      closeFilePreview()
      return
    }
    var row = menuSearch.rows[menuIndex]
    if (row && row.isPath && !row.isRepository)
      scheduleFilePreview(row.absolutePath)
    else closeFilePreview()
  }
  onSearchModeChanged: if (searchMode !== "@") closeFilePreview()
  onMotionTunerOpenChanged: {
    if (!motionTunerOpen && opened && !pinned)
      Qt.callLater(function() { prompt.forceActiveFocus() })
  }
  onHarnessSelectorOpenChanged: {
    if (!harnessSelectorOpen && opened && !pinned)
      Qt.callLater(function() { prompt.forceActiveFocus() })
  }

  // Anchoring pins a freshly submitted prompt to the top of the viewport and
  // lets the reply fill the space beneath it. `tailSpace` is scratch room
  // appended past the transcript so the newest prompt can actually reach the
  // top; it shrinks as the reply grows, which holds the maximum scroll offset
  // at `anchorY` and keeps the prompt still. Once the reply outgrows the
  // viewport the room is gone and ordinary tail-following resumes.
  property bool anchorActive: false
  property real anchorY: 0
  readonly property real tailSpace: anchorActive
    ? Math.max(0, surface.height - Math.max(0, stack.height - anchorY))
    : 0

  readonly property color background: Color.menu.background
  readonly property color foreground: Color.menu.text
  readonly property color border: Color.menu.border
  readonly property color accent: Color.accent
  readonly property color scrim: Color.menu.scrim
  readonly property string conversationFont: "Noto Serif"
  readonly property int agentSize: Math.round(Style.font.body * 1.15 * root.fontScale)
  readonly property int humanSize: Math.round(Style.font.body * 2.36 * root.fontScale)
  readonly property bool composerPinsTail: root.waiting && root.steeringSupported
    && root.composerTailPinned && prompt.activeFocus && prompt.text.length > 0

  function humanSizeFor(text) {
    // Keep short prompts display-sized, but react quickly once they begin to
    // wrap. Newlines count extra because they consume vertical space even
    // when the raw character count is low. Assistant size is the hard floor.
    var value = String(text || "")
    var newlines = (value.match(/\n/g) || []).length
    var visualLength = value.length + newlines * 32
    var progress = Math.max(0, Math.min(1, (visualLength - 24) / 216))
    return Math.round(humanSize - (humanSize - agentSize) * progress)
  }

  // Agent replies render as TextEdit.MarkdownText, and Qt loads remote images
  // in a Markdown document through QQuickPixmap -- measured on Qt 6.11.2,
  // which fetched an http:// image with its query string intact, on render,
  // with no user action (#42). TextFormat rewrites any image that is not a
  // contained local file to its alt text before it can reach the renderer.
  readonly property string imageRoot: Quickshell.env("HOME") + "/.local/share/nixi/images"
  function spacedMarkdown(text) {
    return TextFormat.spacedMarkdown(text, root.imageRoot)
  }

  function open(payloadJson) {
    layoutReady = false
    card.opacity = 0
    veil.opacity = 0
    opened = true
    noteKeyboardActivity()
    entranceTimer.restart()
    agent.running = true
  }

  readonly property var bridgeCommand: {
    var raw = String(Quickshell.env("NIXI_BRIDGE_COMMAND") || "").trim()
    var prefix = []
    if (raw !== "") {
      try { prefix = JSON.parse(raw) } catch (error) { prefix = [] }
    }
    // Preserve the historical PATH lookup when no platform command is
    // supplied. Omarchy deployments can provide any argv prefix explicitly.
    if (!Array.isArray(prefix) || prefix.length === 0) prefix = ["node"]
    return ["env", "HUGINN_INTERNAL=1", "NIXI_AGENT=" + agentName,
      "NIXI_MODEL=" + modelName,
      "NIXI_REASONING_EFFORT=" + reasoningEffort].concat(prefix).concat([
      root.bridgeScript("bridge.js")
    ])
  }

  function requestCompletionAttention() {
    // FloatingWindow is a Quickshell wrapper, not a QWindow. The standard
    // QtQuick attached property gives us this surface's actual native window.
    // Qt emits native urgency; an optional desktop attention service can
    // consume it without an Ask-specific command or window-title lookup.
    var window = pinnedWindow.contentItem.Window.window
    if (!opened || !pinned || !window || window.active) return
    window.alert(0)
  }

  function close() {
    outsideDismissTimer.stop()
    outsideDismissArmed = false
    closeFilePreview()
    agent.running = false
    transcriptPhysics.stop()
    entranceTimer.stop()
    cardFade.stop()
    veilFade.stop()
    card.opacity = 0
    veil.opacity = 0
    layoutReady = false
    opened = false
    pinned = false
    waiting = false
    bridgeReady = false
    steeringSupported = false
    steeringPending = false
    sessionLost = false
    queuedPrompt = ""
    clearPermissions()
    statusText = ""
    activeReply = -1
    activeReplyMessageId = ""
    anchorActive = false
    anchorY = 0
    searchMode = ""
    prompt.text = ""
    messages.clear()
    closed()
  }

  function noteKeyboardActivity() {
    root.outsideDismissArmed = false
    outsideDismissTimer.restart()
  }

  function dismissFromOutside() {
    if (root.outsideDismissArmed) root.close()
  }

  Timer {
    id: outsideDismissTimer
    interval: 750
    repeat: false
    onTriggered: root.outsideDismissArmed = true
  }

  function pinConversation() {
    if (!opened || pinned) return
    pinned = true
    Qt.callLater(function() { prompt.forceActiveFocus() })
  }

  function scrollToEnd() {
    // An anchor glide owns the viewport until it lands. Streaming chunks that
    // arrive mid-glide must not snap it to the end.
    if (anchorScroll.running || transcriptPhysics.running) return
    verticalScroll.stop()
    // Let the border absorb ordinary growth. Only scroll once the surface has
    // reached its height cap; scrolling during the growth animation makes the
    // entire conversation appear to jump or redraw.
    if (card.height < card.maxHeight - 1) {
      surface.contentY = 0
      return
    }
    var overflow = surface.contentHeight - surface.height
    surface.contentY = overflow > 0 ? overflow : 0
  }

  function pinComposerToEnd() {
    if (!root.waiting || !root.steeringSupported
        || !prompt.activeFocus || prompt.text.length === 0) return
    // While a follow-up is being composed, the editor owns the viewport.
    // Cancel every inertial/anchor owner so streamed output cannot leave the
    // caret below the fold or immediately pull the surface away again.
    anchorActive = false
    anchorScroll.stop()
    verticalScroll.stop()
    transcriptPhysics.stop()
    surface.cancelFlick()
    Qt.callLater(function() {
      if (!root.composerPinsTail) return
      surface.contentY = Math.max(0, surface.contentHeight - surface.height)
    })
  }

  function armIncomingResultsReveal() {
    if (!prompt.activeFocus || card.height < card.maxHeight - 1
        || !root.isAtEnd()) return
    root.resultsRevealPending = true
  }

  function revealIncomingResults() {
    if (!root.resultsRevealPending) {
      if (!prompt.activeFocus || !root.isAtEnd()) return
      root.resultsRevealPending = true
    }
    root.keepIncomingResultsRevealed()
  }

  function keepIncomingResultsRevealed() {
    if (!root.resultsRevealPending || card.height < card.maxHeight - 1) return
    root.anchorActive = false
    anchorScroll.stop()
    verticalScroll.stop()
    surface.contentY = Math.max(0, surface.contentHeight - surface.height)
    resultsRevealSettle.restart()
  }

  Timer {
    id: resultsRevealSettle
    interval: 80
    repeat: false
    onTriggered: {
      if (root.resultsRevealPending && card.height >= card.maxHeight - 1)
        surface.contentY = Math.max(0, surface.contentHeight - surface.height)
      root.resultsRevealPending = false
    }
  }

  function isAtEnd() {
    var maxY = Math.max(0, surface.contentHeight - surface.height)
    return maxY <= 0 || surface.contentY >= maxY - Style.space(18)
  }

  function scrollBy(dy) {
    // Steps accumulate onto a running animation's destination. Measuring from
    // the animated value instead would swallow most of a held key or a fast
    // wheel spin, because every event would restart from a half-finished move.
    var maxY = Math.max(0, surface.contentHeight - surface.height)
    var baseY = anchorScroll.running
      ? anchorScroll.to
      : (verticalScroll.running ? verticalScroll.to : surface.contentY)
    // Any deliberate scroll takes the viewport back from the glide.
    anchorScroll.stop()
    transcriptPhysics.stop()
    var nextY = Math.max(0, Math.min(maxY, baseY + dy))
    if (nextY !== baseY) {
      verticalScroll.stop()
      verticalScroll.from = surface.contentY
      verticalScroll.to = nextY
      verticalScroll.start()
    }
  }

  function scrollLine(dy) {
    scrollBy(dy * Style.space(44))
  }

  function scrollKeyImpulse(dy, page) {
    verticalScroll.stop()
    anchorScroll.stop()
    transcriptPhysics.impulse(dy * (page ? root.keyboardPageImpulse : root.keyboardLineImpulse))
  }

  // Anchor the newest prompt to the top of the viewport. Called after the
  // model append so the delegate exists and the column has placed it.
  function anchorPrompt(index) {
    // A transcript that still fits inside the card does not scroll at all, so
    // the prompt is already visible and anchoring would only add dead space.
    // Measure the laid-out column rather than `card.height`, which is still
    // animating towards its cap at this point.
    if (stack.height + card.frameInset < card.maxHeight - 1) return
    var item = messageRepeater.itemAt(index)
    if (!item) return
    anchorY = item.y
    anchorActive = true
    Qt.callLater(function() {
      verticalScroll.stop()
      anchorScroll.stop()
      transcriptPhysics.stop()
      var maxY = Math.max(0, surface.contentHeight - surface.height)
      var target = Math.min(root.anchorY, maxY)
      if (Math.abs(target - surface.contentY) < 1) {
        surface.contentY = target
        return
      }
      anchorScroll.from = surface.contentY
      anchorScroll.to = target
      anchorScroll.start()
    })
  }

  // Ctrl +/-/0 resizes the conversation text. A focused TextEdit claims keys
  // before a window shortcut sees them, so this runs from the same key
  // handlers the scrolling set uses. Returns true when the key was consumed.
  // ------------------------------------------------- Omarchy menu in the box
  // The composer doubles as the menu's search field. Nothing is selected
  // until you arrow into the list, so Return in the composer always submits a
  // prompt and can never fire a menu action you did not aim at -- which
  // matters because those rows include package removal and power off.
  property int menuIndex: -1
  property int menuShortcutFirst: -1
  property int menuShortcutLast: -1
  // The list opens under wherever the pointer happens to be resting, so a
  // bare `entered` would hand it the selection the instant it appears --
  // stealing it from the keyboard without anyone touching the mouse. Hover
  // only counts once the pointer has actually moved, and typing or arrowing
  // disarms it again.
  property bool menuMouseArmed: false
  // Where the pointer last was, in window coordinates. Item-local coordinates
  // are useless for this: they change when a row moves under a still pointer,
  // which is exactly the case being guarded against.
  property real menuMouseX: -1
  property real menuMouseY: -1
  // Search is a peer of the agent session, not a phase of it. In particular,
  // a steerable composer must keep offering matches while output streams.
  readonly property bool menuOpen: menuSearch.hasResults
  readonly property bool menuSelected: root.menuOpen && root.menuIndex >= 0

  function menuMove(delta) {
    if (!root.menuOpen) return false
    root.menuMouseArmed = false
    menuPhysics.stop()
    inlineResults.cancelFlick()
    var range = visibleMenuRange()
    var current = root.menuIndex
    var next
    if (range.first >= 0 && (current < range.first || current > range.last))
      next = delta > 0 ? range.first : range.last
    else
      next = Math.max(0, Math.min(menuSearch.rows.length - 1, current + delta))
    root.menuIndex = next
    Qt.callLater(function() {
      if (root.menuOpen && root.menuIndex === next)
        inlineResults.positionViewAtIndex(next, ListView.Contain)
    })
    return true
  }

  function visibleMenuRange() {
    if (!root.menuOpen || inlineResults.count === 0 || inlineResults.contentHeight <= 0)
      return { first: -1, last: -1 }
    var top = inlineResults.contentY + 1
    var bottom = inlineResults.contentY + inlineResults.height - 1
    var first = inlineResults.indexAt(1, top)
    var last = inlineResults.indexAt(1, bottom)
    var viewportTop = inlineResults.contentY
    var viewportBottom = viewportTop + inlineResults.height
    while (first >= 0 && first <= last) {
      var firstItem = inlineResults.itemAtIndex(first)
      if (!firstItem || firstItem.y >= viewportTop - 0.5) break
      first++
    }
    while (last >= first) {
      var lastItem = inlineResults.itemAtIndex(last)
      if (!lastItem || lastItem.y + lastItem.height <= viewportBottom + 0.5) break
      last--
    }
    return first <= last ? { first: first, last: last } : { first: -1, last: -1 }
  }

  function updateMenuShortcutRange() {
    var range = visibleMenuRange()
    root.menuShortcutFirst = range.first
    root.menuShortcutLast = range.last
    root.lastVisibleShortcut = ""
  }

  function deferMenuShortcutRange() {
    if (root.menuShortcutFirst !== -1 || root.menuShortcutLast !== -1) {
      root.menuShortcutFirst = -1
      root.menuShortcutLast = -1
      root.lastVisibleShortcut = ""
    }
    menuShortcutAssignment.restart()
  }

  function menuScrollKeyImpulse(direction, page) {
    if (!root.menuOpen || direction === 0) return
    menuPhysics.impulse(direction * (page ? root.keyboardPageImpulse : root.keyboardLineImpulse))
  }

  function scrollActiveSurface(direction, page) {
    if (root.menuOpen) root.menuScrollKeyImpulse(direction, page)
    else root.scrollKeyImpulse(direction, page)
  }

  function menuActivate(modifiers) {
    if (!root.menuSelected) return false
    if (!menuSearch.run(root.menuIndex, modifiers || Qt.NoModifier)) return false
    if (menuSearch.lastRunKeepsOpen) return true
    prompt.text = ""
    root.searchMode = ""
    root.menuIndex = -1
    // Running a row is the whole errand: the overlay is ephemeral and has
    // nothing left to show, so it gets out of the way of whatever just
    // launched. A pinned conversation is a window someone kept on purpose,
    // so it stays and only clears the box.
    if (!root.pinned) root.close()
    return true
  }

  function enterSearchMode(mode, query) {
    root.searchMode = mode === "repos" ? "^" : (mode === "windows" ? "%" : "@")
    prompt.text = String(query || "").replace(/^[@^%]/, "").trim()
    prompt.cursorPosition = prompt.length
    root.menuIndex = -1
    prompt.forceActiveFocus()
  }

  function selectVisibleSlot(slot) {
    if (slot < 0 || slot > 9) return false
    root.menuMouseArmed = false
    var menuIndex = root.menuShortcutFirst + slot
    if (!root.menuOpen || root.menuShortcutFirst < 0
        || menuIndex > root.menuShortcutLast) return false
    var menuToken = "menu:" + menuIndex
    if (root.lastVisibleShortcut === menuToken) {
      root.lastVisibleShortcut = ""
      root.menuActivate()
      return true
    }
    root.lastVisibleShortcut = menuToken
    root.menuIndex = menuIndex
    return true
  }

  function handleVisibleSlotKey(event) {
    if ((event.modifiers & Qt.ControlModifier) === 0) {
      root.lastVisibleShortcut = ""
      return false
    }
    var slot = -1
    if (event.key >= Qt.Key_1 && event.key <= Qt.Key_9)
      slot = event.key - Qt.Key_1
    else if (event.key === Qt.Key_0) slot = 9
    if (slot < 0) {
      root.lastVisibleShortcut = ""
      return false
    }
    return root.selectVisibleSlot(slot)
  }

  function isImagePath(path) {
    return /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(String(path || ""))
  }

  function localFileUrl(path) {
    // Encode each component without encoding the path separators. This also
    // keeps #, %, ? and spaces from being interpreted as URL syntax.
    return "file://" + String(path || "").split("/").map(function(part) {
      return encodeURIComponent(part)
    }).join("/")
  }

  function scheduleFilePreview(path) {
    if (root.searchMode !== "@") return
    root.filePreviewVisible = false
    root.filePreviewThumbnail = ""
    root.filePreviewText = ""
    root.hoverPreviewPath = String(path || "")
    filePreviewTimer.restart()
  }

  function cancelFilePreview(path) {
    if (String(path || "") !== root.hoverPreviewPath) return
    filePreviewTimer.stop()
    root.hoverPreviewPath = ""
  }

  function closeFilePreview() {
    filePreviewTimer.stop()
    filePreviewProc.running = false
    root.hoverPreviewPath = ""
    root.filePreviewVisible = false
    root.filePreviewThumbnail = ""
    root.filePreviewName = ""
    root.filePreviewText = ""
  }

  function openPath(path, repository, modifiers) {
    var verb = (modifiers & Qt.ControlModifier) !== 0 ? "reveal"
      : ((modifiers & Qt.ShiftModifier) !== 0 ? "copy"
      : ((modifiers & Qt.AltModifier) !== 0 ? "edit" : "open"))
    root.openPathAction(path, repository, verb)
  }

  function closeAfterTransientAction() {
    // Result activation dismisses the temporary overlay, but never a pinned
    // conversation. Pinning is an explicit request to keep this real window;
    // only its window-manager close action should destroy it.
    if (!root.pinned) root.close()
  }

  function openPathAction(path, repository, verb) {
    path = String(path || "")
    if (!path) return
    if (verb === "reveal") {
      revealInSystemFileBrowser(path)
      closeAfterTransientAction()
      return
    }
    if (verb === "copy") {
      Quickshell.execDetached(["wl-copy", path])
      root.copyConfirmed()
      closeAfterTransientAction()
      return
    }
    if (repository) {
      Quickshell.execDetached([
        "setsid", "uwsm-app", "--", "xdg-terminal-exec", "--dir=" + path
      ])
      closeAfterTransientAction()
      return
    }
    if (verb === "edit") {
      if (root.fileEditCommand.length > 0)
        root.runConfiguredFileCommand(root.fileEditCommand, path)
      else Quickshell.execDetached(["omarchy-launch-editor", path])
      closeAfterTransientAction()
      return
    }
    if (root.fileOpenCommand.length > 0)
      root.runConfiguredFileCommand(root.fileOpenCommand, path)
    else Quickshell.execDetached(["xdg-open", path])
    closeAfterTransientAction()
  }

  function runConfiguredFileCommand(configured, path) {
    var command = []
    for (var i = 0; i < configured.length; i++) command.push(String(configured[i]))
    command.push(String(path))
    Quickshell.execDetached(command)
  }

  function revealInSystemFileBrowser(path) {
    // Delegate to the cross-desktop FileManager1 bridge. Ask must not assume a
    // particular file manager or rewrite machine-specific compositor config.
    Quickshell.execDetached([
      "node",
      root.bridgeScript("reveal.js"),
      String(path || "")
    ])
  }

  // Assigned by Ask.qml, which the shell assigns in turn.
  property var shell: null
  property int searchDebounceMs: 270
  readonly property var appLibrary: root.shell ? root.shell.appLibrary : null

  // Result text tracks the same scale as the prompt, so Ctrl +/- moves the
  // whole box together rather than leaving the matches behind.
  readonly property int menuTitleSize: Math.round(Style.font.body * (4 / 3) * root.fontScale)
  readonly property int menuPathSize: Math.round(Style.font.caption * root.fontScale)

  MenuSearch {
    id: menuSearch
    query: root.searchMode + prompt.text
    appLibrary: root.appLibrary
    debounceMs: root.searchDebounceMs
    onQueryChanged: {
      root.armIncomingResultsReveal()
      root.menuIndex = -1
      root.menuMouseArmed = false
    }
    onRowsChanged: root.revealIncomingResults()
    onBrowseRequested: function(mode, query) { root.enterSearchMode(mode, query) }
    onFaqAnswered: function(question, answer) {
      messages.append({ role: "You", body: question })
      root.showNixiMessage(answer)
    }
    onNixiActionRequested: function(action) {
      if (action === "tour") root.tourRequested()
      else root.learnRequested()
    }
    onPathActionRequested: function(path, repository, verb) {
      root.openPathAction(path, repository, verb)
    }
  }

  // Ctrl+P pins the live conversation into a normal window. These keys run
  // from the shared key handlers because a focused TextEdit claims the key
  // before a window shortcut can see it.
  function handleCardKey(event) {
    var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
    if (ctrl && (event.key === Qt.Key_Plus || event.key === Qt.Key_Equal)) fontScaleStepRequested(0.1)
    else if (ctrl && (event.key === Qt.Key_Minus || event.key === Qt.Key_Underscore)) fontScaleStepRequested(-0.1)
    else if (ctrl && event.key === Qt.Key_0) fontScaleResetRequested()
    else if (ctrl && event.key === Qt.Key_P) pinConversation()
    else if (ctrl && event.key === Qt.Key_Comma) motionTunerRequested()
    else if ((event.modifiers & Qt.MetaModifier) !== 0 && event.key === Qt.Key_Comma) harnessSelectorRequested()
    else return false
    return true
  }

  // Every text item in the card takes focus when it is clicked, and a focused
  // TextEdit claims the navigation keys before a window shortcut can see them.
  // The composer and the transcript therefore route keys through here, so the
  // conversation scrolls wherever the caret happens to be. Returns true when
  // the key was consumed.
  // In the composer, vertical arrows belong to results/the viewport while
  // Left/Right remain caret navigation. Outside it, horizontal arrows may
  // scroll wide transcript content too.
  function handleScrollKey(event, requireModifier) {
    var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
    var verticalKey = event.key === Qt.Key_Up || event.key === Qt.Key_Down
      || event.key === Qt.Key_PageUp || event.key === Qt.Key_PageDown
      || (ctrl && (event.key === Qt.Key_J || event.key === Qt.Key_K
        || event.key === Qt.Key_U || event.key === Qt.Key_D))
    if (verticalKey) {
      root.composerTailPinned = false
      root.resultsRevealPending = false
      resultsRevealSettle.stop()
    }
    if (root.menuOpen) {
      if (ctrl && event.key === Qt.Key_K) { menuScrollKeyImpulse(-1, false); return true }
      if (ctrl && event.key === Qt.Key_J) { menuScrollKeyImpulse(1, false); return true }
      if (event.key === Qt.Key_PageUp || (ctrl && event.key === Qt.Key_U)) {
        menuScrollKeyImpulse(-1, true); return true
      }
      if (event.key === Qt.Key_PageDown || (ctrl && event.key === Qt.Key_D)) {
        menuScrollKeyImpulse(1, true); return true
      }
    }
    if (ctrl && event.key === Qt.Key_K) { scrollKeyImpulse(-1, false); return true }
    if (ctrl && event.key === Qt.Key_J) { scrollKeyImpulse(1, false); return true }
    if (event.key === Qt.Key_PageUp || (ctrl && event.key === Qt.Key_U)) { scrollKeyImpulse(-1, true); return true }
    if (event.key === Qt.Key_PageDown || (ctrl && event.key === Qt.Key_D)) { scrollKeyImpulse(1, true); return true }
    if (event.key === Qt.Key_Up) { scrollKeyImpulse(-1, false); return true }
    if (event.key === Qt.Key_Down) { scrollKeyImpulse(1, false); return true }
    if (requireModifier) return false
    return false
  }

  // Shortcuts reach only the window that declares them, so the overlay panel
  // and the pinned window each need their own copy of the scrolling and font
  // set. These cover the case where nothing in the card holds focus at all.
  // Scroll motion for one vertical Flickable: keyboard impulses integrated
  // frame by frame, and trackpad momentum. The transcript and the menu each
  // own one; their WheelHandlers keep their own notched-wheel behaviour and
  // hand pixel-delta (trackpad) events to track().
  //
  // Keyboard motion is integrated frame by frame. A NumberAnimation cannot
  // model repeated force impulses: restarting an eased position animation on
  // every auto-repeat discards its time derivative, and inferring velocity
  // from the remaining distance is invalid once the easing curve is not the
  // constant-deceleration curve used by that inference.
  component ScrollPhysics: Item {
    id: physics
    required property Flickable flickable
    property real deceleration: 608
    property real velocity: 0
    property double sampleTime: 0
    property double lastWheelTime: 0
    property real releaseVelocity: 0
    readonly property bool running: keyTimer.running || momentum.running
    readonly property real minY: flickable.originY
    readonly property real maxY: Math.max(minY, minY + flickable.contentHeight - flickable.height)

    function stop() {
      velocity = 0
      keyTimer.stop()
      momentum.stop()
    }

    function impulse(amount) {
      momentum.stop()
      flickable.cancelFlick()
      velocity = Math.max(-flickable.maximumFlickVelocity,
        Math.min(flickable.maximumFlickVelocity, velocity + amount))
      sampleTime = Date.now()
      keyTimer.start()
    }

    // A precision-scroll gesture is not a pointer drag, so handing its
    // sampled velocity back to Flickable.flick() is unreliable after
    // cancelFlick(): on some Qt/Wayland paths the synthetic flick is
    // discarded with the wheel sequence that just ended. Animate the
    // stopping distance directly instead. The quint ease gives the coast a
    // long, soft tail; distance derives from deceleration while the
    // presentation duration is stretched enough to make that tail read.
    function coast(release) {
      momentum.stop()
      var speed = Math.min(flickable.maximumFlickVelocity, Math.abs(release))
      if (speed <= 40) return
      var distance = speed * speed / (2 * flickable.flickDeceleration)
      var destination = Math.max(minY, Math.min(maxY,
        flickable.contentY + (release < 0 ? -1 : 1) * distance))
      if (Math.abs(destination - flickable.contentY) <= 1) return
      momentum.from = flickable.contentY
      momentum.to = destination
      momentum.duration = Math.max(900, Math.min(2800,
        Math.round(speed * 1800 / flickable.flickDeceleration)))
      momentum.start()
    }

    function release() {
      releaseTimer.stop()
      coast(-releaseVelocity)
      lastWheelTime = 0
      releaseVelocity = 0
    }

    // One pixel-delta wheel event: follow the fingers, sample the velocity,
    // and coast once the gesture ends (or pauses past the release timer).
    function track(wheel) {
      stop()
      flickable.cancelFlick()
      var now = Date.now()
      var first = wheel.phase === Qt.ScrollBegin || lastWheelTime === 0
      if (first) { lastWheelTime = now; releaseVelocity = 0 }
      if (wheel.phase === Qt.ScrollEnd) { release(); return }
      var elapsed = first ? 16 : Math.max(1, Math.min(80, now - lastWheelTime))
      var dy = wheel.pixelDelta.y
      releaseVelocity = releaseVelocity * 0.55 + dy * 1000 / elapsed * 0.45
      lastWheelTime = now
      flickable.contentY = Math.max(minY, Math.min(maxY, flickable.contentY - dy))
      releaseTimer.restart()
    }

    function stopAtBoundary() {
      if (!momentum.running) return
      if (momentum.to <= minY && flickable.contentY <= minY + 0.75) {
        momentum.stop()
        flickable.contentY = minY
      } else if (momentum.to >= maxY && flickable.contentY >= maxY - 0.75) {
        momentum.stop()
        flickable.contentY = maxY
      }
    }

    Timer {
      id: keyTimer
      interval: 16
      repeat: true
      onTriggered: {
        var now = Date.now()
        var elapsed = Math.max(1, Math.min(40, now - physics.sampleTime)) / 1000
        physics.sampleTime = now
        var v = physics.velocity
        var flick = physics.flickable
        var nextY = Math.max(physics.minY, Math.min(physics.maxY, flick.contentY + v * elapsed))
        flick.contentY = nextY
        if ((nextY <= physics.minY && v < 0) || (nextY >= physics.maxY && v > 0)) {
          physics.velocity = 0
          keyTimer.stop()
          return
        }
        var loss = physics.deceleration * elapsed
        if (Math.abs(v) <= loss) {
          physics.velocity = 0
          keyTimer.stop()
        } else physics.velocity = v > 0 ? v - loss : v + loss
      }
    }
    NumberAnimation {
      id: momentum
      target: physics.flickable
      property: "contentY"
      easing.type: Easing.OutQuint
    }
    Timer { id: releaseTimer; interval: 55; onTriggered: physics.release() }
  }

  component WindowShortcuts: Item {
    // An inline component does not share the enclosing document's scope, so
    // the conversation is handed in rather than reached through its id.
    required property Item conversation
    // Y and N answer a permission prompt, but never over typed text (#20).
    // Deliberately only the one-shot choices. #27 showed repeated prompting
    // trains Allow into a reflex, and a held key that grants STANDING approval
    // is the worst possible target for one -- so "always" is mouse-only (#53).
    // autoRepeat: false, so a HELD key answers once and never again -- exact,
    // where a timer would have to outrun the compositor's repeat_delay, which
    // is the user's setting and not ours (#50).
    Shortcut {
      sequence: "Y"
      autoRepeat: false
      enabled: conversation.permissionKeysLive && conversation.optionIdForKind("allow_once") !== ""
      onActivated: conversation.answerPermission(conversation.optionIdForKind("allow_once"))
    }
    Shortcut {
      sequence: "N"
      autoRepeat: false
      enabled: conversation.permissionKeysLive && conversation.optionIdForKind("reject_once") !== ""
      onActivated: conversation.answerPermission(conversation.optionIdForKind("reject_once"))
    }
    Shortcut { sequence: "Up"; onActivated: conversation.scrollKeyImpulse(-1, false) }
    Shortcut { sequence: "Down"; onActivated: conversation.scrollKeyImpulse(1, false) }
    Shortcut { sequence: "Ctrl+J"; onActivated: conversation.scrollActiveSurface(1, false) }
    Shortcut { sequence: "Ctrl+K"; onActivated: conversation.scrollActiveSurface(-1, false) }
    Shortcut { sequence: "Ctrl+U"; onActivated: conversation.scrollActiveSurface(-1, true) }
    Shortcut { sequence: "Ctrl+D"; onActivated: conversation.scrollActiveSurface(1, true) }
    Shortcut { sequence: "PageUp"; onActivated: conversation.scrollActiveSurface(-1, true) }
    Shortcut { sequence: "PageDown"; onActivated: conversation.scrollActiveSurface(1, true) }
    Shortcut { sequence: "Ctrl+="; onActivated: conversation.fontScaleStepRequested(0.1) }
    Shortcut { sequence: "Ctrl++"; onActivated: conversation.fontScaleStepRequested(0.1) }
    Shortcut { sequence: "Ctrl+-"; onActivated: conversation.fontScaleStepRequested(-0.1) }
    Shortcut { sequence: "Ctrl+0"; enabled: !conversation.menuOpen; onActivated: conversation.fontScaleResetRequested() }
    Shortcut { sequence: "Ctrl+P"; onActivated: conversation.pinConversation() }
    Shortcut { sequence: "Ctrl+,"; onActivated: conversation.motionTunerRequested() }
    Shortcut { sequence: "Meta+,"; onActivated: conversation.harnessSelectorRequested() }
    // Ctrl+1 … Ctrl+9, Ctrl+0 pick the matching visible row. Each Shortcut sits
    // in an Item so it stays in this window's item tree, which is how a
    // Shortcut finds its window.
    Repeater {
      model: 10
      Item {
        required property int index
        Shortcut {
          sequence: "Ctrl+" + ((index + 1) % 10)
          enabled: conversation.menuOpen
          onActivated: conversation.selectVisibleSlot(index)
        }
      }
    }
  }

  function submit() {
    var text = prompt.text.trim()
    if (text === "" || sessionLost) return
    // Leaving Guide is always a typed, deliberate command -- never a stray click.
    if (text === "/guide" || text === "/mechanic") {
      prompt.text = ""
      setTrust(text.slice(1))
      return
    }
    // The tour and the learning path are typed, not permanent buttons.
    if (text === "/tour" || text === "/learn") {
      prompt.text = ""
      if (text === "/tour") tourRequested()
      else learnRequested()
      return
    }
    if (waiting) {
      if (!steeringSupported || steeringPending || !bridgeReady || !agent.running) return
      steeringPending = true
      statusText = "Steering…"
      prompt.text = ""
      messages.append({ role: "You", body: text })
      activeReply = messages.count
      activeReplyMessageId = ""
      messages.append({ role: "Claude", body: "" })
      agent.write(JSON.stringify({ type: "steer", text: text }) + "\n")
      Qt.callLater(root.scrollToEnd)
      return
    }
    // Someone who scrolled up to read history keeps their position; only a
    // reader already at the tail gets pulled to the new prompt.
    var followTail = isAtEnd()
    waiting = true
    statusText = "Thinking…"
    queuedPrompt = text
    prompt.text = ""
    messages.append({ role: "You", body: text })
    var promptIndex = messages.count - 1
    activeReply = messages.count
    activeReplyMessageId = ""
    messages.append({ role: "Claude", body: "" })
    if (followTail) Qt.callLater(function() { root.anchorPrompt(promptIndex) })
    if (bridgeReady) sendQueuedPrompt()
    else statusText = "Starting agent…"
  }

  function sendQueuedPrompt() {
    if (queuedPrompt === "" || !agent.running || !bridgeReady) return
    agent.write(JSON.stringify({
      type: "prompt",
      text: queuedPrompt
    }) + "\n")
    queuedPrompt = ""
  }

  // submit() clears prompt.text before calling this, so a silent return means
  // the user watches /mechanic vanish with no explanation (#40). Unlike a
  // prompt, a trust command is not queued and replayed -- saying so is enough.
  function setTrust(level) {
    if (trustPending) {
      statusText = "Still switching trust…"
      return
    }
    if (!agent.running || !bridgeReady) {
      statusText = "The agent is still starting — try again in a moment."
      return
    }
    trustPending = true
    statusText = level === "mechanic" ? "Switching to Mechanic…" : "Switching to Guide…"
    agent.write(JSON.stringify({ type: "trust", trust: level }) + "\n")
  }

  function setPermissionMode(mode) {
    if (permissionModePending) {
      statusText = "Still switching permission mode…"
      return
    }
    var next = mode === "yolo" ? "yolo" : "permission"
    if (!agent.running || !bridgeReady) {
      statusText = "The agent is still starting — try again in a moment."
      return
    }
    permissionModePending = true
    agent.write(JSON.stringify({ type: "permission_mode", mode: next }) + "\n")
  }

  // A message from Nixi itself (a tour step), rendered like an agent reply --
  // only "You" is treated as human by the delegate.
  function showNixiMessage(text) {
    messages.append({ role: "Nixi", body: String(text) })
    Qt.callLater(root.scrollToEnd)
  }

  // Ask a question on the user's behalf, as if they had typed it.
  function askQuestion(text) {
    prompt.text = String(text)
    submit()
  }

  // A handed-over question that must not be sent for the user: it waits in
  // the prompt until they press Enter (nixi#37).
  function setPrompt(text) {
    prompt.text = String(text)
    prompt.cursorPosition = prompt.text.length
    Qt.callLater(function() { prompt.forceActiveFocus() })
  }

  function appendReply(text, messageId) {
    if (activeReply < 0 || activeReply >= messages.count || text === "") return
    var pinTail = root.composerPinsTail
    var followTail = pinTail || isAtEnd()
    var nextMessageId = String(messageId || "")
    if (nextMessageId !== "" && activeReplyMessageId !== "" && nextMessageId !== activeReplyMessageId) {
      activeReply = messages.count
      messages.append({ role: "Claude", body: "" })
    }
    if (nextMessageId !== "") activeReplyMessageId = nextMessageId
    messages.setProperty(activeReply, "body", (messages.get(activeReply).body || "") + text)
    if (pinTail) root.pinComposerToEnd()
    else if (followTail) Qt.callLater(root.scrollToEnd)
  }

  function clearPermissions() {
    pendingPermission = noPermission
    permissionQueue = []
    permissionSettled = false
    permissionSettle.stop()
  }

  // options is the agent's own list of choices and the card renders one button
  // per entry, so dropping it here left the card with no buttons at all (#58
  // rewired the card and its keys through it but never widened this).
  function enqueuePermission(id, title, detail, omitted, options) {
    var request = { id: String(id || ""), title: String(title || "Allow tool?"),
                    detail: String(detail || ""), omitted: Number(omitted) || 0,
                    options: options || [] }
    permissionQueue = permissionQueue.concat([request])
    if (pendingPermission.id === "") showNextPermission()
  }

  function showNextPermission() {
    pendingPermission = permissionQueue.length > 0 ? permissionQueue[0] : noPermission
    permissionQueue = permissionQueue.slice(1)
    // The next request arrives in the same card, the same geometry, with Allow
    // in the same pixel. Nothing may answer it until it has been on screen.
    permissionSettled = false
    if (pendingPermission.id !== "") permissionSettle.restart()
    else permissionSettle.stop()
  }

  // 400 ms is Qt's own mouseDoubleClickInterval default, so the window covers
  // exactly the pair of clicks the platform itself calls a double-click -- and
  // is far below the ~1 s at which a UI is felt to have stalled (#50).
  Timer {
    id: permissionSettle
    interval: 400
    repeat: false
    onTriggered: root.permissionSettled = true
  }

  function handleAgentLine(rawLine) {
    var line = String(rawLine || "").trim()
    if (line === "") return
    try {
      var event = JSON.parse(line)
      if (event.type === "ready") {
        bridgeReady = true
        steeringSupported = event.steeringSupported === true
        permissionMode = event.permissionMode === "yolo" ? "yolo" : "permission"
        trust = event.trust === "mechanic" ? "mechanic" : "guide"
        statusText = queuedPrompt === "" ? "" : "Thinking…"
        sendQueuedPrompt()
      } else if (event.type === "text") {
        appendReply(String(event.text || ""), String(event.messageId || ""))
        statusText = "Replying…"
      } else if (event.type === "done") {
        waiting = false
        steeringPending = false
        statusText = ""
        activeReply = -1
        activeReplyMessageId = ""
        clearPermissions()
        // A pinned conversation can finish while the user is elsewhere. Ask
        // for compositor attention after the final model update has rendered;
        // Qt suppresses the request when this window is already active.
        if (pinned)
          Qt.callLater(root.requestCompletionAttention)
        Qt.callLater(function() { prompt.forceActiveFocus() })
      } else if (event.type === "steered") {
        steeringPending = false
        statusText = "Thinking…"
        Qt.callLater(function() { prompt.forceActiveFocus() })
      } else if (event.type === "steering_error") {
        steeringPending = false
        statusText = String(event.message || "Could not steer the active turn")
        Qt.callLater(function() { prompt.forceActiveFocus() })
      } else if (event.type === "learned") {
        // The tutor recorded something about this machine. The write used to be
        // invisible: hidden from the transcript, appended to LEARNED.md, and
        // fed back into every later prompt with no way for the user to notice
        // or correct it (#51). Agent-authored text, so it renders through the
        // same spacedMarkdown path as a reply -- bounded at 300 chars by
        // learned.js, with uncontained images and non-http links already
        // stripped there (#42).
        var facts = event.facts || []
        for (var f = 0; f < facts.length; f++)
          showNixiMessage("Noted: " + String(facts[f]))
      } else if (event.type === "status") {
        statusText = String(event.text || "Working…")
      } else if (event.type === "tool") {
        var toolTitle = String(event.title || "Using a tool")
        var toolStatus = String(event.status || "in_progress")
        statusText = toolStatus === "completed" ? "Thinking…" : toolTitle
      } else if (event.type === "permission") {
        enqueuePermission(event.id, event.title, event.detail, event.omitted, event.options)
      } else if (event.type === "permission_mode") {
        permissionMode = event.mode === "yolo" ? "yolo" : "permission"
        permissionModePending = false
        if (permissionMode === "yolo") clearPermissions()
        permissionModeConfirmed(permissionMode)
      } else if (event.type === "trust") {
        trust = event.trust === "mechanic" ? "mechanic" : "guide"
        trustPending = false
        if (trust === "guide") clearPermissions()
        statusText = trust === "mechanic"
          ? "Mechanic: Nixi asks before each change"
          : "Guide: Nixi explains, and changes nothing"
      } else if (event.type === "trust_error") {
        trust = event.trust === "mechanic" ? "mechanic" : "guide"
        trustPending = false
        statusText = String(event.message || "Could not change trust level")
      } else if (event.type === "permission_mode_error") {
        permissionMode = event.mode === "yolo" ? "yolo" : "permission"
        permissionModePending = false
        statusText = String(event.message || "Could not change permission mode")
      } else if (event.type === "error") {
        clearPermissions()
        waiting = false
        steeringPending = false
        activeReply = -1
        activeReplyMessageId = ""
        statusText = String(event.message || "Agent error")
        Qt.callLater(function() { prompt.forceActiveFocus() })
      } else if (event.type === "fatal") {
        clearPermissions()
        bridgeReady = false
        sessionLost = true
        waiting = false
        steeringPending = false
        activeReply = -1
        activeReplyMessageId = ""
        statusText = String(event.message || "Session lost")
      }
    } catch (error) {}
  }

  function restartSession() {
    if (!sessionLost || agent.running) return
    sessionRestartRequested()
    sessionLost = false
    queuedPrompt = ""
    steeringSupported = false
    steeringPending = false
    // These gate setTrust() and setPermissionMode() and are cleared only by a
    // trust/permission_mode event. A bridge that died mid-change never sends
    // one, so without this the trust and YOLO controls are dead no-ops for the
    // life of the conversation. close() does not need them: it destroys the
    // object (Ask.qml:394), so its flags are never read again.
    trustPending = false
    permissionModePending = false
    statusText = "Starting agent…"
    agent.running = true
  }

  // The agent offers the choices; the card renders them and reports back which
  // one was picked. It used to send a boolean, which collapsed every answer to
  // allow_once and threw away "allow always" entirely (#53).
  function answerPermission(optionId) {
    if (pendingPermission.id === "" || !permissionSettled || !agent.running) return
    var option = root.optionById(optionId)
    if (!option) return
    agent.write(JSON.stringify({
      type: "permission",
      id: pendingPermission.id,
      optionId: option.id
    }) + "\n")
    showNextPermission()
    statusText = String(option.kind || "").indexOf("allow") === 0 ? "Working…" : "Tool denied"
  }

  function optionById(optionId) {
    var options = pendingPermission.options || []
    for (var i = 0; i < options.length; i++)
      if (options[i] && options[i].id === optionId) return options[i]
    return null
  }

  // The id of the option with this kind, or "" when the agent offers none.
  // Y and N bind through this rather than to button positions, so they stay on
  // the one-shot choices however many options arrive.
  function optionIdForKind(kind) {
    var options = pendingPermission.options || []
    for (var i = 0; i < options.length; i++)
      if (options[i] && options[i].kind === kind) return options[i].id
    return ""
  }

  ListModel { id: messages }

  // Layer-shell geometry arrives asynchronously from the compositor. Keep the
  // overlay fully transparent until that handshake has settled, then reveal
  // the already measured, centered card with opacity alone.
  Timer {
    id: entranceTimer
    interval: 400
    repeat: false
    onTriggered: {
      root.layoutReady = true
      prompt.forceActiveFocus()
      cardFade.restart()
      veilFade.restart()
    }
  }

  Process {
    id: agent
    command: root.bridgeCommand
    stdinEnabled: true
    onExited: function(code) {
      root.clearPermissions()
      root.bridgeReady = false
      if (!root.opened) return
      // A fatal bridge event carries the useful launch/session error. Do not
      // replace it with the generic process-exit fallback a moment later.
      if (root.sessionLost) return
      root.waiting = false
      root.activeReply = -1
      root.sessionLost = true
      root.statusText = "The agent connection closed. Start a new session or choose another harness."
    }
    stdout: SplitParser { onRead: function(line) { root.handleAgentLine(line) } }
  }

  ScrollPhysics { id: transcriptPhysics; flickable: surface; deceleration: root.keyboardDeceleration }
  ScrollPhysics { id: menuPhysics; flickable: inlineResults; deceleration: root.keyboardDeceleration }

  PanelWindow {
    id: panel
    visible: root.opened && !root.pinned
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "nixi"
    WlrLayershell.layer: WlrLayer.Overlay
    // Let the auxiliary motion window become active without dismissing this
    // layer popup, then reclaim exclusive prompt focus when it closes.
    WlrLayershell.keyboardFocus: root.motionTunerOpen || root.harnessSelectorOpen
      ? WlrKeyboardFocus.OnDemand
      : WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Shortcut { sequence: "Escape"; onActivated: root.close() }
    WindowShortcuts { conversation: root }
    Rectangle {
      id: veil
      anchors.fill: parent
      color: root.scrim
      visible: root.layoutReady
      opacity: 0
    }
    NumberAnimation { id: veilFade; target: veil; property: "opacity"; from: 0; to: 1; duration: 150; easing.type: Easing.OutQuad }
    MouseArea { anchors.fill: parent; onClicked: root.dismissFromOutside() }

    BorderSurface {
      id: card
      parent: root.pinned ? pinnedWindow.contentItem : panel.contentItem
      // The text sizes above multiply by root.fontScale; these did not, so
      // Ctrl+= crammed larger text into the same 540px box -- the opposite of
      // what zooming is for (#38). The parent bound is untouched, so however
      // large the scale, nothing can exceed the screen.
      readonly property int maxHeight: Math.min(Style.space(560) * root.fontScale, parent.height - Style.gapsOut * 2)
      readonly property int frameInset: Style.spacing.panelPadding * 2
      readonly property int headerInset: Style.space(8)
      width: root.pinned ? parent.width : Math.min(Style.space(540) * root.fontScale, parent.width - Style.gapsOut * 2)
      height: root.pinned ? parent.height : Math.min(maxHeight, stack.height + frameInset)
      anchors.horizontalCenter: parent.horizontalCenter
      // Optical centre, not the mathematical one. A card placed at exactly
      // half the free space reads as sitting low, because the eye weights the
      // gap beneath it more heavily than the gap above. Giving the top gap
      // the smaller share lifts it to where it looks centred.
      readonly property real opticalCentre: 0.38
      y: root.pinned
        ? 0
        : Math.max(Style.gapsOut, Math.round((parent.height - height) * opticalCentre))
      color: root.background
      visible: root.layoutReady
      radius: root.pinned ? 0 : Style.cornerRadius
      // A pinned surface is plain content. Hyprland owns its outer frame,
      // rounding and clipping; only the layer-shell overlay draws a frame.
      borderSpec: root.pinned ? Border.none()
        : Border.surfaceSpec("menu", "border", root.border, Math.max(1, Style.space(2)))
      padding: Style.spacing.panelPadding
      opacity: 0
      Behavior on height {
        enabled: root.layoutReady
        NumberAnimation { duration: 280; easing.type: Easing.OutCubic }
      }
      onHeightChanged: root.keepIncomingResultsRevealed()
      MouseArea { anchors.fill: parent; onClicked: prompt.forceActiveFocus() }

      Flickable {
        id: surface
        anchors.fill: parent
        anchors.margins: Style.spacing.panelPadding
        clip: true
        contentWidth: width
        contentHeight: stack.height + root.tailSpace
        onContentHeightChanged: root.keepIncomingResultsRevealed()
        interactive: contentHeight > height
        flickableDirection: Flickable.VerticalFlick
        boundsBehavior: Flickable.StopAtBounds
        maximumFlickVelocity: 6000
        flickDeceleration: 650
        onContentYChanged: transcriptPhysics.stopAtBoundary()
        onDraggingChanged: {
          if (!dragging) return
          transcriptPhysics.stop()
          verticalScroll.stop()
          anchorScroll.stop()
        }


        NumberAnimation {
          id: verticalScroll
          target: surface
          property: "contentY"
          duration: 170
          easing.type: Easing.OutCubic
        }
        // The anchor travels further than a scroll step, so it is given its
        // own longer glide and is tracked separately from the stepping ones.
        NumberAnimation {
          id: anchorScroll
          target: surface
          property: "contentY"
          duration: 320
          easing.type: Easing.OutCubic
        }

        // Qt/Wayland may report a two-finger trackpad stream as either a
        // touchpad or a mouse. Pixel deltas distinguish that stream from a
        // click wheel, whose notches keep using the animated keyboard step.
        WheelHandler {
          target: null
          blocking: true
          acceptedButtons: Qt.NoButton
          acceptedDevices: PointerDevice.TouchPad | PointerDevice.Mouse
          onWheel: function(wheel) {
            if (wheel.pixelDelta.x === 0 && wheel.pixelDelta.y === 0) {
              var steps = wheel.angleDelta.y / 120
              if (steps !== 0) root.scrollLine(-steps * 3)
            } else {
              verticalScroll.stop()
              anchorScroll.stop()
              transcriptPhysics.track(wheel)
            }
            wheel.accepted = true
          }
        }

        Column {
          id: stack
          width: surface.width
          spacing: Style.space(4)

          Repeater {
            id: messageRepeater
            model: messages
            Item {
              id: turn
              required property string role
              required property string body
              readonly property bool human: role === "You"
              width: stack.width
              // A prompt sits above its reply by the same gap the reply puts
              // between its own paragraphs: one blank line at the agent size.
              // That line is measured, not guessed, so it tracks the font
              // scale. The stack's own spacing is subtracted so it is not
              // counted twice.
              height: human
                ? humanText.contentHeight + Math.max(0, agentLineMetric.contentHeight - stack.spacing)
                : (body === "" ? 0 : agentText.contentHeight + Style.space(18))

              Text {
                id: agentLineMetric
                visible: false
                text: " "
                font.family: Style.font.family
                font.pixelSize: root.agentSize
              }

              TextEdit {
                id: humanText
                visible: turn.human
                width: parent.width
                height: contentHeight
                text: turn.body
                color: root.accent
                font.family: root.conversationFont
                font.pixelSize: root.humanSizeFor(turn.body)
                font.italic: true
                wrapMode: TextEdit.Wrap
                textFormat: TextEdit.PlainText
                readOnly: true
                selectByMouse: true
                selectionColor: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.32)
                selectedTextColor: root.foreground
                Keys.onPressed: function(event) {
                  if (root.handleCardKey(event) || root.handleScrollKey(event)) event.accepted = true
                }
              }
              TextEdit {
                id: agentText
                visible: !turn.human
                width: parent.width
                height: contentHeight
                text: root.spacedMarkdown(turn.body)
                color: root.foreground
                font.family: Style.font.family
                font.pixelSize: root.agentSize
                wrapMode: TextEdit.Wrap
                textFormat: TextEdit.MarkdownText
                readOnly: true
                selectByMouse: true
                selectionColor: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.32)
                selectedTextColor: root.foreground
                // The URL and its visible label are both agent-authored, so the
                // label need not describe where it goes, and xdg-open dispatches
                // any other scheme to a registered handler (#42). Refusing
                // silently would be worse than opening it: the user could not
                // tell whether the click registered.
                onLinkActivated: function(link) {
                  if (TextFormat.openableLink(link)) Qt.openUrlExternally(link)
                  else root.statusText = "Nixi did not open that link: only http and https links can be opened."
                }
                Keys.onPressed: function(event) {
                  if (root.handleCardKey(event) || root.handleScrollKey(event)) event.accepted = true
                }
              }
            }
          }

          Item {
            id: pulse
            width: stack.width
            visible: root.waiting || root.statusText !== ""
            height: visible ? Math.max(dot.height, statusLabel.implicitHeight) : 0
            Rectangle {
              id: dot
              anchors.verticalCenter: parent.verticalCenter
              width: Style.space(6)
              height: width
              radius: width / 2
              color: root.accent
              SequentialAnimation on opacity {
                running: pulse.visible
                loops: Animation.Infinite
                NumberAnimation { from: 0.22; to: 1; duration: 620 }
                NumberAnimation { from: 1; to: 0.22; duration: 620 }
              }
            }
            Text {
              id: statusLabel
              x: Style.space(12)
              width: parent.width - x
              anchors.verticalCenter: parent.verticalCenter
              text: root.statusText
              color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.42)
              font.family: Style.font.family
              font.pixelSize: root.agentSize
              wrapMode: Text.Wrap
            }
          }

          Column {
            width: stack.width
            visible: root.sessionLost
            spacing: Style.space(8)
            Text {
              width: parent.width
              text: "Starting again keeps this text visible, but the agent will not remember the previous session."
              wrapMode: Text.Wrap
              color: root.foreground
              font.family: Style.font.family
              font.pixelSize: root.agentSize
            }
            Row {
              spacing: Style.space(12)
              Button {
                text: "Start new session"
                enabled: !agent.running
                onClicked: root.restartSession()
              }
              Button {
                text: "Choose harness…"
                onClicked: root.harnessSelectorRequested()
              }
            }
          }

          Item {
            id: composer
            width: stack.width
            visible: !root.waiting || root.steeringSupported
            height: visible ? Math.max(Style.space(54), prompt.contentHeight + Style.space(6)) : 0

            // Measure wrapping at the full display size. This gives the font
            // rule a stable visual-line count instead of making the resized
            // editor feed back into its own measurement.
            Text {
              id: promptMeasure
              visible: false
              width: prompt.width
              text: prompt.text
              font.family: root.conversationFont
              font.pixelSize: root.humanSize
              font.italic: true
              wrapMode: Text.Wrap
              textFormat: Text.PlainText
            }

            TextArea {
              id: prompt
              Keys.priority: Keys.BeforeItem
              // Stay display-sized for one visual line, then reach assistant
              // size at seven lines. Explicit newlines and natural wraps count.
              readonly property real shrinkProgress: Math.max(0, Math.min(1, (promptMeasure.lineCount - 1) / 6))
              readonly property int responsiveFontSize: Math.max(root.agentSize,
                Math.round(root.humanSize
                  - (root.humanSize - root.agentSize) * shrinkProgress))
              x: promptMarker.x + promptMarker.implicitWidth + Style.space(8)
              width: parent.width - x
              height: contentHeight
              anchors.verticalCenter: parent.verticalCenter
              padding: 0
              color: root.accent
              placeholderText: ""
              font.family: root.conversationFont
              font.pixelSize: responsiveFontSize
              font.italic: true
              wrapMode: TextEdit.Wrap
              enabled: !root.waiting || (root.steeringSupported && !root.steeringPending)
              background: null
              opacity: root.steeringPending ? 0.45 : 1
              onContentHeightChanged: if (activeFocus) {
                if (root.composerPinsTail) root.pinComposerToEnd()
                else Qt.callLater(root.scrollToEnd)
              }
              onTextChanged: {
                if (root.searchMode === "" && text.length > 0
                    && "@^%".indexOf(text.charAt(0)) >= 0) {
                  root.searchMode = text.charAt(0)
                  text = text.slice(1)
                  cursorPosition = length
                }
                if (root.waiting && root.steeringSupported && activeFocus
                    && text.length > 0) {
                  root.composerTailPinned = true
                  root.pinComposerToEnd()
                }
              }
              Keys.onPressed: function(event) {
                root.noteKeyboardActivity()
                if (root.pendingPermission.id !== "") {
                  var bare = (event.modifiers & ~(Qt.ShiftModifier | Qt.KeypadModifier)) === Qt.NoModifier
                  if (bare && text.length === 0
                      && (event.key === Qt.Key_Y || event.key === Qt.Key_N)) {
                    // A held key answers once: autorepeat is how the next
                    // request got approved before it rendered (#50). And an
                    // option id, not a boolean -- #58 changed the signature
                    // here without changing this caller, so every Y and N from
                    // the composer found no option and was silently swallowed.
                    if (!event.isAutoRepeat)
                      root.answerPermission(root.optionIdForKind(
                        event.key === Qt.Key_Y ? "allow_once" : "reject_once"))
                    event.accepted = true
                    return
                  }
                  if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                    event.accepted = true
                    return
                  }
                }
                if (event.key === Qt.Key_Backspace && root.searchMode !== ""
                    && text.length === 0) {
                  root.searchMode = ""
                  root.menuIndex = -1
                  event.accepted = true
                  return
                }
                if (root.handleVisibleSlotKey(event)) {
                  event.accepted = true
                  return
                }
                // Bare Down/Up walk the results while they are showing. The
                // caret keeps them otherwise, and Ctrl+J/K still scroll the
                // transcript, so nothing is taken away.
                if (root.menuOpen && !(event.modifiers & Qt.ControlModifier)
                    && (event.key === Qt.Key_Down || event.key === Qt.Key_Up)) {
                  root.menuMove(event.key === Qt.Key_Down ? 1 : -1)
                  event.accepted = true
                  return
                }
                // Tab walks the results too, but only while they are showing;
                // otherwise Tab keeps whatever it already did in the box.
                // Shift+Tab arrives as Backtab, so matching Key_Tab alone
                // would catch the forward direction and silently miss the
                // reverse.
                if (root.menuOpen
                    && (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab)) {
                  root.menuMove(event.key === Qt.Key_Backtab
                    || (event.modifiers & Qt.ShiftModifier) ? -1 : 1)
                  event.accepted = true
                  return
                }
                if (event.key === Qt.Key_Escape && root.menuSelected) {
                  root.menuIndex = -1
                  event.accepted = true
                  return
                }
                // Readline habits that a shell user's hands already have.
                if (event.modifiers & Qt.ControlModifier) {
                  if (event.key === Qt.Key_W) {
                    // Delete back to the start of the previous word: skip the
                    // whitespace behind the caret, then the word itself.
                    var end = prompt.cursorPosition
                    var start = end
                    var value = prompt.text
                    while (start > 0 && /\s/.test(value.charAt(start - 1))) start--
                    while (start > 0 && !/\s/.test(value.charAt(start - 1))) start--
                    if (start < end) prompt.remove(start, end)
                    event.accepted = true
                    return
                  }
                  if (event.key === Qt.Key_E) {
                    prompt.cursorPosition = prompt.length
                    event.accepted = true
                    return
                  }
                }
                if (root.handleCardKey(event) || root.handleScrollKey(event, true)) {
                  event.accepted = true
                } else if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter)
                    && (root.searchMode !== ""
                      || !(event.modifiers & Qt.ShiftModifier))) {
                  // A selection runs; no selection submits. Never inferred.
                  if (!root.menuActivate(event.modifiers) && root.searchMode === "")
                    root.submit()
                  event.accepted = true
                }
              }
            }

            Rectangle {
              id: promptMarker
              x: card.headerInset
              anchors.verticalCenter: prompt.verticalCenter
              readonly property bool modeActive: root.searchMode !== ""
              // A compact reversed badge: the glyph occupies only about half
              // the box, leaving enough fill around it to read as a mode chip
              // rather than another character in the prompt.
              implicitWidth: modeActive ? Math.round(prompt.responsiveFontSize * 0.64)
                : markerText.implicitWidth
              implicitHeight: modeActive ? Math.round(prompt.responsiveFontSize * 0.64)
                : markerText.implicitHeight
              width: implicitWidth
              height: implicitHeight
              radius: modeActive ? Math.max(1, Style.space(1)) : 0
              color: modeActive ? root.accent : "transparent"

              Text {
                id: markerText
                anchors.centerIn: parent
                // The normal square becomes the routing sigil while a focused
                // inline search mode owns the composer.
                text: root.searchMode !== "" ? root.searchMode : "\u25AA"
                color: parent.modeActive ? root.background : root.accent
                font.family: Style.font.family
                font.pixelSize: parent.modeActive
                  ? Math.round(prompt.responsiveFontSize * 0.34)
                  : prompt.responsiveFontSize
                font.bold: parent.modeActive
              }
            }
          }

          // Drops below the composer, Spotlight-style. Sized to its rows so
          // it takes no space at all when nothing matches.
          Column {
            id: menuResults
            width: stack.width
            visible: root.menuOpen
            spacing: 0

            // The composer centres the prompt, so the space below the text is
            // already equal to the space above it -- but a hard rule reads
            // tighter than text does, and the line sat close. Drop it by the
            // composer's own top padding again, which keeps it proportional
            // as the type scales instead of pinning it to a constant.
            Item {
              width: 1
              height: Math.max(Style.space(6),
                               Math.round((composer.height - prompt.height) / 2))
            }

            Rectangle {
              width: parent.width
              height: 1
              color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.14)
            }

            // Each row carries half of Style.space(16) above its text and half
            // below, so neighbours sit a full space(16) apart. The first row
            // only had its own half against the rule, which read as crowded.
            // The other half is added here, plus a few px: matching the
            // inter-row gap exactly still read tight under a hard rule.
            Item { width: 1; height: Style.space(11) }

            ListView {
              id: inlineResults
              width: parent.width
              height: Math.min(contentHeight, Style.space(360))
              model: root.menuOpen ? menuSearch.rows : []
              currentIndex: root.menuIndex
              clip: true
              boundsBehavior: Flickable.StopAtBounds
              flickableDirection: Flickable.VerticalFlick
              maximumFlickVelocity: 6000
              flickDeceleration: 650
              reuseItems: true
              onContentYChanged: {
                menuPhysics.stopAtBoundary()
                root.deferMenuShortcutRange()
              }
              onHeightChanged: root.deferMenuShortcutRange()
              onCountChanged: Qt.callLater(root.updateMenuShortcutRange)
              onDraggingChanged: {
                if (!dragging) return
                menuPhysics.stop()
              }
              ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

              WheelHandler {
                target: null
                blocking: true
                acceptedButtons: Qt.NoButton
                acceptedDevices: PointerDevice.TouchPad | PointerDevice.Mouse
                onWheel: function(wheel) {
                  if (wheel.pixelDelta.x === 0 && wheel.pixelDelta.y === 0) {
                    var steps = wheel.angleDelta.y / 120
                    if (steps !== 0)
                      root.menuScrollKeyImpulse(steps < 0 ? 1 : -1, false)
                  } else menuPhysics.track(wheel)
                  wheel.accepted = true
                }
              }

              Timer {
                id: menuShortcutAssignment
                interval: 500
                onTriggered: root.updateMenuShortcutRange()
              }

              delegate: Rectangle {
                required property var modelData
                required property int index
                readonly property bool current: index === root.menuIndex
                readonly property int visibleSlot: index - root.menuShortcutFirst
                readonly property real workspaceHeaderHeight:
                  String(modelData.workspaceHeader || "") !== "" ? Style.space(26) : 0
                width: menuResults.width
                height: workspaceHeaderHeight
                  + Math.max(rowText.implicitHeight, mathText.implicitHeight) + Style.space(16)
                color: "transparent"

                Rectangle {
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.bottom: parent.bottom
                  height: parent.height - parent.workspaceHeaderHeight
                  color: parent.current
                  ? Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.18)
                  : "transparent"
                }

                Text {
                  anchors.left: parent.left
                  anchors.leftMargin: Style.space(6)
                  anchors.top: parent.top
                  visible: parent.workspaceHeaderHeight > 0
                  text: modelData.workspaceHeader || ""
                  color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.48)
                  font.family: Style.font.family
                  font.pixelSize: root.menuPathSize
                  font.bold: true
                  font.capitalization: Font.AllUppercase
                }

                Text {
                  id: menuSlotHint
                  anchors.top: parent.top
                  anchors.right: parent.right
                  anchors.topMargin: parent.workspaceHeaderHeight + Style.space(3)
                  anchors.rightMargin: Style.space(6)
                  text: parent.visibleSlot < 9 ? "Ctrl+" + (parent.visibleSlot + 1)
                    : (parent.visibleSlot === 9 ? "Ctrl+0" : "")
                  visible: parent.visibleSlot >= 0 && parent.visibleSlot < 10
                    && index <= root.menuShortcutLast
                  color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.38)
                  font.family: Style.font.family
                  font.pixelSize: root.menuPathSize
                }

                // Menu rows carry a glyph in their own icon font; applications
                // carry a real icon, resolved by the same AppLibrary the
                // launcher uses. One column, either kind.
                Item {
                  id: rowIcon
                  visible: !modelData.isMath
                  readonly property bool fileImage: Boolean(modelData.isPath)
                    && !Boolean(modelData.isRepository)
                    && root.isImagePath(modelData.absolutePath)
                  x: Style.space(6)
                  // Optically centred, not mathematically. A line box carries
                  // descender space the title glyphs mostly do not use, so
                  // splitting it evenly parks the icon visibly low against the
                  // text it labels. Lift it by a fraction of the type size.
                  y: rowText.y
                     + Math.round((rowTitle.implicitHeight - height) / 2)
                     - Math.round(root.menuTitleSize * 0.09)
                  width: fileImage ? Style.space(38) : root.menuTitleSize
                  height: width

                  Text {
                    anchors.centerIn: parent
                    visible: !modelData.isApp && !parent.fileImage
                    text: modelData.icon || ""
                    color: parent.parent.current ? root.accent : root.foreground
                    font.family: modelData.iconFont && modelData.iconFont.length > 0
                      ? modelData.iconFont
                      : Style.font.family
                    font.pixelSize: Math.round(root.menuTitleSize * 0.8)
                  }
                  Image {
                    anchors.fill: parent
                    visible: modelData.isApp || parent.fileImage
                    source: modelData.isApp && root.appLibrary
                      ? root.appLibrary.iconSource(modelData.appIcon)
                      : (parent.fileImage ? root.localFileUrl(modelData.absolutePath) : "")
                    sourceSize.width: parent.fileImage
                      ? Math.round(parent.width * 2) : root.menuTitleSize
                    sourceSize.height: parent.fileImage
                      ? Math.round(parent.height * 2) : root.menuTitleSize
                    fillMode: parent.fileImage ? Image.PreserveAspectCrop
                      : Image.PreserveAspectFit
                    asynchronous: parent.fileImage
                    smooth: true
                  }
                }

                Column {
                  id: rowText
                  visible: !modelData.isMath
                  x: rowIcon.x + rowIcon.width + Style.space(10)
                  width: parent.width - x - Style.space(8)
                    - (menuSlotHint.visible ? menuSlotHint.implicitWidth + Style.space(8) : 0)
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.verticalCenterOffset: parent.workspaceHeaderHeight / 2
                  spacing: Style.space(1)

                  Text {
                    id: rowTitle
                    width: parent.width
                    text: modelData.label
                    color: parent.parent.current ? root.accent : root.foreground
                    font.family: Style.font.family
                    font.pixelSize: root.menuTitleSize
                    elide: Text.ElideRight
                  }
                  Row {
                    width: parent.width
                    visible: String(modelData.path || "") !== ""
                    spacing: Style.space(8)
                    Text {
                      width: Math.max(0, parent.width - inlineActionHint.width
                        - parent.spacing)
                      text: modelData.path
                      color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.45)
                      font.family: Style.font.family
                      font.pixelSize: root.menuPathSize
                      elide: Text.ElideRight
                    }
                    Text {
                      id: inlineActionHint
                      visible: Boolean(modelData.isPath) && parent.parent.parent.current
                      width: visible ? implicitWidth : 0
                      text: modelData.actionHint || ""
                      color: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.72)
                      font.family: Style.font.family
                      font.pixelSize: root.menuPathSize
                    }
                  }
                }

                Row {
                  id: mathText
                  visible: Boolean(modelData.isMath)
                  x: Style.space(6)
                  width: parent.width - x - Style.space(8)
                    - (menuSlotHint.visible ? menuSlotHint.implicitWidth + Style.space(8) : 0)
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.verticalCenterOffset: parent.workspaceHeaderHeight / 2
                  spacing: Style.space(7)

                  Text {
                    id: mathEquation
                    readonly property real answerRoom: mathAnswer.implicitWidth + mathText.spacing
                    width: Math.min(implicitWidth, Math.max(0, mathText.width - answerRoom))
                    text: modelData.isMath ? modelData.equation : ""
                    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.45)
                    font.family: Style.font.family
                    font.pixelSize: root.menuTitleSize
                    elide: Text.ElideMiddle
                  }
                  Text {
                    id: mathAnswer
                    width: Math.min(implicitWidth, mathText.width)
                    text: modelData.isMath ? modelData.answer : ""
                    color: parent.parent.current ? root.accent : root.foreground
                    font.family: Style.font.family
                    font.pixelSize: root.menuTitleSize
                    font.bold: true
                    elide: Text.ElideRight
                  }
                }

                MouseArea {
                  anchors.fill: parent
                  hoverEnabled: true

                  // positionChanged fires for two different events: the
                  // pointer moved, or the row moved beneath a pointer that
                  // did not. Only the first is intent. In window coordinates
                  // the second leaves the position unchanged, so comparing
                  // there tells them apart -- comparing in item coordinates
                  // cannot, which is why this armed on its own before.
                  onPositionChanged: function(mouse) {
                    var at = mapToItem(null, mouse.x, mouse.y)
                    if (Math.abs(at.x - root.menuMouseX) < 0.5
                        && Math.abs(at.y - root.menuMouseY) < 0.5) return
                    root.menuMouseX = at.x
                    root.menuMouseY = at.y
                    root.menuMouseArmed = true
                    root.menuIndex = index
                  }

                  // A row arriving under the pointer records where it is so
                  // the next move can be measured, but grants nothing: the
                  // list is still keyboard territory until the mouse moves.
                  onEntered: {
                    if (root.menuMouseArmed) { root.menuIndex = index; return }
                    var here = mapToItem(null, mouseX, mouseY)
                    root.menuMouseX = here.x
                    root.menuMouseY = here.y
                  }

                  // A click is already intent, so it never waits to be armed.
                  onClicked: { root.menuIndex = index; root.menuActivate(Qt.NoModifier) }
                }
              }
            }
          }
        }
      }

      Text {
        id: modeToggle
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.topMargin: Style.space(10)
        anchors.rightMargin: Style.space(10)
        z: 10
        text: root.trust === "guide" ? "GUIDE"
          : (root.permissionMode === "yolo" ? "YOLO" : "MECHANIC")
        color: root.trust === "mechanic" && root.permissionMode === "yolo"
          ? root.accent
          : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b,
              root.trust === "guide" ? 0.42 : 0.78)
        font.family: Style.font.family
        font.pixelSize: Style.font.caption * root.fontScale

        MouseArea {
          anchors.fill: parent
          anchors.margins: -Style.space(6)
          cursorShape: Qt.PointingHandCursor
          // YOLO stays a Mechanic-only switch; from Guide a click only says how to leave it.
          onClicked: {
            if (root.trust !== "mechanic") {
              root.statusText = "Guide changes nothing. Type /mechanic to let Nixi make changes."
              return
            }
            root.setPermissionMode(root.permissionMode === "yolo" ? "permission" : "yolo")
          }
        }
      }

      Text {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.rightMargin: Style.space(10)
        anchors.bottomMargin: Style.space(8)
        visible: !root.pinned
        text: "󰐃"
        color: pinMouse.containsMouse
          ? root.accent
          : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.36)
        font.family: "JetBrainsMono Nerd Font"
        font.pixelSize: Style.font.body * root.fontScale
        z: 10

        MouseArea {
          id: pinMouse
          anchors.fill: parent
          anchors.margins: -Style.space(7)
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: root.pinConversation()
        }
      }
    }

    Item {
      id: filePreviewCard
      parent: root.pinned ? pinnedWindow.contentItem : panel.contentItem
      visible: root.filePreviewVisible && root.searchMode === "@"
      readonly property Item anchorCard: card
      readonly property Item anchorItem: inlineResults.currentItem
      width: Math.min(Style.space(500),
        Math.max(Style.space(280), parent.width - anchorCard.x
          - anchorCard.width - Style.space(12)))
      height: Math.min(Style.space(520), parent.height - Style.gapsOut * 2)
      x: anchorCard.x + anchorCard.width + Style.space(2)
      y: {
        if (!anchorItem) return anchorCard.y
        var point = anchorItem.mapToItem(parent, 0, anchorItem.height / 2)
        return Math.max(Style.gapsOut,
          Math.min(parent.height - height - Style.gapsOut, point.y - height / 2))
      }
      z: 21
      readonly property real bodyX: Style.space(18)
      readonly property real wedgeCenterY: {
        if (!anchorItem) return height / 2
        var point = anchorItem.mapToItem(filePreviewCard, 0,
          anchorItem.height / 2)
        return Math.max(Style.space(28), Math.min(height - Style.space(28), point.y))
      }
      onWedgeCenterYChanged: previewOutline.requestPaint()

      Canvas {
        id: previewOutline
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
          var ctx = getContext("2d")
          ctx.reset()
          var bx = filePreviewCard.bodyX
          var right = width - Math.max(1, Style.space(2))
          var bottom = height - Math.max(1, Style.space(2))
          var top = Math.max(1, Style.space(2))
          var radius = Math.min(Style.cornerRadius, (right - bx) / 2, height / 2)
          var halfWedge = Style.space(14)
          var cy = filePreviewCard.wedgeCenterY
          ctx.beginPath()
          ctx.moveTo(bx + radius, top)
          ctx.lineTo(right - radius, top)
          ctx.quadraticCurveTo(right, top, right, top + radius)
          ctx.lineTo(right, bottom - radius)
          ctx.quadraticCurveTo(right, bottom, right - radius, bottom)
          ctx.lineTo(bx + radius, bottom)
          ctx.quadraticCurveTo(bx, bottom, bx, bottom - radius)
          ctx.lineTo(bx, cy + halfWedge)
          ctx.lineTo(1, cy)
          ctx.lineTo(bx, cy - halfWedge)
          ctx.lineTo(bx, top + radius)
          ctx.quadraticCurveTo(bx, top, bx + radius, top)
          ctx.closePath()
          ctx.fillStyle = root.background
          ctx.fill()
          ctx.lineWidth = Math.max(1, Style.space(2))
          ctx.strokeStyle = root.border
          ctx.lineJoin = "round"
          ctx.stroke()
        }
      }

      Image {
        anchors.fill: parent
        anchors.leftMargin: filePreviewCard.bodyX + Style.space(14)
        anchors.rightMargin: Style.space(14)
        anchors.topMargin: Style.space(14)
        anchors.bottomMargin: Style.space(14)
        visible: root.filePreviewThumbnail !== ""
        source: root.filePreviewThumbnail === ""
          ? "" : root.localFileUrl(root.filePreviewThumbnail)
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        cache: false
      }

      ScrollView {
        anchors.fill: parent
        anchors.leftMargin: filePreviewCard.bodyX + Style.space(16)
        anchors.rightMargin: Style.space(16)
        anchors.topMargin: Style.space(16)
        anchors.bottomMargin: Style.space(16)
        visible: root.filePreviewText !== ""
        clip: true
        TextArea {
          text: root.filePreviewText
          readOnly: true
          wrapMode: TextEdit.NoWrap
          color: root.foreground
          selectionColor: root.accent
          background: null
          padding: 0
          font.family: "JetBrainsMono Nerd Font"
          font.pixelSize: root.menuPathSize
        }
      }

      Column {
        anchors.centerIn: parent
        width: parent.width - filePreviewCard.bodyX - Style.space(36)
        anchors.horizontalCenterOffset: filePreviewCard.bodyX / 2
        spacing: Style.space(8)
        visible: root.filePreviewThumbnail === "" && root.filePreviewText === ""
        Text {
          anchors.horizontalCenter: parent.horizontalCenter
          text: "󰈙"
          color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.38)
          font.family: "JetBrainsMono Nerd Font"
          font.pixelSize: Style.space(54)
        }
        Text {
          width: parent.width
          text: root.filePreviewName
          color: root.foreground
          horizontalAlignment: Text.AlignHCenter
          elide: Text.ElideMiddle
          font.family: Style.font.family
          font.pixelSize: root.menuTitleSize
        }
      }
    }

    Timer {
      id: filePreviewTimer
      interval: 500
      onTriggered: {
        if (root.searchMode !== "@" || root.hoverPreviewPath === "") return
        root.filePreviewRequestId++
        filePreviewProc.running = false
        filePreviewProc.command = [
          "gjs",
          root.bridgeScript("preview.js"),
          String(root.filePreviewRequestId), root.hoverPreviewPath
        ]
        filePreviewProc.running = true
      }
    }

    Process {
      id: filePreviewProc
      running: false
      stdout: SplitParser {
        onRead: function(line) {
          try {
            var result = JSON.parse(String(line || ""))
            if (Number(result.id) !== root.filePreviewRequestId
                || String(result.path || "") !== root.hoverPreviewPath) return
            root.filePreviewThumbnail = String(result.thumbnail || "")
            root.filePreviewName = String(result.name || "")
            root.filePreviewText = String(result.text || "")
            root.filePreviewVisible = true
          } catch (error) { }
        }
      }
    }

    Rectangle {
      id: permissionLayer
      parent: root.pinned ? pinnedWindow.contentItem : panel.contentItem
      anchors.fill: parent
      visible: root.pendingPermission.id !== ""
      color: Qt.rgba(root.scrim.r, root.scrim.g, root.scrim.b, 0.72)
      z: 20

      MouseArea { anchors.fill: parent }

      BorderSurface {
        id: permissionCard
        width: Math.min(Style.space(430), parent.width - Style.gapsOut * 2)
        height: permissionContent.implicitHeight + Style.spacing.panelPadding * 2
        anchors.centerIn: parent
        color: root.background
        radius: Style.cornerRadius
        borderSpec: Border.surfaceSpec("menu", "border", root.accent, Math.max(1, Style.space(2)))

        Column {
          id: permissionContent
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.top: parent.top
          anchors.margins: Style.spacing.panelPadding
          spacing: Style.space(14)

          Text {
            width: parent.width
            text: "Permission required"
            color: root.accent
            font.family: root.conversationFont
            font.pixelSize: root.agentSize
            font.italic: true
          }

          Text {
            width: parent.width
            text: root.pendingPermission.title
            textFormat: Text.PlainText
            color: root.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body * root.fontScale
            wrapMode: Text.Wrap
            maximumLineCount: 5
            elide: Text.ElideRight
          }

          // What is being approved, whole: the command, the diff, the input.
          // Agent-supplied, so plain text; a long one scrolls inside the card.
          // When the bridge had to cut it, its last line is the cut notice,
          // shown below in the urgent colour instead.
          Flickable {
            width: parent.width
            height: Math.min(detailText.implicitHeight, permissionLayer.height * 0.45)
            visible: root.pendingPermission.detail !== ""
            clip: true
            contentWidth: width
            contentHeight: detailText.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            flickableDirection: Flickable.VerticalFlick

            TextEdit {
              id: detailText
              width: parent.width
              text: root.pendingPermission.omitted > 0
                ? root.pendingPermission.detail.slice(0, root.pendingPermission.detail.lastIndexOf("\n"))
                : root.pendingPermission.detail
              readOnly: true
              selectByMouse: true
              textFormat: TextEdit.PlainText
              wrapMode: TextEdit.WrapAnywhere
              color: root.foreground
              font.family: "JetBrainsMono Nerd Font"
              font.pixelSize: Style.font.caption * root.fontScale
            }

            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
          }

          Text {
            width: parent.width
            visible: root.pendingPermission.omitted > 0
            text: root.pendingPermission.detail.slice(root.pendingPermission.detail.lastIndexOf("\n") + 1)
            textFormat: Text.PlainText
            color: Color.urgent
            font.family: Style.font.family
            font.pixelSize: Style.font.caption * root.fontScale
            wrapMode: Text.Wrap
          }

          Text {
            width: parent.width
            visible: root.permissionQueue.length > 0
            text: root.permissionQueue.length + " more permission request" + (root.permissionQueue.length === 1 ? "" : "s") + " queued"
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption * root.fontScale
          }

          // One button per option the AGENT offered, in its own words. Only
          // the agent knows what "always" scopes to -- this tool, this command
          // pattern, this session, a persisted rule -- so inventing a label
          // would assert a scope Nixi was never told (#53). An agent offering
          // just allow_once/reject_once renders exactly the two buttons this
          // card has always had.
          Row {
            width: parent.width
            spacing: Style.space(12)

            Repeater {
              model: root.pendingPermission.options || []

              Button {
                required property var modelData
                readonly property int count: Math.max(1, (root.pendingPermission.options || []).length)
                readonly property bool isAllow: String(modelData.kind || "").indexOf("allow") === 0
                readonly property bool isOnce: String(modelData.kind || "").indexOf("_once") > 0
                width: (parent.width - parent.spacing * (count - 1)) / count
                // Agent-authored, so plain text and bounded -- the same rule
                // the detail pane above follows.
                text: (isAllow && isOnce ? "Y  " : (!isAllow && isOnce ? "N  " : ""))
                  + String(modelData.label || modelData.id || "").slice(0, 48)
                bordered: true
                selected: isAllow && isOnce
                foreground: isAllow && isOnce ? root.accent : root.foreground
                fontFamily: Style.font.family
                fontSize: Style.font.body * root.fontScale
                // Disabled for the settle window: after #53 a click here can
                // grant STANDING approval, so the mouse is the path that most
                // needs it -- a double-click is autorepeat's equivalent (#50).
                // qs.Ui.Button paints no disabled state of its own, so
                // `enabled` alone would block the click and show nothing.
                enabled: root.permissionSettled
                opacity: root.permissionSettled ? 1 : 0.45
                onClicked: root.answerPermission(modelData.id)
              }
            }
          }

          Text {
            width: parent.width
            visible: prompt.text.length > 0
            text: "Clear the message box to answer with Y or N"
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption * root.fontScale
            wrapMode: Text.Wrap
          }
        }
      }
    }

    NumberAnimation { id: cardFade; target: card; property: "opacity"; from: 0; to: 1; duration: 150; easing.type: Easing.OutQuad }
  }

  FloatingWindow {
    id: pinnedWindow
    visible: root.opened && root.pinned
    title: root.windowTitle
    color: root.background
    // The only unscaled pixel literals of consequence in the repo: they bypassed
    // both Style.space() and fontScale, so on a 4K panel this was a postage
    // stamp and at a large theme base-size the contents outgrew the frame (#38).
    implicitWidth: Style.space(760) * root.fontScale
    implicitHeight: Style.space(800) * root.fontScale
    minimumSize: Qt.size(Style.space(480), Style.space(420))

    onVisibleChanged: {
      if (visible) {
        Qt.callLater(function() { prompt.forceActiveFocus() })
      } else if (root.opened && root.pinned) {
        root.close()
      }
    }

    // No Escape shortcut here on purpose. A pinned conversation is a real
    // toplevel window, so it closes the way every other window does, through
    // the window manager. Closing it on Escape made a normal window behave
    // like the overlay it was pinned out of, and took the key away from
    // anything inside that might want it. The overlay keeps its Escape.
    WindowShortcuts { conversation: root }
  }
}
