/* GRAVEWAVE — park facilities: the map's trap, the panic room, the Overclocker lockdown and the extra vending machines */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio, T = C.TILE;
  const F = (GW.Facilities = { palCd: 0 });

  /**
   * Overclocker lockdown tuning (kept here rather than in config.js). The round's first Overclocker
   * purchase seals the machine's room (M.papRoom, see docs/LOCKDOWN.md) for `duration` seconds.
   */
  const LOCK = (F.LOCK = { duration: 30, warn: 5, blastR: 340, daze: 2.5, color: '#ff4fd8' });

  F.reset = function () {
    F.palCd = 0; // the trap, shutters and lockdown keep their state on map objects, rebuilt with the map
  };

  const isGuest = () => !!(GW.Net && GW.Net.isGuest);
  const serverMode = () => !!(GW.Net && GW.Net.serverMode);

  /**
   * Where the horde's flow field leads instead of the players: the panic-room shutter while it is
   * sealed, or the Overclocker room's doorway while everyone left alive is locked inside it.
   */
  F.flowGoal = function () {
    if (M.safeRoom && M.safeRoom.state === 'sealed') return M.safeRoom.outside;
    const R = M.papRoom;
    if (R && R.state === 'sealed' && !anyoneOutside()) return R.goal;
    return null;
  };
  /** The horde is waiting at a shutter (no straggler relocation meanwhile). */
  F.sealed = () => F.flowGoal() !== null;

  const zoneName = (z) => (z >= 0 ? M.zones[z].name : '?');
  const inRect = (x, y, r, pad) => x > r.rx - pad && x < r.rx + r.rw + pad && y > r.ry - pad && y < r.ry + r.rh + pad;

  /* ------------------------------------------------------------------ */
  /* the trap (one per map, each with its own twist)                    */
  /* ------------------------------------------------------------------ */
  // a trap with `sweep` keeps its full floor plate in `full` and moves a band of `sweep.band` tiles
  // up and down it while running (render draws whatever rect the trap has right now)
  function setRect(tr, y, h) {
    tr.ry = y;
    tr.rh = h * T;
    tr.h = h;
  }
  function restoreRect(tr) {
    if (tr.full) setRect(tr, tr.full.ry, tr.full.h);
  }

  function activateTrap(tr) {
    const def = GW.TRAPS[tr.kind];
    tr.state = 'active';
    tr.t = C.TRAP.duration;
    tr.playerT = 0;
    tr.kills = 0;
    tr.arcT = 0;
    tr.run = 0;
    if (tr.sweep) {
      tr.full = tr.full || { ry: tr.ry, h: tr.h };
      setRect(tr, tr.full.ry, tr.sweep.band);
    }
    A.play('trapOn', { x: tr.sw.x, y: tr.sw.y });
    const cx = tr.rx + tr.rw / 2, cy = (tr.full ? tr.full.ry + (tr.full.h * T) / 2 : tr.ry + tr.rh / 2);
    FX.ring(cx, cy, Math.max(tr.rw, tr.full ? tr.full.h * T : tr.rh) * 0.7, def.color, 0.5, 5);
    FX.light(cx, cy, 380, def.color, 0.6);
    FX.shake(5);
    GW.Game.announce(def.name.toUpperCase() + ' ONLINE', tr.hint || 'Lead the horde through it', def.color);
  }

  /** Last moments of a run: everything still on the plate (and a tile around it) gets the overload. */
  function overload(tr) {
    const def = GW.TRAPS[tr.kind];
    restoreRect(tr);
    const box = { rx: tr.rx - T, ry: tr.ry - T, rw: tr.rw + 2 * T, rh: tr.rh + 2 * T };
    const cx = tr.rx + tr.rw / 2, cy = tr.ry + tr.rh / 2;
    if (!isGuest()) {
      for (const z of GW.Zombies.list.slice()) {
        if (z.dead || z.state === 'breach' || !inRect(z.x, z.y, box, 0)) continue;
        const dmg = z.type === 'boss' ? z.maxHp * 0.04 : z.type === 'brute' ? z.maxHp * 0.5 : z.hp + 1;
        if (GW.Zombies.damage(z, dmg, { trap: true, dir: Math.atan2(z.y - cy, z.x - cx), shock: tr.kind === 'zap' })) tr.kills++;
      }
    }
    if (tr.kind === 'zap') {
      for (let i = 0; i < 10; i++) FX.bolt(cx, cy, U.rand(box.rx, box.rx + box.rw), U.rand(box.ry, box.ry + box.rh), def.color, 0.3, 3);
    } else {
      for (let i = 0; i < 14; i++) FX.flame(U.rand(tr.rx, tr.rx + tr.rw), U.rand(tr.ry, tr.ry + tr.rh), -Math.PI / 2 + U.rand(-0.5, 0.5), 90, 0.5);
    }
    FX.ring(cx, cy, Math.max(box.rw, box.rh) * 0.6, def.color, 0.5, 7);
    FX.light(cx, cy, 420, def.color, 0.5);
    FX.shake(8);
    A.play('shockwave', { x: cx, y: cy });
    if (tr.kills > 0) GW.Game.announce(def.name.toUpperCase(), tr.kills + ' zombies fried', def.color);
  }

  function updateTrap(tr, dt, P) {
    if (tr.state === 'cooldown') {
      tr.t -= dt;
      if (tr.t <= 0) tr.state = 'idle';
      return;
    }
    if (tr.state !== 'active') return;
    tr.t -= dt;
    tr.run += dt;
    const col = GW.TRAPS[tr.kind].color;
    // the sweeping wall: ping-pong along the plate
    if (tr.sweep && tr.full) {
      const span = tr.full.h - tr.sweep.band;
      const ph = (tr.run * tr.sweep.speed) % (2 * span);
      setRect(tr, tr.full.ry + (ph < span ? ph : 2 * span - ph) * T, tr.sweep.band);
    }
    const cx = tr.rx + tr.rw / 2, cy = tr.ry + tr.rh / 2;
    // ambient effect
    if (tr.kind === 'zap') {
      if (Math.random() < dt * 14) {
        const x1 = U.rand(tr.rx, tr.rx + tr.rw), y1 = U.rand(tr.ry, tr.ry + tr.rh);
        FX.bolt(x1, y1, x1 + U.rand(-50, 50), y1 + U.rand(-50, 50), col, 0.12, 2);
      }
      // arcs jump between the zombies standing on the floor
      tr.arcT -= dt;
      if (tr.arcT <= 0) {
        tr.arcT = 0.12;
        const on = GW.Zombies.list.filter((z) => !z.dead && inRect(z.x, z.y, tr, 0));
        for (let i = 0; i + 1 < on.length && i < 4; i++) FX.bolt(on[i].x, on[i].y, on[i + 1].x, on[i + 1].y, col, 0.14, 2.5);
      }
    } else if (tr.kind === 'fire') {
      if (Math.random() < dt * 40) FX.sparks(U.rand(tr.rx, tr.rx + tr.rw), U.rand(tr.ry, tr.ry + tr.rh), -Math.PI / 2 + U.rand(-0.4, 0.4), 2, Math.random() < 0.5 ? '#ff7a1a' : '#ffd426', 160, 0.4);
      if (tr.sweep && Math.random() < dt * 12) FX.flame(U.rand(tr.rx, tr.rx + tr.rw), cy, -Math.PI / 2 + U.rand(-0.6, 0.6), 70, 0.5);
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
      const dmg = z.type === 'boss' ? z.maxHp * 0.008 : z.type === 'brute' ? z.maxHp * C.TRAP.bruteFrac : z.hp + 1;
      const killed = GW.Zombies.damage(z, dmg, { trap: true, dir: Math.random() * U.TAU, shock: tr.kind === 'zap' });
      if (killed) {
        tr.kills++;
        if (tr.kind === 'fire') GW.MapArt.decal(z.x, z.y, 18, '#140804', 0.6);
      }
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
      overload(tr);
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
    const S = M.safeRoom, e = S.exit;
    const dest = e ? { x: (e.tx + 0.5) * T, y: (e.ty + 0.5) * T } : M.spawn;
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
  /* Overclocker lockdown (generic: any map that sets M.papRoom)        */
  /* ------------------------------------------------------------------ */
  const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const inRoomTile = (R, tx, ty) => tx >= R.x0 && tx <= R.x1 && ty >= R.y0 && ty <= R.y1;

  /** True when an entity's centre is in the Overclocker room or on one of its doorway tiles. */
  function insideRoom(p) {
    const R = M.papRoom;
    if (!R || !R.ready) return false;
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    return inRoomTile(R, tx, ty) || R.gateSet.has(M.idx(tx, ty));
  }
  /** True while the lockdown is on and this player / zombie is shut in the room. */
  F.lockedIn = (p) => !!(M.papRoom && M.papRoom.state === 'sealed' && insideRoom(p));

  function anyoneOutside() {
    const N = GW.Net;
    const list = N && N.active && N.isHost ? N.players() : [GW.Player];
    for (const p of list) if (p.alive && !insideRoom(p)) return true;
    return false;
  }

  /**
   * Turn M.papRoom's doorway tiles into shutters. Each connected group of gate tiles becomes a
   * door object in M.doors (flag `lock`) so the renderer draws it like a closed door while sealed;
   * it stays "open" the rest of the time. Also works out where the horde waits outside.
   */
  function setupLock() {
    const R = M.papRoom;
    if (!R || R.ready || !R.gates || !R.gates.length) return;
    R.ready = true;
    R.state = 'open';
    R.t = 0;
    R.warned = false;
    R.round = -1;
    R.bangT = 0;
    R.gateSet = new Set(R.gates.map((g) => M.idx(g.tx, g.ty)));
    R.cx = ((R.x0 + R.x1 + 1) / 2) * T;
    R.cy = ((R.y0 + R.y1 + 1) / 2) * T;
    const roomZone = M.zone[M.idx(Math.floor(R.cx / T), Math.floor(R.cy / T))];
    const left = new Set(R.gateSet);
    R.doors = [];
    for (const g of R.gates) {
      const k0 = M.idx(g.tx, g.ty);
      if (!left.has(k0)) continue;
      // flood-fill one doorway
      left.delete(k0);
      const tiles = [], todo = [[g.tx, g.ty]];
      while (todo.length) {
        const [x, y] = todo.pop();
        tiles.push([x, y]);
        for (const [dx, dy] of DIR4) {
          const k = M.idx(x + dx, y + dy);
          if (left.has(k)) {
            left.delete(k);
            todo.push([x + dx, y + dy]);
          }
        }
      }
      // the outside: neighbours that are neither room nor doorway, and the way they lie
      let ox = 0, oy = 0, n = 0, ddx = 0, ddy = 0;
      for (const [x, y] of tiles)
        for (const [dx, dy] of DIR4) {
          const nx = x + dx, ny = y + dy, t = M.tile(nx, ny);
          if (inRoomTile(R, nx, ny) || R.gateSet.has(M.idx(nx, ny))) continue;
          if (t === M.TT.WALL || t === M.TT.SOLID || t === M.TT.WATER) continue;
          ox += nx + 0.5;
          oy += ny + 0.5;
          ddx += dx;
          ddy += dy;
          n++;
        }
      const xs = tiles.map((t) => t[0]), ys = tiles.map((t) => t[1]);
      const zone = M.zone[M.idx(tiles[0][0], tiles[0][1])];
      const zn = zone >= 0 ? zone : roomZone >= 0 ? roomZone : 0;
      const d = {
        id: M.doors.length, name: 'Overclocker lockdown', cost: 0, tiles, a: zn, b: zn,
        orient: Math.max.apply(null, xs) - Math.min.apply(null, xs) >= Math.max.apply(null, ys) - Math.min.apply(null, ys) ? 'h' : 'v',
        power: false, open: true, openT: 1, lock: true,
      };
      d.rx = Math.min.apply(null, xs) * T;
      d.ry = Math.min.apply(null, ys) * T;
      d.rw = (Math.max.apply(null, xs) + 1) * T - d.rx;
      d.rh = (Math.max.apply(null, ys) + 1) * T - d.ry;
      d.x = d.rx + d.rw / 2;
      d.y = d.ry + d.rh / 2;
      // where zombies gather (one tile further out than the neighbours, if that is open floor)
      const sx = Math.sign(ddx), sy = Math.sign(ddy);
      let gx = n ? ox / n : d.x / T, gy = n ? oy / n : d.y / T;
      if (M.tile(Math.floor(gx + sx), Math.floor(gy + sy)) === M.TT.FLOOR) {
        gx += sx;
        gy += sy;
      }
      d.outside = { x: gx * T, y: gy * T };
      M.doors.push(d);
      R.doors.push(d);
    }
    R.goal = R.doors[0].outside;
  }

  function setLockTiles(closed) {
    const R = M.papRoom;
    for (const d of R.doors) {
      for (const [x, y] of d.tiles) M.tiles[M.idx(x, y)] = closed ? M.TT.DOOR : M.TT.FLOOR;
      d.open = !closed;
      d.openT = closed ? 0 : 0.001;
    }
    M.markDirty();
  }

  /** Is the lockdown spent for the current round? */
  F.lockUsed = function () {
    const R = M.papRoom;
    return !!(R && R.ready && R.state !== 'sealed' && R.round === GW.Director.round);
  };
  /** Line appended to the Overclocker prompt. */
  F.lockNote = function () {
    const R = M.papRoom;
    if (!R || !R.ready || R.state === 'sealed') return '';
    return R.round === GW.Director.round ? ' <span class="dim">lockdown used — next round</span>' : ' <span class="dim">seals the room for ' + LOCK.duration + 's</span>';
  };

  /** Pull an entity standing in a doorway into the room (the nearest room-side tile). */
  function pullInside(p) {
    const R = M.papRoom;
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    if (!R.gateSet.has(M.idx(tx, ty))) return;
    let best = null, bd = Infinity;
    for (let r = 1; r <= 3 && !best; r++)
      for (const [dx, dy] of DIR4) {
        const nx = tx + dx * r, ny = ty + dy * r;
        if (!inRoomTile(R, nx, ny) || M.tile(nx, ny) !== M.TT.FLOOR) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < bd) {
          bd = d;
          best = [nx, ny];
        }
      }
    if (!best) best = [Math.floor(R.cx / T), Math.floor(R.cy / T)];
    p.x = (best[0] + 0.5) * T;
    p.y = (best[1] + 0.5) * T;
    p.vx = p.vy = 0;
  }

  /** Host side: nothing hostile may stay in the room. `kill` at the moment of sealing, else thrown out. */
  function clearRoom(kill) {
    const R = M.papRoom;
    for (const z of GW.Zombies.list.slice()) {
      if (z.dead || !insideRoom(z)) continue;
      if (kill && z.type !== 'boss') {
        GW.Zombies.kill(z, { trap: true, shock: true, dir: Math.atan2(z.y - R.cy, z.x - R.cx) });
        continue;
      }
      FX.burst(z.x, z.y, 12, LOCK.color, 240);
      z.x = R.goal.x + U.rand(-10, 10);
      z.y = R.goal.y + U.rand(-10, 10);
      z.kx = z.ky = 0;
      z.stun = Math.max(z.stun || 0, 1);
      if (z.state === 'attack') z.state = 'chase';
      M.resolveCircle(z, z.r, M.solidForZombie);
    }
  }

  function lockSeal(round) {
    const R = M.papRoom;
    if (!R || !R.ready || R.state === 'sealed') return false;
    R.state = 'sealed';
    R.t = LOCK.duration;
    R.warned = false;
    R.round = round;
    R.bangT = 0;
    const P = GW.Player;
    if (P.alive && !serverMode()) pullInside(P);
    setLockTiles(true);
    if (!isGuest()) clearRoom(true);
    for (const d of R.doors) {
      d.cost = LOCK.duration;
      FX.burst(d.x, d.y, 18, LOCK.color, 280);
    }
    A.play('shutter', {});
    FX.shake(6);
    FX.light(R.cx, R.cy, 420, LOCK.color, 0.6);
    if (!serverMode() && insideRoom(P)) GW.Game.announce('OVERCLOCK LOCKDOWN', 'Doors sealed for ' + LOCK.duration + ' seconds — take your time', LOCK.color);
    else GW.Game.announce('OVERCLOCK LOCKDOWN', 'The Overclocker room is sealed for ' + LOCK.duration + ' seconds', LOCK.color);
    return true;
  }

  function lockOpen() {
    const R = M.papRoom, P = GW.Player;
    R.state = 'open';
    R.t = 0;
    setLockTiles(false);
    A.play('shutter', {});
    // the shutters blow outward: whatever waited at a doorway is thrown back and dazed
    for (const d of R.doors) {
      const o = { x: d.x, y: d.y };
      if (!isGuest()) {
        for (const z of GW.Zombies.list) {
          if (z.dead || z.state === 'breach') continue;
          const dd = U.dist(o.x, o.y, z.x, z.y);
          if (dd > LOCK.blastR || !M.los(o.x, o.y, z.x, z.y, M.blocksBullet)) continue;
          const a = Math.atan2(z.y - o.y, z.x - o.x), f = 1 - dd / LOCK.blastR;
          z.kx += Math.cos(a) * (300 + 650 * f);
          z.ky += Math.sin(a) * (300 + 650 * f);
          z.dazeT = Math.max(z.dazeT || 0, LOCK.daze);
          if (z.state === 'attack') z.state = 'chase';
          z.attackCd = Math.max(z.attackCd, LOCK.daze);
        }
      }
      FX.ring(o.x, o.y, LOCK.blastR, LOCK.color, 0.55, 7);
      FX.light(o.x, o.y, LOCK.blastR * 1.4, LOCK.color, 0.5);
      FX.burst(o.x, o.y, 30, LOCK.color, 460);
      A.play('shockwave', { x: o.x, y: o.y });
    }
    if (P.alive && insideRoom(P)) P.invuln = Math.max(P.invuln, 1.2);
    FX.shake(10);
    GW.Game.announce('DOORS OPEN', 'Lockdown over — the horde was thrown back', '#ff3b4e');
  }

  function updateLock(dt) {
    const R = M.papRoom;
    if (!R || !R.ready || R.state !== 'sealed') return;
    R.t -= dt;
    const secs = Math.max(0, Math.ceil(R.t));
    for (const d of R.doors) d.cost = secs; // the shutters show the countdown above them
    if (!isGuest()) clearRoom(false);
    if (!R.warned && R.t <= LOCK.warn) {
      R.warned = true;
      A.play('siren');
      GW.Game.announce('DOORS OPENING', 'Lockdown ends in ' + LOCK.warn + ' seconds — get ready', '#ff3b4e');
    }
    // the horde hammers on the shutters; the room hums
    R.bangT -= dt;
    if (R.bangT <= 0) {
      R.bangT = U.rand(0.4, 0.9);
      for (const d of R.doors) {
        if (!GW.Zombies.list.some((z) => U.dist(z.x, z.y, d.outside.x, d.outside.y) < 90)) continue;
        A.play('bang', { x: d.x, y: d.y });
        FX.sparks(U.rand(d.rx, d.rx + d.rw), U.rand(d.ry, d.ry + d.rh), Math.atan2(R.cy - d.y, R.cx - d.x), 3, '#ffd68a', 160);
      }
      FX.light(R.cx, R.cy, 300, R.warned ? '#ff3b4e' : LOCK.color, 0.25);
    }
    if (R.t <= 0) lockOpen();
  }

  /** Interact: the Overclocker was just paid for. Seals the room if this round's lockdown is unused. */
  F.onOverclock = function () {
    const R = M.papRoom;
    if (!R || !R.ready || R.state === 'sealed') return;
    const round = GW.Director.round;
    if (R.round === round) {
      GW.Game.announce('OVERCLOCKING', 'Lockdown used — next round', '#ffb14d');
      return;
    }
    if (lockSeal(round) && GW.Net) GW.Net.emit('lock', { r: round });
  };

  /** Co-op: a teammate (or the server copy, for everyone) triggered the lockdown. */
  F.lockRemote = function (m) {
    lockSeal(m && typeof m.r === 'number' ? m.r : GW.Director.round);
  };

  /* ------------------------------------------------------------------ */
  /* interactables                                                      */
  /* ------------------------------------------------------------------ */
  F.buildInteractables = function (list, ui) {
    const { key, cost, ok, info, wallDist } = ui;
    const I = GW.Interact;
    setupLock();

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
          return ok('Press ' + key('F') + ' to activate the ' + def.name + (tr.hint ? ' <span class="dim">' + tr.hint + '</span>' : '') + ' ' + cost(C.TRAP.cost));
        },
        use() {
          if (!I.powered(tr.zone) || tr.state !== 'idle' || !GW.Game.spend(C.TRAP.cost)) return;
          activateTrap(tr);
          if (GW.Net) GW.Net.emit('trap', { i: M.traps.indexOf(tr) });
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
        if (GW.Net) GW.Net.emit('seal', {});
      },
    });

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

  /** Co-op: a teammate switched a trap on. */
  F.activateTrapAt = function (i) {
    const tr = M.traps[i];
    if (tr && tr.state === 'idle') activateTrap(tr);
  };

  /** Co-op: a teammate sealed the panic room (they are inside; we are not pulled in). */
  F.sealRemote = function () {
    const S = M.safeRoom;
    if (S.state === 'sealed') return;
    seal({ x: S.rx + S.rw / 2, y: S.ry + S.rh / 2, r: 1 });
  };

  F.update = function (dt) {
    const P = GW.Player;
    if (F.palCd > 0) F.palCd -= dt;
    for (const tr of M.traps) updateTrap(tr, dt, P);
    updateSafe(dt);
    updateLock(dt);
  };
})();
