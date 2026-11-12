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
| `G` | Grenade (frag) |
| `T` | Tactical grenade (Cryo / Lure / Bubble) |
| `X` | Deploy a carried Hover Sentry |
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

### Park facilities and gadgets

| Feature | Where | Cost | What it does |
| --- | --- | --- | --- |
| Zapper Floor, Burnout Jets, Laser Grid | Arcade tunnel, Speedway tunnel, Aquarium corridor | 1000 (power) | 25 s trap that kills anything walking through (brutes take heavy damage), then 60 s recharge. Hurts you too. Trap kills pay 50 |
| Panic Room | Off the arcade tunnel | 1500 | Seals a steel shutter for 20 s while the horde piles up outside. 120 s recharge |
| Cryo Grenade | Aquarium vending machine | 750 for 3 | Freezes everything nearby, then slows it to 40% |
| Neon Lure | Speedway vending machine | 1000 for 3 | Pulls nearby zombies to it for 7 s, then detonates |
| Safety Bubble | Substation vending machine | 1500 for 3 | A 10 s dome zombies cannot enter or attack into |
| Pixel Pal | Arcade terminal (power), or a rare drop | 2000 | Robot buddy that follows you and shoots for 45 s (25 s from the drop). Its kills pay 50 |
| Hover Sentry | Substation terminal (power) | 1500 | Carry it, press `X` to deploy a 40 s auto-turret |
| Plate Armor | Plaza west wall | 1250 | 150 armor that absorbs 70% of incoming damage |
| Teleporters | Plaza ↔ Substation, Arcade ↔ Speedway, Aquarium ↔ Stage | 500 (power) | Instant trip with a shockwave on arrival, 25 s recharge per pair |

Tactical grenades refill by one each round, and Full Reload restocks them.

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
| `js/gadgets.js` | Tactical grenades: Cryo, Neon Lure, Safety Bubble |
| `js/allies.js` | Pixel Pal companion and Hover Sentry |
| `js/facilities.js` | Traps, panic room, teleporters, vending machines |
| `js/player.js` | Movement, combat input, health, perks, loadout |
| `js/interact.js` | Doors, wall-buys, crate, perks, power, Overclocker, barricades, power-ups |
| `js/render.js` | Camera, entities, dynamic lighting, emissive pass |
| `js/hud.js` | HUD |
| `js/game.js` | State machine and main loop |

`GW.debug` in the console exposes test helpers (`give(n)`, `power()`, `openAll()`, `weapon(id)`, `pal()`, `sentry()`, `tactical(type)`, `armor()`, `god`).

`python3 tools/bundle.py out.html` inlines everything into a single page for hosting.
