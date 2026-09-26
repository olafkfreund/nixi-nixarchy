import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Wayland
import qs.Commons

PanelWindow {
  id: root

  // Zoom (Ctrl+=) applied only to the transcript, so this window stayed at a
  // fixed size while the conversation grew (#38). Supplied by Ask.qml.
  property real fontScale: 1

  // A selectable pill: the agent and thinking-effort rows differ only in size.
  component Chip: Rectangle {
    property string label
    property bool selected
    property real padding: Style.space(24)
    property real textSize: Style.font.body * root.fontScale
    signal clicked()
    width: chipLabel.implicitWidth + padding
    height: Style.space(36)
    radius: Style.cornerRadius
    color: selected ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.18) : "transparent"
    border.color: selected ? Color.accent : Color.menu.border
    Text { id: chipLabel; anchors.centerIn: parent; text: parent.label; color: Color.menu.text; font.family: Style.font.family; font.pixelSize: parent.textSize }
    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: parent.clicked() }
  }
  visible: false
  anchors { top: true; bottom: true; left: true; right: true }
  color: "transparent"
  WlrLayershell.namespace: "nixi-harness"
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
  exclusionMode: ExclusionMode.Ignore
  mask: Region { item: card }

  property string agent: "codex"
  property string model: "gpt-6-astra"
  property string reasoningEffort: "low"
  property string draftAgent: agent
  property string draftModel: model
  property string draftReasoningEffort: reasoningEffort
  // OpenCode's models come from the user's own providers, so Nixi picks no
  // model or effort for it -- OpenCode's configured default is used.
  readonly property bool picksModel: draftAgent === "claude" || draftAgent === "codex"
  readonly property var modelChoices: draftAgent === "claude" ? [
    { label: "Opus 4.8", value: "claude-opus-4-8" },
    { label: "Opus 5", value: "claude-opus-5" },
    { label: "Fable 5", value: "claude-fable-5" },
    { label: "Fable 5.1", value: "claude-fable-5-1" }
  ] : [
    { label: "Luna", value: "gpt-5.6-luna" },
    { label: "Terra", value: "gpt-5.6-terra" },
    { label: "Sol (GPT-5.6)", value: "gpt-5.6-sol" },
    { label: "Astra", value: "gpt-6-astra" }
  ]
  signal applied(string agent, string model, string reasoningEffort)

  function open() {
    draftAgent = agent
    draftModel = model
    draftReasoningEffort = reasoningEffort
    syncModelIndex()
    visible = true
    Qt.callLater(function() { modelSelect.forceActiveFocus() })
  }

  function syncModelIndex() {
    if (!picksModel) { modelSelect.currentIndex = -1; return }
    var index = modelSelect.indexOfValue(draftModel)
    if (index >= 0) { modelSelect.currentIndex = index; return }
    modelSelect.currentIndex = 0
    draftModel = modelChoices[0].value
  }

  function chooseAgent(nextAgent) {
    if (draftAgent === nextAgent) return
    draftAgent = nextAgent
    if (nextAgent === "" || nextAgent === "opencode") {
      draftModel = ""
      draftReasoningEffort = ""
      modelSelect.currentIndex = -1
      return
    }
    if (draftReasoningEffort === "") draftReasoningEffort = "low"
    draftModel = nextAgent === "claude" ? "claude-opus-5" : "gpt-6-astra"
    Qt.callLater(root.syncModelIndex)
  }

  function commit() {
    applied(draftAgent, draftModel, draftReasoningEffort)
    visible = false
  }

  Shortcut { sequence: "Escape"; onActivated: root.visible = false }
  Shortcut { sequence: "Meta+,"; onActivated: root.visible = false }
  Shortcut { sequence: "Return"; onActivated: root.commit() }

  Rectangle {
    id: card
    width: Math.min(Style.space(520), parent.width - Style.gapsOut * 2)
    // Width was clamped and height was not, so at a large theme base-size on a
    // small panel the agent/model/effort column ran off both ends (#38).
    height: Math.min(content.implicitHeight + Style.space(52), parent.height - Style.gapsOut * 2)
    anchors.centerIn: parent
    color: Color.menu.background
    border.color: Color.menu.border
    border.width: Math.max(1, Style.space(2))
    radius: Style.cornerRadius

    Column {
      id: content
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: parent.top
      anchors.margins: Style.space(26)
      spacing: Style.space(14)

      Text { text: "Agent"; color: Color.menu.text; font.family: Style.font.family; font.pixelSize: Style.font.title * root.fontScale; font.bold: true }
      Text {
        width: parent.width
        text: "Applies to new conversations and survives shell restarts."
        color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.58)
        font.family: Style.font.family
        font.pixelSize: Style.font.caption * root.fontScale
        wrapMode: Text.Wrap
      }

      Row {
        spacing: Style.space(8)
        Repeater {
          model: ["", "codex", "claude", "opencode"]
          delegate: Chip {
            required property string modelData
            label: modelData || "Omarchy default"
            selected: root.draftAgent === modelData
            onClicked: root.chooseAgent(modelData)
          }
        }
      }

      Text { text: "Model"; color: Color.menu.text; font.family: Style.font.family; font.pixelSize: Style.font.body * root.fontScale }
      ComboBox {
        id: modelSelect
        enabled: root.picksModel
        displayText: root.draftAgent === "" ? "System harness settings"
          : root.draftAgent === "opencode" ? "OpenCode settings" : currentText
        width: parent.width
        height: Style.space(42)
        model: root.modelChoices
        textRole: "label"
        valueRole: "value"
        font.family: Style.font.family
        font.pixelSize: Style.font.body * root.fontScale
        onActivated: root.draftModel = currentValue
      }

      Text { text: "Thinking"; color: Color.menu.text; font.family: Style.font.family; font.pixelSize: Style.font.body * root.fontScale }
      Row {
        spacing: Style.space(7)
        enabled: root.picksModel
        Repeater {
          model: ["low", "medium", "high", "xhigh", "max"]
          delegate: Chip {
            required property string modelData
            label: modelData
            selected: root.draftReasoningEffort === modelData
            padding: Style.space(18)
            height: Style.space(34)
            textSize: Style.font.caption * root.fontScale
            onClicked: root.draftReasoningEffort = modelData
          }
        }
      }

      Text { text: "Return to save"; color: Color.accent; font.family: Style.font.family; font.pixelSize: Style.font.caption * root.fontScale }
    }
  }
}
