import QtQuick
import QtQuick.Controls
import qs.Commons

Item {
  id: preview
  required property Item conversation
  required property Item cardRef
  required property var panelRef
  required property var pinnedWindowRef
  required property ListView inlineResultsRef
  parent: conversation.pinned ? pinnedWindowRef.contentItem : panelRef.contentItem
  visible: conversation.filePreviewVisible && conversation.searchMode === "@"
  readonly property Item anchorCard: cardRef
  readonly property Item anchorItem: inlineResultsRef.currentItem
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
    var point = anchorItem.mapToItem(preview, 0,
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
      var bx = preview.bodyX
      var right = width - Math.max(1, Style.space(2))
      var bottom = height - Math.max(1, Style.space(2))
      var top = Math.max(1, Style.space(2))
      var radius = Math.min(Style.cornerRadius, (right - bx) / 2, height / 2)
      var halfWedge = Style.space(14)
      var cy = preview.wedgeCenterY
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
      ctx.fillStyle = conversation.background
      ctx.fill()
      ctx.lineWidth = Math.max(1, Style.space(2))
      ctx.strokeStyle = conversation.border
      ctx.lineJoin = "round"
      ctx.stroke()
    }
  }

  Image {
    anchors.fill: parent
    anchors.leftMargin: preview.bodyX + Style.space(14)
    anchors.rightMargin: Style.space(14)
    anchors.topMargin: Style.space(14)
    anchors.bottomMargin: Style.space(14)
    visible: conversation.filePreviewThumbnail !== ""
    source: conversation.filePreviewThumbnail === ""
      ? "" : conversation.localFileUrl(conversation.filePreviewThumbnail)
    fillMode: Image.PreserveAspectFit
    asynchronous: true
    cache: false
  }

  ScrollView {
    anchors.fill: parent
    anchors.leftMargin: preview.bodyX + Style.space(16)
    anchors.rightMargin: Style.space(16)
    anchors.topMargin: Style.space(16)
    anchors.bottomMargin: Style.space(16)
    visible: conversation.filePreviewText !== ""
    clip: true
    TextArea {
      text: conversation.filePreviewText
      readOnly: true
      wrapMode: TextEdit.NoWrap
      color: conversation.foreground
      selectionColor: conversation.accent
      background: null
      padding: 0
      font.family: "JetBrainsMono Nerd Font"
      font.pixelSize: conversation.menuPathSize
    }
  }

  Column {
    anchors.centerIn: parent
    width: parent.width - preview.bodyX - Style.space(36)
    anchors.horizontalCenterOffset: preview.bodyX / 2
    spacing: Style.space(8)
    visible: conversation.filePreviewThumbnail === "" && conversation.filePreviewText === ""
    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      text: "󰈙"
      color: Qt.rgba(conversation.foreground.r, conversation.foreground.g, conversation.foreground.b, 0.38)
      font.family: "JetBrainsMono Nerd Font"
      font.pixelSize: Style.space(54)
    }
    Text {
      width: parent.width
      text: conversation.filePreviewName
      color: conversation.foreground
      horizontalAlignment: Text.AlignHCenter
      elide: Text.ElideMiddle
      font.family: Style.font.family
      font.pixelSize: conversation.menuTitleSize
    }
  }
}
