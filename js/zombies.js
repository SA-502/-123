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
    Zs.acid = []; // spitter globs in flight
    Zs.hazards = []; // acid puddles on the ground
    Zs.bloaterFuse = false;
  };
  Zs.reset();

  /** How many of a type are alive (for per-type caps). */
  Zs.count = (type) => Zs.list.reduce((n, z) => n + (z.type === type ? 1 : 0), 0);

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
      hp, maxHp: hp, speed: U.rand(sp[0], sp[1]), speedClass, damage: GW.Rounds.damage(Math.max(1, GW.Director.round || 1)),
      state: 'rise', window: null, t: U.rand(0, 10), animRate: U.rand(5, 8),
      attackT: 0, attackCd: 0, stun: 0, flash: 0, kx: 0, ky: 0, tearT: 0, riseT: 0.9,
      farT: 0, stuckT: 0, lastX: spot.x, lastY: spot.y, groanT: U.rand(0.5, 6), dead: false,
      skin: U.pick(SKINS), shirt: U.pick(SHIRTS), eye: '#ffb629',
    };
    if (type === 'brute') {
      z.r = 20;
      z.hp = z.maxHp = hp * 6;
      z.speed = U.rand(80, 92);
      z.speedClass = 'run';
      z.damage = Math.round(z.damage * 1.6);
      z.skin = '#8f7a72';
      z.shirt = '#3b2230';
      z.eye = '#ff3b4e';
    } else if (type === 'helmet') {
      z.helmet = z.helmetMax = hp * ZC.helmetFrac;
      z.shirt = '#4a4f5a';
    } else if (type === 'spitter') {
      z.hp = z.maxHp = hp * 0.8;
      z.speed = U.rand(95, 110);
      z.speedClass = 'run';
      z.skin = '#86b052';
      z.shirt = '#2f4a22';
      z.eye = '#7dff5a';
      z.spitCd = U.rand(1.5, 3);
    } else if (type === 'bloater') {
      z.r = 17;
      z.hp = z.maxHp = hp * 1.6;
      z.speed = U.rand(58, 66);
      z.speedClass = 'walk';
      z.skin = '#a8955e';
      z.shirt = '#5a4a2a';
      z.eye = '#ffd426';
    } else if (type === 'leaper') {
      z.r = 12;
      z.hp = z.maxHp = hp * 0.7;
      z.speed = U.rand(135, 150);
      z.speedClass = 'sprint';
      z.skin = '#a77fa0';
      z.shirt = '#3a1f3a';
      z.eye = '#ff4fd8';
      z.leapCd = U.rand(1, 2.5);
    } else if (type === 'shrieker') {
      z.r = 11;
      z.hp = z.maxHp = Math.max(100, hp * 0.55);
      z.speed = U.rand(168, 186);
      z.speedClass = 'sprint';
      z.damage = Math.round(z.damage * 0.75);
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
    if (z.slowT > 0) z.slowT -= dt;

    // staggered death from a Purge power-up
    if (z.nukeT !== undefined) {
      z.nukeT -= dt;
      if (z.nukeT <= 0) {
        if (z.type === 'boss') {
          // the Purge only wounds a boss
          z.nukeT = undefined;
          Zs.damage(z, z.maxHp * 0.1, { nuke: true, dir: z.angle });
          if (z.dead) return;
        } else {
          Zs.kill(z, { silent: true, nuke: true, dir: Math.random() * U.TAU });
          return;
        }
      }
    }

    z.groanT -= dt;
    if (z.groanT <= 0) {
      z.groanT = U.rand(3, 8);
      const kind = z.type === 'walker' ? (z.speedClass === 'walk' ? 'walker' : z.speedClass === 'run' ? 'runner' : 'sprinter') : z.type;
      A.play('voice', { x: z.x, y: z.y, kind });
    }
    // burning from Inferno rounds: a share of max health every second
    if (z.burnT > 0) {
      z.burnT -= dt;
      z.burnTick -= dt;
      if (z.burnTick <= 0) {
        z.burnTick = 0.25;
        Zs.damage(z, z.burnDps * 0.25, { burn: true, dir: Math.random() * U.TAU });
        if (z.dead) return;
      }
    }
    if (z.spitCd > 0) z.spitCd -= dt;
    if (z.leapCd > 0) z.leapCd -= dt;
    if (z.type === 'boss') {
      GW.Boss.update(z, dt, P);
      return;
    }

    // frozen solid by a Cryo grenade, or dazed by a shockwave: no walking, tearing or swinging
    if (z.freezeT > 0 || z.dazeT > 0) {
      if (z.freezeT > 0) z.freezeT -= dt;
      if (z.dazeT > 0) z.dazeT -= dt;
      if (z.state === 'chase') knockback(z, dt);
      return;
    }

    const dxp = P.x - z.x, dyp = P.y - z.y;
    const dp = Math.hypot(dxp, dyp);
    const Gd = GW.Gadgets;

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
          z.tearT = C.ZOMBIE.plankTearTime * (z.type === 'brute' ? 0.5 : z.crawl ? C.ZOMBIE.crawl.tearMult : 1);
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

    if (z.state === 'spit') {
      z.angle += U.angDiff(z.angle, Math.atan2(dyp, dxp)) * Math.min(1, dt * 10);
      z.attackT -= dt;
      if (z.attackT <= 0) {
        spitAt(z, P);
        z.state = 'chase';
        z.spitCd = U.rand(C.ZOMBIE.spit.cd[0], C.ZOMBIE.spit.cd[1]);
      }
      return;
    }
    if (z.state === 'crouch') {
      z.angle = Math.atan2(dyp, dxp);
      z.attackT -= dt;
      if (z.attackT <= 0) {
        const L = C.ZOMBIE.leap;
        z.state = 'leap';
        z.leapLeft = L.range;
        z.leapDx = Math.cos(z.angle);
        z.leapDy = Math.sin(z.angle);
        z.leapHit = false;
        A.play('leap', { x: z.x, y: z.y });
      }
      return;
    }
    if (z.state === 'leap') {
      const L = C.ZOMBIE.leap;
      const step = Math.min(z.leapLeft, L.speed * dt);
      const ox = z.x, oy = z.y;
      M.moveCircle(z, z.leapDx * step, z.leapDy * step, M.solidForZombie);
      const moved = Math.hypot(z.x - ox, z.y - oy);
      z.leapLeft -= step;
      if (Math.random() < 0.6) FX.sparks(z.x, z.y, Math.atan2(-z.leapDy, -z.leapDx), 1, '#ff4fd8', 90, 0.4);
      if (!z.leapHit && P.alive && Math.hypot(P.x - z.x, P.y - z.y) < z.r + P.r + 6 && !Gd.shielded(P)) {
        z.leapHit = true;
        P.hurt(L.dmg, true);
        P.vx += z.leapDx * 420;
        P.vy += z.leapDy * 420;
        A.play('bite', { x: z.x, y: z.y });
        z.leapLeft = 0;
      }
      if (z.leapLeft <= 0 || moved < step * 0.5) {
        z.state = 'chase';
        z.dazeT = L.recover;
        z.leapCd = U.rand(L.cd[0], L.cd[1]);
      }
      return;
    }
    if (z.state === 'swell') {
      z.attackT -= dt;
      z.angle += U.angDiff(z.angle, Math.atan2(dyp, dxp)) * Math.min(1, dt * 6);
      if (z.attackT <= 0) Zs.kill(z, { silent: true, burst: true, dir: z.angle });
      return;
    }

    if (z.state === 'attack') {
      z.angle += U.angDiff(z.angle, Math.atan2(dyp, dxp)) * Math.min(1, dt * 12);
      z.attackT -= dt;
      if (z.attackT <= 0) {
        if (P.alive && dp < z.r + P.r + 24 && !Gd.shielded(P)) {
          A.play('zattack', { x: z.x, y: z.y });
          A.play('bite', { x: z.x, y: z.y });
          P.hurt(z.damage, true);
        }
        z.state = 'chase';
        z.attackCd = C.ZOMBIE.attackCooldown;
      }
      knockback(z, dt);
      return;
    }

    // ---- chase: the player, or a Neon Lure that is close enough to pull this one in ----
    let gx = P.x, gy = P.y, field = M.flow, toPlayer = true;
    const lure = Gd.activeLure();
    if (lure && (U.dist(z.x, z.y, lure.x, lure.y) < C.LURE.pull || M.flowAt(z.x, z.y, M.flowLure) < C.LURE.pullFlow)) {
      gx = lure.gx;
      gy = lure.gy;
      field = M.flowLure;
      toPlayer = false;
    }
    const dg = toPlayer ? dp : Math.hypot(gx - z.x, gy - z.y);
    let tx = gx, ty = gy;
    const direct = dg < 440 && M.los(z.x, z.y, gx, gy, M.solidForZombie);
    let retreat = false;
    if (toPlayer && P.alive && !Gd.shielded(P)) {
      const ZC = C.ZOMBIE;
      if (z.type === 'bloater' && dp < z.r + P.r + ZC.bloat.trigger) {
        z.state = 'swell';
        z.attackT = ZC.bloat.swell;
        A.play('swell', { x: z.x, y: z.y });
        return;
      }
      if (z.type === 'spitter' && dp < ZC.spit.max && M.los(z.x, z.y, P.x, P.y, M.blocksBullet)) {
        if (z.spitCd <= 0 && dp > ZC.spit.min * 0.8) {
          z.state = 'spit';
          z.attackT = ZC.spit.windup;
          A.play('voice', { x: z.x, y: z.y, kind: 'spitter' });
          return;
        }
        if (dp < ZC.spit.min) retreat = true; // keep its distance
        else if (dp < ZC.spit.max * 0.85) tx = z.x, ty = z.y; // hold position and wait for the next glob
      }
      if (z.type === 'leaper' && z.leapCd <= 0 && dp > ZC.leap.min && dp < ZC.leap.max && M.los(z.x, z.y, P.x, P.y, M.solidForZombie)) {
        z.state = 'crouch';
        z.attackT = ZC.leap.crouch;
        A.play('leapWarn', { x: z.x, y: z.y });
        return;
      }
    }
    if (retreat) {
      tx = z.x - dxp;
      ty = z.y - dyp;
    }
    if (!direct && M.flowTarget(z.x, z.y, tgt, field)) {
      tx = tgt.x;
      ty = tgt.y;
    }
    const mdx = tx - z.x, mdy = ty - z.y;
    const md = Math.hypot(mdx, mdy) || 1;
    z.angle += U.angDiff(z.angle, Math.atan2(mdy, mdx)) * Math.min(1, dt * 10);

    const reach = z.r + P.r + 4;
    let step = z.speed * (z.stun > 0 ? 0.35 : 1) * (z.slowT > 0 ? C.CRYO.slowMult : 1) * dt;
    if (retreat) step *= 0.7;
    else if (direct) step = Math.min(step, Math.max(0, dg - (toPlayer ? reach : z.r + 6))); // never shove into the target
    M.moveCircle(z, (mdx / md) * step + z.kx * dt, (mdy / md) * step + z.ky * dt, M.solidForZombie);
    if (z.kx || z.ky) {
      const k = Math.exp(-8 * dt);
      z.kx *= k;
      z.ky *= k;
      if (Math.abs(z.kx) + Math.abs(z.ky) < 2) z.kx = z.ky = 0;
    }

    if (P.alive && dp < reach + 8 && z.attackCd <= 0 && !Gd.shielded(P) && z.type !== 'bloater') {
      z.state = 'attack';
      z.attackT = z.crawl ? C.ZOMBIE.crawl.windup : C.ZOMBIE.attackWindup;
    }

    // stragglers: too far along the path, unreachable, or wedged somewhere -> respawn nearer
    // (not while lured or while the panic room is sealed: waiting at the shutter is the point)
    const holding = !toPlayer || GW.Facilities.sealed();
    const far = !holding && M.flowAt(z.x, z.y) > 380;
    z.farT = far ? z.farT + dt : 0;
    if (U.dist(z.x, z.y, z.lastX, z.lastY) > 18) {
      z.lastX = z.x;
      z.lastY = z.y;
      z.stuckT = 0;
    } else if (dp > 130 && !holding) z.stuckT += dt;
    else z.stuckT = 0;
    if (z.farT > 6 || z.stuckT > 6) relocate(z);
  }

  /** Spitter lobs a glob at where the player is heading. */
  function spitAt(z, P) {
    const S = C.ZOMBIE.spit;
    let tx = P.x + P.vx * S.flight * 0.6, ty = P.y + P.vy * S.flight * 0.6;
    if (!M.los(P.x, P.y, tx, ty, M.solidForPlayer)) {
      tx = P.x;
      ty = P.y;
    }
    Zs.acid.push({ sx: z.x, sy: z.y, tx, ty, t: 0, dur: S.flight });
    A.play('spit', { x: z.x, y: z.y });
  }

  function updateAcid(dt, P) {
    const S = C.ZOMBIE.spit;
    for (let i = Zs.acid.length - 1; i >= 0; i--) {
      const a = Zs.acid[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.x = U.lerp(a.sx, a.tx, k);
      a.y = U.lerp(a.sy, a.ty, k);
      a.h = Math.sin(k * Math.PI) * 70;
      if (k >= 1) {
        Zs.acid.splice(i, 1);
        if (Zs.hazards.length > 12) Zs.hazards.shift();
        Zs.hazards.push({ x: a.tx, y: a.ty, r: S.puddleR, t: S.puddleLife, max: S.puddleLife });
        FX.burst(a.tx, a.ty, 14, '#7dff5a', 200);
        GW.MapArt.decal(a.tx, a.ty, S.puddleR * 0.6, '#1f3a10', 0.4);
        A.play('acidSplash', { x: a.tx, y: a.ty });
      }
    }
    let inAcid = false;
    for (let i = Zs.hazards.length - 1; i >= 0; i--) {
      const h = Zs.hazards[i];
      h.t -= dt;
      if (h.t <= 0) {
        Zs.hazards.splice(i, 1);
        continue;
      }
      if (P.alive && U.dist(P.x, P.y, h.x, h.y) < h.r + P.r * 0.4) inAcid = true;
    }
    if (inAcid) {
      Zs.acidT = (Zs.acidT || 0) - dt;
      if (Zs.acidT <= 0) {
        Zs.acidT = S.puddleTick;
        P.hurt(S.puddleDmg);
        A.play('acidSizzle', { x: P.x, y: P.y });
      }
    } else Zs.acidT = 0;
  }

  /** Bloater detonation: hurts the player and the horde (no points for the zombies it kills). */
  function bloaterFx(z, radius) {
    FX.explosion(z.x, z.y, radius, '#c8ff3a');
    FX.blood(z.x, z.y, 0, 30, 380);
    GW.MapArt.decal(z.x, z.y, radius * 0.5, '#3a3a10', 0.5);
    A.play('bloaterPop', { x: z.x, y: z.y });
  }

  function bloaterBlast(z, radius, dmg) {
    const B = C.ZOMBIE.bloat;
    bloaterFx(z, radius);
    const players = GW.Net && GW.Net.isHost ? GW.Net.players() : [GW.Player];
    for (const P of players) {
      if (!P.alive) continue;
      const d = U.dist(P.x, P.y, z.x, z.y);
      if (d < radius && M.los(z.x, z.y, P.x, P.y, M.blocksBullet)) P.hurt(U.lerp(dmg * 0.4, dmg, 1 - d / radius));
    }
    for (const o of Zs.list.slice()) {
      if (o === z || o.dead || o.type === 'boss') continue;
      const od = U.dist(o.x, o.y, z.x, z.y);
      if (od > radius || !M.los(z.x, z.y, o.x, o.y, M.blocksBullet)) continue;
      Zs.damage(o, o.maxHp * B.zombieFrac * (1 - od / radius), { silent: true, explosive: true, dir: Math.atan2(o.y - z.y, o.x - z.x) });
    }
  }

  Zs.update = function (dt) {
    const P = GW.Player;
    updateAcid(dt, P);
    const list = Zs.list;
    // co-op host: every zombie hunts the nearest living player
    const team = GW.Net && GW.Net.isHost && GW.Net.remotes.size ? GW.Net.players() : null;
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];
      if (z && !z.dead) updateOne(z, dt, team ? GW.Net.targetFor(z, team) : P);
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
      if (z.state === 'breach') continue;
      if (z.state !== 'rise') GW.Gadgets.pushOut(z);
      M.resolveCircle(z, z.r, M.solidForZombie);
      // wedged between a bubble and a wall: the dome spits it back out to a spawn point
      if (z.state !== 'rise' && GW.Gadgets.insideBubble(z.x, z.y, z.r - 1)) {
        FX.burst(z.x, z.y, 10, '#3dff8b', 220);
        relocate(z);
      }
    }
  };

  /**
   * Apply damage. info: { crit, melee, explosive, shock, dir, silent }
   * Returns true if this killed the zombie.
   */
  Zs.damage = function (z, amount, info) {
    if (GW.Net && GW.Net.isGuest) return GW.Net.guestDamage(z, amount, info); // the host owns the horde
    if (z.dead) return false;
    info = info || {};
    if (z.type === 'boss') amount = GW.Boss.adjustDamage(z, amount, info);
    const hp0 = z.hp;
    // helmets soak headshots: the crit bonus is lost until the helmet breaks
    if (z.helmet > 0 && info.crit && !info.explosive && !info.melee) {
      const base = amount / (info.critMult || 1);
      Zs.payShare(z, Math.min(base, z.helmet), info, false);
      z.helmet -= base;
      z.flash = 0.08;
      FX.sparks(z.x, z.y, (info.dir || 0) + Math.PI, 3, '#d8dce4', 220);
      A.play('hit', { x: z.x, y: z.y });
      if (z.helmet > 0) return false;
      amount = -z.helmet;
      z.helmet = 0;
      FX.burst(z.x, z.y, 12, '#c8ccd6', 260);
      A.play('helmetBreak', { x: z.x, y: z.y });
      info = Object.assign({}, info, { crit: false });
    }
    if (GW.Game.timers.instakill > 0 && z.type !== 'boss') amount = Math.max(amount, z.hp);
    z.hp -= amount;
    z.flash = 0.1;
    if (z.type !== 'brute' && z.type !== 'boss' && !info.burn) z.stun = Math.max(z.stun, 0.12);
    const dir = info.dir === undefined ? Math.random() * U.TAU : info.dir;
    FX.blood(z.x, z.y, dir, info.crit ? 9 : 4, info.crit ? 320 : 220);
    A.play('hit', { x: z.x, y: z.y });
    if (!info.explosive && !info.burn && z.type !== 'brute' && z.type !== 'boss' && z.state === 'chase') {
      z.kx += Math.cos(dir) * 45;
      z.ky += Math.sin(dir) * 45;
    }
    if (z.hp <= 0) {
      z.payRest = Zs.payShare(z, hp0, info, true);
      Zs.kill(z, info);
      return true;
    }
    Zs.payShare(z, amount, info, false);
    if (!z.crawl && CRAWLERS[z.type] && z.state !== 'rise' && !info.nuke) {
      const CR = C.ZOMBIE.crawl;
      const crossed = hp0 >= z.maxHp * CR.hpFrac && z.hp < z.maxHp * CR.hpFrac;
      const blown = info.explosive && z.hp < z.maxHp * 0.6;
      if ((crossed && Math.random() < CR.chance) || (blown && Math.random() < CR.blastChance)) Zs.makeCrawler(z, dir);
    }
    return false;
  };

  /** Types that can lose their legs (never brutes, bosses, bloaters, spitters or leapers). */
  const CRAWLERS = { walker: true, helmet: true, shrieker: true };

  /** Legs gone: it drops and drags itself along, slower, with a weaker, slower bite. */
  Zs.makeCrawler = function (z, dir) {
    const CR = C.ZOMBIE.crawl;
    if (Zs.list.reduce((n, o) => n + (o.crawl ? 1 : 0), 0) >= 6) return; // never a carpet of crawlers
    z.crawl = true;
    z.speed = U.clamp(z.speed * CR.speedMult, CR.minSpeed, CR.maxSpeed);
    z.damage = Math.round(z.damage * CR.dmgMult);
    z.stun = Math.max(z.stun, 0.5);
    z.animRate *= 0.6;
    if (z.state === 'attack') {
      z.state = 'chase';
      z.attackCd = Math.max(z.attackCd, 0.6);
    }
    FX.blood(z.x, z.y, dir === undefined ? Math.random() * U.TAU : dir, 16, 260);
    FX.blood(z.x, z.y, (dir || 0) + Math.PI, 8, 180);
    GW.MapArt.decal(z.x, z.y, z.r * 1.1, '#5c0a16', 0.45);
  };

  /**
   * Hit points by damage share. Each zombie holds a small pool of points (CFG.POINTS.pool) that is
   * paid out 10 at a time as the local player's damage chips its health away; whatever is left of
   * this player's share rides on the kill bonus (returned when `killed`). A minigun and a sniper
   * earn the same from the same zombie. Only the local player is paid here: the co-op server has no
   * player of its own, and guests pay themselves (Net.guestDamage).
   */
  Zs.payShare = function (z, dealt, info, killed) {
    if (GW.Net && GW.Net.serverMode) return 0;
    if (info.ally || info.trap || info.silent || info.nuke || info.by) return 0;
    const Pt = C.POINTS;
    const pool = z.type === 'boss' ? Pt.poolBoss : z.type === 'brute' ? Pt.poolBrute : Pt.pool;
    const whole = (z.maxHp || 1) + (z.helmetMax || 0);
    z.payAcc = (z.payAcc || 0) + pool * U.clamp((dealt || 0) / whole, 0, 1);
    if (killed) {
      const rest = Math.round(z.payAcc / 5) * 5;
      z.payAcc = 0;
      return rest;
    }
    while (z.payAcc >= Pt.hit) {
      z.payAcc -= Pt.hit;
      GW.Game.addPoints(Pt.hit, z.x, z.y - z.r, { small: true });
    }
    return 0;
  };

  Zs.kill = function (z, info) {
    if (GW.Net && GW.Net.isGuest) return GW.Net.guestKill(z, info);
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

    if (z.type === 'bloater') {
      const B = C.ZOMBIE.bloat;
      bloaterBlast(z, info.burst ? B.radius : B.deathRadius, info.burst ? B.dmg : B.deathDmg);
      if (!Zs.bloaterFuse && pos) {
        Zs.bloaterFuse = true;
        GW.Interact.dropFuse(pos.x, pos.y);
      }
    }
    if (z.type === 'boss') GW.Boss.onDeath(z, pos);

    const P = GW.Player, Pt = C.POINTS;
    // the knife pays best, a headshot kill next; blades pay a normal kill
    let pts = info.knife ? Pt.melee : info.crit ? Pt.crit : Pt.kill;
    if (z.type === 'brute') pts = Pt.brute;
    else if (z.type === 'boss') pts = Pt.boss;
    else if (info.trap) pts = Pt.trap;
    else if (info.ally) pts = Pt.ally;
    pts += z.payRest || 0; // the rest of the killer's hit-point share
    z.payRest = 0;
    const by = info.by || (GW.Net && GW.Net.serverMode ? z.lastBy : 0);
    if (by && GW.Net && GW.Net.active) {
      // a teammate's shot: the points and the kill are theirs
      if (!info.silent) GW.Net.creditKill(by, pts, z, info.crit);
    } else {
      if (!info.silent) GW.Game.addPoints(pts, z.x, z.y - z.r - 4, { crit: info.crit });
      P.stats.kills++;
      if (info.crit) P.stats.crits++;
    }
    if (GW.Net && GW.Net.active) GW.Net.onZombieKilled(z, info);

    Zs.deathFx(z, info, true);
    GW.Director.onKill(z, info, pos);
  };

  /** The visible part of a death (also used by co-op guests when the host reports a kill). */
  Zs.deathFx = function (z, info, host) {
    info = info || {};
    if (!host && z.type === 'bloater') {
      const B = C.ZOMBIE.bloat;
      bloaterFx(z, info.burst ? B.radius : B.deathRadius);
    }
    const dir = info.dir === undefined ? Math.random() * U.TAU : info.dir;
    FX.corpse(z);
    FX.blood(z.x, z.y, dir, info.crit ? 22 : 12, 300);
    GW.MapArt.decal(z.x, z.y, z.r * 1.5, '#5c0a16', 0.5);
    if (info.crit) FX.burst(z.x, z.y, 6, '#ffffff', 200);
    if (info.shock) FX.burst(z.x, z.y, 10, '#8fd8ff', 260);
    if (info.nuke) FX.burst(z.x, z.y, 12, '#ff7a1a', 300);
    A.play('zdeath', { x: z.x, y: z.y });
  };
})();
