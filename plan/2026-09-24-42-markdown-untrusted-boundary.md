---
status: approved
issue: 42
spec: spec/2026-09-24-42-markdown-untrusted-boundary.md
---

# Plan: Agent output must not reach the network or the desktop by itself

Approved decisions, carried over so this file stands alone:

- **Local files only.** `file://` images under a known root render; every remote
  or unparseable source is replaced by its alt text in brackets.
- Image rewriting rides the **existing** `spacedMarkdown` line walk, not a
  second pass, because that function already runs over the whole body on every
  streamed chunk.
- Fenced code blocks are skipped entirely and must pass through byte-identical.
- `onLinkActivated` allowlists `http`/`https` and **says so** when it refuses --
  a silent refusal is worse than today's behaviour.
- The pure string logic goes in `TextFormat.js` and is tested under
  `node --test`, following the existing `TourModel.js` precedent.

## Steps

1. **Confirm the vulnerability before changing anything.** Start a listener
   (`nc -l 8099`), have the agent emit a reply containing a remote image
   reference pointing at it, and watch for a connection on render.
   -> verify by a connection arriving. **If none arrives, stop and re-scope:**
   half of this change would be unnecessary and the spec's premise is wrong.

2. Create `TextFormat.js` at the repo root, exporting `spacedMarkdown` moved
   verbatim from `Conversation.qml:143-169`, with the CommonJS footer
   `TourModel.js:115-127` uses so `node --test` can import it.
   -> verify by `node -e 'require("./TextFormat.js")'` succeeding.

3. Add image handling inside `spacedMarkdown`'s existing per-line loop: for each
   `![alt](src)` outside a fence, keep `src` when it resolves inside the allowed
   root, otherwise replace the whole construct with `[alt]` as literal text.
   Resolve `..` before the containment test and reject anything that escapes.
   The allowed root is the file-preview directory the card already works in, not
   an arbitrary path.
   -> verify by the tests in step 6.

4. `Conversation.qml`: replace the inline `spacedMarkdown` with an import of
   `TextFormat.js`, leaving the `:1341` binding unchanged in shape.
   -> verify by `grep -c 'function spacedMarkdown' Conversation.qml` returning 0
   and the transcript still rendering.

5. `Conversation.qml:1351`: gate `onLinkActivated` on `/^https?:\/\//i`, and set
   `statusText` naming the reason when it refuses.
   -> verify by runtime check 4.

6. `bridge/text-format.test.js`: cases for a remote URL becoming alt text; a
   `file://` inside the root surviving; a `..` escape rejected; `data:`
   rejected; an `![...]` inside a fence untouched with the fence byte-identical;
   an `![` inside inline backticks untouched. Plus the existing `spacedMarkdown`
   behaviour that must not regress: a single-line string short-circuits
   unchanged, and a blank line before `- item` does not restart ordered
   numbering.
   -> verify by `node --test bridge/text-format.test.js`.

7. `nix/package.nix:128`: add `TextFormat.js` to the `install -Dm644` list
   beside `TourModel.js`, and to the `installCheckPhase` non-empty assertions at
   `:203-211`.
   -> verify by `nix build` and `test -s $out/.../TextFormat.js`.

8. Re-run step 1's listener against the fixed build.
   -> verify by **no** connection arriving.

## Tests

```bash
node --test bridge/*.test.js
# expect: all pass, including the new text-format suite

nix flake check --print-build-logs
# expect: checks.package passes WITH the new TextFormat.js assertion
#         (a missing package.nix entry fails here, which is the point of step 7)
```

Runtime checks, after rebuild and `omarchy-restart-shell`:

1. **The fetch is gone.** Step 8 above -- listener sees nothing.
2. **Local images still work.** A reply referencing a `file://` image inside the
   allowed root renders it.
3. **Escapes blocked.** A `file://` path using `..` to leave the root shows alt
   text instead.
4. **Links.** An `https` link opens. A `file://` or custom-scheme link does not,
   and a message names the reason.
5. **No rendering regression.** A reply with headings, a nested list, emphasis
   and a fenced code block renders as before, and the code block **copies
   byte-exact** -- `spacedMarkdown:141-142` records that corrupting copied code
   is the specific failure this guard exists to prevent.
6. **Streaming is not slower.** A long reply streams without new stutter. The
   underlying per-chunk re-parse is a separate issue and is not fixed here, but
   this change must not measurably worsen it.

## Rollback

`git revert` the implementation commit.

- `TextFormat.js` is a new file with no persisted state; reverting removes it.
  The `package.nix` entry (step 7) must be reverted in the same commit or the
  build fails asserting a file that no longer exists.
- No on-disk format changes, so no migration to undo.
- If only the image rewriting proves troublesome -- a legitimate local image
  wrongly rejected -- revert step 3 alone and keep step 5. The link allowlist is
  independent, much smaller, and closes the click-gated half on its own.
- If step 1 shows no fetch occurs, the correct rollback is to abandon steps 3
  and 8 entirely and ship only the link allowlist, updating `spec/` in the same
  commit as required by the workflow.
