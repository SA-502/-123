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
  Art.weapon = function (ctx, cls, x, y, w, color, mode) {
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
  Art.powerupIcon = function (ctx, id, x, y, s) {
    const def = GW.POWERUPS[id];
    const col = def ? def.color : '#fff';
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
    } else if (id === 'carpenter') {
      // hammer
      ctx.rotate(-0.7);
      ctx.fillRect(-0.6 * u, -1.6 * u, 1.2 * u, 5.8 * u);
      ctx.fillRect(-2.8 * u, -3.8 * u, 5.6 * u, 2.4 * u);
    }
    ctx.restore();
  };

  /** Make a standalone canvas containing an icon (for HUD elements). */
  Art.iconCanvas = function (kind, id, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    if (kind === 'perk') Art.perkIcon(g, id, size / 2, size / 2, size * 0.94);
    else Art.powerupIcon(g, id, size / 2, size / 2, size * 0.9);
    return c;
  };
})();
