# Dustline Outpost — Gemini Update Package (for `claude/game-balance-new-map-st8r3f`)

This package contains **only** Gemini's map files, assets, and registration snippets (no core game files overwritten).

## What's Included
- `js/map_gemini.js` — Rebuilt asymmetric 96×72 Desert Fortress compliant with `docs/GEMINI_UPDATE_GUIDE.md`:
  - **No teleporters** (`M.pads = []`).
  - **One sweeping fire trap** (`M.traps` length 1, `x: 14, y: 34, w: 4, h: 6`, `sweep: { band: 2, speed: 1.7 }`, switch at `(19, 41)` facing north, with `hint`).
  - **Overclocker Room Lockdown (`M.papRoom`)**: `x0: 37, y0: 38, x1: 51, y1: 47`, single 4-wide floor doorway `gates` at `y=37, x=42..45`, `M.pap` inside at `(43, 45)`, `M.gate` power door outside at `y=35`, and **zero** windows or risers inside/on the edge.
  - **Safe Room Hatch Exit**: `M.safeRoom.exit = { tx: 18, ty: 56 }` (walkable Crash Site Gate floor).
  - **Balance-ordered Wall-Buys** per `docs/BALANCE.md`: `ranger` & `bulldog` (750) in Crash Site Gate -> `buzzsaw` (1250) in Checkpoint -> `hornet` (1500) in Oasis -> `kestrel` & `sixgun` (1750) in Airfield/Bazaar -> `riptide` & `boomstick` (2000) in Bunker/Ruins -> `anvil` (3000) in Refinery.
  - **Wide 3–4+ tile corridors** throughout.
- `assets/gemini_map/` — 15 non-neon desert textures & transparent top-down props (`sandstone`, `concrete`, `asphalt`, `wall_top`, `oasis`, `title_bg_desert`, `prop_humvee`, `prop_heli`, `prop_sandbags`, `prop_tent`, `prop_crates`, `prop_barrels`, `prop_oil_tank`, `prop_palm`, `prop_ruin_pillar`).
- `manifest_entries.json` — Exact keys to merge into `assets/manifest.json`.
- `i18n_entries.js` — Exact Arabic entries to merge into `js/i18n.js`.

## Optional Tiny Hook for Claude (if desired)
- To show `assets/gemini_map/title_bg_desert.webp` on the title screen when `M.activeMap === 'gemini'`, toggle a `theme-desert` class on `document.body` in `js/game.js` when picking Dustline Outpost.

## Verification Run
- Passed `node --check js/map_gemini.js`.
- Passed `node -e "const {Sim}=require('./server/sim.js'); const s=new Sim(1,[{id:'a',name:'A'}],()=>{},'gemini'); for(let i=0;i<1800;i++) s.tick();"` with 0 errors.
- Passed full geometry, `M.papRoom` lockdown, `M.safeRoom.exit`, single-trap, zero-teleporter, and Dijkstra reachability validation with 0 errors.
