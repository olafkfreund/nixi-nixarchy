

* **Terminal design**: Frames the face inside a compact retro CRT monitor on a mini keyboard stand; the recessed dark phosphor screen gives high contrast for the eyes at 120–340 px while a corner `>_` prompt blinks steadily.
* **Robot design**: Replaces the hexagon with a smooth, friendly slate-blue head and a dark visor plate that houses the eyes like glowing optics, topped with a cyan antenna bulb that pulses in and out.
* **Devil design**: Uses a warm berry-crimson silhouette with stubby amber horns, tiny bat wings, a single-fang smirk, and a spade tail that swishes playfully behind the body.
* **Identical eye geometry & theming**: Every character keeps the exact two-oval eye rig (`cx="±24" cy="-6" rx="16" ry="26"` for whites, `rx="9.5" ry="15.5"` for pupils) styled via `var(--white)` and `var(--pupil)`, so user colour overrides and all existing gaze, squint, talk-swell, and blink transforms work unchanged.
* **Swapping bodies in code**: Structure the SVG into three layers—`<ellipse class="floor-shadow">`, `<g id="body-back">`, `<g id="eye-rig">`, and `<g id="body-front">` (for screen glare or brows)—so switching characters is just swapping the static body template around the live code-driven `<g id="eye-rig">`.
