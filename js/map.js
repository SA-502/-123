/* GRAVEWAVE — Lumina Pier: tile map, zones, doors, collision, raycasting and the zombie flow field */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, T = GW.CFG.TILE;

  /** Tile types. */
  const TT = { WALL: 0, FLOOR: 1, LOW: 2, DOOR: 3, WINDOW: 4, SOLID: 5 };
  /** Zone ids. */
  const Z = { HUB: 0, ARCADE: 1, AQUA: 2, SPEED: 3, SUB: 4, VAULT: 5 };

  const M = (GW.Map = { TT, Z, W: 64, H: 50 });
  M.pxW = M.W * T;
  M.pxH = M.H * T;

  const ZONE_DEFS = [
    { id: 0, name: 'Boardwalk Plaza', color: '#ff4fd8', short: 'PLAZA' },
    { id: 1, name: 'Pixel Palace', color: '#a855ff', short: 'ARCADE' },
    { id: 2, name: 'Deep Six Aquarium', color: '#19d8ff', short: 'AQUARIUM' },
    { id: 3, name: 'Burnout Speedway', color: '#ff8a1f', short: 'SPEEDWAY' },
    { id: 4, name: 'The Substation', color: '#c8ff3a', short: 'SUBSTATION' },
    { id: 5, name: 'Overclock Stage', color: '#ff3b6b', short: 'STAGE' },
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

    // ---- buyable doors ----
    addDoor('Pixel Palace', 750, [[19, 22], [19, 23], [19, 24], [19, 25]], Z.HUB, Z.ARCADE, 'v');
    addDoor('Deep Six Aquarium', 1000, [[30, 13], [31, 13], [32, 13], [33, 13]], Z.HUB, Z.AQUA, 'h');
    addDoor('Burnout Speedway', 1000, [[44, 22], [44, 23], [44, 24], [44, 25]], Z.HUB, Z.SPEED, 'v');
    addDoor('the back tunnel', 1250, [[14, 10], [15, 10], [16, 10]], Z.AQUA, Z.ARCADE, 'h');
    addDoor('the service tunnel', 1250, [[47, 10], [48, 10], [49, 10]], Z.AQUA, Z.SPEED, 'h');
    addDoor('The Substation', 1250, [[13, 42], [13, 43], [13, 44]], Z.ARCADE, Z.SUB, 'v');
    addDoor('The Substation', 1250, [[50, 42], [50, 43], [50, 44]], Z.SPEED, Z.SUB, 'v');
    M.gate = addDoor('Overclock Stage', 0, [[30, 32], [31, 32], [32, 32], [33, 32]], Z.HUB, Z.VAULT, 'h', true);

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
    addWindow(20, 48, 0, -1, Z.SUB); addWindow(32, 48, 0, -1, Z.SUB); addWindow(44, 48, 0, -1, Z.SUB);
    addWindow(24, 39, 0, 1, Z.SUB); addWindow(40, 39, 0, 1, Z.SUB);

    // ---- ground "riser" spawns ----
    M.risers = [
      { tx: 5, ty: 31, zone: Z.ARCADE }, { tx: 42, ty: 4, zone: Z.AQUA }, { tx: 59, ty: 14, zone: Z.SPEED },
      { tx: 46, ty: 46, zone: Z.SUB }, { tx: 17, ty: 41, zone: Z.SUB },
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

    // ---- interactable placements (logic lives in interact.js) ----
    M.perkSpots = [
      { perk: 'wind', tx: 41, ty: 17 }, { perk: 'quick', tx: 3, ty: 21 }, { perk: 'thick', tx: 28, ty: 3 },
      { perk: 'burner', tx: 60, ty: 22 }, { perk: 'twin', tx: 45, ty: 40 },
    ];
    for (const s of M.perkSpots) s.prop = addProp('perk', s.tx, s.ty, 1, 1, true, { perk: s.perk });

    M.boxSpots = [
      { tx: 17, ty: 29, w: 1, h: 2, zone: Z.ARCADE },
      { tx: 35, ty: 11, w: 2, h: 1, zone: Z.AQUA },
      { tx: 46, ty: 29, w: 1, h: 2, zone: Z.SPEED },
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
    ];
    M.powerSwitch = { tx: 32, ty: 39, fx: 0, fy: 1 };

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
      state: 'open', t: 0, cd: 0, warned: false, bangT: 0,
    };

    // ---- teleporter pairs (pads are plain floor tiles) ----
    M.pads = [
      { color: '#19f0ff', a: { tx: 24, ty: 23 }, b: { tx: 37, ty: 46 } },
      { color: '#ffe14d', a: { tx: 11, ty: 14 }, b: { tx: 59, ty: 32 } },
      { color: '#ff4fd8', a: { tx: 23, ty: 10 }, b: { tx: 27, ty: 37 } },
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
    hpush(idx(sx, sy)); // key = cost * 4096 + index (index < 4096)
    while (heap.length) {
      const key = hpop();
      const cost = Math.floor(key / 4096), i = key % 4096;
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
          hpush(nc * 4096 + ni);
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
