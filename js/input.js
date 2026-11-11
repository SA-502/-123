/* GRAVEWAVE — keyboard + mouse state with per-frame edge detection */
(function () {
  'use strict';
  const GW = window.GW;
  const In = (GW.Input = {
    keys: {},
    pressed: {},
    mouse: { x: 0, y: 0, down: false, pressed: false, rdown: false, rpressed: false },
    wheel: 0,
    onKey: null, // optional global key hook (pause, mute...)
  });

  const GAME_KEYS = {
    KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, Tab: 1,
    KeyF: 1, KeyR: 1, KeyQ: 1, KeyG: 1, KeyV: 1, KeyE: 1, ShiftLeft: 1, ShiftRight: 1, Digit1: 1, Digit2: 1,
  };

  In.init = function (canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (GAME_KEYS[e.code]) e.preventDefault();
      if (!e.repeat) {
        In.pressed[e.code] = true;
        if (In.onKey) In.onKey(e.code);
      }
      In.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      In.keys[e.code] = false;
    });
    window.addEventListener('blur', () => In.clear());
    window.addEventListener('mousemove', (e) => {
      In.mouse.x = e.clientX;
      In.mouse.y = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      In.mouse.x = e.clientX;
      In.mouse.y = e.clientY;
      if (e.button === 0) {
        In.mouse.down = true;
        In.mouse.pressed = true;
      } else if (e.button === 2 || e.button === 1) {
        In.mouse.rdown = true;
        In.mouse.rpressed = true;
        e.preventDefault();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) In.mouse.down = false;
      else In.mouse.rdown = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        In.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false }
    );
  };

  In.down = (code) => !!In.keys[code];
  In.hit = (code) => !!In.pressed[code];

  /** Clear one-shot edges. Call after each simulation step. */
  In.endFrame = function () {
    In.pressed = {};
    In.mouse.pressed = false;
    In.mouse.rpressed = false;
    In.wheel = 0;
  };

  /** Drop all held state (window blur, pause, restart). */
  In.clear = function () {
    In.keys = {};
    In.pressed = {};
    In.mouse.down = In.mouse.pressed = In.mouse.rdown = In.mouse.rpressed = false;
    In.wheel = 0;
  };
})();
