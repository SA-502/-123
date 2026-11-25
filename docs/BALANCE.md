# GRAVEWAVE balance notes

What the numbers are, why they are what they are, and how to re-check them. All values live in
`js/config.js` (`GW.CFG`, `GW.Rounds`, `GW.WEAPONS`); tier maths is `GW.Weapons.tierStats` in
`js/weapons.js`. Player feedback that drove this pass: zombies far too fast, points farmed by fast
guns, Overclocked guns either broken or useless, upgrades with no visible effect, too many power-ups.

## 1. Zombie pressure

| | Before | Now |
|---|---|---|
| Speed bands (px/s) | walk 52-72, run 125-150, sprint 182-206 | walk 48-66, run 104-124, sprint 150-168 |
| Who sprints | roll `r*8 + rand*35`: 14 % sprinters at round 5, **every** zombie a sprinter from round 9 | none before round 9, then +3 %/round, capped at **35 %** |
| Swing damage | 45 flat (3 hits from full) | `GW.Rounds.damage(r)`: 34 at round 1 → 50 at round 20 |
| Wind-up / cooldown | 0.30 s / 0.80 s | 0.38 s / 0.90 s |
| Specials | leaper 165-180, shrieker 205-228, spitter 105-120, brute 86-98 | leaper 135-150, shrieker 168-186, spitter 95-110, brute 80-92 |

The player walks at 190 and sprints at 290, so every walker and runner can be out-walked and a
sprinter can still be out-run. On a phone that means pressure you can read: the horde closes in, it
doesn't teleport onto you. The mix (`GW.Rounds.speedMix`) is in the round table below.

### Crawlers

A walker, helmet or shrieker that survives a hit taking it below 35 % health has a 30 % chance to
lose its legs; one that survives an explosion while under 60 % has a 40 % chance. A crawler
(`z.crawl = true`) moves at 40 % speed (22-46 px/s), bites for 70 % damage after a slower 0.55 s
wind-up, and tears planks 1.6x slower. Never brutes, bosses, bloaters, spitters or leapers, and at most
six alive at once. `z.crawl` is sent in the co-op snapshot (zombie row index 21). Until the renderer
draws crawlers they look like normal zombies that move slowly and leave a blood trail.

## 2. Economy

**Before:** every bullet that hit paid 10. A Hornet at round 10 needs ~36 hits per zombie, so each
zombie paid ~420 points; a 1250 wall gun earned its price back many times a minute.

**Now: points by damage share.** Every zombie carries a small pool of hit points
(`POINTS.pool` = 20; brutes 90, the boss 900). As your damage takes its health away you are paid
your share of the pool, 10 at a time; whatever is left of your share is added to the kill bonus.
So one zombie is worth the same to a minigun and to a sniper rifle:

| Kill | Points (pool + bonus) |
|---|---|
| Normal kill | 20 + 50 = **70** |
| Headshot (critical) kill | 20 + 80 = **100** |
| Knife kill | 20 + 120 = **140** (blades pay a normal kill) |
| Brute | 90 + 200 |
| Boss | up to 900 from hits + 2000 |
| Trap / Pixel Pal / Sentry kill | 40 (no pool) |

Measured in the browser (aim-bot firing at walkers, round 5, 12 kills each): Stinger 92, Ranger 100,
Hornet 83, Bulldog 107, Sixgun 98, Anvil 85 points per kill. The spread comes only from how often a
gun lands headshots, which is meant to pay.

**Co-op:** each player is paid the pool share for the damage *they* did (a guest's phone pays its own
share; the server pays the kill bonus to whoever lands the kill via `Net.creditKill`). Two players
splitting a zombie 50/50 get 10 each plus the kill bonus to the killer. The horde grows by 50 % per
extra player, so each player earns ~75 % (2 players) to ~62 % (4 players) of the solo income.

### Income per round (solo, ~77 points per zombie)

| Round | Zombie hp | Horde (solo) | Speed mix walk/run/sprint | Swing dmg | Income that round (solo) | Cumulative |
|---:|---:|---:|---|---:|---:|---:|
| 1 | 150 | 6 | 100 / 0 / 0 % | 34 | 465 | 965 |
| 2 | 250 | 8 | 100 / 0 / 0 % | 35 | 620 | 1585 |
| 3 | 350 | 13 | 93 / 7 / 0 % | 36 | 1008 | 2593 |
| 4 | 450 | 18 | 85 / 15 / 0 % | 37 | 1395 | 3988 |
| 5 | 550 | 24 | 78 / 22 / 0 % | 37 | 1860 | 5848 |
| 6 | 650 | 27 | 70 / 30 / 0 % | 38 | 2093 | 7941 |
| 8 | 850 | 28 | 55 / 45 / 0 % | 40 | 2170 | 12281 |
| 10 | 1045 | 33 | 40 / 54 / 6 % | 42 | 2558 | 17087 |
| 12 | 1264 | 36 | 25 / 63 / 12 % | 43 | 2790 | 22512 |
| 15 | 1682 | 44 | 15 / 64 / 21 % | 46 | 3410 | 32123 |
| 20 | 2710 | 60 | 15 / 50 / 35 % | 50 | 4650 | 52739 |
| 25 | 4365 | 80 | 15 / 50 / 35 % | 50 | 6200 | 80331 |
| 30 | 7030 | 105 | 15 / 50 / 35 % | 50 | 8138 | 116835 |

### Wall prices and payback

Prices went up a little and follow sustained DPS. Payback = price / income of the round you would
normally buy it in (solo; multiply by ~1.4-1.6 in co-op). Because every gun now earns the same per
zombie, a gun no longer "makes money": it pays back by letting you survive deeper, and the
numbers below are the floor.

| Weapon | Old price | New price | Typical buy round | Payback (rounds, solo) |
|---|---:|---:|---:|---:|
| Ranger DMR | 500 | 750 | 2-3 | 1.2-0.75 |
| Bulldog 12 | 500 | 750 | 2-3 | 1.2-0.75 |
| Buzzsaw SMG | 1000 | 1250 | 4 | 0.9 |
| Hornet MP | 1250 | 1500 | 4-5 | 1.1-0.8 |
| Kestrel AR | 1400 | 1750 | 5-6 | 0.95-0.85 |
| Sixgun .50 | 1500 | 1750 | 5-6 | 0.95-0.85 |
| Riptide Auto-12 | 1500 | 2000 | 6-7 | 0.95 |
| Boomstick | 1750 | 2000 | 6-7 | 0.95 |
| Anvil LMG | 2500 | 3000 | 8-10 | 1.4-1.2 |

Overclocker tiers stay 5000 / 10000 / 15000 (30 000 per weapon): tier I is affordable around round
6-8, a full tier III around round 18-22, which is where the hp curve starts to need it.

## 3. Weapons

### Rules used

* **Base wall guns**: sustained single-target DPS (magazine + reload) of 265-520, in price order. Each
  has a role: Ranger and Sixgun precision with pierce and 2.5x crits, Bulldog/Riptide/Boomstick close
  burst, Buzzsaw/Hornet mobile spray, Kestrel all-round, Anvil pierce-2 crowd holder.
* **Tier I** (the `up` stats) puts every wall gun at **~930-1300 DPS**, so a cheap gun is a real
  choice once overclocked.
* **Tiers II/III** use a per-weapon damage curve (`up.tiers`, default 1 / 1.75 / 2.8) instead of the
  old flat x2 / x3.5 on top of already-strong tier I stats. Weak bodies (SMGs, pump shotgun) climb
  steeper (x1.9 / x3.1), strong ones flatter (Sixgun, Anvil x1.7 / x2.7). Every wall gun ends at
  **~3200-4200 DPS** at tier III. Tiers II/III also add 15 % / 30 % magazine and 4 % / 8 % fire rate.
* **Crate weapons** are stronger than walls at the same tier (Ripper, Thumper, blades), and
  **wonder weapons** strongest, but their tier curves are flatter (x1.4 / x1.8) so a tier III wonder
  weapon still needs 2-3 shots per zombie at round 30 instead of deleting the round.
* **Blades** deal flat damage + a share of max health (not on bosses, 15 % of it on brutes); the share
  was cut (Katana 0.34 → 0.25, Axe 0.5 → 0.35, Executioner 0.9 → 0.5) so tier I no longer one-shots
  forever. Tiers add +0.08 / +0.16 of max health.
* **Stinger Supernova** (the upgraded starting pistol) was the strongest gun in the game (700 + 420
  splash at 380 rpm, x3.5 at tier III). It is now 300 + 170 splash at 320 rpm: still a good fallback.
* **Arc Caster**: chain 6 → 5 (8 / 10 / 12 when overclocked), 12 reserve. It still kills whatever it
  chains (it is the wonder weapon), but runs dry.

### TTK / DPS table

`hits / seconds` to kill one normal zombie with body shots at close range (shotguns: 75 % of pellets
land). Sustained DPS is against a round-10 zombie and includes the reload. Crits (2-2.5x) and pierce
make precision guns better than this table shows; splash makes launchers and wonder weapons better
against crowds. Blades and flames scale with the zombie's max health, so their column barely moves.

| Weapon | Tier | Price | Sustained DPS | r1 (150 hp) | r5 (550 hp) | r10 (1045 hp) | r15 (1682 hp) | r20 (2710 hp) | r30 (7030 hp) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **P-9 Stinger** | base | start | 135 | 4 / 0.40s | 14 / 1.73s | 27 / 3.47s | 43 / 5.60s | 68 / 8.93s | 176 / 23.33s |
|  | I | 5000 | 935 | 1 / 0.00s | 2 / 0.19s | 4 / 0.56s | 6 / 0.94s | 10 / 1.69s | 24 / 4.31s |
|  | II | 10000 | 1732 | 1 / 0.00s | 2 / 0.18s | 3 / 0.36s | 4 / 0.54s | 6 / 0.90s | 14 / 2.34s |
|  | III | 15000 | 2853 | 1 / 0.00s | 1 / 0.00s | 2 / 0.17s | 3 / 0.35s | 4 / 0.52s | 10 / 1.56s |
| **Ranger DMR** | base | 750 | 300 | 2 / 0.20s | 5 / 0.80s | 9 / 1.60s | 15 / 2.80s | 23 / 4.40s | 59 / 11.60s |
|  | I | 5000 | 1047 | 1 / 0.00s | 2 / 0.18s | 4 / 0.55s | 6 / 0.91s | 9 / 1.45s | 22 / 3.82s |
|  | II | 10000 | 2030 | 1 / 0.00s | 1 / 0.00s | 2 / 0.17s | 3 / 0.35s | 5 / 0.70s | 12 / 1.92s |
|  | III | 15000 | 3564 | 1 / 0.00s | 1 / 0.00s | 2 / 0.17s | 2 / 0.17s | 3 / 0.34s | 8 / 1.18s |
| **Bulldog 12** | base | 750 | 265 | 1 / 0.00s | 2 / 0.75s | 4 / 2.25s | 6 / 3.75s | 10 / 6.75s | 24 / 17.25s |
|  | I | 5000 | 932 | 1 / 0.00s | 1 / 0.00s | 2 / 0.55s | 3 / 1.09s | 4 / 1.64s | 10 / 4.91s |
|  | II | 10000 | 1839 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.53s | 2 / 0.53s | 5 / 2.11s |
|  | III | 15000 | 3172 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.50s | 4 / 1.51s |
| **Buzzsaw SMG** | base | 1250 | 313 | 4 / 0.22s | 14 / 0.97s | 25 / 1.80s | 41 / 3.00s | 65 / 4.80s | 168 / 12.53s |
|  | I | 5000 | 975 | 2 / 0.07s | 5 / 0.28s | 10 / 0.64s | 16 / 1.06s | 25 / 1.69s | 64 / 4.45s |
|  | II | 10000 | 2002 | 1 / 0.00s | 3 / 0.14s | 5 / 0.27s | 9 / 0.54s | 13 / 0.81s | 34 / 2.24s |
|  | III | 15000 | 3495 | 1 / 0.00s | 2 / 0.07s | 4 / 0.20s | 5 / 0.26s | 8 / 0.46s | 21 / 1.31s |
| **Kestrel AR** | base | 1750 | 392 | 3 / 0.20s | 9 / 0.80s | 16 / 1.50s | 25 / 2.40s | 40 / 3.90s | 104 / 10.30s |
|  | I | 5000 | 1062 | 1 / 0.00s | 4 / 0.28s | 7 / 0.55s | 12 / 1.02s | 19 / 1.66s | 47 / 4.25s |
|  | II | 10000 | 2060 | 1 / 0.00s | 3 / 0.18s | 4 / 0.27s | 7 / 0.53s | 11 / 0.89s | 27 / 2.31s |
|  | III | 15000 | 3544 | 1 / 0.00s | 2 / 0.09s | 3 / 0.17s | 4 / 0.26s | 7 / 0.51s | 17 / 1.37s |
| **Riptide Auto-12** | base | 2000 | 454 | 1 / 0.00s | 3 / 0.57s | 5 / 1.14s | 7 / 1.71s | 11 / 2.86s | 29 / 8.00s |
|  | I | 5000 | 1172 | 1 / 0.00s | 2 / 0.24s | 3 / 0.48s | 4 / 0.72s | 6 / 1.20s | 15 / 3.36s |
|  | II | 10000 | 2216 | 1 / 0.00s | 1 / 0.00s | 2 / 0.23s | 2 / 0.23s | 4 / 0.69s | 9 / 1.85s |
|  | III | 15000 | 3809 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.22s | 2 / 0.22s | 6 / 1.11s |
| **Hornet MP** | base | 1500 | 338 | 5 / 0.22s | 18 / 0.93s | 33 / 1.75s | 53 / 2.84s | 85 / 4.58s | 220 / 11.95s |
|  | I | 5000 | 1015 | 2 / 0.05s | 7 / 0.31s | 14 / 0.68s | 22 / 1.10s | 34 / 1.72s | 88 / 4.54s |
|  | II | 10000 | 2072 | 1 / 0.00s | 4 / 0.15s | 7 / 0.30s | 12 / 0.55s | 18 / 0.85s | 47 / 2.31s |
|  | III | 15000 | 3603 | 1 / 0.00s | 3 / 0.10s | 5 / 0.19s | 7 / 0.29s | 11 / 0.48s | 29 / 1.35s |
| **Anvil LMG** | base | 3000 | 521 | 2 / 0.12s | 7 / 0.69s | 13 / 1.38s | 21 / 2.31s | 34 / 3.81s | 86 / 9.81s |
|  | I | 5000 | 1258 | 1 / 0.00s | 4 / 0.32s | 7 / 0.64s | 10 / 0.96s | 16 / 1.61s | 42 / 4.39s |
|  | II | 10000 | 2269 | 1 / 0.00s | 2 / 0.10s | 4 / 0.31s | 6 / 0.52s | 10 / 0.93s | 25 / 2.47s |
|  | III | 15000 | 3802 | 1 / 0.00s | 2 / 0.10s | 3 / 0.20s | 4 / 0.30s | 6 / 0.50s | 16 / 1.49s |
| **Longshot** | base | crate | 394 | 1 / 0.00s | 1 / 0.00s | 2 / 1.09s | 3 / 2.18s | 5 / 4.36s | 11 / 10.91s |
|  | I | 5000 | 1408 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.86s | 5 / 3.43s |
|  | II | 10000 | 2551 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 3 / 1.64s |
|  | III | 15000 | 4133 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.79s |
| **Boomstick** | base | 2000 | 476 | 1 / 0.00s | 1 / 0.00s | 2 / 0.23s | 3 / 0.46s | 5 / 0.92s | 13 / 2.77s |
|  | I | 5000 | 1091 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.23s | 3 / 0.46s | 7 / 1.38s |
|  | II | 10000 | 1930 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.22s | 4 / 0.67s |
|  | III | 15000 | 4218 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 3 / 0.43s |
| **Sixgun .50** | base | 1750 | 417 | 1 / 0.00s | 2 / 0.35s | 4 / 1.06s | 6 / 1.76s | 10 / 3.18s | 24 / 8.12s |
|  | I | 5000 | 1315 | 1 / 0.00s | 1 / 0.00s | 2 / 0.33s | 3 / 0.67s | 4 / 1.00s | 9 / 2.67s |
|  | II | 10000 | 2406 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.32s | 2 / 0.32s | 6 / 1.60s |
|  | III | 15000 | 4081 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.31s | 4 / 0.93s |
| **Quasar Blaster** | base | crate (wonder) | 2243 | 1 / 0.00s | 1 / 0.00s | 2 / 0.32s | 2 / 0.32s | 3 / 0.63s | 8 / 2.21s |
|  | I | 5000 | 5466 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.32s | 4 / 0.95s |
|  | II | 10000 | 8163 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 3 / 0.61s |
|  | III | 15000 | 11020 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.29s |
| **Thumper GL** | base | crate | 610 | 1 / 0.00s | 1 / 0.00s | 2 / 0.63s | 3 / 1.26s | 5 / 2.53s | 11 / 6.32s |
|  | I | 5000 | 1974 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.50s | 2 / 0.50s | 5 / 2.00s |
|  | II | 10000 | 3445 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.48s | 3 / 0.96s |
|  | III | 15000 | 5442 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.46s |
| **Ripper Minigun** | base | crate | 1016 | 3 / 0.08s | 9 / 0.32s | 17 / 0.64s | 26 / 1.00s | 42 / 1.64s | 109 / 4.32s |
|  | I | 5000 | 2500 | 2 / 0.04s | 4 / 0.12s | 8 / 0.28s | 13 / 0.48s | 20 / 0.76s | 51 / 2.00s |
|  | II | 10000 | 4277 | 1 / 0.00s | 3 / 0.08s | 5 / 0.15s | 8 / 0.27s | 13 / 0.46s | 32 / 1.19s |
|  | III | 15000 | 6809 | 1 / 0.00s | 2 / 0.04s | 4 / 0.11s | 6 / 0.19s | 9 / 0.30s | 21 / 0.74s |
| **Neon Katana** | base | crate | 1497 | 1 / 0.00s | 2 / 0.38s | 2 / 0.38s | 3 / 0.75s | 3 / 0.75s | 4 / 1.13s |
|  | I | 5000 | 3354 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.33s | 2 / 0.33s | 3 / 0.67s |
|  | II | 10000 | 5054 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.32s | 2 / 0.32s |
|  | III | 15000 | 7098 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.31s |
| **Fire Axe** | base | crate | 1443 | 1 / 0.00s | 1 / 0.00s | 2 / 0.60s | 2 / 0.60s | 2 / 0.60s | 3 / 1.20s |
|  | I | 5000 | 3158 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.55s | 2 / 0.55s |
|  | II | 10000 | 4800 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.53s |
|  | III | 15000 | 6842 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s |
| **Dragon's Breath** | base | crate (wonder) | 580 | 3 / 0.20s | 9 / 0.80s | 15 / 1.40s | 22 / 2.10s | 31 / 3.00s | 52 / 5.10s |
|  | I | 5000 | 1382 | 2 / 0.10s | 4 / 0.30s | 7 / 0.60s | 10 / 0.90s | 15 / 1.40s | 28 / 2.70s |
|  | II | 10000 | 2268 | 1 / 0.00s | 3 / 0.19s | 5 / 0.38s | 7 / 0.58s | 10 / 0.87s | 19 / 1.73s |
|  | III | 15000 | 3365 | 1 / 0.00s | 2 / 0.09s | 4 / 0.28s | 5 / 0.37s | 7 / 0.56s | 15 / 1.30s |
| **Photon Ray** | base | crate (wonder) | 2865 | 1 / 0.00s | 1 / 0.00s | 2 / 0.23s | 2 / 0.23s | 4 / 0.69s | 8 / 1.62s |
|  | I | 5000 | 5929 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.21s | 2 / 0.21s | 5 / 0.86s |
|  | II | 10000 | 8785 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 2 / 0.21s | 4 / 0.62s |
|  | III | 15000 | 11939 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 3 / 0.40s |
| **Arc Caster** | base | crate (wonder) | 1453 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s |
|  | I | 5000 | 2094 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s |
|  | II | 10000 | 2313 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s |
|  | III | 15000 | 2515 | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s | 1 / 0.00s |

## 4. Overclocker, ammo mods and perks

Verified in the browser with a deterministic test (forced procs on one shot, then reading zombie
state) for every fire mode: hitscan, pellets, plasma, flame, blade and chain.

**Bugs found and fixed**
* Mods never triggered on the Dragon's Breath (flame) or the Arc Caster: those fire modes never called
  `applyMod`. They do now (flames at a quarter of the rate per tick, since a flame touches many
  zombies ten times a second).
* Arc and Blast used the hit damage, so on SMGs (80 per bullet) they did almost nothing. They now
  deal at least 15 % (Arc) / 22 % (Blast) of this round's zombie health.
* Frost needed 5 procs to freeze, so zombies usually died first: 3 procs now, and every proc slows.
* A shotgun could proc the mod once per pellet on the same zombie: now once per zombie per shot.
* Blade and flame mods chained the %-of-health part of the hit to other zombies (51 000 damage
  chains in testing); they now use the flat weapon damage.

**Proc chance** = `clamp(140 / rpm, 0.07, 0.6) / sqrt(pellets)`: Ranger ~42 %, Kestrel ~21 %,
Hornet ~12 %, shotguns ~20 % per pellet.

| Mod | Effect | Status fields on the zombie |
|---|---|---|
| Inferno | burns 10 % max hp/s for 3 s (1.5 % on brutes/boss) | `burnT`, `burnDps`, `burnTick` |
| Arc | chains to 4 neighbours within 210 px for max(1.5x hit, 15 % round hp), dazes 0.7 s | `shockT` (visual), `dazeT` |
| Frost | each proc slows to 40 % for 3 s; 3rd proc freezes 1.6 s | `frost` (stacks), `slowT`, `freezeT` |
| Blast | 70 px explosion for max(1.2x hit, 22 % round hp) | `blastT` (visual) |

**Feedback added** (fx.js / weapons.js): muzzle starburst and light that grow per tier; beams that
get thicker and longer-lived per tier, tier II adds a mod-coloured side beam, tier III two; impact
sparks; flame plumes, chain bolts with a white core and crackle, frost shards and a freeze burst,
blast rings and smoke; continuous status particles (burning, frosted, frozen, shocked, crawler blood
trail) from `FX.update`; crit and heavy-hit damage numbers (throttled per zombie); and an upgrade
moment when the weapon comes out of the Overclocker (rings, light, flash, shake, weapon name and mod).

**Perks** all applied correctly in code (Quick Hands reload 2.2 → 1.1 s, Twin Trigger fire interval
0.100 → 0.075 s, Thick Skin 100 → 250 hp, Afterburner stamina 4 → 8 s). They were invisible, so
buying one now bursts in the perk colour with its name, Quick Hands throws green sparks on reload,
Twin Trigger orange sparks at the muzzle, and Afterburner leaves a jet trail while sprinting (its
speed bonus went 10 % → 15 % so it can be felt).

## 5. Power-ups

Before: 3 % per kill, pity at 50 kills, up to 4 per round, any power-up any time (Double Score
three times in a round happened). Now (`CFG.DROPS`, `Director.dropWeight`):

* 2.5 % per kill, pity at 55 kills, **at most 2 per round**;
* at least **25 s and 12 kills** between two drops;
* never the same power-up twice in a row; Overkill and Double Score at most once per round and never
  while already running; Purge at most once per round; Board Up only when a barricade is damaged;
* weights: Full Reload 1, Double Score 0.8, Board Up 0.6, Pixel Pal 0.35, Overkill 0.35, Purge 0.3.

A 40-round simulation gave 52 drops (first one around round 5), never more than 2 in a round.

## Re-checking

* `GW.debug.round(n)`, `GW.debug.weapon(id)`, `GW.debug.give(n)` in the browser console.
* The TTK table is generated from the live config by a small Node script that loads `js/config.js`
  and `GW.Weapons.tierStats`: hits-to-kill = `ceil(hp / damage per shot)`, time = `(hits - 1) x 60 / rpm`,
  sustained DPS = `damage x mag / (mag x 60 / rpm + reload)`.
