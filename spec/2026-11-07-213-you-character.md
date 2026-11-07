---
status: approved
issue: 213
intent: intent/2026-11-06-206-character-friends.md
---

# Spec: the You character and plugin reactions

Slice 7 of the #206 intent. All code is in `olafkfreund/nixoarchy-snowflake`. Line numbers
are at `origin/main` 8f2275e (2026-11-07). The existing systems are in
`spec/2026-11-02-149-companion-plugins.md` and `spec/2026-11-04-178-characters.md`.

The intent decided (Q4 and Q7): "You" isn't shipped publicly, and plugins can fire reactions
under the existing consent rules. This spec does both with one new plugin kind each, and
adds no new trust path.

## Design

### 1. A plugin can add a character

`plugin.json` gains an optional `character` key (`OPTIONAL`, `plugins.py:27`; `_check`,
`plugins.py:103`):

```json
"character": {
  "label": "You",
  "template": "round",
  "fill": "#f4b88f",
  "back": "back.svg",
  "front": "front.svg",
  "fits": ["none", "scarf", "tie", "shades", "glasses", "chat", "feed"],
  "private": true
}
```

- **`template`:** the only value is `"round"`. It supplies every number a body needs, copied
  from the Devil (`index.html:1294-1298`): the `ball` silhouette, `faceBox`, `anchors`, `cupX`,
  `band`, `pivot` and `shadow`. So a plugin can't move the eye rig or the anchors, which #178
  kept shared. It can't give a silhouette outside the body limits either: `setCharacter` writes
  `ball` straight into `path.ball` and `#rim` (`index.html:1309`), outside any clip. The round
  head the mockup drew is that shape.
- **`fill`:** one `#rrggbb` colour for `path.ball`. His skin is his own and doesn't follow the
  body colour, the same choice the intent made for the Devil's red. Today the live ball uses
  `url(#ballG)` (`index.html:776`) and `miniNixi` uses a gradient built from `L.body`
  (`index.html:1255-1257`). Both take the flat fill for a plugin character.
- **`back` and `front`:** SVG files inside the folder (`_inside`, `plugins.py:60`), each run
  through `sanitize_svg` (`plugins.py:449`). Today's limits apply: 16 KB, 200 elements, depth 8,
  no gradients, `class`, `style`, text or images. The mockup's "me" art fits the size limits
  (36 elements, 3.5 KB) but uses one gradient and classes. It is redrawn in flat colours with
  no moving part.
- **`fits`:** must be a subset of the template's `fits`. For "You" it leaves out every head
  prop (halo, crown, sprout, bow, nightcap, beanie, party), headphones (their band crosses the
  cap) and `plug` (plugin props sit at `head`). That is the intent's rule: "nothing over the
  You cap".
- **`private`:** see §2.
- **`label`:** at most 20 characters, checked by `_bad` (`plugins.py:89`).
- **Unknown keys inside `character` reject the plugin,** as at the top level
  (`plugins.py:114-115`).

**Server.**
- `Plug.reload` (`server.py:1793`) sanitises `back` and `front` into `Plug.characters`, the
  same way it does props (`server.py:1808-1812`). A refused file drops the character, and the
  reason shows in Settings (`prop_errors`).
- `state_info` sends `plugin_characters` next to `plugin_props` (`server.py:5970`).
- `look()` accepts `character: "plug:<id>"` when `Plug.has_character(id)`, as skins already do
  for `plug:` (`server.py:296`). `CHARACTERS` (`server.py:282`) stays the built-in tuple.
- The two `voice_by_character` checks (`server.py:5868`, `:5988`) accept the same `plug:` IDs,
  so "You" can have its own voice (#207).
- `plugin_caps` (`server.py:1867`) adds "Adds a character (pick it in Look)".
- Data-only plugins start on, as today (#149 §5). Picking the character in Look is the
  consent, as it is for props.

**Page.**
- The page merges `plugin_characters` into `CHARACTERS` (`index.html:1282`) under
  `plug:<id>`, with the template's numbers and `nodes` in place of the `back` and `front` markup
  strings.
- `setCharacter` (`index.html:1307`) and `miniNixi` (`index.html:1258`, `:1262`) assign
  `innerHTML` from those strings today. For a plugin character they build the nodes with
  `createElementNS` and `setAttribute` only, as `drawProp` does (`index.html:1220-1224`).
- **On every reload** the page drops all `plug:` entries and adds the current ones. If the
  chosen character is gone (switched off, deleted or refused), `look()` no longer accepts it,
  so `state_info` sends `snowflake` and `setCharacter` draws him. No stale art stays on screen
  or in the Look grid.
- The art goes inside a nested `<svg>` clipped to the body limits (x ±96, y −120…+100, #178 §3).
  So no plugin art can reach the markers above his head or leave the 340 × 460 window.
- The Look grid builds its buttons with `innerHTML` and an unescaped `${c.label}`
  (`index.html:3543`). A plugin label is wrapped in `esc()` (`index.html:1045`).
- Weather frost, the glint and `touch` stay Snowflake-only or built-in, as now
  (`index.html:2200`, `:2321`).

### 2. "You" stays private

Where the likeness may exist: **only** in a hand-installed folder,
`~/.local/share/nixi-companion/plugins/you/` (`DATA_DIR / "plugins"`, `plugins.py:20`, `:57`),
on the user's machines.

- **No repo.** Not snowflake, not nixi-nixarchy, not nixos_config: all three are public
  (`gh repo view`, 2026-11-07). The intent's suggestion of "your nixos_config" is therefore
  dropped (open question 1). The plan writes the art straight into that folder, and the
  implementation PR carries only the generic kind and a synthetic test character.
- **No store.** A Nix-installed plugin is in `/nix/store`, which every user can read
  (`scan` marks it `nix`, `plugins.py:275`). `"private": true` makes the loader refuse the
  plugin from the package directory ("a private character can't come from the Nix store").
  The refusal goes by the folder's position (the first of `plugin_dirs`, `plugins.py:57`), not
  by `_in_store`, so a git checkout's `plugins/` is refused too.
  - **This stops it loading, not copying.** Nix copies the folder into the store the moment it
    is named as a source, before any check can run (`inherit pname src`, `nix/plugin.nix`). And
    `services.nixi.companion.plugins` also takes ready-made derivations, which skip
    `mkCompanionPlugin` (`nix/hm-module.nix:31`). `check_dir` (`plugins.py:945`) still refuses
    `private` so the build fails loudly, but that is a warning, not a guarantee.
  - The rule is therefore written where the user meets it: never name the folder in any Nix
    expression. It goes in the plugin kind's README and in the Settings line for a private
    plugin.
- **Not readable by others.** With `private`, the loader also refuses the folder or any of
  its files if they aren't owned by the user (`st_uid`), or if group or other users can read
  them (mode & 0o077), with "readable by other users: run chmod -R go= <folder>". It fails
  closed. Symlinks are already refused (`plugins.py:77`, `:263`).
  - **The boundary:** this keeps out other non-root users on the machine. Root and the user's
    own processes can read the folder, as they can read the rest of the home folder. ACLs aren't
    checked; a group- or other-readable ACL on that folder is out of scope.
- **No logs.** The art is never logged.
  - Sanitiser reasons can carry content today: a refused tag or attribute name, or the XML
    parser's message, goes into the error text (`plugins.py:446`, `:466`, `:478`), which
    `Plug.reload` keeps (`server.py:1812-1813`).
  - So a private plugin's errors are fixed strings ("the character art was refused", "the
    folder is readable by other users"), never the sanitiser's text.
  - The diagnostics report (`server.py:5846`) adds nothing.
  - A test pins this. It loads a valid private character and a malformed one whose tag and
    attribute names carry a marker string, reloads, and checks that neither the `d` values nor
    the marker appear in `server.log`, Settings or the diagnostics text.
- **What other places see.** The label "You" and the ID `plug:you` appear in `config.json`,
  `plugins-state.json` and Settings. These are names, not likeness. The art is sent to the page
  only in `state_info`, behind the window token (`server.py:6033`).
- **No disk cache.** `_json` sends no `Cache-Control` (`server.py:6016-6022`). It gains
  `Cache-Control: no-store`, one line covering every API answer, so the window's browser
  profile doesn't keep `state_info`, and the art in it, on disk. That covers the HTTP cache only;
  the page holds the art in memory while it runs.
- **Home backups and sync:** the user confirmed `~/.local/share` isn't backed up or synced off the machine, so
  "only in that folder" holds. If a backup is added later, it must leave this folder out.
- **Fit-checking it stays local.** `node tests/character_fit.mjs <port> <url> char plug:you`
  (`tests/character_fit.mjs:1-3`) runs on the user's machine against the live folder. CI tests
  a synthetic fixture: a plain circle with two dots. No screenshot of "You" goes in
  `assets/demo/` or `docs/`.

### 3. A plugin can fire a reaction

This needs #208's reaction player and calm gate. Slice B waits for #208 to merge.

`plugin.json` gains an optional `reactions` list. It uses the same literal matching as
`notifications` (`plugins.py:131-141`), with no regex:

```json
"reactions": [
  {"app": "jellyfin", "reaction": "video"},
  {"host": "*.sonarr.lan", "reaction": "news"}
]
```

- **What fires it:** a notification whose app or host matches. Only the app and the host are
  read, never the summary or the body. The match runs in `Inbox.tick` (`server.py:2263`), where
  each row from `Inbox.rows` (`server.py:2239`) is handed to the page, next to `Plug.category`
  (`server.py:1856`). It sets one field on the row, `reaction`, and nothing else changes.
  - **The server sets it, and only the server.** Any `reaction` key in the shell's output is
    dropped first.
  - **Once per notification:** a row's `key` that has already had a reaction never gets
    another, so a repeated or updated row doesn't replay it.
  - **Several plugins matching:** the first in scan order wins.
  - **The app name isn't proof.** Any local program can send `notify-send -a jellyfin`. That
    is why the allowlist below holds only harmless reactions.
- **What it may name:** an allowlist of #208's reaction IDs: any notification, music, video
  and news. Agent states (needs approval, approved, denied, finished, commit), machine states
  (load, memory, error, host up, rebuild) and calendar states are refused by the loader. A
  plugin could otherwise fake "approved" or "rebuild succeeded". The exact IDs come from #208's
  spec.
- **It only adds.** The row keeps its category, text, bubble, envelope, TV and sound, as the
  intent's "Must: nothing that exists today is removed" requires. #215's pinning tests stay
  green. The page plays the reaction after today's handling, through #208's gate: DND,
  fullscreen, a meeting, the lock screen, reduced motion, and the global reactions switch
  (intent Q5).
- **Calm:** at most one reaction per plugin every 5 minutes, held in the server and counted
  when it's sent, whether the page's gate then plays it or not. A chatty service can't make him
  dance.
- **Fits:** the reaction's prop follows the body's `fits` (`bodyFits`, `index.html:1300`). A
  prop that doesn't fit is left out, and the eye mood and movement still play. This is #208's
  rule for every reaction; slice B only relies on it.
- **Art:** #208's built-in reaction props only. A plugin can't add reaction art, CSS or
  timing, because #149 has no plugin CSS or JS. On a plugin character, the reaction shows its
  shared prop without a per-character touch.
- **Consent:** a reaction map is data-only, like a notification map, so it starts on with
  its plugin. Settings shows "Reacts to notifications from some apps or sites", and the
  plugin's switch turns it off. Nothing runs.

### 4. Slices (each its own PR)

- **A, the character kind and "You":** §1 and §2, the synthetic fixture and its tests. Then,
  outside any PR, the "You" folder written on p620 by hand.
- **B, plugin reactions:** §3, after #208 merges.

## Alternatives rejected

- **"You" as a fifth built-in character.** Puts the likeness in a public repo and the store.
- **"You" in `nixos_config` through `services.nixi.companion.plugins`.** That repo is public,
  and the option copies the plugin into the world-readable store.
- **Encrypting the art with agenix or sops.** It decrypts into the store or `/run`, and adds a
  secret path for something a mode-0700 folder already protects.
- **A plugin character drawn from markup or an image** (`<image>`, `innerHTML`). That is a
  new trust path. #178 §7 required sanitised nodes.
- **Free per-plugin metrics** (its own face box and anchors). Every value needs bounds and a
  fit check, and moving the face box breaks the shared eye rig. One fixed template covers
  "You", and another can be added if it's needed.
- **Gradients in plugin art.** They need ID rewriting (#149, rejected there too). Flat colours
  first.
- **Reactions fired by a stage program, or by a local HTTP endpoint.** A stage runs only when
  you ask, and an endpoint needs its own token and rate limit. Notifications are already the
  path a service like the media stack takes to reach the desktop.
- **Plugins naming any reaction.** That would let one fake approval or system states.

## Risks

- **The likeness already sits in a public repo, so the privacy rule isn't met today.** `mockups/206/claude-react.json`,
  `characters.html` and `reactions-brief.md`, pushed on `feat/206-character-friends` of the
  public nixi-nixarchy, hold the drawn "me" art and a written description. The intent's text
  describes it too. This spec stops further publishing. The user had the history rewritten (see Decided);
  the old commits stay reachable by hash until GitHub support purges them, and any copy already fetched
  stays readable.
- **Home backups and sync** would copy the folder wherever they go. None today (see Decided).
- **Face art over the eyes:** the template's face box is the Devil's, so art drawn inside it
  hides the eyes. The local `char plug:you` run checks it.
- **#208 not specced yet:** slice B depends on #208's reaction IDs, gate, player and its
  handling of `fits`. Slice B's spec section is reviewed again once #208's spec is approved.
- **Merge conflicts in `index.html`** with #208 (reactions) and #214 (cards). Slice A touches
  only the character registry, `setCharacter`, `miniNixi` and the Look grid.
- **Hosts:** p620 for the live checks. razer only if the user copies the folder there.

## Verification

- **Unit tests (`plugins.py`, `server.py`):**
  - a character manifest passes;
  - a bad `template`, a `fits` outside the template, a bad `ball` `d`, a missing art file, and
    art with a gradient or `class` each reject it;
  - `private` from the package directory is refused, and `check_dir` fails on it;
  - `private` with group- or other-readable files is refused;
  - `look()` accepts `plug:<id>` only for a loaded character;
  - `voice_by_character` accepts a loaded `plug:` ID and refuses an unknown one;
  - `private` with a file owned by another user is refused;
  - an unknown key inside `character` rejects it;
  - character art with `<script>`, `onload`, `href` or `url()` is refused (the sanitiser's own
    cases, run through the new path);
  - switching the plugin off, deleting its folder or breaking its art makes `look()` fall
    back to snowflake;
  - every API answer has `Cache-Control: no-store`;
  - reactions:
    - literal app and host matches, `*.suffix`, and refusal of a reaction outside the
      allowlist;
    - a `reaction` key in the shell's output is dropped;
    - the same row key twice reacts once;
    - two matching plugins give one reaction;
    - the 5-minute limit;
    - the row's category and text unchanged.
- **No-log test:** with a synthetic private character loaded and a reload done, its `d`
  values appear in neither `server.log` nor the diagnostics text.
- **Page tests:**
  - `character_fit.mjs char plug:fixture` for the synthetic character: the face box, the
    surface, the bar state (#178's cases);
  - a label `<b>x</b>` shows as text in the Look grid;
  - art drawn outside the body limits is clipped;
  - after a reload without the plugin, no `plug:` entry is left in `CHARACTERS` or the grid.
- **#215's message pinning tests** pass unchanged (slice B).
- **Nix:** `mkCompanionPlugin` on a `private` plugin fails the build.
- **Live on p620,** after a deploy the user approves:
  - slice A: "You" shows in Look and wears the scarf but no hat. It blinks and talks, and its
    voice can be set. `char plug:you` passes locally. `git status` in every repo shows nothing of it;
  - slice B: a test plugin mapping `notify-send -a nixi-test` to "news" plays the reaction
    once, not again within 5 minutes, and not under DND, fullscreen, the lock screen or reduced
    motion. A message and an email still show exactly as before.

## Decided (2026-11-07, by the user)

- **The published likeness:** history rewritten. The "You" art and its written description are gone from
  `mockups/206/` and the intent on every public branch (force-pushed). The old commits stay reachable by hash
  until GitHub support purges them; that request is the user's.
- **Backups:** `~/.local/share` is not backed up or synced off the machine, so the folder needs no exclusion.

## Open questions

1. **Where does "You" live?** Recommended: only in `~/.local/share/nixi-companion/plugins/you/`
   on p620, written there by hand. The intent's "nixos_config" isn't private: that repo is
   public. **Also on razer?** Recommended: p620 only for now; copy it by hand later if wanted.
2. **Which services fire reactions first?** The intent names the media stack. Recommended: a
   plugin mapping your Jellyfin or *arr notifications to "video" and "news", written after #208.
3. **Minor, out of scope:** #149 spec §1 says plugins come from `$NIXI_PLUGIN_DIRS`. The code
   links them into the package instead (`plugin_dirs`, `plugins.py:55-57`, and
   `nix/hm-module.nix:29`). The #149 spec is stale there.

## Reviews (2026-11-07)

Codex reported `gpt-6.1-sol`; agy reported no model. Both read this draft and code excerpts
from `origin/main` 8f2275e, read-only. Their findings don't approve anything.

**Codex, confirmed and applied:**
- The build check runs after Nix has copied the source into the store, and the option takes
  ready-made derivations (`nix/plugin.nix`, `hm-module.nix:31`). §2 no longer claims it keeps
  the art out of the store.
- The published mockups break the privacy rule today. It is now a risk, not a footnote.
- `no-store` and backups belong in the privacy design. `no-store` moves into §2; backups were
  answered by the user (see Decided).
- Sanitiser reasons can carry content (`plugins.py:446`, `:466`, `:478`). Private plugins get
  fixed error strings.
- Reaction replay, an injected `reaction` field, and several matching plugins: now handled by
  row key, by the server setting the field, and by first match in scan order.
- Reaction props must follow `fits`: stated in §3 as #208's rule that slice B relies on.
- `ball` wrote unbounded coordinates outside the clip (`index.html:1309`). `ball` is now part of
  the template.
- An owner check and a stated threat boundary were added to the mode check.
- Stale characters after a reload, and the flat fill in `miniNixi` (`index.html:1255-1257`).
- The verification gaps listed above.
- Notification app names aren't authenticated: added to §3.

**Codex, partly confirmed:** checks that race between scan and read. A swap needs write access
to the user's own folder, which is outside the boundary in §2, so no change was made.

**agy, confirmed:** the Look grid renders `${c.label}` without escaping (`index.html:3543`).
The draft had already found this and wraps it in `esc()`.

**agy, refuted:**
- That `private`, `character`, `reactions`, the mode check, `plugin_characters`,
  `has_character`, the `plug:` path in `look()`, the capability line, the allowlist and the rate
  limit are missing from the code. They are what this spec adds. Not a defect.
- That `sanitize_svg` allows gradients and `class`. `GEOMETRY` has no gradient element, and any
  attribute not listed raises "attribute not allowed" (`plugins.py:388-390`, `:446`).
- That a private plugin in the package directory isn't refused. §2 refuses it by the folder's
  position, whether or not it is in the store.
