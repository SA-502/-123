/*
 * GRAVEWAVE ARENA — shared rules (runs in the browser and in the Node server).
 * Characters, maps, movement and projectile physics. No DOM in here.
 *
 * World units are pixels; one tile is 48 px. Angles in radians, 0 = right.
 */
(function (root) {
  'use strict';
  const A = {};
  const TILE = (A.TILE = 48);
  A.R = 22; // character radius
  A.TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ */
  /* characters                                                          */
  /* ------------------------------------------------------------------ */
  /**
   * atk / sup kinds:
   *   spread  pellets fanned out      bullet  one fast shot        burst  shots in a row
   *   bolt    hurts enemies, heals allies it passes through        lob  arcs over walls, explodes
   *   slash   instant melee cone      charge  dash that rams       laser  instant beam through enemies
   *   turret  builds a turret         zone    healing circle       leap  jump onto a spot and slam
   * need = damage you must deal with normal attacks to fill the super.
   */
  A.CHARS = {
    guard: {
      name: 'GUARD', role: 'Tank · shotgun', color: '#ffb02e', hp: 7800, speed: 205, reload: 1.55, cd: 0.5, need: 3600,
      atk: { kind: 'spread', pellets: 5, fan: 0.44, range: 340, speed: 980, dmg: 330, r: 7 },
      sup: { kind: 'charge', range: 360, time: 0.32, dmg: 1500, kb: 150 },
    },
    sniper: {
      name: 'SNIPER', role: 'Long range · fragile', color: '#c44dff', hp: 3600, speed: 210, reload: 2.0, cd: 0.6, need: 4200,
      atk: { kind: 'bullet', range: 960, speed: 1750, dmg: 1450, r: 6 },
      sup: { kind: 'laser', range: 1150, dmg: 2600, width: 16 },
    },
    engineer: {
      name: 'ENGINEER', role: 'Builds a turret', color: '#19f0ff', hp: 4700, speed: 215, reload: 1.4, cd: 0.45, need: 3200,
      atk: { kind: 'burst', count: 3, gap: 0.08, range: 640, speed: 1300, dmg: 380, r: 5, fan: 0.05 },
      sup: { kind: 'turret', range: 300, hp: 3000, life: 14, dmg: 260, rate: 0.45, reach: 440 },
    },
    medic: {
      name: 'MEDIC', role: 'Heals the team', color: '#3dff8b', hp: 4500, speed: 215, reload: 1.5, cd: 0.5, need: 3000,
      atk: { kind: 'bolt', range: 640, speed: 1050, dmg: 820, heal: 700, r: 9 },
      sup: { kind: 'zone', range: 330, radius: 140, life: 5, heal: 900, dmg: 350 },
    },
    bomber: {
      name: 'BOMBER', role: 'Throws over walls', color: '#ff7a1a', hp: 3900, speed: 210, reload: 1.8, cd: 0.55, need: 3600,
      atk: { kind: 'lob', range: 480, time: 0.65, radius: 78, dmg: 1150 },
      sup: { kind: 'lob', range: 500, time: 0.8, radius: 155, dmg: 2600, kb: 120 },
    },
    ninja: {
      name: 'NINJA', role: 'Fast · close blade', color: '#ff4fd8', hp: 5400, speed: 245, reload: 0.95, cd: 0.38, need: 3600,
      atk: { kind: 'slash', range: 118, arc: 1.75, dmg: 1250 },
      sup: { kind: 'leap', range: 390, time: 0.3, radius: 100, dmg: 2000 },
    },
  };
  A.CHAR_IDS = Object.keys(A.CHARS);
  A.AMMO = 3; // ammo bars
  A.CUBE = 0.08; // each power cube: +8% health and damage
  A.REGEN_WAIT = 3; // seconds without fighting before health comes back
  A.REGEN = 0.13; // of max health per second
  A.REVEAL = 150; // enemies this close see you in the bushes
  A.SUPER_FULL = 100;

  A.maxHp = (c, cubes) => Math.round(A.CHARS[c].hp * (1 + A.CUBE * (cubes || 0)));
  A.dmgMul = (cubes) => 1 + A.CUBE * (cubes || 0);
  /** How far an aimed attack / super can reach (for the aim guide and bots). */
  A.reach = (c, sup) => {
    const s = sup ? A.CHARS[c].sup : A.CHARS[c].atk;
    return s.range || s.reach || 300;
  };
  /** Aimed at a spot (lobs, turret, zone, leap) rather than a direction. */
  A.aimsAtSpot = (c, sup) => {
    const k = (sup ? A.CHARS[c].sup : A.CHARS[c].atk).kind;
    return k === 'lob' || k === 'turret' || k === 'zone' || k === 'leap';
  };

  /* ------------------------------------------------------------------ */
  /* maps                                                                */
  /* ------------------------------------------------------------------ */
  // tiles
  const FLOOR = 0, WALL = 1, BRUSH = 2, WATER = 3, BOX = 4;
  A.T = { FLOOR, WALL, BRUSH, WATER, BOX };
  const CH = { '.': FLOOR, '#': WALL, g: BRUSH, w: WATER, x: BOX, A: FLOOR, S: FLOOR };

  /*
   * Maps are drawn as one quarter (top-left, including the middle row and column) and mirrored,
   * so both sides are always fair. A = team spawn (the mirror is the other team), S = solo spawn,
   * x = power box (10-player mode), g = bushes, w = water, # = wall.
   */
  const MAPS = {
    // 3 v 3: 35 x 21 tiles, teams start left and right
    team: {
      name: 'NEON YARD',
      w: 35,
      h: 21,
      q: [
        '##################',
        '#.....gggg........',
        '#.....gggg....##..',
        '#..##.........##..',
        '#..##....ww.......',
        '#........ww...gggg',
        '#gg...........gggg',
        '#gg...##..........',
        '#.....##....##....',
        '#A..........##....',
        '#A....ggg.........',
      ],
    },
    // everyone for themselves: 45 x 45 tiles, 12 spawn points around the map
    ffa: {
      name: 'DUST BOWL',
      w: 45,
      h: 45,
      q: [
        '#######################',
        '#S.....ggg.....x......S',
        '#......ggg............g',
        '#..##.......##....##..g',
        '#..##..x....##....##...',
        '#.........ww.........x.',
        '#gggg.....ww...ggg.....',
        '#gggg..........ggg.....',
        '#......##...x..........',
        '#..x...##.S....##..ww..',
        '#..............##..ww..',
        '#.ggg....ww............',
        '#.ggg....ww....x...ggg.',
        '#.....##...........ggg.',
        '#.....##..ggg.##.......',
        '#..x......ggg.##....x..',
        '#....ww................',
        '#....ww....x....ggg....',
        '#.##........##..ggg....',
        '#.##..ggg...##.........',
        '#.....ggg.....x....##..',
        '#gg................##..',
        '#Sg...x..........ggg...',
      ],
    },
  };
  A.MAP_INFO = { team: { name: MAPS.team.name }, ffa: { name: MAPS.ffa.name } };

  /** Build a map: tiles, spawn points and box positions. */
  A.buildMap = function (mode) {
    const def = MAPS[mode] || MAPS.team;
    const W = def.w, H = def.h, qw = (W + 1) >> 1, qh = (H + 1) >> 1;
    const tiles = new Uint8Array(W * H);
    const spawnA = [], spawnB = [], spawns = [], boxes = [];
    const put = (x, y, ch, mirroredX) => {
      const i = y * W + x;
      tiles[i] = CH[ch] === undefined ? FLOOR : CH[ch];
      const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
      if (ch === 'A') (mirroredX ? spawnB : spawnA).push({ x: px, y: py });
      if (ch === 'S') spawns.push({ x: px, y: py });
      if (ch === 'x') boxes.push({ id: boxes.length, tx: x, ty: y });
    };
    const seen = new Set();
    for (let y = 0; y < qh; y++) {
      const row = (def.q[y] || '').padEnd(qw, '.').slice(0, qw);
      for (let x = 0; x < qw; x++) {
        const ch = row[x];
        for (const [mx, my, flipX] of [[x, y, false], [W - 1 - x, y, true], [x, H - 1 - y, false], [W - 1 - x, H - 1 - y, true]]) {
          const k = my * W + mx;
          if (seen.has(k)) continue;
          seen.add(k);
          put(mx, my, ch, flipX);
        }
      }
    }
    // a solid border, whatever the drawing says
    for (let x = 0; x < W; x++) tiles[x] = tiles[(H - 1) * W + x] = WALL;
    for (let y = 0; y < H; y++) tiles[y * W] = tiles[y * W + W - 1] = WALL;
    return { mode: MAPS[mode] ? mode : 'team', name: def.name, w: W, h: H, pw: W * TILE, ph: H * TILE, tiles, spawnA, spawnB, spawns, boxes };
  };

  A.tile = (m, tx, ty) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? WALL : m.tiles[ty * m.w + tx]);
  A.tileAt = (m, x, y) => A.tile(m, Math.floor(x / TILE), Math.floor(y / TILE));
  A.blocksMove = (t) => t === WALL || t === WATER || t === BOX;
  A.blocksShot = (t) => t === WALL || t === BOX;
  A.inBrush = (m, x, y) => A.tileAt(m, x, y) === BRUSH;

  /** Slide a circle by (dx, dy) against walls, water and boxes (axis by axis, so it slides along walls). */
  A.move = function (m, e, dx, dy, r) {
    r = r || A.R;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 12));
    for (let s = 0; s < steps; s++) {
      e.x += dx / steps;
      push(m, e, r, true);
      e.y += dy / steps;
      push(m, e, r, false);
    }
  };
  function push(m, e, r, horiz) {
    const tx0 = Math.floor((e.x - r) / TILE), tx1 = Math.floor((e.x + r) / TILE);
    const ty0 = Math.floor((e.y - r) / TILE), ty1 = Math.floor((e.y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!A.blocksMove(A.tile(m, tx, ty))) continue;
        // closest point of the tile to the circle centre
        const cx = Math.max(tx * TILE, Math.min(e.x, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(e.y, ty * TILE + TILE));
        const ddx = e.x - cx, ddy = e.y - cy, d2 = ddx * ddx + ddy * ddy;
        if (d2 >= r * r) continue;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2), k = (r - d) / d;
          e.x += ddx * k;
          e.y += ddy * k;
        } else if (horiz) e.x += e.x < tx * TILE + TILE / 2 ? -r : r;
        else e.y += e.y < ty * TILE + TILE / 2 ? -r : r;
      }
  }

  /** Distance a shot travels from (x, y) along angle a before a wall or box stops it (<= max). */
  A.ray = function (m, x, y, a, max) {
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let d = 0; d < max; d += 6) if (A.blocksShot(A.tileAt(m, x + dx * d, y + dy * d))) return Math.max(0, d - 3);
    return max;
  };
  /** True when nothing solid is between two points. */
  A.los = (m, x1, y1, x2, y2) => {
    const d = Math.hypot(x2 - x1, y2 - y1);
    return A.ray(m, x1, y1, Math.atan2(y2 - y1, x2 - x1), d) >= d - 1;
  };
  /** Does the segment (x1,y1)-(x2,y2) pass within r of (cx, cy)? */
  A.segHit = function (x1, y1, x2, y2, cx, cy, r) {
    const vx = x2 - x1, vy = y2 - y1, L2 = vx * vx + vy * vy;
    let t = L2 ? ((cx - x1) * vx + (cy - y1) * vy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x1 + vx * t - cx, py = y1 + vy * t - cy;
    return px * px + py * py <= r * r;
  };
  /** The tile centre of a box id, in pixels. */
  A.boxPos = (m, b) => ({ x: (b.tx + 0.5) * TILE, y: (b.ty + 0.5) * TILE });

  /** Small fast seeded random generator. */
  A.rng = function (seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------------------------------------------ */
  /* attacks                                                              */
  /* ------------------------------------------------------------------ */
  /**
   * Projectiles fired by one attack. `shot` = { o: owner id, tm: team, c: char, s: super?, x, y, a, d (aimed distance), m: damage multiplier }.
   * Straight shots: { k:'p', x, y, a, sp, life, r, dmg, heal, pierce, wait, kb }.
   * Lobs:           { k:'lob', x0, y0, tx, ty, T, t, rad, dmg, kb }.
   * Instant attacks (slash, laser, charge, leap, turret, zone) return [] and are resolved by the caller.
   */
  A.projectiles = function (shot) {
    const ch = A.CHARS[shot.c], spec = shot.s ? ch.sup : ch.atk, mul = shot.m || 1;
    const base = { o: shot.o, tm: shot.tm, c: shot.c, s: !!shot.s, color: ch.color, hit: null };
    const out = [];
    const straight = (a, extra) =>
      out.push(Object.assign({}, base, { k: 'p', x: shot.x, y: shot.y, a, sp: spec.speed, life: spec.range / spec.speed, r: spec.r || 6, dmg: Math.round(spec.dmg * mul), heal: spec.heal || 0, pierce: false, wait: 0, kb: spec.kb || 0 }, extra));
    switch (spec.kind) {
      case 'spread':
        for (let i = 0; i < spec.pellets; i++) straight(shot.a + (i / (spec.pellets - 1) - 0.5) * spec.fan);
        break;
      case 'bullet':
        straight(shot.a);
        break;
      case 'burst':
        for (let i = 0; i < spec.count; i++) straight(shot.a + (i - (spec.count - 1) / 2) * spec.fan * 0.5, { wait: i * spec.gap });
        break;
      case 'bolt':
        straight(shot.a, { pierce: true });
        break;
      case 'lob': {
        const d = Math.min(spec.range, Math.max(60, shot.d || spec.range));
        out.push(Object.assign({}, base, { k: 'lob', x0: shot.x, y0: shot.y, tx: shot.x + Math.cos(shot.a) * d, ty: shot.y + Math.sin(shot.a) * d, T: spec.time, t: 0, rad: spec.radius, dmg: Math.round(spec.dmg * mul), kb: spec.kb || 0 }));
        break;
      }
    }
    return out;
  };

  /**
   * Advance one projectile. Calls hitTest(p, x1, y1, x2, y2) for straight shots so the caller can
   * find what it hit along the way (return true to stop the shot). Returns false when it is gone.
   * Lobs return 'boom' on the frame they land.
   */
  A.stepProjectile = function (m, p, dt, hitTest) {
    if (p.k === 'lob') {
      p.t += dt;
      return p.t >= p.T ? 'boom' : true;
    }
    if (p.wait > 0) {
      p.wait -= dt;
      return true;
    }
    const step = p.sp * dt;
    const nx = p.x + Math.cos(p.a) * step, ny = p.y + Math.sin(p.a) * step;
    const free = A.ray(m, p.x, p.y, p.a, step);
    const ex = p.x + Math.cos(p.a) * free, ey = p.y + Math.sin(p.a) * free;
    if (hitTest && hitTest(p, p.x, p.y, ex, ey)) return false;
    if (free < step - 0.5) {
      p.wallX = ex;
      p.wallY = ey;
      return false;
    }
    p.x = nx;
    p.y = ny;
    p.life -= dt;
    return p.life > 0;
  };
  /** Where a lob is now, with its height (for drawing). */
  A.lobPos = (p) => {
    const k = Math.min(1, p.t / p.T);
    return { x: p.x0 + (p.tx - p.x0) * k, y: p.y0 + (p.ty - p.y0) * k, h: Math.sin(k * Math.PI) * 70 };
  };

  /* ------------------------------------------------------------------ */
  /* the gas (10-player mode): a ring that closes in on the middle       */
  /* ------------------------------------------------------------------ */
  A.GAS = { start: 25, end: 150, min: 3.2 * TILE, dps: 900 };
  A.gasRadius = (m, t) => {
    const full = Math.hypot(m.pw, m.ph) / 2 + TILE;
    if (t <= A.GAS.start) return full;
    const k = Math.min(1, (t - A.GAS.start) / (A.GAS.end - A.GAS.start));
    return full + (A.GAS.min - full) * k;
  };

  A.TEAM_GOAL = 15; // kills to win a 3 v 3
  A.TEAM_TIME = 180; // seconds
  A.RESPAWN = 4;
  A.BOX_HP = 3200;

  root.Arena = A;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.GW = window.GW || {}));
