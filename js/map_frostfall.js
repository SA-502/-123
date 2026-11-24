/*
 * GRAVEWAVE — Map #3: FROSTFALL JUNCTION (محطة الصقيع)
 * A snowbound mountain railway junction at midnight. Seven zones around a grand station concourse:
 * two training loops (north: Concourse -> Platforms -> Freight Yard, south: Concourse -> Market Street
 * -> Boiler House -> Freight Yard), the Engine Shed (Overclocker, power gate, lockdown room) and the
 * Frozen Lake, a big dead-end arena with an island bandstand to circle the horde around.
 *
 * One trap: the Night Express, a three-tile wall of lightning that storms up and down the whole
 * length of the platforms (the trap rect slides, see FF.update). The Three Relics / Signal Lamps side
 * quests live in js/quest_frostfall.js and read M.quest, which this map fills in.
 * Floors are CC0 textures (ambientCG / Poly Haven, see docs/CREDITS.md) in assets/frostfall/,
 * everything else is painted here with canvas. Notes: docs/FROSTFALL_MAP_NOTES.md.
 */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, T = GW.CFG.TILE, M = GW.Map, TT = M.TT;
  const W = M.W, H = M.H;
  const idx = M.idx;
  GW.Maps = GW.Maps || {};

  // zone ids: 4 must be the power-switch zone (it opens M.gate) and 5 the Overclocker room (render/interact use M.Z.SUB / M.Z.VAULT)
  const Z = { CON: 0, PLAT: 1, MARKET: 2, YARD: 3, BOIL: 4, SHED: 5, LAKE: 6 };
  const ZONE_DEFS = [
    { id: 0, name: 'Grand Concourse', color: '#f2c879', short: 'CONCOURSE' },
    { id: 1, name: 'The Platforms', color: '#8fd8ff', short: 'PLATFORMS' },
    { id: 2, name: 'Market Street', color: '#ff9e6b', short: 'MARKET' },
    { id: 3, name: 'Freight Yard', color: '#c9d46a', short: 'FREIGHT' },
    { id: 4, name: 'Boiler House', color: '#ff7a4a', short: 'BOILERS' },
    { id: 5, name: 'Engine Shed', color: '#ff5ad1', short: 'SHED' },
    { id: 6, name: 'Frozen Lake', color: '#a9c8ff', short: 'LAKE' },
  ];

  // painted signs (translated when the art is built)
  const SIGNS = [
    { text: 'GRAND CONCOURSE', tx: 36, ty: 22.2, size: 16 },
    { text: 'PLATFORM 1', tx: 46, ty: 4.1, size: 13, color: 'rgba(240,240,220,0.75)' },
    { text: 'PLATFORM 2', tx: 46, ty: 8.6, size: 13, color: 'rgba(240,240,220,0.75)' },
    { text: 'MARKET STREET', tx: 11.5, ty: 19.2, size: 13 },
    { text: 'FREIGHT YARD', tx: 61, ty: 19.4, size: 14 },
    { text: 'BOILER HOUSE', tx: 52, ty: 49, size: 14 },
    { text: 'ENGINE SHED', tx: 35.5, ty: 41.6, size: 13, color: 'rgba(255,190,240,0.75)' },
    { text: 'FROZEN LAKE', tx: 82.5, ty: 16, size: 15 },
    { text: 'SAFE ROOM', tx: 22, ty: 52, size: 10, color: '#9fffb8' },
    { text: 'WORKBENCH', tx: 49, ty: 47.9, size: 9, color: 'rgba(255,214,150,0.8)' },
  ];

  /* ------------------------------------------------------------------ */
  /* construction helpers (same shapes as js/map.js)                     */
  /* ------------------------------------------------------------------ */
  function carve(x, y, w, h, zone) {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        M.tiles[idx(i, j)] = TT.FLOOR;
        M.zone[idx(i, j)] = zone;
      }
  }
  function addProp(kind, tx, ty, w, h, tall, extra) {
    const p = Object.assign({ kind, tx, ty, w, h, tall: !!tall }, extra || {});
    for (let j = ty; j < ty + h; j++) for (let i = tx; i < tx + w; i++) M.tiles[idx(i, j)] = tall ? TT.SOLID : TT.LOW;
    M.props.push(p);
    return p;
  }
  function addDoor(name, cost, tiles, a, b, orient, power) {
    const d = { id: M.doors.length, name, cost, tiles, a, b, orient, power: !!power, open: false, openT: 0 };
    let sx = 0, sy = 0;
    for (const [x, y] of tiles) {
      M.tiles[idx(x, y)] = TT.DOOR;
      M.zone[idx(x, y)] = a;
      sx += x + 0.5;
      sy += y + 0.5;
    }
    d.x = (sx / tiles.length) * T;
    d.y = (sy / tiles.length) * T;
    const xs = tiles.map((t) => t[0]), ys = tiles.map((t) => t[1]);
    d.rx = Math.min.apply(null, xs) * T;
    d.ry = Math.min.apply(null, ys) * T;
    d.rw = (Math.max.apply(null, xs) + 1) * T - d.rx;
    d.rh = (Math.max.apply(null, ys) + 1) * T - d.ry;
    M.doors.push(d);
    return d;
  }
  const row = (x0, x1, y) => { const out = []; for (let x = x0; x <= x1; x++) out.push([x, y]); return out; };
  const col = (x, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) out.push([x, y]); return out; };
  function addWindow(tx, ty, dx, dy, zone) {
    M.tiles[idx(tx, ty)] = TT.WINDOW;
    M.zone[idx(tx, ty)] = zone;
    M.windows.push({
      id: M.windows.length, tx, ty, dx, dy, zone,
      ix: tx + dx, iy: ty + dy,
      x: (tx + 0.5) * T, y: (ty + 0.5) * T,
      planks: 6, busy: null, seed: Math.random() * 100,
    });
  }
  function light(tx, ty, r, color, zone, always) {
    M.lights.push({ x: tx * T, y: ty * T, r, color, zone, always: !!always, phase: Math.random() * 10 });
  }

  // the Night Express: the trap's floor plate is the whole platform hall while idle (so the minimap
  // shows where it strikes); while it runs, a SLIDE.w-tile band storms from end to end
  const SLIDE = { x0: 8, x1: 71, y: 3, h: 11, w: 3, speed: 9 };

  /* ------------------------------------------------------------------ */
  /* layout                                                              */
  /* ------------------------------------------------------------------ */
  function buildMap() {
    M.tiles = new Uint8Array(W * H); // all WALL
    M.zone = new Int8Array(W * H).fill(-1);
    M.flow = new Uint16Array(W * H).fill(65535);
    M.flowLure = new Uint16Array(W * H).fill(65535);
    M.version = 1;
    M.props = [];
    M.doors = [];
    M.windows = [];
    M.lights = [];
    M.zones = ZONE_DEFS.map((z) => Object.assign({}, z, { open: z.id === Z.CON }));
    M.flowDirty = true;
    M.flowTx = -1;
    M.flowTy = -1;

    // cold midnight: blue-black ambient, snow keeps it readable even before the power is on
    M.theme = {
      id: 'frostfall',
      name: 'FROSTFALL JUNCTION',
      sub: 'Snowbound Rail Junction · Midnight',
      accent: '#8fd8ff',
      ambientRgb: '5,10,24',
      ambOff: 0.66,
      ambOn: 0.3,
    };

    // ---- rooms ----
    carve(26, 20, 20, 16, Z.CON); // x26..45 y20..35  Grand Concourse (start)
    carve(8, 3, 64, 11, Z.PLAT); // x8..71  y3..13   The Platforms (two tracks)
    carve(4, 18, 15, 31, Z.MARKET); // x4..18 y18..48 Market Street
    carve(52, 18, 19, 24, Z.YARD); // x52..70 y18..41 Freight Yard
    carve(25, 46, 38, 10, Z.BOIL); // x25..62 y46..55 Boiler House
    carve(29, 38, 14, 6, Z.SHED); // x29..42 y38..43 Engine Shed (Overclocker)
    carve(74, 14, 18, 32, Z.LAKE); // x74..91 y14..45 Frozen Lake

    // ---- corridors (all 4 wide, a door in the middle) ----
    carve(33, 14, 4, 2, Z.PLAT); carve(33, 17, 4, 3, Z.CON); // concourse <-> platforms (door y16)
    carve(19, 26, 3, 4, Z.MARKET); carve(23, 26, 3, 4, Z.CON); // concourse <-> market (door x22)
    carve(46, 26, 2, 4, Z.CON); carve(49, 26, 3, 4, Z.YARD); // concourse <-> freight (door x48)
    carve(62, 14, 4, 1, Z.PLAT); carve(62, 16, 4, 2, Z.YARD); // platforms <-> freight (door y15)
    carve(19, 45, 2, 4, Z.MARKET); carve(22, 45, 3, 4, Z.BOIL); // market <-> boiler house (door x21)
    carve(58, 42, 4, 1, Z.YARD); carve(58, 44, 4, 2, Z.BOIL); // freight <-> boiler house (door y43)
    carve(71, 28, 1, 4, Z.YARD); carve(73, 28, 1, 4, Z.LAKE); // freight <-> lake (door x72)
    carve(34, 44, 4, 1, Z.SHED); // the Engine Shed's doorway (lockdown gates), power gate below it at y45
    // panic room: an alcove off the bottom of Market Street, shutter at x19
    carve(15, 49, 4, 5, Z.MARKET); carve(19, 51, 1, 2, Z.MARKET); carve(20, 51, 4, 3, Z.MARKET);

    // ---- doors ----
    addDoor('The Platforms', 750, row(33, 36, 16), Z.CON, Z.PLAT, 'h');
    addDoor('Market Street', 750, col(22, 26, 29), Z.CON, Z.MARKET, 'v');
    addDoor('Freight Yard', 1000, col(48, 26, 29), Z.CON, Z.YARD, 'v');
    addDoor('the freight ramp', 1250, row(62, 65, 15), Z.PLAT, Z.YARD, 'h');
    addDoor('Boiler House', 1250, col(21, 45, 48), Z.MARKET, Z.BOIL, 'v');
    addDoor('Boiler House', 1250, row(58, 61, 43), Z.YARD, Z.BOIL, 'h');
    addDoor('Frozen Lake', 1500, col(72, 28, 31), Z.YARD, Z.LAKE, 'v');
    M.gate = addDoor('Engine Shed', 0, row(34, 37, 45), Z.BOIL, Z.SHED, 'h', true);

    // ---- barricaded windows ----
    addWindow(28, 19, 0, 1, Z.CON); addWindow(42, 19, 0, 1, Z.CON);
    addWindow(25, 22, 1, 0, Z.CON); addWindow(46, 22, -1, 0, Z.CON);
    addWindow(31, 36, 0, -1, Z.CON); addWindow(40, 36, 0, -1, Z.CON);
    addWindow(28, 2, 0, 1, Z.PLAT); addWindow(48, 2, 0, 1, Z.PLAT); addWindow(64, 2, 0, 1, Z.PLAT);
    addWindow(7, 6, 1, 0, Z.PLAT); addWindow(72, 9, -1, 0, Z.PLAT); addWindow(20, 14, 0, -1, Z.PLAT);
    addWindow(3, 22, 1, 0, Z.MARKET); addWindow(3, 34, 1, 0, Z.MARKET); addWindow(3, 44, 1, 0, Z.MARKET);
    addWindow(7, 17, 0, 1, Z.MARKET); addWindow(19, 38, -1, 0, Z.MARKET);
    addWindow(71, 20, -1, 0, Z.YARD); addWindow(71, 37, -1, 0, Z.YARD); addWindow(56, 17, 0, 1, Z.YARD);
    addWindow(66, 42, 0, -1, Z.YARD); addWindow(51, 36, 1, 0, Z.YARD);
    addWindow(30, 56, 0, -1, Z.BOIL); addWindow(50, 56, 0, -1, Z.BOIL); addWindow(63, 50, -1, 0, Z.BOIL);
    addWindow(26, 45, 0, 1, Z.BOIL);
    addWindow(92, 18, -1, 0, Z.LAKE); addWindow(92, 30, -1, 0, Z.LAKE); addWindow(92, 42, -1, 0, Z.LAKE);
    addWindow(84, 13, 0, 1, Z.LAKE); addWindow(80, 46, 0, -1, Z.LAKE); addWindow(73, 40, 1, 0, Z.LAKE);

    // ---- risers: the dead climb out of the snow ----
    M.risers = [
      { tx: 18, ty: 9, zone: Z.PLAT }, { tx: 57, ty: 12, zone: Z.PLAT },
      { tx: 8, ty: 40, zone: Z.MARKET }, { tx: 14, ty: 24, zone: Z.MARKET },
      { tx: 67, ty: 24, zone: Z.YARD }, { tx: 56, ty: 39, zone: Z.YARD },
      { tx: 28, ty: 53, zone: Z.BOIL }, { tx: 59, ty: 53, zone: Z.BOIL },
      { tx: 77, ty: 17, zone: Z.LAKE }, { tx: 89, ty: 43, zone: Z.LAKE }, { tx: 88, ty: 24, zone: Z.LAKE },
    ].map((r) => Object.assign(r, { x: (r.tx + 0.5) * T, y: (r.ty + 0.5) * T, cool: 0 }));

    // ---- props ----
    // concourse: clock tower in the middle, ticket kiosks, benches, a luggage cart
    addProp('clock', 35, 27, 2, 2, true);
    addProp('kiosk', 29, 23, 2, 2, true);
    addProp('kiosk', 41, 31, 2, 2, true);
    addProp('bench', 30, 31, 2, 1, false);
    addProp('bench', 40, 24, 2, 1, false);
    addProp('cart', 44, 27, 1, 1, false);
    // platforms: a stalled night train on track 1, lamp posts and benches on the island platform
    addProp('railcar', 14, 5, 12, 2, true);
    addProp('lampost', 22, 8, 1, 1, true);
    addProp('lampost', 40, 8, 1, 1, true);
    addProp('lampost', 58, 8, 1, 1, true);
    addProp('bench', 30, 8, 2, 1, false);
    addProp('bench', 49, 8, 2, 1, false);
    addProp('cart', 66, 12, 1, 1, false);
    // market street: covered stalls down the middle, a snowed-in well, crates
    addProp('stall', 8, 23, 2, 2, true, { hue: 8 });
    addProp('stall', 13, 29, 2, 2, true, { hue: 140 });
    addProp('stall', 8, 35, 2, 2, true, { hue: 210 });
    addProp('stall', 13, 41, 2, 2, true, { hue: 40 });
    addProp('well', 10, 30, 1, 1, true);
    addProp('crate', 5, 46, 2, 1, false);
    addProp('barrel', 17, 45, 1, 1, false);
    // freight yard: shipping containers make lanes, crates and barrels
    addProp('container', 55, 21, 5, 2, true, { hue: 200 });
    addProp('container', 64, 27, 2, 5, true, { hue: 12 });
    addProp('container', 55, 33, 5, 2, true, { hue: 95 });
    addProp('crate', 66, 20, 2, 1, false);
    addProp('crate', 60, 38, 2, 1, false);
    addProp('barrel', 53, 28, 1, 1, false);
    addProp('barrel', 69, 34, 1, 1, false);
    // boiler house: three big boilers and pipe runs
    addProp('boiler', 28, 49, 3, 3, true);
    addProp('boiler', 40, 50, 3, 3, true);
    addProp('boiler', 53, 49, 3, 3, true);
    addProp('pipes', 33, 53, 4, 1, false);
    addProp('pipes', 46, 47, 1, 3, false);
    addProp('barrel', 61, 47, 1, 1, false);
    // engine shed: buffer stops either side of the machine
    addProp('buffer', 30, 38, 1, 1, true);
    addProp('buffer', 41, 38, 1, 1, true);
    // frozen lake: the bandstand island (circle the horde round it), snowy pines, a frozen rowing boat
    addProp('gazebo', 81, 28, 4, 4, true);
    addProp('pine', 76, 21, 1, 1, true);
    addProp('pine', 88, 20, 1, 1, true);
    addProp('pine', 76, 38, 1, 1, true);
    addProp('pine', 89, 37, 1, 1, true);
    addProp('boat', 86, 33, 2, 1, false);

    // ---- perks (need their zone's power) ----
    M.perkSpots = [
      { perk: 'wind', tx: 45, ty: 35 },
      { perk: 'quick', tx: 4, ty: 27 },
      { perk: 'burner', tx: 8, ty: 13 },
      { perk: 'thick', tx: 70, ty: 41 },
      { perk: 'twin', tx: 62, ty: 55 },
    ];
    for (const s of M.perkSpots) s.prop = addProp('perk', s.tx, s.ty, 1, 1, true, { perk: s.perk });

    // ---- Prize Crate spots ----
    M.boxSpots = [
      { tx: 18, ty: 33, w: 1, h: 2, zone: Z.MARKET },
      { tx: 44, ty: 3, w: 2, h: 1, zone: Z.PLAT },
      { tx: 52, ty: 31, w: 1, h: 2, zone: Z.YARD },
      { tx: 44, ty: 55, w: 2, h: 1, zone: Z.BOIL },
      { tx: 91, ty: 25, w: 1, h: 2, zone: Z.LAKE },
    ];
    for (const s of M.boxSpots) addProp('box', s.tx, s.ty, s.w, s.h, true);

    // ---- Overclocker, against the Engine Shed's back wall ----
    M.pap = { tx: 35, ty: 38, w: 2, h: 1 };
    addProp('pap', 35, 38, 2, 1, true);

    // ---- wall-buys: cheap at the start, strong deeper in (7 guns) ----
    M.wallbuys = [
      { weapon: 'ranger', tx: 31, ty: 19, fx: 0, fy: 1 }, // concourse 750
      { weapon: 'bulldog', tx: 36, ty: 36, fx: 0, fy: -1 }, // concourse 750
      { weapon: 'buzzsaw', tx: 12, ty: 17, fx: 0, fy: 1 }, // market 1250
      { weapon: 'kestrel', tx: 52, ty: 14, fx: 0, fy: -1 }, // platforms 1750
      { weapon: 'riptide', tx: 71, ty: 24, fx: -1, fy: 0 }, // freight 2000
      { weapon: 'sixgun', tx: 38, ty: 56, fx: 0, fy: -1 }, // boiler house 1750
      { weapon: 'anvil', tx: 73, ty: 18, fx: 1, fy: 0 }, // frozen lake 3000
    ];

    // ---- generators: one per zone, the boiler house one is the main breaker ----
    M.generators = [
      { zone: Z.CON, tx: 46, ty: 31, fx: -1, fy: 0 },
      { zone: Z.PLAT, tx: 7, ty: 10, fx: 1, fy: 0 },
      { zone: Z.MARKET, tx: 11, ty: 49, fx: 0, fy: -1 },
      { zone: Z.YARD, tx: 60, ty: 17, fx: 0, fy: 1 },
      { zone: Z.BOIL, tx: 46, ty: 45, fx: 0, fy: 1 },
      { zone: Z.SHED, tx: 43, ty: 41, fx: -1, fy: 0 },
      { zone: Z.LAKE, tx: 79, ty: 13, fx: 0, fy: 1 },
    ];
    for (const g of M.generators) {
      g.x = (g.tx + 0.5) * T;
      g.y = (g.ty + 0.5) * T;
    }
    M.powerSwitch = M.generators[4];

    M.fuseSpots = [
      [27, 21], [44, 34], [26, 34],
      [9, 3], [70, 13], [36, 9], [62, 4],
      [5, 19], [17, 47], [6, 39], [16, 53],
      [69, 40], [53, 19], [62, 30],
      [26, 55], [61, 46], [48, 51],
      [30, 42], [42, 42],
      [75, 15], [90, 44], [90, 15], [75, 44],
    ].map(([tx, ty]) => ({ tx, ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T, zone: M.zone[idx(tx, ty)] }));

    // ---- the one trap: the Night Express ----
    M.traps = [
      { kind: 'zap', x: SLIDE.x0, y: SLIDE.y, w: SLIDE.x1 - SLIDE.x0 + 1, h: SLIDE.h, sw: { tx: 39, ty: 14, fx: 0, fy: -1 }, slide: SLIDE, hint: 'The Night Express storms the platforms · stay off the tracks' },
    ].map((t, i) => Object.assign(t, { id: i, rx: t.x * T, ry: t.y * T, rw: t.w * T, rh: t.h * T, state: 'idle', t: 0, playerT: 0, sfxT: 0 }));

    // ---- panic room: shutter at x19 (approached from the west), console on the east wall ----
    M.safeRoom = {
      rx: 20 * T, ry: 51 * T, rw: 4 * T, rh: 3 * T,
      door: [[19, 51], [19, 52]], dx: 19 * T, dy: 51 * T, dw: T, dh: 2 * T,
      outside: { x: 18.5 * T, y: 52 * T },
      console: { tx: 24, ty: 52, fx: -1, fy: 0 },
      hatch: { tx: 20, ty: 53 },
      exit: { tx: 27, ty: 33 },
      state: 'open', t: 0, cd: 0, warned: false, bangT: 0, hatchT: 0,
    };

    // ---- Overclocker lockdown: the Engine Shed (x29..42 y38..43), one 4-wide doorway at y44 ----
    M.papRoom = { x0: 29, y0: 38, x1: 42, y1: 43, gates: row(34, 37, 44).map(([tx, ty]) => ({ tx, ty })) };

    // ---- vendors: armour in the concourse, cryo grenades on Market Street ----
    M.vendors = [
      { kind: 'armor', tx: 25, ty: 32, fx: 1, fy: 0 },
      { kind: 'tactical', item: 'cryo', tx: 3, ty: 29, fx: 1, fy: 0 },
    ];
    for (const v of M.vendors.concat(M.traps.map((t) => t.sw), [M.safeRoom.console])) {
      v.x = (v.tx + 0.5) * T;
      v.y = (v.ty + 0.5) * T;
    }
    M.spawn = { x: 36 * T, y: 32 * T };

    // ---- side quests (js/quest_frostfall.js): three relics, a workbench, three signal lamps ----
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    M.quest = {
      map: 'frostfall',
      relics: [
        Object.assign({ id: 0, name: 'Cryo Core', color: '#8fe9ff' }, pick([{ tx: 5, ty: 47 }, { tx: 71, ty: 3 }, { tx: 91, ty: 14 }])),
        Object.assign({ id: 1, name: 'Coil Barrel', color: '#ffd426' }, pick([{ tx: 70, ty: 18 }, { tx: 25, ty: 47 }, { tx: 74, ty: 45 }])),
        Object.assign({ id: 2, name: 'Frost Stock', color: '#c9b8ff' }, pick([{ tx: 8, ty: 7 }, { tx: 53, ty: 41 }, { tx: 62, ty: 52 }])),
      ],
      bench: { tx: 48, ty: 46, w: 2, h: 1 },
      notice: { tx: 38, ty: 19, fx: 0, fy: 1 },
      lamps: [
        { tx: 17, ty: 18 }, // Market Street, top right corner
        { tx: 69, ty: 3 }, // far end of platform 1
        { tx: 86, ty: 14 }, // Frozen Lake, north shore
      ],
    };
    addProp('bench_w', M.quest.bench.tx, M.quest.bench.ty, 2, 1, false);

    // ---- lights: sodium platform lamps, warm concourse chandeliers, cold moonlight that never goes out ----
    light(36, 26, 330, '#ffd89b', Z.CON, true);
    light(29, 22, 240, '#ffc46b', Z.CON); light(43, 22, 240, '#ffc46b', Z.CON);
    light(29, 33, 240, '#ffc46b', Z.CON); light(43, 33, 240, '#ffc46b', Z.CON);
    light(35, 18, 160, '#ffc46b', Z.CON);
    light(22.5, 8.5, 260, '#ffb35c', Z.PLAT); light(40.5, 8.5, 260, '#ffb35c', Z.PLAT); light(58.5, 8.5, 260, '#ffb35c', Z.PLAT);
    light(12, 11, 220, '#ffb35c', Z.PLAT); light(68, 6, 220, '#ffb35c', Z.PLAT);
    light(30, 6, 200, '#9fc8ff', Z.PLAT, true); light(52, 12, 200, '#9fc8ff', Z.PLAT, true);
    light(11, 21, 240, '#ff9e6b', Z.MARKET); light(11, 32, 260, '#ffb35c', Z.MARKET); light(11, 44, 240, '#ff9e6b', Z.MARKET);
    light(6, 27, 180, '#9fc8ff', Z.MARKET, true); light(17, 51, 150, '#9fc8ff', Z.MARKET, true);
    light(21.9, 52.5, 150, '#3dff8b', Z.MARKET, true); // panic room
    light(57, 25, 260, '#e8f0a0', Z.YARD); light(66, 22, 220, '#ffb35c', Z.YARD); light(57, 38, 240, '#e8f0a0', Z.YARD);
    light(68, 37, 200, '#ffb35c', Z.YARD); light(61, 30, 190, '#9fc8ff', Z.YARD, true);
    light(30, 48, 240, '#ff8a4a', Z.BOIL); light(41, 49, 260, '#ff8a4a', Z.BOIL); light(54, 48, 240, '#ff8a4a', Z.BOIL);
    light(36, 54, 200, '#ffc46b', Z.BOIL); light(49, 47, 170, '#ffd89b', Z.BOIL); light(45, 52, 180, '#ff5a3a', Z.BOIL, true);
    light(32, 41, 230, '#ff5ad1', Z.SHED); light(40, 41, 230, '#8fd8ff', Z.SHED);
    light(82.5, 22, 300, '#cfe0ff', Z.LAKE); light(82.5, 38, 300, '#cfe0ff', Z.LAKE); light(77, 30, 240, '#ffd89b', Z.LAKE);
    light(88.5, 30, 240, '#ffd89b', Z.LAKE); light(83, 30, 260, '#9fc8ff', Z.LAKE, true);
  }

  /* ------------------------------------------------------------------ */
  /* per-frame: the Night Express slides along the platforms              */
  /* ------------------------------------------------------------------ */
  function update() {
    for (const tr of M.traps) {
      const S = tr.slide;
      if (!S) continue;
      if (tr.state === 'active') {
        const span = S.x1 - S.x0 + 1 - S.w;
        const ph = ((tr.run || 0) * S.speed) % (2 * span);
        const x = S.x0 + (ph < span ? ph : 2 * span - ph);
        tr.rx = x * T;
        tr.rw = S.w * T;
        tr.w = S.w;
      } else if (tr.rw !== (S.x1 - S.x0 + 1) * T) {
        tr.rx = S.x0 * T;
        tr.w = S.x1 - S.x0 + 1;
        tr.rw = tr.w * T;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* art                                                                 */
  /* ------------------------------------------------------------------ */
  const TRACK_ROWS = { 5: 1, 6: 1, 10: 1, 11: 1 };
  /** Rough elliptical ice sheet in the middle of the lake. */
  const onIce = (x, y) => {
    const dx = (x + 0.5 - 83) / 7.6, dy = (y + 0.5 - 30) / 13.4;
    return dx * dx + dy * dy < 1;
  };
  const FLOOR_TEX = ['ff_concourse', 'ff_platform', 'ff_cobble', 'ff_yard', 'ff_boiler', 'ff_shed', 'ff_snow'];
  // darkening over the textures so zombies read clearly (index = zone id)
  const FLOOR_DIM = [0.2, 0.22, 0.3, 0.3, 0.2, 0.25, 0.32];

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  const tex = (g, key, x, y) => !!(GW.Assets && GW.Assets.tile(g, key, x, y, T));

  function floorTile(g, x, y, z) {
    const px = x * T, py = y * T, h = U.hash(x, y, 31);
    let key = FLOOR_TEX[z], dim = FLOOR_DIM[z], fb = null;
    if (z === Z.PLAT && TRACK_ROWS[y]) {
      key = 'ff_ballast';
      dim = 0.28;
      fb = 'hsl(220,6%,' + (22 + h * 6) + '%)';
    }
    if (!tex(g, key, x, y)) {
      const FB = ['hsl(36,22%,', 'hsl(28,20%,', 'hsl(30,10%,', 'hsl(215,14%,', 'hsl(210,6%,', 'hsl(40,30%,', 'hsl(214,22%,'];
      g.fillStyle = fb || FB[z] + (z === Z.LAKE || z === Z.YARD ? 62 : 30) + h * 6 + '%)';
      if (!fb && (z === Z.LAKE || z === Z.YARD)) g.fillStyle = 'hsl(214,18%,' + (60 + h * 8) + '%)';
      g.fillRect(px, py, T, T);
      if (z === Z.CON && (x + y) % 2) {
        g.fillStyle = 'rgba(10,8,6,0.55)';
        g.fillRect(px, py, T, T);
      } else if (z === Z.PLAT && !TRACK_ROWS[y]) {
        g.strokeStyle = 'rgba(30,18,10,0.45)';
        g.lineWidth = 2;
        for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(px, py + 8 + k * 16); g.lineTo(px + T, py + 8 + k * 16); g.stroke(); }
      } else if (z !== Z.LAKE && z !== Z.YARD) {
        g.strokeStyle = 'rgba(0,0,0,0.2)';
        g.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
      }
    }
    g.fillStyle = 'rgba(4,8,20,' + dim + ')';
    g.fillRect(px, py, T, T);
  }

  /** The lake's ice sheet: one smooth ellipse (texture as a pattern at the floor's 96px-per-tile scale). */
  function paintIce(g) {
    g.save();
    g.beginPath();
    g.ellipse(83 * T, 30 * T, 7.6 * T, 13.4 * T, 0, 0, U.TAU);
    g.clip();
    const im = GW.Assets && GW.Assets.get && GW.Assets.get('ff_ice');
    if (im) {
      const pat = g.createPattern(im, 'repeat');
      if (pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix([T / 96, 0, 0, T / 96, 0, 0]));
      g.fillStyle = pat;
    } else g.fillStyle = '#3f5f80';
    g.fillRect(75 * T, 16 * T, 17 * T, 28 * T);
    const gr = g.createRadialGradient(83 * T, 30 * T, 2 * T, 83 * T, 30 * T, 13 * T);
    gr.addColorStop(0, 'rgba(4,10,26,0.12)');
    gr.addColorStop(1, 'rgba(4,10,26,0.35)');
    g.fillStyle = gr;
    g.fillRect(75 * T, 16 * T, 17 * T, 28 * T);
    g.restore();
  }

  function paintTracks(g) {
    // sleepers + two steel rails on each track (platform rows 5..6 and 10..11), and a spur in the yard
    const track = (x0, x1, yc) => {
      g.fillStyle = 'rgba(52,36,24,0.85)';
      for (let x = x0 * T + 6; x < x1 * T; x += 22) g.fillRect(x, yc - 30, 10, 60);
      for (const off of [-17, 17]) {
        g.fillStyle = 'rgba(20,22,28,0.9)';
        g.fillRect(x0 * T, yc + off - 3, (x1 - x0) * T, 6);
        g.fillStyle = 'rgba(190,205,225,0.55)';
        g.fillRect(x0 * T, yc + off - 2, (x1 - x0) * T, 2);
      }
    };
    track(8, 72, 6 * T);
    track(8, 72, 11 * T);
    // platform edges: yellow safety lines
    g.fillStyle = 'rgba(255,212,38,0.55)';
    for (const y of [5, 10]) g.fillRect(8 * T, y * T - 4, 64 * T, 3);
    for (const y of [7, 12]) g.fillRect(8 * T, y * T + 1, 64 * T, 3);
    // yard spur
    g.save();
    g.globalAlpha = 0.7;
    g.fillStyle = 'rgba(52,36,24,0.85)';
    for (let y = 18 * T + 6; y < 42 * T; y += 22) g.fillRect(62 * T - 6, y, 60, 10);
    for (const off of [-17, 17]) {
      g.fillStyle = 'rgba(20,22,28,0.9)';
      g.fillRect(62 * T + 24 + off - 3, 18 * T, 6, 24 * T);
      g.fillStyle = 'rgba(190,205,225,0.55)';
      g.fillRect(62 * T + 24 + off - 2, 18 * T, 2, 24 * T);
    }
    g.restore();
  }

  function paintDetails(g) {
    // concourse: a brass compass rose under the clock
    g.save();
    g.strokeStyle = 'rgba(214,170,90,0.55)';
    g.lineWidth = 4;
    g.beginPath(); g.arc(36 * T, 28 * T, 150, 0, U.TAU); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.arc(36 * T, 28 * T, 170, 0, U.TAU); g.stroke();
    g.fillStyle = 'rgba(214,170,90,0.35)';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * U.TAU, r = i % 2 ? 120 : 165;
      g.beginPath();
      g.moveTo(36 * T + Math.cos(a) * r, 28 * T + Math.sin(a) * r);
      g.lineTo(36 * T + Math.cos(a + 0.18) * 70, 28 * T + Math.sin(a + 0.18) * 70);
      g.lineTo(36 * T + Math.cos(a - 0.18) * 70, 28 * T + Math.sin(a - 0.18) * 70);
      g.fill();
    }
    // concourse: red carpet runner from the platforms door to the clock
    g.fillStyle = 'rgba(120,20,30,0.45)';
    g.fillRect(33.4 * T, 17 * T, 3.2 * T, 8 * T);
    g.strokeStyle = 'rgba(214,170,90,0.5)';
    g.lineWidth = 2;
    g.strokeRect(33.4 * T, 17 * T, 3.2 * T, 8 * T);
    // boiler house: hazard stripes along the walkway and under the power gate
    g.fillStyle = 'rgba(255,190,40,0.32)';
    for (let x = 25; x < 63; x += 2) g.fillRect(x * T, 46 * T + 2, T, 6);
    for (let i = 0; i < 8; i++) {
      g.save();
      g.beginPath();
      g.rect(34 * T, 44 * T, 4 * T, T);
      g.clip();
      g.fillStyle = i % 2 ? 'rgba(20,20,20,0.5)' : 'rgba(255,200,40,0.5)';
      g.translate(34 * T + i * 28 - 40, 44 * T);
      g.rotate(-0.6);
      g.fillRect(0, 0, 14, 120);
      g.restore();
    }
    // engine shed: inspection pit rails leading to the Overclocker
    g.fillStyle = 'rgba(15,15,20,0.6)';
    g.fillRect(34.6 * T, 39 * T, 2.8 * T, 5 * T);
    g.fillStyle = 'rgba(200,210,230,0.45)';
    g.fillRect(34.8 * T, 39 * T, 4, 5 * T);
    g.fillRect(37.2 * T - 4, 39 * T, 4, 5 * T);
    // frozen lake: cracks in the ice and a snowy shore line
    g.strokeStyle = 'rgba(230,245,255,0.35)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      let x = (78 + U.hash(i, 1, 7) * 10) * T, y = (19 + U.hash(i, 2, 7) * 22) * T;
      if (!onIce(Math.floor(x / T), Math.floor(y / T))) continue;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (U.hash(i, k, 9) - 0.5) * 90;
        y += (U.hash(i, k, 11) - 0.5) * 90;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.strokeStyle = 'rgba(240,248,255,0.45)';
    g.lineWidth = 5;
    g.beginPath(); g.ellipse(83 * T, 30 * T, 7.6 * T, 13.4 * T, 0, 0, U.TAU); g.stroke();
    // snow drifts along the walls of the outdoor zones
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const z = M.zone[idx(x, y)];
        if (M.tile(x, y) !== TT.FLOOR || (z !== Z.MARKET && z !== Z.YARD && z !== Z.LAKE && z !== Z.PLAT)) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (M.tile(x + dx, y + dy) !== TT.WALL) continue;
          const h = U.hash(x, y, dx * 3 + dy * 5 + 40);
          const gr = g.createLinearGradient(
            (x + 0.5 + dx * 0.5) * T, (y + 0.5 + dy * 0.5) * T,
            (x + 0.5 + dx * (0.5 - 0.55 - h * 0.25)) * T, (y + 0.5 + dy * (0.5 - 0.55 - h * 0.25)) * T);
          gr.addColorStop(0, 'rgba(225,236,255,0.55)');
          gr.addColorStop(1, 'rgba(225,236,255,0)');
          g.fillStyle = gr;
          g.fillRect(x * T, y * T, T, T);
        }
      }
    // signs
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const L = GW.L && GW.L.t ? GW.L.t : (s) => s;
    for (const s of SIGNS) {
      g.font = '700 ' + s.size + 'px "Trebuchet MS", Tahoma, sans-serif';
      g.fillStyle = 'rgba(4,6,14,0.6)';
      g.fillText(L(s.text), s.tx * T + 1.5, s.ty * T + 1.5);
      g.fillStyle = s.color || 'rgba(235,240,250,0.72)';
      g.fillText(L(s.text), s.tx * T, s.ty * T);
    }
    g.restore();
  }

  /* ---- props ---- */
  function shadow(g, x, y, w, h) {
    g.fillStyle = 'rgba(0,4,12,0.4)';
    g.fillRect(x + 5, y + 7, w - 2, h - 2);
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function snowCap(g, x, y, w, h, a) {
    g.fillStyle = 'rgba(235,242,255,' + (a || 0.75) + ')';
    for (let i = 0; i < Math.max(2, (w * h) / 500); i++) {
      const hx = x + U.hash(x, i, 3) * w, hy = y + U.hash(y, i, 5) * h;
      g.beginPath();
      g.ellipse(hx, hy, 6 + U.hash(i, x, 7) * 10, 4 + U.hash(i, y, 9) * 6, 0, 0, U.TAU);
      g.fill();
    }
  }

  function paintProp(g, p, top) {
    const x = p.tx * T, y = p.ty * T - (top ? 16 : 0), w = p.w * T, h = p.h * T;
    g.save();
    if (!top) shadow(g, x, y, w, h);
    else {
      g.fillStyle = 'rgba(0,4,12,0.35)';
      g.fillRect(x + 4, y + 16, w - 2, h - 2);
    }
    switch (p.kind) {
      case 'railcar': {
        rrect(g, x + 2, y + 6, w - 4, h - 12, 14);
        g.fillStyle = '#23402f';
        g.fill();
        g.strokeStyle = '#0d1a12';
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = '#3d6a4c';
        g.fillRect(x + 10, y + h / 2 - 6, w - 20, 12); // roof ridge
        g.fillStyle = '#c9a24a';
        g.fillRect(x + 4, y + 10, w - 8, 3);
        g.fillRect(x + 4, y + h - 13, w - 8, 3);
        for (let i = 0; i < p.w; i++) { // roof vents, with snow
          g.fillStyle = '#16261c';
          g.fillRect(x + i * T + 18, y + h / 2 - 9, 12, 18);
        }
        snowCap(g, x + 6, y + 10, w - 12, h - 20, 0.7);
        g.fillStyle = '#1b1b1b';
        g.fillRect(x - 4, y + 22, 6, h - 44); // couplers
        g.fillRect(x + w - 2, y + 22, 6, h - 44);
        break;
      }
      case 'clock': {
        const cx = x + w / 2, cy = y + h / 2;
        g.fillStyle = '#3a2c22';
        g.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * U.TAU + Math.PI / 8; g.lineTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46); }
        g.closePath();
        g.fill();
        g.strokeStyle = '#c9a24a';
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = '#efe6cc';
        g.beginPath(); g.arc(cx, cy, 30, 0, U.TAU); g.fill();
        g.strokeStyle = '#2a2018';
        g.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * U.TAU;
          g.beginPath(); g.moveTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24); g.lineTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28); g.stroke();
        }
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - 20); g.moveTo(cx, cy); g.lineTo(cx + 14, cy + 4); g.stroke(); // ten to midnight
        break;
      }
      case 'kiosk': {
        g.fillStyle = '#4a2f22';
        g.fillRect(x + 4, y + 4, w - 8, h - 8);
        g.fillStyle = '#6b4530';
        g.fillRect(x + 10, y + 10, w - 20, h - 20);
        g.fillStyle = '#c9a24a';
        g.fillRect(x + 4, y + 4, w - 8, 6);
        g.fillStyle = 'rgba(255,220,140,0.8)';
        g.font = '700 9px Tahoma, sans-serif';
        g.textAlign = 'center';
        g.fillText('TICKETS', x + w / 2, y + h / 2 + 3);
        break;
      }
      case 'bench': {
        g.fillStyle = '#5a3a22';
        for (let i = 0; i < 3; i++) g.fillRect(x + 4, y + 10 + i * 10, w - 8, 7);
        g.fillStyle = '#1e1e22';
        g.fillRect(x + 6, y + 8, 4, h - 16);
        g.fillRect(x + w - 10, y + 8, 4, h - 16);
        break;
      }
      case 'cart': {
        g.fillStyle = '#3c3c44';
        g.fillRect(x + 6, y + 8, w - 12, h - 16);
        g.fillStyle = '#7a5a34';
        g.fillRect(x + 9, y + 11, 16, 12);
        g.fillStyle = '#5c6e7a';
        g.fillRect(x + 22, y + 22, 16, 14);
        break;
      }
      case 'lampost': {
        const cx = x + w / 2, cy = y + h / 2;
        g.fillStyle = '#18181c';
        g.beginPath(); g.arc(cx, cy, 13, 0, U.TAU); g.fill();
        g.fillStyle = '#2c2c34';
        g.beginPath(); g.arc(cx, cy, 8, 0, U.TAU); g.fill();
        g.fillStyle = 'rgba(255,200,110,0.9)';
        g.beginPath(); g.arc(cx, cy, 4, 0, U.TAU); g.fill();
        break;
      }
      case 'stall': {
        // a market stall seen from above: a pitched, striped canvas roof with a scalloped front edge
        const cx = x + w / 2;
        g.fillStyle = '#2a1e16';
        g.fillRect(x + 6, y + 8, w - 12, h - 12);
        for (let i = 0; i < 6; i++) {
          const sx = x + 4 + (i * (w - 8)) / 6, sw = (w - 8) / 6 + 0.5;
          g.fillStyle = i % 2 ? '#d9d2c2' : 'hsl(' + p.hue + ',50%,38%)';
          g.fillRect(sx, y + 4, sw, h - 16);
          g.beginPath();
          g.arc(sx + sw / 2, y + h - 12, sw / 2, 0, Math.PI);
          g.fill();
        }
        // ridge + shading on the far half of the roof
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(x + 4, y + 4, w - 8, (h - 16) / 2);
        g.fillStyle = '#5a4030';
        g.fillRect(x + 4, y + 4 + (h - 16) / 2 - 2, w - 8, 4);
        g.fillStyle = 'rgba(235,242,255,0.8)';
        g.beginPath(); g.ellipse(cx - 10, y + 14, 16, 6, 0.1, 0, U.TAU); g.fill();
        g.beginPath(); g.ellipse(cx + 14, y + 20, 10, 5, -0.2, 0, U.TAU); g.fill();
        break;
      }
      case 'well': {
        const cx = x + w / 2, cy = y + h / 2;
        g.fillStyle = '#5a5a60';
        g.beginPath(); g.arc(cx, cy, 20, 0, U.TAU); g.fill();
        g.fillStyle = '#0e1420';
        g.beginPath(); g.arc(cx, cy, 12, 0, U.TAU); g.fill();
        g.fillStyle = 'rgba(235,242,255,0.8)';
        g.beginPath(); g.arc(cx - 6, cy - 9, 9, Math.PI, U.TAU); g.fill();
        break;
      }
      case 'crate': {
        g.fillStyle = '#6b4a2c';
        g.fillRect(x + 4, y + 4, w - 8, h - 8);
        g.strokeStyle = '#3a2614';
        g.lineWidth = 3;
        g.strokeRect(x + 5, y + 5, w - 10, h - 10);
        g.beginPath(); g.moveTo(x + 6, y + 6); g.lineTo(x + w - 6, y + h - 6); g.stroke();
        snowCap(g, x + 8, y + 6, w - 16, 10, 0.7);
        break;
      }
      case 'barrel': {
        g.fillStyle = '#2d4a6a';
        g.beginPath(); g.arc(x + w / 2, y + h / 2, 17, 0, U.TAU); g.fill();
        g.strokeStyle = '#132233';
        g.lineWidth = 3;
        g.stroke();
        g.beginPath(); g.arc(x + w / 2, y + h / 2, 9, 0, U.TAU); g.stroke();
        break;
      }
      case 'container': {
        const base = 'hsl(' + p.hue + ',45%,30%)';
        g.fillStyle = base;
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        const horiz = p.w > p.h;
        for (let k = 8; k < (horiz ? w : h) - 4; k += 9) {
          g.beginPath();
          if (horiz) { g.moveTo(x + k, y + 4); g.lineTo(x + k, y + h - 4); } else { g.moveTo(x + 4, y + k); g.lineTo(x + w - 4, y + k); }
          g.stroke();
        }
        g.strokeStyle = 'hsl(' + p.hue + ',40%,16%)';
        g.lineWidth = 3;
        g.strokeRect(x + 2, y + 2, w - 4, h - 4);
        snowCap(g, x + 8, y + 8, w - 16, h - 16, 0.6);
        break;
      }
      case 'boiler': {
        const cx = x + w / 2, cy = y + h / 2;
        const gr = g.createRadialGradient(cx - 20, cy - 20, 10, cx, cy, 70);
        gr.addColorStop(0, '#8a6a4a');
        gr.addColorStop(1, '#3a2618');
        g.fillStyle = gr;
        g.beginPath(); g.arc(cx, cy, 66, 0, U.TAU); g.fill();
        g.strokeStyle = '#1e140c';
        g.lineWidth = 4;
        g.stroke();
        g.fillStyle = '#c9a24a';
        for (let i = 0; i < 16; i++) { const a = (i / 16) * U.TAU; g.beginPath(); g.arc(cx + Math.cos(a) * 58, cy + Math.sin(a) * 58, 2.5, 0, U.TAU); g.fill(); }
        g.fillStyle = '#26262c';
        g.beginPath(); g.arc(cx, cy, 22, 0, U.TAU); g.fill();
        g.fillStyle = 'rgba(255,110,40,0.85)';
        g.beginPath(); g.arc(cx, cy, 10, 0, U.TAU); g.fill();
        break;
      }
      case 'pipes': {
        const horiz = p.w > p.h;
        for (let k = 0; k < 2; k++) {
          g.fillStyle = k ? '#6a5040' : '#7a7f88';
          if (horiz) g.fillRect(x, y + 10 + k * 16, w, 10); else g.fillRect(x + 10 + k * 16, y, 10, h);
        }
        break;
      }
      case 'buffer': {
        g.fillStyle = '#8a1a1a';
        g.fillRect(x + 6, y + 8, w - 12, h - 16);
        g.fillStyle = '#ffd426';
        g.fillRect(x + 6, y + 8, w - 12, 6);
        g.fillStyle = '#222';
        g.beginPath(); g.arc(x + 15, y + h - 12, 6, 0, U.TAU); g.arc(x + w - 15, y + h - 12, 6, 0, U.TAU); g.fill();
        break;
      }
      case 'gazebo': {
        const cx = x + w / 2, cy = y + h / 2, r = w / 2 - 6;
        g.fillStyle = '#2a3348';
        g.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * U.TAU + Math.PI / 8; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        g.closePath();
        g.fill();
        g.strokeStyle = '#c9a24a';
        g.lineWidth = 3;
        g.stroke();
        g.strokeStyle = 'rgba(201,162,74,0.6)';
        g.lineWidth = 2;
        for (let i = 0; i < 8; i++) { const a = (i / 8) * U.TAU + Math.PI / 8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
        g.fillStyle = 'rgba(235,242,255,0.85)';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * U.TAU;
          g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, 18, 11, a, 0, U.TAU); g.fill();
        }
        g.fillStyle = '#c9a24a';
        g.beginPath(); g.arc(cx, cy, 8, 0, U.TAU); g.fill();
        break;
      }
      case 'pine': {
        const cx = x + w / 2, cy = y + h / 2;
        for (let k = 0; k < 3; k++) {
          const r = 34 - k * 9;
          g.fillStyle = k === 0 ? '#14301f' : k === 1 ? '#1c3f29' : '#275236';
          g.beginPath();
          for (let i = 0; i < 16; i++) { const a = (i / 16) * U.TAU + k * 0.2, rr = i % 2 ? r * 0.62 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
          g.closePath();
          g.fill();
        }
        g.fillStyle = 'rgba(235,242,255,0.75)';
        for (let i = 0; i < 7; i++) { const a = U.hash(p.tx, i, 3) * U.TAU, rr = 6 + U.hash(p.ty, i, 5) * 22; g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 4 + U.hash(i, p.tx, 7) * 4, 0, U.TAU); g.fill(); }
        break;
      }
      case 'boat': {
        g.fillStyle = '#5a3a22';
        g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2 - 4, h / 2 - 8, 0, 0, U.TAU); g.fill();
        g.fillStyle = '#3a2416';
        g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2 - 12, h / 2 - 14, 0, 0, U.TAU); g.fill();
        snowCap(g, x + 14, y + 16, w - 28, 10, 0.8);
        break;
      }
      case 'bench_w': {
        // the workbench (quest_frostfall.js paints what is mounted on it)
        g.fillStyle = '#4a3220';
        g.fillRect(x + 3, y + 6, w - 6, h - 12);
        g.fillStyle = '#6e4c30';
        g.fillRect(x + 6, y + 9, w - 12, h - 18);
        g.strokeStyle = '#25170c';
        g.lineWidth = 2;
        g.strokeRect(x + 3, y + 6, w - 6, h - 12);
        g.fillStyle = '#7a7f88';
        g.fillRect(x + 8, y + 12, 10, 6); // vice
        break;
      }
      default: {
        // perk / box / pap bases: render.js draws the machines on top
        g.fillStyle = '#2a2a33';
        g.fillRect(x + 4, y + 4, w - 8, h - 8);
      }
    }
    g.restore();
  }

  /** The concourse notice board (quest_frostfall.js): pinned papers on the wall face. */
  function paintNotice(g, nb, WH) {
    const x = nb.tx * T + 8, y = (nb.ty + 1) * T - WH - 14;
    g.save();
    g.fillStyle = '#5a3a22';
    g.fillRect(x, y, T - 16, WH + 12);
    g.fillStyle = '#b08a5a';
    g.fillRect(x + 2, y + 2, T - 20, WH + 8);
    const notes = ['#efe6cc', '#d8e8ff', '#ffe0b0'];
    for (let i = 0; i < 3; i++) {
      g.fillStyle = notes[i];
      g.fillRect(x + 4 + i * 9, y + 4 + (i % 2) * 4, 8, 12);
      g.fillStyle = '#c0392b';
      g.fillRect(x + 7 + i * 9, y + 4 + (i % 2) * 4, 2, 2);
    }
    g.restore();
  }

  function buildArt() {
    const MA = GW.MapArt;
    const WH = MA.WALL_H || 16;
    const NS = MA.NEON_SCALE || 0.5;
    if (!MA.floor) {
      MA.floor = makeCanvas(M.pxW, M.pxH);
      MA.top = makeCanvas(M.pxW, M.pxH);
      MA.mini = makeCanvas(M.W * 3, M.H * 3);
    }
    MA.WHEEL = { x: -9999, y: -9999, r: 0 }; // no Starwheel on this map
    const fg = MA.floor.getContext('2d');
    const tg = MA.top.getContext('2d');
    fg.clearRect(0, 0, M.pxW, M.pxH);
    tg.clearRect(0, 0, M.pxW, M.pxH);

    // 1. floor: textured zones, snowfields outside
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = M.tile(x, y);
        if (t === TT.WALL) {
          if (!tex(fg, 'ff_snow', x, y)) {
            fg.fillStyle = '#9aa8bf';
            fg.fillRect(x * T, y * T, T, T);
          }
          fg.fillStyle = 'rgba(4,8,20,0.45)';
          fg.fillRect(x * T, y * T, T, T);
          continue;
        }
        const z = M.zone[idx(x, y)];
        floorTile(fg, x, y, z >= 0 ? z : Z.CON);
      }
    paintIce(fg);
    paintTracks(fg);
    paintDetails(fg);
    for (const p of M.props) if (!p.tall) paintProp(fg, p, false);

    // 2. walls: brick roofs over the buildings, a brick face on the side you see
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (M.tile(x, y) !== TT.WALL) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if (M.tile(x + dx, y + dy) !== TT.WALL && M.inb(x + dx, y + dy)) near = true;
        if (!near) continue; // deep outside stays an open snowfield (floor layer)
        const px = x * T, py = y * T;
        if (M.tile(x, y + 1) !== TT.WALL) {
          tg.fillStyle = '#3b2520';
          tg.fillRect(px, py + T - WH, T, WH);
          tg.fillStyle = 'rgba(0,0,0,0.35)';
          tg.fillRect(px, py + T - 3, T, 3);
        }
        tg.save();
        tg.translate(0, -WH);
        if (!tex(tg, 'ff_roof', x, y)) {
          tg.fillStyle = '#5a3328';
          tg.fillRect(px, py, T, T);
        }
        tg.fillStyle = 'rgba(8,10,22,0.42)';
        tg.fillRect(px, py, T, T);
        // a dusting of snow on the roofline
        if (M.tile(x, y - 1) === TT.WALL) {
          tg.fillStyle = 'rgba(230,238,255,' + (0.25 + U.hash(x, y, 3) * 0.3) + ')';
          tg.fillRect(px, py, T, 6 + U.hash(x, y, 4) * 8);
        }
        tg.restore();
      }
    for (const p of M.props) if (p.tall) paintProp(tg, p, true);
    paintNotice(tg, M.quest.notice, WH);

    // 3. light pools per zone (shown when that zone has power)
    MA.neonZones = M.zones.map((zn) => {
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (M.zone[idx(x, y)] === zn.id) {
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
      const pad = 4;
      const rx = Math.max(0, x0 - pad) * T, ry = Math.max(0, y0 - pad) * T;
      const rw = Math.min(M.pxW - rx, (x1 - x0 + 1 + pad * 2) * T), rh = Math.min(M.pxH - ry, (y1 - y0 + 1 + pad * 2) * T);
      const canvas = makeCanvas(Math.max(1, Math.ceil(rw * NS)), Math.max(1, Math.ceil(rh * NS)));
      const g = canvas.getContext('2d');
      g.setTransform(NS, 0, 0, NS, -rx * NS, -ry * NS);
      g.globalCompositeOperation = 'lighter';
      for (const L of M.lights) if (!L.always && L.zone === zn.id && GW.Art && GW.Art.drawGlow) GW.Art.drawGlow(g, L.color, L.x, L.y, L.r * 1.05, 0.11);
      return { z: zn.id, x: rx, y: ry, w: rw, h: rh, canvas };
    });

    // 4. minimap
    const mg = MA.mini.getContext('2d');
    mg.clearRect(0, 0, MA.mini.width, MA.mini.height);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = M.tile(x, y);
        if (t === TT.WALL) continue;
        const zn = M.zone[idx(x, y)];
        const c = zn >= 0 ? M.zones[zn].color : '#ffffff';
        mg.fillStyle = t === TT.WINDOW ? 'rgba(255,255,255,0.35)' : U.rgba(c, t === TT.FLOOR || t === TT.DOOR ? 0.55 : 0.25);
        mg.fillRect(x * 3, y * 3, 3, 3);
      }
  }

  // Lumina Pier's mapart.js sets the Starwheel only once at load: put it back whenever Lumina is drawn
  // again after this map (or Dustline) moved it.
  const MA0 = GW.MapArt;
  if (MA0 && MA0.build && !MA0.build.ffWrapped) {
    const LUMINA_WHEEL = MA0.WHEEL, build0 = MA0.build;
    MA0.build = function () {
      if (!(GW.Maps && GW.Maps[M.activeMap])) MA0.WHEEL = LUMINA_WHEEL;
      return build0.apply(this, arguments);
    };
    MA0.build.ffWrapped = true;
  }

  GW.Maps.frostfall = {
    id: 'frostfall',
    name: 'FROSTFALL JUNCTION',
    sub: 'Snowbound Rail Junction',
    accent: '#8fd8ff',
    build: buildMap,
    buildArt: buildArt,
    update: update,
  };
})();
