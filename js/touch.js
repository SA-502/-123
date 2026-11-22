/* GRAVEWAVE — touch controls: floating twin sticks, action buttons, aim assist and the touch layout switch */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, In = GW.Input;
  const TC = (GW.Touch = { enabled: false });

  /** Shared with player.js: analog move, aim direction, fire and sprint from the sticks. */
  In.touch = { active: false, mx: 0, my: 0, aiming: false, ax: 1, ay: 0, fire: false, sprint: false };

  const DEAD = 0.14; // stick dead zone
  const FIRE_AT = 0.3; // right stick fires once pushed this far
  const SPRINT_AT = 0.93; // left stick sprints when pushed to the rim
  let lastTouch = 0;

  /** A floating stick: appears where the thumb lands inside its zone. */
  function makeStick(zone, onChange) {
    const base = zone.querySelector('.stick-base'), knob = zone.querySelector('.stick-knob');
    const st = { id: null, ox: 0, oy: 0 };
    const radius = () => base.offsetWidth / 2 || 60;
    const show = (x, y, kx, ky) => {
      const r = zone.getBoundingClientRect();
      base.style.display = knob.style.display = 'block';
      base.style.left = x - r.left + 'px';
      base.style.top = y - r.top + 'px';
      knob.style.left = kx - r.left + 'px';
      knob.style.top = ky - r.top + 'px';
    };
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || st.id !== null) return;
      e.preventDefault();
      st.id = e.pointerId;
      st.ox = e.clientX;
      st.oy = e.clientY;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch (err) {
        /* capture is best-effort */
      }
      show(st.ox, st.oy, st.ox, st.oy);
      onChange(0, 0, 0, true);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== st.id) return;
      e.preventDefault();
      const R = radius();
      let dx = e.clientX - st.ox, dy = e.clientY - st.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // drag past the rim: the base follows the thumb so direction changes stay instant
        st.ox += (dx / d) * (d - R);
        st.oy += (dy / d) * (d - R);
        dx = e.clientX - st.ox;
        dy = e.clientY - st.oy;
      }
      show(st.ox, st.oy, st.ox + dx, st.oy + dy);
      const m = Math.min(1, Math.hypot(dx, dy) / R);
      onChange(dx / R, dy / R, m, true);
    });
    const end = (e) => {
      if (e.pointerId !== st.id) return;
      st.id = null;
      base.style.display = knob.style.display = 'none';
      onChange(0, 0, 0, false);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    return st;
  }

  /** On-screen buttons press real key codes, so every action works exactly like the keyboard. */
  function bindButton(btn) {
    const code = btn.dataset.key;
    let id = null;
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      btn.classList.add('down');
      if (code === 'Escape') {
        if (In.onKey) In.onKey('Escape');
        return;
      }
      In.keys[code] = true;
      In.pressed[code] = true;
    });
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      btn.classList.remove('down');
      In.keys[code] = false;
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  TC.enable = function (on) {
    if (TC.enabled === on) return;
    TC.enabled = on;
    In.touch.active = on;
    document.body.classList.toggle('touch', on);
    GW.Render.setTouchProfile(on);
    GW.FX.maxParts = on ? 360 : 700;
  };

  TC.init = function () {
    const ov = document.getElementById('touch');
    if (!ov) return;
    makeStick(document.getElementById('stick-l'), (x, y, m) => {
      const t = In.touch;
      if (m < DEAD) {
        t.mx = t.my = 0;
        t.sprint = false;
        return;
      }
      t.mx = x;
      t.my = y;
      t.sprint = m >= SPRINT_AT;
    });
    makeStick(document.getElementById('stick-r'), (x, y, m, held) => {
      const t = In.touch;
      t.aiming = held && m >= DEAD;
      if (t.aiming) {
        const d = Math.hypot(x, y) || 1;
        t.ax = x / d;
        t.ay = y / d;
      }
      const fire = held && m >= FIRE_AT;
      if (fire && !t.fire) In.mouse.pressed = true;
      t.fire = fire;
      In.mouse.down = fire;
    });
    ov.querySelectorAll('[data-key]').forEach(bindButton);
    ov.addEventListener('contextmenu', (e) => e.preventDefault());

    // switch layouts by what the player actually uses
    window.addEventListener(
      'touchstart',
      () => {
        lastTouch = performance.now();
        TC.enable(true);
      },
      { passive: true }
    );
    window.addEventListener('mousemove', (e) => {
      if (TC.enabled && (e.movementX || e.movementY) && performance.now() - lastTouch > 1500) TC.enable(false);
    });

    // full screen + landscape lock where the browser allows it (Android); iOS uses "Add to Home Screen"
    const fs = document.getElementById('btn-full');
    if (fs) {
      const can = document.fullscreenEnabled || document.webkitFullscreenEnabled;
      fs.classList.toggle('hidden', !can);
      fs.addEventListener('click', () => {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) return;
        Promise.resolve(req.call(el))
          .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
          .catch(() => {});
      });
    }

    // iPhone / iPad in Safari: there is no full-screen API for pages, so explain "Add to Home Screen".
    // Opened from the home-screen icon (standalone) the game already fills the whole screen.
    const tip = document.getElementById('ios-tip');
    if (tip) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      let standalone = navigator.standalone === true;
      try {
        standalone = standalone || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches;
      } catch (e) {
        /* old browser */
      }
      tip.classList.toggle('hidden', !ios || standalone);
      if (standalone) document.body.classList.add('standalone');
    }
  };

  /** Called by the HUD each frame so contextual buttons only show when they do something. */
  TC.sync = function (P, promptOk) {
    if (!TC.enabled) return;
    const use = document.getElementById('tb-use');
    if (use) use.classList.toggle('ready', !!promptOk);
    const sentry = document.getElementById('tb-sentry');
    if (sentry) sentry.classList.toggle('hidden', !P.sentryCarried);
    const tac = document.getElementById('tb-tac');
    if (tac) tac.classList.toggle('hidden', !P.tactical.type);
    const nade = document.getElementById('tb-nade');
    if (nade) nade.classList.toggle('empty', P.grenades <= 0);
    const swap = document.getElementById('tb-swap');
    if (swap) swap.classList.toggle('hidden', P.weapons.length < 2);
  };

  /**
   * Gentle aim assist for thumbs: if a visible zombie sits close to the stick direction,
   * bend the aim toward it. Never snaps through walls or onto targets far off the stick.
   */
  TC.assist = function (P, ang) {
    let best = null, bestScore = Infinity;
    for (const z of GW.Zombies.list) {
      if (z.dead || z.state === 'rise') continue;
      const dx = z.x - P.x, dy = z.y - P.y, d = Math.hypot(dx, dy);
      if (d > 720 || d < 1) continue;
      const diff = Math.abs(U.angDiff(ang, Math.atan2(dy, dx)));
      const cone = 0.12 + Math.min(0.16, (z.r + 6) / d); // wider for close targets
      if (diff > cone) continue;
      const score = diff * 3 + d / 720;
      if (score < bestScore && GW.Map.los(P.x, P.y, z.x, z.y, GW.Map.blocksBullet)) {
        bestScore = score;
        best = z;
      }
    }
    if (!best) return ang;
    return ang + U.angDiff(ang, Math.atan2(best.y - P.y, best.x - P.x)) * 0.75;
  };
})();
