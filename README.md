# GRAVEWAVE — Last Night at Lumina Pier

An original round-based zombie survival game for the browser. Top-down HTML5 Canvas, zero dependencies, zero build step, all audio synthesised at runtime with the Web Audio API.

## Play

**Online:** https://game.srv2082532.hstgr.cloud — works on desktop (keyboard + mouse) and on phones (touch). On a phone, play in landscape; use **Add to Home Screen** to install it and open it full screen.

**Locally:** open `index.html` in a desktop browser (Chrome, Edge, Firefox or Safari).

Or serve the folder:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Controls

On touch screens the left thumb moves (the stick stays inside its ring; push your thumb past the dashed outer ring to sprint) and the right thumb aims and fires, with a gentle aim assist. A fire-mode button (title screen and pause menu) switches between **drag to shoot** and **tap to shoot**, where touching the right side fires straight away at the nearest zombie. DASH slides. Tap the minimap for the big map. USE lights up when there is something to buy; hold it to rebuild a barricade. RELOAD, SWAP, NADE, TAC, KNIFE, SENTRY and pause are on-screen buttons.


| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse / `LMB` | Aim / fire |
| `Shift` | Sprint (drains stamina) |
| `R` | Reload |
| `F` | Buy / interact (hold to rebuild barricades) |
| `Q`, wheel, `1` `2` | Swap weapon |
| `V` / `RMB` | Knife (turns you toward the closest zombie in reach, even behind you) |
| `Space` / `C` | Slide (dash) — you can shoot during it |
| `Tab` | Big map |
| `G` | Grenade (frag) |
| `T` | Tactical grenade (Cryo / Lure / Bubble) |
| `X` | Deploy a carried Hover Sentry |
| `Esc` / `P` | Pause (volume sliders) |
| `M` | Music on/off |

## How it works

- **Rounds** — horde size, zombie health and speed follow the classic survival curves: health +100 per round then ×1.1 compounding from round 10, a 24-base horde scaled by a round multiplier, spawn delay decaying 5% per round, and a rising speed roll that turns walkers into runners into sprinters. At most 24 are alive at once.
- **Points** — 10 per hit, 60 per kill, 100 for a critical kill (put the shot through the centre of the target), 130 for a knife kill. Points buy everything.
- **Map** — a central plaza plus seven locked zones (arcade, aquarium, speedway, substation, Starwheel Plaza with its Ferris wheel, the maze-like Nightmare Manor, and Pier Nine over open water) and the Overclock Stage, linked by eleven buyable doors that form loops. Zombies tear through barricaded windows you can rebuild, and climb ladders out of the water at the pier.
- **Weapons** — 19 weapons: a starting pistol, nine wall-buys, and rare crate-only weapons: the Thumper grenade launcher, the Ripper minigun, two blades (Neon Katana and Fire Axe, which cut several zombies per swing and deal a share of their max health), and four wonder weapons (Quasar Blaster, Arc Caster, Photon Ray and the Dragon's Breath flamethrower). The Prize Crate rolls a random weapon and will eventually relocate.
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

## Server (Hostinger VPS)

`server/server.js` is a dependency-free Node server that serves only the public game files. `server/docker-compose.yml` runs it as the `gravewave` Docker project on the VPS, behind the existing Traefik proxy, which provides HTTPS for `game.srv2082532.hstgr.cloud`. The container clones the latest commit of the branch on every start, so **restarting the project deploys the newest version**.

## Maps

Pick the map on the title screen: **Lumina Pier** (`js/map.js` + `js/mapart.js`) or **Dustline Outpost**, a desert compound made by Gemini (`js/map_gemini.js` + `assets/gemini_map/`, notes in `docs/GEMINI_MAP_NOTES.md`). In co-op everyone plays the room leader's map: it travels with the start message and the server's copy of the game builds the same one.

## Playing at home (same Wi-Fi)

Co-op has two servers, picked in the CO-OP screen: **Online** (the VPS above, play from anywhere) and **Home** (a computer on your own Wi-Fi, for players in the same place: lower lag, works without internet).

1. On a computer on the Wi-Fi, install [Node.js](https://nodejs.org) (LTS) once, and download this repository (Code > Download ZIP, then unzip).
2. Double-click `play-at-home-windows.bat` (Windows) or `play-at-home-mac.command` (Mac). It prints an address like `http://192.168.1.5:8080`.
3. On each phone (same Wi-Fi): open the game, CO-OP > HOME · SAME WI-FI, type that address and press GO (or open the address in Safari directly). Then create / join a room as usual.

Keep the window open while you play. If phones can't connect, allow Node.js through the computer's firewall when asked.

## Performance

The simulation runs in fixed 1/60 s steps and rendering interpolates between them. Press **F3** (or tick *Show FPS* in the pause menu) for a frame-rate meter; resolution adapts automatically to hold 60 fps.

## Art

Environment and UI images are produced by a separate art agent following `docs/ART_BRIEF.md` (task: `docs/GEMINI_TASK.md`). They live in `assets/` with `assets/manifest.json`; any missing image falls back to the procedural art. Weapon icons (`assets/weapons/`) and top-down zombie sprites (`assets/zombies/`) were cut from Nano Banana renders on a green screen with `tools/prep_sprites.py`; Overclocked weapons are tinted in code.
