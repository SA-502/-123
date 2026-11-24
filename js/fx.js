/* GRAVEWAVE — transient effects: particles, tracers, lightning, shock rings, lights, popups, corpses */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U;
  const FX = (GW.FX = {});
  FX.maxParts = 700; // lowered on touch devices

  FX.reset = function () {
    FX.parts = [];
    FX.tracers = [];
    FX.bolts = [];
    FX.rings = [];
    FX.lights = [];
    FX.popups = [];
    FX.corpses = [];
    FX.slashes = [];
    FX.shakeAmt = 0;
    FX.hitmark = { t: 0, kill: false, crit: false };
    FX.flash = 0; // white screen flash 0..1
  };
  FX.reset();

  function part(p) {
    if (FX.parts.length >= FX.maxParts) FX.parts.shift();
    FX.parts.push(p);
  }

  /** Blood spray. dir = angle the spray travels. */
  FX.blood = function (x, y, dir, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = dir + U.rand(-0.7, 0.7), s = U.rand(0.3, 1) * (speed || 220);
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.2, 0.5), max: 0.5, size: U.rand(1.5, 3.6), color: Math.random() < 0.5 ? '#8f0f1f' : '#c4162b', drag: 5, glow: false });
    }
  };

  /** Bright sparks (drawn additively, after lighting). */
  FX.sparks = function (x, y, dir, n, color, speed, spread) {
    const sp = spread === undefined ? 0.9 : spread;
    for (let i = 0; i < n; i++) {
      const a = dir + U.rand(-sp, sp), s = U.rand(0.3, 1) * (speed || 260);
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.12, 0.4), max: 0.4, size: U.rand(1.2, 2.6), color: color || '#ffe7a3', drag: 4, glow: true });
    }
  };

  /** Flamethrower plume: soft, growing embers that drift out to `reach`. tint recolours an overclocked plume. */
  FX.flame = function (x, y, dir, reach, spread, tint) {
    const n = FX.maxParts < 500 ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = dir + U.rand(-spread, spread) * 0.8, s = U.rand(0.75, 1.15) * reach * 2.6;
      const r = Math.random();
      const color = tint ? (r < 0.5 ? tint : '#ffffff') : r < 0.45 ? '#ff7a1a' : r < 0.8 ? '#ffb02e' : '#ffe14d';
      part({ x: x + U.rand(-3, 3), y: y + U.rand(-3, 3), vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.26, 0.4), max: 0.4, size: U.rand(3, 6), color, drag: 3.2, glow: true, flame: true });
    }
  };

  /** A blade's swing: a bright arc in front of the player. side = 1 / -1 for the swing direction. */
  FX.slash = function (x, y, dir, r, color, side) {
    FX.slashes.push({ x, y, dir, r, color: color || '#dfe9f2', side: side || 1, life: 0.18, max: 0.18 });
  };

  FX.burst = function (x, y, n, color, speed) {
    FX.sparks(x, y, 0, n, color, speed, Math.PI);
  };

  FX.smoke = function (x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU, s = U.rand(10, 60);
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 12, life: U.rand(0.5, 1.1), max: 1.1, size: U.rand(7, 16), color: '#2a2433', drag: 1.5, glow: false, smoke: true });
    }
  };

  /** Ejected shell casing. */
  FX.casing = function (x, y, dir) {
    const a = dir + Math.PI / 2 + U.rand(-0.4, 0.4), s = U.rand(70, 150);
    part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, max: 0.7, size: 2, color: '#d9b45a', drag: 5, glow: false });
  };

  FX.tracer = function (x1, y1, x2, y2, color, width, life, laser) {
    if (FX.tracers.length > 80) FX.tracers.shift();
    FX.tracers.push({ x1, y1, x2, y2, color, width, life, max: life, laser: !!laser });
  };

  /** Jagged lightning between two points. */
  FX.bolt = function (x1, y1, x2, y2, color, life, width) {
    const pts = [];
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(3, Math.floor(d / 22));
    const nx = -(y2 - y1) / (d || 1), ny = (x2 - x1) / (d || 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = i === 0 || i === n ? 0 : U.rand(-14, 14);
      pts.push(U.lerp(x1, x2, t) + nx * off, U.lerp(y1, y2, t) + ny * off);
    }
    FX.bolts.push({ pts, color: color || '#8fd8ff', life: life || 0.22, max: life || 0.22, width: width || 3 });
  };

  FX.ring = function (x, y, r, color, life, width) {
    FX.rings.push({ x, y, r, color, life, max: life, width: width || 4 });
  };

  /** Temporary dynamic light (muzzle flash, explosion). */
  FX.light = function (x, y, r, color, life) {
    if (FX.lights.length > 40) FX.lights.shift();
    FX.lights.push({ x, y, r, color, life, max: life });
  };

  FX.popup = function (x, y, text, color, size, life) {
    if (FX.popups.length > 40) FX.popups.shift();
    const l = life || 0.9;
    FX.popups.push({ x: x + U.rand(-8, 8), y, text, color: color || '#ffe14d', size: size || 14, life: l, max: l, vy: -46 });
  };

  /**
   * Overclocked muzzle flash: a hot core and a starburst that grow with the tier (1..3);
   * a modded weapon flashes its mod colour too.
   */
  FX.muzzle = function (x, y, dir, color, tier, modColor) {
    const len = 10 + tier * 7;
    for (let i = -1; i <= 1; i++) {
      const a = dir + i * (0.5 - tier * 0.06);
      FX.tracer(x, y, x + Math.cos(a) * len * (i ? 0.55 : 1), y + Math.sin(a) * len * (i ? 0.55 : 1), i ? color : '#ffffff', 1.5 + tier * 0.9, 0.05 + tier * 0.01, true);
    }
    if (tier >= 2) FX.ring(x, y, 8 + tier * 4, color, 0.08, 1.5 + tier * 0.5);
    if (modColor) FX.sparks(x, y, dir, tier, modColor, 260, 0.6);
  };

  FX.corpse = function (z) {
    if (FX.corpses.length > 40) FX.corpses.shift();
    FX.corpses.push({ x: z.x, y: z.y, angle: z.angle, r: z.r, skin: z.skin, shirt: z.shirt, life: 2.6, max: 2.6 });
  };

  FX.shake = function (a) {
    FX.shakeAmt = Math.min(16, Math.max(FX.shakeAmt, a));
  };

  FX.hit = function (kill, crit) {
    FX.hitmark.t = kill ? 0.22 : 0.12;
    FX.hitmark.kill = kill;
    FX.hitmark.crit = crit;
  };

  /** Explosion visuals (damage is handled by the weapons module). */
  FX.explosion = function (x, y, r, color) {
    FX.ring(x, y, r, color, 0.35, 6);
    FX.light(x, y, r * 2.4, color, 0.4);
    FX.burst(x, y, 26, color, 420);
    FX.burst(x, y, 12, '#ffffff', 260);
    FX.smoke(x, y, 8);
    FX.shake(Math.min(12, r / 12));
    GW.MapArt.decal(x, y, r * 0.5, '#050308', 0.5);
  };

  /**
   * Status effects on the horde, drawn with particles so they read on any zombie art:
   * burnT (Inferno / flames), slowT + freezeT (Frost / Cryo), shockT (Arc), crawl (legless crawler).
   * shockT, blastT and dmgTxtT are visual-only timers and run down here.
   */
  let statusT = 0;
  function statusFx(dt) {
    const Zs = GW.Zombies;
    if (!Zs || !Zs.list) return;
    statusT += dt;
    if (statusT < 1 / 30) return;
    const step = statusT;
    statusT = 0;
    const lite = FX.maxParts < 500 ? 0.5 : 1; // phones: half the extra particles
    for (const z of Zs.list) {
      if (z.dead) continue;
      if (z.shockT > 0) z.shockT -= step;
      if (z.blastT > 0) z.blastT -= step;
      if (z.dmgTxtT > 0) z.dmgTxtT -= step;
      if (z.burnT > 0 && Math.random() < 14 * step * lite) {
        const r = Math.random();
        part({ x: z.x + U.rand(-z.r, z.r) * 0.7, y: z.y + U.rand(-z.r, z.r) * 0.5, vx: U.rand(-12, 12), vy: U.rand(-80, -40), life: U.rand(0.25, 0.45), max: 0.45, size: U.rand(2.5, 4.5), color: r < 0.5 ? '#ff7a1a' : r < 0.85 ? '#ffb02e' : '#ffe14d', drag: 2, glow: true, flame: true });
      }
      if (z.freezeT > 0) {
        if (Math.random() < 6 * step * lite) part({ x: z.x + U.rand(-z.r, z.r), y: z.y + U.rand(-z.r, z.r), vx: 0, vy: -8, life: 0.35, max: 0.35, size: U.rand(1.5, 2.5), color: '#ffffff', drag: 1, glow: true });
      } else if (z.slowT > 0 && Math.random() < 7 * step * lite) {
        part({ x: z.x + U.rand(-z.r, z.r), y: z.y + U.rand(-z.r, z.r) * 0.6, vx: U.rand(-10, 10), vy: U.rand(10, 26), life: U.rand(0.3, 0.6), max: 0.6, size: U.rand(1.5, 3), color: Math.random() < 0.5 ? '#8fe9ff' : '#d8f8ff', drag: 1.5, glow: true });
      }
      if (z.shockT > 0 && Math.random() < 12 * step * lite) {
        const a = Math.random() * U.TAU, b = a + U.rand(1, 2.4), rr = z.r + 4;
        FX.bolt(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, z.x + Math.cos(b) * rr, z.y + Math.sin(b) * rr, '#bfe9ff', 0.08, 1.5);
      }
      if (z.crawl && z.state === 'chase' && Math.random() < 3 * step * lite) {
        part({ x: z.x + U.rand(-4, 4), y: z.y + U.rand(-4, 4), vx: 0, vy: 0, life: 0.8, max: 0.8, size: U.rand(2, 3.5), color: '#6e0b18', drag: 1, glow: false });
      }
    }
  }

  FX.update = function (dt) {
    statusFx(dt);
    let arr = FX.parts;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) {
        arr.splice(i, 1);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const list of [FX.tracers, FX.bolts, FX.rings, FX.lights, FX.corpses, FX.slashes]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt;
        if (list[i].life <= 0) list.splice(i, 1);
      }
    }
    arr = FX.popups;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      p.y += p.vy * dt;
      p.vy *= Math.exp(-2.5 * dt);
      if (p.life <= 0) arr.splice(i, 1);
    }
    FX.shakeAmt *= Math.exp(-9 * dt);
    if (FX.shakeAmt < 0.05) FX.shakeAmt = 0;
    if (FX.hitmark.t > 0) FX.hitmark.t -= dt;
    if (FX.flash > 0) FX.flash = Math.max(0, FX.flash - dt * 1.6);
  };
})();
