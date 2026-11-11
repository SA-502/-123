/* GRAVEWAVE — weapon instances, hitscan / projectile / chain-lightning fire modes, explosions, grenades */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio;
  const Wp = (GW.Weapons = { projectiles: [], grenades: [] });
  const PLASMA_SPEED = 950;

  Wp.reset = function () {
    Wp.projectiles = [];
    Wp.grenades = [];
  };

  /** New weapon instance with a full magazine and reserve. */
  Wp.create = function (id) {
    const def = GW.WEAPONS[id];
    return { id, def, up: false, s: def, clip: def.mag, reserve: def.reserve, cd: 0, reloadT: 0, reloadDur: 0 };
  };

  /** Apply the Overclocker upgrade: merged stats, new name, full ammo. */
  Wp.upgrade = function (w) {
    const s = Object.assign({}, w.def, w.def.up);
    delete s.up;
    w.up = true;
    w.s = s;
    w.clip = s.mag;
    w.reserve = s.reserve;
    w.reloadT = 0;
    w.cd = 0;
  };

  Wp.startReload = function (w, player) {
    if (!w || w.reloadT > 0 || w.clip >= w.s.mag || w.reserve <= 0) return false;
    w.reloadDur = w.s.reload * (player.perks.quick ? 0.5 : 1);
    w.reloadT = w.reloadDur;
    A.play('reloadStart');
    return true;
  };

  Wp.finishReload = function (w) {
    const take = Math.min(w.s.mag - w.clip, w.reserve);
    w.clip += take;
    w.reserve -= take;
    w.reloadT = 0;
    A.play('reloadEnd');
  };

  /**
   * Attempt to fire. `pressed` is true on a fresh (or buffered) trigger pull, which semi-autos require.
   * Returns true when a shot actually left the barrel.
   */
  Wp.tryFire = function (p, w, pressed) {
    if (!w || w.reloadT > 0 || w.cd > 0) return false;
    // semi-autos fire per click; holding the trigger still works, just at a slower cadence
    if (!w.s.auto && !pressed && w.cd > -(60 / w.s.rpm) * 0.7) return false;
    if (w.clip <= 0) {
      if (w.reserve > 0) Wp.startReload(w, p);
      else if (pressed) A.play('empty');
      return false;
    }
    fire(p, w);
    return true;
  };

  function fire(p, w) {
    const s = w.s;
    w.clip--;
    w.cd = (60 / s.rpm) * (p.perks.twin ? 0.75 : 1);
    p.stats.shots++;
    const a = p.angle, ca = Math.cos(a), sa = Math.sin(a);

    // muzzle position, pulled back if the barrel would poke through a wall
    let ml = p.r + s.len;
    const free = M.raycast(p.x, p.y, ca, sa, ml + 2, M.blocksBullet);
    if (free < ml + 2) ml = Math.max(0, free - 2);
    const mx = p.x + ca * ml, my = p.y + sa * ml;

    const shot = { hits: new Set(), hitAny: false, killAny: false, crit: false };
    const spread = s.spread * (p.moving ? 1.35 : 1);

    if (s.type === 'plasma') {
      const ang = a + U.rand(-spread, spread);
      Wp.projectiles.push({
        x: mx, y: my, vx: Math.cos(ang) * PLASMA_SPEED, vy: Math.sin(ang) * PLASMA_SPEED,
        life: s.range / PLASMA_SPEED, s, color: s.color, trail: 0,
      });
    } else if (s.type === 'arc') {
      arcFire(p, s, mx, my, ca, sa, shot);
    } else {
      for (let i = 0; i < s.pellets; i++) hitscan(p, a + U.rand(-spread, spread), s, shot, mx, my, w.up);
    }

    const flashCol = w.up || s.cls === 'energy' ? s.color : '#ffd68a';
    FX.light(mx, my, s.pellets > 1 ? 210 : 150, flashCol, 0.07);
    FX.sparks(mx, my, a, s.pellets > 1 ? 7 : 3, flashCol, 320, 0.35);
    if (s.cls !== 'energy') FX.casing(p.x + ca * 8, p.y + sa * 8, a);
    FX.shake(s.kick * 0.55);
    p.recoil = 1;
    p.muzzleT = 0.05;
    A.play(s.type === 'arc' ? 'arc' : 'shot', { cls: s.cls, up: w.up });
    if (shot.hitAny) {
      p.stats.hits++;
      FX.hit(shot.killAny, shot.crit);
      if (shot.crit) A.play('crit');
    }
  }

  /** Instant bullet: walls stop it, zombies are hit in order with limited penetration. */
  function hitscan(p, ang, s, shot, mx, my, upgraded) {
    const ox = p.x, oy = p.y;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const wallD = M.raycast(ox, oy, dx, dy, s.range, M.blocksBullet);
    const hits = [];
    const zs = GW.Zombies.list;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (z.dead) continue;
      const rx = z.x - ox, ry = z.y - oy;
      const t = rx * dx + ry * dy;
      if (t < -z.r || t > wallD + z.r) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      const hr = z.r + 2;
      if (perp > hr) continue;
      const th = t - Math.sqrt(hr * hr - perp * perp);
      if (th > wallD) continue;
      hits.push({ z, t: Math.max(0, th), perp });
    }
    hits.sort((a, b) => a.t - b.t);

    let endD = wallD, dmg = s.dmg, count = 0;
    for (const h of hits) {
      if (count >= s.pierce) break;
      const z = h.z;
      const crit = h.perp < z.r * 0.38;
      let d = dmg * (crit ? s.crit : 1);
      if (s.pellets > 1) {
        const f = h.t / s.range;
        if (f > 0.55) d *= U.lerp(1, 0.35, (f - 0.55) / 0.45);
      }
      const killed = GW.Zombies.damage(z, d, { crit, dir: ang });
      shot.hitAny = true;
      if (crit) shot.crit = true;
      if (killed) shot.killAny = true;
      else if (!shot.hits.has(z.id)) {
        shot.hits.add(z.id);
        GW.Game.addPoints(C.POINTS.hit, z.x, z.y - z.r, { small: true });
      }
      count++;
      dmg *= 0.8;
      if (count >= s.pierce) endD = h.t;
    }

    const ex = ox + dx * endD, ey = oy + dy * endD;
    if (upgraded) FX.tracer(mx, my, ex, ey, s.color, s.pellets > 1 ? 2.2 : 3.2, 0.13, true);
    else FX.tracer(mx, my, ex, ey, '#ffe7a3', s.pellets > 1 ? 1 : 1.5, 0.07, false);
    if (endD === wallD && wallD < s.range - 0.5) FX.sparks(ex, ey, ang + Math.PI, 4, upgraded ? s.color : '#ffd68a', 200);
  }

  /** Chain lightning: strikes the first zombie in the beam, then leaps between neighbours. */
  function arcFire(p, s, mx, my, dx, dy, shot) {
    const wallD = M.raycast(p.x, p.y, dx, dy, s.range, M.blocksBullet);
    const zs = GW.Zombies.list;
    let first = null, bestT = Infinity;
    for (const z of zs) {
      if (z.dead) continue;
      const rx = z.x - p.x, ry = z.y - p.y;
      const t = rx * dx + ry * dy;
      if (t < 0 || t > wallD + z.r) continue;
      if (Math.abs(rx * dy - ry * dx) > z.r + 18) continue;
      if (t < bestT) {
        bestT = t;
        first = z;
      }
    }
    if (!first) {
      const ex = p.x + dx * wallD, ey = p.y + dy * wallD;
      FX.bolt(mx, my, ex, ey, s.color, 0.2, 3);
      FX.burst(ex, ey, 10, s.color, 260);
      FX.light(ex, ey, 160, s.color, 0.2);
      return;
    }
    const chain = [];
    let cur = first, px = mx, py = my;
    while (cur && chain.length < s.chain) {
      FX.bolt(px, py, cur.x, cur.y, s.color, 0.3, 3.5);
      FX.bolt(px, py, cur.x, cur.y, '#ffffff', 0.16, 1.5);
      FX.light(cur.x, cur.y, 170, s.color, 0.3);
      FX.burst(cur.x, cur.y, 8, s.color, 240);
      chain.push(cur);
      px = cur.x;
      py = cur.y;
      let nxt = null, bd = 250;
      for (const z of zs) {
        if (z.dead || chain.indexOf(z) >= 0) continue;
        const d = U.dist(px, py, z.x, z.y);
        if (d < bd && M.los(px, py, z.x, z.y, M.blocksBullet)) {
          bd = d;
          nxt = z;
        }
      }
      cur = nxt;
    }
    for (const z of chain) {
      const dmg = z.type === 'brute' ? Math.max(3500, z.maxHp * 0.5) : z.maxHp * 3;
      const killed = GW.Zombies.damage(z, dmg, { dir: Math.atan2(z.y - p.y, z.x - p.x), shock: true });
      shot.hitAny = true;
      if (killed) shot.killAny = true;
      else GW.Game.addPoints(C.POINTS.hit, z.x, z.y - z.r, { small: true });
    }
  }

  /**
   * Radial damage with linear falloff and line-of-sight.
   * opts: { color, sound, skip (zombie already hit directly), hurtPlayer (max self damage) }
   */
  Wp.explode = function (x, y, r, dmgMax, dmgMin, opts) {
    opts = opts || {};
    FX.explosion(x, y, r, opts.color || '#ffb14d');
    A.play(opts.sound || 'explosion', { x, y });
    const Zs = GW.Zombies;
    let any = false, kill = false;
    for (const z of Zs.list.slice()) {
      if (z.dead || z === opts.skip) continue;
      const d = Math.max(0, U.dist(x, y, z.x, z.y) - z.r);
      if (d > r) continue;
      if (!M.los(x, y, z.x, z.y, M.blocksBullet)) continue;
      const f = 1 - d / r;
      const ang = Math.atan2(z.y - y, z.x - x);
      z.kx += Math.cos(ang) * 280 * f;
      z.ky += Math.sin(ang) * 280 * f;
      const killed = Zs.damage(z, U.lerp(dmgMin, dmgMax, f), { explosive: true, dir: ang });
      any = true;
      if (killed) kill = true;
      else GW.Game.addPoints(C.POINTS.hit, z.x, z.y - z.r, { small: true });
    }
    if (opts.hurtPlayer) {
      const P = GW.Player;
      const pr = r * 0.7;
      const d = U.dist(x, y, P.x, P.y);
      if (d < pr && M.los(x, y, P.x, P.y, M.blocksBullet)) P.hurt(U.lerp(10, opts.hurtPlayer, 1 - d / pr));
    }
    if (any) FX.hit(kill, false);
    return any;
  };

  Wp.throwGrenade = function (p, tx, ty) {
    if (p.grenades <= 0) return false;
    p.grenades--;
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
    const d = U.clamp(U.dist(p.x, p.y, tx, ty), 130, 540);
    const sp = d * 2.3;
    let gx = p.x + ca * 16, gy = p.y + sa * 16;
    if (M.blocksGrenade(Math.floor(gx / C.TILE), Math.floor(gy / C.TILE))) {
      gx = p.x;
      gy = p.y;
    }
    Wp.grenades.push({ x: gx, y: gy, vx: ca * sp, vy: sa * sp, fuse: 1.6, spin: 0 });
    A.play('throw');
    return true;
  };

  Wp.update = function (dt) {
    const T = C.TILE;
    const Zs = GW.Zombies;

    // plasma bolts
    for (let i = Wp.projectiles.length - 1; i >= 0; i--) {
      const pr = Wp.projectiles[i];
      const speed = Math.hypot(pr.vx, pr.vy);
      const ux = pr.vx / speed, uy = pr.vy / speed;
      let remaining = speed * dt;
      let boom = false, direct = null;
      pr.life -= dt;
      while (remaining > 0 && !boom) {
        const step = Math.min(8, remaining);
        remaining -= step;
        const nx = pr.x + ux * step, ny = pr.y + uy * step;
        if (M.blocksBullet(Math.floor(nx / T), Math.floor(ny / T))) {
          boom = true;
          break;
        }
        pr.x = nx;
        pr.y = ny;
        for (const z of Zs.list) {
          if (z.dead) continue;
          const rr = z.r + 5;
          const ddx = z.x - pr.x, ddy = z.y - pr.y;
          if (ddx * ddx + ddy * ddy < rr * rr) {
            direct = z;
            boom = true;
            break;
          }
        }
      }
      pr.trail -= dt;
      if (pr.trail <= 0) {
        pr.trail = 0.016;
        FX.sparks(pr.x, pr.y, Math.atan2(-uy, -ux), 1, pr.color, 90, 0.5);
      }
      if (boom || pr.life <= 0) {
        Wp.projectiles.splice(i, 1);
        const s = pr.s;
        if (direct) {
          const killed = Zs.damage(direct, s.dmg, { dir: Math.atan2(uy, ux) });
          if (!killed) GW.Game.addPoints(C.POINTS.hit, direct.x, direct.y - direct.r, { small: true });
          FX.hit(killed, false);
        }
        Wp.explode(pr.x, pr.y, s.splashR, s.splash, s.splash * 0.4, { color: pr.color, skip: direct, sound: 'plasmaHit' });
      }
    }

    // grenades: slide, bounce, then detonate
    for (let i = Wp.grenades.length - 1; i >= 0; i--) {
      const g = Wp.grenades[i];
      const k = Math.exp(-2.2 * dt);
      g.vx *= k;
      g.vy *= k;
      g.spin += dt * 14;
      const sub = 3;
      for (let s = 0; s < sub; s++) {
        const nx = g.x + (g.vx * dt) / sub;
        if (M.blocksGrenade(Math.floor(nx / T), Math.floor(g.y / T))) {
          g.vx = -g.vx * 0.45;
          A.play('bounce', { x: g.x, y: g.y });
        } else g.x = nx;
        const ny = g.y + (g.vy * dt) / sub;
        if (M.blocksGrenade(Math.floor(g.x / T), Math.floor(ny / T))) {
          g.vy = -g.vy * 0.45;
          A.play('bounce', { x: g.x, y: g.y });
        } else g.y = ny;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        Wp.grenades.splice(i, 1);
        const dmg = Math.max(350, GW.Rounds.health(GW.Director.round || 1) * 0.9);
        Wp.explode(g.x, g.y, 165, dmg, dmg * 0.25, { color: '#ffb14d', hurtPlayer: 70 });
      }
    }
  };
})();
