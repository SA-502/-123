/* GRAVEWAVE — reusable procedural art: glow sprites, weapon silhouettes, perk + power-up icons */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U;
  const Art = (GW.Art = {});
  const glowCache = {};

  /** Cached radial glow sprite (128px) for cheap additive lights. */
  Art.glow = function (color) {
    if (glowCache[color]) return glowCache[color];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, U.rgba(color, 1));
    grad.addColorStop(0.25, U.rgba(color, 0.55));
    grad.addColorStop(0.6, U.rgba(color, 0.14));
    grad.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glowCache[color] = c;
    return c;
  };

  /** Draw a glow sprite centred on x,y with radius r. Caller sets composite mode. */
  Art.drawGlow = function (ctx, color, x, y, r, alpha) {
    if (alpha <= 0.003) return;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * Math.min(1, alpha);
    ctx.drawImage(Art.glow(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = prev;
  };

  /* ---------------- weapon silhouettes (side view, unit space x:0..1) ---------------- */
  const SIL = {
    pistol: [
      [[0.14, -0.2], [0.88, -0.2], [0.88, -0.03], [0.14, -0.03]],
      [[0.17, -0.03], [0.42, -0.03], [0.35, 0.36], [0.13, 0.36]],
      [[0.42, -0.03], [0.6, -0.03], [0.6, 0.02], [0.47, 0.13], [0.42, 0.13]],
    ],
    smg: [
      [[0.14, -0.17], [0.8, -0.17], [0.8, 0.0], [0.14, 0.0]],
      [[0.8, -0.13], [0.97, -0.13], [0.97, -0.06], [0.8, -0.06]],
      [[0.5, 0.0], [0.61, 0.0], [0.58, 0.36], [0.47, 0.36]],
      [[0.26, 0.0], [0.38, 0.0], [0.33, 0.24], [0.22, 0.24]],
      [[0.0, -0.15], [0.14, -0.15], [0.14, -0.08], [0.04, -0.08], [0.04, 0.1], [0.0, 0.1]],
    ],
    shotgun: [
      [[0.3, -0.15], [1.0, -0.15], [1.0, -0.07], [0.3, -0.07]],
      [[0.5, -0.06], [0.8, -0.06], [0.8, 0.03], [0.5, 0.03]],
      [[0.2, -0.17], [0.46, -0.17], [0.46, 0.04], [0.2, 0.04]],
      [[0.0, -0.1], [0.2, -0.15], [0.2, 0.04], [0.0, 0.16]],
      [[0.26, 0.04], [0.36, 0.04], [0.31, 0.2], [0.23, 0.2]],
    ],
    rifle: [
      [[0.2, -0.16], [0.72, -0.16], [0.72, 0.0], [0.2, 0.0]],
      [[0.72, -0.12], [1.0, -0.12], [1.0, -0.07], [0.72, -0.07]],
      [[0.46, 0.0], [0.58, 0.0], [0.63, 0.32], [0.52, 0.34]],
      [[0.27, 0.0], [0.37, 0.0], [0.32, 0.24], [0.23, 0.24]],
      [[0.0, -0.14], [0.2, -0.14], [0.2, -0.02], [0.0, 0.1]],
      [[0.36, -0.24], [0.56, -0.24], [0.56, -0.18], [0.36, -0.18]],
    ],
    lmg: [
      [[0.16, -0.19], [0.74, -0.19], [0.74, 0.03], [0.16, 0.03]],
      [[0.74, -0.13], [1.0, -0.13], [1.0, -0.06], [0.74, -0.06]],
      [[0.38, 0.03], [0.62, 0.03], [0.62, 0.3], [0.38, 0.3]],
      [[0.22, 0.03], [0.32, 0.03], [0.28, 0.24], [0.19, 0.24]],
      [[0.0, -0.16], [0.16, -0.16], [0.16, 0.0], [0.0, 0.12]],
      [[0.84, -0.06], [0.88, -0.06], [0.8, 0.26], [0.77, 0.26]],
      [[0.88, -0.06], [0.92, -0.06], [0.98, 0.26], [0.95, 0.26]],
    ],
    sniper: [
      [[0.2, -0.12], [0.6, -0.12], [0.6, 0.02], [0.2, 0.02]],
      [[0.6, -0.09], [1.0, -0.09], [1.0, -0.04], [0.6, -0.04]],
      [[0.28, -0.26], [0.62, -0.26], [0.62, -0.16], [0.28, -0.16]],
      [[0.0, -0.1], [0.2, -0.12], [0.2, 0.02], [0.06, 0.14], [0.0, 0.14]],
      [[0.3, 0.02], [0.4, 0.02], [0.35, 0.22], [0.27, 0.22]],
      [[0.42, 0.02], [0.52, 0.02], [0.52, 0.14], [0.42, 0.14]],
    ],
    minigun: [
      [[0.12, -0.2], [0.5, -0.2], [0.5, 0.06], [0.12, 0.06]],
      [[0.5, -0.17], [1.0, -0.17], [1.0, -0.13], [0.5, -0.13]],
      [[0.5, -0.1], [1.0, -0.1], [1.0, -0.06], [0.5, -0.06]],
      [[0.5, -0.03], [1.0, -0.03], [1.0, 0.01], [0.5, 0.01]],
      [[0.9, -0.2], [0.96, -0.2], [0.96, 0.04], [0.9, 0.04]],
      [[0.22, 0.06], [0.42, 0.06], [0.42, 0.3], [0.22, 0.3]],
      [[0.0, -0.12], [0.12, -0.12], [0.12, 0.0], [0.0, 0.0]],
      [[0.28, -0.3], [0.4, -0.3], [0.4, -0.2], [0.28, -0.2]],
    ],
    launcher: [
      [[0.18, -0.22], [0.9, -0.22], [0.9, 0.04], [0.18, 0.04]],
      [[0.9, -0.24], [1.0, -0.24], [1.0, 0.06], [0.9, 0.06]],
      [[0.36, 0.04], [0.48, 0.04], [0.44, 0.3], [0.32, 0.3]],
      [[0.6, 0.04], [0.72, 0.04], [0.72, 0.18], [0.6, 0.18]],
      [[0.0, -0.14], [0.18, -0.16], [0.18, 0.02], [0.0, 0.08]],
      [[0.42, -0.32], [0.56, -0.32], [0.56, -0.22], [0.42, -0.22]],
    ],
    flame: [
      [[0.14, -0.16], [0.72, -0.16], [0.72, 0.0], [0.14, 0.0]],
      [[0.72, -0.12], [0.94, -0.14], [1.0, -0.18], [1.0, 0.04], [0.94, 0.0], [0.72, -0.04]],
      [[0.26, 0.0], [0.5, 0.0], [0.5, 0.2], [0.26, 0.2]],
      [[0.56, 0.0], [0.66, 0.0], [0.62, 0.24], [0.52, 0.24]],
      [[0.0, -0.12], [0.14, -0.14], [0.14, 0.0], [0.0, 0.06]],
      [[0.94, -0.3], [0.98, -0.36], [1.0, -0.28], [0.97, -0.22]],
    ],
    katana: [
      [[0.0, -0.035], [0.24, -0.035], [0.24, 0.035], [0.0, 0.035]],
      [[0.24, -0.12], [0.28, -0.12], [0.28, 0.12], [0.24, 0.12]],
      [[0.28, -0.035], [0.86, -0.045], [1.0, -0.1], [0.94, 0.0], [0.86, 0.03], [0.28, 0.035]],
    ],
    axe: [
      [[0.0, -0.035], [0.8, -0.035], [0.8, 0.035], [0.0, 0.035]],
      [[0.62, -0.04], [0.7, -0.34], [0.98, -0.38], [0.92, -0.14], [0.86, -0.04]],
      [[0.7, 0.03], [0.84, 0.03], [0.8, 0.14], [0.72, 0.14]],
    ],
    energy: [
      [[0.1, -0.2], [0.55, -0.26], [0.78, -0.16], [0.78, 0.0], [0.5, 0.08], [0.1, 0.02]],
      [[0.78, -0.13], [1.0, -0.17], [1.0, 0.0], [0.78, -0.04]],
      [[0.22, 0.02], [0.36, 0.05], [0.3, 0.32], [0.17, 0.32]],
      [[0.56, -0.36], [0.66, -0.36], [0.66, -0.24], [0.56, -0.24]],
      [[0.0, -0.14], [0.1, -0.17], [0.1, 0.0], [0.0, 0.03]],
    ],
  };

  /**
   * Draw a weapon silhouette. (x,y) is the centre, w the total width.
   * mode: 'fill' | 'neon' (outline with inner tint)
   */
  Art.weapon = function (ctx, cls, x, y, w, color, mode, id, tint) {
    if (id && Art.weaponImage(ctx, id, x, y, w, tint)) return;
    const polys = SIL[cls] || SIL.pistol;
    ctx.save();
    ctx.translate(x - w / 2, y + w * 0.02);
    ctx.beginPath();
    for (const poly of polys) {
      ctx.moveTo(poly[0][0] * w, poly[0][1] * w);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * w, poly[i][1] * w);
      ctx.closePath();
    }
    if (mode === 'neon') {
      ctx.fillStyle = U.rgba(color, 0.22);
      ctx.fill();
      ctx.lineWidth = Math.max(1, w * 0.018);
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  };

  /* ---------------- painted sprites (optional: procedural art above is the fallback) ---------------- */

  /** A loaded sprite image for an asset key, or null. */
  Art.sprite = (key) => (GW.Assets && GW.Assets.get(key)) || null;

  const tintCache = {};
  /**
   * The sprite recoloured: `amount` of `color` laid over its painted pixels only (the
   * transparent cut-out stays transparent). amount 1 = a flat silhouette for hit flashes.
   * Cached per key + colour + amount, so it costs one small canvas the first time only.
   */
  Art.tinted = function (key, color, amount) {
    const im = Art.sprite(key);
    if (!im) return null;
    const ck = key + '|' + color + '|' + amount;
    if (tintCache[ck]) return tintCache[ck];
    const c = document.createElement('canvas');
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = amount;
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    tintCache[ck] = c;
    return c;
  };

  /**
   * Draw a weapon's painted icon centred on (x, y), about `w` wide (tall guns are kept short so a
   * pistol doesn't tower over a rifle). `tint` (a colour) recolours it, e.g. an Overclocked gun.
   * Returns false when there's no picture for this weapon, so the neon outline is drawn instead.
   */
  Art.weaponImage = function (ctx, id, x, y, w, tint) {
    const key = 'wpn_' + id;
    const im = tint ? Art.tinted(key, tint, 0.45) : Art.sprite(key);
    if (!im) return false;
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    const k = Math.min((w * 1.08) / iw, (w * 0.62) / ih);
    const dw = iw * k, dh = ih * k;
    ctx.drawImage(im, x - dw / 2, y - dh / 2, dw, dh);
    return true;
  };

  /* ---------------- animated zombie rig ---------------- */
  /*
   * The painted zombies are single top-down pictures facing +x. To animate them without frame
   * sheets each picture is cut once (on first use) into three overlapping layers with feathered
   * masks: the arm reaching forward on each side and the body (torso + head). render.js swings,
   * lunges and splays the arm layers around the shoulders while the body bobs, sways and squashes.
   * A fourth layer is the body with the hips and legs cut away, for legless crawlers.
   * Recoloured copies of the layers (hit flash, fire, frost, char, ice) are cached per colour.
   */
  const RIG = (Art.RIG = 128); // layer resolution (px); a zombie is drawn ~50-120 px on screen
  const rigCache = {};
  const rigVarCache = {};
  const PARTS = ['armT', 'armB', 'body', 'crawl'];

  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h || w;
    return c;
  }

  /** Feathered alpha masks (RIG x RIG): one arm (top = y < 0.5), or the rear (hips + legs). */
  let rigMasks = null;
  function masks() {
    if (rigMasks) return rigMasks;
    const N = RIG;
    const arm = (top) => {
      const c = mkCanvas(N), g = c.getContext('2d');
      const v = g.createLinearGradient(0, top ? 0 : N, 0, top ? N : 0);
      v.addColorStop(0, 'rgba(0,0,0,1)');
      v.addColorStop(0.27, 'rgba(0,0,0,1)');
      v.addColorStop(0.41, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v;
      g.fillRect(0, 0, N, N);
      g.globalCompositeOperation = 'destination-in';
      const h = g.createLinearGradient(0, 0, N, 0);
      h.addColorStop(0, 'rgba(0,0,0,0)');
      h.addColorStop(0.3, 'rgba(0,0,0,0)');
      h.addColorStop(0.46, 'rgba(0,0,0,1)');
      h.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = h;
      g.fillRect(0, 0, N, N);
      return c;
    };
    const rear = mkCanvas(N), rg = rear.getContext('2d');
    const h = rg.createLinearGradient(0, 0, N, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)');
    h.addColorStop(0.3, 'rgba(0,0,0,1)');
    h.addColorStop(0.4, 'rgba(0,0,0,0)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = h;
    rg.fillRect(0, 0, N, N);
    rigMasks = { armT: arm(true), armB: arm(false), rear };
    return rigMasks;
  }

  /** The cut-up layers of a zombie picture: { armT, armB, body, crawl } (RIG-px canvases), or null. */
  Art.zombieRig = function (key) {
    if (rigCache[key]) return rigCache[key];
    const im = Art.sprite(key);
    if (!im) return null;
    const N = RIG, mk = masks();
    const layer = (fn) => {
      const c = mkCanvas(N), g = c.getContext('2d');
      g.drawImage(im, 0, 0, N, N);
      fn(g);
      return c;
    };
    const cut = (g, m, op) => {
      g.globalCompositeOperation = op;
      g.drawImage(m, 0, 0);
    };
    const rig = {
      armT: layer((g) => cut(g, mk.armT, 'destination-in')),
      armB: layer((g) => cut(g, mk.armB, 'destination-in')),
      body: layer((g) => {
        cut(g, mk.armT, 'destination-out');
        cut(g, mk.armB, 'destination-out');
      }),
      crawl: layer((g) => {
        cut(g, mk.armT, 'destination-out');
        cut(g, mk.armB, 'destination-out');
        cut(g, mk.rear, 'destination-out');
      }),
    };
    rigCache[key] = rig;
    return rig;
  };

  /** Tiny seeded generator so baked overlays look the same every load. */
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  }

  /** Paints frost crystals over whatever is already on g (source-atop: only on painted pixels). */
  function paintIce(g, N) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.62;
    g.fillStyle = '#c9f6ff';
    g.fillRect(0, 0, N, N);
    const rnd = seeded(7);
    for (let i = 0; i < 26; i++) {
      // angular facets, light on one edge and dark on the other
      const cx = rnd() * N, cy = rnd() * N, r = N * (0.05 + rnd() * 0.09), a0 = rnd() * 6.28;
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = a0 + (k / 5) * 6.28 + rnd() * 0.5, rr = r * (0.55 + rnd() * 0.6);
        if (k === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      const gr = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      gr.addColorStop(0, 'rgba(255,255,255,0.85)');
      gr.addColorStop(0.5, 'rgba(160,230,255,0.25)');
      gr.addColorStop(1, 'rgba(40,120,190,0.45)');
      g.globalAlpha = 0.75;
      g.fillStyle = gr;
      g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = N / 200;
      g.stroke();
    }
    // a few bright glints
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++) {
      const x = rnd() * N, y = rnd() * N, r = N * 0.012;
      g.fillRect(x - r * 3, y - r * 0.4, r * 6, r * 0.8);
      g.fillRect(x - r * 0.4, y - r * 3, r * 0.8, r * 6);
    }
  }

  /**
   * A recoloured set of rig layers. `color` is a CSS colour (a flat silhouette, faded in by the
   * caller's alpha) or 'ice' (frozen solid: pale blue with crystal facets).
   */
  Art.rigVariant = function (key, color) {
    const ck = key + '|' + color;
    if (rigVarCache[ck]) return rigVarCache[ck];
    const rig = Art.zombieRig(key);
    if (!rig) return null;
    const out = {};
    for (const p of PARTS) {
      const c = mkCanvas(RIG), g = c.getContext('2d');
      g.drawImage(rig[p], 0, 0);
      if (color === 'ice') paintIce(g, RIG);
      else {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = color;
        g.fillRect(0, 0, RIG, RIG);
      }
      out[p] = c;
    }
    rigVarCache[ck] = out;
    return out;
  };

  /* ---------------- power-up pickup tokens ---------------- */
  const tokenCache = {};
  /**
   * The face of a dropped power-up (a glossy enamel coin with a chrome rim and a bold white
   * glyph), baked once per type at `px` pixels. render.js spins it, bobs it and lights it.
   */
  Art.powerupToken = function (id, px) {
    const ck = id + '|' + px;
    if (tokenCache[ck]) return tokenCache[ck];
    const def = GW.POWERUPS[id] || { color: '#ffffff' };
    const col = def.color;
    const c = mkCanvas(px), g = c.getContext('2d');
    const m = px / 2, R0 = px * 0.47;
    // chrome rim
    let gr = g.createLinearGradient(0, 0, px, px);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.35, '#a9b4c8');
    gr.addColorStop(0.55, '#4b5468');
    gr.addColorStop(0.8, '#d9e2f0');
    gr.addColorStop(1, '#6d7790');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(m, m, R0, 0, U.TAU);
    g.fill();
    // coloured enamel
    const R1 = R0 * 0.84;
    gr = g.createRadialGradient(m - R1 * 0.35, m - R1 * 0.4, R1 * 0.1, m, m, R1);
    gr.addColorStop(0, U.rgba('#ffffff', 1));
    gr.addColorStop(0.18, col);
    gr.addColorStop(0.75, col);
    gr.addColorStop(1, U.rgba('#000000', 1));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(m, m, R1, 0, U.TAU);
    g.fill();
    g.globalAlpha = 0.45;
    g.fillStyle = col;
    g.beginPath();
    g.arc(m, m, R1, 0, U.TAU);
    g.fill();
    g.globalAlpha = 1;
    // inner dark ring for contrast behind the glyph
    g.fillStyle = 'rgba(8,4,18,0.55)';
    g.beginPath();
    g.arc(m, m, R1 * 0.78, 0, U.TAU);
    g.fill();
    g.strokeStyle = U.rgba('#ffffff', 0.35);
    g.lineWidth = px * 0.012;
    g.beginPath();
    g.arc(m, m, R1 * 0.78, 0, U.TAU);
    g.stroke();
    // glyph: dark outline then white, so it reads on any floor
    const gs = px * 0.5;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.9)';
    g.shadowBlur = px * 0.04;
    g.shadowOffsetY = px * 0.015;
    Art.powerupIcon(g, id, m, m, gs, '#ffffff');
    g.restore();
    g.globalAlpha = 0.35;
    Art.powerupIcon(g, id, m, m, gs, col);
    g.globalAlpha = 1;
    // gloss: a bright crescent across the top-left
    g.save();
    g.beginPath();
    g.arc(m, m, R1, 0, U.TAU);
    g.clip();
    gr = g.createLinearGradient(0, 0, 0, px);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.08)');
    gr.addColorStop(0.46, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(m - R1 * 0.15, m - R1 * 0.55, R1 * 0.95, R1 * 0.6, -0.3, 0, U.TAU);
    g.fill();
    g.restore();
    tokenCache[ck] = c;
    return c;
  };

  /* ---------------- perk icons ---------------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  Art.roundRect = roundRect;

  /** Draw a perk badge centred at (x,y), size s. */
  Art.perkIcon = function (ctx, id, x, y, s) {
    const perk = GW.PERKS[id];
    const col = perk ? perk.color : '#ffffff';
    ctx.save();
    ctx.translate(x, y);
    const h = s / 2;
    const grad = ctx.createLinearGradient(0, -h, 0, h);
    grad.addColorStop(0, col);
    grad.addColorStop(1, U.rgba(col, 0.45));
    roundRect(ctx, -h, -h, s, s, s * 0.22);
    ctx.fillStyle = '#12091f';
    ctx.fill();
    roundRect(ctx, -h + s * 0.06, -h + s * 0.06, s * 0.88, s * 0.88, s * 0.17);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = s * 0.085;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const u = s / 10;
    if (id === 'thick') {
      // shield with a cross
      ctx.beginPath();
      ctx.moveTo(0, -3 * u);
      ctx.lineTo(2.7 * u, -2 * u);
      ctx.lineTo(2.4 * u, 1.2 * u);
      ctx.lineTo(0, 3.2 * u);
      ctx.lineTo(-2.4 * u, 1.2 * u);
      ctx.lineTo(-2.7 * u, -2 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(-0.45 * u, -1.6 * u, 0.9 * u, 3 * u);
      ctx.fillRect(-1.5 * u, -0.55 * u, 3 * u, 0.9 * u);
    } else if (id === 'quick') {
      // circular reload arrows
      ctx.beginPath();
      ctx.arc(0, 0, 2.4 * u, -2.6, 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 2.4 * u, 0.55 + 0.6, 0.5 + Math.PI + 0.1);
      ctx.stroke();
      tri(ctx, 2.4 * u * Math.cos(0.5), 2.4 * u * Math.sin(0.5), 1.3 * u, 0.5 + Math.PI / 2);
      tri(ctx, 2.4 * u * Math.cos(0.6 + Math.PI), 2.4 * u * Math.sin(0.6 + Math.PI), 1.3 * u, 0.6 + Math.PI * 1.5);
    } else if (id === 'burner') {
      // triple speed chevrons
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 1.9 * u - 0.9 * u, -2.3 * u);
        ctx.lineTo(i * 1.9 * u + 0.9 * u, 0);
        ctx.lineTo(i * 1.9 * u - 0.9 * u, 2.3 * u);
        ctx.stroke();
      }
    } else if (id === 'twin') {
      // two bullets
      for (const ox of [-1.5 * u, 1.5 * u]) {
        ctx.beginPath();
        ctx.moveTo(ox - 0.95 * u, 3 * u);
        ctx.lineTo(ox - 0.95 * u, -1 * u);
        ctx.quadraticCurveTo(ox - 0.95 * u, -3 * u, ox, -3.3 * u);
        ctx.quadraticCurveTo(ox + 0.95 * u, -3 * u, ox + 0.95 * u, -1 * u);
        ctx.lineTo(ox + 0.95 * u, 3 * u);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = col;
      ctx.fillRect(-3 * u, 1.2 * u, 6 * u, 0.6 * u);
    } else if (id === 'wind') {
      // heartbeat trace
      ctx.beginPath();
      ctx.moveTo(-3.3 * u, 0.3 * u);
      ctx.lineTo(-1.6 * u, 0.3 * u);
      ctx.lineTo(-0.8 * u, -2.6 * u);
      ctx.lineTo(0.3 * u, 2.8 * u);
      ctx.lineTo(1.2 * u, -1.0 * u);
      ctx.lineTo(1.8 * u, 0.3 * u);
      ctx.lineTo(3.3 * u, 0.3 * u);
      ctx.stroke();
    }
    ctx.restore();
  };

  function tri(ctx, x, y, r, ang) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = ang + (i * U.TAU) / 3;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------- power-up icons ---------------- */
  /** Draw a power-up glyph centred at (x,y), size s. */
  Art.powerupIcon = function (ctx, id, x, y, s, color) {
    const def = GW.POWERUPS[id];
    const col = color || (def ? def.color : '#fff');
    const u = s / 10;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = u * 0.9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (id === 'ammo') {
      for (let i = -1; i <= 1; i++) {
        const ox = i * 2.6 * u;
        ctx.beginPath();
        ctx.moveTo(ox - u, 3.6 * u);
        ctx.lineTo(ox - u, -1.2 * u);
        ctx.quadraticCurveTo(ox - u, -3.4 * u, ox, -4 * u);
        ctx.quadraticCurveTo(ox + u, -3.4 * u, ox + u, -1.2 * u);
        ctx.lineTo(ox + u, 3.6 * u);
        ctx.closePath();
        ctx.fill();
      }
    } else if (id === 'instakill') {
      // skull
      ctx.beginPath();
      ctx.arc(0, -0.8 * u, 3.5 * u, 0, U.TAU);
      ctx.fill();
      ctx.fillRect(-2 * u, 1.6 * u, 4 * u, 2.4 * u);
      ctx.fillStyle = '#0a0612';
      ctx.beginPath();
      ctx.arc(-1.4 * u, -0.8 * u, 1.05 * u, 0, U.TAU);
      ctx.arc(1.4 * u, -0.8 * u, 1.05 * u, 0, U.TAU);
      ctx.fill();
      ctx.fillRect(-0.3 * u, 0.6 * u, 0.6 * u, 1.1 * u);
      ctx.fillRect(-1.1 * u, 2.5 * u, 0.4 * u, 1.5 * u);
      ctx.fillRect(-0.2 * u, 2.5 * u, 0.4 * u, 1.5 * u);
      ctx.fillRect(0.7 * u, 2.5 * u, 0.4 * u, 1.5 * u);
    } else if (id === 'double') {
      ctx.font = '900 ' + Math.round(s * 0.62) + 'px ' + GW.FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2X', 0, 0.3 * u);
    } else if (id === 'nuke') {
      // starburst
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * U.TAU;
        const r = i % 2 ? 1.9 * u : 4.3 * u;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0a0612';
      ctx.beginPath();
      ctx.arc(0, 0, 1.1 * u, 0, U.TAU);
      ctx.fill();
    } else if (id === 'pal') {
      ctx.restore();
      Art.gadgetIcon(ctx, 'pal', x, y, s, col);
      return;
    } else if (id === 'carpenter') {
      // hammer
      ctx.rotate(-0.7);
      ctx.fillRect(-0.6 * u, -1.6 * u, 1.2 * u, 5.8 * u);
      ctx.fillRect(-2.8 * u, -3.8 * u, 5.6 * u, 2.4 * u);
    }
    ctx.restore();
  };

  /* ---------------- gadget / facility glyphs ---------------- */
  Art.GADGET_COLORS = {
    cryo: '#8fe9ff', lure: '#ff4fd8', bubble: '#3dff8b', armor: '#4f8bff', sentry: '#19f0ff', pal: '#b77dff',
    safe: '#3dff8b', zap: '#8fd8ff', fire: '#ff7a1a', laser: '#ff3b6b', teleport: '#19f0ff',
  };

  /** Line-art glyph for the new systems, centred at (x,y), size s. */
  Art.gadgetIcon = function (ctx, id, x, y, s, color) {
    const col = color || Art.GADGET_COLORS[id] || '#ffffff';
    const u = s / 10;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = ctx.fillStyle = col;
    ctx.lineWidth = Math.max(1, u * 0.85);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (id === 'cryo') {
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-4.2 * u, 0); ctx.lineTo(4.2 * u, 0);
        for (const sx of [-1, 1]) {
          ctx.moveTo(sx * 2.6 * u, 0); ctx.lineTo(sx * 3.6 * u, -1.1 * u);
          ctx.moveTo(sx * 2.6 * u, 0); ctx.lineTo(sx * 3.6 * u, 1.1 * u);
        }
        ctx.stroke();
      }
    } else if (id === 'lure') {
      // mirror ball on a string
      ctx.beginPath(); ctx.moveTo(0, -4.6 * u); ctx.lineTo(0, -2.6 * u); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0.6 * u, 3.3 * u, 0, U.TAU); ctx.stroke();
      ctx.lineWidth = u * 0.5;
      ctx.beginPath();
      ctx.moveTo(-3.3 * u, 0.6 * u); ctx.lineTo(3.3 * u, 0.6 * u);
      ctx.ellipse(0, 0.6 * u, 1.6 * u, 3.3 * u, 0, 0, U.TAU);
      ctx.stroke();
    } else if (id === 'bubble') {
      ctx.beginPath(); ctx.arc(0, 2.6 * u, 4.4 * u, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5 * u, 2.6 * u); ctx.lineTo(5 * u, 2.6 * u); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 1.2 * u, 1.3 * u, 0, U.TAU); ctx.fill();
    } else if (id === 'armor') {
      ctx.beginPath();
      ctx.moveTo(-3.6 * u, -3.6 * u); ctx.lineTo(-1.4 * u, -3.6 * u); ctx.lineTo(0, -2.4 * u); ctx.lineTo(1.4 * u, -3.6 * u);
      ctx.lineTo(3.6 * u, -3.6 * u); ctx.lineTo(3.6 * u, 3.8 * u); ctx.lineTo(-3.6 * u, 3.8 * u); ctx.closePath();
      ctx.stroke();
      ctx.fillRect(-2.4 * u, -0.6 * u, 4.8 * u, 1.2 * u);
      ctx.fillRect(-2.4 * u, 1.6 * u, 4.8 * u, 1.2 * u);
    } else if (id === 'sentry') {
      ctx.beginPath(); ctx.arc(0, 0.5 * u, 2.6 * u, 0, U.TAU); ctx.stroke();
      ctx.fillRect(0, -0.5 * u, 4.6 * u, 2 * u);
      ctx.beginPath();
      ctx.moveTo(-2 * u, 2.8 * u); ctx.lineTo(-3.8 * u, 4.4 * u);
      ctx.moveTo(2 * u, 2.8 * u); ctx.lineTo(3.8 * u, 4.4 * u);
      ctx.moveTo(-4 * u, -3.6 * u); ctx.quadraticCurveTo(0, -5.4 * u, 4 * u, -3.6 * u);
      ctx.stroke();
    } else if (id === 'pal') {
      // robot head
      roundRect(ctx, -3.8 * u, -2.8 * u, 7.6 * u, 6.2 * u, 1.6 * u);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -2.8 * u); ctx.lineTo(0, -4.4 * u); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -4.7 * u, 0.8 * u, 0, U.TAU); ctx.fill();
      ctx.fillRect(-2.4 * u, -0.8 * u, 1.4 * u, 1.4 * u);
      ctx.fillRect(1 * u, -0.8 * u, 1.4 * u, 1.4 * u);
      ctx.fillRect(-1.6 * u, 1.6 * u, 3.2 * u, 0.6 * u);
    } else if (id === 'safe') {
      roundRect(ctx, -3.4 * u, -0.6 * u, 6.8 * u, 4.8 * u, 0.8 * u);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -0.8 * u, 2.4 * u, Math.PI, 0); ctx.stroke();
      ctx.fillRect(-0.5 * u, 0.9 * u, 1 * u, 1.8 * u);
    } else if (id === 'zap') {
      ctx.beginPath();
      ctx.moveTo(1.2 * u, -4.6 * u); ctx.lineTo(-2.4 * u, 0.6 * u); ctx.lineTo(0.2 * u, 0.6 * u);
      ctx.lineTo(-1.2 * u, 4.6 * u); ctx.lineTo(2.6 * u, -0.8 * u); ctx.lineTo(0 * u, -0.8 * u);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'fire') {
      ctx.beginPath();
      ctx.moveTo(0, -4.6 * u);
      ctx.bezierCurveTo(3.6 * u, -1.2 * u, 4 * u, 2 * u, 0, 4.4 * u);
      ctx.bezierCurveTo(-4 * u, 2 * u, -3.4 * u, -0.6 * u, -1.2 * u, -1.6 * u);
      ctx.bezierCurveTo(-1.2 * u, 0, 0, -1.6 * u, 0, -4.6 * u);
      ctx.fill();
    } else if (id === 'laser') {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(-4.4 * u, i * 2.6 * u); ctx.lineTo(4.4 * u, i * 2.6 * u - 1.2 * u); ctx.stroke();
      }
      ctx.fillRect(-5 * u, -4.4 * u, 1.4 * u, 8.8 * u);
      ctx.fillRect(3.6 * u, -4.4 * u, 1.4 * u, 8.8 * u);
    } else if (id === 'teleport') {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = i * 0.42, r = 0.3 * u + i * 0.105 * u;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  /** Make a standalone canvas containing an icon (for HUD elements). */
  Art.iconCanvas = function (kind, id, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    const pic = kind === 'perk' && GW.Assets && GW.Assets.get('perk_icon_' + id);
    if (pic) g.drawImage(pic, 0, 0, size, size);
    else if (kind === 'perk') Art.perkIcon(g, id, size / 2, size / 2, size * 0.94);
    else if (kind === 'gadget') Art.gadgetIcon(g, id, size / 2, size / 2, size * 0.9);
    else Art.powerupIcon(g, id, size / 2, size / 2, size * 0.9);
    return c;
  };
})();
