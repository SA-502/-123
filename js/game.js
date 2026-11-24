/* GRAVEWAVE — game state machine, economy, main loop, menus */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, M = GW.Map, FX = GW.FX, A = GW.Audio, In = GW.Input;
  const G = (GW.Game = { state: 'menu', timers: { double: 0, instakill: 0 }, time: 0 });
  const $ = (id) => document.getElementById(id);
  const BEST_KEY = 'gravewave.best';
  let lastTs = 0;

  /** Console helpers for testing / cheating: GW.debug.give(5000), GW.debug.power(), GW.debug.god = true */
  GW.debug = {
    god: false,
    give: (n) => G.addPoints(n || 10000, GW.Player.x, GW.Player.y, { raw: true }),
    power: () => GW.Interact.turnOnPower(),
    fuse: (n) => (GW.Player.fuses += n || 1),
    weapon: (id) => GW.Player.giveWeapon(id),
    openAll: () => M.doors.forEach((d) => !d.power && M.openDoor(d)),
    pal: (t) => GW.Allies.summonPal(t || 45),
    sentry: () => (GW.Player.sentryCarried = true),
    tactical: (type) => GW.Gadgets.give(GW.Player, type || 'cryo'),
    armor: () => (GW.Player.armor = GW.CFG.ARMOR.max),
    round: (n) => {
      GW.Zombies.list.slice().forEach((z) => GW.Zombies.kill(z, { silent: true }));
      GW.Director.round = (n || 10) - 1;
      GW.Director.state = 'intermission';
      GW.Director.timer = 0.5;
    },
    spawn: (type, n) => {
      const P = GW.Player;
      for (let i = 0; i < (n || 1); i++) {
        const pt = M.randomFloorNear(P.x, P.y, 200, 420);
        if (pt) GW.Zombies.spawn(type || 'walker', { kind: 'point', x: pt.x, y: pt.y }, GW.Rounds.health(Math.max(1, GW.Director.round)), 'run');
      }
    },
  };

  /* ------------------------------------------------------------------ */
  /* economy + messaging                                                */
  /* ------------------------------------------------------------------ */
  /** Award points. opts: { small (minor popup), crit, raw (ignore Double Score) } */
  G.addPoints = function (n, x, y, opts) {
    opts = opts || {};
    const P = GW.Player;
    if (!opts.raw && G.timers.double > 0) n *= 2;
    P.points += n;
    P.stats.earned += n;
    if (x !== undefined) FX.popup(x, y, '+' + n, opts.crit ? '#ff7a8a' : '#ffe14d', opts.small ? 11 : opts.crit ? 17 : 14);
    if (!opts.small) GW.HUD.scorePop(n);
  };

  /** Try to pay. Plays the register on success and a buzzer on failure. */
  G.spend = function (cost) {
    const P = GW.Player;
    if (P.points < cost) {
      G.deny();
      return false;
    }
    P.points -= cost;
    if (cost > 0) GW.HUD.scorePop(-cost);
    A.play('purchase');
    return true;
  };

  G.refund = function (n) {
    GW.Player.points += n;
    GW.HUD.scorePop(n);
  };

  G.deny = function () {
    A.play('deny');
    GW.HUD.denyPrompt();
  };

  G.announce = function (main, sub, color) {
    GW.HUD.announce(main, sub, color);
  };

  /* ------------------------------------------------------------------ */
  /* state transitions                                                  */
  /* ------------------------------------------------------------------ */
  function show(id, on) {
    $(id).classList.toggle('hidden', !on);
  }

  /** Start a run. `arg` is a co-op seed (a number) so every player builds the same park; button clicks pass an event. */
  G.newGame = function (arg) {
    const N = GW.Net;
    const seed = typeof arg === 'number' ? arg : 0;
    if (!seed && N && (N.active || N.code)) N.endSession(); // a solo run leaves any co-op room
    if (G.modPickOpen) G.closeModPick(null);
    A.init();
    const rnd = Math.random;
    if (seed) Math.random = N.seeded(seed);
    try {
      M.build();
      GW.MapArt.build();
      FX.reset();
      GW.Weapons.reset();
      GW.Gadgets.reset();
      GW.Allies.reset();
      GW.Facilities.reset();
      GW.Zombies.reset();
      GW.Boss.reset();
      GW.Player.reset();
      GW.Interact.reset();
      GW.Director.reset();
    } finally {
      Math.random = rnd;
    }
    GW.HUD.reset();
    G.netPaused = false;
    GW.HUD.perksChanged();
    G.timers.double = 0;
    G.timers.instakill = 0;
    G.time = 0;
    M.computeFlow(GW.Player.x, GW.Player.y);
    A.setPower(false);
    In.clear();
    GW.Render.snap();
    GW.Render.lightsOut = 0;
    G.state = 'playing';
    show('menu', false);
    show('pause', false);
    show('gameover', false);
    GW.HUD.show(true);
    $('game').classList.add('playing');
    const coop = N && N.active;
    $('btn-restart').textContent = coop ? 'LEAVE GAME' : 'RESTART';
    $('btn-again').textContent = coop ? 'BACK TO ROOM' : 'PLAY AGAIN';
    GW.Player.jacket = null;
    if (coop) N.onNewGame();
    else if (M.theme) G.announce(M.theme.name, M.theme.sub, M.theme.accent);
    else G.announce('LUMINA PIER', 'The park is closed. Something is still inside.', '#ff4fd8');
  };

  /**
   * Overclocker: choose the ammo mod from a menu instead of catching it as it cycles.
   * Solo: the world waits while the menu is open. Co-op: the world keeps going but you are shielded.
   */
  G.modPickOpen = false;
  let modPickDone = null;
  G.openModPick = function (done) {
    if (G.modPickOpen || G.state !== 'playing') return;
    modPickDone = done;
    G.modPickOpen = true;
    const box = $('modpick-list');
    box.innerHTML = '';
    for (const id of GW.MOD_ORDER) {
      const md = GW.MODS[id];
      const b = document.createElement('button');
      b.className = 'mod-btn';
      b.style.setProperty('--c', md.color);
      const ic = document.createElement('canvas');
      ic.width = ic.height = 80;
      const g = ic.getContext('2d');
      g.scale(2, 2);
      if (md.icon === 'nuke') GW.Art.powerupIcon(g, 'nuke', 20, 20, 34);
      else GW.Art.gadgetIcon(g, md.icon, 20, 20, 34, md.color);
      b.appendChild(ic);
      const t = document.createElement('b');
      t.textContent = md.name;
      const d = document.createElement('span');
      d.textContent = md.desc;
      b.appendChild(t);
      b.appendChild(d);
      b.addEventListener('click', () => G.closeModPick(id));
      box.appendChild(b);
    }
    show('modpick', true);
    In.clear();
    if (!(GW.Net && GW.Net.active)) G.state = 'modpick';
  };
  G.closeModPick = function (id) {
    if (!G.modPickOpen) return;
    G.modPickOpen = false;
    show('modpick', false);
    if (G.state === 'modpick') G.state = 'playing';
    In.clear();
    const done = modPickDone;
    modPickDone = null;
    if (id && done) done(id);
  };

  G.pause = function () {
    if (G.state !== 'playing') return;
    if (GW.Net && GW.Net.active) {
      // co-op: the menu opens but the world keeps running for everyone else
      if (G.netPaused) return;
      G.netPaused = true;
      show('pause', true);
      $('game').classList.remove('playing');
      In.clear();
      return;
    }
    G.state = 'paused';
    show('pause', true);
    $('game').classList.remove('playing');
    In.clear();
  };

  G.resume = function () {
    if (G.netPaused) {
      G.netPaused = false;
      show('pause', false);
      if (G.state === 'playing') $('game').classList.add('playing');
      In.clear();
      return;
    }
    if (G.state !== 'paused') return;
    A.init();
    G.state = 'playing';
    show('pause', false);
    $('game').classList.add('playing');
    In.clear();
    lastTs = 0;
  };

  G.gameOver = function () {
    if (G.state === 'gameover') return;
    G.state = 'gameover';
    G.netPaused = false;
    show('pause', false);
    const P = GW.Player, D = GW.Director;
    const survived = Math.max(0, D.round - 1);
    A.play('gameOver');
    A.setHorde(0);
    A.setPower(false);
    FX.flash = 0.5;
    $('game').classList.remove('playing');
    GW.HUD.setPrompt('');
    $('announce').classList.remove('show');

    let best = 0;
    try {
      best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
      if (D.round > best) localStorage.setItem(BEST_KEY, String(D.round));
    } catch (e) {
      /* storage unavailable: skip the high score */
    }
    const acc = P.stats.shots ? Math.round((P.stats.hits / P.stats.shots) * 100) : 0;
    const mins = Math.floor(P.stats.time / 60), secs = Math.floor(P.stats.time % 60);
    $('go-round').textContent = 'You reached round ' + D.round + (D.round > best && best > 0 ? ' — new best!' : survived ? ' · survived ' + survived : '');
    const rows = [
      ['Kills', P.stats.kills], ['Critical kills', P.stats.crits], ['Accuracy', acc + '%'],
      ['Points earned', P.stats.earned], ['Doors opened', P.stats.doors], ['Second Winds used', Math.max(0, P.stats.downs - 1)],
      ['Time survived', mins + ':' + (secs < 10 ? '0' : '') + secs],
    ];
    $('go-stats').innerHTML = rows.map((r) => '<span>' + r[0] + '</span><span>' + r[1] + '</span>').join('');
    setTimeout(() => {
      if (G.state === 'gameover') show('gameover', true);
    }, 1400);
  };

  function showBest() {
    try {
      const best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
      $('best').textContent = best ? 'Best run: round ' + best : '';
    } catch (e) {
      $('best').textContent = '';
    }
  }

  /* ------------------------------------------------------------------ */
  /* simulation                                                         */
  /* ------------------------------------------------------------------ */
  G.update = function (dt) {
    const P = GW.Player, N = GW.Net;
    const guest = N && N.active && N.isGuest; // co-op guests get the horde from the host
    snapshotPositions();
    G.time += dt;
    if (G.timers.double > 0) G.timers.double = Math.max(0, G.timers.double - dt);
    if (G.timers.instakill > 0) G.timers.instakill = Math.max(0, G.timers.instakill - dt);

    P.update(dt);
    if (G.state !== 'playing') return; // player died this step

    if (guest) N.guestWorld(dt);
    else {
      updateFlow();
      GW.Director.update(dt);
      GW.Zombies.update(dt);
      GW.Boss.updateOrbs(dt);
    }
    GW.Weapons.update(dt);
    GW.Gadgets.update(dt);
    GW.Allies.update(dt);
    GW.Facilities.update(dt);
    GW.Interact.update(dt);
    if (!guest) updateFlow(); // a door or shutter may have changed this step
    if (N && N.active) {
      N.update(dt);
      if (G.state !== 'playing') return; // the whole team went down
    }

    // distant-horde ambience swells with the number of zombies nearby
    let nearby = 0;
    for (const z of GW.Zombies.list) if (U.dist(z.x, z.y, P.x, P.y) < 900) nearby++;
    A.setHorde(Math.min(1, nearby / 14));
    FX.update(dt);
    GW.HUD.update(dt);
    In.endFrame();
  };

  /** The horde's main flow field targets the player, or the panic-room shutter while it is sealed. */
  function updateFlow() {
    const N = GW.Net;
    if (N && N.isHost && N.remotes.size && !GW.Facilities.flowGoal()) {
      // co-op: one field that leads every zombie to whichever living player is closest
      const pts = N.players().filter((p) => p.alive);
      if (!pts.length) pts.push(GW.Player);
      let key = '';
      for (const p of pts) key += Math.floor(p.x / GW.CFG.TILE) + ',' + Math.floor(p.y / GW.CFG.TILE) + ';';
      if (M.flowDirty || key !== M.flowKey) {
        M.computeFlowMulti(pts);
        M.flowKey = key;
      }
      return;
    }
    M.flowKey = '';
    const goal = GW.Facilities.flowGoal() || GW.Player;
    const tx = Math.floor(goal.x / GW.CFG.TILE), ty = Math.floor(goal.y / GW.CFG.TILE);
    if (M.flowDirty || tx !== M.flowTx || ty !== M.flowTy) M.computeFlow(goal.x, goal.y);
  }

  /**
   * Main loop: the simulation always advances in fixed 1/60 s steps (stable physics, and the
   * same tick rate the co-op host will use). Rendering runs at the display's refresh rate and
   * draws moving things interpolated between the last two steps, so 60/120/144 Hz screens stay smooth.
   */
  const STEP = 1 / 60;
  let acc = 0;
  G.alpha = 1;
  /** Remember where things were at the start of this step, for render interpolation. */
  function snapshotPositions() {
    const P = GW.Player;
    P.px = P.x;
    P.py = P.y;
    for (const z of GW.Zombies.list) {
      z.px = z.x;
      z.py = z.y;
      z.pa = z.angle;
    }
    if (GW.Net && GW.Net.active)
      for (const rp of GW.Net.remotes.values()) {
        rp.px = rp.x;
        rp.py = rp.y;
      }
    const AL = GW.Allies;
    if (AL.pal) {
      AL.pal.px = AL.pal.x;
      AL.pal.py = AL.pal.y;
    }
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    let dt = lastTs ? (ts - lastTs) / 1000 : STEP;
    lastTs = ts;
    if (dt > 0.1) dt = 0.1; // tab was hidden; don't fast-forward
    const t0 = performance.now();
    if (G.state === 'playing') {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && G.state === 'playing') {
        G.update(STEP);
        acc -= STEP;
        if (++steps >= 6) {
          acc = 0; // far behind (slow device or a hitch): drop time rather than spiral
          break;
        }
      }
      G.alpha = U.clamp(acc / STEP, 0, 1);
    } else {
      acc = 0;
      G.alpha = 1;
      if (G.state === 'gameover') {
        FX.update(dt);
        GW.HUD.update(dt);
      }
      In.endFrame();
    }
    const t1 = performance.now();
    GW.Render.draw(dt);
    const t2 = performance.now();
    GW.Perf.frame(dt, t1 - t0, t2 - t1, G.state === 'playing');
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                               */
  /* ------------------------------------------------------------------ */
  function boot() {
    const canvas = $('view');
    In.init(canvas);
    GW.Touch.init();
    GW.HUD.init();
    M.build();
    GW.MapArt.build();
    GW.Interact.reset();
    GW.Director.reset();
    GW.Render.init(canvas);
    showBest();

    function syncMapBtns() {
      const bL = $('map-lumina'), bG = $('map-gemini');
      if (bL) bL.classList.toggle('on', M.activeMap !== 'gemini');
      if (bG) bG.classList.toggle('on', M.activeMap === 'gemini');
      const sub = document.querySelector('#menu .subtitle');
      if (sub) sub.textContent = M.activeMap === 'gemini' ? 'DUSTLINE OUTPOST · DESERT COMPOUND' : 'LAST NIGHT AT LUMINA PIER';
    }
    function pickMap(id) {
      M.activeMap = id;
      try { localStorage.setItem('gravewave.map', id); } catch (_) {}
      M.build();
      GW.MapArt.build();
      GW.Interact.reset();
      syncMapBtns();
    }
    if ($('map-lumina')) $('map-lumina').addEventListener('click', () => pickMap('lumina'));
    if ($('map-gemini')) $('map-gemini').addEventListener('click', () => pickMap('gemini'));
    syncMapBtns();
    $('btn-start').addEventListener('click', G.newGame);
    const coop = () => GW.Net && GW.Net.active;
    $('btn-again').addEventListener('click', () => (coop() ? GW.Net.again() : G.newGame()));
    $('btn-restart').addEventListener('click', () => (coop() ? GW.Net.leave() : G.newGame()));
    $('btn-resume').addEventListener('click', G.resume);
    $('vol-music').addEventListener('input', (e) => A.setMusicVol(e.target.value / 100));
    $('vol-sfx').addEventListener('input', (e) => A.setSfxVol(e.target.value / 100));
    $('opt-fps').checked = GW.Perf.show;
    $('opt-fps').addEventListener('change', (e) => GW.Perf.toggle(e.target.checked));
    GW.Perf.toggle(GW.Perf.show);
    // any click wakes the audio context (browsers require a user gesture)
    // (iPhone counts only touchend / click / keys as a real tap for sound, not touchstart or pointerdown)
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown'])
      window.addEventListener(ev, () => A.init(), { passive: true, capture: true });
    // coming back to the game (from another app, a call, the lock screen) wakes the sound again on the next tap
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && A.ctx && A.ctx.state !== 'running') A.ctx.resume().catch(() => {});
    });

    In.onKey = function (code) {
      if (G.modPickOpen) {
        // keys 1-4 pick a mod, Esc closes without choosing (the weapon waits in the machine)
        const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[code];
        if (n !== undefined) G.closeModPick(GW.MOD_ORDER[n]);
        else if (code === 'Escape') G.closeModPick(null);
        return;
      }
      if (code === 'Escape' || code === 'KeyP') {
        if (G.netPaused || G.state === 'paused') G.resume();
        else if (G.state === 'playing') G.pause();
      } else if (code === 'Tab') {
        if (G.state === 'playing') GW.HUD.toggleBigMap();
      } else if (code === 'F3' || code === 'Backquote') {
        GW.Perf.toggle();
      } else if (code === 'KeyM') {
        const on = A.toggleMusic();
        if (G.state === 'playing') G.announce(on ? 'MUSIC ON' : 'MUSIC OFF', '', '#19f0ff');
      } else if ((code === 'Enter' || code === 'Space') && ((G.state === 'menu' && !$('menu').classList.contains('hidden')) || (G.state === 'gameover' && !$('gameover').classList.contains('hidden')))) {
        if (G.state === 'gameover' && GW.Net && GW.Net.active) GW.Net.again();
        else G.newGame();
      }
    };
    window.addEventListener('blur', () => G.pause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) G.pause();
    });

    requestAnimationFrame(frame);

    // the neon signs are baked into the map art: redo them once the site's own fonts have arrived
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('900 16px Orbitron'), document.fonts.load('400 20px Monoton')])
        .then(() => {
          if (G.state === 'menu') GW.MapArt.build();
        })
        .catch(() => {});
    }

    // installable app + offline play (needs https, or localhost while developing)
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // optional art from the art agent: apply it as soon as it arrives (the game never waits for it)
    GW.Assets.load().then((n) => {
      if (!n) return;
      const bg = GW.Assets.get('title_bg'), logo = GW.Assets.get('logo');
      if (bg) {
        $('menu').style.backgroundImage = 'linear-gradient(180deg, rgba(4,2,12,0.55), rgba(20,4,36,0.25) 45%, rgba(4,2,12,0.85)), url(' + bg.src + ')';
        $('menu').style.backgroundSize = 'cover';
        $('menu').style.backgroundPosition = 'center';
      }
      if (logo) {
        const img = document.createElement('img');
        img.src = logo.src;
        img.alt = 'GRAVEWAVE';
        img.className = 'logo-img';
        const wrap = document.querySelector('.title-wrap');
        wrap.querySelector('.title').classList.add('hidden');
        wrap.querySelector('.title-sun').classList.add('hidden');
        wrap.insertBefore(img, wrap.firstChild);
      }
      // rebuild the map layers with the delivered textures, if no game is running yet
      if (G.state === 'menu') GW.MapArt.build();
      GW.HUD.perksChanged();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
