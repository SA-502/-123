/* GRAVEWAVE — the undead: spawning, barricade breaching, flow-field pursuit, attacks, damage and death */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio, T = C.TILE;
  const Zs = (GW.Zombies = { list: [], nextId: 1 });
  const tgt = { x: 0, y: 0 };

  const SKINS = ['#7d9a6b', '#8aa57a', '#6f8f6a', '#93a080', '#7a8c7a'];
  const SHIRTS = ['#b0457a', '#3f7fa8', '#c9a23a', '#5a4a8a', '#8a3a3a', '#3a8a6a', '#a85a2a', '#6a6a78'];

  Zs.reset = function () {
    Zs.list = [];
    Zs.nextId = 1;
  };

  /**
   * Spawn a zombie.
   * spot: { kind: 'window' | 'riser' | 'point', x, y, ref }
   * type: 'walker' (speed set by speedClass) | 'shrieker' | 'brute'
   */
  Zs.spawn = function (type, spot, hp, speedClass) {
    const ZC = C.ZOMBIE;
    const sp = ZC.speeds[speedClass] || ZC.speeds.walk;
    const z = {
      id: Zs.nextId++, type, x: spot.x, y: spot.y, r: ZC.radius, angle: Math.random() * U.TAU,
      hp, maxHp: hp, speed: U.rand(sp[0], sp[1]), speedClass, damage: ZC.damage,
      state: 'rise', window: null, t: U.rand(0, 10), animRate: U.rand(5, 8),
      attackT: 0, attackCd: 0, stun: 0, flash: 0, kx: 0, ky: 0, tearT: 0, riseT: 0.9,
      farT: 0, stuckT: 0, lastX: spot.x, lastY: spot.y, groanT: U.rand(0.5, 6), dead: false,
      skin: U.pick(SKINS), shirt: U.pick(SHIRTS), eye: '#ffb629',
    };
    if (type === 'brute') {
      z.r = 20;
      z.hp = z.maxHp = hp * 6;
      z.speed = U.rand(86, 98);
      z.speedClass = 'run';
      z.damage = 80;
      z.skin = '#8f7a72';
      z.shirt = '#3b2230';
      z.eye = '#ff3b4e';
    } else if (type === 'shrieker') {
      z.r = 11;
      z.hp = z.maxHp = Math.max(100, hp * 0.55);
      z.speed = U.rand(205, 228);
      z.speedClass = 'sprint';
      z.damage = 35;
      z.skin = '#a6d3da';
      z.shirt = '#1c3b46';
      z.eye = '#35f0ff';
    }
    placeAt(z, spot);
    Zs.list.push(z);
    return z;
  };

  function placeAt(z, spot) {
    z.x = spot.x;
    z.y = spot.y;
    z.kx = z.ky = 0;
    z.farT = z.stuckT = 0;
    z.lastX = z.x;
    z.lastY = z.y;
    if (spot.kind === 'window') {
      const w = spot.ref;
      z.state = 'breach';
      z.window = w;
      w.busy = z;
      z.tearT = C.ZOMBIE.plankTearTime;
      z.angle = Math.atan2(w.dy, w.dx);
    } else {
      z.state = 'rise';
      z.riseT = 0.9;
      if (spot.ref) spot.ref.cool = 2;
      A.play('rise', { x: z.x, y: z.y });
      FX.burst(z.x, z.y, 8, '#5a4a3a', 120);
    }
  }

  /** Move a straggler to a spawn nearer the player (keeps its health). */
  function relocate(z) {
    const spot = GW.Director.pickSpawn();
    if (!spot) return;
    if (z.window) {
      z.window.busy = null;
      z.window = null;
    }
    placeAt(z, spot);
  }

  function knockback(z, dt) {
    if (z.kx || z.ky) {
      M.moveCircle(z, z.kx * dt, z.ky * dt, M.solidForZombie);
      const k = Math.exp(-8 * dt);
      z.kx *= k;
      z.ky *= k;
      if (Math.abs(z.kx) + Math.abs(z.ky) < 2) z.kx = z.ky = 0;
    }
  }

  function updateOne(z, dt, P) {
    z.t += dt;
    if (z.flash > 0) z.flash -= dt;
    if (z.stun > 0) z.stun -= dt;
    if (z.attackCd > 0) z.attackCd -= dt;

    // staggered death from a Purge power-up
    if (z.nukeT !== undefined) {
      z.nukeT -= dt;
      if (z.nukeT <= 0) {
        Zs.kill(z, { silent: true, nuke: true, dir: Math.random() * U.TAU });
        return;
      }
    }

    z.groanT -= dt;
    if (z.groanT <= 0) {
      z.groanT = U.rand(3, 8);
      if (z.type === 'shrieker') A.play('shriek', { x: z.x, y: z.y });
      else A.play('groan', { x: z.x, y: z.y, pitch: z.type === 'brute' ? 0.62 : z.speedClass === 'sprint' ? 1.35 : 1 });
    }

    const dxp = P.x - z.x, dyp = P.y - z.y;
    const dp = Math.hypot(dxp, dyp);

    if (z.state === 'rise') {
      z.riseT -= dt;
      z.angle = Math.atan2(dyp, dxp);
      if (z.riseT <= 0) z.state = 'chase';
      return;
    }

    if (z.state === 'breach') {
      const w = z.window;
      if (w.planks > 0) {
        z.tearT -= dt;
        if (z.tearT <= 0) {
          w.planks--;
          z.tearT = C.ZOMBIE.plankTearTime * (z.type === 'brute' ? 0.5 : 1);
          A.play('plank', { x: w.x, y: w.y });
          FX.sparks(w.x + w.dx * 22, w.y + w.dy * 22, Math.atan2(w.dy, w.dx), 6, '#b08a4a', 170);
        }
      } else {
        w.busy = null;
        z.window = null;
        z.state = 'chase';
      }
      return;
    }

    if (z.state === 'attack') {
      z.angle += U.angDiff(z.angle, Math.atan2(dyp, dxp)) * Math.min(1, dt * 12);
      z.attackT -= dt;
      if (z.attackT <= 0) {
        if (P.alive && dp < z.r + P.r + 24) {
          A.play('zattack', { x: z.x, y: z.y });
          P.hurt(z.damage, z.x, z.y);
        }
        z.state = 'chase';
        z.attackCd = C.ZOMBIE.attackCooldown;
      }
      knockback(z, dt);
      return;
    }

    // ---- chase ----
    let tx = P.x, ty = P.y;
    const direct = dp < 440 && M.los(z.x, z.y, P.x, P.y, M.solidForZombie);
    if (!direct && M.flowTarget(z.x, z.y, tgt)) {
      tx = tgt.x;
      ty = tgt.y;
    }
    const mdx = tx - z.x, mdy = ty - z.y;
    const md = Math.hypot(mdx, mdy) || 1;
    z.angle += U.angDiff(z.angle, Math.atan2(mdy, mdx)) * Math.min(1, dt * 10);

    const reach = z.r + P.r + 4;
    let step = z.speed * (z.stun > 0 ? 0.35 : 1) * dt;
    if (direct) step = Math.min(step, Math.max(0, dp - reach)); // never shove into the player
    M.moveCircle(z, (mdx / md) * step + z.kx * dt, (mdy / md) * step + z.ky * dt, M.solidForZombie);
    if (z.kx || z.ky) {
      const k = Math.exp(-8 * dt);
      z.kx *= k;
      z.ky *= k;
      if (Math.abs(z.kx) + Math.abs(z.ky) < 2) z.kx = z.ky = 0;
    }

    if (P.alive && dp < reach + 8 && z.attackCd <= 0) {
      z.state = 'attack';
      z.attackT = C.ZOMBIE.attackWindup;
    }

    // stragglers: too far along the path, unreachable, or wedged somewhere -> respawn nearer
    const far = M.flowAt(z.x, z.y) > 380;
    z.farT = far ? z.farT + dt : 0;
    if (U.dist(z.x, z.y, z.lastX, z.lastY) > 18) {
      z.lastX = z.x;
      z.lastY = z.y;
      z.stuckT = 0;
    } else if (dp > 130) z.stuckT += dt;
    else z.stuckT = 0;
    if (z.farT > 6 || z.stuckT > 6) relocate(z);
  }

  Zs.update = function (dt) {
    const P = GW.Player;
    const list = Zs.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];
      if (z && !z.dead) updateOne(z, dt, P);
    }

    // soft separation so the horde spreads out instead of stacking
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const aFixed = a.state === 'breach' || a.state === 'rise';
        const bFixed = b.state === 'breach' || b.state === 'rise';
        if (aFixed && bFixed) continue;
        let d = Math.sqrt(d2), ux, uy;
        if (d < 0.01) {
          const ang = Math.random() * U.TAU;
          ux = Math.cos(ang);
          uy = Math.sin(ang);
          d = 0;
        } else {
          ux = dx / d;
          uy = dy / d;
        }
        const push = (min - d) * 0.5;
        const wa = aFixed ? 0 : bFixed ? 1 : b.r / (a.r + b.r);
        const wb = bFixed ? 0 : aFixed ? 1 : a.r / (a.r + b.r);
        a.x -= ux * push * wa * 2 * 0.5;
        a.y -= uy * push * wa * 2 * 0.5;
        b.x += ux * push * wb * 2 * 0.5;
        b.y += uy * push * wb * 2 * 0.5;
      }
    }
    for (let i = 0; i < n; i++) {
      const z = list[i];
      if (z.state !== 'breach') M.resolveCircle(z, z.r, M.solidForZombie);
    }
  };

  /**
   * Apply damage. info: { crit, melee, explosive, shock, dir, silent }
   * Returns true if this killed the zombie.
   */
  Zs.damage = function (z, amount, info) {
    if (z.dead) return false;
    info = info || {};
    if (GW.Game.timers.instakill > 0) amount = Math.max(amount, z.hp);
    z.hp -= amount;
    z.flash = 0.1;
    if (z.type !== 'brute') z.stun = Math.max(z.stun, 0.12);
    const dir = info.dir === undefined ? Math.random() * U.TAU : info.dir;
    FX.blood(z.x, z.y, dir, info.crit ? 9 : 4, info.crit ? 320 : 220);
    A.play('hit', { x: z.x, y: z.y });
    if (!info.explosive && z.type !== 'brute' && z.state === 'chase') {
      z.kx += Math.cos(dir) * 45;
      z.ky += Math.sin(dir) * 45;
    }
    if (z.hp <= 0) {
      Zs.kill(z, info);
      return true;
    }
    return false;
  };

  Zs.kill = function (z, info) {
    if (z.dead) return;
    info = info || {};
    z.dead = true;
    const i = Zs.list.indexOf(z);
    if (i >= 0) Zs.list.splice(i, 1);

    // where a power-up may drop: only on reachable floor
    let pos = null;
    if (M.tileAt(z.x, z.y) === M.TT.FLOOR) pos = { x: z.x, y: z.y };
    else if (z.window) pos = { x: (z.window.ix + 0.5) * T, y: (z.window.iy + 0.5) * T };
    if (z.window) {
      z.window.busy = null;
      z.window = null;
    }

    const P = GW.Player, Pt = C.POINTS;
    let pts = info.melee ? Pt.melee : info.crit ? Pt.crit : Pt.kill;
    if (z.type === 'brute') pts = Pt.brute;
    if (!info.silent) GW.Game.addPoints(pts, z.x, z.y - z.r - 4, { crit: info.crit });
    P.stats.kills++;
    if (info.crit) P.stats.crits++;

    const dir = info.dir === undefined ? Math.random() * U.TAU : info.dir;
    FX.corpse(z);
    FX.blood(z.x, z.y, dir, info.crit ? 22 : 12, 300);
    GW.MapArt.decal(z.x, z.y, z.r * 1.5, '#5c0a16', 0.5);
    if (info.crit) FX.burst(z.x, z.y, 6, '#ffffff', 200);
    if (info.shock) FX.burst(z.x, z.y, 10, '#8fd8ff', 260);
    if (info.nuke) FX.burst(z.x, z.y, 12, '#ff7a1a', 300);
    A.play('zdeath', { x: z.x, y: z.y });
    GW.Director.onKill(z, info, pos);
  };
})();
