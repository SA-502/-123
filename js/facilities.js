/* GRAVEWAVE — park facilities: traps, the panic room, teleporter pads and the extra vending machines */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio, T = C.TILE;
  const F = (GW.Facilities = { palCd: 0 });

  F.reset = function () {
    F.palCd = 0; // traps, shutter and pads keep their state on map objects, rebuilt with the map
  };

  /** While the panic room is sealed the horde converges on its shutter instead of the player. */
  F.sealed = () => M.safeRoom.state === 'sealed';
  F.flowGoal = () => (F.sealed() ? M.safeRoom.outside : null);

  const zoneName = (z) => (z >= 0 ? M.zones[z].name : '?');
  const inRect = (x, y, r, pad) => x > r.rx - pad && x < r.rx + r.rw + pad && y > r.ry - pad && y < r.ry + r.rh + pad;

  /* ------------------------------------------------------------------ */
  /* traps                                                              */
  /* ------------------------------------------------------------------ */
  function activateTrap(tr) {
    tr.state = 'active';
    tr.t = C.TRAP.duration;
    tr.playerT = 0;
    A.play('trapOn', { x: tr.sw.x, y: tr.sw.y });
    FX.ring(tr.rx + tr.rw / 2, tr.ry + tr.rh / 2, Math.max(tr.rw, tr.rh) * 0.7, GW.TRAPS[tr.kind].color, 0.4, 4);
  }

  function updateTrap(tr, dt, P) {
    if (tr.state === 'cooldown') {
      tr.t -= dt;
      if (tr.t <= 0) tr.state = 'idle';
      return;
    }
    if (tr.state !== 'active') return;
    tr.t -= dt;
    const col = GW.TRAPS[tr.kind].color;
    const cx = tr.rx + tr.rw / 2, cy = tr.ry + tr.rh / 2;
    // ambient effect
    if (tr.kind === 'zap') {
      if (Math.random() < dt * 14) {
        const x1 = U.rand(tr.rx, tr.rx + tr.rw), y1 = U.rand(tr.ry, tr.ry + tr.rh);
        FX.bolt(x1, y1, x1 + U.rand(-50, 50), y1 + U.rand(-50, 50), col, 0.12, 2);
      }
    } else if (tr.kind === 'fire') {
      if (Math.random() < dt * 40) FX.sparks(U.rand(tr.rx, tr.rx + tr.rw), U.rand(tr.ry, tr.ry + tr.rh), -Math.PI / 2 + U.rand(-0.4, 0.4), 2, Math.random() < 0.5 ? '#ff7a1a' : '#ffd426', 160, 0.4);
    }
    if (Math.random() < dt * 6) FX.light(cx, cy, 150, col, 0.15);
    tr.sfxT -= dt;
    if (tr.sfxT <= 0) {
      tr.sfxT = tr.kind === 'laser' ? 0.5 : 0.28;
      A.play(tr.kind === 'zap' ? 'zap' : tr.kind === 'fire' ? 'flame' : 'laser', { x: cx, y: cy });
    }
    // damage zombies on a short tick
    for (const z of GW.Zombies.list.slice()) {
      if (z.dead || z.state === 'breach' || !inRect(z.x, z.y, tr, z.r * 0.5)) continue;
      z.trapT = (z.trapT || 0) - dt;
      if (z.trapT > 0) continue;
      z.trapT = C.TRAP.tick;
      const dmg = z.type === 'brute' ? z.maxHp * C.TRAP.bruteFrac : z.hp + 1;
      const killed = GW.Zombies.damage(z, dmg, { trap: true, dir: Math.random() * U.TAU, shock: tr.kind === 'zap' });
      if (killed && tr.kind === 'fire') GW.MapArt.decal(z.x, z.y, 18, '#140804', 0.6);
    }
    // and the player, if they stand in it
    if (P.alive && inRect(P.x, P.y, tr, P.r * 0.3)) {
      tr.playerT -= dt;
      if (tr.playerT <= 0) {
        tr.playerT = C.TRAP.playerTick;
        P.hurt(C.TRAP.playerDmg);
      }
    } else tr.playerT = 0;
    if (tr.t <= 0) {
      tr.state = 'cooldown';
      tr.t = C.TRAP.cooldown;
      A.play('trapOff', { x: cx, y: cy });
    }
  }

  /* ------------------------------------------------------------------ */
  /* panic room                                                         */
  /* ------------------------------------------------------------------ */
  function setShutter(closed) {
    const S = M.safeRoom;
    for (const [x, y] of S.door) M.tiles[M.idx(x, y)] = closed ? M.TT.DOOR : M.TT.FLOOR;
    M.markDirty();
  }

  function seal(P) {
    const S = M.safeRoom;
    S.state = 'sealed';
    S.t = C.SAFEROOM.duration;
    S.warned = false;
    // nothing hostile may be left inside or in the doorway
    for (const z of GW.Zombies.list.slice()) {
      if (inRect(z.x, z.y, S, z.r) || inRect(z.x, z.y, { rx: S.dx, ry: S.dy, rw: S.dw, rh: S.dh }, z.r)) {
        GW.Zombies.kill(z, { trap: true, shock: true, dir: Math.PI });
      }
    }
    // the player is never shut out: anyone in the doorway is pulled inside
    if (P.x < S.rx + P.r) P.x = S.rx + P.r + 1;
    P.y = U.clamp(P.y, S.ry + P.r + 1, S.ry + S.rh - P.r - 1);
    setShutter(true);
    A.play('shutter', {});
    FX.shake(6);
    FX.burst(S.dx + T / 2, S.dy + T, 16, '#3dff8b', 260);
    GW.Game.announce('LOCKDOWN', 'Panic room sealed for ' + C.SAFEROOM.duration + ' seconds', '#3dff8b');
  }

  function unseal() {
    const S = M.safeRoom, SC = C.SAFEROOM, P = GW.Player;
    S.state = 'open';
    S.cd = SC.cooldown;
    S.hatchT = SC.hatchWindow;
    setShutter(false);
    A.play('shutter', {});
    // the shutter blows outward: the waiting horde is thrown back and dazed so you can break out
    const o = S.outside;
    for (const z of GW.Zombies.list.slice()) {
      if (z.dead || z.state === 'breach') continue;
      const d = U.dist(o.x, o.y, z.x, z.y);
      if (d > SC.blastR || !M.los(o.x, o.y, z.x, z.y, M.blocksBullet)) continue;
      const a = Math.atan2(z.y - o.y, z.x - o.x), f = 1 - d / SC.blastR;
      z.kx += Math.cos(a) * (300 + 700 * f);
      z.ky += Math.sin(a) * (300 + 700 * f);
      z.dazeT = Math.max(z.dazeT || 0, SC.daze);
      if (z.state === 'attack') z.state = 'chase';
      z.attackCd = Math.max(z.attackCd, SC.daze);
      GW.Zombies.damage(z, z.maxHp * (z.type === 'boss' ? 0.02 : SC.blastFrac), { trap: true, shock: true, dir: a });
    }
    P.invuln = Math.max(P.invuln, 1.5);
    FX.ring(o.x, o.y, SC.blastR, '#3dff8b', 0.55, 8);
    FX.ring(o.x, o.y, SC.blastR * 0.55, '#ffffff', 0.35, 4);
    FX.light(o.x, o.y, SC.blastR * 1.6, '#3dff8b', 0.6);
    FX.burst(o.x, o.y, 40, '#3dff8b', 520);
    FX.shake(12);
    FX.flash = Math.max(FX.flash, 0.35);
    A.play('shockwave', { x: o.x, y: o.y });
    GW.Game.announce('BREAKOUT', 'Shockwave released — move!', '#3dff8b');
  }

  /** Maintenance hatch: a free way out of the panic room while it is sealed and just after. */
  function useHatch(P) {
    const S = M.safeRoom, dest = M.pads[0].a;
    FX.burst(P.x, P.y, 18, '#3dff8b', 260);
    A.play('hatch', {});
    P.x = dest.x;
    P.y = dest.y;
    P.vx = P.vy = 0;
    P.invuln = Math.max(P.invuln, 1);
    M.resolveCircle(P, P.r, M.solidForPlayer);
    S.hatchT = 0;
    FX.ring(P.x, P.y, 90, '#3dff8b', 0.4, 4);
    FX.burst(P.x, P.y, 20, '#3dff8b', 280);
    GW.Render.snap();
    GW.Game.announce('ESCAPED', 'Out through the maintenance tunnel', '#3dff8b');
  }

  function updateSafe(dt) {
    const S = M.safeRoom;
    if (S.cd > 0) S.cd -= dt;
    if (S.hatchT > 0) S.hatchT -= dt;
    if (S.state !== 'sealed') return;
    S.t -= dt;
    if (!S.warned && S.t <= C.SAFEROOM.warn) {
      S.warned = true;
      A.play('siren');
      GW.Game.announce('SHUTTER OPENING', 'Get ready', '#ff3b4e');
    }
    // the horde hammers on the shutter
    S.bangT -= dt;
    if (S.bangT <= 0) {
      S.bangT = U.rand(0.35, 0.8);
      for (const z of GW.Zombies.list) {
        if (U.dist(z.x, z.y, S.outside.x, S.outside.y) < 70) {
          A.play('bang', { x: S.dx, y: S.dy + T });
          FX.sparks(S.dx, U.rand(S.dy + 6, S.dy + S.dh - 6), Math.PI, 3, '#ffd68a', 160);
          break;
        }
      }
    }
    if (S.t <= 0) unseal();
  }

  /* ------------------------------------------------------------------ */
  /* teleporters                                                        */
  /* ------------------------------------------------------------------ */
  function teleport(P, pair, from, to) {
    FX.ring(from.x, from.y, 70, pair.color, 0.45, 5);
    FX.burst(from.x, from.y, 24, pair.color, 320);
    P.x = to.x;
    P.y = to.y;
    P.vx = P.vy = 0;
    P.invuln = Math.max(P.invuln, 0.6);
    M.resolveCircle(P, P.r, M.solidForPlayer);
    pair.cd = C.TELEPORT.cooldown;
    // arrival shockwave clears a little space
    for (const z of GW.Zombies.list) {
      const d = U.dist(z.x, z.y, P.x, P.y);
      if (d > 150 || z.state === 'breach') continue;
      const a = Math.atan2(z.y - P.y, z.x - P.x);
      z.kx += Math.cos(a) * 420 * (1 - d / 150);
      z.ky += Math.sin(a) * 420 * (1 - d / 150);
      z.stun = Math.max(z.stun, 0.6);
    }
    FX.ring(P.x, P.y, 150, pair.color, 0.5, 6);
    FX.burst(P.x, P.y, 30, pair.color, 360);
    FX.light(P.x, P.y, 320, pair.color, 0.5);
    FX.flash = Math.max(FX.flash, 0.25);
    A.play('teleport');
    GW.Render.snap();
  }

  /* ------------------------------------------------------------------ */
  /* interactables                                                      */
  /* ------------------------------------------------------------------ */
  F.buildInteractables = function (list, ui) {
    const { key, cost, ok, info, wallDist } = ui;
    const I = GW.Interact;

    for (const tr of M.traps) {
      const def = GW.TRAPS[tr.kind];
      tr.zone = M.zone[M.idx(tr.x, tr.y)];
      list.push({
        kind: 'trap', ref: tr.sw, trap: tr,
        dist: wallDist(tr.sw),
        prompt() {
          if (!I.powered(tr.zone)) return info(def.name + ' — no power in ' + zoneName(tr.zone));
          if (tr.state === 'active') return info(def.name + ' — running ' + Math.ceil(tr.t) + 's');
          if (tr.state === 'cooldown') return info(def.name + ' — recharging ' + Math.ceil(tr.t) + 's');
          return ok('Press ' + key('F') + ' to activate the ' + def.name + ' ' + cost(C.TRAP.cost));
        },
        use() {
          if (!I.powered(tr.zone) || tr.state !== 'idle' || !GW.Game.spend(C.TRAP.cost)) return;
          activateTrap(tr);
        },
      });
    }

    const S = M.safeRoom;
    const H = S.hatch;
    list.push({
      kind: 'hatch', ref: { tx: H.tx, ty: H.ty, w: 1, h: 1 },
      dist: (p) => U.rectDist(p.x, p.y, H.tx * T, H.ty * T, T, T),
      prompt() {
        if (S.state === 'sealed' || S.hatchT > 0) return ok('Press ' + key('F') + ' to escape through the maintenance hatch');
        return null;
      },
      use(p) {
        if (S.state === 'sealed' || S.hatchT > 0) useHatch(p);
      },
    });
    list.push({
      kind: 'safe', ref: S.console,
      dist: wallDist(S.console),
      prompt() {
        if (S.state === 'sealed') return info('Lockdown — ' + Math.ceil(S.t) + 's left');
        if (S.cd > 0) return info('Panic room — recharging ' + Math.ceil(S.cd) + 's');
        return ok('Press ' + key('F') + ' to seal the panic room ' + cost(C.SAFEROOM.cost));
      },
      use(p) {
        if (S.state === 'sealed' || S.cd > 0 || !GW.Game.spend(C.SAFEROOM.cost)) return;
        seal(p);
      },
    });

    for (const pair of M.pads) {
      for (const [from, to] of [[pair.a, pair.b], [pair.b, pair.a]]) {
        list.push({
          kind: 'pad', ref: { tx: from.tx, ty: from.ty, w: 1, h: 1 }, pad: from,
          dist: (p) => U.rectDist(p.x, p.y, from.tx * T, from.ty * T, T, T),
          prompt() {
            if (!I.powered(from.zone) || !I.powered(to.zone)) return info('Teleporter — needs power here and in ' + zoneName(to.zone));
            if (!M.zones[to.zone].open) return info('Teleporter — open ' + zoneName(to.zone) + ' first');
            if (pair.cd > 0) return info('Teleporter — recharging ' + Math.ceil(pair.cd) + 's');
            return ok('Press ' + key('F') + ' to teleport to ' + zoneName(to.zone) + ' ' + cost(C.TELEPORT.cost));
          },
          use(p) {
            if (!I.powered(from.zone) || !I.powered(to.zone) || !M.zones[to.zone].open || pair.cd > 0 || !GW.Game.spend(C.TELEPORT.cost)) return;
            teleport(p, pair, from, to);
          },
        });
      }
    }

    for (const v of M.vendors) {
      v.zone = M.zone[M.idx(v.tx + v.fx, v.ty + v.fy)];
      const it = { kind: 'vendor', ref: v, dist: wallDist(v) };
      if (v.kind === 'armor') {
        it.prompt = (p) =>
          p.armor >= C.ARMOR.max ? info('Plate Armor — fully repaired') : ok('Press ' + key('F') + ' for Plate Armor <span class="dim">absorbs 70% of damage</span> ' + cost(C.ARMOR.cost));
        it.use = (p) => {
          if (p.armor >= C.ARMOR.max || !GW.Game.spend(C.ARMOR.cost)) return;
          p.armor = C.ARMOR.max;
          A.play('armor');
          FX.ring(p.x, p.y, 60, '#4f8bff', 0.4, 4);
        };
      } else if (v.kind === 'tactical') {
        const def = GW.TACTICALS[v.item];
        it.prompt = (p) => {
          if (p.tactical.type === v.item && p.tactical.count >= def.max) return info(def.name + ' — fully stocked');
          const swap = p.tactical.type && p.tactical.type !== v.item ? ' <span class="dim">replaces ' + GW.TACTICALS[p.tactical.type].name + '</span>' : '';
          return ok('Press ' + key('F') + ' for ' + def.name + ' x' + def.max + ' <span class="dim">' + def.desc + '</span>' + swap + ' ' + cost(def.cost));
        };
        it.use = (p) => {
          if ((p.tactical.type === v.item && p.tactical.count >= def.max) || !GW.Game.spend(def.cost)) return;
          GW.Gadgets.give(p, v.item);
          FX.burst(v.x + v.fx * 30, v.y + v.fy * 30, 10, def.color, 200);
        };
      } else if (v.kind === 'pal') {
        it.prompt = () => {
          if (!I.powered(v.zone)) return info('Pixel Pal — no power in ' + zoneName(v.zone));
          if (GW.Allies.pal) return info('Pixel Pal — already deployed');
          if (F.palCd > 0) return info('Pixel Pal — recharging ' + Math.ceil(F.palCd) + 's');
          return ok('Press ' + key('F') + ' to summon a Pixel Pal <span class="dim">' + C.PAL.duration + 's</span> ' + cost(C.PAL.cost));
        };
        it.use = () => {
          if (!I.powered(v.zone) || GW.Allies.pal || F.palCd > 0 || !GW.Game.spend(C.PAL.cost)) return;
          GW.Allies.summonPal(C.PAL.duration);
          F.palCd = C.PAL.cooldown;
        };
      } else if (v.kind === 'sentry') {
        it.prompt = (p) => {
          if (!I.powered(v.zone)) return info('Hover Sentry — no power in ' + zoneName(v.zone));
          if (p.sentryCarried) return info('Hover Sentry — press ' + key('X') + ' to deploy the one you carry');
          return ok('Press ' + key('F') + ' to buy a Hover Sentry <span class="dim">deploy with X</span> ' + cost(C.SENTRY.cost));
        };
        it.use = (p) => {
          if (!I.powered(v.zone) || p.sentryCarried || !GW.Game.spend(C.SENTRY.cost)) return;
          p.sentryCarried = true;
          A.play('swap');
          GW.Game.announce('HOVER SENTRY', 'Press X to deploy', '#19f0ff');
        };
      }
      list.push(it);
    }
  };

  F.update = function (dt) {
    const P = GW.Player;
    if (F.palCd > 0) F.palCd -= dt;
    for (const tr of M.traps) updateTrap(tr, dt, P);
    updateSafe(dt);
    for (const pair of M.pads) if (pair.cd > 0) pair.cd -= dt;
  };
})();
