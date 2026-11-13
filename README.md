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
- **Map** — a central plaza plus seven locked zones (arcade, aquarium, speedway, substation, Starwheel Plaza with its Ferris wheel, the maze-like Nightmare Manor, and Pier Nine over open water) and the Overclock Stage, linked by eleven buyable doors that form loops. Zombies tear through barricaded windows you can rebuild, and climb ladders out of the water at the pier.
- **Weapons** — 13 guns: a starting pistol, nine wall-buys, and crate-only weapons including two wonder weapons. The Prize Crate rolls a random weapon and will eventually relocate.
- **Power** — every zone has its own generator, and each needs a fuse. Nine fuses are hidden at random spots each game (the first Bloater you kill drops a spare). A powered zone gets its lights, neon, soundtrack, perk machine, traps and teleporters; the Substation generator also opens the Overclock Stage.
- **Overclocker** — three tiers per weapon (5000, 10000, 15000): tier I applies the overclocked stats and laser tracers, tiers II and III multiply damage by 2 and 3.5. Each upgrade also loads an ammo mod. The four mods cycle above the machine and you take the one showing: Inferno (burns a share of max health), Arc (chains to neighbours), Frost (slows, then freezes) or Blast (small explosions).
- **Perks** — Thick Skin (health), Quick Hands (reload), Afterburner (movement), Twin Trigger (fire rate), Second Wind (cheat death once, burns all perks).
- **Power-ups** — Full Reload, Overkill, Double Score, Purge, Board Up.
- **Enemy types** — Helmets (round 6+) shrug off critical hits until the helmet breaks; Spitters (8+) keep their distance and lob acid that pools on the floor; Bloaters (10+) swell and burst beside you, and burst when killed; Leapers (12+) crouch, then pounce in a straight line. Brutes join from round 8.
- **Special rounds** — every few rounds the lights go out and Shriekers attack.
- **Boss rounds** — every tenth round The Headliner takes the stage. Its front armour absorbs 80% of damage and the glowing core on its back takes all of it. It charges along a marked lane (and is stunned if it hits a wall), slams the ground in a marked circle, and from its second act fires slow orb volleys and summons help. Killing it pays 2000 points, a free perk and a Full Reload.

### Park facilities and gadgets

| Feature | Where | Cost | What it does |
| --- | --- | --- | --- |
| Zapper Floor, Burnout Jets, Laser Grid | Arcade tunnel, Speedway tunnel, Aquarium corridor | 1000 (power) | 25 s trap that kills anything walking through (brutes take heavy damage), then 60 s recharge. Hurts you too. Trap kills pay 50 |
| Panic Room | Off the arcade tunnel | 1500 | Seals a steel shutter for 20 s while the horde piles up outside. When it opens a shockwave throws them back and dazes them for 3 s, and a maintenance hatch inside leads to the plaza. 120 s recharge |
| Cryo Grenade | Aquarium vending machine | 750 for 3 | Freezes everything nearby, then slows it to 40% |
| Neon Lure | Speedway vending machine | 2000 for 1 | Pulls zombies within a short radius to it for 7 s, then detonates |
| Safety Bubble | Substation vending machine | 1500 for 2 | A 10 s dome zombies cannot enter or attack into |
| Pixel Pal | Arcade terminal (power), or a rare drop | 2000 | Robot buddy that follows you and shoots for 45 s (25 s from the drop). Its kills pay 50 |
| Hover Sentry | Substation terminal (power) | 1500 | Carry it, press `X` to deploy a 40 s auto-turret |
| Plate Armor | Plaza west wall | 1250 | 150 armor that absorbs 70% of incoming damage |
| Teleporters | Plaza ↔ Substation, Arcade ↔ Speedway, Aquarium ↔ Stage, Starwheel ↔ Pier | 500 (power at both ends) | Instant trip with a shockwave on arrival, 25 s recharge per pair |

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
| `js/zombies.js` | Zombie AI for every type, acid hazards, damage and death |
| `js/boss.js` | The Headliner: phases, armour, charge, slam, volleys |
| `js/director.js` | Round pacing, spawn selection, drops |
| `js/gadgets.js` | Tactical grenades: Cryo, Neon Lure, Safety Bubble |
| `js/allies.js` | Pixel Pal companion and Hover Sentry |
| `js/facilities.js` | Traps, panic room, teleporters, vending machines |
| `js/player.js` | Movement, combat input, health, perks, loadout |
| `js/interact.js` | Doors, wall-buys, crate, perks, power, Overclocker, barricades, power-ups |
| `js/render.js` | Camera, entities, dynamic lighting, emissive pass |
| `js/hud.js` | HUD |
| `js/game.js` | State machine and main loop |

`GW.debug` in the console exposes test helpers (`give(n)`, `power()`, `openAll()`, `weapon(id)`, `pal()`, `sentry()`, `tactical(type)`, `armor()`, `fuse(n)`, `round(n)`, `spawn(type, n)`, `god`).

`python3 tools/bundle.py out.html` inlines everything into a single page for hosting.
