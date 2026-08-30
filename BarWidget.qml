import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// Archy's doorway: one robot in the bar. Click = summon the guide.
// First click bootstraps the helper (config, services, tour) via the
// launcher script shipped in this plugin; after that it just toggles.
BarWidget {
  id: root
  moduleName: "io.github.respira-crece-lidera.archy"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function launch() {
    if (root.bar)
      root.bar.run("bash \"$HOME/.config/omarchy/plugins/io.github.respira-crece-lidera.archy/archy-launch\"")
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\uf17b"
    slotSize: Style.bar.statusSlot
    fontSize: Style.font.caption
    tooltipText: "Archy — your Omarchy guide"
    onPressed: root.launch()
  }
}
