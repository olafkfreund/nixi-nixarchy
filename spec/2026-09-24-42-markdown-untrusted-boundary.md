---
status: approved
issue: 42
intent: intent/2026-09-24-42-markdown-untrusted-boundary.md
---

# Spec: Agent output must not reach the network or the desktop by itself

Approved direction: **allow local files only**. `file://` images under a known
directory render; everything remote is blocked. This keeps a path open for a
future screenshot or diagram feature rather than closing it off.

## Design

Two independent changes to `Conversation.qml`, both at the boundary where agent
text meets a capability.

**1. Rewrite image sources before rendering (`spacedMarkdown`, `:143-169`).**

`spacedMarkdown` already walks the body line by line with fence tracking, and is
already the single funnel every agent reply passes through on its way to the
`TextEdit` at `:1341`. Add image handling to that existing pass rather than a
second one.

For each `![alt](src)` outside a fenced block:

- `src` that resolves to a `file://` or absolute path inside the allowed root is
  left as-is.
- Anything else -- `http`, `https`, `data:`, protocol-relative, or a path that
  escapes the root -- is replaced by its alt text in brackets, so the reader sees
  that something was there. A remote URL is never handed to the renderer, so
  `QQuickPixmap` is never asked to fetch it.

The allowed root is the file-preview directory the card already works in, not an
arbitrary path: an agent that can write anywhere could otherwise point at a file
whose mere rendering is undesirable. The plan fixes the exact root.

Containment is checked after normalising `..`, and a path whose resolved form
leaves the root is rejected. Rejection is the default: anything unparseable
becomes alt text.

Fenced blocks are skipped entirely. `spacedMarkdown`'s comment at `:141-142`
records that inserting anything inside a fence corrupts copied code, and an
`![...]` inside a fence is example text, not an image.

**2. Allowlist link schemes (`onLinkActivated`, `:1351`).**

```qml
onLinkActivated: function(link) {
  if (/^https?:\/\//i.test(link)) Qt.openUrlExternally(link)
  else root.statusText = "Nixi did not open that link: only http and https links can be opened."
}
```

Refusing silently would be worse than the current behaviour, because the user
would not know whether the click registered. The message names the reason.

## Alternatives rejected

**Strip image syntax outright.** The smaller fix and the one initially
recommended, not chosen: it forecloses local screenshots and diagrams.

**Switch the transcript to `PlainText`.** Rejected: loses headings, lists,
emphasis and fenced code, which is the whole reason `MarkdownText` is used and
is most of the value of an agent's answer.

**Add a Markdown or HTML sanitiser dependency.** Rejected: this is removal of a
capability, not a parsing problem. A parser is more code, more surface and a new
dependency for something a rewrite in an existing pass covers.

**Set a `QQuickPixmap` network access policy globally.** Rejected: no supported
per-item control, and Nixi is an in-process plugin in the Omarchy shell -- a
global Qt change would affect surfaces Nixi does not own.

**Allowlist schemes but keep remote images.** Rejected: images are the zero-click
path; links need a click. Fixing only the click-gated half leaves the worse half.

## Risks

- **Per-chunk cost.** `spacedMarkdown` already runs over the entire body on every
  streamed chunk, so any work added here is multiplied by chunk count. The image
  rewrite must be a cheap scan, and must not run a regex over the whole document
  per chunk when it can ride the existing line walk. The underlying O(n^2)
  rendering problem is a separate issue and is not fixed here, but this change
  must not make it measurably worse.
- **Breaking legitimate Markdown.** An `![` appearing in prose or inside inline
  code must not be mangled. Fence skipping handles the block case; inline
  backticks need a test.
- **Alt-text substitution is agent-controlled.** The replacement text comes from
  the agent, so it is rendered as literal text, never as further Markdown.
- **The Qt fetch was never executed.** The image-loading path is documented
  behaviour, confirmed by reading Qt's source, but no fetch was demonstrated
  during review. The plan should begin by confirming it with a local listener,
  so the fix is verified against real behaviour rather than an assumption.
- Host-specific risk: none. UI-local; no packaging, bridge or trust change.

## Verification

1. **Confirm the vulnerability first.** Render a reply containing a remote image
   reference with a local listener on that port. A connection before the fix,
   none after, is the primary evidence. If no connection occurs before the fix,
   stop and re-scope -- half this change would be unnecessary.
2. **Automated.** The image rewrite is pure string work, so it belongs in
   `TextFormat.js` under `node --test`, following the `TourModel.js` precedent
   (`tour-model.test.js` already imports a QML-adjacent JS module this way).
   Cases: remote URL becomes alt text; `file://` inside the root survives; a
   `..` escape is rejected; `data:` is rejected; an `![...]` inside a fence is
   untouched and the fence is byte-identical; inline-code `![` is untouched.
3. **Automated.** `nix flake check`; `node --test bridge/*.test.js`.
4. **Runtime, links.** A reply containing an `https` link opens it; one
   containing a `file://` or custom-scheme link does not, and shows the message.
5. **Runtime, no regression.** A reply with headings, a nested list, emphasis and
   a fenced code block renders as before, and the code block copies byte-exact.
