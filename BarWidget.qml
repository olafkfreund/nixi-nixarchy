import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// Nixi's doorway: a pixel snowflake in the bar (drawn as real pixels,
// matching the screensaver's blocky ASCII aesthetic — no font glyphs, so it
// can never tofu and it recolors with the theme). Click = summon the guide.
BarWidget {
  id: root
  moduleName: "io.github.olafkfreund.nixi"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function launch() {
    if (root.bar)
      root.bar.run("bash \"$HOME/.config/omarchy/plugins/io.github.olafkfreund.nixi/nixi-launch\"")
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: ""
    slotSize: Style.bar.statusSlot
    tooltipText: "Nixi — your nixarchy guide"
    onPressed: root.launch()

    iconComponent: Component {
      Canvas {
        id: bot
        anchors.fill: parent
        property color px: button.foreground
        onPxChanged: bot.requestPaint()
        onPaint: {
          // An 11x11 pixel snowflake: vertical and horizontal spines plus
          // both diagonals. Same grid as the favicon.
          var rows = [
            ".....X.....",
            "X....X....X",
            ".X...X...X.",
            "..X..X..X..",
            "...X.X.X...",
            "XXXXXXXXXXX",
            "...X.X.X...",
            "..X..X..X..",
            ".X...X...X.",
            "X....X....X",
            ".....X....."
          ];
          var W = 11, H = 11;
          var ctx = getContext("2d");
          ctx.clearRect(0, 0, width, height);
          var cell = Math.floor(Math.min(width / W, height / H));
          if (cell < 1) cell = 1;
          var ox = Math.floor((width - cell * W) / 2);
          var oy = Math.floor((height - cell * H) / 2);
          ctx.fillStyle = String(px);
          for (var y = 0; y < H; y++)
            for (var x = 0; x < W; x++)
              if (rows[y].charAt(x) === "X")
                ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
        }
        Component.onCompleted: requestPaint()
      }
    }
  }
}
