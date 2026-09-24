---
status: approved
issue: 52
author: olafkfreund
---

# Intent: Approving a menu entry should not authorise running commands later

## Problem

`MenuSearch.qml:57` watches `~/.config/omarchy/extensions/omarchy-menu.jsonc`.
`:531-536` reloads it on every change, and each reload runs the items'
`when:` / `checked:` guard fields through a shell at `:551`:

```qml
guardProc.command = ["bash", "-lc", script]
```

That is correct behaviour for a file the *user* owns. Nothing distinguishes a
user's edit from an agent's.

In Mechanic, an agent requests one Write to that path. The permission card shows
a JSON diff, which reads as "add a menu entry" -- which is what it is, and
exactly why it gets approved. The `when:` field then fires on the next reload,
out of band, with no permission request, and again on every subsequent reload.

So one benign-looking approval becomes standing command execution that outlives
the session the user approved it in. The approval the user gave and the
authority it actually conferred are different things, and the card gave them no
way to tell.

This is the same shape as #50, from the other side: there the card showed less
than what would run; here the card showed exactly what would be written, and the
consequence was somewhere else entirely.

## Proposed outcome

- A write to a path whose contents will later be executed is presented as what
  it is, not as an ordinary file edit.
- Users keep full control of their own menu file; nothing about hand-editing it
  changes.
- The guard mechanism keeps working -- it is a legitimate feature and is not
  what is wrong here.

## Affected users and systems

- Mechanic users, and any trust level that permits writes.
- `bridge/trust-policy.js` if the fix is a permission rule; `MenuSearch.qml` if
  it is anything more.
- Anyone using `omarchy-menu.jsonc` extensions, who must not be inconvenienced
  by this.

## Constraints

- Must not break user-authored menu extensions or require them to change format.
- Must not add a second enforcement mechanism where the existing settings-based
  one can express the rule -- the same reasoning that kept #41's fix inside
  `claudePermissions` rather than adding a hook.
- Must not prompt on every menu reload; the cost belongs at the write, which is
  rare, not at the read, which is frequent.
- Whatever is done should generalise: this file is the instance that was found,
  but the principle is "a write to something that will later be executed", and a
  fix that only names one path will be wrong again the next time.

## Open questions

1. Is a `Write`/`Edit` ask rule on `~/.config/omarchy/extensions/**` sufficient?
   It is one line in `claudePermissions` and costs nothing elsewhere -- but it
   makes the prompt say "write to this file", not "this file runs commands", so
   it raises the question without answering it for the user.
2. Are there other write-then-execute paths of the same shape? Hyprland config,
   hook directories under `~/.config/omarchy/hooks/`, and anything else sourced
   or executed on a watch. Worth enumerating before fixing one instance, or the
   next one is found the same way.
3. Should the permission card say *why* a path is sensitive, rather than just
   asking about it? That is a larger change and overlaps #50's rendering work,
   so it may belong there instead.
4. Scope check for the approver: is this worth fixing at all given it requires
   an approved write in Mechanic? I think yes -- the gap between what was
   approved and what was authorised is the whole point of the permission model
   -- but it is a fair question and the answer changes the priority.
