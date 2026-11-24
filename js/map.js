/* GRAVEWAVE — Lumina Pier: tile map, zones, doors, collision, raycasting and the zombie flow field */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, T = GW.CFG.TILE;

  /** Tile types. */
  const TT = { WALL: 0, FLOOR: 1, LOW: 2, DOOR: 3, WINDOW: 4, SOLID: 5, WATER: 6 };
  /** Zone ids. */
  const Z = { HUB: 0, ARCADE: 1, AQUA: 2, SPEED: 3, SUB: 4, VAULT: 5, FERRIS: 6, HAUNT: 7, PIER: 8 };

  const M = (GW.Map = { TT, Z, W: 96, H: 72, activeMap: (typeof localStorage !== "undefined" && localStorage.getItem("gravewave.map")) || "lumina", theme: null });
  M.pxW = M.W * T;
  M.pxH = M.H * T;

  const ZONE_DEFS = [
    { id: 0, name: 'Boardwalk Plaza', color: '#ff4fd8', short: 'PLAZA' },
    { id: 1, name: 'Pixel Palace', color: '#a855ff', short: 'ARCADE' },
    { id: 2, name: 'Deep Six Aquarium', color: '#19d8ff', short: 'AQUARIUM' },
    { id: 3, name: 'Burnout Speedway', color: '#ff8a1f', short: 'SPEEDWAY' },
    { id: 4, name: 'The Substation', color: '#c8ff3a', short: 'SUBSTATION' },
    { id: 5, name: 'Overclock Stage', color: '#ff3b6b', short: 'STAGE' },
    { id: 6, name: 'Starwheel Plaza', color: '#ffd426', short: 'STARWHEEL' },
    { id: 7, name: 'Nightmare Manor', color: '#c9b8ff', short: 'MANOR' },
    { id: 8, name: 'Pier Nine Docks', color: '#3d8bff', short: 'PIER' },
  ];

  const W = M.W, H = M.H;
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  M.idx = idx;
  M.inb = inb;

  /* ------------------------------------------------------------------ */
  /* construction                                                       */
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

  function addWindow(tx, ty, dx, dy, zone) {
    M.tiles[idx(tx, ty)] = TT.WINDOW;
    M.zone[idx(tx, ty)] = zone;
    M.windows.push({
      id: M.windows.length, tx, ty, dx, dy, zone,
      ix: tx + dx, iy: ty + dy, // inside tile
      x: (tx + 0.5) * T, y: (ty + 0.5) * T,
      planks: 6, busy: null, seed: Math.random() * 100,
    });
  }

  function light(tx, ty, r, color, zone, always) {
    M.lights.push({ x: tx * T, y: ty * T, r, color, zone, always: !!always, phase: Math.random() * 10 });
  }

  /** (Re)build the entire map. Called for every new game. */
  M.build = function () {
    if (GW.Maps && GW.Maps[M.activeMap] && GW.Maps[M.activeMap].build) { GW.Maps[M.activeMap].build(); return; }
    M.theme = null;
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

    // ---- rooms ----
    carve(22, 16, 20, 16, Z.HUB); // x22..41  y16..31
    carve(3, 12, 15, 22, Z.ARCADE); // x3..17   y12..33
    carve(20, 3, 24, 9, Z.AQUA); // x20..43  y3..11
    carve(46, 12, 15, 22, Z.SPEED); // x46..60  y12..33
    carve(16, 40, 32, 8, Z.SUB); // x16..47  y40..47
    carve(26, 34, 12, 5, Z.VAULT); // x26..37  y34..38

    // ---- corridors ----
    carve(18, 22, 1, 4, Z.ARCADE); carve(19, 22, 3, 4, Z.HUB); // hub <-> arcade
    carve(42, 22, 3, 4, Z.HUB); carve(45, 22, 1, 4, Z.SPEED); // hub <-> speedway
    carve(30, 12, 4, 1, Z.AQUA); carve(30, 13, 4, 3, Z.HUB); // hub <-> aquarium
    carve(30, 32, 4, 1, Z.HUB); carve(30, 33, 4, 1, Z.VAULT); // hub <-> stage (power gate)
    carve(14, 5, 6, 3, Z.AQUA); carve(14, 8, 3, 3, Z.AQUA); carve(14, 11, 3, 1, Z.ARCADE); // arcade <-> aquarium
    carve(44, 5, 6, 3, Z.AQUA); carve(47, 8, 3, 3, Z.AQUA); carve(47, 11, 3, 1, Z.SPEED); // speedway <-> aquarium
    carve(8, 34, 3, 11, Z.ARCADE); carve(11, 42, 3, 3, Z.ARCADE); carve(14, 42, 2, 3, Z.SUB); // arcade <-> substation
    carve(53, 34, 3, 11, Z.SPEED); carve(50, 42, 3, 3, Z.SPEED); carve(48, 42, 2, 3, Z.SUB); // speedway <-> substation
    carve(12, 36, 4, 3, Z.ARCADE); carve(11, 36, 1, 2, Z.ARCADE); // panic room off the arcade tunnel

    // ---- expansion: Starwheel Plaza (east), Nightmare Manor (south-east), Pier Nine (south) ----
    carve(66, 6, 26, 30, Z.FERRIS); // x66..91 y6..35
    carve(61, 21, 5, 4, Z.SPEED); // speedway east tunnel (door at x65)
    carve(86, 36, 3, 4, Z.FERRIS); // starwheel -> manor tunnel (door at y39)
    carve(66, 40, 26, 24, Z.HAUNT); // x66..91 y40..63, then the maze walls
    for (const [x0, y0, w, h] of [[66, 46, 19, 1], [73, 52, 19, 1], [66, 58, 19, 1], [78, 40, 1, 3], [72, 47, 1, 3], [84, 53, 1, 3], [76, 59, 1, 3]]) {
      for (let j = y0; j < y0 + h; j++) for (let i = x0; i < x0 + w; i++) {
        M.tiles[idx(i, j)] = TT.WALL;
        M.zone[idx(i, j)] = -1;
      }
    }
    carve(31, 48, 3, 2, Z.SUB); carve(31, 50, 3, 2, Z.PIER); // substation -> pier stairs (door at y49)
    carve(14, 52, 49, 5, Z.PIER); // main deck x14..62 y52..56
    carve(18, 57, 4, 9, Z.PIER); carve(32, 57, 4, 12, Z.PIER); carve(46, 57, 4, 9, Z.PIER); // docks
    carve(18, 66, 32, 2, Z.PIER); // lower boardwalk
    carve(60, 57, 3, 5, Z.PIER); carve(63, 59, 3, 3, Z.PIER); // pier -> manor (door at x65)
    // open water around the pier
    for (let y = 52; y < H - 1; y++) for (let x = 8; x <= 64; x++) if (M.tiles[idx(x, y)] === TT.WALL) M.tiles[idx(x, y)] = TT.WATER;

    // ---- buyable doors ----
    addDoor('Pixel Palace', 750, [[19, 22], [19, 23], [19, 24], [19, 25]], Z.HUB, Z.ARCADE, 'v');
    addDoor('Deep Six Aquarium', 1000, [[30, 13], [31, 13], [32, 13], [33, 13]], Z.HUB, Z.AQUA, 'h');
    addDoor('Burnout Speedway', 1000, [[44, 22], [44, 23], [44, 24], [44, 25]], Z.HUB, Z.SPEED, 'v');
    addDoor('the back tunnel', 1250, [[14, 10], [15, 10], [16, 10]], Z.AQUA, Z.ARCADE, 'h');
    addDoor('the service tunnel', 1250, [[47, 10], [48, 10], [49, 10]], Z.AQUA, Z.SPEED, 'h');
    addDoor('The Substation', 1250, [[13, 42], [13, 43], [13, 44]], Z.ARCADE, Z.SUB, 'v');
    addDoor('The Substation', 1250, [[50, 42], [50, 43], [50, 44]], Z.SPEED, Z.SUB, 'v');
    M.gate = addDoor('Overclock Stage', 0, [[30, 32], [31, 32], [32, 32], [33, 32]], Z.HUB, Z.VAULT, 'h', true);
    addDoor('Starwheel Plaza', 1500, [[65, 21], [65, 22], [65, 23], [65, 24]], Z.SPEED, Z.FERRIS, 'v');
    addDoor('Nightmare Manor', 1750, [[86, 39], [87, 39], [88, 39]], Z.FERRIS, Z.HAUNT, 'h');
    addDoor('Pier Nine Docks', 1500, [[31, 49], [32, 49], [33, 49]], Z.SUB, Z.PIER, 'h');
    addDoor('Nightmare Manor', 1750, [[65, 59], [65, 60], [65, 61]], Z.PIER, Z.HAUNT, 'v');

    // ---- barricaded windows (zombie entry points) ----
    addWindow(25, 15, 0, 1, Z.HUB); addWindow(38, 15, 0, 1, Z.HUB);
    addWindow(21, 18, 1, 0, Z.HUB); addWindow(42, 29, -1, 0, Z.HUB);
    addWindow(24, 32, 0, -1, Z.HUB); addWindow(39, 32, 0, -1, Z.HUB);
    addWindow(2, 16, 1, 0, Z.ARCADE); addWindow(2, 28, 1, 0, Z.ARCADE);
    addWindow(7, 11, 0, 1, Z.ARCADE); addWindow(5, 34, 0, -1, Z.ARCADE); addWindow(14, 34, 0, -1, Z.ARCADE);
    addWindow(24, 2, 0, 1, Z.AQUA); addWindow(32, 2, 0, 1, Z.AQUA); addWindow(40, 2, 0, 1, Z.AQUA);
    addWindow(22, 12, 0, -1, Z.AQUA); addWindow(41, 12, 0, -1, Z.AQUA);
    addWindow(61, 16, -1, 0, Z.SPEED); addWindow(61, 28, -1, 0, Z.SPEED);
    addWindow(56, 11, 0, 1, Z.SPEED); addWindow(58, 34, 0, -1, Z.SPEED); addWindow(48, 34, 0, -1, Z.SPEED);
    addWindow(20, 48, 0, -1, Z.SUB); addWindow(44, 48, 0, -1, Z.SUB);
    addWindow(70, 5, 0, 1, Z.FERRIS); addWindow(84, 5, 0, 1, Z.FERRIS); addWindow(92, 14, -1, 0, Z.FERRIS);
    addWindow(92, 28, -1, 0, Z.FERRIS); addWindow(72, 36, 0, -1, Z.FERRIS);
    addWindow(92, 43, -1, 0, Z.HAUNT); addWindow(92, 55, -1, 0, Z.HAUNT); addWindow(65, 49, 1, 0, Z.HAUNT);
    // ladders: the dead climb out of the water onto the pier
    addWindow(26, 57, 0, -1, Z.PIER); addWindow(40, 57, 0, -1, Z.PIER); addWindow(55, 57, 0, -1, Z.PIER);
    addWindow(17, 61, 1, 0, Z.PIER); addWindow(50, 61, -1, 0, Z.PIER); addWindow(34, 69, 0, -1, Z.PIER); addWindow(13, 54, 1, 0, Z.PIER);
    addWindow(24, 39, 0, 1, Z.SUB); addWindow(40, 39, 0, 1, Z.SUB);

    // ---- ground "riser" spawns ----
    M.risers = [
      { tx: 5, ty: 31, zone: Z.ARCADE }, { tx: 42, ty: 4, zone: Z.AQUA }, { tx: 59, ty: 14, zone: Z.SPEED },
      { tx: 46, ty: 46, zone: Z.SUB }, { tx: 17, ty: 41, zone: Z.SUB },
      { tx: 68, ty: 33, zone: Z.FERRIS }, { tx: 90, ty: 8, zone: Z.FERRIS }, { tx: 90, ty: 61, zone: Z.HAUNT },
      { tx: 68, ty: 54, zone: Z.HAUNT }, { tx: 58, ty: 54, zone: Z.PIER }, { tx: 20, ty: 63, zone: Z.PIER },
    ].map((r) => Object.assign(r, { x: (r.tx + 0.5) * T, y: (r.ty + 0.5) * T, cool: 0 }));

    // ---- props: scenery, cover and choke points ----
    // plaza
    addProp('fountain', 31, 23, 2, 2, false);
    addProp('bench', 26, 20, 2, 1, false);
    addProp('bench', 36, 27, 2, 1, false);
    addProp('booth', 36, 19, 2, 2, true);
    addProp('booth', 26, 27, 2, 2, true);
    // arcade
    addProp('cabinet', 6, 15, 2, 4, true);
    addProp('cabinet', 13, 15, 2, 4, true);
    addProp('cabinet', 6, 24, 2, 4, true);
    addProp('cabinet', 13, 24, 2, 4, true);
    addProp('counter', 9, 21, 3, 1, false);
    addProp('hockey', 9, 30, 2, 1, false);
    // aquarium
    addProp('tank', 25, 6, 2, 2, true);
    addProp('tank', 31, 6, 2, 2, true);
    addProp('tank', 37, 6, 2, 2, true);
    addProp('bench', 27, 9, 2, 1, false);
    // speedway
    addProp('tires', 51, 17, 5, 2, false);
    addProp('tires', 51, 27, 5, 2, false);
    addProp('podium', 53, 22, 1, 2, true);
    addProp('kart', 48, 20, 1, 1, false, { rot: 0.5 });
    addProp('kart', 57, 24, 1, 1, false, { rot: -2.2 });
    // substation
    addProp('generator', 22, 43, 2, 2, true);
    addProp('generator', 40, 43, 2, 2, true);
    addProp('coil', 28, 42, 1, 1, true);
    addProp('coil', 35, 45, 1, 1, true);
    addProp('crate', 30, 46, 2, 1, false);
    // stage
    addProp('speaker', 26, 34, 1, 1, true);
    addProp('speaker', 37, 34, 1, 1, true);
    // starwheel plaza: the wheel's base, booths and benches
    addProp('wheelbase', 78, 19, 3, 3, true);
    addProp('booth', 69, 27, 2, 2, true);
    addProp('booth', 87, 13, 2, 2, true);
    addProp('bench', 70, 12, 2, 1, false);
    addProp('bench', 85, 30, 2, 1, false);
    addProp('bench', 76, 30, 1, 2, false);
    // nightmare manor: mirrors, coffins, pillars and animatronics
    addProp('mirror', 70, 42, 1, 2, true);
    addProp('mirror', 82, 42, 1, 2, true);
    addProp('coffin', 77, 48, 1, 2, false);
    addProp('coffin', 69, 54, 2, 1, false);
    addProp('pillar', 80, 55, 1, 1, true);
    addProp('pillar', 72, 61, 1, 1, true);
    addProp('scare', 88, 48, 1, 1, true);
    addProp('scare', 86, 61, 1, 1, true);
    // pier: crates, barrels and a lamp post
    addProp('crate', 16, 53, 2, 1, false);
    addProp('barrel', 44, 53, 1, 1, false);
    addProp('barrel', 57, 55, 1, 1, false);
    addProp('barrel', 47, 63, 1, 1, false);
    addProp('lamp', 25, 54, 1, 1, true);
    addProp('lamp', 54, 53, 1, 1, true);

    // ---- interactable placements (logic lives in interact.js) ----
    M.perkSpots = [
      { perk: 'wind', tx: 41, ty: 17 }, { perk: 'quick', tx: 3, ty: 21 }, { perk: 'thick', tx: 28, ty: 3 },
      { perk: 'burner', tx: 60, ty: 12 }, { perk: 'twin', tx: 45, ty: 40 },
    ];
    for (const s of M.perkSpots) s.prop = addProp('perk', s.tx, s.ty, 1, 1, true, { perk: s.perk });

    M.boxSpots = [
      { tx: 17, ty: 29, w: 1, h: 2, zone: Z.ARCADE },
      { tx: 35, ty: 11, w: 2, h: 1, zone: Z.AQUA },
      { tx: 46, ty: 29, w: 1, h: 2, zone: Z.SPEED },
      { tx: 91, ty: 19, w: 1, h: 2, zone: Z.FERRIS },
      { tx: 66, ty: 50, w: 1, h: 2, zone: Z.HAUNT },
      { tx: 51, ty: 52, w: 2, h: 1, zone: Z.PIER },
    ];
    for (const s of M.boxSpots) addProp('box', s.tx, s.ty, s.w, s.h, true);

    M.pap = { tx: 31, ty: 38, w: 2, h: 1 };
    addProp('pap', 31, 38, 2, 1, true);

    // wall-mounted: tile is the wall tile, (fx,fy) is the direction it faces
    M.wallbuys = [
      { weapon: 'ranger', tx: 28, ty: 15, fx: 0, fy: 1 },
      { weapon: 'bulldog', tx: 35, ty: 32, fx: 0, fy: -1 },
      { weapon: 'buzzsaw', tx: 10, ty: 11, fx: 0, fy: 1 },
      { weapon: 'riptide', tx: 36, ty: 2, fx: 0, fy: 1 },
      { weapon: 'kestrel', tx: 52, ty: 11, fx: 0, fy: 1 },
      { weapon: 'hornet', tx: 27, ty: 39, fx: 0, fy: 1 },
      { weapon: 'anvil', tx: 77, ty: 5, fx: 0, fy: 1 },
      { weapon: 'boomstick', tx: 92, ty: 50, fx: -1, fy: 0 },
      { weapon: 'sixgun', tx: 40, ty: 51, fx: 0, fy: 1 },
    ];

    // ---- one generator per zone; each needs a fuse found somewhere in the park ----
    M.generators = [
      { zone: Z.HUB, tx: 21, ty: 20, fx: 1, fy: 0 },
      { zone: Z.ARCADE, tx: 2, ty: 24, fx: 1, fy: 0 },
      { zone: Z.AQUA, tx: 44, ty: 8, fx: -1, fy: 0 },
      { zone: Z.SPEED, tx: 61, ty: 26, fx: -1, fy: 0 },
      { zone: Z.SUB, tx: 32, ty: 39, fx: 0, fy: 1 },
      { zone: Z.VAULT, tx: 38, ty: 36, fx: -1, fy: 0 },
      { zone: Z.FERRIS, tx: 88, ty: 5, fx: 0, fy: 1 },
      { zone: Z.HAUNT, tx: 65, ty: 42, fx: 1, fy: 0 },
      { zone: Z.PIER, tx: 20, ty: 51, fx: 0, fy: 1 },
    ];
    for (const g of M.generators) {
      g.x = (g.tx + 0.5) * T;
      g.y = (g.ty + 0.5) * T;
    }
    M.powerSwitch = M.generators[4]; // the substation breaker also opens the Overclock Stage

    // hidden fuse spots (one fuse per generator is scattered among these every game)
    M.fuseSpots = [
      [22, 16], [41, 31], [3, 12], [16, 33], [8, 16], [20, 11], [43, 11], [15, 6], [48, 6],
      [56, 30], [46, 33], [55, 41], [16, 47], [47, 47], [29, 35], [35, 35], [66, 6], [91, 35],
      [73, 20], [75, 40], [89, 47], [71, 63], [84, 57], [14, 56], [21, 65], [49, 65], [32, 68],
    ].map(([tx, ty]) => ({ tx, ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T, zone: M.zone[idx(tx, ty)] }));

    // ---- traps: a floor rectangle (tiles) plus a wall switch ----
    M.traps = [
      { kind: 'zap', x: 8, y: 39, w: 3, h: 3, sw: { tx: 11, ty: 38, fx: -1, fy: 0 } },
      { kind: 'fire', x: 53, y: 39, w: 3, h: 3, sw: { tx: 52, ty: 38, fx: 1, fy: 0 } },
      { kind: 'laser', x: 30, y: 14, w: 4, h: 2, sw: { tx: 34, ty: 15, fx: 0, fy: 1 } },
    ].map((t, i) => Object.assign(t, { id: i, rx: t.x * T, ry: t.y * T, rw: t.w * T, rh: t.h * T, state: 'idle', t: 0, playerT: 0, sfxT: 0 }));

    // ---- panic room: steel shutter on (11,36..37), console inside on the east wall ----
    M.safeRoom = {
      rx: 12 * T, ry: 36 * T, rw: 4 * T, rh: 3 * T,
      door: [[11, 36], [11, 37]], dx: 11 * T, dy: 36 * T, dw: T, dh: 2 * T,
      outside: { x: 10.5 * T, y: 37 * T },
      console: { tx: 16, ty: 37, fx: -1, fy: 0 },
      hatch: { tx: 12, ty: 38 },
      state: 'open', t: 0, cd: 0, warned: false, bangT: 0, hatchT: 0,
    };

    // ---- teleporter pairs (pads are plain floor tiles) ----
    M.pads = [
      { color: '#19f0ff', a: { tx: 24, ty: 23 }, b: { tx: 37, ty: 46 } },
      { color: '#ffe14d', a: { tx: 11, ty: 14 }, b: { tx: 59, ty: 32 } },
      { color: '#ff4fd8', a: { tx: 23, ty: 10 }, b: { tx: 27, ty: 37 } },
      { color: '#3d8bff', a: { tx: 88, ty: 32 }, b: { tx: 34, ty: 64 } },
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

    // ---- wall-mounted vendors ----
    M.vendors = [
      { kind: 'armor', tx: 21, ty: 28, fx: 1, fy: 0 },
      { kind: 'tactical', item: 'cryo', tx: 19, ty: 3, fx: 1, fy: 0 },
      { kind: 'tactical', item: 'lure', tx: 61, ty: 19, fx: -1, fy: 0 },
      { kind: 'tactical', item: 'bubble', tx: 26, ty: 48, fx: 0, fy: -1 },
      { kind: 'pal', tx: 12, ty: 34, fx: 0, fy: -1 },
      { kind: 'sentry', tx: 36, ty: 39, fx: 0, fy: 1 },
    ];
    for (const v of M.vendors.concat(M.traps.map((t) => t.sw), [M.safeRoom.console])) {
      v.x = (v.tx + 0.5) * T;
      v.y = (v.ty + 0.5) * T;
    }
    M.spawn = { x: 32 * T, y: 28.5 * T };

    // ---- lights (powered unless flagged always-on) ----
    light(32, 24, 300, '#19f0ff', Z.HUB, true);
    light(24.5, 18.5, 250, '#ff4fd8', Z.HUB); light(39.5, 18.5, 250, '#ff4fd8', Z.HUB);
    light(24.5, 29.5, 250, '#ff4fd8', Z.HUB); light(39.5, 29.5, 250, '#ff4fd8', Z.HUB);
    light(5, 14, 240, '#a855ff', Z.ARCADE); light(16, 14, 240, '#ff4fd8', Z.ARCADE);
    light(10.5, 22.5, 280, '#a855ff', Z.ARCADE); light(5, 31, 240, '#ff4fd8', Z.ARCADE); light(16, 32, 240, '#a855ff', Z.ARCADE);
    light(22.5, 5, 250, '#19d8ff', Z.AQUA); light(29, 9.5, 250, '#19d8ff', Z.AQUA);
    light(35, 4.5, 250, '#3dff8b', Z.AQUA); light(41.5, 9.5, 250, '#19d8ff', Z.AQUA);
    light(17, 6.5, 200, '#19d8ff', Z.AQUA); light(47, 6.5, 200, '#19d8ff', Z.AQUA);
    light(48, 14.5, 250, '#ff8a1f', Z.SPEED); light(58.5, 14.5, 250, '#ffd426', Z.SPEED);
    light(53.5, 22.8, 300, '#ff8a1f', Z.SPEED); light(48, 31.5, 250, '#ffd426', Z.SPEED); light(58.5, 31.5, 250, '#ff8a1f', Z.SPEED);
    light(19, 42, 250, '#c8ff3a', Z.SUB); light(27, 45.5, 250, '#c8ff3a', Z.SUB);
    light(37, 42, 250, '#c8ff3a', Z.SUB); light(45, 45.5, 250, '#c8ff3a', Z.SUB);
    light(9.5, 39, 200, '#a855ff', Z.ARCADE); light(54.5, 39, 200, '#ff8a1f', Z.SPEED);
    light(28.5, 36, 230, '#ff3b6b', Z.VAULT); light(35.5, 36, 230, '#a855ff', Z.VAULT);
    light(13.9, 37.5, 170, '#3dff8b', Z.ARCADE, true); // panic room
    // dim emergency lighting that works without power
    light(32, 44, 190, '#ff3b4e', Z.SUB, true);
    // expansion lights
    light(70, 10, 260, '#ffd426', Z.FERRIS); light(88, 10, 260, '#ff4fd8', Z.FERRIS); light(79.5, 20.5, 340, '#ffd426', Z.FERRIS);
    light(70, 31, 260, '#ff4fd8', Z.FERRIS); light(88, 31, 260, '#ffd426', Z.FERRIS); light(63, 23, 180, '#ff8a1f', Z.SPEED);
    light(79.5, 30, 170, '#ff3b4e', Z.FERRIS, true);
    light(72, 43, 200, '#c9b8ff', Z.HAUNT); light(86, 49, 200, '#7dff5a', Z.HAUNT); light(70, 55, 200, '#c9b8ff', Z.HAUNT);
    light(84, 61, 200, '#ff3b4e', Z.HAUNT); light(87, 37.5, 150, '#ffd426', Z.FERRIS);
    light(20, 54, 230, '#3d8bff', Z.PIER); light(34, 54, 230, '#ffb14d', Z.PIER); light(50, 54, 230, '#3d8bff', Z.PIER);
    light(34, 63, 230, '#3d8bff', Z.PIER); light(20, 64, 210, '#ffb14d', Z.PIER); light(48, 64, 210, '#ffb14d', Z.PIER);
    light(34, 59, 160, '#ff3b4e', Z.PIER, true);
    light(10.5, 23.5, 170, '#ff3b4e', Z.ARCADE, true);
    light(32, 7.5, 170, '#ff3b4e', Z.AQUA, true);
    light(53.5, 23, 170, '#ff3b4e', Z.SPEED, true);
  };

  /* ------------------------------------------------------------------ */
  /* tile queries                                                       */
  /* ------------------------------------------------------------------ */
  M.tile = (tx, ty) => (inb(tx, ty) ? M.tiles[idx(tx, ty)] : TT.WALL);
  M.tileAt = (wx, wy) => M.tile(Math.floor(wx / T), Math.floor(wy / T));
  M.zoneAt = (wx, wy) => {
    const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    return inb(tx, ty) ? M.zone[idx(tx, ty)] : -1;
  };

  M.solidForPlayer = (tx, ty) => M.tile(tx, ty) !== TT.FLOOR;
  M.solidForZombie = (tx, ty) => {
    const t = M.tile(tx, ty);
    return t !== TT.FLOOR && t !== TT.WINDOW;
  };
  M.blocksBullet = (tx, ty) => {
    const t = M.tile(tx, ty);
    return t === TT.WALL || t === TT.DOOR || t === TT.SOLID;
  };
  M.blocksGrenade = (tx, ty) => {
    const t = M.tile(tx, ty);
    return t !== TT.FLOOR && t !== TT.LOW;
  };

  /* ------------------------------------------------------------------ */
  /* circle-vs-tile collision                                           */
  /* ------------------------------------------------------------------ */
  /** Push a circle entity {x,y} of radius r out of every solid tile it overlaps. */
  M.resolveCircle = function (e, r, solid) {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r) / T);
      const y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r) / T);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!solid(tx, ty)) continue;
          const left = tx * T, top = ty * T;
          const nx = U.clamp(e.x, left, left + T), ny = U.clamp(e.y, top, top + T);
          const dx = e.x - nx, dy = e.y - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            const push = r - d + 0.01;
            e.x += (dx / d) * push;
            e.y += (dy / d) * push;
          } else {
            // centre is inside the tile: eject through the nearest open face
            let best = Infinity, bx = 0, by = 0;
            const opts = [
              [-1, 0, e.x - left + r], [1, 0, left + T - e.x + r],
              [0, -1, e.y - top + r], [0, 1, top + T - e.y + r],
            ];
            for (const o of opts) {
              if (solid(tx + o[0], ty + o[1])) continue;
              if (o[2] < best) {
                best = o[2];
                bx = o[0];
                by = o[1];
              }
            }
            if (best === Infinity) continue; // fully enclosed, nothing sensible to do
            e.x += bx * (best + 0.01);
            e.y += by * (best + 0.01);
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
  };

  /** Move a circle entity by (dx,dy), sub-stepping so it can never tunnel. */
  M.moveCircle = function (e, dx, dy, solid) {
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      M.resolveCircle(e, e.r, solid);
      return;
    }
    const steps = Math.max(1, Math.ceil(len / (e.r * 0.6)));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      e.x += sx;
      e.y += sy;
      M.resolveCircle(e, e.r, solid);
    }
  };

  /* ------------------------------------------------------------------ */
  /* raycasting (grid DDA)                                              */
  /* ------------------------------------------------------------------ */
  /** Distance along a normalised ray until `blocks(tx,ty)` is true, capped at maxDist. */
  M.raycast = function (x, y, dx, dy, maxDist, blocks) {
    let tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (blocks(tx, ty)) return 0;
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(T / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(T / dy) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? (tx + 1) * T - x : x - tx * T) / Math.abs(dx) : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? (ty + 1) * T - y : y - ty * T) / Math.abs(dy) : Infinity;
    let t = 0;
    while (t < maxDist) {
      if (tMaxX < tMaxY) {
        t = tMaxX;
        tMaxX += tDeltaX;
        tx += stepX;
      } else {
        t = tMaxY;
        tMaxY += tDeltaY;
        ty += stepY;
      }
      if (t >= maxDist) break;
      if (blocks(tx, ty)) return t;
    }
    return maxDist;
  };

  /** True when nothing matching `blocks` lies between two points. */
  M.los = function (x1, y1, x2, y2, blocks) {
    const dx = x2 - x1, dy = y2 - y1;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return true;
    return M.raycast(x1, y1, dx / d, dy / d, d, blocks) >= d;
  };

  /* ------------------------------------------------------------------ */
  /* doors + zones                                                      */
  /* ------------------------------------------------------------------ */
  M.openDoor = function (d) {
    if (d.open) return;
    d.open = true;
    d.openT = 0;
    for (const [x, y] of d.tiles) M.tiles[idx(x, y)] = TT.FLOOR;
    M.zones[d.a].open = true;
    M.zones[d.b].open = true;
    M.markDirty();
    const i = M.doors.indexOf(d);
    if (i >= 0 && !d.power && GW.Net) GW.Net.emit('door', { i }); // co-op: open it for everyone
  };

  /** Walkability changed: every flow field must be rebuilt. */
  M.markDirty = function () {
    M.flowDirty = true;
    M.version++;
  };

  /* ------------------------------------------------------------------ */
  /* flow field: Dijkstra distance-to-player over zombie-walkable tiles */
  /* ------------------------------------------------------------------ */
  const heap = [];
  function hpush(v) {
    let i = heap.length;
    heap.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p] <= v) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = v;
  }
  function hpop() {
    const top = heap[0];
    const v = heap.pop();
    const n = heap.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && heap[c + 1] < heap[c]) c++;
        if (heap[c] >= v) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = v;
    }
    return top;
  }
  const DIRS = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];

  /** Fill `arr` (default: the main field) with path cost to (px,py). */
  M.computeFlow = function (px, py, arr) {
    const flow = arr || M.flow;
    flow.fill(65535);
    const sx = Math.floor(px / T), sy = Math.floor(py / T);
    if (flow === M.flow) {
      M.flowTx = sx;
      M.flowTy = sy;
      M.flowDirty = false;
    }
    if (!inb(sx, sy) || M.solidForZombie(sx, sy)) return;
    heap.length = 0;
    flow[idx(sx, sy)] = 0;
    hpush(idx(sx, sy)); // key = cost * 16384 + index (index < 16384)
    relax(flow);
  };

  /** Co-op: path cost to the nearest of several points (every living player). */
  M.computeFlowMulti = function (pts, arr) {
    const flow = arr || M.flow;
    flow.fill(65535);
    if (flow === M.flow) {
      M.flowTx = M.flowTy = -1;
      M.flowDirty = false;
    }
    heap.length = 0;
    for (const p of pts) {
      const sx = Math.floor(p.x / T), sy = Math.floor(p.y / T);
      if (!inb(sx, sy) || M.solidForZombie(sx, sy) || flow[idx(sx, sy)] === 0) continue;
      flow[idx(sx, sy)] = 0;
      hpush(idx(sx, sy));
    }
    relax(flow);
  };

  function relax(flow) {
    while (heap.length) {
      const key = hpop();
      const cost = Math.floor(key / 16384), i = key % 16384;
      if (cost > flow[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (const d of DIRS) {
        const nx = x + d[0], ny = y + d[1];
        if (M.solidForZombie(nx, ny)) continue;
        if (d[2] === 14 && (M.solidForZombie(x + d[0], y) || M.solidForZombie(x, y + d[1]))) continue;
        const nc = cost + d[2];
        const ni = idx(nx, ny);
        if (nc < flow[ni]) {
          flow[ni] = nc;
          hpush(nc * 16384 + ni);
        }
      }
    }
  };

  /** Path distance (in tenths of a tile) from a world position to the player. */
  M.flowAt = function (wx, wy, arr) {
    const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    return inb(tx, ty) ? (arr || M.flow)[idx(tx, ty)] : 65535;
  };

  /** Fill `out` with the centre of the best neighbouring tile to walk toward. */
  M.flowTarget = function (wx, wy, out, arr) {
    const flow = arr || M.flow;
    const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    if (!inb(tx, ty)) return false;
    let best = flow[idx(tx, ty)], bx = tx, by = ty;
    for (const d of DIRS) {
      const nx = tx + d[0], ny = ty + d[1];
      if (M.solidForZombie(nx, ny)) continue;
      if (d[2] === 14 && (M.solidForZombie(tx + d[0], ty) || M.solidForZombie(tx, ty + d[1]))) continue;
      const f = flow[idx(nx, ny)];
      if (f < best) {
        best = f;
        bx = nx;
        by = ny;
      }
    }
    if (best === 65535) return false;
    out.x = (bx + 0.5) * T;
    out.y = (by + 0.5) * T;
    return true;
  };

  /** Random open floor tile centre within a distance band of a point (for special-round spawns). */
  M.randomFloorNear = function (px, py, minD, maxD) {
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * U.TAU, d = U.rand(minD, maxD);
      const tx = Math.floor((px + Math.cos(a) * d) / T), ty = Math.floor((py + Math.sin(a) * d) / T);
      if (!inb(tx, ty) || M.tiles[idx(tx, ty)] !== TT.FLOOR) continue;
      const z = M.zone[idx(tx, ty)];
      if (z < 0 || !M.zones[z].open) continue;
      if (M.flow[idx(tx, ty)] === 65535) continue;
      return { x: (tx + 0.5) * T, y: (ty + 0.5) * T };
    }
    return null;
  };
})();
