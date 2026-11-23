/* GRAVEWAVE — touch controls: floating twin sticks, action buttons, aim assist and the touch layout switch */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, In = GW.Input;
  const TC = (GW.Touch = { enabled: false });

  /** Shared with player.js: analog move, aim direction, fire and sprint from the sticks. */
  In.touch = { active: false, mx: 0, my: 0, aiming: false, autoAim: false, ax: 1, ay: 0, fire: false, sprint: false };

  const DEAD = 0.14; // stick dead zone
  const FIRE_AT = 0.3; // right stick fires once pushed this far ('drag' mode)
  const SPRINT_OVER = 1.08; // left stick: sprint only when the thumb goes past the ring (the knob stays on the rim)
  const AIM_KEY = 'gravewave.aim';
  let lastTouch = 0;

  /** Fire mode: 'drag' = push the right stick to shoot (the original), 'tap' = touching fires at once, aimed for you. */
  TC.aimMode = 'drag';
  try {
    if (localStorage.getItem(AIM_KEY) === 'tap') TC.aimMode = 'tap';
  } catch (e) {
    /* storage unavailable */
  }
  TC.setAimMode = function (mode) {
    TC.aimMode = mode === 'tap' ? 'tap' : 'drag';
    try {
      localStorage.setItem(AIM_KEY, TC.aimMode);
    } catch (e) {
      /* storage unavailable */
    }
    document.querySelectorAll('.aim-toggle').forEach((b) => {
      b.textContent = TC.aimMode === 'tap' ? 'FIRE: TAP TO SHOOT' : 'FIRE: DRAG TO SHOOT';
    });
  };

  /**
   * A floating stick: appears where the thumb lands inside its zone.
   * fixed: the base stays where the thumb landed and the knob is held inside the ring
   * (the left stick); otherwise the base trails a thumb that slides past the rim.
   * onChange gets (x, y, m, held, over): over = thumb distance / ring radius, unclamped.
   */
  function makeStick(zone, onChange, fixed) {
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
      if (fixed) {
        const over = d / R;
        const kx = d > R ? (dx / d) * R : dx, ky = d > R ? (dy / d) * R : dy;
        show(st.ox, st.oy, st.ox + kx, st.oy + ky);
        onChange(kx / R, ky / R, Math.min(1, over), true, over);
        return;
      }
      if (d > R) {
        // drag past the rim: the base follows the thumb so direction changes stay instant
        st.ox += (dx / d) * (d - R);
        st.oy += (dy / d) * (d - R);
        dx = e.clientX - st.ox;
        dy = e.clientY - st.oy;
      }
      show(st.ox, st.oy, st.ox + dx, st.oy + dy);
      const m = Math.min(1, Math.hypot(dx, dy) / R);
      onChange(dx / R, dy / R, m, true, m);
    });
    const end = (e) => {
      if (e.pointerId !== st.id) return;
      st.id = null;
      base.style.display = knob.style.display = 'none';
      onChange(0, 0, 0, false, 0);
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

  /**
   * Grenade buttons aim: hold the button and drag to place the landing spot (a marker shows it),
   * let go to throw. A quick tap throws at the thickest crowd nearby.
   */
  const THROW_SCALE = 3.2; // world units per screen pixel of drag
  In.touch.throw = null; // { dx, dy } while a grenade button is being dragged
  In.touch.throwAt = null; // where the next grenade lands
  function bindThrow(btn) {
    const code = btn.dataset.key;
    let id = null, ox = 0, oy = 0;
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      ox = e.clientX;
      oy = e.clientY;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (err) {
        /* best-effort */
      }
      btn.classList.add('down');
      In.touch.throw = { dx: 0, dy: 0 };
    });
    btn.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || !In.touch.throw) return;
      e.preventDefault();
      In.touch.throw.dx = e.clientX - ox;
      In.touch.throw.dy = e.clientY - oy;
    });
    const up = (e, cancel) => {
      if (e.pointerId !== id) return;
      id = null;
      btn.classList.remove('down');
      if (!cancel && In.touch.throw) {
        In.touch.throwAt = TC.throwTarget(GW.Player);
        In.pressed[code] = true;
      }
      In.touch.throw = null;
    };
    btn.addEventListener('pointerup', (e) => up(e, false));
    btn.addEventListener('pointercancel', (e) => up(e, true));
  }

  /** Where a grenade would land right now: along the drag, or the busiest spot nearby for a tap. */
  TC.throwTarget = function (P) {
    const t = In.touch.throw;
    if (t && Math.hypot(t.dx, t.dy) > 14) {
      const d = U.clamp(Math.hypot(t.dx, t.dy) * THROW_SCALE, 130, 540), a = Math.atan2(t.dy, t.dx);
      return { x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d, aimed: true };
    }
    let best = null, bs = 0;
    const list = GW.Zombies.list;
    for (const z of list) {
      if (z.dead || z.state === 'rise') continue;
      const d = Math.hypot(z.x - P.x, z.y - P.y);
      if (d > 520 || d < 90) continue;
      let n = 0;
      for (const o of list) if (!o.dead && Math.abs(o.x - z.x) < 120 && Math.abs(o.y - z.y) < 120) n++;
      const score = n * 10 - d / 60;
      if (score > bs) {
        bs = score;
        best = z;
      }
    }
    if (best) return { x: best.x, y: best.y, aimed: false };
    return { x: P.x + Math.cos(P.angle) * 260, y: P.y + Math.sin(P.angle) * 260, aimed: false };
  };

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
    const stickL = document.getElementById('stick-l');
    makeStick(
      stickL,
      (x, y, m, held, over) => {
        const t = In.touch;
        const sprint = held && m >= DEAD && over >= SPRINT_OVER;
        stickL.classList.toggle('sprint', sprint);
        if (m < DEAD) {
          t.mx = t.my = 0;
          t.sprint = false;
          return;
        }
        t.mx = x;
        t.my = y;
        t.sprint = sprint;
      },
      true
    );
    makeStick(document.getElementById('stick-r'), (x, y, m, held) => {
      const t = In.touch;
      t.aiming = held && m >= DEAD;
      t.autoAim = TC.aimMode === 'tap' && held && !t.aiming;
      if (t.aiming) {
        const d = Math.hypot(x, y) || 1;
        t.ax = x / d;
        t.ay = y / d;
      }
      // 'tap': the touch itself pulls the trigger; 'drag': the stick has to be pushed out
      const fire = held && (TC.aimMode === 'tap' || m >= FIRE_AT);
      if (fire && !t.fire) In.mouse.pressed = true;
      t.fire = fire;
      In.mouse.down = fire;
    });
    // fire-mode buttons (title screen and pause menu)
    document.querySelectorAll('.aim-toggle').forEach((b) =>
      b.addEventListener('click', () => TC.setAimMode(TC.aimMode === 'tap' ? 'drag' : 'tap'))
    );
    TC.setAimMode(TC.aimMode);
    // the minimap: tap it for the big map
    const mapBtn = document.getElementById('tb-map');
    if (mapBtn)
      mapBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        GW.HUD.toggleBigMap();
      });
    ov.querySelectorAll('[data-key]').forEach((b) => (b.dataset.throw ? bindThrow(b) : bindButton(b)));
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
    const dash = document.getElementById('tb-dash');
    if (dash) dash.classList.toggle('cool', P.dashCd > 0 || P.stamina < C.PLAYER.dash.stamina * 0.4);
    const swap = document.getElementById('tb-swap');
    if (swap) swap.classList.toggle('hidden', P.weapons.length < 2);
  };

  /** Tap-to-fire target: the nearest zombie in sight and in range (in front wins a close tie). */
  TC.autoTarget = function (P) {
    const w = P.weapon();
    const range = Math.min(w ? w.s.range : 120, 760);
    let best = null, bs = Infinity;
    for (const z of GW.Zombies.list) {
      if (z.dead || z.state === 'rise') continue;
      const dx = z.x - P.x, dy = z.y - P.y, d = Math.hypot(dx, dy);
      if (d > range + z.r) continue;
      const score = d + Math.abs(U.angDiff(P.angle, Math.atan2(dy, dx))) * 40 + (z === TC.lastAuto ? -40 : 0);
      if (score < bs && GW.Map.los(P.x, P.y, z.x, z.y, GW.Map.blocksBullet)) {
        bs = score;
        best = z;
      }
    }
    TC.lastAuto = best;
    return best;
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
