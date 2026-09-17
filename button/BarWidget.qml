import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// Nixi's doorway: sparkles in the bar (Material Design's `creation`, at
// U+F0674 in the Nerd Fonts private use area). A glyph rather than a painted
// canvas, so BarIconButton handles optical centring and theme colour for us —
// the same way omarchy's own bar indicators draw. Click = summon the guide.
BarWidget {
  id: root
  moduleName: "io.github.olafkfreund.nixi-button"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // The overlay this button summons: this plugin's own id without "-button".
  // Derived rather than hard-coded so a test copy under another id toggles
  // itself instead of the installed Nixi.
  readonly property string overlayId: root.moduleName.replace(/-button$/, "")

  function launch() {
    if (root.bar)
      root.bar.run("omarchy-shell shell toggle " + root.overlayId + " '{}'")
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰙴"
    slotSize: Style.bar.statusSlot
    tooltipText: "Nixi — your nixarchy guide"
    onPressed: root.launch()
  }
}
