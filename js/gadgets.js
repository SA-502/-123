/* GRAVEWAVE — tactical grenades: Cryo (freeze + slow), Neon Lure (decoy that detonates), Safety Bubble (no-zombie dome) */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio;
  const G = (GW.Gadgets = { lure: null, bubbles: [] });

  G.reset = function () {
    G.lure = null;
    G.bubbles = [];
  };

  /** Throw the carried tactical (T). */
  G.throwTactical = function (p) {
    const tac = p.tactical;
    if (!tac.type || tac.count <= 0) {
      if (tac.type) A.play('empty');
      return false;
    }
    tac.count--;
    const fuse = tac.type === 'cryo' ? 1.0 : tac.type === 'lure' ? 0.8 : 0.6;
    GW.Weapons.launch(p, p.aimX, p.aimY, tac.type, fuse);
    return true;
  };

  /** Give a tactical type with a full stack (vendor purchase). */
  G.give = function (p, type) {
    p.tactical.type = type;
    p.tactical.count = GW.TACTICALS[type].max;
  };

  /** A tactical grenade finished its flight. */
  G.land = function (g) {
    // co-op: lures and bubbles change how the horde moves, so every player gets them
    if (g.kind !== 'cryo' && !g.remote && GW.Net) GW.Net.emit('gad', { k: g.kind, x: Math.round(g.x), y: Math.round(g.y) });
    if (g.kind === 'cryo') cryoBlast(g.x, g.y);
    else if (g.kind === 'lure') {
      if (G.lure) detonateLure(G.lure); // only one lure at a time
      const goal = walkableNear(g.x, g.y);
      G.lure = { x: g.x, y: g.y, gx: goal.x, gy: goal.y, t: C.LURE.life, max: C.LURE.life, beepT: 0, ver: -1, live: true, remote: !!g.remote };
      A.play('lure', { x: g.x, y: g.y });
      FX.ring(g.x, g.y, 80, '#ff4fd8', 0.5, 3);
    } else if (g.kind === 'bubble') {
      if (G.bubbles.length >= C.BUBBLE.max) G.bubbles.shift();
      G.bubbles.push({ x: g.x, y: g.y, r: C.BUBBLE.radius, t: C.BUBBLE.life, max: C.BUBBLE.life, grow: 0 });
      A.play('bubble', { x: g.x, y: g.y });
      FX.ring(g.x, g.y, C.BUBBLE.radius, '#3dff8b', 0.4, 5);
      FX.burst(g.x, g.y, 18, '#3dff8b', 260);
    }
  };

  /** Centre of the closest tile a zombie can stand on (lures can land on low props like the fountain). */
  function walkableNear(x, y) {
    const T = C.TILE, tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (!M.solidForZombie(tx, ty)) return { x, y };
    let best = null, bd = Infinity;
    for (let r = 1; r <= 3 && !best; r++)
      for (let j = -r; j <= r; j++)
        for (let i = -r; i <= r; i++) {
          if (M.solidForZombie(tx + i, ty + j) || M.tile(tx + i, ty + j) === M.TT.WINDOW) continue;
          const cx = (tx + i + 0.5) * T, cy = (ty + j + 0.5) * T, d = U.dist(x, y, cx, cy);
          if (d < bd) {
            bd = d;
            best = { x: cx, y: cy };
          }
        }
    return best || { x, y };
  }

  /** True when (x,y) lies within `pad` px of any bubble's edge. */
  G.insideBubble = function (x, y, pad) {
    for (const b of G.bubbles) if (U.dist(x, y, b.x, b.y) < b.r + (pad || 0)) return true;
    return false;
  };

  function cryoBlast(x, y) {
    const R = C.CRYO.radius;
    A.play('freeze', { x, y });
    FX.ring(x, y, R, '#8fe9ff', 0.45, 6);
    FX.ring(x, y, R * 0.6, '#ffffff', 0.3, 3);
    FX.light(x, y, R * 2.2, '#8fe9ff', 0.6);
    FX.burst(x, y, 30, '#bff4ff', 380);
    FX.shake(5);
    GW.MapArt.decal(x, y, R * 0.45, '#1a4a5a', 0.35);
    let hit = false, kill = false;
    for (const z of GW.Zombies.list.slice()) {
      if (z.dead) continue;
      const d = U.dist(x, y, z.x, z.y) - z.r;
      if (d > R || !M.los(x, y, z.x, z.y, M.blocksBullet)) continue;
      z.freezeT = Math.max(z.freezeT || 0, C.CRYO.freeze);
      z.slowT = Math.max(z.slowT || 0, C.CRYO.freeze + C.CRYO.slow);
      if (z.state === 'attack') {
        z.state = 'chase';
        z.attackCd = Math.max(z.attackCd, 0.5);
      }
      hit = true;
      if (GW.Zombies.damage(z, C.CRYO.damage, { dir: Math.atan2(z.y - y, z.x - x), cold: true })) kill = true;
      else GW.Game.addPoints(C.POINTS.hit, z.x, z.y - z.r, { small: true });
    }
    if (hit) FX.hit(kill, false);
  }

  function detonateLure(l) {
    if (!l.live) return;
    l.live = false;
    if (l.remote) {
      // a teammate's lure: their game deals the damage, ours just shows the blast
      FX.explosion(l.x, l.y, C.LURE.radius, '#ff4fd8');
      A.play('explosion', { x: l.x, y: l.y });
      if (G.lure === l) G.lure = null;
      return;
    }
    const dmg = Math.max(350, GW.Rounds.health(GW.Director.round || 1) * 0.9) * C.LURE.mult;
    GW.Weapons.explode(l.x, l.y, C.LURE.radius, dmg, dmg * 0.3, { color: '#ff4fd8', hurtPlayer: 60 });
    if (G.lure === l) G.lure = null;
  }

  /** Active lure the horde should chase instead of the player, or null. */
  G.activeLure = function () {
    return G.lure && G.lure.live ? G.lure : null;
  };

  /** True while the player stands inside a Safety Bubble. */
  G.shielded = function (p) {
    for (const b of G.bubbles) if (U.dist(p.x, p.y, b.x, b.y) < b.r) return true;
    return false;
  };

  /** Keep a zombie outside every bubble. */
  G.pushOut = function (z) {
    for (const b of G.bubbles) {
      const dx = z.x - b.x, dy = z.y - b.y;
      const min = b.r + z.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2), ux, uy;
      if (d < 0.01) {
        const a = Math.random() * U.TAU;
        ux = Math.cos(a);
        uy = Math.sin(a);
        d = 0;
      } else {
        ux = dx / d;
        uy = dy / d;
      }
      z.x = b.x + ux * min;
      z.y = b.y + uy * min;
      z.kx *= 0.3;
      z.ky *= 0.3;
      if (Math.random() < 0.08) FX.sparks(b.x + ux * b.r, b.y + uy * b.r, Math.atan2(uy, ux), 2, '#3dff8b', 140);
    }
  };

  G.update = function (dt) {
    const l = G.lure;
    if (l && l.live) {
      // the lure's own flow field, rebuilt whenever doors or shutters change
      if (l.ver !== M.version) {
        M.computeFlow(l.gx, l.gy, M.flowLure);
        l.ver = M.version;
      }
      l.t -= dt;
      l.beepT -= dt;
      const urgency = 1 - l.t / l.max;
      if (l.beepT <= 0) {
        l.beepT = U.lerp(0.55, 0.12, urgency);
        A.play('lureBeep', { x: l.x, y: l.y, pitch: 1 + urgency });
      }
      if (l.t <= 0) detonateLure(l);
    }
    for (let i = G.bubbles.length - 1; i >= 0; i--) {
      const b = G.bubbles[i];
      b.t -= dt;
      b.grow = Math.min(1, b.grow + dt * 5);
      if (b.t <= 0) {
        G.bubbles.splice(i, 1);
        A.play('bubblePop', { x: b.x, y: b.y });
        FX.ring(b.x, b.y, b.r * 1.2, '#3dff8b', 0.35, 3);
        FX.burst(b.x, b.y, 14, '#3dff8b', 200);
      }
    }
  };
})();
