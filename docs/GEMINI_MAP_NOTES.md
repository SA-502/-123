# Gemini Map #2 — Dustline Outpost (`js/map_gemini.js`)

> **Ownership Note for Claude Code:**
> The following files belong to **Gemini's Map #2 (Dustline Outpost — Non-Neon Desert Compound)** and are kept cleanly separated from Claude's original `Lumina Pier` map (`js/map.js` & `js/mapart.js`):
>
> - `js/map_gemini.js` — Complete Map #2 layout (96×72 tiles, 9 desert compound zones, 12 doors, 39 windows, 11 risers, 9 generators, 27 fuse spots, 9 wall-buys, 5 perks, 6 mystery crates, 3 traps, safe room, 4 tunnel pads, 6 vendors) + its own non-neon desert Canvas renderer (`buildArt()`).
> - `assets/gemini_map/` — 5 custom non-neon 384×384 `.webp` seamless textures (`sandstone.webp`, `concrete.webp`, `asphalt.webp`, `wall_top.webp`, `oasis.webp`).

## Minimal Hooks Added to Core Files
To keep Lumina Pier 100% untouched while enabling the Map Selector on the Title Screen:
1. `index.html` — Added `<script src="js/map_gemini.js"></script>` right after `js/mapart.js`, plus a 2-button Map Selector (`LUMINA PIER` / `DUSTLINE OUTPOST`) above `START SHIFT`.
2. `js/map.js` — Added `M.activeMap` (`'lumina'` or `'gemini'`, persisted in `localStorage`) and a 2-line dispatch at the top of `M.build()` to call `GW.Maps[M.activeMap].build()` when a custom map is active; resets `M.theme = null` for Lumina Pier.
3. `js/mapart.js` — Added a 2-line dispatch at the top of `MA.build()` to call `GW.Maps[M.activeMap].buildArt()` when active.
4. `js/render.js` — Added a 3-line check for `M.theme` in `drawLighting()` so Dustline Outpost renders with warm golden-dusk ambient visibility (`rgba(28,17,9,...)`) instead of dark purple neon.
5. `js/game.js` — Wired the Map Selector buttons (`#map-lumina`, `#map-gemini`) and dynamic start announcement (`DUSTLINE OUTPOST` vs `LUMINA PIER`).
6. `js/i18n.js` — Added Arabic translations for Dustline Outpost and all 9 desert zones.
7. `css/style.css` — Added Arabic web-safe font fallbacks (`Cairo`, `Tajawal`, `Tahoma`, `Arial`) so Arabic text no longer renders as `□□□□`, plus styles for the Map Selector buttons.
8. `assets/manifest.json` — Registered the 5 `gemini_*` textures under `assets/gemini_map/`.
9. `server/sim.js` — Added `'map_gemini'` to `LOGIC` so Co-Op server simulation stays in sync.
