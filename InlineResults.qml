import QtQuick
import QtQuick.Controls
import qs.Commons

ListView {
  id: results
  required property Item conversation
  required property Item menuPhysicsRef
  required property Item menuResultsRef
  required property Item menuSearchRef
  property alias menuShortcutAssignmentRef: menuShortcutAssignment
  width: parent.width
  height: Math.min(contentHeight, Style.space(360))
  model: conversation.menuOpen ? menuSearchRef.rows : []
  currentIndex: conversation.menuIndex
  clip: true
  boundsBehavior: Flickable.StopAtBounds
  flickableDirection: Flickable.VerticalFlick
  maximumFlickVelocity: 6000
  flickDeceleration: 650
  reuseItems: true
  onContentYChanged: {
    menuPhysicsRef.stopAtBoundary()
    conversation.deferMenuShortcutRange()
  }
  onHeightChanged: conversation.deferMenuShortcutRange()
  onCountChanged: Qt.callLater(conversation.updateMenuShortcutRange)
  onDraggingChanged: {
    if (!dragging) return
    menuPhysicsRef.stop()
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
          conversation.menuScrollKeyImpulse(steps < 0 ? 1 : -1, false)
      } else menuPhysicsRef.track(wheel)
      wheel.accepted = true
    }
  }

  Timer {
    id: menuShortcutAssignment
    interval: 500
    onTriggered: conversation.updateMenuShortcutRange()
  }

  delegate: Rectangle {
    required property var modelData
    required property int index
    readonly property bool current: index === conversation.menuIndex
    readonly property int visibleSlot: index - conversation.menuShortcutFirst
    readonly property real workspaceHeaderHeight:
      String(modelData.workspaceHeader || "") !== "" ? Style.space(26) : 0
    width: menuResultsRef.width
    height: workspaceHeaderHeight
      + Math.max(rowText.implicitHeight, mathText.implicitHeight) + Style.space(16)
    color: "transparent"

    Rectangle {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      height: parent.height - parent.workspaceHeaderHeight
      color: parent.current
      ? Qt.rgba(conversation.accent.r, conversation.accent.g, conversation.accent.b, 0.18)
      : "transparent"
    }

    Text {
      anchors.left: parent.left
      anchors.leftMargin: Style.space(6)
      anchors.top: parent.top
      visible: parent.workspaceHeaderHeight > 0
      text: modelData.workspaceHeader || ""
      color: Qt.rgba(conversation.foreground.r, conversation.foreground.g, conversation.foreground.b, 0.48)
      font.family: Style.font.family
      font.pixelSize: conversation.menuPathSize
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
        && index <= conversation.menuShortcutLast
      color: Qt.rgba(conversation.foreground.r, conversation.foreground.g, conversation.foreground.b, 0.38)
      font.family: Style.font.family
      font.pixelSize: conversation.menuPathSize
    }

    // Menu rows carry a glyph in their own icon font; applications
    // carry a real icon, resolved by the same AppLibrary the
    // launcher uses. One column, either kind.
    Item {
      id: rowIcon
      visible: !modelData.isMath
      readonly property bool fileImage: Boolean(modelData.isPath)
        && !Boolean(modelData.isRepository)
        && conversation.isImagePath(modelData.absolutePath)
      x: Style.space(6)
      // Optically centred, not mathematically. A line box carries
      // descender space the title glyphs mostly do not use, so
      // splitting it evenly parks the icon visibly low against the
      // text it labels. Lift it by a fraction of the type size.
      y: rowText.y
         + Math.round((rowTitle.implicitHeight - height) / 2)
         - Math.round(conversation.menuTitleSize * 0.09)
      width: fileImage ? Style.space(38) : conversation.menuTitleSize
      height: width

      Text {
        anchors.centerIn: parent
        visible: !modelData.isApp && !parent.fileImage
        text: modelData.icon || ""
        color: parent.parent.current ? conversation.accent : conversation.foreground
        font.family: modelData.iconFont && modelData.iconFont.length > 0
          ? modelData.iconFont
          : Style.font.family
        font.pixelSize: Math.round(conversation.menuTitleSize * 0.8)
      }
      Image {
        anchors.fill: parent
        visible: modelData.isApp || parent.fileImage
        source: modelData.isApp && conversation.appLibrary
          ? conversation.appLibrary.iconSource(modelData.appIcon)
          : (parent.fileImage ? conversation.localFileUrl(modelData.absolutePath) : "")
        sourceSize.width: parent.fileImage
          ? Math.round(parent.width * 2) : conversation.menuTitleSize
        sourceSize.height: parent.fileImage
          ? Math.round(parent.height * 2) : conversation.menuTitleSize
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
        color: parent.parent.current ? conversation.accent : conversation.foreground
        font.family: Style.font.family
        font.pixelSize: conversation.menuTitleSize
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
          color: Qt.rgba(conversation.foreground.r, conversation.foreground.g, conversation.foreground.b, 0.45)
          font.family: Style.font.family
          font.pixelSize: conversation.menuPathSize
          elide: Text.ElideRight
        }
        Text {
          id: inlineActionHint
          visible: Boolean(modelData.isPath) && parent.parent.parent.current
          width: visible ? implicitWidth : 0
          text: modelData.actionHint || ""
          color: Qt.rgba(conversation.accent.r, conversation.accent.g, conversation.accent.b, 0.72)
          font.family: Style.font.family
          font.pixelSize: conversation.menuPathSize
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
        color: Qt.rgba(conversation.foreground.r, conversation.foreground.g, conversation.foreground.b, 0.45)
        font.family: Style.font.family
        font.pixelSize: conversation.menuTitleSize
        elide: Text.ElideMiddle
      }
      Text {
        id: mathAnswer
        width: Math.min(implicitWidth, mathText.width)
        text: modelData.isMath ? modelData.answer : ""
        color: parent.parent.current ? conversation.accent : conversation.foreground
        font.family: Style.font.family
        font.pixelSize: conversation.menuTitleSize
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
        if (Math.abs(at.x - conversation.menuMouseX) < 0.5
            && Math.abs(at.y - conversation.menuMouseY) < 0.5) return
        conversation.menuMouseX = at.x
        conversation.menuMouseY = at.y
        conversation.menuMouseArmed = true
        conversation.menuIndex = index
      }

      // A row arriving under the pointer records where it is so
      // the next move can be measured, but grants nothing: the
      // list is still keyboard territory until the mouse moves.
      onEntered: {
        if (conversation.menuMouseArmed) { conversation.menuIndex = index; return }
        var here = mapToItem(null, mouseX, mouseY)
        conversation.menuMouseX = here.x
        conversation.menuMouseY = here.y
      }

      // A click is already intent, so it never waits to be armed.
      onClicked: { conversation.menuIndex = index; conversation.menuActivate(Qt.NoModifier) }
    }
  }
}
