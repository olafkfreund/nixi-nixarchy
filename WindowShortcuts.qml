import QtQuick

Item {
  // An inline component does not share the enclosing document's scope, so
  // the conversation is handed in rather than reached through its id.
  required property Item conversation
  // Y and N answer a permission prompt, but never over typed text (#20).
  // Deliberately only the one-shot choices. #27 showed repeated prompting
  // trains Allow into a reflex, and a held key that grants STANDING approval
  // is the worst possible target for one -- so "always" is mouse-only (#53).
  // autoRepeat: false, so a HELD key answers once and never again -- exact,
  // where a timer would have to outrun the compositor's repeat_delay, which
  // is the user's setting and not ours (#50).
  Shortcut {
    sequence: "Y"
    autoRepeat: false
    enabled: conversation.permissionKeysLive && conversation.optionIdForKind("allow_once") !== ""
    onActivated: conversation.answerPermission(conversation.optionIdForKind("allow_once"))
  }
  Shortcut {
    sequence: "N"
    autoRepeat: false
    enabled: conversation.permissionKeysLive && conversation.optionIdForKind("reject_once") !== ""
    onActivated: conversation.answerPermission(conversation.optionIdForKind("reject_once"))
  }
  Shortcut { sequence: "Up"; onActivated: conversation.scrollKeyImpulse(-1, false) }
  Shortcut { sequence: "Down"; onActivated: conversation.scrollKeyImpulse(1, false) }
  Shortcut { sequence: "Ctrl+J"; onActivated: conversation.scrollActiveSurface(1, false) }
  Shortcut { sequence: "Ctrl+K"; onActivated: conversation.scrollActiveSurface(-1, false) }
  Shortcut { sequence: "Ctrl+U"; onActivated: conversation.scrollActiveSurface(-1, true) }
  Shortcut { sequence: "Ctrl+D"; onActivated: conversation.scrollActiveSurface(1, true) }
  Shortcut { sequence: "PageUp"; onActivated: conversation.scrollActiveSurface(-1, true) }
  Shortcut { sequence: "PageDown"; onActivated: conversation.scrollActiveSurface(1, true) }
  Shortcut { sequence: "Ctrl+="; onActivated: conversation.fontScaleStepRequested(0.1) }
  Shortcut { sequence: "Ctrl++"; onActivated: conversation.fontScaleStepRequested(0.1) }
  Shortcut { sequence: "Ctrl+-"; onActivated: conversation.fontScaleStepRequested(-0.1) }
  Shortcut { sequence: "Ctrl+0"; enabled: !conversation.menuOpen; onActivated: conversation.fontScaleResetRequested() }
  Shortcut { sequence: "Ctrl+P"; onActivated: conversation.pinConversation() }
  Shortcut { sequence: "Meta+,"; onActivated: conversation.harnessSelectorRequested() }
  // Ctrl+1 … Ctrl+9, Ctrl+0 pick the matching visible row. Each Shortcut sits
  // in an Item so it stays in this window's item tree, which is how a
  // Shortcut finds its window.
  Repeater {
    model: 10
    Item {
      required property int index
      Shortcut {
        sequence: "Ctrl+" + ((index + 1) % 10)
        enabled: conversation.menuOpen
        onActivated: conversation.selectVisibleSlot(index)
      }
    }
  }
}
