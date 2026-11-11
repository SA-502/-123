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
    weapon: (id) => GW.Player.giveWeapon(id),
    openAll: () => M.doors.forEach((d) => !d.power && M.openDoor(d)),
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
    GW.Zombies.reset();
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
    A.setPower(false);
    FX.flash = 0.5;
    $('game').classList.remove('playing');
    GW.HUD.setPrompt('');

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
    G.time += dt;
    if (G.timers.double > 0) G.timers.double = Math.max(0, G.timers.double - dt);
    if (G.timers.instakill > 0) G.timers.instakill = Math.max(0, G.timers.instakill - dt);

    P.update(dt);
    if (G.state !== 'playing') return; // player died this step

    const tx = Math.floor(P.x / GW.CFG.TILE), ty = Math.floor(P.y / GW.CFG.TILE);
    if (M.flowDirty || tx !== M.flowTx || ty !== M.flowTy) M.computeFlow(P.x, P.y);

    GW.Director.update(dt);
    GW.Zombies.update(dt);
    GW.Weapons.update(dt);
    GW.Interact.update(dt);
    if (M.flowDirty) M.computeFlow(P.x, P.y); // a door opened this step
    FX.update(dt);
    GW.HUD.update(dt);
    In.endFrame();
  };

  function frame(ts) {
    requestAnimationFrame(frame);
    let dt = lastTs ? (ts - lastTs) / 1000 : 1 / 60;
    lastTs = ts;
    if (dt > 0.1) dt = 0.1; // tab was hidden; don't fast-forward
    if (G.state === 'playing') {
      let acc = dt;
      while (acc > 1e-5 && G.state === 'playing') {
        const step = Math.min(acc, 1 / 30);
        G.update(step);
        acc -= step;
      }
    } else {
      if (G.state === 'gameover') {
        FX.update(dt);
        GW.HUD.update(dt);
      }
      In.endFrame();
    }
    GW.Render.draw(dt);
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                               */
  /* ------------------------------------------------------------------ */
  function boot() {
    const canvas = $('view');
    In.init(canvas);
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
    // any click wakes the audio context (browsers require a user gesture)
    window.addEventListener('pointerdown', () => A.init(), { passive: true });

    In.onKey = function (code) {
      if (code === 'Escape' || code === 'KeyP') {
        if (G.state === 'playing') G.pause();
        else if (G.state === 'paused') G.resume();
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
