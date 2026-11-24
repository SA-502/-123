/*
 * ============================================================================
 * GRAVEWAVE — GEMINI MAP #2: DUSTLINE OUTPOST (القاعدة الصحراوية)
 * Authored by Gemini — kept cleanly separate from Claude's js/map.js & mapart.js
 * ============================================================================
 * Theme: Sun-baked Desert Military Compound at Golden Dusk (ZERO NEON).
 * Uses warm terracotta sandstone, weathered concrete, desert asphalt, oasis
 * water, sandbags, rusted steel, and warm tungsten/amber floodlights.
 */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, T = GW.CFG.TILE, M = GW.Map, TT = M.TT, Z = M.Z;
  const W = M.W, H = M.H;
  const idx = M.idx;

  GW.Maps = GW.Maps || {};

  const ZONE_DEFS = [
    { id: 0, name: 'Central Courtyard', color: '#d99b43', short: 'COURTYARD' },
    { id: 1, name: 'Armory Barracks', color: '#8f9e6b', short: 'BARRACKS' },
    { id: 2, name: 'Water Cisterns', color: '#4f9da6', short: 'CISTERNS' },
    { id: 3, name: 'Motor Pool', color: '#c46d3b', short: 'MOTOR POOL' },
    { id: 4, name: 'Diesel Powerhouse', color: '#c7a032', short: 'POWERHOUSE' },
    { id: 5, name: 'Command Bunker', color: '#b84a39', short: 'BUNKER' },
    { id: 6, name: 'Radar Airfield', color: '#d4a359', short: 'AIRFIELD' },
    { id: 7, name: 'Old Catacombs', color: '#a68b6c', short: 'CATACOMBS' },
    { id: 8, name: 'Oasis Docks', color: '#3d7a80', short: 'OASIS' },
  ];

  // Painted military stencil signs (no neon tubes)
  const SIGNS = [
    { text: 'BARRACKS', tx: 22, ty: 23, zone: Z.ARCADE, size: 14 },
    { text: 'CISTERNS', tx: 39, ty: 17, zone: Z.AQUA, size: 15 },
    { text: 'MOTOR POOL', tx: 47, ty: 23, zone: Z.SPEED, size: 14 },
    { text: 'CMD BUNKER', tx: 31, ty: 34, zone: Z.VAULT, size: 14 },
    { text: 'POWERHOUSE', tx: 14.5, ty: 43, zone: Z.SUB, size: 12 },
    { text: 'POWERHOUSE', tx: 54.5, ty: 43, zone: Z.SUB, size: 12 },
    { text: 'SAFE ROOM', tx: 16, ty: 37, zone: Z.ARCADE, size: 11, color: '#9ad97c' },
    { text: 'AIRFIELD', tx: 67.5, ty: 21, zone: Z.FERRIS, size: 13 },
    { text: 'CATACOMBS', tx: 82, ty: 41, zone: Z.HAUNT, size: 14 },
    { text: 'OASIS DOCKS', tx: 28, ty: 52, zone: Z.PIER, size: 14 },
  ];

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

  /* ------------------------------------------------------------------ */
  /* Map #2 Layout: Dustline Outpost                                    */
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
    M.zones = ZONE_DEFS.map((z) => Object.assign({}, z, { open: z.id === Z.HUB }));
    M.flowDirty = true;
    M.flowTx = -1;
    M.flowTy = -1;

    // Non-neon warm desert sunset theme consumed by render.js
    M.theme = {
      id: 'gemini',
      name: 'DUSTLINE OUTPOST',
      sub: 'Desert Compound · Golden Dusk',
      accent: '#e09a43',
      ambientRgb: '28,17,9',
      ambOff: 0.42,
      ambOn: 0.14,
      warmTint: true,
    };

    // ---- 9 distinct desert compound zones ----
    carve(24, 18, 22, 16, Z.HUB);     // x24..45, y18..33  Central Courtyard
    carve(4, 14, 16, 22, Z.ARCADE);   // x4..19,  y14..35  Armory Barracks
    carve(22, 4, 26, 9, Z.AQUA);      // x22..47, y4..12   Water Cisterns
    carve(50, 14, 16, 22, Z.SPEED);   // x50..65, y14..35  Motor Pool
    carve(29, 36, 12, 5, Z.VAULT);    // x29..40, y36..40  Command Bunker
    carve(18, 43, 34, 8, Z.SUB);      // x18..51, y43..50  Diesel Powerhouse
    carve(70, 8, 23, 29, Z.FERRIS);   // x70..92, y8..36   Radar Airfield
    carve(70, 42, 23, 24, Z.HAUNT);   // x70..92, y42..65  Old Catacombs

    // Ancient sandstone maze walls inside Old Catacombs
    for (const [x0, y0, w, h] of [
      [70, 48, 16, 1], [77, 54, 16, 1], [70, 60, 16, 1],
      [81, 42, 1, 3], [75, 49, 1, 3], [85, 55, 1, 3], [78, 61, 1, 3],
    ]) {
      for (let j = y0; j < y0 + h; j++)
        for (let i = x0; i < x0 + w; i++) {
          M.tiles[idx(i, j)] = TT.WALL;
          M.zone[idx(i, j)] = -1;
        }
    }

    // ---- corridors ----
    carve(20, 24, 1, 4, Z.ARCADE); carve(21, 24, 3, 4, Z.HUB);          // Courtyard <-> Barracks
    carve(46, 24, 3, 4, Z.HUB);    carve(49, 24, 1, 4, Z.SPEED);        // Courtyard <-> Motor Pool
    carve(33, 13, 4, 1, Z.AQUA);   carve(33, 14, 4, 4, Z.HUB);          // Courtyard <-> Cisterns
    carve(33, 34, 4, 1, Z.HUB);    carve(33, 35, 4, 1, Z.VAULT);        // Courtyard <-> Command Bunker (power gate)
    carve(15, 7, 7, 3, Z.AQUA);    carve(15, 10, 3, 3, Z.AQUA);   carve(15, 13, 3, 1, Z.ARCADE); // Barracks <-> Cisterns
    carve(48, 7, 6, 3, Z.AQUA);    carve(51, 10, 3, 3, Z.AQUA);   carve(51, 13, 3, 1, Z.SPEED);  // Motor Pool <-> Cisterns
    carve(10, 36, 3, 11, Z.ARCADE); carve(13, 44, 3, 3, Z.ARCADE); carve(16, 44, 2, 3, Z.SUB);   // Barracks <-> Powerhouse
    carve(56, 36, 3, 11, Z.SPEED);  carve(53, 44, 3, 3, Z.SPEED);  carve(52, 44, 1, 3, Z.SUB);   // Motor Pool <-> Powerhouse
    carve(14, 38, 4, 3, Z.ARCADE);  carve(13, 38, 1, 2, Z.ARCADE);                               // Reinforced Safe Room
    carve(66, 22, 4, 4, Z.SPEED);                                                                // Motor Pool <-> Airfield
    carve(87, 37, 3, 5, Z.FERRIS);                                                               // Airfield <-> Catacombs

    // Oasis Docks (south)
    carve(34, 51, 3, 1, Z.SUB); carve(34, 52, 3, 2, Z.PIER);
    carve(16, 54, 48, 5, Z.PIER);
    carve(20, 59, 4, 8, Z.PIER); carve(34, 59, 4, 10, Z.PIER); carve(48, 59, 4, 8, Z.PIER);
    carve(20, 66, 32, 2, Z.PIER);
    carve(64, 55, 6, 3, Z.PIER); // Oasis -> Catacombs
    for (let y = 54; y < H - 1; y++)
      for (let x = 10; x <= 66; x++)
        if (M.tiles[idx(x, y)] === TT.WALL) M.tiles[idx(x, y)] = TT.WATER;

    // ---- 12 buyable / power doors ----
    addDoor('Armory Barracks', 750, [[21, 24], [21, 25], [21, 26], [21, 27]], Z.HUB, Z.ARCADE, 'v');
    addDoor('Water Cisterns', 1000, [[33, 14], [34, 14], [35, 14], [36, 14]], Z.HUB, Z.AQUA, 'h');
    addDoor('Motor Pool', 1000, [[48, 24], [48, 25], [48, 26], [48, 27]], Z.HUB, Z.SPEED, 'v');
    addDoor('North Supply Trench', 1250, [[15, 12], [16, 12], [17, 12]], Z.AQUA, Z.ARCADE, 'h');
    addDoor('East Service Trench', 1250, [[51, 12], [52, 12], [53, 12]], Z.AQUA, Z.SPEED, 'h');
    addDoor('Diesel Powerhouse', 1250, [[15, 44], [15, 45], [15, 46]], Z.ARCADE, Z.SUB, 'v');
    addDoor('Diesel Powerhouse', 1250, [[53, 44], [53, 45], [53, 46]], Z.SPEED, Z.SUB, 'v');
    M.gate = addDoor('Command Bunker', 0, [[33, 34], [34, 34], [35, 34], [36, 34]], Z.HUB, Z.VAULT, 'h', true);
    addDoor('Radar Airfield', 1500, [[69, 22], [69, 23], [69, 24], [69, 25]], Z.SPEED, Z.FERRIS, 'v');
    addDoor('Old Catacombs', 1750, [[87, 41], [88, 41], [89, 41]], Z.FERRIS, Z.HAUNT, 'h');
    addDoor('Oasis Docks', 1500, [[34, 51], [35, 51], [36, 51]], Z.SUB, Z.PIER, 'h');
    addDoor('Old Catacombs', 1750, [[69, 55], [69, 56], [69, 57]], Z.PIER, Z.HAUNT, 'v');

    // ---- barricaded breach windows (zombie entry points) ----
    addWindow(27, 17, 0, 1, Z.HUB); addWindow(42, 17, 0, 1, Z.HUB);
    addWindow(23, 20, 1, 0, Z.HUB); addWindow(46, 31, -1, 0, Z.HUB);
    addWindow(27, 34, 0, -1, Z.HUB); addWindow(42, 34, 0, -1, Z.HUB);
    addWindow(3, 18, 1, 0, Z.ARCADE); addWindow(3, 30, 1, 0, Z.ARCADE);
    addWindow(9, 13, 0, 1, Z.ARCADE); addWindow(6, 36, 0, -1, Z.ARCADE); addWindow(16, 36, 0, -1, Z.ARCADE);
    addWindow(26, 3, 0, 1, Z.AQUA); addWindow(35, 3, 0, 1, Z.AQUA); addWindow(44, 3, 0, 1, Z.AQUA);
    addWindow(24, 13, 0, -1, Z.AQUA); addWindow(45, 13, 0, -1, Z.AQUA);
    addWindow(66, 17, -1, 0, Z.SPEED); addWindow(66, 30, -1, 0, Z.SPEED);
    addWindow(60, 13, 0, 1, Z.SPEED); addWindow(62, 36, 0, -1, Z.SPEED); addWindow(52, 36, 0, -1, Z.SPEED);
    addWindow(22, 51, 0, -1, Z.SUB); addWindow(47, 51, 0, -1, Z.SUB);
    addWindow(24, 42, 0, 1, Z.SUB); addWindow(44, 42, 0, 1, Z.SUB);
    addWindow(74, 7, 0, 1, Z.FERRIS); addWindow(87, 7, 0, 1, Z.FERRIS);
    addWindow(93, 15, -1, 0, Z.FERRIS); addWindow(93, 29, -1, 0, Z.FERRIS);
    addWindow(75, 37, 0, -1, Z.FERRIS);
    addWindow(93, 45, -1, 0, Z.HAUNT); addWindow(93, 57, -1, 0, Z.HAUNT); addWindow(69, 49, 1, 0, Z.HAUNT);
    // oasis ladders
    addWindow(28, 59, 0, -1, Z.PIER); addWindow(42, 59, 0, -1, Z.PIER); addWindow(57, 59, 0, -1, Z.PIER);
    addWindow(19, 63, 1, 0, Z.PIER); addWindow(52, 63, -1, 0, Z.PIER); addWindow(36, 69, 0, -1, Z.PIER);

    // ---- ground sand-riser spawns ----
    M.risers = [
      { tx: 7, ty: 33, zone: Z.ARCADE }, { tx: 45, ty: 6, zone: Z.AQUA }, { tx: 63, ty: 16, zone: Z.SPEED },
      { tx: 49, ty: 49, zone: Z.SUB }, { tx: 20, ty: 44, zone: Z.SUB },
      { tx: 72, ty: 34, zone: Z.FERRIS }, { tx: 90, ty: 10, zone: Z.FERRIS },
      { tx: 90, ty: 63, zone: Z.HAUNT }, { tx: 72, ty: 58, zone: Z.HAUNT },
      { tx: 60, ty: 56, zone: Z.PIER }, { tx: 22, ty: 64, zone: Z.PIER },
    ].map((r) => Object.assign(r, { x: (r.tx + 0.5) * T, y: (r.ty + 0.5) * T, cool: 0 }));

    // ---- desert compound props (sandbags, crates, barrels, cisterns, vehicles, radar base) ----
    // Courtyard (Hub) — open helipad in the center with sandbag cover & supply crates around
    addProp('crate', 27, 21, 2, 1, false);
    addProp('crate', 41, 29, 2, 1, false);
    addProp('booth', 40, 20, 2, 2, true);   // Guard shack
    addProp('booth', 27, 28, 2, 2, true);   // Supply tent
    addProp('barrel', 34, 21, 1, 1, false);
    // Armory Barracks
    addProp('crate', 7, 17, 2, 1, false);
    addProp('crate', 14, 17, 2, 1, false);
    addProp('crate', 7, 28, 2, 1, false);
    addProp('crate', 14, 28, 2, 1, false);
    addProp('counter', 10, 23, 3, 1, false); // Armory counter
    addProp('barrel', 6, 22, 1, 1, false);
    // Water Cisterns
    addProp('tank', 27, 7, 2, 2, true);
    addProp('tank', 34, 7, 2, 2, true);
    addProp('tank', 41, 7, 2, 2, true);
    addProp('bench', 30, 10, 2, 1, false);
    // Motor Pool
    addProp('tires', 55, 18, 5, 2, false);
    addProp('tires', 55, 29, 5, 2, false);
    addProp('kart', 52, 22, 1, 1, false, { rot: 0.4 });
    addProp('kart', 61, 25, 1, 1, false, { rot: -1.9 });
    addProp('barrel', 62, 16, 1, 1, false);
    addProp('barrel', 52, 33, 1, 1, false);
    // Diesel Powerhouse
    addProp('generator', 24, 46, 2, 2, true);
    addProp('generator', 43, 46, 2, 2, true);
    addProp('coil', 31, 45, 1, 1, true);
    addProp('coil', 38, 48, 1, 1, true);
    addProp('crate', 33, 49, 2, 1, false);
    // Command Bunker
    addProp('pillar', 29, 36, 1, 1, true);
    addProp('pillar', 40, 36, 1, 1, true);
    // Radar Airfield
    addProp('wheelbase', 80, 20, 3, 3, true); // Radar tower concrete base
    addProp('booth', 73, 29, 2, 2, true);     // Airfield control hut
    addProp('crate', 87, 13, 2, 1, false);
    addProp('barrel', 74, 12, 1, 1, false);
    addProp('barrel', 88, 31, 1, 1, false);
    // Old Catacombs
    addProp('pillar', 74, 44, 1, 1, true);
    addProp('pillar', 84, 44, 1, 1, true);
    addProp('coffin', 79, 50, 1, 2, false);   // Ancient sarcophagus
    addProp('coffin', 72, 56, 2, 1, false);
    addProp('pillar', 82, 57, 1, 1, true);
    addProp('pillar', 74, 63, 1, 1, true);
    // Oasis Docks
    addProp('crate', 18, 55, 2, 1, false);
    addProp('barrel', 46, 55, 1, 1, false);
    addProp('barrel', 59, 56, 1, 1, false);
    addProp('lamp', 27, 56, 1, 1, true);
    addProp('lamp', 55, 55, 1, 1, true);

    // ---- 5 perk machines ----
    M.perkSpots = [
      { perk: 'wind', tx: 45, ty: 19 },
      { perk: 'quick', tx: 4, ty: 23 },
      { perk: 'thick', tx: 31, ty: 4 },
      { perk: 'burner', tx: 65, ty: 14 },
      { perk: 'twin', tx: 48, ty: 43 },
    ];
    for (const s of M.perkSpots) s.prop = addProp('perk', s.tx, s.ty, 1, 1, true, { perk: s.perk });

    // ---- 6 mystery crate spots ----
    M.boxSpots = [
      { tx: 19, ty: 31, w: 1, h: 2, zone: Z.ARCADE },
      { tx: 38, ty: 12, w: 2, h: 1, zone: Z.AQUA },
      { tx: 50, ty: 31, w: 1, h: 2, zone: Z.SPEED },
      { tx: 92, ty: 20, w: 1, h: 2, zone: Z.FERRIS },
      { tx: 70, ty: 51, w: 1, h: 2, zone: Z.HAUNT },
      { tx: 53, ty: 54, w: 2, h: 1, zone: Z.PIER },
    ];
    for (const s of M.boxSpots) addProp('box', s.tx, s.ty, s.w, s.h, true);

    // ---- Overclocker / Upgrade Bench in Command Bunker ----
    M.pap = { tx: 34, ty: 40, w: 2, h: 1 };
    addProp('pap', 34, 40, 2, 1, true);

    // ---- 9 wall-buys (wall tile + facing normal into floor) ----
    M.wallbuys = [
      { weapon: 'ranger', tx: 30, ty: 17, fx: 0, fy: 1 },
      { weapon: 'bulldog', tx: 39, ty: 34, fx: 0, fy: -1 },
      { weapon: 'buzzsaw', tx: 12, ty: 13, fx: 0, fy: 1 },
      { weapon: 'riptide', tx: 39, ty: 3, fx: 0, fy: 1 },
      { weapon: 'kestrel', tx: 56, ty: 13, fx: 0, fy: 1 },
      { weapon: 'hornet', tx: 29, ty: 42, fx: 0, fy: 1 },
      { weapon: 'anvil', tx: 80, ty: 7, fx: 0, fy: 1 },
      { weapon: 'boomstick', tx: 93, ty: 51, fx: -1, fy: 0 },
      { weapon: 'sixgun', tx: 42, ty: 53, fx: 0, fy: 1 },
    ];

    // ---- 9 diesel generators (one per zone) ----
    M.generators = [
      { zone: Z.HUB, tx: 23, ty: 22, fx: 1, fy: 0 },
      { zone: Z.ARCADE, tx: 3, ty: 26, fx: 1, fy: 0 },
      { zone: Z.AQUA, tx: 48, ty: 10, fx: -1, fy: 0 },
      { zone: Z.SPEED, tx: 66, ty: 27, fx: -1, fy: 0 },
      { zone: Z.SUB, tx: 35, ty: 42, fx: 0, fy: 1 },
      { zone: Z.VAULT, tx: 41, ty: 38, fx: -1, fy: 0 },
      { zone: Z.FERRIS, tx: 89, ty: 7, fx: 0, fy: 1 },
      { zone: Z.HAUNT, tx: 69, ty: 44, fx: 1, fy: 0 },
      { zone: Z.PIER, tx: 22, ty: 53, fx: 0, fy: 1 },
    ];
    for (const g of M.generators) {
      g.x = (g.tx + 0.5) * T;
      g.y = (g.ty + 0.5) * T;
    }
    M.powerSwitch = M.generators[4]; // Diesel Powerhouse unlocks Command Bunker

    // ---- 27 fuse spots (all verified walkable floor tiles) ----
    M.fuseSpots = [
      [25, 19], [44, 32], [5, 15], [18, 34], [9, 19], [23, 11], [46, 11], [17, 8], [52, 8],
      [60, 32], [51, 34], [58, 43], [19, 49], [50, 49], [31, 37], [38, 37], [71, 9], [91, 35],
      [76, 22], [77, 43], [90, 49], [73, 64], [87, 58], [17, 57], [23, 66], [50, 66], [35, 68],
    ].map(([tx, ty]) => ({ tx, ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T, zone: M.zone[idx(tx, ty)] }));

    // ---- 3 traps ----
    M.traps = [
      { kind: 'zap', x: 10, y: 41, w: 3, h: 3, sw: { tx: 13, ty: 40, fx: -1, fy: 0 } },
      { kind: 'fire', x: 56, y: 41, w: 3, h: 3, sw: { tx: 55, ty: 40, fx: 1, fy: 0 } },
      { kind: 'laser', x: 33, y: 15, w: 4, h: 2, sw: { tx: 37, ty: 17, fx: 0, fy: 1 } },
    ].map((t, i) => Object.assign(t, { id: i, rx: t.x * T, ry: t.y * T, rw: t.w * T, rh: t.h * T, state: 'idle', t: 0, playerT: 0, sfxT: 0 }));

    // ---- reinforced safe room ----
    M.safeRoom = {
      rx: 14 * T, ry: 38 * T, rw: 4 * T, rh: 3 * T,
      door: [[13, 38], [13, 39]], dx: 13 * T, dy: 38 * T, dw: T, dh: 2 * T,
      outside: { x: 12.5 * T, y: 39 * T },
      console: { tx: 18, ty: 39, fx: -1, fy: 0 },
      hatch: { tx: 14, ty: 40 },
      state: 'open', t: 0, cd: 0, warned: false, bangT: 0, hatchT: 0,
    };

    // ---- 4 underground tunnel / fast-travel pads ----
    M.pads = [
      { color: '#e09a43', a: { tx: 26, ty: 25 }, b: { tx: 40, ty: 49 } },
      { color: '#d4b855', a: { tx: 12, ty: 16 }, b: { tx: 63, ty: 33 } },
      { color: '#c46d3b', a: { tx: 25, ty: 11 }, b: { tx: 31, ty: 39 } },
      { color: '#4f9da6', a: { tx: 89, ty: 33 }, b: { tx: 36, ty: 64 } },
    ];
    for (const pr of M.pads) {
      pr.cd = 0;
      for (const k of ['a', 'b']) {
        const e = pr[k];
        e.x = (e.tx + 0.5) * T;
        e.y = (e.ty + 0.5) * T;
        e.zone = M.zone[idx(e.tx, e.ty)];
      }
    }

    // ---- 6 wall-mounted supply vendors ----
    M.vendors = [
      { kind: 'armor', tx: 23, ty: 30, fx: 1, fy: 0 },
      { kind: 'tactical', item: 'cryo', tx: 21, ty: 5, fx: 1, fy: 0 },
      { kind: 'tactical', item: 'lure', tx: 66, ty: 20, fx: -1, fy: 0 },
      { kind: 'tactical', item: 'bubble', tx: 28, ty: 51, fx: 0, fy: -1 },
      { kind: 'pal', tx: 14, ty: 36, fx: 0, fy: -1 },
      { kind: 'sentry', tx: 39, ty: 42, fx: 0, fy: 1 },
    ];
    for (const v of M.vendors.concat(M.traps.map((t) => t.sw), [M.safeRoom.console])) {
      v.x = (v.tx + 0.5) * T;
      v.y = (v.ty + 0.5) * T;
    }

    // Player spawn in the sunlit Central Courtyard
    M.spawn = { x: 35 * T, y: 28 * T };

    // ---- Warm desert floodlights & tungsten work lamps (ZERO NEON!) ----
    light(35, 26, 360, '#ffcf87', Z.HUB, true);
    light(27, 20, 270, '#f5b056', Z.HUB); light(43, 20, 270, '#f5b056', Z.HUB);
    light(27, 31, 270, '#f5b056', Z.HUB); light(43, 31, 270, '#f5b056', Z.HUB);
    light(7, 17, 260, '#ffd89b', Z.ARCADE); light(17, 17, 260, '#ffd89b', Z.ARCADE);
    light(12, 25, 280, '#f5b969', Z.ARCADE, true); light(7, 33, 250, '#ffd89b', Z.ARCADE);
    light(25, 6, 260, '#b5e3e8', Z.AQUA); light(35, 8, 280, '#c8edf0', Z.AQUA, true); light(44, 6, 260, '#b5e3e8', Z.AQUA);
    light(53, 17, 270, '#ffbe6b', Z.SPEED); light(63, 17, 270, '#ffbe6b', Z.SPEED);
    light(58, 25, 300, '#f5a94c', Z.SPEED, true); light(53, 33, 260, '#ffbe6b', Z.SPEED);
    light(22, 46, 260, '#f2ca63', Z.SUB); light(35, 47, 280, '#f2ca63', Z.SUB, true); light(48, 46, 260, '#f2ca63', Z.SUB);
    light(32, 38, 240, '#ff9c6e', Z.VAULT); light(38, 38, 240, '#ff9c6e', Z.VAULT);
    light(16, 39.5, 180, '#b9e89c', Z.ARCADE, true); // Safe room lamp
    light(74, 12, 280, '#ffd38c', Z.FERRIS); light(89, 12, 280, '#ffd38c', Z.FERRIS);
    light(81.5, 21.5, 340, '#ffbd61', Z.FERRIS, true);
    light(74, 33, 270, '#ffd38c', Z.FERRIS); light(89, 33, 270, '#ffd38c', Z.FERRIS);
    light(75, 45, 220, '#f2ba77', Z.HAUNT); light(88, 51, 220, '#f2ba77', Z.HAUNT);
    light(74, 57, 220, '#f2ba77', Z.HAUNT); light(86, 63, 220, '#f2ba77', Z.HAUNT);
    light(22, 56, 250, '#ffd38c', Z.PIER); light(36, 56, 260, '#ffd38c', Z.PIER, true); light(52, 56, 250, '#ffd38c', Z.PIER);
    light(36, 65, 240, '#b5e3e8', Z.PIER); light(22, 65, 220, '#ffd38c', Z.PIER); light(50, 65, 220, '#ffd38c', Z.PIER);
  }

  /* ------------------------------------------------------------------ */
  /* Map #2 Non-Neon Desert Art Renderer                                */
  /* ------------------------------------------------------------------ */
  const ZONE_TEX = [
    'gemini_sandstone', // 0 Courtyard
    'gemini_concrete',  // 1 Barracks
    'gemini_concrete',  // 2 Cisterns
    'gemini_asphalt',   // 3 Motor Pool
    'gemini_concrete',  // 4 Powerhouse
    'gemini_concrete',  // 5 Command Bunker
    'gemini_asphalt',   // 6 Radar Airfield
    'gemini_sandstone', // 7 Old Catacombs
    'gemini_sandstone', // 8 Oasis Docks
  ];

  // Subtle zone tint so every zone feels distinct while staying earthy & non-neon
  const ZONE_TINT = [
    'rgba(180,120,55,0.08)',
    'rgba(90,105,72,0.16)',
    'rgba(48,110,118,0.18)',
    'rgba(45,35,28,0.16)',
    'rgba(130,98,35,0.16)',
    'rgba(120,48,38,0.18)',
    'rgba(155,118,62,0.10)',
    'rgba(92,70,48,0.22)',
    'rgba(125,92,55,0.10)',
  ];

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function paintFloorTile(g, x, y, z) {
    const px = x * T, py = y * T;
    const texKey = z >= 0 ? ZONE_TEX[z] : null;
    if (texKey && GW.Assets && GW.Assets.tile(g, texKey, x, y, T)) {
      g.fillStyle = ZONE_TINT[z] || 'rgba(0,0,0,0.08)';
      g.fillRect(px, py, T, T);
      return;
    }
    // Procedural warm non-neon desert fallback (works even offline / file://)
    const h = U.hash(x, y, 17);
    if (z === Z.HUB || z === Z.HAUNT || z === Z.PIER) {
      g.fillStyle = 'hsl(' + (32 + h * 8) + ',38%,' + (34 + h * 7) + '%)';
      g.fillRect(px, py, T, T);
      g.strokeStyle = 'rgba(72,44,20,0.25)';
      g.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
    } else if (z === Z.SPEED || z === Z.FERRIS) {
      g.fillStyle = 'hsl(30,10%,' + (24 + h * 5) + '%)';
      g.fillRect(px, py, T, T);
    } else if (z === Z.AQUA) {
      g.fillStyle = 'hsl(188,24%,' + (30 + h * 5) + '%)';
      g.fillRect(px, py, T, T);
    } else {
      g.fillStyle = 'hsl(38,14%,' + (31 + h * 5) + '%)';
      g.fillRect(px, py, T, T);
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
    }
  }

  function paintDesertMarkings(g) {
    // Painted Helipad 'H' in Central Courtyard (around tile 35, 25)
    const hx = 35 * T, hy = 25.5 * T;
    g.save();
    g.strokeStyle = 'rgba(240, 212, 145, 0.55)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(hx, hy, 88, 0, U.TAU);
    g.stroke();
    g.setLineDash([12, 10]);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(hx, hy, 104, 0, U.TAU);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(240, 212, 145, 0.48)';
    g.fillRect(hx - 30, hy - 36, 12, 72);
    g.fillRect(hx + 18, hy - 36, 12, 72);
    g.fillRect(hx - 24, hy - 6, 48, 12);

    // Runway stripes in Radar Airfield (Z.FERRIS)
    g.fillStyle = 'rgba(245, 224, 170, 0.35)';
    for (let y = 10; y <= 34; y += 3) {
      g.fillRect(77 * T - 4, y * T, 8, T * 1.6);
    }
    // Hazard yellow-black stripes in Diesel Powerhouse
    g.fillStyle = 'rgba(218, 165, 42, 0.35)';
    for (let x = 20; x <= 49; x += 2) {
      g.fillRect(x * T, 43 * T + 2, T, 5);
    }
    // Painted military stencil zone signs on floor
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const s of SIGNS) {
      g.font = '700 ' + s.size + 'px "Trebuchet MS", sans-serif';
      g.fillStyle = 'rgba(38, 26, 16, 0.55)';
      g.fillText(s.text, s.tx * T + 1, s.ty * T + 1);
      g.fillStyle = s.color || 'rgba(245, 226, 185, 0.72)';
      g.fillText(s.text, s.tx * T, s.ty * T);
    }
    g.restore();
  }

  function paintProp(g, p, topPass) {
    const x = p.tx * T, y = p.ty * T, w = p.w * T, h = p.h * T;
    const yOff = topPass ? -16 : 0;
    g.save();
    // Subtle ground contact shadow
    if (!topPass) {
      g.fillStyle = 'rgba(24, 14, 6, 0.38)';
      g.fillRect(x + 4, y + 6, w - 2, h - 2);
    }
    if (p.kind === 'crate') {
      g.fillStyle = '#8b6338';
      g.fillRect(x + 3, y + 3 + yOff, w - 6, h - 6);
      g.strokeStyle = '#4e351c';
      g.lineWidth = 3;
      g.strokeRect(x + 4, y + 4 + yOff, w - 8, h - 8);
      g.beginPath();
      g.moveTo(x + 5, y + 5 + yOff); g.lineTo(x + w - 5, y + h - 5 + yOff);
      g.stroke();
    } else if (p.kind === 'barrel') {
      g.fillStyle = '#9c4328';
      g.beginPath();
      g.arc(x + w / 2, y + h / 2 + yOff, Math.min(w, h) * 0.38, 0, U.TAU);
      g.fill();
      g.strokeStyle = '#3b1c12';
      g.lineWidth = 3;
      g.stroke();
    } else if (p.kind === 'tires') {
      g.fillStyle = '#35312d';
      for (let i = 0; i < p.w; i++) {
        g.beginPath();
        g.arc(x + (i + 0.5) * T, y + h / 2 + yOff, T * 0.42, 0, U.TAU);
        g.fill();
        g.strokeStyle = '#1b1815';
        g.lineWidth = 4;
        g.stroke();
      }
    } else if (p.kind === 'booth') {
      g.fillStyle = '#7c735c';
      g.fillRect(x + 2, y + 2 + yOff, w - 4, h - 4);
      g.fillStyle = '#5c5544';
      g.fillRect(x + 8, y + 8 + yOff, w - 16, h - 16);
      g.strokeStyle = '#3b3428';
      g.lineWidth = 3;
      g.strokeRect(x + 2, y + 2 + yOff, w - 4, h - 4);
    } else if (p.kind === 'tank') {
      g.fillStyle = '#4d787d';
      g.beginPath();
      g.arc(x + w / 2, y + h / 2 + yOff, Math.min(w, h) * 0.44, 0, U.TAU);
      g.fill();
      g.strokeStyle = '#2c464a';
      g.lineWidth = 4;
      g.stroke();
    } else if (p.kind === 'generator') {
      g.fillStyle = '#9e7d2c';
      g.fillRect(x + 4, y + 4 + yOff, w - 8, h - 8);
      g.strokeStyle = '#3d3012';
      g.lineWidth = 3;
      g.strokeRect(x + 4, y + 4 + yOff, w - 8, h - 8);
    } else if (p.kind === 'wheelbase') {
      g.fillStyle = '#7a7265';
      g.beginPath();
      g.arc(x + w / 2, y + h / 2 + yOff, Math.min(w, h) * 0.45, 0, U.TAU);
      g.fill();
      g.strokeStyle = '#3d372e';
      g.lineWidth = 5;
      g.stroke();
    } else if (p.kind === 'perk' || p.kind === 'box' || p.kind === 'pap') {
      // Let render.js draw interactive perk/box/pap machines cleanly on top
      g.fillStyle = '#5b5145';
      g.fillRect(x + 4, y + 4 + yOff, w - 8, h - 8);
    } else {
      g.fillStyle = '#786855';
      g.fillRect(x + 4, y + 4 + yOff, w - 8, h - 8);
      g.strokeStyle = '#3e3328';
      g.lineWidth = 2;
      g.strokeRect(x + 4, y + 4 + yOff, w - 8, h - 8);
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
    // Radar tower position (so render.js animates the rotating dish safely)
    MA.WHEEL = { x: 81.5 * T, y: 21.5 * T, r: 96 };

    const fg = MA.floor.getContext('2d');
    const tg = MA.top.getContext('2d');
    fg.clearRect(0, 0, M.pxW, M.pxH);
    tg.clearRect(0, 0, M.pxW, M.pxH);

    // 1. Floor & Oasis Water layer
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = M.tile(x, y);
        const px = x * T, py = y * T;
        if (t === TT.WATER) {
          if (!(GW.Assets && GW.Assets.tile(fg, 'gemini_oasis', x, y, T))) {
            fg.fillStyle = '#2d6870';
            fg.fillRect(px, py, T, T);
          }
          continue;
        }
        if (t === TT.WALL) {
          fg.fillStyle = '#3b2b1e';
          fg.fillRect(px, py, T, T);
          continue;
        }
        paintFloorTile(fg, x, y, M.zone[idx(x, y)]);
      }
    }
    paintDesertMarkings(fg);
    // Low props on floor
    for (const p of M.props) if (!p.tall) paintProp(fg, p, false);

    // 2. Wall tops & tall props (sandstone/concrete fortifications)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (M.tile(x, y) !== TT.WALL) continue;
        // Skip deep interior walls not adjacent to playable space for crispness & speed
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1 && !near; dx++)
            if (M.tile(x + dx, y + dy) !== TT.WALL) near = true;
        const px = x * T, py = y * T;
        if (near) {
          // South-facing sandstone wall front
          if (M.tile(x, y + 1) !== TT.WALL) {
            tg.fillStyle = '#5c422c';
            tg.fillRect(px, py + T - WH, T, WH);
            tg.fillStyle = 'rgba(0,0,0,0.3)';
            tg.fillRect(px, py + T - 3, T, 3);
          }
          tg.save();
          tg.translate(0, -WH);
          if (!(GW.Assets && GW.Assets.tile(tg, 'gemini_wall_top', x, y, T))) {
            tg.fillStyle = '#806348';
            tg.fillRect(px, py, T, T);
          }
          tg.fillStyle = 'rgba(42, 27, 15, 0.25)';
          tg.fillRect(px, py, T, T);
          tg.restore();
        } else {
          tg.fillStyle = '#332418';
          tg.fillRect(px, py - WH, T, T);
        }
      }
    }
    for (const p of M.props) if (p.tall) paintProp(tg, p, true);

    // 3. Warm tungsten floodlight pools (replacing neon layer with soft warm light — ZERO neon)
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
      const rx = Math.max(0, x0 - pad) * T;
      const ry = Math.max(0, y0 - pad) * T;
      const rw = Math.min(M.pxW - rx, (x1 - x0 + 1 + pad * 2) * T);
      const rh = Math.min(M.pxH - ry, (y1 - y0 + 1 + pad * 2) * T);
      const canvas = makeCanvas(Math.max(1, Math.ceil(rw * NS)), Math.max(1, Math.ceil(rh * NS)));
      const g = canvas.getContext('2d');
      g.setTransform(NS, 0, 0, NS, -rx * NS, -ry * NS);
      g.globalCompositeOperation = 'lighter';
      for (const L of M.lights) {
        if (!L.always && L.zone === zn.id && GW.Art && GW.Art.drawGlow) {
          GW.Art.drawGlow(g, L.color, L.x, L.y, L.r * 1.1, 0.12);
        }
      }
      return { z: zn.id, x: rx, y: ry, w: rw, h: rh, canvas };
    });

    // 4. Tactical desert minimap
    const mg = MA.mini.getContext('2d');
    mg.clearRect(0, 0, MA.mini.width, MA.mini.height);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = M.tile(x, y);
        if (t === TT.WALL) continue;
        if (t === TT.WATER) {
          mg.fillStyle = 'rgba(61,122,128,0.45)';
          mg.fillRect(x * 3, y * 3, 3, 3);
          continue;
        }
        const zn = M.zone[idx(x, y)];
        const col = zn >= 0 ? M.zones[zn].color : '#d99b43';
        mg.fillStyle = t === TT.WINDOW ? 'rgba(255,240,210,0.35)' : U.rgba(col, t === TT.FLOOR || t === TT.DOOR ? 0.55 : 0.25);
        mg.fillRect(x * 3, y * 3, 3, 3);
      }
    }
  }

  GW.Maps.gemini = {
    id: 'gemini',
    name: 'DUSTLINE OUTPOST',
    sub: 'Desert Compound · By Gemini',
    accent: '#e09a43',
    build: buildMap,
    buildArt: buildArt,
  };
})();
