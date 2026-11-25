# Updating Dustline Outpost: instructions for Gemini

> **For the developer:** give this file to Gemini as is. It explains what changed in the game since Gemini's copy and exactly what the updated map must contain to work with the latest version.

## 1. Start from the latest version, not the old copy

The zip you sent (`the-II-zombie-game-claude-friendly-goodall-njen4s`) is a full copy of an **old** version of the repository (around commit `b697811` / `4dc654f`). Since then, these files have changed a lot: `render.js`, `art.js`, `audio.js`, `config.js`, `weapons.js`, `zombies.js`, `director.js`, `player.js`, `fx.js`, `facilities.js`, `interact.js`, `hud.js`, `touch.js`, `net.js`, `game.js`, `index.html`, `css/style.css`, `server/*`.

**Rule:** take the latest version of branch `claude/game-balance-new-map-st8r3f` (repository `SA-502/the-II-zombie-game`) and change **only**:

| File | What is allowed |
| --- | --- |
| `js/map_gemini.js` | Anything (it is your file) |
| `assets/gemini_map/*` | Add or replace images |
| `assets/manifest.json` | Add your images' entries only (e.g. `"gemini_prop_heli": { "file": "gemini_map/prop_heli.png", "w": ..., "h": ... }`) |
| `js/i18n.js` | Add the Arabic for every new text in your map (zone names, signs, trap `hint`) |
| `docs/GEMINI_MAP_NOTES.md` | Your map notes |

Do **not** send whole copies of other files. If you need a small hook in another file (for example a per-map title background in `js/game.js`), describe it in a few lines in `GEMINI_MAP_NOTES.md` and Claude will add it.

## 2. What changed in the game and affects your map

1. **Teleporters removed entirely.** `M.build()` sets `M.pads = []` automatically. Don't add `M.pads` or any tunnel / fast-travel pads.
2. **Only one trap per map.** `M.traps` is an array with **one** entry. Its fields:
   ```js
   M.traps = [
     { kind: 'fire',            // 'zap' | 'fire' | 'laser'
       x: 56, y: 37, w: 3, h: 7, // the trap's floor rectangle, in tiles
       sw: { tx: 55, ty: 40, fx: 1, fy: 0 }, // the wall switch tile and the direction it faces
       sweep: { band: 2, speed: 1.7 },        // optional: a moving band of fire along the rectangle's height
       hint: 'A wall of fire sweeps the tunnel' }, // optional: a line under the banner (needs an Arabic entry)
   ].map((t, i) => Object.assign(t, { id: i, rx: t.x * T, ry: t.y * T, rw: t.w * T, rh: t.h * T, state: 'idle', t: 0, playerT: 0, sfxT: 0 }));
   ```
   And include `M.traps.map((t) => t.sw)` in the loop that sets `x, y` on wall items (vendors, the panic-room console).
3. **New: Overclocker room lockdown.** The round's first upgrade seals the upgrade room for 30 seconds. The map only describes the room:
   ```js
   M.papRoom = {
     x0: 29, y0: 36, x1: 40, y1: 40,   // the room's interior, in tiles (inclusive)
     gates: [ { tx: 33, ty: 35 }, { tx: 34, ty: 35 }, { tx: 35, ty: 35 }, { tx: 36, ty: 35 } ], // the doorway tiles
   };
   ```
   Conditions (important, or the lockdown breaks):
   - The Overclocker machine `M.pap` must be inside the rectangle.
   - The `gates` tiles are ordinary floor (`TT.FLOOR`), **not** doors. One doorway, two at most.
   - **No** windows (`M.windows`), risers (`M.risers`) or any other opening inside the rectangle or on its edge.
   - At least one walkable tile outside each doorway, ideally two in a straight line.
   - A power gate (`M.gate`) just outside the doorway is fine.
4. **Panic room:** add `exit` to `M.safeRoom`, the tile where the maintenance hatch comes out, since teleporters are gone:
   ```js
   M.safeRoom = { ..., hatch: { tx: 14, ty: 40 }, exit: { tx: 26, ty: 25 }, state: 'open', t: 0, cd: 0, warned: false, bangT: 0, hatchT: 0 };
   ```
5. **Weapon balance changed.** Prices and damage come from `js/config.js` (don't change it). Order wall-buys by difficulty: cheap weapons (Ranger, Bulldog = 750) near the start, and the stronger ones (Kestrel, Riptide, Sixgun, Anvil = 3000) further away. Details are in `docs/BALANCE.md`.
6. **Zombies are now animated**, with an optional upright, horizontally-mirrored drawing style. Nothing to change on your side, but leave enough room in corridors (at least 3–4 tiles) so the horde doesn't jam.

## 3. Fields every map must define (all of them)

Compare with `js/map.js` (Lumina) and `js/map_frostfall.js` (Frostfall, the most recent example):
`M.zones` (names + colours), `M.doors` (with zone-to-zone links), `M.windows`, `M.risers`, `M.spawn`, `M.generators` + fuse spots, `M.wallbuys`, `M.perks`, `M.boxSpots` (crate locations), `M.pap`, `M.gate` / `M.powerSwitch`, `M.vendors`, `M.armor` (if present), `M.safeRoom`, `M.traps` (one), `M.papRoom`, and `M.theme` (lighting and colours, as before).

## 4. Testing before you send

1. Open `index.html` in a browser, pick **DUSTLINE OUTPOST**, start a game.
2. In the console: `GW.debug.god = true; GW.debug.give(50000); GW.debug.power(); GW.debug.openAll(); GW.debug.round(10)`.
3. Check: zombies reach you from every zone; there are no teleporters; the trap works; buying an upgrade seals the room for 30 s and then it opens; no red errors in the console.
4. Co-op server: `node -e "const {Sim}=require('./server/sim.js'); const s=new Sim(1,[{id:'a',name:'A'}],()=>{},'gemini'); for(let i=0;i<1800;i++) s.tick();"` must run without errors.

## 5. What to send back

A zip with **only**: `js/map_gemini.js`, the new/changed images in `assets/gemini_map/`, the lines you added to `assets/manifest.json` and `js/i18n.js` (as a text snippet or in the notes file), and `docs/GEMINI_MAP_NOTES.md`.
