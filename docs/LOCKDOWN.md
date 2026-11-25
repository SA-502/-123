# Overclocker lockdown: the map contract

Players asked for time to upgrade in peace, so the first Overclocker (`M.pap`) purchase of each round
seals the machine's room for 30 seconds. The code is generic and lives in `js/facilities.js`;
a map only describes its room.

## What a map must set

In its `build()` function, after the walls, props and doors are in place:

```js
M.papRoom = {
  x0: 26, y0: 34, x1: 37, y1: 38,          // the room's interior, TILE coordinates, inclusive
  gates: [ { tx: 30, ty: 33 }, { tx: 31, ty: 33 }, { tx: 32, ty: 33 }, { tx: 33, ty: 33 } ],
};
```

- `x0, y0, x1, y1`: the interior rectangle that counts as "inside". The Overclocker (`M.pap`) must be in it.
- `gates`: every tile that has to close for the room to be sealed. They are ordinary `TT.FLOOR` tiles the rest
  of the time (do not make them doors). Neighbouring gate tiles form one doorway; a room may have several
  doorways, but keep it to one or two.
- Every other way into the rectangle must be wall: no barricaded windows (`M.windows`), no ground risers
  (`M.risers`) and no other openings inside or on the edge of the rectangle. Zombies come in through windows and
  risers no matter what, so a window there would break the lockdown.
- Put at least one walkable tile outside each doorway, ideally two in a straight line (the horde waits there).
  A power gate (`M.gate`) just outside the doorway is fine: the room can only be powered once it is open.

Don't set `M.papRoom` (or set it to `null`) and the lockdown is simply off for that map. `M.build()` resets it to
`null` before every build, so a value from a previous map never leaks.

Current maps:

| Map | Room | Doorway |
| --- | --- | --- |
| Lumina Pier (`js/map.js`) | Overclock Stage, x26..37 y34..38 | x30..33 y33, the corridor under the power gate |
| Dustline Outpost (`js/map_gemini.js`) | Command Bunker, x29..40 y36..40 | x33..36 y35, the corridor under the power gate |

## Other facility fields a map must still set

`render.js`, `hud.js` and `mapart.js` read these on every map, so a new map needs them even if it doesn't use the
feature:

- `M.safeRoom` (panic room): `rx, ry, rw, rh` (pixels), `door` (tile list), `dx, dy, dw, dh`, `outside {x, y}`,
  `console {tx, ty, fx, fy}`, `hatch {tx, ty}`, `exit {tx, ty}` (where the maintenance hatch comes out; falls back to
  `M.spawn`), and the state fields `state: 'open', t: 0, cd: 0, warned: false, bangT: 0, hatchT: 0`.
- `M.traps`: an array, normally one trap (`kind` 'zap' | 'fire' | 'laser', floor rect `x, y, w, h` in tiles, wall
  switch `sw {tx, ty, fx, fy}`, optional `hint` text and optional `sweep: { band, speed }` for a moving band of
  fire along the rect's height), plus the derived `rx, ry, rw, rh, id, state: 'idle', t: 0, playerT: 0, sfxT: 0`.
  Include `M.traps.map((t) => t.sw)` in the loop that sets `x, y` on wall items. `M.build()` resets it to `[]`.
- `M.pads`: teleporters were removed. `M.build()` always sets it to `[]`; maps must not add pads.

Any new player-visible text (a trap `hint`, zone names) needs an Arabic entry in `js/i18n.js`.

## How it plays

1. The round's first Overclocker purchase (the 5000/10000/15000 payment) seals the room: the gate tiles become
   `TT.DOOR` (solid for players and zombies, blocks bullets and grenades), and each doorway is added to `M.doors`
   as a door with `lock: true`, so the renderer draws it as a closed shutter. Its `cost` field holds the seconds
   left, which is what the price tag over the shutter shows (above "LOCKED").
2. Anyone standing on a gate tile is pulled inside. Zombies inside are killed (a boss is thrown out). While sealed,
   anything that ends up inside is moved back out.
3. While every living player is inside, the horde's flow field leads to the doorway instead (like the panic room),
   so it piles up outside and nothing spawns or paths into the room (its tiles are unreachable). In co-op, players
   locked in are left out of the flow field: the horde hunts the teammates outside.
4. The HUD shows a `LOCKDOWN nn` pill and the minimap outlines the room. 5 seconds before the end a siren and a
   "DOORS OPENING" banner warn you. Then the shutters blow open with a shockwave that throws back and dazes the
   waiting horde (no damage).
5. Upgrades stay for sale; later purchases that round only show "Lockdown used — next round" (the prompt says the
   same beforehand). The next round (`GW.Director.round`) it is available again.

Tuning is at the top of `js/facilities.js` (`LOCK`: `duration` 30, `warn` 5, `blastR`, `daze`).

## Co-op

The buyer's game sends `{ t: 'lock', r: round }`. The server copy of the game (`server/sim.js`) and every other player
run the same lockdown from it (`GW.Facilities.lockRemote`), each with its own 30 s timer. Only the host / server
moves or kills zombies; every player's own game keeps its own player in or out.

## Testing

In the browser console: `GW.debug.power(); GW.debug.openAll(); GW.debug.give(50000)`, walk to the Overclocker and
press F. `GW.Map.papRoom` shows `state`, `t` and `round`; `GW.Facilities.flowGoal()` returns the doorway while you
are sealed in.
