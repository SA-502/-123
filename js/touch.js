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
      const r = U.rect(zone);
      base.style.display = knob.style.display = 'block';
      base.style.left = x - r.left + 'px';
      base.style.top = y - r.top + 'px';
      knob.style.left = kx - r.left + 'px';
      knob.style.top = ky - r.top + 'px';
    };
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || st.id !== null || TC.editing) return;
      e.preventDefault();
      st.id = e.pointerId;
      const p0 = U.pt(e);
      st.ox = p0.x;
      st.oy = p0.y;
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
      const p = U.pt(e);
      let dx = p.x - st.ox, dy = p.y - st.oy;
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
        dx = p.x - st.ox;
        dy = p.y - st.oy;
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
      if (e.pointerType === 'mouse' || TC.editing) return;
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
      if (e.pointerType === 'mouse' || TC.editing) return;
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      const p0 = U.pt(e);
      ox = p0.x;
      oy = p0.y;
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
      const p = U.pt(e);
      In.touch.throw.dx = p.x - ox;
      In.touch.throw.dy = p.y - oy;
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

  /* ------------------------------------------------------------------ *
   * Custom button layout: players drag the on-screen buttons where their
   * thumbs want them and pick their size and see-through. Saved per device.
   * ------------------------------------------------------------------ */
  const LAYOUT_KEY = 'gravewave.buttons';
  const EDITABLE = ['tb-use', 'tb-reload', 'tb-swap', 'tb-nade', 'tb-tac', 'tb-knife', 'tb-sentry', 'tb-dash', 'tb-pause'];
  const NAMES = { 'tb-use': 'USE', 'tb-reload': 'RELOAD', 'tb-swap': 'SWAP', 'tb-nade': 'NADE', 'tb-tac': 'TAC', 'tb-knife': 'KNIFE', 'tb-sentry': 'SENTRY', 'tb-dash': 'DASH', 'tb-pause': 'PAUSE' };
  /** { a: see-through 0.25..1, b: { id: { x, y, s } } }: x, y = the button's centre as a fraction of the screen. null = default layout. */
  TC.layout = null;
  TC.editing = false;
  let edSel = null, edClose = null;
  const byId = (id) => document.getElementById(id);

  function loadLayout() {
    try {
      const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
      if (v && v.b) TC.layout = v;
    } catch (e) {
      /* storage unavailable or bad data: default layout */
    }
  }
  function saveLayout() {
    try {
      if (TC.layout) localStorage.setItem(LAYOUT_KEY, JSON.stringify(TC.layout));
      else localStorage.removeItem(LAYOUT_KEY);
    } catch (e) {
      /* storage unavailable */
    }
  }
  function applyLayout() {
    const ov = byId('touch'), L = TC.layout;
    if (!ov) return;
    ov.classList.toggle('custom', !!L);
    ov.style.setProperty('--tb-a', L ? L.a : 1);
    for (const id of EDITABLE) {
      const b = byId(id);
      if (!b) continue;
      const p = L && L.b[id];
      if (p) {
        b.style.left = (p.x * 100).toFixed(2) + '%';
        b.style.top = (p.y * 100).toFixed(2) + '%';
        b.style.setProperty('--s', p.s);
      } else {
        b.style.left = b.style.top = '';
        b.style.removeProperty('--s');
      }
    }
  }
  /** Where the buttons are right now (the default layout), as a starting point for editing. */
  function captureLayout() {
    const R = U.rect(byId('touch'));
    const b = {};
    for (const id of EDITABLE) {
      const el = byId(id);
      if (!el) continue;
      const r = U.rect(el);
      b[id] = { x: U.clamp((r.left + r.width / 2 - R.left) / R.width, 0.03, 0.97), y: U.clamp((r.top + r.height / 2 - R.top) / R.height, 0.04, 0.96), s: 1 };
    }
    return { a: 1, b };
  }
  function edSelect(id) {
    edSel = id;
    for (const k of EDITABLE) {
      const el = byId(k);
      if (el) el.classList.toggle('ed-sel', k === id);
    }
    byId('ed-name').textContent = id ? NAMES[id] : 'Drag a button to move it';
  }
  /** Bigger / smaller: the picked button, or all of them when none is picked. */
  function edSize(f) {
    const L = TC.layout;
    for (const id of edSel ? [edSel] : EDITABLE) if (L.b[id]) L.b[id].s = U.clamp(Math.round(L.b[id].s * f * 100) / 100, 0.6, 1.8);
    applyLayout();
  }

  /** Open the layout editor (title screen or pause menu); onClose runs after DONE. */
  TC.openEditor = function (onClose) {
    const ov = byId('touch');
    if (!ov) return;
    edClose = onClose || null;
    TC.editing = true;
    ov.classList.add('editing');
    if (!TC.layout) {
      TC.layout = captureLayout(); // measured with every button showing, before switching to the custom layout
      applyLayout();
    }
    edSelect(null);
  };
  TC.closeEditor = function () {
    const ov = byId('touch');
    TC.editing = false;
    ov.classList.remove('editing');
    edSelect(null);
    saveLayout();
    if (edClose) edClose();
    edClose = null;
  };

  function initEditor() {
    const ov = byId('touch');
    loadLayout();
    applyLayout();
    // drag buttons around (capture phase: runs before, and instead of, the buttons' own handlers)
    let drag = null;
    ov.addEventListener(
      'pointerdown',
      (e) => {
        if (!TC.editing) return;
        const btn = e.target.closest && e.target.closest('.tbtn');
        if (!btn || EDITABLE.indexOf(btn.id) < 0) {
          if (!(e.target.closest && e.target.closest('#tb-editor'))) edSelect(null);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        edSelect(btn.id);
        const p = TC.layout.b[btn.id];
        drag = { id: btn.id, pid: e.pointerId, start: U.pt(e), x: p.x, y: p.y };
        try {
          ov.setPointerCapture(e.pointerId);
        } catch (err) {
          /* best-effort */
        }
      },
      true
    );
    ov.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      e.preventDefault();
      const pt = U.pt(e), W = U.viewW(), H = U.viewH();
      const p = TC.layout.b[drag.id];
      p.x = U.clamp(drag.x + (pt.x - drag.start.x) / W, 0.03, 0.97);
      p.y = U.clamp(drag.y + (pt.y - drag.start.y) / H, 0.04, 0.96);
      applyLayout();
    });
    const end = (e) => {
      if (drag && e.pointerId === drag.pid) drag = null;
    };
    ov.addEventListener('pointerup', end);
    ov.addEventListener('pointercancel', end);
    byId('ed-small').addEventListener('click', () => edSize(1 / 1.12));
    byId('ed-big').addEventListener('click', () => edSize(1.12));
    byId('ed-fade').addEventListener('click', () => {
      TC.layout.a = U.clamp(Math.round((TC.layout.a - 0.15) * 100) / 100, 0.25, 1);
      applyLayout();
    });
    byId('ed-solid').addEventListener('click', () => {
      TC.layout.a = U.clamp(Math.round((TC.layout.a + 0.15) * 100) / 100, 0.25, 1);
      applyLayout();
    });
    byId('ed-reset').addEventListener('click', () => {
      TC.layout = null;
      applyLayout();
      TC.layout = captureLayout();
      applyLayout();
      edSelect(null);
    });
    byId('ed-done').addEventListener('click', TC.closeEditor);
  }

  TC.enable = function (on) {
    if (TC.enabled === on) return;
    TC.enabled = on;
    In.touch.active = on;
    document.body.classList.toggle('touch', on);
    GW.Render.setTouchProfile(on);
    GW.FX.maxParts = on ? 360 : 700;
    TC.updateSideways();
  };

  /**
   * A phone held upright (or with the rotation lock on) still plays in landscape: the whole
   * game box is turned 90 degrees, so turning the phone to the left shows it the right way up,
   * the way many phone games do. Touch input is mapped through U.pt / U.rect to match.
   */
  TC.updateSideways = function () {
    const game = document.getElementById('game');
    if (!game) return;
    // while typing (room code, name) keep the layout still: the keyboard must not flip the game
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    let portrait = window.innerHeight > window.innerWidth;
    try {
      portrait = window.matchMedia('(orientation: portrait)').matches;
    } catch (e) {
      /* old browser: use the window size */
    }
    const on = TC.enabled && portrait;
    const was = document.body.classList.contains('sideways');
    // the game's own screen height, for CSS that must fit a short landscape screen
    document.documentElement.style.setProperty('--gh', (on ? window.innerWidth : window.innerHeight) + 'px');
    document.body.classList.toggle('sideways', on);
    if (on) {
      const W = window.innerWidth, H = window.innerHeight;
      game.style.width = H + 'px';
      game.style.height = W + 'px';
      game.style.left = W + 'px';
    } else {
      game.style.width = game.style.height = game.style.left = '';
    }
    if ((on !== was || on) && GW.Render.vw) GW.Render.resize(); // (before the first frame, render sizes itself)
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
    initEditor();
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

    // phones and tablets start in the touch layout (and sideways if held upright) before the first tap
    try {
      if (window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0) TC.enable(true);
    } catch (e) {
      /* old browser: the first touch switches */
    }
    window.addEventListener('resize', TC.updateSideways);
    window.addEventListener('orientationchange', () => setTimeout(TC.updateSideways, 250));

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
