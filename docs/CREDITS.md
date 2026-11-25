# Credits

## Audio (assets/sfx)

Every recorded sound effect in `assets/sfx/` is public domain (**CC0 1.0**). CC0 needs no attribution;
the sources are listed so anyone can check them. The music is not sampled: it is still synthesised at
runtime by `js/audio.js`, and every sound effect keeps a synthesised fallback for when its file cannot be
loaded (for example a page opened straight from disk).

The game files are edits of the sources below: cut to one take, mixed to mono, trimmed, faded,
peak-normalised and encoded as 44.1 kHz MP3 so iPhone Safari can play them. Some of them, such as the
round stingers, power-on, Overclocker upgrade, explosions, boss sounds, purchase and door, layer several
of these recordings. Some layers are re-pitched or have a small added room reverb.

| Source pack (author) | Licence | Where it was fetched | Used for |
|---|---|---|---|
| The Free Firearm Sound Library, Ben Jaszczak / Still North Media (Kickstarter, 2014) | CC0 1.0 | github.com/buddingmonkey/FreeFirearmsSFXLibrary (LICENSE: CC0), prepared takes via github.com/petroulacl/fps-asset-kit | `pistol` (1911, Walther PPQ, Bersa), `smg` (Carl Gustav M45, PPSh), `minigun` (PPSh), `rifle` (AK-47, AR-15), `lmg` (Arisaka, Springfield 1917, AK-47), `shotgun` (Benelli Nova, Winchester Model 12, Charles Daly), `sniper` (Mosin Nagant, Tikka T3, Savage 10) |
| Zombies Sound Pack, artisticdude (opengameart.org/content/zombies-sound-pack) | CC0 1.0 | github.com/Mcamento8/open-game-sfx-index (per-page CC0 audit) and github.com/novincode/atomcut-library | `zgroan`, `zdeath`, distant horde moans, `roundend` |
| 80 CC0 creature SFX and 80 CC0 creature SFX #2, rubberduck (opengameart.org) | CC0 1.0 | github.com/novincode/atomcut-library | `zscream`, `zbig`, `zattack`, `zdeath`, `bite`, `spit`, `broar`, `bslam`, `roundstart`, `special`, `gameover` |
| 100 CC0 SFX, 100 CC0 SFX #2, 100 CC0 metal and wood SFX, 30 CC0 SFX loops, 25 CC0 bang/firework SFX, 50 CC0 sci-fi SFX, 40 CC0 water/splash/slime SFX, 25 CC0 mud SFX, rubberduck (opengameart.org) | CC0 1.0 | github.com/novincode/atomcut-library | gong and bell stingers, `cash` bell, `door`, `power`, `generator`, `shutter`, `siren` (alarm loop), `thunder`, `launcher`, `explode`, `nuke`, `teleport`, `papwork`, `plank`, `hammer`, `splat`, `gulp`, `perk`, `rise` |
| 8 Wet Squish, Slurp Impacts (opengameart.org) | CC0 1.0 | github.com/novincode/atomcut-library | `hit` (bullet into flesh), `stab`, `bite` |
| 15 Vocal Male Strain/Hurt/Pain/Jump sounds (opengameart.org) | CC0 1.0 | github.com/novincode/atomcut-library | `hurt` |
| Swish - bamboo stick weapon swhoshes, qubodup (opengameart.org) | CC0 1.0 | github.com/novincode/atomcut-library | `swing` (melee, knife, throw, slide, leap) |
| Electricity Game Sound Pack (opengameart.org/content/electricity-game-sound-pack) | CC0 1.0 | github.com/EternityForest/Free-SFX (folder README: CC0) | `arc`, `zap`, `power`, `upgrade` |
| Kenney: Sci-fi Sounds, Impact Sounds, Interface Sounds, RPG Audio, Digital Audio (kenney.nl) | CC0 1.0 | github.com/Mcamento8/open-game-sfx-index and github.com/novincode/atomcut-library | `laser`, `lasersmall`, `flame` (thruster), `explode`/`nuke` low end, `papwork`, `upgrade`, `clink`, `bang`, `helmet`, `armor`, `glass`, `plank`, `dryfire`, `magout`, `magin`, `swap`, `stab`, `cash` coins, `deny`, `ui`, `pickup`, `pdrop`, `perk` |

Licences were checked on each mirror: the repository LICENSE, or the per-pack `license` field and the
original OpenGameArt or Kenney page it names. Sound packs released as CC-BY (for example Oculus Audio
Pack 1) were looked at but not used.

## Frostfall Junction textures (assets/frostfall)

The ten floor and roof textures of the third map (`js/map_frostfall.js`) are **CC0 1.0** (public domain)
materials from ambientCG and Poly Haven. They were fetched from the CC0 mirrors kept by
github.com/zuujis-cc0 (each repository's LICENSE is CC0 1.0 and its README links every asset to its original
page), using only the colour (albedo) map at 1K. Each was resized to 384 or 768 px so that 96 px covers one
48 px game tile, darkened and slightly desaturated (snow and ice also tinted blue, the yard snow lowered in
contrast), and saved as WebP. Everything else on the map (props, tracks, signs, light) is drawn with canvas
code. The original seamless tiling is kept: no crops except Tiles074, cut exactly on its checker period.

| Game file | Source material (author) | Original page | Mirror |
|---|---|---|---|
| `concourse.webp` | Tiles 074 (ambientCG) | ambientcg.com/a/Tiles074 | zuujis-cc0/ambientcg-materials-tiles-3 |
| `platform.webp` | Brown Planks 04 (Rob Tuytel, Poly Haven) | polyhaven.com/a/brown_planks_04 | zuujis-cc0/polyhaven-textures-wood |
| `ballast.webp` | Gravel 015 (ambientCG) | ambientcg.com/a/Gravel015 | zuujis-cc0/ambientcg-materials-gravel |
| `cobble.webp` | Paving Stones 142 (ambientCG) | ambientcg.com/a/PavingStones142 | zuujis-cc0/ambientcg-materials-paving-stones-7 |
| `yard.webp` | Snow 011 (ambientCG) | ambientcg.com/a/Snow011 | zuujis-cc0/ambientcg-materials-snow |
| `snow.webp` | Snow 007 A (ambientCG) | ambientcg.com/a/Snow007A | zuujis-cc0/ambientcg-materials-snow |
| `ice.webp` | Snow 013 (ambientCG) | ambientcg.com/a/Snow013 | zuujis-cc0/ambientcg-materials-snow |
| `boiler.webp` | Diamond Plate 008 D (ambientCG) | ambientcg.com/a/DiamondPlate008D | zuujis-cc0/ambientcg-materials-diamond-plate |
| `shed.webp` | Diamond Plate 006 C (ambientCG) | ambientcg.com/a/DiamondPlate006C | zuujis-cc0/ambientcg-materials-diamond-plate |
| `roof.webp` | Bricks 023 (ambientCG) | ambientcg.com/a/Bricks023 | zuujis-cc0/ambientcg-materials-bricks |

ambientCG licence: docs.ambientcg.com/license (CC0 1.0). Poly Haven licence: polyhaven.com/license (CC0 1.0).
If a texture fails to load (offline, or a page opened from disk) the map paints a procedural floor instead.
