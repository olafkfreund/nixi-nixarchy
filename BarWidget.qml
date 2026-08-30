import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// Archy's doorway: a retro arcade pixel-bot in the bar (drawn as real pixels,
// matching the screensaver's blocky ASCII aesthetic — no font glyphs, so it
// can never tofu and it recolors with the theme). Click = summon the guide.
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
    text: ""
    slotSize: Style.bar.statusSlot
    tooltipText: "Archy — your Omarchy guide"
    onPressed: root.launch()

    iconComponent: Component {
      Canvas {
        id: bot
        anchors.fill: parent
        property color px: button.foreground
        onPxChanged: bot.requestPaint()
        onPaint: {
          // 8x8 arcade bot: antennae, visor eyes, invader legs.
          var rows = [
            ".X....X.",
            "..X..X..",
            ".XXXXXX.",
            "XX.XX.XX",
            "XXXXXXXX",
            "..XXXX..",
            ".X.XX.X.",
            "X..XX..X"
          ];
          var ctx = getContext("2d");
          ctx.clearRect(0, 0, width, height);
          var cell = Math.floor(Math.min(width, height) / 8);
          if (cell < 1) cell = 1;
          var ox = Math.floor((width - cell * 8) / 2);
          var oy = Math.floor((height - cell * 8) / 2);
          ctx.fillStyle = String(px);
          for (var y = 0; y < 8; y++)
            for (var x = 0; x < 8; x++)
              if (rows[y].charAt(x) === "X")
                ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
        }
        Component.onCompleted: requestPaint()
      }
    }
  }
}
