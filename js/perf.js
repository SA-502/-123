/* GRAVEWAVE — frame-rate meter and adaptive quality aiming for a steady 60 fps */
(function () {
  'use strict';
  const GW = window.GW;
  const KEY = 'gravewave.fps';
  const Perf = (GW.Perf = { show: false, fps: 60, frameMs: 16.7, simMs: 0, drawMs: 0 });
  let el = null, acc = 0, n = 0, simAcc = 0, drawAcc = 0, slowT = 0, fastT = 0, lastShow = 0;

  try {
    Perf.show = localStorage.getItem(KEY) === '1';
  } catch (e) {
    /* storage unavailable */
  }

  Perf.toggle = function (on) {
    Perf.show = on === undefined ? !Perf.show : !!on;
    try {
      localStorage.setItem(KEY, Perf.show ? '1' : '0');
    } catch (e) {
      /* storage unavailable */
    }
    if (el) el.classList.toggle('hidden', !Perf.show);
    const box = document.getElementById('opt-fps');
    if (box) box.checked = Perf.show;
  };

  /**
   * Called once per displayed frame.
   * dt: wall time since the previous frame (s); simMs / drawMs: CPU time spent this frame.
   */
  Perf.frame = function (dt, simMs, drawMs, playing) {
    acc += dt;
    simAcc += simMs;
    drawAcc += drawMs;
    n++;
    if (acc >= 0.5) {
      Perf.fps = n / acc;
      Perf.frameMs = (acc * 1000) / n;
      Perf.simMs = simAcc / n;
      Perf.drawMs = drawAcc / n;
      acc = simAcc = drawAcc = 0;
      n = 0;
      if (Perf.show) paint();
      if (playing) adapt(0.5);
    }
  };

  /**
   * Resolution follows the measured frame rate: if we can't hold the target (60 fps, or the
   * frame cap) for a couple of seconds, render fewer pixels; if there is plenty of headroom for a
   * while, step back up. Work is compared with the frame budget, so a 30 fps cap isn't "slow".
   */
  function adapt(span) {
    const R = GW.Render;
    const work = Perf.simMs + Perf.drawMs;
    const target = R.fpsCap || 60, budget = 1000 / target;
    if (Perf.fps < target * 0.92 && work > budget * 0.72) {
      slowT += span;
      fastT = 0;
    } else if (Perf.fps > target * 0.96 && work < budget * 0.48) {
      fastT += span;
      slowT = 0;
    } else {
      slowT = Math.max(0, slowT - span);
      fastT = Math.max(0, fastT - span);
    }
    if (slowT >= 2 && R.quality > 0.5) {
      R.quality = Math.max(0.5, R.quality * 0.85);
      R.resize();
      slowT = 0;
    } else if (fastT >= 8 && R.quality < R.maxQuality) {
      R.quality = Math.min(R.maxQuality, R.quality / 0.85);
      R.resize();
      fastT = 0;
    }
  }

  /* ------------------------------------------------------------------ */
  /* GRAPHICS: HIGH / BATTERY SAVER                                     */
  /* ------------------------------------------------------------------ */
  // Battery saver (the default on phones): 30 fps, CSS-pixel resolution, softer lighting, fewer
  // particles (see Render.applyProfile). The game itself still runs 60 steps a second.
  const GFX_KEY = 'gravewave.gfx';
  let gfxStored = null;
  try {
    gfxStored = localStorage.getItem(GFX_KEY);
  } catch (e) {
    /* storage unavailable */
  }
  /** 'high' or 'saver': the player's choice, else battery saver on touch screens. */
  Perf.gfx = function () {
    if (gfxStored === 'high' || gfxStored === 'saver') return gfxStored;
    return GW.Render.touch ? 'saver' : 'high';
  };
  Perf.setGfx = function (mode) {
    gfxStored = mode === 'saver' ? 'saver' : 'high';
    try {
      localStorage.setItem(GFX_KEY, gfxStored);
    } catch (e) {
      /* storage unavailable */
    }
    Perf.gfxChanged();
  };
  /** Apply the current choice (also called when touch controls switch on or off). */
  Perf.gfxChanged = function () {
    const R = GW.Render, saver = Perf.gfx() === 'saver';
    if (R.saver !== saver) {
      R.quality = R.maxQuality; // start the new mode from full resolution
      slowT = fastT = 0;
      R.setSaver(saver);
    }
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    document.querySelectorAll('.gfx-toggle').forEach((b) => {
      b.textContent = saver ? 'GRAPHICS: BATTERY SAVER' : 'GRAPHICS: HIGH';
    });
  };
  Perf.initGfx = function () {
    document.querySelectorAll('.gfx-toggle').forEach((b) =>
      b.addEventListener('click', () => Perf.setGfx(Perf.gfx() === 'saver' ? 'high' : 'saver'))
    );
    Perf.gfxChanged();
  };

  function paint() {
    if (!el) {
      el = document.getElementById('fps');
      if (!el) return;
      el.classList.remove('hidden');
    }
    const now = performance.now();
    if (now - lastShow < 400) return;
    lastShow = now;
    const R = GW.Render;
    el.textContent =
      Math.round(Perf.fps) + ' FPS · ' + Perf.frameMs.toFixed(1) + ' ms\n' +
      'sim ' + Perf.simMs.toFixed(1) + ' · draw ' + Perf.drawMs.toFixed(1) + ' ms\n' +
      'res ' + Math.round(R.quality * 100) + '%' + (R.fpsCap ? ' · cap ' + R.fpsCap : '') + (R.saver ? ' · saver' : '');
    el.classList.toggle('bad', Perf.fps < 50);
  }
})();
