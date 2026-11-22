/* GRAVEWAVE — The Headliner: a three-phase boss built on mechanics (armour, weak point, telegraphed attacks) */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio, T = C.TILE;
  const B = (GW.Boss = { ref: null, orbs: [] });
  const tgt = { x: 0, y: 0 };

  const CFG = {
    hpMult: 30, radius: 33, speed: 108, turn: 2.3,
    frontMult: 0.2, stunBonus: 1.5, backCos: 0.3,
    charge: { warn: 0.85, speed: 660, range: 760, dmg: 70, stun: 2.2, min: 200, max: 640 },
    slam: { warn: 1.0, radius: 175, dmg: 60, recover: 0.7, trigger: 200 },
    volley: { warn: 0.6, count: 10, speed: 190, dmg: 25, life: 4.2, radius: 9 },
    melee: { dmg: 55, cd: 1.1 },
    phaseT: 1.4,
  };
  B.CFG = CFG;

  B.reset = function () {
    B.ref = null;
    B.orbs = [];
  };

  /** Only plain floor counts for the boss: it is too big for windows and can't climb props. */
  const solid = (tx, ty) => M.tile(tx, ty) !== M.TT.FLOOR;

  /** An open spot (3x3 clear tiles) at a distance band from the player. */
  function openSpot(P, minD, maxD) {
    for (let i = 0; i < 60; i++) {
      const pt = M.randomFloorNear(P.x, P.y, minD, maxD);
      if (!pt) continue;
      const tx = Math.floor(pt.x / T), ty = Math.floor(pt.y / T);
      let clear = true;
      for (let j = -1; j <= 1 && clear; j++) for (let k = -1; k <= 1; k++) if (solid(tx + k, ty + j)) clear = false;
      if (clear && !GW.Gadgets.insideBubble(pt.x, pt.y, 60)) return pt;
    }
    return null;
  }

  B.spawn = function (round) {
    const P = GW.Net && GW.Net.isHost && GW.Net.remotes.size ? GW.Net.focus() : GW.Player; // co-op: near a living player
    const pt = openSpot(P, 380, 760) || openSpot(P, 200, 1200);
    if (!pt) return null;
    const z = GW.Zombies.spawn('boss', { kind: 'point', x: pt.x, y: pt.y }, GW.Rounds.health(round) * CFG.hpMult, 'run');
    z.r = CFG.radius;
    z.speed = CFG.speed;
    z.damage = CFG.melee.dmg;
    z.skin = '#d9d2e6';
    z.shirt = '#7a1f3a';
    z.eye = '#ff3b4e';
    z.riseT = 1.6;
    z.boss = { phase: 1, mode: 'chase', t: 0, cd: 2.5, summonCd: 9, meleeCd: 0, dirX: 1, dirY: 0, left: 0, stuckT: 0, lx: z.x, ly: z.y, hitPlayer: false, spin: 0 };
    B.ref = z;
    FX.bolt(pt.x, pt.y - 500, pt.x, pt.y, '#ff3b4e', 0.5, 6);
    FX.ring(pt.x, pt.y, 220, '#ff3b4e', 0.7, 8);
    FX.light(pt.x, pt.y, 500, '#ff3b4e', 0.8);
    FX.shake(12);
    A.play('bossRoar', { x: pt.x, y: pt.y });
    // intro card from the art agent, if delivered
    const card = GW.Assets.get('boss_card'), el = document.getElementById('boss-card');
    if (card && el) {
      el.src = card.src;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 2600);
    }
    return z;
  };

  /** Armour model: the front shrugs off most damage; the glowing core on its back takes it all. */
  B.adjustDamage = function (z, amount, info) {
    const b = z.boss;
    if (!b) return amount;
    if (b.mode === 'phase') {
      FX.sparks(z.x, z.y, Math.random() * U.TAU, 2, '#ffffff', 200);
      return 0;
    }
    if (info.nuke || info.burn) return amount;
    if (info.explosive) amount *= 0.5;
    const fromBehind = info.dir !== undefined && Math.cos(U.angDiff(info.dir, z.angle)) > CFG.backCos;
    if (fromBehind) {
      b.weakFlash = 0.15;
      if (b.mode === 'stunned') amount *= CFG.stunBonus;
      if (Math.random() < 0.25) FX.sparks(z.x - Math.cos(z.angle) * z.r, z.y - Math.sin(z.angle) * z.r, z.angle + Math.PI, 3, '#ffd426', 260);
      return amount;
    }
    b.armorFlash = 0.12;
    if (Math.random() < 0.35) FX.sparks(z.x + Math.cos(z.angle) * z.r, z.y + Math.sin(z.angle) * z.r, z.angle, 2, '#c8ccd6', 240);
    return amount * CFG.frontMult;
  };

  B.onDeath = function (z, pos) {
    const P = GW.Player;
    B.ref = null;
    B.orbs = [];
    for (let i = 0; i < 5; i++) FX.explosion(z.x + U.rand(-50, 50), z.y + U.rand(-50, 50), 120, i % 2 ? '#ff3b4e' : '#ffd426');
    FX.ring(z.x, z.y, 420, '#ffffff', 0.8, 10);
    FX.flash = Math.max(FX.flash, 0.6);
    FX.shake(16);
    A.play('bossDeath', { x: z.x, y: z.y });
    const x = pos ? pos.x : P.x, y = pos ? pos.y : P.y;
    GW.Interact.spawnPowerup('ammo', x, y);
    // a free perk the player doesn't own yet
    const missing = Object.keys(GW.PERKS).filter((id) => !P.perks[id]);
    let sub = '+' + C.POINTS.boss + ' points';
    if (missing.length) {
      const id = U.pick(missing);
      P.addPerk(id);
      A.play('perk', { id });
      sub += ' · free perk: ' + GW.PERKS[id].name;
    }
    GW.Game.announce('HEADLINER DOWN', sub, '#ffd426');
  };

  function setMode(b, mode, t) {
    b.mode = mode;
    b.t = t;
  }

  function summon(z, b) {
    const D = GW.Director, P = GW.Net && GW.Net.isHost && GW.Net.remotes.size ? GW.Net.focus() : GW.Player; // co-op: near a living player
    const kinds = b.phase >= 3 ? ['leaper', 'bloater', 'leaper', 'bloater'] : ['leaper', 'leaper', 'leaper', 'leaper'];
    for (const k of kinds) {
      if (GW.Zombies.list.length >= C.MAX_ALIVE) break;
      const pt = M.randomFloorNear(P.x, P.y, 260, 520);
      const spot = pt && !GW.Gadgets.insideBubble(pt.x, pt.y, 40) ? { kind: 'point', x: pt.x, y: pt.y } : D.pickSpawn();
      if (!spot) continue;
      GW.Zombies.spawn(k, spot, D.health, 'sprint');
      FX.ring(spot.x, spot.y, 50, '#ff3b4e', 0.4, 3);
    }
    A.play('bossRoar', { x: z.x, y: z.y });
    FX.ring(z.x, z.y, 200, '#ff3b4e', 0.5, 5);
  }

  function volley(z, b) {
    const V = CFG.volley;
    const n = V.count + (b.phase >= 3 ? 4 : 0);
    const off = Math.random() * U.TAU;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * U.TAU;
      B.orbs.push({ x: z.x + Math.cos(a) * z.r, y: z.y + Math.sin(a) * z.r, vx: Math.cos(a) * V.speed, vy: Math.sin(a) * V.speed, life: V.life });
    }
    A.play('bossVolley', { x: z.x, y: z.y });
    FX.ring(z.x, z.y, 90, '#ff4fd8', 0.35, 4);
  }

  function slam(z, P) {
    const S = CFG.slam;
    FX.ring(z.x, z.y, S.radius, '#ff3b4e', 0.45, 8);
    FX.ring(z.x, z.y, S.radius * 0.6, '#ffffff', 0.3, 4);
    FX.light(z.x, z.y, S.radius * 2.4, '#ff3b4e', 0.4);
    FX.burst(z.x, z.y, 36, '#ffb14d', 420);
    FX.smoke(z.x, z.y, 8);
    FX.shake(13);
    GW.MapArt.decal(z.x, z.y, S.radius * 0.45, '#050308', 0.5);
    A.play('bossSlam', { x: z.x, y: z.y });
    const d = U.dist(P.x, P.y, z.x, z.y);
    if (P.alive && d < S.radius + P.r * 0.5 && !GW.Gadgets.shielded(P)) {
      P.hurt(S.dmg);
      const a = Math.atan2(P.y - z.y, P.x - z.x);
      P.vx += Math.cos(a) * 520;
      P.vy += Math.sin(a) * 520;
    }
  }

  B.update = function (z, dt, P) {
    const b = z.boss;
    if (!b || z.dead) return;
    if (b.weakFlash > 0) b.weakFlash -= dt;
    if (b.armorFlash > 0) b.armorFlash -= dt;
    b.spin += dt;
    if (z.state === 'rise') {
      z.riseT -= dt;
      z.angle = Math.atan2(P.y - z.y, P.x - z.x);
      if (z.riseT <= 0) z.state = 'chase';
      return;
    }
    const dx = P.x - z.x, dy = P.y - z.y, dp = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const speedK = b.phase === 1 ? 1 : b.phase === 2 ? 1.15 : 1.35;

    // phase changes: a short invulnerable roar, then new tricks
    const frac = z.hp / z.maxHp;
    const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (phase > b.phase) {
      b.phase = phase;
      setMode(b, 'phase', CFG.phaseT);
      b.cd = 1;
      FX.ring(z.x, z.y, 320, phase === 3 ? '#ff3b4e' : '#ff4fd8', 0.7, 9);
      FX.light(z.x, z.y, 600, '#ff3b4e', 0.7);
      FX.shake(12);
      A.play('bossPhase', { x: z.x, y: z.y });
      GW.Game.announce(phase === 3 ? 'FINALE' : 'SECOND ACT', phase === 3 ? 'The Headliner is enraged' : 'It calls for backup', '#ff3b4e');
      summon(z, b);
      return;
    }

    b.t -= dt;
    if (b.cd > 0) b.cd -= dt;
    if (b.summonCd > 0) b.summonCd -= dt;
    if (b.meleeCd > 0) b.meleeCd -= dt;

    switch (b.mode) {
      case 'phase':
        if (b.t <= 0) setMode(b, 'chase', 0);
        return;
      case 'stunned':
        if (Math.random() < dt * 10) FX.sparks(z.x + U.rand(-20, 20), z.y + U.rand(-20, 20), -Math.PI / 2, 1, '#ffd426', 120);
        if (b.t <= 0) {
          setMode(b, 'chase', 0);
          b.cd = 0.8;
        }
        return;
      case 'chargeWarn':
        // tracks the player until the last moments, then commits
        if (b.t > 0.3) {
          z.angle += U.angDiff(z.angle, want) * Math.min(1, dt * 8);
          b.dirX = Math.cos(z.angle);
          b.dirY = Math.sin(z.angle);
        }
        if (b.t <= 0) {
          setMode(b, 'charge', 0);
          b.left = CFG.charge.range;
          b.hitPlayer = false;
        }
        return;
      case 'charge': {
        const Ch = CFG.charge;
        const step = Math.min(b.left, Ch.speed * speedK * dt);
        const ox = z.x, oy = z.y;
        M.moveCircle(z, b.dirX * step, b.dirY * step, solid);
        const moved = Math.hypot(z.x - ox, z.y - oy);
        b.left -= step;
        if (Math.random() < 0.7) FX.sparks(z.x, z.y, z.angle + Math.PI, 2, '#ff7a1a', 200, 0.5);
        if (!b.hitPlayer && P.alive && dp < z.r + P.r + 8 && !GW.Gadgets.shielded(P)) {
          b.hitPlayer = true;
          P.hurt(Ch.dmg);
          P.vx += b.dirX * 700;
          P.vy += b.dirY * 700;
          A.play('bite', { x: z.x, y: z.y });
        }
        if (moved < step * 0.4) {
          // slammed into a wall: dazed, back exposed
          setMode(b, 'stunned', b.phase >= 3 ? Ch.stun * 0.7 : Ch.stun);
          FX.burst(z.x + b.dirX * z.r, z.y + b.dirY * z.r, 26, '#ffd68a', 380);
          FX.smoke(z.x + b.dirX * z.r, z.y + b.dirY * z.r, 6);
          FX.shake(11);
          A.play('bossSlam', { x: z.x, y: z.y });
        } else if (b.left <= 0) {
          setMode(b, 'chase', 0);
          b.cd = 1.2;
        }
        return;
      }
      case 'slamWarn':
        if (b.t <= 0) {
          slam(z, P);
          setMode(b, 'recover', CFG.slam.recover);
          if (b.phase >= 3) volley(z, b);
        }
        return;
      case 'volleyWarn':
        z.angle += U.angDiff(z.angle, want) * Math.min(1, dt * 3);
        if (b.t <= 0) {
          volley(z, b);
          setMode(b, 'recover', 0.5);
        }
        return;
      case 'recover':
        if (b.t <= 0) {
          setMode(b, 'chase', 0);
          b.cd = b.phase >= 3 ? 0.9 : 1.5;
        }
        return;
      default:
        break;
    }

    // ---- chase: turn, walk, and pick the next attack ----
    z.angle += U.clamp(U.angDiff(z.angle, want), -CFG.turn * speedK * dt, CFG.turn * speedK * dt);
    const sees = M.los(z.x, z.y, P.x, P.y, solid);
    let tx = P.x, ty = P.y;
    if (!sees && M.flowTarget(z.x, z.y, tgt)) {
      tx = tgt.x;
      ty = tgt.y;
    }
    const mdx = tx - z.x, mdy = ty - z.y, md = Math.hypot(mdx, mdy) || 1;
    const reach = z.r + P.r + 6;
    const step = Math.min(z.speed * speedK * dt, sees ? Math.max(0, dp - reach) : 1e9);
    if (step > 0) M.moveCircle(z, (mdx / md) * step, (mdy / md) * step, solid);

    // close-range swipe keeps the player from hugging it
    if (P.alive && dp < reach + 10 && b.meleeCd <= 0 && !GW.Gadgets.shielded(P)) {
      b.meleeCd = CFG.melee.cd;
      P.hurt(z.damage, true);
      A.play('bite', { x: z.x, y: z.y });
    }

    if (b.cd <= 0 && P.alive) {
      if (b.phase >= 2 && b.summonCd <= 0) {
        b.summonCd = b.phase >= 3 ? 12 : 16;
        summon(z, b);
        b.cd = 1.2;
      } else if (dp < CFG.slam.trigger) {
        setMode(b, 'slamWarn', CFG.slam.warn * (b.phase >= 3 ? 0.8 : 1));
        A.play('bossCharge', { x: z.x, y: z.y });
      } else if (sees && dp > CFG.charge.min && dp < CFG.charge.max && (b.phase === 1 || Math.random() < 0.6)) {
        setMode(b, 'chargeWarn', CFG.charge.warn * (b.phase >= 3 ? 0.75 : 1));
        b.dirX = Math.cos(z.angle);
        b.dirY = Math.sin(z.angle);
        A.play('bossCharge', { x: z.x, y: z.y });
      } else if (b.phase >= 2 && dp < 700) {
        setMode(b, 'volleyWarn', CFG.volley.warn);
      } else b.cd = 0.5;
    }

    // wedged somewhere it can't path out of: phase-shift back into the fight
    if (U.dist(z.x, z.y, b.lx, b.ly) > 24) {
      b.lx = z.x;
      b.ly = z.y;
      b.stuckT = 0;
    } else if (dp > 220) b.stuckT += dt;
    if (b.stuckT > 3.5 || dp > 1500) {
      const pt = openSpot(P, 260, 480);
      if (pt) {
        FX.burst(z.x, z.y, 24, '#ff3b4e', 300);
        z.x = pt.x;
        z.y = pt.y;
        FX.ring(z.x, z.y, 160, '#ff3b4e', 0.5, 6);
        A.play('teleport');
      }
      b.stuckT = 0;
      b.lx = z.x;
      b.ly = z.y;
    }
  };

  /** Volley orbs: slow, dodgeable, stopped by walls. Called once per frame from the game loop. */
  B.updateOrbs = function (dt) {
    const P = GW.Player, V = CFG.volley;
    for (let i = B.orbs.length - 1; i >= 0; i--) {
      const o = B.orbs[i];
      o.life -= dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      let gone = o.life <= 0 || M.blocksBullet(Math.floor(o.x / T), Math.floor(o.y / T));
      if (!gone && P.alive && U.dist(o.x, o.y, P.x, P.y) < V.radius + P.r) {
        if (!GW.Gadgets.shielded(P)) P.hurt(V.dmg);
        gone = true;
      }
      if (!gone && GW.Gadgets.insideBubble(o.x, o.y, 0)) gone = true;
      if (gone) {
        FX.burst(o.x, o.y, 6, '#ff4fd8', 160);
        B.orbs.splice(i, 1);
      }
    }
  };
})();
