/* GRAVEWAVE — shared math + helper utilities */
(function () {
  'use strict';
  const GW = (window.GW = window.GW || {});
  const U = (GW.U = {});

  U.TAU = Math.PI * 2;
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => (b === undefined ? Math.random() * (a === undefined ? 1 : a) : a + Math.random() * (b - a));
  U.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

  /** Signed shortest angular distance from a to b, in (-PI, PI]. */
  U.angDiff = (a, b) => {
    let d = (b - a) % U.TAU;
    if (d > Math.PI) d -= U.TAU;
    if (d < -Math.PI) d += U.TAU;
    return d;
  };

  /** Weighted random pick. weightFn returns a non-negative weight per item. */
  U.weighted = (items, weightFn) => {
    if (!items.length) return null;
    let total = 0;
    const ws = items.map((it) => {
      const w = Math.max(0, weightFn(it));
      total += w;
      return w;
    });
    if (total <= 0) return U.pick(items);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= ws[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };

  /** Deterministic 0..1 hash for tile-based procedural art. */
  U.hash = (x, y, s) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  /** Distance from a point to an axis-aligned rectangle (0 when inside). */
  U.rectDist = (px, py, rx, ry, rw, rh) => {
    const dx = Math.max(rx - px, 0, px - (rx + rw));
    const dy = Math.max(ry - py, 0, py - (ry + rh));
    return Math.hypot(dx, dy);
  };

  /** '#rrggbb' + alpha -> 'rgba(...)'. */
  U.rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  U.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  };

  /* ---------- sideways mode: a phone held upright still plays in landscape ---------- *
   * In portrait the whole #game box is turned 90 degrees (body.sideways, set by touch.js), so
   * the game's own "screen" is the window turned on its side. These convert between the two. */
  U.sideways = () => typeof document !== 'undefined' && document.body && document.body.classList.contains('sideways');
  /** The game's screen size (swapped while sideways). */
  U.viewW = () => (U.sideways() ? window.innerHeight : window.innerWidth);
  U.viewH = () => (U.sideways() ? window.innerWidth : window.innerHeight);
  /** A pointer event's position in the game's screen. */
  U.pt = (e) => (U.sideways() ? { x: e.clientY, y: window.innerWidth - e.clientX } : { x: e.clientX, y: e.clientY });
  /** An element's box in the game's screen. */
  U.rect = (el) => {
    const r = el.getBoundingClientRect();
    if (!U.sideways()) return r;
    return { left: r.top, top: window.innerWidth - r.right, width: r.height, height: r.width };
  };
})();
