/* GRAVEWAVE — temporary allies: the Pixel Pal companion robot and the deployable Hover Sentry */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio, T = C.TILE;
  const AL = (GW.Allies = { pal: null, sentry: null });
  const tgt = { x: 0, y: 0 };

  AL.reset = function () {
    AL.pal = null;
    AL.sentry = null;
  };

  /** Shared gun stats for allies, scaled by round so they stay useful late. */
  function gunStats(cfg, color) {
    const r = GW.Director.round || 1;
    return { dmg: cfg.dmgBase + cfg.dmgRound * r, range: cfg.range, pierce: 1, pellets: 1, crit: 1, color };
  }

  /** Nearest zombie in range with a clear shot. */
  function acquire(x, y, range) {
    let best = null, bd = range;
    for (const z of GW.Zombies.list) {
      if (z.dead || z.state === 'rise') continue;
      const d = U.dist(x, y, z.x, z.y);
      if (d < bd && M.los(x, y, z.x, z.y, M.blocksBullet)) {
        bd = d;
        best = z;
      }
    }
    return best;
  }

  /** Find open floor next to the player for the Pal to (re)appear on. */
  function spotNearPlayer(P) {
    for (let i = 0; i < 16; i++) {
      const a = P.angle + Math.PI + (i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * 0.45;
      const x = P.x + Math.cos(a) * 46, y = P.y + Math.sin(a) * 46;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (M.tile(tx, ty) !== M.TT.FLOOR || !M.los(P.x, P.y, x, y, M.solidForPlayer)) continue;
      const probe = { x, y, r: 11 };
      M.resolveCircle(probe, probe.r, M.solidForPlayer);
      if (M.tileAt(probe.x, probe.y) === M.TT.FLOOR) return probe;
    }
    return { x: P.x, y: P.y };
  }

  /* ---------------- Pixel Pal ---------------- */
  AL.summonPal = function (duration) {
    const P = GW.Player;
    const s = spotNearPlayer(P);
    if (AL.pal) {
      AL.pal.t = Math.max(AL.pal.t, duration);
      AL.pal.max = Math.max(AL.pal.max, duration);
    } else {
      AL.pal = { x: s.x, y: s.y, r: 11, angle: P.angle, t: duration, max: duration, cd: 0, target: null, scanT: 0, lostT: 0, anim: 0, muzzleT: 0, kills: 0 };
    }
    A.play('pal', { x: s.x, y: s.y });
    FX.ring(s.x, s.y, 60, '#b77dff', 0.45, 4);
    FX.burst(s.x, s.y, 18, '#b77dff', 260);
    FX.light(s.x, s.y, 200, '#b77dff', 0.4);
  };

  function dismissPal() {
    const p = AL.pal;
    if (!p) return;
    FX.burst(p.x, p.y, 16, '#b77dff', 240);
    FX.ring(p.x, p.y, 50, '#b77dff', 0.4, 3);
    A.play('palBye', { x: p.x, y: p.y });
    AL.pal = null;
  }

  function warpPal(p, P) {
    FX.burst(p.x, p.y, 10, '#b77dff', 200);
    const s = spotNearPlayer(P);
    p.x = s.x;
    p.y = s.y;
    p.lostT = 0;
    FX.ring(p.x, p.y, 40, '#b77dff', 0.3, 3);
  }

  function updatePal(dt, P) {
    const p = AL.pal;
    p.t -= dt;
    p.anim += dt;
    if (p.muzzleT > 0) p.muzzleT -= dt;
    if (p.t <= 0 || !P.alive) {
      dismissPal();
      return;
    }

    // follow: hover behind the player's shoulder
    const side = Math.sin(p.anim * 0.7) > 0 ? 1 : -1;
    const fa = P.angle + Math.PI + side * 0.8;
    const gx = P.x + Math.cos(fa) * 58, gy = P.y + Math.sin(fa) * 58;
    const dP = U.dist(p.x, p.y, P.x, P.y);
    const seesPlayer = M.los(p.x, p.y, P.x, P.y, M.solidForPlayer);
    p.lostT = seesPlayer ? 0 : p.lostT + dt;
    if (dP > 650 || p.lostT > 2.5) warpPal(p, P);

    let tx = gx, ty = gy;
    if (!M.los(p.x, p.y, gx, gy, M.solidForPlayer)) {
      if (seesPlayer) {
        tx = P.x;
        ty = P.y;
      } else if (M.flowTarget(p.x, p.y, tgt)) {
        tx = tgt.x;
        ty = tgt.y;
      }
    }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 8) {
      const sp = Math.min(C.PAL.speed * (dP > 200 ? 1.4 : 1) * dt, d);
      M.moveCircle(p, (dx / d) * sp, (dy / d) * sp, M.solidForPlayer);
    }
    // never sit on top of the player
    const ox = p.x - P.x, oy = p.y - P.y, od = Math.hypot(ox, oy), min = p.r + P.r + 2;
    if (od < min && od > 0.01) {
      p.x = P.x + (ox / od) * min;
      p.y = P.y + (oy / od) * min;
      M.resolveCircle(p, p.r, M.solidForPlayer);
    }

    // shoot
    p.scanT -= dt;
    if (p.scanT <= 0 || (p.target && p.target.dead)) {
      p.scanT = 0.15;
      p.target = acquire(p.x, p.y, C.PAL.range);
    }
    const z = p.target;
    if (z && !z.dead) {
      const want = Math.atan2(z.y - p.y, z.x - p.x);
      p.angle += U.angDiff(p.angle, want) * Math.min(1, dt * 14);
      p.cd -= dt;
      if (p.cd <= 0 && Math.abs(U.angDiff(p.angle, want)) < 0.25) {
        p.cd = 60 / C.PAL.rpm;
        const s = gunStats(C.PAL, '#c99bff');
        const shot = { hits: new Set(), hitAny: false, killAny: false, crit: false };
        const mx = p.x + Math.cos(p.angle) * 16, my = p.y + Math.sin(p.angle) * 16;
        GW.Weapons.traceShot(p.x, p.y, p.angle + U.rand(-0.05, 0.05), s, shot, mx, my, '#c99bff', 'ally');
        p.muzzleT = 0.05;
        FX.light(mx, my, 110, '#b77dff', 0.06);
        A.play('allyShot', { x: p.x, y: p.y });
      }
    } else {
      p.angle += U.angDiff(p.angle, P.angle) * Math.min(1, dt * 4);
      p.cd = Math.max(p.cd - dt, 0);
    }
  }

  /* ---------------- Hover Sentry ---------------- */
  AL.deploySentry = function (P) {
    if (!P.sentryCarried) return false;
    const ca = Math.cos(P.angle), sa = Math.sin(P.angle);
    let x = P.x + ca * 34, y = P.y + sa * 34;
    if (M.tileAt(x, y) !== M.TT.FLOOR || !M.los(P.x, P.y, x, y, M.solidForPlayer)) {
      x = P.x;
      y = P.y;
    }
    const probe = { x, y, r: 12 };
    M.resolveCircle(probe, probe.r, M.solidForPlayer);
    if (AL.sentry) {
      FX.burst(AL.sentry.x, AL.sentry.y, 12, '#19f0ff', 200);
      A.play('palBye', { x: AL.sentry.x, y: AL.sentry.y });
    }
    AL.sentry = { x: probe.x, y: probe.y, angle: P.angle, t: C.SENTRY.duration, max: C.SENTRY.duration, cd: 0, target: null, scanT: 0, anim: 0, muzzleT: 0, rise: 0 };
    P.sentryCarried = false;
    A.play('sentry', { x: probe.x, y: probe.y });
    FX.ring(probe.x, probe.y, 50, '#19f0ff', 0.4, 4);
    FX.burst(probe.x, probe.y, 14, '#19f0ff', 220);
    return true;
  };

  function updateSentry(dt) {
    const s = AL.sentry;
    s.t -= dt;
    s.anim += dt;
    s.rise = Math.min(1, s.rise + dt * 3);
    if (s.muzzleT > 0) s.muzzleT -= dt;
    if (s.t <= 0) {
      FX.burst(s.x, s.y, 16, '#19f0ff', 240);
      FX.smoke(s.x, s.y, 4);
      A.play('palBye', { x: s.x, y: s.y });
      AL.sentry = null;
      return;
    }
    s.scanT -= dt;
    if (s.scanT <= 0 || (s.target && s.target.dead)) {
      s.scanT = 0.12;
      s.target = acquire(s.x, s.y, C.SENTRY.range);
    }
    const z = s.target;
    if (!z || z.dead) {
      s.angle += dt * 0.8; // idle sweep
      return;
    }
    const want = Math.atan2(z.y - s.y, z.x - s.x);
    s.angle += U.angDiff(s.angle, want) * Math.min(1, dt * 9);
    s.cd -= dt;
    if (s.cd <= 0 && s.rise >= 1 && Math.abs(U.angDiff(s.angle, want)) < 0.2) {
      s.cd = 60 / C.SENTRY.rpm;
      const st = gunStats(C.SENTRY, '#7dfcff');
      const shot = { hits: new Set(), hitAny: false, killAny: false, crit: false };
      const mx = s.x + Math.cos(s.angle) * 20, my = s.y + Math.sin(s.angle) * 20;
      GW.Weapons.traceShot(s.x, s.y, s.angle + U.rand(-0.04, 0.04), st, shot, mx, my, '#7dfcff', 'ally');
      s.muzzleT = 0.05;
      FX.light(mx, my, 120, '#19f0ff', 0.06);
      A.play('allyShot', { x: s.x, y: s.y, sentry: true });
    }
  }

  AL.update = function (dt) {
    const P = GW.Player;
    if (AL.pal) updatePal(dt, P);
    if (AL.sentry) updateSentry(dt);
  };
})();
