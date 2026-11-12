/* GRAVEWAVE — everything you can buy or use: doors, wall-buys, Prize Crate, perks, power, Overclocker, barricades, power-ups */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio, In = GW.Input, T = C.TILE;
  const I = (GW.Interact = { list: [], powerups: [], powerOn: false, powerLevel: 0, box: null, pap: null });
  const RANGE = 42; // max distance from the player's centre to an interactable's bounds

  const key = (k) => '<span class="key">' + k + '</span>';
  const cost = (c) => '<span class="cost' + (GW.Player.points < c ? ' poor' : '') + '">[' + c + ']</span>';
  const ok = (html) => ({ html, ok: true });
  const info = (html) => ({ html: '<span class="dim">' + html + '</span>', ok: false });
  /** Distance function for a wall-mounted item: you must stand in front of it. */
  const wallDist = (spot) => {
    const cx = (spot.tx + 0.5) * T, cy = (spot.ty + 0.5) * T;
    const rx = spot.tx * T - (spot.fy ? T / 2 : 0), ry = spot.ty * T - (spot.fx ? T / 2 : 0);
    const rw = T + (spot.fy ? T : 0), rh = T + (spot.fx ? T : 0);
    return (p) => ((p.x - cx) * spot.fx + (p.y - cy) * spot.fy < T / 2 ? Infinity : U.rectDist(p.x, p.y, rx, ry, rw, rh));
  };
  I.ui = { key, cost, ok, info, wallDist };

  I.reset = function () {
    I.list = [];
    I.powerups = [];
    I.powerOn = false;
    I.powerT = 0;
    I.powerLevel = 0;
    I.current = null;
    I.prompt = null;
    I.holdT = 0;
    I.everUpgraded = false;
    I.box = { spot: U.randInt(0, M.boxSpots.length - 1), state: 'idle', t: 0, uses: 0, final: null, display: null, cycleT: 0, jester: false, anim: 0 };
    I.pap = { state: 'idle', t: 0, weapon: null, anim: 0 };
    build();
    GW.Facilities.buildInteractables(I.list, I.ui);
  };

  /* ------------------------------------------------------------------ */
  /* construction                                                       */
  /* ------------------------------------------------------------------ */
  function build() {
    // --- buyable doors ---
    for (const d of M.doors) {
      if (d.power) {
        I.list.push({
          kind: 'gate', ref: d,
          dist: (p) => U.rectDist(p.x, p.y, d.rx, d.ry, d.rw, d.rh),
          prompt: () => (d.open ? null : info('Sealed — restore the power')),
          use() {},
        });
        continue;
      }
      I.list.push({
        kind: 'door', ref: d,
        dist: (p) => U.rectDist(p.x, p.y, d.rx, d.ry, d.rw, d.rh),
        prompt: () => (d.open ? null : ok('Press ' + key('F') + ' to open the way to ' + d.name + ' ' + cost(d.cost))),
        use(p) {
          if (d.open || !GW.Game.spend(d.cost)) return;
          M.openDoor(d);
          p.stats.doors++;
          A.play('door');
          FX.shake(6);
          for (const [tx, ty] of d.tiles) {
            FX.burst((tx + 0.5) * T, (ty + 0.5) * T, 10, M.zones[d.b].color, 260);
            FX.smoke((tx + 0.5) * T, (ty + 0.5) * T, 2);
          }
        },
      });
    }

    // --- wall-buys ---
    for (const wb of M.wallbuys) {
      const def = GW.WEAPONS[wb.weapon];
      const cx = (wb.tx + 0.5) * T, cy = (wb.ty + 0.5) * T;
      wb.x = cx;
      wb.y = cy;
      wb.def = def;
      const rx = wb.tx * T - (wb.fy ? T / 2 : 0), ry = wb.ty * T - (wb.fx ? T / 2 : 0);
      const rw = T + (wb.fy ? T : 0), rh = T + (wb.fx ? T : 0);
      I.list.push({
        kind: 'wallbuy', ref: wb,
        dist(p) {
          if ((p.x - cx) * wb.fx + (p.y - cy) * wb.fy < T / 2) return Infinity; // must stand in front of it
          return U.rectDist(p.x, p.y, rx, ry, rw, rh);
        },
        prompt(p) {
          const i = p.hasWeapon(wb.weapon);
          if (i < 0) return ok('Press ' + key('F') + ' to buy ' + def.name + ' ' + cost(def.cost));
          const w = p.weapons[i];
          if (w.reserve >= w.s.reserve) return info(w.s.name + ' — ammo full');
          return ok('Press ' + key('F') + ' for ' + w.s.name + ' ammo ' + cost(ammoCost(w)));
        },
        use(p) {
          const i = p.hasWeapon(wb.weapon);
          if (i < 0) {
            if (!GW.Game.spend(def.cost)) return;
            p.giveWeapon(wb.weapon);
          } else {
            const w = p.weapons[i];
            if (w.reserve >= w.s.reserve || !GW.Game.spend(ammoCost(w))) return;
            w.reserve = w.s.reserve;
          }
          FX.burst(cx + wb.fx * 30, cy + wb.fy * 30, 10, '#ffe14d', 200);
        },
      });
    }

    // --- power switch ---
    {
      const ps = M.powerSwitch;
      const cx = (ps.tx + 0.5) * T, cy = (ps.ty + 0.5) * T;
      ps.x = cx;
      ps.y = cy;
      I.list.push({
        kind: 'power', ref: ps,
        dist(p) {
          if ((p.x - cx) * ps.fx + (p.y - cy) * ps.fy < T / 2) return Infinity;
          return U.rectDist(p.x, p.y, ps.tx * T, ps.ty * T, T, T);
        },
        prompt: () => (I.powerOn ? null : ok('Press ' + key('F') + ' to restore the power')),
        use() {
          I.turnOnPower();
        },
      });
    }

    // --- perk machines ---
    for (const s of M.perkSpots) {
      const perk = GW.PERKS[s.perk];
      s.x = (s.tx + 0.5) * T;
      s.y = (s.ty + 0.5) * T;
      I.list.push({
        kind: 'perk', ref: s,
        dist: (p) => U.rectDist(p.x, p.y, s.tx * T, s.ty * T, T, T),
        prompt(p) {
          if (!I.powerOn) return info(perk.name + ' — power required');
          if (p.perks[s.perk]) return info(perk.name + ' — already active');
          if (s.perk === 'wind' && p.windBought >= 3) return info(perk.name + ' — sold out');
          return ok('Press ' + key('F') + ' for ' + perk.name + ' <span class="dim">' + perk.desc + '</span> ' + cost(perk.cost));
        },
        use(p) {
          if (!I.powerOn || p.perks[s.perk]) return;
          if (!GW.Game.spend(perk.cost)) return;
          p.addPerk(s.perk);
          A.play('perk', { id: s.perk });
          FX.ring(p.x, p.y, 70, perk.color, 0.5, 4);
          FX.burst(p.x, p.y, 16, perk.color, 240);
          GW.Game.announce(perk.name, perk.desc, perk.color);
        },
      });
    }

    // --- Prize Crate (mystery box) spots ---
    M.boxSpots.forEach((s, idx) => {
      s.x = (s.tx + s.w / 2) * T;
      s.y = (s.ty + s.h / 2) * T;
      I.list.push({
        kind: 'box', ref: s,
        dist: (p) => U.rectDist(p.x, p.y, s.tx * T, s.ty * T, s.w * T, s.h * T),
        prompt(p) {
          const b = I.box;
          if (idx !== b.spot) return b.state === 'moving' ? null : info('The Prize Crate has moved on');
          if (b.state === 'idle') return ok('Press ' + key('F') + ' to spin the Prize Crate ' + cost(C.COSTS.box));
          if (b.state === 'ready') return ok('Press ' + key('F') + ' to take ' + GW.WEAPONS[b.final].name);
          return null;
        },
        use(p) {
          const b = I.box;
          if (idx !== b.spot) return;
          if (b.state === 'idle') {
            if (!GW.Game.spend(C.COSTS.box)) return;
            b.state = 'rolling';
            b.t = 4.0;
            b.uses++;
            b.cycleT = 0;
            b.final = pickBoxWeapon(p);
            // after a few spins the jester may show up and send the crate elsewhere
            b.jester = b.uses >= 4 && Math.random() < 0.3;
            A.play('boxRoll');
          } else if (b.state === 'ready') {
            p.giveWeapon(b.final);
            b.state = 'idle';
            FX.burst(s.x, s.y, 12, '#ffe14d', 220);
          }
        },
      });
    });

    // --- Overclocker (weapon upgrade machine) ---
    {
      const pm = M.pap;
      pm.x = (pm.tx + pm.w / 2) * T;
      pm.y = (pm.ty + pm.h / 2) * T;
      I.list.push({
        kind: 'pap', ref: pm,
        dist: (p) => U.rectDist(p.x, p.y, pm.tx * T, pm.ty * T, pm.w * T, pm.h * T),
        prompt(p) {
          const k = I.pap;
          if (!I.powerOn) return info('Overclocker — power required');
          if (k.state === 'ready') return ok('Press ' + key('F') + ' to take ' + k.weapon.s.name);
          if (k.state !== 'idle') return null;
          const w = p.weapon();
          if (!w) return info('No weapon to overclock');
          if (w.up) return info(w.s.name + ' is already overclocked');
          return ok('Press ' + key('F') + ' to overclock ' + w.s.name + ' ' + cost(C.COSTS.pap));
        },
        use(p) {
          const k = I.pap;
          if (!I.powerOn) return;
          if (k.state === 'ready') {
            p.giveInstance(k.weapon);
            k.weapon = null;
            k.state = 'idle';
            I.everUpgraded = true;
            FX.burst(pm.x, pm.y - 30, 16, '#ff4fd8', 260);
            return;
          }
          if (k.state !== 'idle') return;
          const w = p.weapon();
          if (!w || w.up || !GW.Game.spend(C.COSTS.pap)) return;
          k.weapon = p.removeCurrent();
          k.state = 'working';
          k.t = 3.4;
          A.play('papWork');
        },
      });
    }

    // --- barricades ---
    for (const w of M.windows) {
      I.list.push({
        kind: 'window', ref: w, hold: true,
        dist: (p) => U.rectDist(p.x, p.y, w.tx * T, w.ty * T, T, T),
        prompt: () => (w.planks >= 6 ? null : ok('Hold ' + key('F') + ' to rebuild the barricade')),
        use() {},
      });
    }
  }

  function ammoCost(w) {
    return w.up ? C.COSTS.upgradedAmmo : Math.max(250, Math.ceil(w.def.cost / 2));
  }

  function pickBoxWeapon(p) {
    const cands = [];
    for (const id in GW.WEAPONS) {
      const def = GW.WEAPONS[id];
      if (def.box > 0 && p.hasWeapon(id) < 0 && !(I.pap.weapon && I.pap.weapon.id === id)) cands.push(def);
    }
    const pick = U.weighted(cands, (d) => d.box);
    return pick ? pick.id : 'ranger';
  }

  /* ------------------------------------------------------------------ */
  /* power                                                              */
  /* ------------------------------------------------------------------ */
  I.turnOnPower = function () {
    if (I.powerOn) return;
    I.powerOn = true;
    I.powerT = 0;
    M.openDoor(M.gate);
    A.play('power');
    A.setPower(true);
    FX.flash = 0.35;
    FX.shake(9);
    GW.Game.announce('POWER RESTORED', 'Perk machines online · Overclock Stage unlocked', '#c8ff3a');
  };

  /* ------------------------------------------------------------------ */
  /* power-ups                                                          */
  /* ------------------------------------------------------------------ */
  I.spawnPowerup = function (type, x, y) {
    I.powerups.push({ type, x, y, life: C.POWERUP_LIFE, t: 0 });
    A.play('powerupDrop', { x, y });
    FX.ring(x, y, 50, GW.POWERUPS[type].color, 0.5, 3);
  };

  function applyPowerup(type, P) {
    const def = GW.POWERUPS[type];
    const G = GW.Game;
    if (type === 'ammo') {
      for (const w of P.weapons) w.reserve = w.s.reserve;
      P.grenades = C.PLAYER.grenadesMax;
      if (P.tactical.type) P.tactical.count = C.TACTICAL_MAX;
    } else if (type === 'pal') {
      GW.Allies.summonPal(C.PAL.dropDuration);
    } else if (type === 'instakill') {
      G.timers.instakill = C.POWERUP_DURATION;
    } else if (type === 'double') {
      G.timers.double = C.POWERUP_DURATION;
    } else if (type === 'nuke') {
      for (const z of GW.Zombies.list) z.nukeT = U.rand(0.05, 1.1);
      FX.flash = 0.85;
      FX.shake(12);
      A.play('nuke');
      G.addPoints(C.POINTS.nuke, P.x, P.y - 30, {});
    } else if (type === 'carpenter') {
      for (const w of M.windows) w.planks = 6;
      A.play('repair');
      G.addPoints(C.POINTS.carpenter, P.x, P.y - 30, {});
    }
    A.play('powerup');
    FX.ring(P.x, P.y, 90, def.color, 0.5, 4);
    G.announce(def.name, def.sub, def.color);
  }

  /* ------------------------------------------------------------------ */
  /* per-frame update                                                   */
  /* ------------------------------------------------------------------ */
  function updateBox(dt) {
    const b = I.box;
    b.anim += dt;
    if (b.state === 'rolling') {
      b.t -= dt;
      b.cycleT -= dt;
      if (b.cycleT <= 0) {
        const prog = 1 - b.t / 4.0;
        b.cycleT = U.lerp(0.06, 0.34, prog * prog);
        const ids = Object.keys(GW.WEAPONS).filter((id) => GW.WEAPONS[id].box > 0 && id !== b.display);
        b.display = U.pick(ids);
      }
      if (b.t <= 0) {
        if (b.jester) {
          b.state = 'jester';
          b.t = 2.4;
          b.display = null;
          GW.Game.refund(C.COSTS.box);
          A.play('boxJester');
          GW.Game.announce('THE JESTER LAUGHS', 'Points refunded — the Prize Crate is moving', '#ff3b4e');
        } else {
          b.state = 'ready';
          b.t = 10;
          b.display = b.final;
          A.play('boxReady');
        }
      }
    } else if (b.state === 'ready') {
      b.t -= dt;
      if (b.t <= 0) b.state = 'idle';
    } else if (b.state === 'jester') {
      b.t -= dt;
      if (b.t <= 0) {
        b.state = 'moving';
        b.t = 1.4;
      }
    } else if (b.state === 'moving') {
      b.t -= dt;
      if (b.t <= 0) {
        let next = b.spot;
        while (next === b.spot) next = U.randInt(0, M.boxSpots.length - 1);
        b.spot = next;
        b.uses = 0;
        b.state = 'idle';
        const zn = M.zones[M.boxSpots[next].zone];
        GW.Game.announce('PRIZE CRATE RELOCATED', 'Look for the beam over ' + zn.name, '#ffe14d');
      }
    }
  }

  function updatePap(dt) {
    const k = I.pap;
    k.anim += dt;
    if (k.state === 'working') {
      k.t -= dt;
      if (Math.random() < dt * 30) FX.sparks(M.pap.x + U.rand(-40, 40), M.pap.y - 20, -Math.PI / 2, 1, '#ff4fd8', 200, 1.2);
      if (k.t <= 0) {
        GW.Weapons.upgrade(k.weapon);
        k.state = 'ready';
        k.t = 14;
        A.play('papDone');
        FX.light(M.pap.x, M.pap.y, 300, '#ff4fd8', 0.5);
      }
    } else if (k.state === 'ready') {
      k.t -= dt;
      if (k.t <= 0) {
        // not collected in time: the machine keeps it
        k.weapon = null;
        k.state = 'idle';
        A.play('deny');
      }
    }
  }

  function repair(w) {
    if (w.planks >= 6) return;
    w.planks++;
    A.play('repair');
    FX.sparks(w.x + w.dx * 22, w.y + w.dy * 22, Math.atan2(w.dy, w.dx), 4, '#ffe14d', 120);
    const D = GW.Director;
    if (D.plankPts < 200) {
      D.plankPts += C.POINTS.plank;
      GW.Game.addPoints(C.POINTS.plank, w.x + w.dx * 30, w.y + w.dy * 30, { small: true });
    }
  }

  I.update = function (dt) {
    const P = GW.Player;

    // power-on flicker, then steady
    let target = 0;
    if (I.powerOn) {
      I.powerT += dt;
      target = I.powerT < 1.6 ? (Math.random() < I.powerT / 1.6 ? 1 : 0.1) : 1;
    }
    I.powerLevel += (target - I.powerLevel) * Math.min(1, dt * 22);

    for (const d of M.doors) if (d.open && d.openT < 1) d.openT = Math.min(1, d.openT + dt * 1.7);

    updateBox(dt);
    updatePap(dt);

    for (let i = I.powerups.length - 1; i >= 0; i--) {
      const pu = I.powerups[i];
      pu.life -= dt;
      pu.t += dt;
      if (P.alive && U.dist(P.x, P.y, pu.x, pu.y) < P.r + 24) {
        I.powerups.splice(i, 1);
        applyPowerup(pu.type, P);
      } else if (pu.life <= 0) I.powerups.splice(i, 1);
    }

    // nearest usable thing
    let best = null, bd = RANGE, bp = null;
    if (P.alive) {
      for (const it of I.list) {
        const d = it.dist(P);
        if (d > bd) continue;
        const pr = it.prompt(P);
        if (!pr) continue;
        // prefer something actionable over an informational prompt at similar range
        if (best && !pr.ok && bp.ok && d > bd - 12) continue;
        bd = d;
        best = it;
        bp = pr;
      }
    }
    I.current = best;
    I.prompt = bp;

    if (best && best.hold) {
      if (In.down('KeyF') || In.down('KeyE')) {
        I.holdT += dt;
        if (I.holdT >= 0.5) {
          I.holdT = 0;
          repair(best.ref);
        }
      } else I.holdT = 0;
    } else {
      I.holdT = 0;
      if (best && (In.hit('KeyF') || In.hit('KeyE'))) {
        if (bp.ok) best.use(P);
        else GW.Game.deny();
      }
    }
    GW.HUD.setPrompt(bp ? bp.html : '');
  };

  /** One-line current objective for the HUD. */
  I.objective = function () {
    const z = M.zones;
    if (!I.powerOn) {
      if (!z[1].open && !z[2].open && !z[3].open) return 'Earn points and buy a way out of the plaza';
      if (!z[4].open) return 'Find a route down to the Substation';
      return 'Throw the power switch in the Substation';
    }
    if (!I.everUpgraded) return 'Overclock a weapon on the Overclock Stage [5000]';
    return 'Survive';
  };
})();
