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

  G.newGame = function () {
    A.init();
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
    GW.HUD.reset();
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
    G.announce('LUMINA PIER', 'The park is closed. Something is still inside.', '#ff4fd8');
  };

  G.pause = function () {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    show('pause', true);
    $('game').classList.remove('playing');
    In.clear();
  };

  G.resume = function () {
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
    const P = GW.Player;
    snapshotPositions();
    G.time += dt;
    if (G.timers.double > 0) G.timers.double = Math.max(0, G.timers.double - dt);
    if (G.timers.instakill > 0) G.timers.instakill = Math.max(0, G.timers.instakill - dt);

    P.update(dt);
    if (G.state !== 'playing') return; // player died this step

    updateFlow();

    GW.Director.update(dt);
    GW.Zombies.update(dt);
    GW.Boss.updateOrbs(dt);
    GW.Weapons.update(dt);
    GW.Gadgets.update(dt);
    GW.Allies.update(dt);
    GW.Facilities.update(dt);
    GW.Interact.update(dt);
    updateFlow(); // a door or shutter may have changed this step

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

    $('btn-start').addEventListener('click', G.newGame);
    $('btn-again').addEventListener('click', G.newGame);
    $('btn-restart').addEventListener('click', G.newGame);
    $('btn-resume').addEventListener('click', G.resume);
    $('vol-music').addEventListener('input', (e) => A.setMusicVol(e.target.value / 100));
    $('vol-sfx').addEventListener('input', (e) => A.setSfxVol(e.target.value / 100));
    $('opt-fps').checked = GW.Perf.show;
    $('opt-fps').addEventListener('change', (e) => GW.Perf.toggle(e.target.checked));
    GW.Perf.toggle(GW.Perf.show);
    // any click wakes the audio context (browsers require a user gesture)
    window.addEventListener('pointerdown', () => A.init(), { passive: true });

    In.onKey = function (code) {
      if (code === 'Escape' || code === 'KeyP') {
        if (G.state === 'playing') G.pause();
        else if (G.state === 'paused') G.resume();
      } else if (code === 'F3' || code === 'Backquote') {
        GW.Perf.toggle();
      } else if (code === 'KeyM') {
        const on = A.toggleMusic();
        if (G.state === 'playing') G.announce(on ? 'MUSIC ON' : 'MUSIC OFF', '', '#19f0ff');
      } else if ((code === 'Enter' || code === 'Space') && (G.state === 'menu' || (G.state === 'gameover' && !$('gameover').classList.contains('hidden')))) {
        G.newGame();
      }
    };
    window.addEventListener('blur', () => G.pause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) G.pause();
    });

    requestAnimationFrame(frame);

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
