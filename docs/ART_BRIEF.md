# GRAVEWAVE — Art Brief (environment & UI)

This is the specification the art agent follows. The game is a top-down, neon synthwave zombie survival game set in an abandoned seaside amusement park at night ("Lumina Pier"). Characters, zombies, the boss in play, weapons, effects and all neon glows are drawn by code and **must not** be produced as images. Images replace the **environment** (floors, props, machines) and the **UI** (title art, logo, app icons, boss intro card).

Every image is optional: if a file is missing or fails to load, the game falls back to its procedural drawing. So it is always safe to deliver in batches.

## 1. Style rules (apply to every image)

1. **Camera:** straight top-down orthographic (looking directly down at the floor, 90°). No perspective, no vanishing points, no horizon, no visible side walls. Objects are seen from directly above, like a floor plan in colour.
2. **Mood:** night-time, retro-futuristic 1980s theme park, slightly run-down and spooky. Original designs only. Do not copy Call of Duty or any other game's art, logos, perk-bottle designs or characters.
3. **Lighting:** keep images **evenly lit and fairly dark** (mid-to-low values). No baked spotlights, no cast shadows, no bloom/glow halos. The game adds its own darkness, shadows, flashlight and neon glow on top. Soft ambient occlusion in corners is fine.
4. **Neon parts** (screens, signs, light strips) may be coloured, but flat, with no glow spilling outside the object.
5. **No text** in any image, except the logo. No watermarks, signatures or UI frames.
6. **Scale:** **96 px = 1 game tile ≈ 1 metre.** Every prop image must match its footprint exactly (sizes below).
7. **Zone palettes** (use as accent colours, not floods):

| Zone | Key | Accent |
|---|---|---|
| Boardwalk Plaza (hub) | plaza | `#ff4fd8` pink |
| Pixel Palace (arcade) | arcade | `#a855ff` purple |
| Deep Six Aquarium | aquarium | `#19d8ff` cyan |
| Burnout Speedway | speedway | `#ff8a1f` orange |
| The Substation | substation | `#c8ff3a` lime |
| Overclock Stage | stage | `#ff3b6b` red-pink |
| Starwheel Plaza (Ferris wheel) | starwheel | `#ffd426` gold |
| Nightmare Manor (haunted house) | manor | `#c9b8ff` pale violet |
| Pier Nine Docks | pier | `#3d8bff` sea blue |

## 2. Formats and budgets

| Kind | Format | Notes |
|---|---|---|
| Floors, water, wall tops, title background | **WebP**, quality ~80 | Floors must tile seamlessly in both directions |
| Props, machines, logo, icons, boss card | **PNG with transparent background** (or lossless/alpha WebP) | Tight crop to the footprint; transparent outside the object |

- Each file **≤ 300 KB**; whole `assets/` folder **≤ 4 MB** (the game runs on phones).
- Exact pixel sizes as listed. Do not upscale small renders; downscale large renders to the exact size.

## 3. Asset list

File paths are relative to `assets/`. The **key** is the name used in `assets/manifest.json`.

### Batch 1 — UI and floors (highest priority)

| Key | File | Size (px) | Description |
|---|---|---|---|
| `title_bg` | `ui/title_bg.webp` | 1920×1080 | Key art for the title screen: the abandoned neon pier park at night, giant Ferris wheel, roller-coaster silhouettes, purple/pink synthwave sky with a striped setting sun, fog, faint zombie silhouettes in the distance. Keep the centre third darker and calm (the logo and buttons sit there). This one image is **not** top-down: it's a cinematic wide view |
| `logo` | `ui/logo.png` | 1600×400 | The word **GRAVEWAVE** in a chrome-and-neon 80s logo style, pink/cyan, transparent background |
| `icon_512` | `ui/icon_512.png` | 512×512 | App icon: a single bold glyph (neon skull inside a Ferris-wheel ring), no text, keep the important part inside the central 80% (Android masks the corners) |
| `icon_192` | `ui/icon_192.png` | 192×192 | Same icon, downscaled |
| `floor_plaza` | `floors/plaza.webp` | 384×384 | Weathered wooden boardwalk planks, purple-grey, running horizontally |
| `floor_arcade` | `floors/arcade.webp` | 384×384 | Dark purple 80s arcade carpet with small neon confetti shapes (triangles, squiggles) |
| `floor_aquarium` | `floors/aquarium.webp` | 384×384 | Glossy dark teal square tiles with thin grout |
| `floor_speedway` | `floors/speedway.webp` | 384×384 | Dark asphalt with subtle grain and small cracks |
| `floor_substation` | `floors/substation.webp` | 384×384 | Riveted steel deck plates, occasional floor grate |
| `floor_stage` | `floors/stage.webp` | 384×384 | Dance floor of dark square panels (4×4 tiles of 96 px), each panel a different deep colour; the game lights panels itself |
| `floor_starwheel` | `floors/starwheel.webp` | 384×384 | Muted red-and-cream checkered promenade tiles |
| `floor_manor` | `floors/manor.webp` | 384×384 | Rotten dark violet floorboards running vertically, gaps, a few nails |
| `floor_pier` | `floors/pier.webp` | 384×384 | Sun-bleached grey-brown deck planks running horizontally, nail dots |
| `water` | `floors/water.webp` | 384×384 | Deep night ocean seen from above, dark blue, gentle wave lines |
| `wall_top` | `floors/wall_top.webp` | 384×384 | Very dark rooftop surface (tar paper / metal panels), almost black with a violet tint |

### Batch 2 — props and machines

Footprint = tiles wide × tiles tall. Image size = footprint × 96 px. Draw the object filling its footprint, seen from directly above.

| Key | File | Footprint | Size (px) | Description |
|---|---|---|---|---|
| `cabinet` | `props/cabinet.png` | 2×4 | 192×384 | A 2×4 block of four arcade cabinets back-to-back (two columns), screens/joysticks facing outwards left and right |
| `tank` | `props/tank.png` | 2×2 | 192×192 | Aquarium tank with water, plants and a few fish |
| `generator` | `props/generator.png` | 2×2 | 192×192 | Industrial power generator with vents and warning stripes |
| `booth` | `props/booth.png` | 2×2 | 192×192 | Ticket booth with a striped pink/white awning |
| `tires` | `props/tires.png` | 5×2 | 480×192 | Stacked red/white tyre barrier (10 tyres in a 5×2 grid) |
| `fountain` | `props/fountain.png` | 2×2 | 192×192 | Round fountain with dark water |
| `wheelbase` | `props/wheelbase.png` | 3×3 | 288×288 | Hub and supports at the base of a giant Ferris wheel |
| `bench` | `props/bench.png` | 2×1 | 192×96 | Park bench, wooden slats |
| `crate` | `props/crate.png` | 2×1 | 192×96 | Two wooden shipping crates |
| `hockey` | `props/hockey.png` | 2×1 | 192×96 | Air-hockey table |
| `counter` | `props/counter.png` | 3×1 | 288×96 | Prize counter with plush toys and trinkets |
| `podium` | `props/podium.png` | 1×2 | 96×192 | Race winners' podium with chequered top |
| `coffin` | `props/coffin.png` | 1×2 | 96×192 | Wooden coffin with a cross |
| `mirror` | `props/mirror.png` | 1×2 | 96×192 | Ornate funhouse mirror lying flat in a gold frame |
| `barrel` | `props/barrel.png` | 1×1 | 96×96 | Wooden barrel seen from above |
| `lamp` | `props/lamp.png` | 1×1 | 96×96 | Pier lamp post seen from above (round lamp head) |
| `pillar` | `props/pillar.png` | 1×1 | 96×96 | Cracked stone pillar top |
| `scare` | `props/scare.png` | 1×1 | 96×96 | Creepy clown animatronic head (top view) |
| `coil` | `props/coil.png` | 1×1 | 96×96 | Tesla coil top |
| `speaker` | `props/speaker.png` | 1×1 | 96×96 | Stage speaker cabinet top |
| `kart` | `props/kart.png` | 1×1 | 96×96 | Go-kart seen from above, nose pointing right |
| `boat` | `props/boat.png` | 3×1 | 288×96 | Small wooden rowing boat, bow pointing right |
| `box_closed` | `props/box_closed.png` | 2×1 | 192×96 | The "Prize Crate" mystery box: ornate wooden crate with gold trim, closed |
| `box_open` | `props/box_open.png` | 2×1 | 192×96 | Same crate with the lid open and a warm light inside |
| `pap` | `props/pap.png` | 2×1 | 192×96 | The "Overclocker": a magenta sci-fi upgrade machine with two rotors and a slot in the middle |
| `perk_thick` | `props/perk_thick.png` | 1×1 | 96×96 | Vending machine top, red theme (health) |
| `perk_quick` | `props/perk_quick.png` | 1×1 | 96×96 | Vending machine top, green theme (reload) |
| `perk_burner` | `props/perk_burner.png` | 1×1 | 96×96 | Vending machine top, yellow theme (speed) |
| `perk_twin` | `props/perk_twin.png` | 1×1 | 96×96 | Vending machine top, orange theme (fire rate) |
| `perk_wind` | `props/perk_wind.png` | 1×1 | 96×96 | Vending machine top, blue theme (revive) |

### Batch 3 — cards and icons

| Key | File | Size (px) | Description |
|---|---|---|---|
| `boss_card` | `ui/boss_card.png` | 1024×1024 | Portrait of the boss "The Headliner": a giant porcelain-faced animatronic ringmaster, top hat, red coat with gold buttons, armoured steel chest plate, glowing yellow power core on its back, piston arms. Dramatic, transparent background. Not top-down |
| `perk_icon_thick` | `ui/perk_thick.png` | 128×128 | HUD badge: shield with a cross, red |
| `perk_icon_quick` | `ui/perk_quick.png` | 128×128 | HUD badge: circular reload arrows, green |
| `perk_icon_burner` | `ui/perk_burner.png` | 128×128 | HUD badge: speed chevrons, yellow |
| `perk_icon_twin` | `ui/perk_twin.png` | 128×128 | HUD badge: two bullets, orange |
| `perk_icon_wind` | `ui/perk_wind.png` | 128×128 | HUD badge: heartbeat line, blue |

## 4. `assets/manifest.json`

List every delivered file. Keys must match the tables above exactly. Missing keys are fine.

```json
{
  "version": 1,
  "assets": {
    "title_bg":    { "file": "ui/title_bg.webp",   "w": 1920, "h": 1080 },
    "floor_plaza": { "file": "floors/plaza.webp",  "w": 384,  "h": 384, "tile": true },
    "cabinet":     { "file": "props/cabinet.png",  "w": 192,  "h": 384, "tiles": [2, 4] }
  }
}
```

## 5. Self-check before every push

1. Pixel size is exact (check with an image tool).
2. Props: transparent outside the object; nothing cut off at the edges.
3. Floors: tile the image 2×2 and confirm there is no visible seam or repeating hot-spot.
4. Seen straight from above; no perspective.
5. Dark, evenly lit, no glow halos, no text.
6. File size ≤ 300 KB.
