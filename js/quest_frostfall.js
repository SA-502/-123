/*
 * GRAVEWAVE — Frostfall Junction side quests (js/map_frostfall.js fills in M.quest).
 *
 * THE THREE RELICS: three weapon parts (Cryo Core, Coil Barrel, Frost Stock) lie at random spots each
 * game, each marked only by a faint glint. Pick them up (the team shares them), mount them on the
 * workbench in the Boiler House, and after a short forge everyone can take the FROSTBITE: an
 * overclocked Quasar with the Frost mod, free.
 *
 * THE SIGNAL LAMPS: three dead brass signal lamps hang under the walls (Market Street, the far end of
 * Platform 1, the Frozen Lake's north shore). Shoot all three and the whole team earns PACK MULE:
 * carry three weapons (switch with Q / the swap button / key 3).
 *
 * The notice board in the concourse hints at both. Co-op: every step is sent as { t: 'quest', a, i }
 * and applied by everyone (net.js); the server copy of the game runs the same code without drawing.
 * Hooks: Interact.reset -> Q.reset, Game.update -> Q.update, Interact.objective -> Q.objective,
 * net.js 'quest' -> Q.remote.
 */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio, In = GW.Input, T = C.TILE;
  const Q = (GW.Quest = { on: false });

  const REWARD = { weapon: 'quasar', tier: 1, mod: 'frost', name: 'Frostbite', color: '#8fe9ff' };
  const FORGE = 8; // seconds the workbench takes once all three relics are on it
  const ICE = '#8fe9ff', GOLD = '#ffd68a';

  const drawing = () => typeof document !== 'undefined' && !!document.createElement && !(GW.Net && GW.Net.serverMode);
  const emit = (a, i) => GW.Net && GW.Net.emit('quest', { a, i });
  const announce = (a, b, c) => GW.Game.announce(a, b, c);

  /* ------------------------------------------------------------------ */
  /* state                                                               */
  /* ------------------------------------------------------------------ */
  Q.reset = function (list, ui) {
    const D = M.quest;
    Q.on = !!(D && D.map === M.activeMap);
    const P = GW.Player;
    P.mule = false;
    if (!Q.on) return;
    Q.relics = D.relics.map((r) => Object.assign({}, r, { x: (r.tx + 0.5) * T, y: (r.ty + 0.5) * T, taken: false, glintT: Math.random() * 2 }));
    Q.lamps = D.lamps.map((l, i) => Object.assign({}, l, { id: i, x: (l.tx + 0.5) * T, y: l.ty * T + 14, lit: false }));
    Q.bench = Object.assign({}, D.bench, { x: (D.bench.tx + D.bench.w / 2) * T, y: (D.bench.ty + D.bench.h / 2) * T });
    Q.mounted = 0; // relics on the workbench
    Q.state = 'parts'; // parts -> forging -> ready
    Q.forgeT = 0;
    Q.claimed = false; // this player took their Frostbite
    Q.mule = false;
    Q.shots = P.stats ? P.stats.shots : 0;
    Q.snowT = 0;
    Q.artV = -1;
    Q.lights = [];
    for (const r of Q.relics) addLight(r, 64, r.color);
    paintAll();
    build(list, ui);
  };

  function addLight(o, r, color) {
    const L = { x: o.x, y: o.y, r, color, zone: M.zone[M.idx(Math.floor(o.x / T), Math.floor(o.y / T))], always: true, phase: Math.random() * 10 };
    o.light = L;
    M.lights.push(L);
  }
  function dropLight(o) {
    const i = M.lights.indexOf(o.light);
    if (i >= 0) M.lights.splice(i, 1);
    o.light = null;
  }

  /* ------------------------------------------------------------------ */
  /* interactables                                                       */
  /* ------------------------------------------------------------------ */
  function build(list, ui) {
    const { key, ok, info, wallDist } = ui;
    const D = M.quest;
    // the notice board
    const nb = D.notice;
    nb.x = (nb.tx + 0.5) * T;
    nb.y = (nb.ty + 0.5) * T;
    list.push({
      kind: 'notice', ref: nb,
      dist: wallDist(nb),
      prompt: () => ok('Press ' + key('F') + ' to read the station notice'),
      use() {
        const left = Q.relics.filter((r) => !r.taken).length, lamps = Q.lamps.filter((l) => !l.lit).length;
        A.play('swap');
        if (Q.state === 'parts' && Q.mounted < 3)
          announce('STATION NOTICE', 'Three relics glint in the snow · bring them to the Boiler House workbench · ' + (3 - left) + '/3', GOLD);
        else announce('STATION NOTICE', lamps ? 'Three dead signal lamps hang under the eaves · light them with a bullet · ' + (3 - lamps) + '/3' : 'The station has no more secrets', GOLD);
      },
    });
    // the relics
    Q.relics.forEach((r, i) => {
      list.push({
        kind: 'relic', ref: r,
        dist: (p) => (r.taken ? Infinity : Math.max(0, U.dist(p.x, p.y, r.x, r.y) - 22)),
        prompt: () => (r.taken ? null : ok('Press ' + key('F') + ' to pick up the ' + r.name)),
        use() {
          if (r.taken) return;
          takeRelic(i);
          emit('relic', i);
        },
      });
    });
    // the workbench
    const b = Q.bench;
    list.push({
      kind: 'bench', ref: b,
      dist: (p) => U.rectDist(p.x, p.y, b.tx * T, b.ty * T, b.w * T, b.h * T),
      prompt(p) {
        const carried = Q.relics.filter((r) => r.taken).length - Q.mounted;
        if (Q.state === 'forging') return info('Forging the Frostbite… ' + Math.ceil(Q.forgeT) + 's');
        if (Q.state === 'ready') return Q.claimed ? info('Workbench · you already took your Frostbite') : ok('Press ' + key('F') + ' to take the Frostbite <span class="dim">free overclocked wonder weapon</span>');
        if (carried > 0) return ok('Press ' + key('F') + ' to mount your relics on the workbench (' + Q.mounted + '/3)');
        return info('Workbench · relics mounted: ' + Q.mounted + '/3');
      },
      use(p) {
        if (Q.state === 'ready') {
          if (Q.claimed) return;
          Q.claimed = true;
          giveReward(p);
          return;
        }
        if (Q.state !== 'parts') return;
        const n = Q.relics.filter((r) => r.taken).length;
        if (n <= Q.mounted) return;
        mount(n);
        emit('mount', n);
      },
    });
  }

  function takeRelic(i) {
    const r = Q.relics[i];
    if (!r || r.taken) return;
    r.taken = true;
    dropLight(r);
    paintRelic(r);
    const n = Q.relics.filter((x) => x.taken).length;
    A.play('fusePickup', { x: r.x, y: r.y });
    FX.burst(r.x, r.y, 18, r.color, 240);
    FX.ring(r.x, r.y, 50, r.color, 0.45, 3);
    FX.popup(r.x, r.y - 20, r.name.toUpperCase() + ' ' + n + '/3', r.color, 14, 1.4);
    announce('RELIC FOUND ' + n + '/3', n < 3 ? 'Find the rest, then visit the Boiler House workbench' : 'All three! Take them to the Boiler House workbench', r.color);
  }

  function mount(n) {
    if (n <= Q.mounted) return;
    Q.mounted = Math.min(3, n);
    A.play('purchase');
    FX.burst(Q.bench.x, Q.bench.y, 16, GOLD, 220);
    if (Q.mounted >= 3) {
      Q.state = 'forging';
      Q.forgeT = FORGE;
      A.play('papWork');
      announce('THE FORGE IS LIT', 'The relics are fusing · the Frostbite will be ready in ' + FORGE + ' seconds', ICE);
    } else announce('RELICS MOUNTED ' + Q.mounted + '/3', 'The workbench needs more relics', GOLD);
    paintBench();
  }

  function giveReward(p) {
    const Wp = GW.Weapons;
    const w = Wp.create(REWARD.weapon);
    for (let i = 0; i < REWARD.tier; i++) Wp.upgrade(w);
    w.mod = REWARD.mod;
    w.s.mod = REWARD.mod;
    w.s.name = REWARD.name;
    if (p.hasWeapon(w.id) >= 0) p.weapons.splice(p.hasWeapon(w.id), 1); // replace a crate Quasar
    p.giveInstance(w);
    if (Wp.celebrate) Wp.celebrate(p, w);
    A.play('tierUp', { tier: 2 });
    announce('FROSTBITE', 'Assembled from the three relics · overclocked, frost rounds', ICE);
    paintBench();
  }

  /* ------------------------------------------------------------------ */
  /* signal lamps: shoot them                                            */
  /* ------------------------------------------------------------------ */
  function lightLamp(i) {
    const l = Q.lamps[i];
    if (!l || l.lit) return;
    l.lit = true;
    addLight(l, 120, '#ffc46b');
    paintLamp(l);
    A.play('generator', { x: l.x, y: l.y });
    FX.burst(l.x, l.y, 14, '#ffc46b', 200);
    FX.light(l.x, l.y, 200, '#ffc46b', 0.6);
    const n = Q.lamps.filter((x) => x.lit).length;
    FX.popup(l.x, l.y - 18, 'SIGNAL ' + n + '/3', '#ffc46b', 14, 1.4);
    if (n >= 3 && !Q.mule) {
      Q.mule = true;
      GW.Player.mule = true;
      A.play('perk', { id: 'quick' });
      announce('PACK MULE', 'All signals green · everyone can now carry three weapons', '#3dff8b');
    } else if (n < 3) announce('SIGNAL LAMP ' + n + '/3', 'Something stirs in the station…', '#ffc46b');
  }

  /** Did this frame's shot(s) hit a lamp? Aim ray from the player, blocked by walls. */
  function checkShots(P) {
    const shots = P.stats ? P.stats.shots : 0;
    if (shots === Q.shots) return;
    Q.shots = shots;
    const w = P.weapon();
    if (!w || w.s.type === 'melee') return;
    const range = w.s.range || 1000, ca = Math.cos(P.angle), sa = Math.sin(P.angle);
    Q.lamps.forEach((l, i) => {
      if (l.lit) return;
      const dx = l.x - P.x, dy = l.y - P.y;
      const along = dx * ca + dy * sa;
      if (along < 0 || along > range) return;
      const off = Math.abs(dx * sa - dy * ca);
      if (off > 20 + (w.s.pellets > 1 ? along * 0.08 : 0)) return;
      if (!M.los(P.x, P.y, l.x, l.y + 6, M.blocksBullet)) return;
      lightLamp(i);
      emit('lamp', i);
    });
  }

  /* ------------------------------------------------------------------ */
  /* per frame                                                           */
  /* ------------------------------------------------------------------ */
  Q.update = function (dt) {
    if (!Q.on) return;
    const P = GW.Player;
    if (drawing() && GW.MapArt.version !== Q.artV) paintAll();
    if (P.alive) checkShots(P);
    if (Q.state === 'forging') {
      Q.forgeT -= dt;
      if (Math.random() < dt * 20) FX.sparks(Q.bench.x + U.rand(-30, 30), Q.bench.y - 8, -Math.PI / 2, 2, Math.random() < 0.5 ? ICE : GOLD, 160, 0.8);
      if (Q.forgeT <= 0) {
        Q.state = 'ready';
        FX.ring(Q.bench.x, Q.bench.y, 120, ICE, 0.6, 6);
        FX.light(Q.bench.x, Q.bench.y, 320, ICE, 0.8);
        A.play('shockwave', { x: Q.bench.x, y: Q.bench.y });
        announce('FROSTBITE FORGED', 'Collect it at the Boiler House workbench · one for every survivor', ICE);
        paintBench();
      }
    }
    if (P.mule && In.hit('Digit3')) P.switchTo(2);
    if (!drawing()) return;
    // faint glints over the relics that are still out there
    for (const r of Q.relics) {
      if (r.taken) continue;
      r.glintT -= dt;
      if (r.glintT <= 0) {
        r.glintT = U.rand(0.9, 2.2);
        if (U.dist(P.x, P.y, r.x, r.y) < 900) FX.sparks(r.x + U.rand(-6, 6), r.y + U.rand(-6, 6), -Math.PI / 2, 2, '#ffffff', 50, 3);
      }
    }
    if (Q.state === 'ready' && !Q.claimed && Math.random() < dt * 3) FX.sparks(Q.bench.x, Q.bench.y - 6, -Math.PI / 2, 2, ICE, 90, 1.2);
    snow(dt);
  };

  /** Light snowfall over the open-air parts of the junction (opaque particles, so the night dims them). */
  function snow(dt) {
    const R = GW.Render;
    if (!R || !R.cam || FX.parts.length > FX.maxParts * 0.6) return;
    Q.snowT += dt * (FX.maxParts >= 700 ? 26 : 12);
    const z = R.cam.zoom || 1, hw = (R.vw || 1280) / z / 2, hh = (R.vh || 720) / z / 2;
    const outdoor = { 1: 1, 2: 1, 3: 1, 6: 1 };
    while (Q.snowT >= 1) {
      Q.snowT--;
      const x = R.cam.x + U.rand(-hw, hw), y = R.cam.y + U.rand(-hh, hh);
      const zn = M.zoneAt(x, y);
      if (zn >= 0 && !outdoor[zn]) continue;
      FX.parts.push({ x, y, vx: U.rand(18, 34), vy: U.rand(26, 48), life: U.rand(1.6, 3), max: 3, size: U.rand(1.6, 3.2), color: Math.random() < 0.5 ? '#e8f0ff' : '#c8d8f0', drag: 0, glow: false });
    }
  }

  /** Co-op: a teammate's step. */
  Q.remote = function (m) {
    if (!Q.on) return;
    if (m.a === 'relic') takeRelic(m.i | 0);
    else if (m.a === 'mount') mount(m.i | 0);
    else if (m.a === 'lamp') lightLamp(m.i | 0);
  };

  /** The HUD objective on this map (null: use the default). */
  Q.objective = function () {
    if (!Q.on) return null;
    const I = GW.Interact, P = GW.Player, z = M.zones;
    const n = I.poweredCount(), total = M.generators.length;
    if (P.fuses > 0) return null;
    if (n === 0 && !z[1].open && !z[2].open && !z[3].open) return 'Earn points, open the station and search for fuses';
    if (n === 0) return 'Search the station for a fuse and power a generator';
    if (!I.powered(M.Z.SUB)) return 'Power the Boiler House to open the Engine Shed (' + n + '/' + total + ')';
    if (!I.everUpgraded && I.powered(M.Z.VAULT)) return 'Overclock a weapon in the Engine Shed [5000]';
    if (n < total) return 'Restore the station: ' + n + '/' + total + ' generators online';
    if (Q.state === 'ready' && !Q.claimed) return 'The Frostbite is ready at the Boiler House workbench';
    if (Q.state === 'parts') {
      const f = Q.relics.filter((r) => r.taken).length;
      if (f > Q.mounted) return 'Mount the relics on the Boiler House workbench (' + f + '/3)';
      if (f > 0) return 'Find the remaining relics (' + f + '/3)';
    }
    return null;
  };

  /* ------------------------------------------------------------------ */
  /* drawing onto the map's floor layer                                  */
  /* ------------------------------------------------------------------ */
  // each painted spot keeps a copy of the clean floor under it, so it can be repainted in a new state
  // (a canvas-to-canvas copy, never getImageData: reading pixels back would slow the big floor layer down)
  function patch(o, x, y, w, h) {
    const floor = GW.MapArt.floor, g = floor.getContext('2d');
    if (!o.clean || o.cleanV !== GW.MapArt.version) {
      o.clean = o.clean || document.createElement('canvas');
      o.clean.width = w;
      o.clean.height = h;
      o.clean.getContext('2d').drawImage(floor, x, y, w, h, 0, 0, w, h);
      o.cleanV = GW.MapArt.version;
    } else {
      g.clearRect(x, y, w, h);
      g.drawImage(o.clean, x, y);
    }
    return g;
  }

  function paintRelic(r) {
    if (!drawing()) return;
    const g = patch(r, r.tx * T, r.ty * T, T, T);
    if (r.taken) return;
    const x = r.x, y = r.y;
    g.save();
    g.translate(x, y);
    g.rotate(U.hash(r.tx, r.ty, 3) * U.TAU);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(-9, -4, 20, 10);
    g.fillStyle = '#5a6270';
    if (r.id === 0) { // cryo core: a glass cell
      g.fillRect(-8, -6, 16, 12);
      g.fillStyle = r.color;
      g.fillRect(-5, -4, 10, 8);
    } else if (r.id === 1) { // coil barrel
      g.fillRect(-11, -3, 22, 6);
      g.fillStyle = r.color;
      for (let k = -8; k < 10; k += 4) g.fillRect(k, -4, 2, 8);
    } else { // frost stock
      g.beginPath(); g.moveTo(-10, -5); g.lineTo(8, -3); g.lineTo(10, 5); g.lineTo(-10, 5); g.closePath(); g.fill();
      g.fillStyle = r.color;
      g.fillRect(-7, -2, 12, 3);
    }
    g.restore();
  }

  function paintLamp(l) {
    if (!drawing()) return;
    const g = patch(l, l.tx * T, l.ty * T, T, T / 2);
    const x = l.x, y = l.ty * T;
    g.save();
    g.fillStyle = '#2a2418';
    g.fillRect(x - 2, y, 4, 8);
    g.fillStyle = l.lit ? '#ffd68a' : '#6e5a34';
    g.beginPath(); g.arc(x, y + 14, 7, 0, U.TAU); g.fill();
    g.strokeStyle = '#3a2c14';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = l.lit ? '#fff4d0' : '#3a3428';
    g.beginPath(); g.arc(x, y + 14, 3, 0, U.TAU); g.fill();
    g.restore();
  }

  function paintBench() {
    if (!drawing()) return;
    const b = Q.bench, x = b.tx * T, y = b.ty * T;
    const g = patch(b, x, y - 4, b.w * T, b.h * T + 8);
    g.save();
    // three cradles; filled ones hold their relic
    for (let i = 0; i < 3; i++) {
      const cx = x + 26 + i * 22, cy = y + T / 2;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(cx - 8, cy - 6, 16, 12);
      if (i < Q.mounted) {
        g.fillStyle = Q.relics[i].color;
        g.fillRect(cx - 6, cy - 4, 12, 8);
      }
    }
    if (Q.state === 'ready' || Q.state === 'forging') {
      g.strokeStyle = ICE;
      g.lineWidth = 2;
      g.strokeRect(x + 14, y + 12, b.w * T - 28, T - 24);
    }
    g.restore();
  }

  function paintAll() {
    if (!drawing() || !GW.MapArt.floor || !GW.MapArt.floor.getContext) return;
    Q.artV = GW.MapArt.version;
    for (const r of Q.relics) paintRelic(r);
    for (const l of Q.lamps) paintLamp(l);
    paintBench();
  }

  /* ------------------------------------------------------------------ */
  /* Pack Mule: a third weapon slot (player.js keeps two by default)      */
  /* ------------------------------------------------------------------ */
  const P = GW.Player;
  if (P && P.giveInstance && !P.giveInstance.muleWrapped) {
    const give0 = P.giveInstance;
    P.giveInstance = function (w) {
      if (P.mule && P.weapons.length === 2) {
        const cur = P.weapon();
        if (cur) cur.reloadT = 0;
        P.weapons.push(w);
        P.cur = 2;
        P.switchT = 0.25;
        A.play('swap');
        return w;
      }
      return give0.call(P, w);
    };
    P.giveInstance.muleWrapped = true;
  }
})();
