# Map #3 — Frostfall Junction (`js/map_frostfall.js`)

A snowbound mountain railway junction at midnight, built for the "new map" feedback: a smaller, curated set
of wall guns with clear progression, no teleporters, exactly one trap, side quests and real (CC0) textures.
Original design. Picker: `FROSTFALL JUNCTION NEW` on the title screen; Lumina Pier stays the default.

## Layout (96 x 72 tiles)

```
            +------------------- THE PLATFORMS (1) --------------------+
            |  platform 1 / track 1 (stalled night train) / island /    |
            |  track 2 / platform 2      (Night Express runs here)      |
            +-----+ door 750 +----------------------+ freight ramp 1250 +
 MARKET     |     |          |                      |      |
 STREET (2) +-750-+ GRAND CONCOURSE (0) +--1000--+ FREIGHT YARD (3) +-1500-+ FROZEN LAKE (6)
 (stalls)   |     |   start, clock tower |        | containers, spur |      | ice sheet, island
            |     +----------------------+        +------------------+      | bandstand to circle
            |        ENGINE SHED (5) Overclocker          |                 +
  safe room +-1250- BOILER HOUSE (4) --- power gate ---1250-+
```

| id | Zone | Opens from | Cost |
|---|---|---|---|
| 0 | Grand Concourse | start | — |
| 1 | The Platforms | concourse (north) | 750 |
| 2 | Market Street | concourse (west) | 750 |
| 3 | Freight Yard | concourse (east) 1000, platforms "freight ramp" 1250 | |
| 4 | Boiler House | market 1250, freight yard 1250 — power switch zone (`M.Z.SUB`) | |
| 5 | Engine Shed | power gate from the Boiler House (`M.gate`), Overclocker room (`M.Z.VAULT`) | power |
| 6 | Frozen Lake | freight yard (east) | 1500 |

Two training loops: north (Concourse -> Platforms -> freight ramp -> Freight Yard -> Concourse) and south
(Concourse -> Market Street -> Boiler House -> Freight Yard -> Concourse). The Frozen Lake is a big dead-end
arena with a 4x4 bandstand on an ice sheet in the middle: 7-tile lanes all round it for circling the horde.
Every corridor and door is 4 tiles wide. Zone ids 4 and 5 are fixed because `interact.js`/`render.js` use
`M.Z.SUB` (its generator opens `M.gate`) and `M.Z.VAULT` (Overclocker power); id 6 = `M.Z.FERRIS`, so the
map moves `MapArt.WHEEL` off the map (and restores Lumina's wheel when Lumina is drawn again).

## Contents

* **Wall-buys (7)**: Ranger 750 + Bulldog 750 (concourse), Buzzsaw 1250 (market), Kestrel 1750 (platforms),
  Riptide 2000 (freight yard), Sixgun 1750 (boiler house), Anvil 3000 (frozen lake).
* **Perks (5)**: Second Wind (concourse), Quick Hands (market), Afterburner (platforms), Thick Skin (freight
  yard), Twin Trigger (boiler house). One generator per zone (7), 23 fuse spots.
* **Prize Crate**: 5 spots (market, platforms, freight yard, boiler house, lake).
* **Vendors (2)**: armour (concourse), cryo grenades (market).
* **Panic room**: alcove under Market Street, shutter at x19, hatch out to the concourse.
* **Overclocker lockdown** (`docs/LOCKDOWN.md`): `M.papRoom` = Engine Shed x29..42 y38..43, one 4-wide
  doorway at y44 (power gate below it at y45). No windows or risers on or in the room.
* **The one trap — the Night Express** (`kind: 'zap'`, switch on the platforms' south wall next to the
  concourse door, 1000): while idle its plate is the whole platform hall (that is what the minimap shows).
  Switched on, a 3-tile-wide wall of lightning storms from one end of the platforms to the other and back
  (9 tiles/s, ~4 passes in 25 s) and kills whatever it crosses; the overload at the end hits the band.
  Lead the horde onto the platforms, step into the concourse doorway or the freight ramp (outside the
  plate) and hit it. `GW.Maps.frostfall.update` slides the rect (`tr.slide`); `game.js` calls a map's
  `update(dt)` just before `Facilities.update`, so damage always uses the current band.

## Side quests (`js/quest_frostfall.js`)

* **The Three Relics**: Cryo Core, Coil Barrel and Frost Stock each spawn at one of three spots per game
  (seeded, so co-op players and the server agree), marked by a faint glint and a small cold light. The team
  shares them: mount them on the **workbench** in the Boiler House, an 8 s forge, then every player takes a
  **Frostbite** (Quasar Blaster, overclocked tier I, Frost mod) for free, once each.
* **The Signal Lamps**: three dead brass lamps hang under the walls (Market Street top-right, far end of
  platform 1, Frozen Lake north shore). Shoot all three: the whole team gets **Pack Mule** — carry three
  weapons (Q / swap button cycles, key 3 picks the third).
* A **notice board** in the concourse (F) hints at both and shows progress. The HUD objective line switches
  to the quest steps once the power is restored.
* Co-op: `{ t: 'quest', a: 'relic' | 'mount' | 'lamp', i }` messages (net.js case `quest`), applied by every
  player and by the server copy of the game. Reward weapons and Pack Mule are applied by each player's own game.

## Hooks outside the map files

* `index.html`: picker button + `<script>` tags for `map_frostfall.js` (after `map_gemini.js`) and
  `quest_frostfall.js` (after `interact.js`).
* `js/game.js`: picker generalised to three maps; two update hooks (map `update`, `GW.Quest.update`).
* `js/interact.js`: `GW.Quest.reset` at the end of `Interact.reset`, a `GW.Quest.objective` override at the
  top of `Interact.objective`, and the power-gate text uses `M.gate.name` instead of "Overclock Stage".
* `js/net.js`: `case 'quest'`. `server/server.js`: `'frostfall'` in `MAPS`. `server/sim.js`: `map_frostfall`
  and `quest_frostfall` in `LOGIC`.
* `js/i18n.js`: Arabic for every new string. `assets/manifest.json`: the ten `ff_*` textures.

## Testing

`GW.debug.openAll(); GW.debug.power(); GW.debug.give(50000)`. `GW.Quest.relics` lists this game's relic
spots, `GW.Quest.lamps` the lamps, `GW.Map.traps[0]` the Night Express. Headless: `new (require('./server/sim.js').Sim)(seed, [1], () => {}, 'frostfall')`.
