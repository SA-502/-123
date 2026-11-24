/*
 * GRAVEWAVE ARENA — controls.
 * Phones: left thumb moves (a floating stick), right thumb attacks: drag to aim and let go to fire,
 * or just tap to fire at the nearest enemy. The SUPER button works the same way once it is charged.
 * Computers: WASD to move, the mouse aims, click to attack, right click / E / Space for the super.
 * A phone held upright still plays sideways (the whole game turns), like the zombie mode.
 */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U;
  const K = (GW.AControls = {
    touch: false,
    mx: 0, my: 0, // movement, -1..1
    keys: {},
    mouse: { x: 0, y: 0, inside: false },
    actions: [], // { type: 'fire' | 'super', a, mag, auto } waiting for the game
    sticks: { move: null, aim: null, sup: null }, // for drawing
    R: 62, // stick radius (css px)
  });
  const DRAG_MIN = 0.22; // below this a release is a tap (auto-aim)

  /** Where the SUPER button sits on the (game) screen. */
  K.superBtn = () => ({ x: U.viewW() - Math.max(118, U.viewW() * 0.13), y: U.viewH() - Math.max(96, U.viewH() * 0.24), r: 40 });

  function vec(st) {
    const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy);
    return { a: Math.atan2(dy, dx), mag: Math.min(1, d / K.R), d };
  }

  K.init = function (canvas, isPlaying) {
    // ---- touch ----
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!isPlaying()) return;
      e.preventDefault();
      const p = U.pt(e), W = U.viewW();
      const sb = K.superBtn();
      let kind;
      if (!K.sticks.sup && Math.hypot(p.x - sb.x, p.y - sb.y) < sb.r + 14) kind = 'sup';
      else if (!K.sticks.move && p.x < W * 0.42) kind = 'move';
      else if (!K.sticks.aim) kind = 'aim';
      else return;
      const st = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, max: 0 };
      if (kind === 'sup') {
        st.ox = sb.x;
        st.oy = sb.y;
      }
      K.sticks[kind] = st;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* best-effort */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      for (const kind of ['move', 'aim', 'sup']) {
        const st = K.sticks[kind];
        if (!st || st.id !== e.pointerId) continue;
        e.preventDefault();
        const p = U.pt(e);
        st.x = p.x;
        st.y = p.y;
        if (kind === 'move') {
          // the base follows a thumb that slides past the rim
          const v = vec(st);
          if (v.d > K.R) {
            st.ox = st.x - Math.cos(v.a) * K.R;
            st.oy = st.y - Math.sin(v.a) * K.R;
          }
        } else st.max = Math.max(st.max, vec(st).mag);
      }
    });
    const end = (e) => {
      for (const kind of ['move', 'aim', 'sup']) {
        const st = K.sticks[kind];
        if (!st || st.id !== e.pointerId) continue;
        K.sticks[kind] = null;
        if (kind === 'move' || e.type === 'pointercancel') continue;
        const v = vec(st);
        const type = kind === 'aim' ? 'fire' : 'super';
        if (st.max < DRAG_MIN) K.actions.push({ type, auto: true });
        else if (v.mag >= DRAG_MIN * 0.6) K.actions.push({ type, a: v.a, mag: v.mag });
        // dragged out and brought back to the middle: cancelled
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);

    // ---- mouse ----
    canvas.addEventListener('mousemove', (e) => {
      const p = U.pt(e);
      K.mouse.x = p.x;
      K.mouse.y = p.y;
      K.mouse.inside = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (K.touch || !isPlaying()) return;
      const p = U.pt(e);
      K.mouse.x = p.x;
      K.mouse.y = p.y;
      K.actions.push({ type: e.button === 2 ? 'super' : 'fire', mouse: true });
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      K.keys[e.code] = true;
      if ((e.code === 'KeyE' || e.code === 'Space') && isPlaying() && !e.repeat) {
        K.actions.push({ type: 'super', mouse: true });
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => (K.keys[e.code] = false));
    window.addEventListener('blur', () => (K.keys = {}));

    // ---- touch layout + sideways ----
    try {
      if (window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0) setTouch(true);
    } catch (e) {
      /* old browser */
    }
    window.addEventListener('touchstart', () => setTouch(true), { passive: true });
    window.addEventListener('resize', K.updateSideways);
    window.addEventListener('orientationchange', () => setTimeout(K.updateSideways, 250));
    K.updateSideways();
  };

  function setTouch(on) {
    if (K.touch === on) return;
    K.touch = on;
    document.body.classList.toggle('touch', on);
    K.updateSideways();
  }

  /** In portrait the game box is turned 90 degrees so it always plays in landscape. */
  K.updateSideways = function () {
    const game = document.getElementById('game');
    const a = document.activeElement;
    if (!game || (a && a.tagName === 'INPUT')) return;
    let portrait = window.innerHeight > window.innerWidth;
    try {
      portrait = window.matchMedia('(orientation: portrait)').matches;
    } catch (e) {
      /* old browser */
    }
    const on = K.touch && portrait;
    document.body.classList.toggle('sideways', on);
    if (on) {
      game.style.width = window.innerHeight + 'px';
      game.style.height = window.innerWidth + 'px';
      game.style.left = window.innerWidth + 'px';
    } else game.style.width = game.style.height = game.style.left = '';
    if (K.onResize) K.onResize();
  };

  /** Read the movement for this frame (sticks or keys). */
  K.update = function () {
    let mx = 0, my = 0;
    const st = K.sticks.move;
    if (st) {
      const v = vec(st);
      if (v.mag > 0.12) {
        mx = Math.cos(v.a) * v.mag;
        my = Math.sin(v.a) * v.mag;
      }
    } else {
      const k = K.keys;
      mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      my = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
      const L = Math.hypot(mx, my);
      if (L > 1) {
        mx /= L;
        my /= L;
      }
    }
    K.mx = mx;
    K.my = my;
  };

  /** The aim being dragged right now (for the aim guide), or null. */
  K.preview = function () {
    for (const kind of ['sup', 'aim']) {
      const st = K.sticks[kind];
      if (!st) continue;
      const v = vec(st);
      if (st.max >= DRAG_MIN && v.mag >= DRAG_MIN * 0.6) return { sup: kind === 'sup', a: v.a, mag: v.mag };
    }
    return null;
  };

  K.clear = function () {
    K.actions.length = 0;
    K.sticks.move = K.sticks.aim = K.sticks.sup = null;
    K.mx = K.my = 0;
  };
})();
