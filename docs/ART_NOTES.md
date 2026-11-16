# GRAVEWAVE Art Delivery Notes (`art/nano-banana`)

All 51 assets specified in `docs/ART_BRIEF.md` have been generated, post-processed, and verified against Section 5 Self-Check criteria. Total combined size: **2,365,351 bytes (~2.26 MB)**, well within the 4 MB total budget and 300 KB per-file cap.

## Batch 1 — UI and Floors (15 files, ~705 KB)
- **UI (4 files):** `ui/title_bg.webp` (1920x1080, 142 KB), `ui/logo.png` (1600x400, 122 KB), `ui/icon_512.png` (512x512, 254 KB), `ui/icon_192.png` (192x192, 46 KB).
  - `title_bg.webp` uses a darker, calm center third for logo and button legibility.
  - `logo.png` and icons use clean transparent alpha; `icon_512.png` keeps the neon skull + Ferris-wheel glyph within the central 80% safe zone.
- **Floors, Water & Wall Top (11 files):** `floors/plaza.webp`, `arcade.webp`, `aquarium.webp`, `speedway.webp`, `substation.webp`, `stage.webp`, `starwheel.webp`, `manor.webp`, `pier.webp`, `water.webp`, `wall_top.webp` (all 384x384 WebP, 2.3 KB–38.1 KB).
  - Every tile was verified in a 2x2 tiled layout for seamless X/Y wrapping, straight 90° top-down orthographic framing, and dark even lighting with no baked spotlights or hotspots.

## Batch 2 — Props and Machines (30 files, ~1.26 MB)
- **Props (22 files):** `cabinet.png` (192x384), `tank.png` (192x192), `generator.png` (192x192), `booth.png` (192x192), `tires.png` (480x192), `fountain.png` (192x192), `wheelbase.png` (288x288), `bench.png` (192x96), `crate.png` (192x96), `hockey.png` (192x96), `counter.png` (288x96), `podium.png` (96x192), `coffin.png` (96x192), `mirror.png` (96x192), `barrel.png` (96x96), `lamp.png` (96x96), `pillar.png` (96x96), `scare.png` (96x96), `coil.png` (96x96), `speaker.png` (96x96), `kart.png` (96x96, nose right), `boat.png` (288x96, bow right).
- **Machines & Perk Tops (8 files):** `box_closed.png` (192x96), `box_open.png` (192x96), `pap.png` (192x96), `perk_thick.png`, `perk_quick.png`, `perk_burner.png`, `perk_twin.png`, `perk_wind.png` (all 96x96).
  - All 30 PNGs have transparent alpha backgrounds, tight footprint crops matching `tiles * 96 px`, straight 90° top-down orientation, no glow halos, and no text.

## Batch 3 — Boss Card and HUD Icons (6 files, ~346 KB)
- `ui/boss_card.png` (1024x1024, 231 KB): Dramatic portrait of "The Headliner" on transparent alpha.
- `ui/perk_icon_thick.png`, `perk_icon_quick.png`, `perk_icon_burner.png`, `perk_icon_twin.png`, `perk_icon_wind.png` (all 128x128 PNG, 20.5 KB–29.6 KB, transparent alpha, zero text).

## Skipped / Notes
- None skipped; all 51 assets from `docs/ART_BRIEF.md` are included in `assets/manifest.json`.
