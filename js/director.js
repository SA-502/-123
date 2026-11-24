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
    D.boss = false;
    D.bossSpawned = false;
    D.bossT = 0;
    D.specialCount = 0;
    D.nextSpecial = U.randInt(5, 7);
    D.brutes = 0;
    D.brutesSpawned = 0;
    D.dropsThisRound = 0;
    D.sinceDrop = 0;
    D.dropCd = 0;
    D.droppedKinds = {};
    D.lastDrop = '';
    D.plankPts = 0;
    D.maxAlive = C.MAX_ALIVE;
  };

  function begin(r) {
    D.round = r;
    D.state = 'active';
    D.health = GW.Rounds.health(r);
    D.special = r === D.nextSpecial;
    D.boss = r % 10 === 0;
    if (D.boss && D.special) {
      D.special = false; // the boss takes the stage; the blackout waits a round
      D.nextSpecial = r + 1;
    }
    D.bossSpawned = false;
    D.bossT = 3.5;
    D.dropsThisRound = 0;
    D.droppedKinds = {};
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
    } else if (D.boss) {
      D.total = 8 + Math.floor(r / 2);
      D.spawnDelay = 2.2;
      D.maxAlive = 12;
      D.brutes = 0;
    } else {
      D.total = GW.Rounds.count(r);
      D.spawnDelay = GW.Rounds.spawnDelay(r);
      D.maxAlive = C.MAX_ALIVE;
      D.brutes = r >= 8 ? Math.min(3, 1 + Math.floor((r - 8) / 5)) : 0;
    }
    // a bigger team faces a bigger horde
    const team = GW.Net && GW.Net.active ? 1 + GW.Net.remotes.size : 1;
    if (team > 1) {
      D.total = Math.round(D.total * (1 + 0.5 * (team - 1)));
      D.maxAlive = Math.min(C.MAX_ALIVE + 8, Math.round(D.maxAlive * (1 + 0.2 * (team - 1))));
      D.spawnDelay *= 1 / (1 + 0.25 * (team - 1));
    }
    D.toSpawn = D.total;
    D.spawnT = 1.6;
    D.beginFx(r);
  }

  /** Sounds and banners for a new round (co-op guests replay these from the host's snapshot). */
  D.beginFx = function (r) {
    if (D.special) {
      A.play('special');
      GW.Game.announce('LIGHTS OUT', 'Shriekers are loose on the pier', '#35f0ff');
    } else if (D.boss) {
      A.play('special');
      GW.Game.announce('BOSS ROUND', 'The Headliner takes the stage', '#ff3b4e');
    } else {
      A.play('roundStart');
      if (r === 8) GW.Game.announce('ROUND ' + r, 'Something big is coming', '#ff3b4e');
    }
    GW.HUD.roundChange(r, D.special);
    if (GW.Net && GW.Net.active) GW.Net.onRoundStart(r);
  };

  function end() {
    D.state = 'intermission';
    D.timer = 9;
    D.endFx();
  }

  D.endFx = function () {
    const P = GW.Player;
    P.grenades = Math.min(C.PLAYER.grenadesMax, P.grenades + 2);
    if (P.tactical.type) P.tactical.count = Math.min(GW.TACTICALS[P.tactical.type].max, P.tactical.count + 1);
    P.stats.round = D.round;
    A.play('roundEnd');
    GW.HUD.roundOver();
  };

  /** Choose where the next zombie comes from: open-zone windows and risers, biased toward the player. */
  D.pickSpawn = function () {
    const P = GW.Net && GW.Net.isHost && GW.Net.remotes.size ? GW.Net.focus() : GW.Player;
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
    const P = GW.Net && GW.Net.isHost && GW.Net.remotes.size ? GW.Net.focus() : GW.Player;
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
    // pick a type from the round's mix, respecting how many of each special may be alive at once
    const caps = C.ZOMBIE.caps;
    const pick = U.weighted(GW.Rounds.mix(D.round), (e) => (caps[e[0]] && GW.Zombies.count(e[0]) >= caps[e[0]] ? 0 : e[1]));
    const type = pick ? pick[0] : 'walker';
    GW.Zombies.spawn(type, spot, D.health, GW.Rounds.speedClass(D.round));
    return true;
  }

  D.update = function (dt) {
    for (const r of M.risers) if (r.cool > 0) r.cool -= dt;
    if (D.dropCd > 0) D.dropCd -= dt;
    if (D.state === 'intermission') {
      D.timer -= dt;
      if (D.timer <= 0) begin(D.round + 1);
      return;
    }
    D.spawnT -= dt;
    if (D.boss) {
      if (!D.bossSpawned) {
        D.bossT -= dt;
        if (D.bossT <= 0) D.bossSpawned = !!GW.Boss.spawn(D.round);
      } else if (GW.Boss.ref && D.toSpawn <= 0) {
        D.toSpawn = 3; // the supporting cast keeps coming while the boss stands
        D.spawnT = Math.max(D.spawnT, 3);
      }
    }
    if (D.toSpawn > 0 && D.spawnT <= 0 && GW.Zombies.list.length < D.maxAlive) {
      if (spawnOne()) {
        D.toSpawn--;
        D.spawned++;
        D.spawnT = D.spawnDelay;
      } else {
        D.spawnT = 0.3;
      }
    }
    if (D.toSpawn <= 0 && GW.Zombies.list.length === 0 && (!D.boss || D.bossSpawned)) end();
  };

  /** Zombies left this round (alive + yet to spawn). */
  D.remaining = function () {
    return D.state === 'active' ? D.toSpawn + GW.Zombies.list.length : 0;
  };

  /*
   * Power-up drops: rare and spread out. At most CFG.DROPS.maxPerRound a round, a cooldown (seconds
   * and kills) between two drops, never the same power-up twice in a row, never a timed power-up
   * (Overkill, Double Score) twice in one round or while it is still running. Purge and Overkill
   * are the rarest. A pity counter guarantees one every `pity` kills if luck runs dry.
   */
  const DROP_TABLE = [['ammo', 1], ['double', 0.8], ['carpenter', 0.6], ['instakill', 0.45], ['nuke', 0.3], ['pal', 0.35]];

  D.dropWeight = function (id, w) {
    const T = GW.Game.timers || {};
    if (id === D.lastDrop) return 0;
    if (GW.POWERUPS[id].timed && (D.droppedKinds[id] || T[id] > 0)) return 0;
    if (id === 'nuke' && D.droppedKinds.nuke) return 0;
    if (id === 'carpenter' && !M.windows.some((x) => x.planks < 6 && M.zones[x.zone].open)) return 0;
    return w;
  };

  D.onKill = function (z, info, pos) {
    D.sinceDrop++;
    const P = GW.Player, DR = C.DROPS;
    const lastOne = D.state === 'active' && D.toSpawn <= 0 && GW.Zombies.list.length === 0;
    if (D.special && lastOne) {
      // surviving a special round always pays out a full reload
      GW.Interact.spawnPowerup('ammo', pos ? pos.x : P.x, pos ? pos.y : P.y);
      return;
    }
    if (!pos || info.nuke || info.silent || D.dropsThisRound >= DR.maxPerRound) return;
    if (D.dropCd > 0 || D.sinceDrop < DR.minKills) return;
    if (Math.random() < DR.chance || D.sinceDrop >= DR.pity) {
      const pick = U.weighted(DROP_TABLE, (e) => D.dropWeight(e[0], e[1]));
      if (!pick) return;
      GW.Interact.spawnPowerup(pick[0], pos.x, pos.y);
      D.dropsThisRound++;
      D.droppedKinds[pick[0]] = true;
      D.lastDrop = pick[0];
      D.sinceDrop = 0;
      D.dropCd = DR.cooldown;
    }
  };
})();
