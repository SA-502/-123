# GRAVEWAVE — Last Night at Lumina Pier

An original round-based zombie survival game for the browser. Top-down HTML5 Canvas, zero dependencies, zero build step, all audio synthesised at runtime with the Web Audio API.

## Play

Open `index.html` in a desktop browser (Chrome, Edge, Firefox or Safari). Keyboard and mouse required.

Or serve the folder:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse / `LMB` | Aim / fire |
| `Shift` | Sprint (drains stamina) |
| `R` | Reload |
| `F` | Buy / interact (hold to rebuild barricades) |
| `Q`, wheel, `1` `2` | Swap weapon |
| `V` / `RMB` | Knife |
| `G` | Grenade |
| `Esc` / `P` | Pause (volume sliders) |
| `M` | Music on/off |

## How it works

- **Rounds** — horde size, zombie health and speed follow the classic survival curves: health +100 per round then ×1.1 compounding from round 10, a 24-base horde scaled by a round multiplier, spawn delay decaying 5% per round, and a rising speed roll that turns walkers into runners into sprinters. At most 24 are alive at once.
- **Points** — 10 per hit, 60 per kill, 100 for a critical kill (put the shot through the centre of the target), 130 for a knife kill. Points buy everything.
- **Map** — a central plaza plus four locked zones (arcade, aquarium, speedway, substation) and the Overclock Stage, linked by seven buyable doors that form loops. Zombies tear through 26 barricaded windows that you can rebuild.
- **Weapons** — 13 guns: a starting pistol, six wall-buys, and crate-only weapons including two wonder weapons. The Prize Crate rolls a random weapon and will eventually relocate.
- **Power** — throw the switch in the Substation to bring the park (and the full soundtrack) to life, enable perk machines and open the Overclock Stage.
- **Overclocker** — 5000 points upgrades the weapon in hand: more damage, bigger magazine, faster fire, laser tracers, new name.
- **Perks** — Thick Skin (health), Quick Hands (reload), Afterburner (movement), Twin Trigger (fire rate), Second Wind (cheat death once, burns all perks).
- **Power-ups** — Full Reload, Overkill, Double Score, Purge, Board Up.
- **Special rounds** — every few rounds the lights go out and Shriekers attack; brutes join the horde from round 8.

## Code layout

| File | Responsibility |
| --- | --- |
| `js/config.js` | Tuning constants, round math, weapon / perk / power-up data |
| `js/utils.js` | Math helpers |
| `js/art.js` | Glow sprites, weapon silhouettes, icons |
| `js/audio.js` | Procedural SFX and the synthwave sequencer |
| `js/input.js` | Keyboard and mouse state |
| `js/map.js` | Tile map, zones, doors, collision, raycasts, flow-field pathfinding |
| `js/mapart.js` | Pre-rendered floor, wall and neon layers |
| `js/fx.js` | Particles, tracers, lightning, popups |
| `js/weapons.js` | Hitscan, projectile and chain-lightning fire modes, explosions, grenades |
| `js/zombies.js` | Zombie AI, damage and death |
| `js/director.js` | Round pacing, spawn selection, drops |
| `js/player.js` | Movement, combat input, health, perks, loadout |
| `js/interact.js` | Doors, wall-buys, crate, perks, power, Overclocker, barricades, power-ups |
| `js/render.js` | Camera, entities, dynamic lighting, emissive pass |
| `js/hud.js` | HUD |
| `js/game.js` | State machine and main loop |

`GW.debug` in the console exposes test helpers (`give(n)`, `power()`, `openAll()`, `weapon(id)`, `god`).
