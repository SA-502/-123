/*
 * ============================================================================
 * GRAVEWAVE — GEMINI MAP #2: DUSTLINE OUTPOST (القاعدة الصحراوية)
 * Updated for branch claude/game-balance-new-map-st8r3f per GEMINI_UPDATE_GUIDE.md
 * ============================================================================
 * - 100% original asymmetric 96x72 desert fortress layout (SW Crash Site start,
 *   W Checkpoint Road, NW Helipad Apron, Center-North Supply Bazaar, Dead-Center
 *   Armory War Room with 30s Overclocker Lockdown, NE Diesel Generator Bunker,
 *   East Oil Refinery, SE Sunken Ruins, South-Central Oasis River Crossing).
 * - ZERO teleporters (M.pads = []), ONE sweeping oil-fire trap (M.traps),
 *   M.papRoom lockdown compliance, M.safeRoom.exit hatch escape, balance-ordered
 *   wall-buys, 3-4+ tile corridors, and real Nano Banana non-neon desert art.
 */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, T = GW.CFG.TILE, M = GW.Map, TT = M.TT, Z = M.Z;
  const W = M.W, H = M.H;
  const idx = M.idx;

  GW.Maps = GW.Maps || {};

  const ZONE_DEFS = [
    { id: 0, name: 'Crash Site Gate', color: '#d99b43', short: 'CRASH SITE' },
    { id: 1, name: 'Checkpoint Road', color: '#8f9e6b', short: 'CHECKPOINT' },
    { id: 2, name: 'Helipad Apron', color: '#c9a85c', short: 'AIRFIELD' },
    { id: 3, name: 'Supply Bazaar', color: '#c46d3b', short: 'BAZAAR' },
    { id: 4, name: 'Generator Bunker', color: '#c7a032', short: 'BUNKER' },
    { id: 5, name: 'Armory War Room', color: '#b84a39', short: 'WAR ROOM' },
    { id: 6, name: 'Oil Refinery', color: '#9c6244', short: 'REFINERY' },
    { id: 7, name: 'Sunken Ruins', color: '#a68b6c', short: 'RUINS' },
    { id: 8, name: 'Oasis Crossing', color: '#3d7a80', short: 'OASIS' },
  ];

  const SIGNS = [
    { text: 'CHECKPOINT', tx: 16, ty: 43, zone: Z.ARCADE, size: 14 },
    { text: 'OASIS CROSSING', tx: 31, ty: 56, zone: Z.PIER, size: 13 },
    { text: 'AIRFIELD', tx: 16, ty: 18, zone: Z.AQUA, size: 14 },
    { text: 'SUPPLY BAZAAR', tx: 27, ty: 26, zone: Z.SPEED, size: 13 },
    { text: 'WAR ROOM', tx: 44, ty: 34, zone: Z.VAULT, size: 14 },
    { text: 'GEN BUNKER', tx: 60, ty: 17, zone: Z.SUB, size: 13 },
    { text: 'OIL REFINERY', tx: 60, ty: 30, zone: Z.FERRIS, size: 13 },
    { text: 'SUNKEN RUINS', tx: 60, ty: 58, zone: Z.HAUNT, size: 13 },
    { text: 'SAFE ROOM', tx: 31.5, ty: 34.5, zone: Z.SPEED, size: 10, color: '#b7e08a' },
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
    for (let j = ty; j < ty + h; j++)
      for (let i = tx; i < tx + w; i++)
        M.tiles[idx(i, j)] = tall ? TT.SOLID : TT.LOW;
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
  /* Map #2 Layout: Dustline Outpost (Asymmetric Desert Fortress)       */
  /* ------------------------------------------------------------------ */
  function buildMap() {
    M.tiles = new Uint8Array(W * H);
    M.zone = new Int8Array(W * H).fill(-1);
    M.flow = new Uint16Array(W * H).fill(65535);
    M.flowLure = new Uint16Array(W * H).fill(65535);
    M.version = 1;
    M.props = [];
    M.doors = [];
    M.windows = [];
    M.lights = [];
    M.pads = []; // Teleporters removed per GEMINI_UPDATE_GUIDE.md
    M.quest = null;
    M.zones = ZONE_DEFS.map((z) => Object.assign({}, z, { open: z.id === Z.HUB }));
    M.flowDirty = true;
    M.flowTx = -1;
    M.flowTy = -1;

    M.theme = {
      id: 'gemini',
      name: 'DUSTLINE OUTPOST',
      sub: 'Desert Fortress · Golden Dusk',
      accent: '#e6b35c',
      ambientRgb: '34,21,11',
      ambOff: 0.34,
      ambOn: 0.10,
      warmTint: true,
    };

    // ---- 9 asymmetric desert compound zones ----
    carve(5, 45, 24, 20, Z.HUB);      // x5..28,  y45..64  SW Crash Site Gate (Start)
    carve(5, 20, 20, 21, Z.ARCADE);   // x5..24,  y20..40  W Checkpoint Road
    carve(5, 4, 29, 12, Z.AQUA);      // x5..33,  y4..15   NW Helipad Apron
    carve(30, 14, 28, 20, Z.SPEED);   // x30..57, y14..33  Center-North Supply Bazaar
    carve(37, 38, 15, 10, Z.VAULT);   // x37..51, y38..47  Dead-Center Armory War Room (Overclocker Lockdown)
    carve(63, 5, 28, 17, Z.SUB);      // x63..90, y5..21   NE Diesel Generator Bunker (Main Power)
    carve(63, 27, 28, 23, Z.FERRIS);  // x63..90, y27..49  E Canyon Oil Refinery
    carve(63, 54, 28, 15, Z.HAUNT);   // x63..90, y54..68  SE Sunken Desert Ruins

    // Sunken Ruins internal sandstone maze walls (leaving 3-4+ tile passages)
    for (const [x0, y0, w, h] of [
      [71, 54, 1, 8], [79, 60, 1, 9], [85, 54, 1, 6], [67, 62, 7, 1],
    ]) {
      for (let j = y0; j < y0 + h; j++)
        for (let i = x0; i < x0 + w; i++) {
          M.tiles[idx(i, j)] = TT.WALL;
          M.zone[idx(i, j)] = -1;
        }
    }

    // South-Central Oasis River Crossing (Z.PIER): water valley + 2 wide 5-tile bridges
    carve(33, 53, 25, 4, Z.PIER);     // North oasis bank x33..57, y53..56
    carve(33, 64, 25, 4, Z.PIER);     // South oasis bank x33..57, y64..67
    carve(36, 57, 5, 7, Z.PIER);      // West timber bridge (5 tiles wide)
    carve(49, 57, 5, 7, Z.PIER);      // East stone bridge (5 tiles wide)
    for (let y = 57; y <= 63; y++)
      for (let x = 33; x <= 57; x++)
        if (M.tiles[idx(x, y)] === TT.WALL) M.tiles[idx(x, y)] = TT.WATER;

    // ---- Wide 3-4+ tile corridors (zero horde jams) ----
    carve(14, 41, 4, 2, Z.ARCADE); carve(14, 43, 4, 2, Z.HUB);         // HUB <-> CHECKPOINT (door y42)
    carve(29, 53, 2, 4, Z.HUB);    carve(31, 53, 2, 4, Z.PIER);        // HUB <-> OASIS (door x30)
    carve(14, 16, 4, 2, Z.AQUA);   carve(14, 18, 4, 2, Z.ARCADE);      // CHECKPOINT <-> AIRFIELD (door y17)
    carve(25, 25, 2, 4, Z.ARCADE); carve(27, 25, 3, 4, Z.SPEED);       // CHECKPOINT <-> BAZAAR (door x26)
    carve(34, 8, 6, 4, Z.AQUA);    carve(36, 12, 4, 2, Z.SPEED);       // AIRFIELD <-> BAZAAR (door y12)
    carve(58, 15, 2, 4, Z.SPEED);  carve(60, 15, 3, 4, Z.SUB);         // BAZAAR <-> GEN BUNKER (door x59)
    carve(58, 28, 2, 4, Z.SPEED);  carve(60, 28, 3, 4, Z.FERRIS);      // BAZAAR <-> OIL REFINERY (door x59)
    carve(75, 22, 4, 2, Z.SUB);    carve(75, 24, 4, 3, Z.FERRIS);      // GEN BUNKER <-> OIL REFINERY (door y23)
    carve(75, 50, 4, 2, Z.FERRIS); carve(75, 52, 4, 2, Z.HAUNT);       // OIL REFINERY <-> RUINS (door y51)
    carve(58, 54, 2, 3, Z.PIER);   carve(60, 54, 3, 3, Z.HAUNT);       // OASIS <-> RUINS (door x59)

    // Single 4-wide doorway into Armory War Room (Z.VAULT):
    // M.gate (power door) at y35, walkable floor at y36, lockdown gates at y37, interior y38..47
    carve(42, 34, 4, 2, Z.SPEED);
    carve(42, 36, 4, 2, Z.VAULT);

    // Safe Room tucked cleanly off SW of Supply Bazaar (x30..33, y35..37, shutter at y34)
    carve(30, 34, 2, 1, Z.SPEED);
    carve(30, 35, 4, 3, Z.SPEED);

    // ---- 11 Buyable & Power Doors ----
    addDoor('Checkpoint Road', 750, [[14, 42], [15, 42], [16, 42], [17, 42]], Z.HUB, Z.ARCADE, 'h');
    addDoor('Oasis Crossing', 1000, [[30, 53], [30, 54], [30, 55], [30, 56]], Z.HUB, Z.PIER, 'v');
    addDoor('Helipad Apron', 1000, [[14, 17], [15, 17], [16, 17], [17, 17]], Z.ARCADE, Z.AQUA, 'h');
    addDoor('Supply Bazaar', 1250, [[26, 25], [26, 26], [26, 27], [26, 28]], Z.ARCADE, Z.SPEED, 'v');
    addDoor('Supply Bazaar', 1250, [[36, 12], [37, 12], [38, 12], [39, 12]], Z.AQUA, Z.SPEED, 'h');
    addDoor('Generator Bunker', 1500, [[59, 15], [59, 16], [59, 17], [59, 18]], Z.SPEED, Z.SUB, 'v');
    addDoor('Oil Refinery', 1500, [[59, 28], [59, 29], [59, 30], [59, 31]], Z.SPEED, Z.FERRIS, 'v');
    M.gate = addDoor('Armory War Room', 0, [[42, 35], [43, 35], [44, 35], [45, 35]], Z.SPEED, Z.VAULT, 'h', true);
    addDoor('Oil Refinery', 1250, [[75, 23], [76, 23], [77, 23], [78, 23]], Z.SUB, Z.FERRIS, 'h');
    addDoor('Sunken Ruins', 1750, [[75, 51], [76, 51], [77, 51], [78, 51]], Z.FERRIS, Z.HAUNT, 'h');
    addDoor('Sunken Ruins', 1500, [[59, 54], [59, 55], [59, 56]], Z.PIER, Z.HAUNT, 'v');

    // ---- Barricaded Breach Windows (ZERO windows inside or on edge of Z.VAULT / M.papRoom!) ----
    addWindow(4, 49, 1, 0, Z.HUB); addWindow(4, 59, 1, 0, Z.HUB);
    addWindow(9, 65, 0, -1, Z.HUB); addWindow(22, 65, 0, -1, Z.HUB);
    addWindow(24, 44, 0, 1, Z.HUB); addWindow(29, 48, -1, 0, Z.HUB);
    addWindow(4, 24, 1, 0, Z.ARCADE); addWindow(4, 35, 1, 0, Z.ARCADE);
    addWindow(25, 21, -1, 0, Z.ARCADE); addWindow(25, 35, -1, 0, Z.ARCADE);
    addWindow(9, 3, 0, 1, Z.AQUA); addWindow(20, 3, 0, 1, Z.AQUA); addWindow(29, 3, 0, 1, Z.AQUA);
    addWindow(4, 9, 1, 0, Z.AQUA);
    addWindow(44, 13, 0, 1, Z.SPEED); addWindow(53, 13, 0, 1, Z.SPEED);
    addWindow(54, 34, 0, -1, Z.SPEED); addWindow(36, 34, 0, -1, Z.SPEED);
    addWindow(68, 4, 0, 1, Z.SUB); addWindow(84, 4, 0, 1, Z.SUB);
    addWindow(91, 9, -1, 0, Z.SUB); addWindow(91, 18, -1, 0, Z.SUB);
    addWindow(91, 31, -1, 0, Z.FERRIS); addWindow(91, 44, -1, 0, Z.FERRIS);
    addWindow(62, 36, 1, 0, Z.FERRIS); addWindow(62, 45, 1, 0, Z.FERRIS);
    addWindow(91, 58, -1, 0, Z.HAUNT); addWindow(91, 65, -1, 0, Z.HAUNT);
    addWindow(68, 69, 0, -1, Z.HAUNT); addWindow(84, 69, 0, -1, Z.HAUNT);
    addWindow(37, 68, 0, -1, Z.PIER); addWindow(52, 68, 0, -1, Z.PIER);
    addWindow(48, 52, 0, 1, Z.PIER); addWindow(35, 52, 0, 1, Z.PIER);

    // ---- Ground Sand Risers (ZERO risers inside Z.VAULT / M.papRoom!) ----
    M.risers = [
      { tx: 26, ty: 61, zone: Z.HUB }, { tx: 7, ty: 22, zone: Z.ARCADE },
      { tx: 31, ty: 6, zone: Z.AQUA }, { tx: 55, ty: 16, zone: Z.SPEED },
      { tx: 66, ty: 7, zone: Z.SUB }, { tx: 88, ty: 19, zone: Z.SUB },
      { tx: 65, ty: 47, zone: Z.FERRIS }, { tx: 88, ty: 29, zone: Z.FERRIS },
      { tx: 65, ty: 66, zone: Z.HAUNT }, { tx: 88, ty: 66, zone: Z.HAUNT },
      { tx: 55, ty: 66, zone: Z.PIER },
    ].map((r) => Object.assign(r, { x: (r.tx + 0.5) * T, y: (r.ty + 0.5) * T, cool: 0 }));

    // ---- Real Nano Banana Top-Down Desert Props ----
    // SW Crash Site Gate (HUB)
    addProp('g_heli', 11, 51, 4, 4, true);
    addProp('g_sandbags', 21, 48, 2, 2, false);
    addProp('g_crates', 22, 59, 2, 2, false);
    addProp('g_humvee', 7, 46, 3, 2, true);
    addProp('g_barrels', 26, 51, 1, 1, false);
    // W Checkpoint Road (ARCADE) — keep x14..17 y34..39 clear for the Burning Oil Trap!
    addProp('g_humvee', 9, 25, 3, 2, true);
    addProp('g_sandbags', 19, 30, 2, 2, false);
    addProp('g_tent', 7, 33, 3, 3, true);
    addProp('g_barrels', 21, 22, 1, 1, false);
    // NW Helipad Apron (AQUA)
    addProp('g_crates', 8, 6, 2, 2, false);
    addProp('g_barrels', 14, 6, 1, 1, false);
    addProp('g_humvee', 24, 6, 3, 2, true);
    addProp('g_sandbags', 27, 12, 2, 2, false);
    // Center-North Supply Bazaar (SPEED)
    addProp('g_tent', 34, 17, 3, 3, true);
    addProp('g_tent', 49, 17, 3, 3, true);
    addProp('g_crates', 42, 23, 2, 2, false);
    addProp('g_humvee', 35, 27, 3, 2, true);
    addProp('g_sandbags', 51, 27, 2, 2, false);
    addProp('g_barrels', 47, 15, 1, 1, false);
    // NE Diesel Generator Bunker (SUB)
    addProp('g_oil_tank', 68, 8, 3, 3, true);
    addProp('g_oil_tank', 81, 8, 3, 3, true);
    addProp('g_crates', 75, 15, 2, 2, false);
    addProp('g_barrels', 65, 18, 1, 1, false);
    addProp('g_barrels', 87, 14, 1, 1, false);
    // Dead-Center Armory War Room (VAULT)
    addProp('g_crates', 38, 39, 2, 2, false);
    addProp('g_crates', 49, 39, 2, 2, false);
    // E Canyon Oil Refinery (FERRIS)
    addProp('g_oil_tank', 75, 35, 4, 4, true);
    addProp('g_oil_tank', 66, 30, 3, 3, true);
    addProp('g_oil_tank', 84, 42, 3, 3, true);
    addProp('g_humvee', 83, 31, 3, 2, true);
    addProp('g_barrels', 68, 44, 1, 1, false);
    addProp('g_sandbags', 72, 44, 2, 2, false);
    // SE Sunken Ruins (HAUNT)
    addProp('g_ruin', 66, 56, 2, 2, true);
    addProp('g_ruin', 74, 56, 2, 2, true);
    addProp('g_ruin', 81, 56, 2, 2, true);
    addProp('g_ruin', 74, 64, 2, 2, true);
    addProp('g_ruin', 86, 62, 2, 2, true);
    // South-Central Oasis Crossing (PIER)
    addProp('g_palm', 33, 53, 2, 2, true);
    addProp('g_palm', 55, 53, 2, 2, true);
    addProp('g_palm', 33, 65, 2, 2, true);
    addProp('g_palm', 44, 65, 2, 2, true);
    addProp('g_sandbags', 43, 54, 2, 2, false);

    // ---- 5 Perk Machines ----
    M.perkSpots = [
      { perk: 'wind', tx: 28, ty: 46 },
      { perk: 'quick', tx: 5, ty: 38 },
      { perk: 'thick', tx: 6, ty: 14 },
      { perk: 'burner', tx: 56, ty: 20 },
      { perk: 'twin', tx: 89, ty: 6 },
    ];
    for (const s of M.perkSpots) s.prop = addProp('perk', s.tx, s.ty, 1, 1, true, { perk: s.perk });

    // ---- 6 Mystery Supply Crates ----
    M.boxSpots = [
      { tx: 23, ty: 37, w: 1, h: 2, zone: Z.ARCADE },
      { tx: 18, ty: 4, w: 2, h: 1, zone: Z.AQUA },
      { tx: 56, ty: 23, w: 1, h: 2, zone: Z.SPEED },
      { tx: 89, ty: 36, w: 1, h: 2, zone: Z.FERRIS },
      { tx: 64, ty: 63, w: 1, h: 2, zone: Z.HAUNT },
      { tx: 45, ty: 53, w: 2, h: 1, zone: Z.PIER },
    ];
    for (const s of M.boxSpots) addProp('box', s.tx, s.ty, s.w, s.h, true);

    // ---- Overclocker / Gunsmith Bench inside Armory War Room ----
    M.pap = { tx: 43, ty: 45, w: 2, h: 1 };
    addProp('pap', 43, 45, 2, 1, true);

    // ---- Overclocker Room Lockdown (30s seal on first upgrade per round) ----
    M.papRoom = {
      x0: 37, y0: 38, x1: 51, y1: 47,
      gates: [
        { tx: 42, ty: 37 }, { tx: 43, ty: 37 }, { tx: 44, ty: 37 }, { tx: 45, ty: 37 },
      ],
    };

    // ---- 9 Wall-Buys ordered by new BALANCE.md difficulty & price ----
    M.wallbuys = [
      { weapon: 'ranger', tx: 12, ty: 44, fx: 0, fy: 1 },     // HUB (750)
      { weapon: 'bulldog', tx: 19, ty: 65, fx: 0, fy: -1 },   // HUB (750)
      { weapon: 'buzzsaw', tx: 4, ty: 29, fx: 1, fy: 0 },     // CHECKPOINT (1250)
      { weapon: 'hornet', tx: 47, ty: 68, fx: 0, fy: -1 },    // OASIS (1500)
      { weapon: 'kestrel', tx: 15, ty: 3, fx: 0, fy: 1 },     // AIRFIELD (1750)
      { weapon: 'sixgun', tx: 41, ty: 13, fx: 0, fy: 1 },     // BAZAAR (1750)
      { weapon: 'riptide', tx: 75, ty: 4, fx: 0, fy: 1 },     // GEN BUNKER (2000)
      { weapon: 'boomstick', tx: 77, ty: 69, fx: 0, fy: -1 }, // SUNKEN RUINS (2000)
      { weapon: 'anvil', tx: 91, ty: 38, fx: -1, fy: 0 },     // OIL REFINERY (3000)
    ];

    // ---- 9 Diesel Generators (one per zone; index 4 unlocks Armory War Room) ----
    M.generators = [
      { zone: Z.HUB, tx: 4, ty: 54, fx: 1, fy: 0 },
      { zone: Z.ARCADE, tx: 25, ty: 32, fx: -1, fy: 0 },
      { zone: Z.AQUA, tx: 24, ty: 3, fx: 0, fy: 1 },
      { zone: Z.SPEED, tx: 58, ty: 22, fx: -1, fy: 0 },
      { zone: Z.SUB, tx: 78, ty: 4, fx: 0, fy: 1 },
      { zone: Z.VAULT, tx: 52, ty: 45, fx: -1, fy: 0 },
      { zone: Z.FERRIS, tx: 62, ty: 41, fx: 1, fy: 0 },
      { zone: Z.HAUNT, tx: 62, ty: 60, fx: 1, fy: 0 },
      { zone: Z.PIER, tx: 55, ty: 68, fx: 0, fy: -1 },
    ];
    for (const g of M.generators) {
      g.x = (g.tx + 0.5) * T;
      g.y = (g.ty + 0.5) * T;
    }
    M.powerSwitch = M.generators[4];

    // ---- 27 Fuse Spots (verified walkable floor tiles) ----
    M.fuseSpots = [
      [6, 63], [27, 63], [20, 46], [6, 21], [23, 21], [15, 38], [6, 5], [32, 13], [22, 14],
      [31, 15], [55, 32], [44, 16], [64, 6], [89, 20], [74, 19], [40, 43], [48, 43], [64, 28],
      [89, 48], [72, 30], [64, 55], [89, 55], [82, 67], [68, 67], [38, 55], [51, 55], [38, 65],
    ].map(([tx, ty]) => ({ tx, ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T, zone: M.zone[idx(tx, ty)] }));

    // ---- ONE Trap per map: Sweeping Burning Oil Trench on Checkpoint Road ----
    M.traps = [
      {
        kind: 'fire',
        x: 14, y: 34, w: 4, h: 6,
        sw: { tx: 19, ty: 41, fx: 0, fy: -1 },
        sweep: { band: 2, speed: 1.7 },
        hint: 'A wall of burning oil sweeps Checkpoint Road',
      },
    ].map((t, i) => Object.assign(t, { id: i, rx: t.x * T, ry: t.y * T, rw: t.w * T, rh: t.h * T, state: 'idle', t: 0, playerT: 0, sfxT: 0 }));

    // ---- Panic / Safe Room with Maintenance Hatch Exit (replaces teleporters) ----
    M.safeRoom = {
      rx: 30 * T, ry: 35 * T, rw: 4 * T, rh: 3 * T,
      door: [[30, 34], [31, 34]], dx: 30 * T, dy: 34 * T, dw: 2 * T, dh: T,
      outside: { x: 31 * T, y: 33.5 * T },
      console: { tx: 34, ty: 36, fx: -1, fy: 0 },
      hatch: { tx: 33, ty: 37 },
      exit: { tx: 18, ty: 56 },
      state: 'open', t: 0, cd: 0, warned: false, bangT: 0, hatchT: 0,
    };

    // ---- 6 Wall-Mounted Tactical Vendors ----
    M.vendors = [
      { kind: 'armor', tx: 29, ty: 60, fx: -1, fy: 0 },
      { kind: 'tactical', item: 'cryo', tx: 4, ty: 12, fx: 1, fy: 0 },
      { kind: 'tactical', item: 'lure', tx: 48, ty: 13, fx: 0, fy: 1 },
      { kind: 'tactical', item: 'bubble', tx: 62, ty: 12, fx: 1, fy: 0 },
      { kind: 'pal', tx: 91, ty: 47, fx: -1, fy: 0 },
      { kind: 'sentry', tx: 62, ty: 18, fx: 1, fy: 0 },
    ];
    for (const v of M.vendors.concat(M.traps.map((t) => t.sw), [M.safeRoom.console])) {
      v.x = (v.tx + 0.5) * T;
      v.y = (v.ty + 0.5) * T;
    }

    // Player spawn in SW Crash Site Gate beside the downed helicopter
    M.spawn = { x: 18.5 * T, y: 56 * T };

    // ---- Warm Golden-Hour Sun & Tungsten Floodlights (ZERO NEON!) ----
    light(17, 55, 420, '#ffd48a', Z.HUB, true);
    light(10, 48, 300, '#f5b867', Z.HUB); light(25, 58, 300, '#f5b867', Z.HUB);
    light(15, 30, 340, '#ffd89b', Z.ARCADE, true); light(10, 22, 260, '#f5b867', Z.ARCADE);
    light(18, 10, 360, '#ffe0a3', Z.AQUA, true); light(28, 10, 280, '#ffd48a', Z.AQUA);
    light(44, 24, 380, '#ffd48a', Z.SPEED, true); light(34, 18, 280, '#f5b867', Z.SPEED); light(53, 28, 280, '#f5b867', Z.SPEED);
    light(76, 13, 340, '#f2ca63', Z.SUB, true); light(68, 16, 260, '#ffd48a', Z.SUB);
    light(44, 42, 300, '#ffae73', Z.VAULT);
    light(32, 36.5, 180, '#c6e89c', Z.SPEED, true);
    light(77, 38, 380, '#ffbd6b', Z.FERRIS, true); light(68, 32, 280, '#ffd48a', Z.FERRIS); light(86, 44, 280, '#ffd48a', Z.FERRIS);
    light(76, 61, 320, '#f2ba77', Z.HAUNT, true); light(86, 58, 260, '#f2ba77', Z.HAUNT);
    light(45, 55, 320, '#ffe0a3', Z.PIER, true); light(45, 65, 300, '#c2e6e8', Z.PIER, true);
  }

  /* ------------------------------------------------------------------ */
  /* Map #2 Renderer — Real Nano Banana Textures & Props (ZERO NEON!)   */
  /* ------------------------------------------------------------------ */
  const ZONE_TEX = [
    'gemini_sandstone', // 0 Crash Site Gate
    'gemini_asphalt',   // 1 Checkpoint Road
    'gemini_asphalt',   // 2 Helipad Apron
    'gemini_sandstone', // 3 Supply Bazaar
    'gemini_concrete',  // 4 Generator Bunker
    'gemini_concrete',  // 5 Armory War Room
    'gemini_concrete',  // 6 Oil Refinery
    'gemini_sandstone', // 7 Sunken Ruins
    'gemini_sandstone', // 8 Oasis Crossing
  ];

  const ZONE_TINT = [
    'rgba(185,125,55,0.06)',
    'rgba(55,46,36,0.10)',
    'rgba(70,62,50,0.08)',
    'rgba(170,115,52,0.08)',
    'rgba(82,78,62,0.14)',
    'rgba(115,52,38,0.14)',
    'rgba(92,62,42,0.12)',
    'rgba(118,86,52,0.16)',
    'rgba(140,108,62,0.08)',
  ];

  const PROP_ASSET = {
    g_humvee: 'gemini_prop_humvee',
    g_heli: 'gemini_prop_heli',
    g_sandbags: 'gemini_prop_sandbags',
    g_tent: 'gemini_prop_tent',
    g_crates: 'gemini_prop_crates',
    g_barrels: 'gemini_prop_barrels',
    g_oil_tank: 'gemini_prop_oil_tank',
    g_palm: 'gemini_prop_palm',
    g_ruin: 'gemini_prop_ruin_pillar',
  };

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
      g.fillStyle = ZONE_TINT[z] || 'rgba(0,0,0,0.05)';
      g.fillRect(px, py, T, T);
      return;
    }
    const h = U.hash(x, y, 17);
    if (z === Z.ARCADE || z === Z.AQUA) {
      g.fillStyle = 'hsl(32,12%,' + (27 + h * 5) + '%)';
    } else if (z === Z.SUB || z === Z.VAULT || z === Z.FERRIS) {
      g.fillStyle = 'hsl(36,15%,' + (33 + h * 5) + '%)';
    } else {
      g.fillStyle = 'hsl(' + (32 + h * 7) + ',40%,' + (38 + h * 6) + '%)';
    }
    g.fillRect(px, py, T, T);
  }

  function paintDesertMarkings(g) {
    g.save();
    // Painted Helipad 'H' on NW Helipad Apron (around tile 19, 10)
    const hx = 19 * T, hy = 10 * T;
    g.strokeStyle = 'rgba(245, 224, 168, 0.58)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(hx, hy, 82, 0, U.TAU);
    g.stroke();
    g.fillStyle = 'rgba(245, 224, 168, 0.50)';
    g.fillRect(hx - 26, hy - 34, 11, 68);
    g.fillRect(hx + 15, hy - 34, 11, 68);
    g.fillRect(hx - 20, hy - 5, 40, 10);

    // Road dashed center line along Checkpoint Road
    g.fillStyle = 'rgba(240, 212, 140, 0.36)';
    for (let y = 21; y <= 38; y += 2) g.fillRect(15 * T - 3, y * T, 6, T * 1.1);

    // Oil trap trench grate markings (x14..17, y34..39)
    g.strokeStyle = 'rgba(218, 125, 42, 0.45)';
    g.lineWidth = 2;
    g.strokeRect(14 * T + 3, 34 * T + 3, 4 * T - 6, 6 * T - 6);

    // Timber bridge planks on Oasis Crossing bridges
    g.fillStyle = 'rgba(76, 48, 24, 0.42)';
    for (const bx of [36, 49]) {
      for (let py = 57 * T; py < 64 * T; py += 12) {
        g.fillRect(bx * T, py, 5 * T, 2);
      }
    }

    // Painted military stencil floor labels
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const s of SIGNS) {
      g.font = '700 ' + s.size + 'px "Trebuchet MS", sans-serif';
      g.fillStyle = 'rgba(32, 20, 10, 0.55)';
      g.fillText(s.text, s.tx * T + 1, s.ty * T + 1);
      g.fillStyle = s.color || 'rgba(248, 232, 194, 0.78)';
      g.fillText(s.text, s.tx * T, s.ty * T);
    }
    g.restore();
  }

  function paintProp(g, p, topPass) {
    const x = p.tx * T, y = p.ty * T, w = p.w * T, h = p.h * T;
    const yOff = topPass ? -14 : 0;
    const assetKey = PROP_ASSET[p.kind];
    if (assetKey && GW.Assets && GW.Assets.get(assetKey)) {
      g.save();
      if (!topPass) {
        g.fillStyle = 'rgba(28, 16, 6, 0.30)';
        g.beginPath();
        g.ellipse(x + w / 2 + 4, y + h / 2 + 6, w * 0.44, h * 0.44, 0, 0, U.TAU);
        g.fill();
      }
      GW.Assets.drawFit(g, assetKey, x - 4, y + yOff - 4, w + 8, h + 8, p.rot || 0);
      g.restore();
      return;
    }
    if (p.kind === 'perk' || p.kind === 'box' || p.kind === 'pap') {
      g.fillStyle = 'rgba(60, 48, 36, 0.55)';
      g.fillRect(x + 4, y + 4 + yOff, w - 8, h - 8);
    }
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
    MA.WHEEL = { x: 77 * T, y: 37 * T, r: 0 };

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
          fg.fillStyle = '#473322';
          fg.fillRect(px, py, T, T);
          continue;
        }
        paintFloorTile(fg, x, y, M.zone[idx(x, y)]);
      }
    }
    paintDesertMarkings(fg);
    for (const p of M.props) if (!p.tall) paintProp(fg, p, false);

    // 2. Sandstone & Rusted Steel Fortification Walls + Tall Nano Banana Props
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (M.tile(x, y) !== TT.WALL) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1 && !near; dx++)
            if (M.tile(x + dx, y + dy) !== TT.WALL) near = true;
        const px = x * T, py = y * T;
        if (near) {
          if (M.tile(x, y + 1) !== TT.WALL) {
            tg.fillStyle = '#634730';
            tg.fillRect(px, py + T - WH, T, WH);
            tg.fillStyle = 'rgba(0,0,0,0.28)';
            tg.fillRect(px, py + T - 3, T, 3);
          }
          tg.save();
          tg.translate(0, -WH);
          if (!(GW.Assets && GW.Assets.tile(tg, 'gemini_wall_top', x, y, T))) {
            tg.fillStyle = '#8a6b4e';
            tg.fillRect(px, py, T, T);
          }
          tg.fillStyle = 'rgba(46, 28, 14, 0.18)';
          tg.fillRect(px, py, T, T);
          tg.restore();
        } else {
          tg.fillStyle = '#38271a';
          tg.fillRect(px, py - WH, T, T);
        }
      }
    }
    for (const p of M.props) if (p.tall) paintProp(tg, p, true);

    // 3. Soft Warm Sunlight / Floodlight Pools (ZERO NEON!)
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
          GW.Art.drawGlow(g, L.color, L.x, L.y, L.r * 1.1, 0.11);
        }
      }
      return { z: zn.id, x: rx, y: ry, w: rw, h: rh, canvas };
    });

    // 4. Tactical Desert Minimap
    const mg = MA.mini.getContext('2d');
    mg.clearRect(0, 0, MA.mini.width, MA.mini.height);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = M.tile(x, y);
        if (t === TT.WALL) continue;
        if (t === TT.WATER) {
          mg.fillStyle = 'rgba(61,122,128,0.55)';
          mg.fillRect(x * 3, y * 3, 3, 3);
          continue;
        }
        const zn = M.zone[idx(x, y)];
        const col = zn >= 0 ? M.zones[zn].color : '#d99b43';
        mg.fillStyle = t === TT.WINDOW ? 'rgba(255,244,214,0.4)' : U.rgba(col, t === TT.FLOOR || t === TT.DOOR ? 0.62 : 0.30);
        mg.fillRect(x * 3, y * 3, 3, 3);
      }
    }
  }

  GW.Maps.gemini = {
    id: 'gemini',
    name: 'DUSTLINE OUTPOST',
    sub: 'Desert Fortress · Golden Dusk',
    accent: '#e6b35c',
    build: buildMap,
    buildArt: buildArt,
  };
})();
