import QtQuick

Item {
  id: physics
  required property Flickable flickable
  property real deceleration: 608
  property real velocity: 0
  property double sampleTime: 0
  property double lastWheelTime: 0
  property real releaseVelocity: 0
  readonly property bool running: keyTimer.running || momentum.running
  readonly property real minY: flickable.originY
  readonly property real maxY: Math.max(minY, minY + flickable.contentHeight - flickable.height)

  function stop() {
    velocity = 0
    keyTimer.stop()
    momentum.stop()
  }

  function impulse(amount) {
    momentum.stop()
    flickable.cancelFlick()
    velocity = Math.max(-flickable.maximumFlickVelocity,
      Math.min(flickable.maximumFlickVelocity, velocity + amount))
    sampleTime = Date.now()
    keyTimer.start()
  }

  // A precision-scroll gesture is not a pointer drag, so handing its
  // sampled velocity back to Flickable.flick() is unreliable after
  // cancelFlick(): on some Qt/Wayland paths the synthetic flick is
  // discarded with the wheel sequence that just ended. Animate the
  // stopping distance directly instead. The quint ease gives the coast a
  // long, soft tail; distance derives from deceleration while the
  // presentation duration is stretched enough to make that tail read.
  function coast(release) {
    momentum.stop()
    var speed = Math.min(flickable.maximumFlickVelocity, Math.abs(release))
    if (speed <= 40) return
    var distance = speed * speed / (2 * flickable.flickDeceleration)
    var destination = Math.max(minY, Math.min(maxY,
      flickable.contentY + (release < 0 ? -1 : 1) * distance))
    if (Math.abs(destination - flickable.contentY) <= 1) return
    momentum.from = flickable.contentY
    momentum.to = destination
    momentum.duration = Math.max(900, Math.min(2800,
      Math.round(speed * 1800 / flickable.flickDeceleration)))
    momentum.start()
  }

  function release() {
    releaseTimer.stop()
    coast(-releaseVelocity)
    lastWheelTime = 0
    releaseVelocity = 0
  }

  // One pixel-delta wheel event: follow the fingers, sample the velocity,
  // and coast once the gesture ends (or pauses past the release timer).
  function track(wheel) {
    stop()
    flickable.cancelFlick()
    var now = Date.now()
    var first = wheel.phase === Qt.ScrollBegin || lastWheelTime === 0
    if (first) { lastWheelTime = now; releaseVelocity = 0 }
    if (wheel.phase === Qt.ScrollEnd) { release(); return }
    var elapsed = first ? 16 : Math.max(1, Math.min(80, now - lastWheelTime))
    var dy = wheel.pixelDelta.y
    releaseVelocity = releaseVelocity * 0.55 + dy * 1000 / elapsed * 0.45
    lastWheelTime = now
    flickable.contentY = Math.max(minY, Math.min(maxY, flickable.contentY - dy))
    releaseTimer.restart()
  }

  function stopAtBoundary() {
    if (!momentum.running) return
    if (momentum.to <= minY && flickable.contentY <= minY + 0.75) {
      momentum.stop()
      flickable.contentY = minY
    } else if (momentum.to >= maxY && flickable.contentY >= maxY - 0.75) {
      momentum.stop()
      flickable.contentY = maxY
    }
  }

  Timer {
    id: keyTimer
    interval: 16
    repeat: true
    onTriggered: {
      var now = Date.now()
      var elapsed = Math.max(1, Math.min(40, now - physics.sampleTime)) / 1000
      physics.sampleTime = now
      var v = physics.velocity
      var flick = physics.flickable
      var nextY = Math.max(physics.minY, Math.min(physics.maxY, flick.contentY + v * elapsed))
      flick.contentY = nextY
      if ((nextY <= physics.minY && v < 0) || (nextY >= physics.maxY && v > 0)) {
        physics.velocity = 0
        keyTimer.stop()
        return
      }
      var loss = physics.deceleration * elapsed
      if (Math.abs(v) <= loss) {
        physics.velocity = 0
        keyTimer.stop()
      } else physics.velocity = v > 0 ? v - loss : v + loss
    }
  }
  NumberAnimation {
    id: momentum
    target: physics.flickable
    property: "contentY"
    easing.type: Easing.OutQuint
  }
  Timer { id: releaseTimer; interval: 55; onTriggered: physics.release() }
}
