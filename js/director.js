/* GRAVEWAVE — round director: wave pacing, spawn selection, special rounds, power-up drops */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio;
  const D = (GW.Director = {});

  D.reset = function () {
    D.round = 0;
    D.state = 'intermission'; // 'intermission' | 'active'
    D.timer = 4;
    D.total = 0;
    D.toSpawn = 0;
    D.spawned = 0;
    D.spawnT = 0;
    D.spawnDelay = 2;
    D.health = 150;
    D.special = false;
    D.specialCount = 0;
    D.nextSpecial = U.randInt(5, 7);
    D.brutes = 0;
    D.brutesSpawned = 0;
    D.dropsThisRound = 0;
    D.sinceDrop = 0;
    D.plankPts = 0;
    D.maxAlive = C.MAX_ALIVE;
  };

  function begin(r) {
    D.round = r;
    D.state = 'active';
    D.health = GW.Rounds.health(r);
    D.special = r === D.nextSpecial;
    D.dropsThisRound = 0;
    D.plankPts = 0;
    D.spawned = 0;
    D.brutesSpawned = 0;
    if (D.special) {
      D.specialCount++;
      D.nextSpecial = r + U.randInt(4, 5);
      D.total = Math.min(28, 8 + D.specialCount * 4);
      D.spawnDelay = Math.max(0.35, 1.1 - D.specialCount * 0.12);
      D.maxAlive = 12;
      D.brutes = 0;
      A.play('special');
      GW.Game.announce('LIGHTS OUT', 'Shriekers are loose on the pier', '#35f0ff');
    } else {
      D.total = GW.Rounds.count(r);
      D.spawnDelay = GW.Rounds.spawnDelay(r);
      D.maxAlive = C.MAX_ALIVE;
      D.brutes = r >= 8 ? Math.min(3, 1 + Math.floor((r - 8) / 5)) : 0;
      A.play('roundStart');
      if (D.brutes && r === 8) GW.Game.announce('ROUND ' + r, 'Something big is coming', '#ff3b4e');
    }
    D.toSpawn = D.total;
    D.spawnT = 1.6;
    GW.HUD.roundChange(r, D.special);
  }

  function end() {
    D.state = 'intermission';
    D.timer = 9;
    const P = GW.Player;
    P.grenades = Math.min(C.PLAYER.grenadesMax, P.grenades + 2);
    if (P.tactical.type) P.tactical.count = Math.min(GW.TACTICALS[P.tactical.type].max, P.tactical.count + 1);
    P.stats.round = D.round;
    A.play('roundEnd');
    GW.HUD.roundOver();
  }

  /** Choose where the next zombie comes from: open-zone windows and risers, biased toward the player. */
  D.pickSpawn = function () {
    const P = GW.Player;
    const cands = [];
    for (const w of M.windows) {
      if (!M.zones[w.zone].open || w.busy || GW.Gadgets.insideBubble(w.x, w.y, 40)) continue;
      cands.push({ kind: 'window', ref: w, x: w.x, y: w.y, zone: w.zone, d: U.dist(P.x, P.y, w.x, w.y) });
    }
    for (const r of M.risers) {
      if (!M.zones[r.zone].open || r.cool > 0) continue;
      const d = U.dist(P.x, P.y, r.x, r.y);
      if (d < 260 || GW.Gadgets.insideBubble(r.x, r.y, 40)) continue;
      cands.push({ kind: 'riser', ref: r, x: r.x, y: r.y, zone: r.zone, d });
    }
    if (!cands.length) return null;
    const pz = M.zoneAt(P.x, P.y);
    return U.weighted(cands, (c) => ((c.zone === pz ? 3 : 1) * (c.kind === 'riser' ? 0.5 : 1)) / (1 + Math.pow(c.d / 650, 2)));
  };

  function spawnOne() {
    const P = GW.Player;
    if (D.special) {
      // shriekers crash down anywhere near the player
      let pt = M.randomFloorNear(P.x, P.y, 280, 640);
      if (pt && GW.Gadgets.insideBubble(pt.x, pt.y, 40)) pt = null;
      const spot = pt ? { kind: 'point', x: pt.x, y: pt.y } : D.pickSpawn();
      if (!spot) return false;
      if (pt) {
        FX.bolt(pt.x + U.rand(-60, 60), pt.y - 420, pt.x, pt.y, '#35f0ff', 0.3, 4);
        FX.light(pt.x, pt.y, 260, '#35f0ff', 0.35);
        FX.ring(pt.x, pt.y, 60, '#35f0ff', 0.4, 3);
        A.play('lightning', { x: pt.x, y: pt.y });
      }
      GW.Zombies.spawn('shrieker', spot, D.health, 'sprint');
      return true;
    }
    const spot = D.pickSpawn();
    if (!spot) return false;
    // brutes are spaced evenly through the wave
    if (D.brutesSpawned < D.brutes && D.spawned >= Math.floor((D.total * (D.brutesSpawned + 1)) / (D.brutes + 1))) {
      D.brutesSpawned++;
      GW.Zombies.spawn('brute', spot, D.health, 'run');
      return true;
    }
    GW.Zombies.spawn('walker', spot, D.health, GW.Rounds.speedClass(D.round));
    return true;
  }

  D.update = function (dt) {
    for (const r of M.risers) if (r.cool > 0) r.cool -= dt;
    if (D.state === 'intermission') {
      D.timer -= dt;
      if (D.timer <= 0) begin(D.round + 1);
      return;
    }
    D.spawnT -= dt;
    if (D.toSpawn > 0 && D.spawnT <= 0 && GW.Zombies.list.length < D.maxAlive) {
      if (spawnOne()) {
        D.toSpawn--;
        D.spawned++;
        D.spawnT = D.spawnDelay;
      } else {
        D.spawnT = 0.3;
      }
    }
    if (D.toSpawn <= 0 && GW.Zombies.list.length === 0) end();
  };

  /** Zombies left this round (alive + yet to spawn). */
  D.remaining = function () {
    return D.state === 'active' ? D.toSpawn + GW.Zombies.list.length : 0;
  };

  const DROP_TABLE = [['ammo', 1], ['instakill', 1], ['double', 1], ['nuke', 0.8], ['carpenter', 0.7], ['pal', 0.4]];

  D.onKill = function (z, info, pos) {
    D.sinceDrop++;
    const P = GW.Player;
    const lastOne = D.state === 'active' && D.toSpawn <= 0 && GW.Zombies.list.length === 0;
    if (D.special && lastOne) {
      // surviving a special round always pays out a full reload
      GW.Interact.spawnPowerup('ammo', pos ? pos.x : P.x, pos ? pos.y : P.y);
      return;
    }
    if (!pos || info.nuke || D.dropsThisRound >= 4) return;
    if (Math.random() < 0.03 || D.sinceDrop >= 50) {
      const pick = U.weighted(DROP_TABLE, (e) => e[1]);
      GW.Interact.spawnPowerup(pick[0], pos.x, pos.y);
      D.dropsThisRound++;
      D.sinceDrop = 0;
    }
  };
})();
