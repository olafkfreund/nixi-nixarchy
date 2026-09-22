import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Ui

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
  property string pendingPermissionId: ""
  property string pendingPermissionTitle: ""
  property string pendingPermissionDetail: ""
  property int pendingPermissionOmitted: 0
  property var permissionQueue: []
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
  readonly property bool permissionKeysLive: pendingPermissionId !== "" && prompt.text.length === 0
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

  // Qt renders consecutive Markdown paragraphs with no vertical gap at all,
  // and folds a whitespace-only line away as blank. A paragraph holding one
  // non-breaking space survives and reads as a single blank line, so those are
  // inserted at paragraph breaks for display only; the stored message is not
  // touched. Fenced code is copied verbatim, where such a line would become
  // part of the code.
  function spacedMarkdown(text) {
    var value = String(text || "")
    if (value.indexOf("\n") < 0) return value
    var lines = value.split("\n")
    var out = []
    var fenced = false
    var pendingBreak = false
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      var fence = /^\s{0,3}(```|~~~)/.test(line)
      if (fence) fenced = !fenced
      if (!fenced && !fence && line.trim() === "") {
        if (out.length > 0) pendingBreak = true
        continue
      }
      if (pendingBreak) {
        pendingBreak = false
        // A blank line before a list item marks a loose list. A paragraph
        // inserted there would split the list in two and restart ordered
        // numbering, so the original break is emitted unchanged instead.
        if (/^\s*([-*+]|\d+[.)])\s/.test(line)) out.push("")
        else out.push("", "\u00a0", "")
      }
      out.push(line)
    }
    return out.join("\n")
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
    keyboardVelocityY = 0
    keyboardCoast.stop()
    trackpadCoast.stop()
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
    if (anchorScroll.running || keyboardCoast.running || trackpadCoast.running) return
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
    keyboardVelocityY = 0
    keyboardCoast.stop()
    trackpadCoast.stop()
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
    keyboardVelocityY = 0
    keyboardCoast.stop()
    trackpadCoast.stop()
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

  // Keyboard motion is integrated frame by frame. A NumberAnimation cannot
  // model repeated force impulses: restarting an eased position animation on
  // every auto-repeat discards its time derivative, and inferring velocity
  // from the remaining distance is invalid once the easing curve is not the
  // constant-deceleration curve used by that inference.
  property real keyboardVelocityY: 0
  property double keyboardSampleTime: 0
  function coastVertically(velocity) {
    trackpadCoast.stop()
    var speed = Math.min(surface.maximumFlickVelocity, Math.abs(velocity))
    if (speed <= 40) return
    var direction = velocity < 0 ? -1 : 1
    var distance = speed * speed / (2 * surface.flickDeceleration)
    var maxY = Math.max(0, surface.contentHeight - surface.height)
    var destination = Math.max(0, Math.min(maxY,
      surface.contentY + direction * distance))
    if (Math.abs(destination - surface.contentY) <= 1) return
    trackpadCoast.from = surface.contentY
    trackpadCoast.to = destination
    // Preserve the sampled trackpad stopping distance while stretching its
    // presentation enough for the final loss of momentum to remain legible.
    trackpadCoast.duration = Math.max(900, Math.min(2800,
      Math.round(speed * 1800 / surface.flickDeceleration)))
    trackpadCoast.start()
  }

  function stopCoastAtBoundary(flickable, animation) {
    if (!animation.running) return
    var minY = flickable.originY
    var maxY = Math.max(minY, minY + flickable.contentHeight - flickable.height)
    if (animation.to <= minY && flickable.contentY <= minY + 0.75) {
      animation.stop()
      flickable.contentY = minY
    } else if (animation.to >= maxY && flickable.contentY >= maxY - 0.75) {
      animation.stop()
      flickable.contentY = maxY
    }
  }

  function scrollKeyImpulse(dy, page) {
    verticalScroll.stop()
    anchorScroll.stop()
    surface.cancelFlick()
    trackpadCoast.stop()
    var impulse = page ? root.keyboardPageImpulse : root.keyboardLineImpulse
    keyboardVelocityY = Math.max(-surface.maximumFlickVelocity,
      Math.min(surface.maximumFlickVelocity, keyboardVelocityY + dy * impulse))
    keyboardSampleTime = Date.now()
    keyboardCoast.start()
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
      keyboardVelocityY = 0
      keyboardCoast.stop()
      trackpadCoast.stop()
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
  property real menuKeyboardVelocityY: 0
  property double menuKeyboardSampleTime: 0
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
    root.menuKeyboardVelocityY = 0
    menuKeyboardCoast.stop()
    menuTrackpadCoast.stop()
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
    menuTrackpadCoast.stop()
    inlineResults.cancelFlick()
    var impulse = page ? root.keyboardPageImpulse : root.keyboardLineImpulse
    root.menuKeyboardVelocityY = Math.max(-inlineResults.maximumFlickVelocity,
      Math.min(inlineResults.maximumFlickVelocity,
        root.menuKeyboardVelocityY + direction * impulse))
    root.menuKeyboardSampleTime = Date.now()
    menuKeyboardCoast.start()
  }

  function menuScrollBounds() {
    var minY = inlineResults.originY
    return { min: minY, max: Math.max(minY,
      minY + inlineResults.contentHeight - inlineResults.height) }
  }

  function coastMenuTrackpad(velocity) {
    menuTrackpadCoast.stop()
    var speed = Math.min(inlineResults.maximumFlickVelocity, Math.abs(velocity))
    if (speed <= 40) return
    var direction = velocity < 0 ? -1 : 1
    var distance = speed * speed / (2 * inlineResults.flickDeceleration)
    var bounds = menuScrollBounds()
    var destination = Math.max(bounds.min, Math.min(bounds.max,
      inlineResults.contentY + direction * distance))
    if (Math.abs(destination - inlineResults.contentY) <= 1) return
    menuTrackpadCoast.from = inlineResults.contentY
    menuTrackpadCoast.to = destination
    menuTrackpadCoast.duration = Math.max(900, Math.min(2800,
      Math.round(speed * 1800 / inlineResults.flickDeceleration)))
    menuTrackpadCoast.start()
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
  component WindowShortcuts: Item {
    // An inline component does not share the enclosing document's scope, so
    // the conversation is handed in rather than reached through its id.
    required property Item conversation
    // Y and N answer a permission prompt, but never over typed text (#20).
    Shortcut { sequence: "Y"; enabled: conversation.permissionKeysLive; onActivated: conversation.answerPermission(true) }
    Shortcut { sequence: "N"; enabled: conversation.permissionKeysLive; onActivated: conversation.answerPermission(false) }
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
    Shortcut { sequence: "Ctrl+1"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(0) }
    Shortcut { sequence: "Ctrl+2"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(1) }
    Shortcut { sequence: "Ctrl+3"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(2) }
    Shortcut { sequence: "Ctrl+4"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(3) }
    Shortcut { sequence: "Ctrl+5"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(4) }
    Shortcut { sequence: "Ctrl+6"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(5) }
    Shortcut { sequence: "Ctrl+7"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(6) }
    Shortcut { sequence: "Ctrl+8"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(7) }
    Shortcut { sequence: "Ctrl+9"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(8) }
    Shortcut { sequence: "Ctrl+0"; enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(9) }
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

  function setTrust(level) {
    if (trustPending) return
    if (agent.running && bridgeReady) {
      trustPending = true
      statusText = level === "mechanic" ? "Switching to Mechanic…" : "Switching to Guide…"
      agent.write(JSON.stringify({ type: "trust", trust: level }) + "\n")
    }
  }

  function setPermissionMode(mode) {
    if (permissionModePending) return
    var next = mode === "yolo" ? "yolo" : "permission"
    if (agent.running && bridgeReady) {
      permissionModePending = true
      agent.write(JSON.stringify({ type: "permission_mode", mode: next }) + "\n")
    }
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
    pendingPermissionId = ""
    pendingPermissionTitle = ""
    pendingPermissionDetail = ""
    pendingPermissionOmitted = 0
    permissionQueue = []
  }

  function enqueuePermission(id, title, detail, omitted) {
    var request = { id: String(id || ""), title: String(title || "Allow tool?"),
                    detail: String(detail || ""), omitted: Number(omitted) || 0 }
    if (pendingPermissionId === "") {
      pendingPermissionId = request.id
      pendingPermissionTitle = request.title
      pendingPermissionDetail = request.detail
      pendingPermissionOmitted = request.omitted
    } else {
      permissionQueue = permissionQueue.concat([request])
    }
  }

  function showNextPermission() {
    if (permissionQueue.length === 0) {
      pendingPermissionId = ""
      pendingPermissionTitle = ""
      pendingPermissionDetail = ""
      pendingPermissionOmitted = 0
      return
    }
    var request = permissionQueue[0]
    permissionQueue = permissionQueue.slice(1)
    pendingPermissionId = request.id
    pendingPermissionTitle = request.title
    pendingPermissionDetail = request.detail
    pendingPermissionOmitted = request.omitted
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
      } else if (event.type === "status") {
        statusText = String(event.text || "Working…")
      } else if (event.type === "tool") {
        var toolTitle = String(event.title || "Using a tool")
        var toolStatus = String(event.status || "in_progress")
        statusText = toolStatus === "completed" ? "Thinking…" : toolTitle
      } else if (event.type === "permission") {
        enqueuePermission(event.id, event.title, event.detail, event.omitted)
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
    statusText = "Starting agent…"
    agent.running = true
  }

  function answerPermission(allow) {
    if (pendingPermissionId === "" || !agent.running) return
    var answeredId = pendingPermissionId
    agent.write(JSON.stringify({
      type: "permission",
      id: answeredId,
      allow: allow
    }) + "\n")
    showNextPermission()
    statusText = allow ? "Working…" : "Tool denied"
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
      readonly property int maxHeight: Math.min(Style.space(560), parent.height - Style.gapsOut * 2)
      readonly property int frameInset: Style.spacing.panelPadding * 2
      readonly property int headerInset: Style.space(8)
      width: root.pinned ? parent.width : Math.min(Style.space(540), parent.width - Style.gapsOut * 2)
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
        onContentYChanged: root.stopCoastAtBoundary(surface, trackpadCoast)
        onDraggingChanged: {
          if (!dragging) return
          root.keyboardVelocityY = 0
          keyboardCoast.stop()
          verticalScroll.stop()
          anchorScroll.stop()
          trackpadCoast.stop()
        }

        Timer {
          id: keyboardCoast
          interval: 16
          repeat: true
          onTriggered: {
            var now = Date.now()
            var elapsed = Math.max(1, Math.min(40, now - root.keyboardSampleTime)) / 1000
            root.keyboardSampleTime = now
            var velocity = root.keyboardVelocityY
            var maxY = Math.max(0, surface.contentHeight - surface.height)
            var nextY = Math.max(0, Math.min(maxY, surface.contentY + velocity * elapsed))
            surface.contentY = nextY

            if ((nextY <= 0 && velocity < 0) || (nextY >= maxY && velocity > 0)) {
              root.keyboardVelocityY = 0
              stop()
              return
            }

            var loss = root.keyboardDeceleration * elapsed
            if (Math.abs(velocity) <= loss) {
              root.keyboardVelocityY = 0
              stop()
            } else {
              root.keyboardVelocityY = velocity > 0 ? velocity - loss : velocity + loss
            }
          }
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
        // A precision-scroll gesture is not a pointer drag, so handing its
        // sampled velocity back to Flickable.flick() is unreliable after
        // cancelFlick(): on some Qt/Wayland paths the synthetic flick is
        // discarded with the wheel sequence that just ended. Animate the
        // stopping distance directly instead. The cubic ease gives the coast
        // a long, soft tail; distance derives from deceleration while the
        // presentation duration is stretched enough to make that tail read.
        NumberAnimation {
          id: trackpadCoast
          target: surface
          property: "contentY"
          easing.type: Easing.OutQuint
        }

        // Qt/Wayland may report a two-finger trackpad stream as either a
        // touchpad or a mouse. Pixel deltas distinguish that stream from a
        // click wheel, whose notches keep using the animated keyboard step.
        WheelHandler {
          id: trackpadWheel
          target: null
          blocking: true
          acceptedButtons: Qt.NoButton
          acceptedDevices: PointerDevice.TouchPad | PointerDevice.Mouse
          property double lastSampleTime: 0
          property real releaseVelocityY: 0

          function coast() {
            coastTimer.stop()
            root.coastVertically(-releaseVelocityY)
            lastSampleTime = 0
            releaseVelocityY = 0
          }

          onWheel: function(wheel) {
            if (wheel.pixelDelta.x === 0 && wheel.pixelDelta.y === 0) {
              var steps = wheel.angleDelta.y / 120
              if (steps !== 0) root.scrollLine(-steps * 3)
              wheel.accepted = true
              return
            }

            verticalScroll.stop()
            anchorScroll.stop()
            root.keyboardVelocityY = 0
            keyboardCoast.stop()
            trackpadCoast.stop()
            surface.cancelFlick()

            var now = Date.now()
            var firstSample = wheel.phase === Qt.ScrollBegin || lastSampleTime === 0
            if (firstSample) {
              lastSampleTime = now
              releaseVelocityY = 0
            }
            if (wheel.phase === Qt.ScrollEnd) {
              coast()
              wheel.accepted = true
              return
            }

            var elapsed = firstSample ? 16 : Math.max(1, Math.min(80, now - lastSampleTime))
            var dy = wheel.pixelDelta.y
            releaseVelocityY = releaseVelocityY * 0.55 + dy * 1000 / elapsed * 0.45
            lastSampleTime = now

            var maxY = Math.max(0, surface.contentHeight - surface.height)
            surface.contentY = Math.max(0, Math.min(maxY, surface.contentY - dy))
            coastTimer.restart()
            wheel.accepted = true
          }

        }

        Timer {
          id: coastTimer
          interval: 55
          onTriggered: trackpadWheel.coast()
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
                onLinkActivated: function(link) { Qt.openUrlExternally(link) }
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
                if (root.pendingPermissionId !== "") {
                  var bare = (event.modifiers & ~(Qt.ShiftModifier | Qt.KeypadModifier)) === Qt.NoModifier
                  if (bare && text.length === 0
                      && (event.key === Qt.Key_Y || event.key === Qt.Key_N)) {
                    root.answerPermission(event.key === Qt.Key_Y)
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
                root.stopCoastAtBoundary(inlineResults, menuTrackpadCoast)
                root.deferMenuShortcutRange()
              }
              onHeightChanged: root.deferMenuShortcutRange()
              onCountChanged: Qt.callLater(root.updateMenuShortcutRange)
              onDraggingChanged: {
                if (!dragging) return
                root.menuKeyboardVelocityY = 0
                menuKeyboardCoast.stop()
                menuTrackpadCoast.stop()
              }
              ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

              NumberAnimation {
                id: menuTrackpadCoast
                target: inlineResults
                property: "contentY"
                easing.type: Easing.OutQuint
              }

              WheelHandler {
                id: menuTrackpadWheel
                target: null
                blocking: true
                acceptedButtons: Qt.NoButton
                acceptedDevices: PointerDevice.TouchPad | PointerDevice.Mouse
                property double lastSampleTime: 0
                property real releaseVelocityY: 0
                function coast() {
                  menuCoastTimer.stop()
                  root.coastMenuTrackpad(-releaseVelocityY)
                  lastSampleTime = 0
                  releaseVelocityY = 0
                }
                onWheel: function(wheel) {
                  if (wheel.pixelDelta.x === 0 && wheel.pixelDelta.y === 0) {
                    var steps = wheel.angleDelta.y / 120
                    if (steps !== 0)
                      root.menuScrollKeyImpulse(steps < 0 ? 1 : -1, false)
                    wheel.accepted = true
                    return
                  }
                  root.menuKeyboardVelocityY = 0
                  menuKeyboardCoast.stop()
                  menuTrackpadCoast.stop()
                  inlineResults.cancelFlick()
                  var now = Date.now()
                  var first = wheel.phase === Qt.ScrollBegin || lastSampleTime === 0
                  if (first) { lastSampleTime = now; releaseVelocityY = 0 }
                  if (wheel.phase === Qt.ScrollEnd) {
                    coast(); wheel.accepted = true; return
                  }
                  var elapsed = first ? 16 : Math.max(1, Math.min(80,
                    now - lastSampleTime))
                  var dy = wheel.pixelDelta.y
                  releaseVelocityY = releaseVelocityY * 0.55
                    + dy * 1000 / elapsed * 0.45
                  lastSampleTime = now
                  var bounds = root.menuScrollBounds()
                  inlineResults.contentY = Math.max(bounds.min,
                    Math.min(bounds.max, inlineResults.contentY - dy))
                  menuCoastTimer.restart()
                  wheel.accepted = true
                }
              }

              Timer {
                id: menuCoastTimer
                interval: 55
                onTriggered: menuTrackpadWheel.coast()
              }

              Timer {
                id: menuShortcutAssignment
                interval: 500
                onTriggered: root.updateMenuShortcutRange()
              }

              Timer {
                id: menuKeyboardCoast
                interval: 16
                repeat: true
                onTriggered: {
                  var now = Date.now()
                  var elapsed = Math.max(1, Math.min(40,
                    now - root.menuKeyboardSampleTime)) / 1000
                  root.menuKeyboardSampleTime = now
                  var velocity = root.menuKeyboardVelocityY
                  var minY = inlineResults.originY
                  var maxY = Math.max(minY, minY + inlineResults.contentHeight
                    - inlineResults.height)
                  var nextY = Math.max(minY, Math.min(maxY,
                    inlineResults.contentY + velocity * elapsed))
                  inlineResults.contentY = nextY
                  if ((nextY <= minY && velocity < 0)
                      || (nextY >= maxY && velocity > 0)) {
                    root.menuKeyboardVelocityY = 0
                    stop()
                    return
                  }
                  var loss = root.keyboardDeceleration * elapsed
                  if (Math.abs(velocity) <= loss) {
                    root.menuKeyboardVelocityY = 0
                    stop()
                  } else root.menuKeyboardVelocityY = velocity > 0
                    ? velocity - loss : velocity + loss
                }
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
        font.pixelSize: Style.font.caption

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
        font.pixelSize: Style.font.body
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
      visible: root.pendingPermissionId !== ""
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
            text: root.pendingPermissionTitle
            textFormat: Text.PlainText
            color: root.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
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
            visible: root.pendingPermissionDetail !== ""
            clip: true
            contentWidth: width
            contentHeight: detailText.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            flickableDirection: Flickable.VerticalFlick

            TextEdit {
              id: detailText
              width: parent.width
              text: root.pendingPermissionOmitted > 0
                ? root.pendingPermissionDetail.slice(0, root.pendingPermissionDetail.lastIndexOf("\n"))
                : root.pendingPermissionDetail
              readOnly: true
              selectByMouse: true
              textFormat: TextEdit.PlainText
              wrapMode: TextEdit.WrapAnywhere
              color: root.foreground
              font.family: "JetBrainsMono Nerd Font"
              font.pixelSize: Style.font.caption
            }

            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
          }

          Text {
            width: parent.width
            visible: root.pendingPermissionOmitted > 0
            text: root.pendingPermissionDetail.slice(root.pendingPermissionDetail.lastIndexOf("\n") + 1)
            textFormat: Text.PlainText
            color: Color.urgent
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            wrapMode: Text.Wrap
          }

          Text {
            width: parent.width
            visible: root.permissionQueue.length > 0
            text: root.permissionQueue.length + " more permission request" + (root.permissionQueue.length === 1 ? "" : "s") + " queued"
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }

          Row {
            width: parent.width
            spacing: Style.space(12)

            Button {
              width: (parent.width - parent.spacing) / 2
              text: "N  Deny"
              bordered: true
              foreground: root.foreground
              fontFamily: Style.font.family
              fontSize: Style.font.body
              onClicked: root.answerPermission(false)
            }

            Button {
              width: (parent.width - parent.spacing) / 2
              text: "Y  Allow"
              bordered: true
              selected: true
              foreground: root.accent
              fontFamily: Style.font.family
              fontSize: Style.font.body
              onClicked: root.answerPermission(true)
            }
          }

          Text {
            width: parent.width
            visible: prompt.text.length > 0
            text: "Clear the message box to answer with Y or N"
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.5)
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
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
    implicitWidth: 760
    implicitHeight: 800
    minimumSize: Qt.size(480, 420)

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
