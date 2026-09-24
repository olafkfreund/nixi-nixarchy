import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui

Item {
  id: root

  // The shell assigns this if the property exists (shell.qml: `"shell" in item`).
  // It is the only route to the shared AppLibrary, which is what makes
  // applications searchable from the composer alongside menu rows.
  property var shell: null
  property var activeOverlay: null
  property var conversations: []
  property int conversationSequence: 0
  readonly property bool opened: activeOverlay !== null
    && activeOverlay.opened
    && !activeOverlay.pinned

  // The manager owns the font scale so every conversation — overlay or pinned
  // window — reads one value and a single writer persists it.
  readonly property real minFontScale: 0.7
  readonly property real maxFontScale: 2

  // Nothing in this repo, or in Omarchy's Style singleton, reads the display:
  // Style scales off the theme's [font] base-size, which is a static number.
  // So the card was a fixed 540x560 logical-pixel box on every monitor, at 21%
  // of a 1440p screen's width and 28% of a 1080p one -- it shrank when moved to
  // the larger display (#38).
  //
  // 1080p is the baseline, so a 1080p panel is exactly 1 and nothing changes
  // there. The largest screen wins on a mixed setup: the geometry clamps bound
  // every surface to its own panel's height anyway, so an over-large scale
  // cannot overflow the smaller monitor, while an under-large one leaves the
  // big screen unreadable. Per-monitor scale is the follow-up, not this.
  readonly property real displayScale: {
    var tallest = 1080
    var screens = Quickshell.screens || []
    for (var i = 0; i < screens.length; i++)
      if (screens[i] && screens[i].height > tallest) tallest = screens[i].height
    return Math.max(1, Math.min(maxFontScale, Math.round((tallest / 1080) * 100) / 100))
  }
  readonly property string settingsPath: Quickshell.env("HOME") + "/.config/omarchy/nixi.json"
  property real fontScale: 1
  // How long typing has to pause before the menu search recomputes. Matching
  // is cheap; the resize it triggers is not, so this is really a tolerance
  // for how much the card is allowed to move while you type. Settable in
  // nixi.json, which is watched, so an edit applies without a restart.
  readonly property int minSearchDebounceMs: 0
  readonly property int maxSearchDebounceMs: 2000
  property int searchDebounceMs: 270
  property real keyboardLineImpulse: 335
  property real keyboardDeceleration: 608
  property var fileOpenCommand: []
  property var fileEditCommand: []
  property bool useHyprlandShortcutSubmap: false
  property int repoSearchDepth: 6
  property string selectedAgent: ""
  property string selectedModel: ""
  property string selectedReasoningEffort: ""
  readonly property real keyboardPageImpulse: keyboardLineImpulse * (740 / 360)
  property bool settingsLoaded: false
  // nixi.json as last read. The bridge writes keys of its own to the same file
  // (trust, askBeforeReading), so the UI writes its keys on top of these
  // rather than replacing the file with only the keys it knows.
  property var settingsOnDisk: ({})
  // Retained so writing the font scale cannot drop the mode the bridge owns.
  property string persistedPermissionMode: "permission"
  property bool copyToastVisible: false
  // One manager owns the compositor submap. Conversations only affect the
  // derived desired state; they never dispatch Hyprland commands themselves.
  readonly property bool shortcutSubmapDesired: useHyprlandShortcutSubmap && opened
  property bool shortcutSubmapOwned: false
  property bool shortcutSubmapTarget: false
  property bool shortcutSubmapInitialized: false
  property int shortcutSubmapFailures: 0

  onShortcutSubmapDesiredChanged: {
    shortcutSubmapRetry.stop()
    shortcutSubmapFailures = 0
    reconcileShortcutSubmap()
  }

  function reconcileShortcutSubmap() {
    if (!shortcutSubmapInitialized || shortcutSubmapProc.running) return
    if (shortcutSubmapDesired === shortcutSubmapOwned) return
    shortcutSubmapTarget = shortcutSubmapDesired
    shortcutSubmapProc.command = [
      "hyprctl", "dispatch",
      "hl.dsp.submap(\"" + (shortcutSubmapTarget ? "nixi" : "reset") + "\")"
    ]
    shortcutSubmapProc.running = true
  }

  Process {
    id: shortcutSubmapProbe
    command: ["hyprctl", "submap"]
    stdout: StdioCollector {}
    Component.onCompleted: running = true
    onExited: function(exitCode) {
      var current = String(stdout.text || "").trim()
      root.shortcutSubmapOwned = current === "nixi"
      root.shortcutSubmapInitialized = true
      root.reconcileShortcutSubmap()
    }
  }

  Process {
    id: shortcutSubmapProc
    onExited: function(exitCode) {
      if (exitCode === 0) {
        root.shortcutSubmapOwned = root.shortcutSubmapTarget
        root.shortcutSubmapFailures = 0
        root.reconcileShortcutSubmap()
      } else {
        root.shortcutSubmapFailures++
        shortcutSubmapRetry.interval = Math.min(8000,
          250 * Math.pow(2, Math.min(5, root.shortcutSubmapFailures - 1)))
        shortcutSubmapRetry.restart()
      }
    }
  }

  Timer {
    id: shortcutSubmapRetry
    repeat: false
    onTriggered: root.reconcileShortcutSubmap()
  }

  Component.onDestruction: {
    // Best effort for graceful plugin unload. SUPER+ESCAPE remains the crash
    // recovery path because no in-process cleanup can run after SIGKILL.
    if (shortcutSubmapOwned || shortcutSubmapDesired)
      Quickshell.execDetached(["hyprctl", "dispatch", "hl.dsp.submap(\"reset\")"])
  }

  function showCopyToast() {
    copyToastVisible = true
    copyToastAnimation.restart()
  }

  function setFontScale(value) {
    var next = Math.max(minFontScale, Math.min(maxFontScale, Math.round(value * 100) / 100))
    if (next === fontScale) return
    fontScale = next
    if (settingsLoaded) settingsSaveTimer.restart()
  }

  function adjustFontScale(step) { setFontScale(fontScale + step) }

  function clampImpulse(value) { return Math.round(Math.max(80, Math.min(2000, value))) }
  function clampDeceleration(value) { return Math.round(Math.max(100, Math.min(5000, value))) }

  function loadSettings(raw) {
    var data = {}
    try { data = JSON.parse(raw || "{}") } catch (error) { data = {} }
    if (!data || typeof data !== "object") data = {}
    settingsOnDisk = data
    persistedPermissionMode = data.permissionMode === "yolo" ? "yolo" : "permission"
    // Presence, then value. Number(undefined) is NaN, so testing the coerced
    // value alone made an absent key and a deliberate 1 indistinguishable --
    // and a 4K user who had chosen 1 would have had it silently overridden.
    var stored = data.fontScale
    var scale = Number(stored)
    fontScale = (stored !== undefined && stored !== null && isFinite(scale) && scale > 0)
      ? Math.max(minFontScale, Math.min(maxFontScale, scale))
      : root.displayScale
    var debounce = Number(data.searchDebounceMs)
    searchDebounceMs = isFinite(debounce)
      ? Math.round(Math.max(minSearchDebounceMs, Math.min(maxSearchDebounceMs, debounce)))
      : 270
    var impulse = Number(data.keyboardLineImpulse)
    keyboardLineImpulse = isFinite(impulse) ? clampImpulse(impulse) : 335
    var deceleration = Number(data.keyboardDeceleration)
    keyboardDeceleration = isFinite(deceleration) ? clampDeceleration(deceleration) : 608
    fileOpenCommand = normalizeCommand(data.fileOpenCommand)
    fileEditCommand = normalizeCommand(data.fileEditCommand)
    useHyprlandShortcutSubmap = data.useHyprlandShortcutSubmap === true
    var repoDepth = Number(data.repoSearchDepth)
    repoSearchDepth = isFinite(repoDepth)
      ? (repoDepth <= 0 ? 0 : Math.max(1, Math.min(128, Math.round(repoDepth))))
      : 6
    selectedAgent = String(data.agent || "")
    selectedModel = selectedAgent ? String(data.model || "") : ""
    selectedReasoningEffort = selectedAgent ? String(data.reasoningEffort || "") : ""
    settingsLoaded = true
  }

  function normalizeCommand(value) {
    if (typeof value === "string")
      return value.trim() === "" ? [] : [value.trim()]
    if (!Array.isArray(value)) return []
    return value.map(function(argument) { return String(argument || "") }).filter(Boolean)
  }

  function flushSettings() {
    if (!settingsLoaded) return
    settingsFile.setText(JSON.stringify(Object.assign({}, settingsOnDisk, {
      permissionMode: persistedPermissionMode,
      fontScale: fontScale,
      searchDebounceMs: searchDebounceMs,
      keyboardLineImpulse: keyboardLineImpulse,
      keyboardDeceleration: keyboardDeceleration,
      fileOpenCommand: fileOpenCommand,
      fileEditCommand: fileEditCommand,
      useHyprlandShortcutSubmap: useHyprlandShortcutSubmap,
      repoSearchDepth: repoSearchDepth,
      agent: selectedAgent,
      model: selectedModel,
      reasoningEffort: selectedReasoningEffort
    }), null, 2) + "\n")
  }

  FileView {
    id: settingsFile
    path: root.settingsPath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: root.loadSettings(text())
    // First run: the file does not exist yet. Without this the scale would
    // never be marked loaded and would never be written.
    onLoadFailed: root.loadSettings("")
    onFileChanged: reload()
  }

  Timer {
    id: settingsSaveTimer
    interval: 200
    repeat: false
    onTriggered: root.flushSettings()
  }

  Loader {
    id: harnessSelectorLoader
    source: Qt.resolvedUrl("HarnessSelector.qml")
  }

  Connections {
    target: harnessSelectorLoader.item
    function onApplied(nextAgent, nextModel, nextReasoningEffort) {
      root.selectedAgent = nextAgent
      root.selectedModel = nextModel
      root.selectedReasoningEffort = nextReasoningEffort
      settingsSaveTimer.restart()
    }
  }

  function openHarnessSelector() {
    var selector = harnessSelectorLoader.item
    if (!selector) return
    selector.fontScale = Qt.binding(function() { return root.fontScale })
    selector.agent = selectedAgent
    selector.model = selectedModel
    selector.reasoningEffort = selectedReasoningEffort
    selector.open()
  }

  PanelWindow {
    id: copyToast
    visible: root.copyToastVisible
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "nixi-copied"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    exclusionMode: ExclusionMode.Ignore
    mask: Region { item: copyToastCard }

    BorderSurface {
      id: copyToastCard
      width: copyToastText.implicitWidth + Style.space(42)
      height: Style.space(58)
      anchors.horizontalCenter: parent.horizontalCenter
      y: Math.round(parent.height * 0.22)
      color: Color.menu.background
      radius: Style.cornerRadius
      borderSpec: Border.surfaceSpec("menu", "border", Color.accent,
        Math.max(1, Style.space(2)))

      Text {
        id: copyToastText
        anchors.centerIn: parent
        text: "✓  Copied!"
        color: Color.accent
        font.family: Style.font.family
        font.pixelSize: Math.round(Style.font.body * (4 / 3))
        font.bold: true
      }
    }

    // Shown at full opacity, held, then faded. The hide is a step of the
    // sequence, so restarting it for a second copy cannot hide the new toast.
    SequentialAnimation {
      id: copyToastAnimation
      PropertyAction { target: copyToastCard; property: "opacity"; value: 1 }
      PauseAnimation { duration: 1500 }
      NumberAnimation { target: copyToastCard; property: "opacity"; to: 0; duration: 500; easing.type: Easing.OutQuad }
      ScriptAction { script: root.copyToastVisible = false }
    }
  }

  Component {
    id: conversationComponent
    Conversation {}
  }

  // The conversation that started the tour. Kept apart from activeOverlay so
  // steps still reach it if the user pins it (pinning clears activeOverlay).
  property var tourCard: null

  function tourTarget() {
    if (tourCard && tourCard.opened) return tourCard
    return activeOverlay && activeOverlay.opened ? activeOverlay : null
  }

  function showTourText(text) {
    var target = tourTarget()
    if (target) target.showNixiMessage(text)
  }

  Tour {
    id: tour
    onStepShown: function(text) { root.showTourText(text) }
    onTourFinished: root.showTourText(
      "\u2705 **Tour complete.** You can always find me again with **SUPER+H**.\n\n"
      + "Type **/learn** whenever you want the next thing worth knowing.")
  }

  function startTour(conversation) {
    tourCard = conversation
    // Not pinned: a pinned card is a normal window that Hyprland tiles to fill
    // the workspace. The tour lives here, not in the card, so the card may
    // close while you follow a step; reopening it shows where you are.
    tour.start()
  }

  function teachNext(conversation) {
    var topic = tour.nextTopic()
    if (!topic) {
      conversation.showNixiMessage("You have covered every topic I have. Ask me anything instead.")
      return
    }
    var p = tour.progress()
    conversation.showNixiMessage("**" + topic.title + "** \u00b7 " + (p.done + 1) + "/" + p.total)
    conversation.askQuestion(topic.question)
    tour.markTaught(topic.id)
  }

  function removeConversation(conversation) {
    if (tourCard === conversation) tourCard = null
    if (activeOverlay === conversation) activeOverlay = null
    var remaining = []
    for (var i = 0; i < conversations.length; i++) {
      if (conversations[i] !== conversation) remaining.push(conversations[i])
    }
    conversations = remaining
    Qt.callLater(function() { conversation.destroy() })
  }

  function createConversation(payloadJson) {
    var conversation = conversationComponent.createObject(root)
    if (!conversation) return null
    conversationSequence++
    conversation.windowTitle = "Nixi #" + conversationSequence
    conversations = conversations.concat([conversation])
    activeOverlay = conversation
    conversation.fontScale = Qt.binding(function() { return root.fontScale })
    conversation.shell = Qt.binding(function() { return root.shell })
    conversation.searchDebounceMs = Qt.binding(function() { return root.searchDebounceMs })
    conversation.keyboardLineImpulse = Qt.binding(function() { return root.keyboardLineImpulse })
    conversation.keyboardPageImpulse = Qt.binding(function() { return root.keyboardPageImpulse })
    conversation.keyboardDeceleration = Qt.binding(function() { return root.keyboardDeceleration })
    conversation.fileOpenCommand = Qt.binding(function() { return root.fileOpenCommand })
    conversation.fileEditCommand = Qt.binding(function() { return root.fileEditCommand })
    conversation.agentName = root.selectedAgent
    conversation.modelName = root.selectedModel
    conversation.reasoningEffort = root.selectedReasoningEffort
    conversation.harnessSelectorOpen = Qt.binding(function() {
      return harnessSelectorLoader.item && harnessSelectorLoader.item.visible
    })
    conversation.fontScaleStepRequested.connect(function(step) { root.adjustFontScale(step) })
    conversation.fontScaleResetRequested.connect(function() { root.setFontScale(1) })
    conversation.harnessSelectorRequested.connect(function() { root.openHarnessSelector() })
    conversation.sessionRestartRequested.connect(function() {
      conversation.agentName = root.selectedAgent
      conversation.modelName = root.selectedModel
      conversation.reasoningEffort = root.selectedReasoningEffort
    })
    conversation.copyConfirmed.connect(function() { root.showCopyToast() })
    conversation.permissionModeConfirmed.connect(function(mode) {
      root.persistedPermissionMode = mode === "yolo" ? "yolo" : "permission"
    })
    conversation.closed.connect(function() { root.removeConversation(conversation) })
    conversation.pinnedChanged.connect(function() {
      if (conversation.pinned && root.activeOverlay === conversation)
        root.activeOverlay = null
      root.reconcileShortcutSubmap()
    })
    conversation.tourRequested.connect(function() { root.startTour(conversation) })
    conversation.learnRequested.connect(function() { root.teachNext(conversation) })
    conversation.open(payloadJson || "{}")
    // A summons completes the tour's last step and re-shows where it is.
    tour.opened()
    // `nixi --tour` (and the first-boot welcome hook) summon with an action.
    try {
      var payload = JSON.parse(payloadJson || "{}")
      if (payload && payload.action === "tour") root.startTour(conversation)
      else if (payload && payload.action === "learn") root.teachNext(conversation)
      else if (payload && payload.action === "ask") root.askFromSummon(conversation, payload)
    } catch (error) {}
    reconcileShortcutSubmap()
    return conversation
  }

  // A question handed over by another program (`nixi --ask`, the nixarchy
  // menu) asks like typing, but never runs a slash command -- /guide and
  // /mechanic change trust, /tour and /learn start flows -- and never steers
  // or interrupts a running turn. Those cases only fill the prompt (nixi#37).
  function askFromSummon(conversation, payload) {
    var text = payload && typeof payload.prompt === "string" ? payload.prompt.trim() : ""
    if (text === "") return
    if (conversation.waiting || text.charAt(0) === "/") conversation.setPrompt(text)
    else conversation.askQuestion(text)
  }

  function open(payloadJson) {
    if (opened) {
      // An open card ignores a summons, except a handed-over question.
      // `opened` is this branch's extraction of master's inline
      // activeOverlay && .opened && !.pinned -- same condition, one name.
      try {
        var payload = JSON.parse(payloadJson || "{}")
        if (payload && payload.action === "ask") root.askFromSummon(activeOverlay, payload)
      } catch (error) {}
      return
    }
    createConversation(payloadJson)
  }

  function close() {
    if (opened)
      activeOverlay.close()
    reconcileShortcutSubmap()
  }

  function pinActive() {
    if (opened)
      activeOverlay.pinConversation()
  }

  function closeAll() {
    if (harnessSelectorLoader.item) harnessSelectorLoader.item.visible = false
    var snapshot = conversations.slice()
    for (var i = 0; i < snapshot.length; i++) snapshot[i].close()
    reconcileShortcutSubmap()
  }

  function toggle(payloadJson) {
    if (opened)
      activeOverlay.close()
    else
      createConversation(payloadJson)
  }
}
