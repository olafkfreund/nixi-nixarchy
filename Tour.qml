// The guided tour and the learning path.
//
// Lives in the Ask.qml manager, not in a Conversation: a conversation is
// destroyed when its card closes, and the tour's whole point is that the user
// goes off and does things on the desktop. The manager is keepLoaded, so the
// tour survives the card closing and reopening -- which the last step requires.
//
// All the logic is in TourModel.js so it can be unit tested under node; this
// file is the Qt glue: files, Hyprland events, and the default-agent check.
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "TourModel.js" as TourModel

Item {
  id: root

  // Emitted with the text to show; the manager puts it in the open card.
  signal stepShown(string text)
  signal tourFinished()

  property var tourData: ({ steps: [] })
  property var learnData: ({ topics: [] })
  property var learning: ({})
  property var state: TourModel.idle()
  readonly property bool active: state.active === true
  property bool defaultAgentSet: false

  // /tour: resume a running tour where it is, otherwise start one.
  function start() {
    if (active) { show(); return }
    if (!tourData.steps || tourData.steps.length === 0) {
      stepShown("The tour data is missing from this install.")
      return
    }
    state = TourModel.start()
    advanceTo(TourModel.onCheck(state, tourData, { defaultAgent: defaultAgentSet }))
    show()
  }

  function show() {
    if (!active) return
    var text = TourModel.currentText(state, tourData)
    if (text !== "") stepShown(stepPrefix() + text)
  }

  function stepPrefix() {
    var total = (tourData.steps || []).length
    return "**Tour " + (state.step + 1) + "/" + total + "**\n"
  }

  // The card was summoned: complete a step that waits for it. Nothing is shown
  // just because the card opened -- it opens empty; /tour shows the step.
  function opened() {
    if (!active) return
    if (advanceTo(TourModel.onOpened(state, tourData))) show()
  }

  function applyChecks() {
    if (advanceTo(TourModel.onCheck(state, tourData, { defaultAgent: defaultAgentSet }))) show()
  }

  // True when the tour moved to a new, unfinished step. Callers show it, and
  // start()/opened() show it unconditionally, so a step is never shown twice.
  function advanceTo(next) {
    if (next === state) return false
    var wasStep = state.step
    state = next
    if (state.finished) {
      markToured()
      tourFinished()
      return false
    }
    return state.step !== wasStep
  }

  // ---- learning path ------------------------------------------------------

  function nextTopic() { return TourModel.nextTopic(learnData, learning) }

  function markTaught(topicId) {
    learning = TourModel.markTaught(learning, topicId, Math.floor(Date.now() / 1000))
    saveLearning()
  }

  function markToured() {
    learning = Object.assign({}, learning, { toured: true })
    saveLearning()
  }

  function progress() { return TourModel.progress(learnData, learning) }

  function saveLearning() {
    // Progress only -- ids and timestamps. No transcript is ever written.
    learningFile.setText(JSON.stringify(learning, null, 2) + "\n")
  }

  // ---- the world ----------------------------------------------------------

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (!root.active || !event || !event.name) return
      if (root.advanceTo(TourModel.onEvent(root.state, root.tourData,
        String(event.name), String(event.data || "")))) root.show()
    }
  }

  FileView {
    path: Qt.resolvedUrl("share/tour.json")
    onLoaded: {
      try { root.tourData = JSON.parse(text()) } catch (error) { root.tourData = { steps: [] } }
    }
  }

  FileView {
    path: Qt.resolvedUrl("share/learn.json")
    onLoaded: {
      try { root.learnData = JSON.parse(text()) } catch (error) { root.learnData = { topics: [] } }
    }
  }

  FileView {
    id: learningFile
    path: Quickshell.env("HOME") + "/.local/share/nixi/learning.json"
    watchChanges: true
    onLoaded: {
      try { root.learning = JSON.parse(text()) || {} } catch (error) { root.learning = {} }
    }
    // watchChanges signals; it does not reload. Without this the file is read
    // once at startup and progress written by another conversation never lands.
    onFileChanged: reload()
    // Absent until something has been learned; an empty state is correct.
    onLoadFailed: { root.learning = {} }
  }

  // Step 1 of the tour waits for an Omarchy default agent to be chosen, so the
  // file is watched rather than read once.
  FileView {
    path: Quickshell.env("HOME") + "/.config/omarchy/defaults/agent"
    watchChanges: true
    onLoaded: {
      root.defaultAgentSet = String(text() || "").trim() !== ""
      root.applyChecks()
    }
    // Without this the watch fires and nothing re-reads, so step 1 waits forever.
    onFileChanged: reload()
    onLoadFailed: { root.defaultAgentSet = false }
  }
}
