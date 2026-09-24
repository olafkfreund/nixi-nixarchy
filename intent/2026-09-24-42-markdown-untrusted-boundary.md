---
status: approved
issue: 42
author: olafkfreund
---

# Intent: Agent output must not be able to reach the network or the desktop by itself

## Problem

The transcript renders agent reply text as a rich Markdown document:

```qml
text: root.spacedMarkdown(turn.body)
textFormat: TextEdit.MarkdownText
onLinkActivated: function(link) { Qt.openUrlExternally(link) }
```

(`Conversation.qml:1341-1351`.)

Two consequences follow from that, both at the boundary where untrusted content
meets a capability:

1. Qt resolves images in a Markdown document through
   `QQuickTextDocumentWithImageResources` and `QQuickPixmap`, which loads remote
   URLs. Rendering the reply is therefore enough to cause an outbound request;
   no user action is involved, and a failed or tiny image leaves nothing visible
   in the transcript.

2. `onLinkActivated` hands the URL to `Qt.openUrlExternally` with no scheme
   check, so schemes other than `http`/`https` reach the desktop's registered
   handlers. Both the link target and the text the user sees are agent-authored,
   so the label need not describe the destination.

`spacedMarkdown` (`:143-169`) is not a sanitiser. It reflows blank lines around
paragraphs and lists and touches nothing else.

This is the only agent-controlled surface in the UI that is not `PlainText`. The
permission card directly below it (`:2137-2190`) is `PlainText` throughout and
carries a comment recording exactly that rule, so the convention exists in this
file and the transcript is the one place it was not applied.

It also composes badly with #41: while Guide performs unprompted reads, an
automatic outbound fetcher in the same trust level turns two separate gaps into
one path.

## Proposed outcome

- Rendering a reply never causes a network request the user did not ask for.
- Following a link from the transcript can only open `http`/`https`.
- Agent replies still render as readable Markdown -- headings, lists, emphasis
  and fenced code all keep working, because that formatting is why
  `MarkdownText` was chosen.

## Affected users and systems

- Every user, in every trust level, on every reply.
- `Conversation.qml` -- the transcript `TextEdit` and `spacedMarkdown`.
- Any future inline-image feature, which should be designed against this
  decision rather than around it.

## Constraints

- Must not regress Markdown rendering quality. Fenced code blocks in particular
  must pass through byte-identical -- `spacedMarkdown`'s comment at `:141-142`
  records that inserting anything inside a fence corrupts copied code.
- Must not introduce an HTML sanitiser or a Markdown library; the fix should be
  removal of a capability, not addition of a parser.
- Whatever is done must be cheap enough to run per streamed chunk, or must be
  paired with the rendering cost already noted on the same `TextEdit` (the whole
  body is re-processed on every chunk).

## Open questions

1. Are inline images wanted at all? If they are, the cheapest safe form is
   `file://` under a known directory only. If they are not, stripping image
   syntax outright is simpler and is the lazier fix.
2. Should a stripped image leave a visible placeholder so the user can tell
   something was removed, or vanish silently?
3. The Qt image-loading path is documented behaviour and was not executed during
   review. Worth one runtime confirmation with `qml` and a local listener before
   sizing the change -- the approver may want that done first.
