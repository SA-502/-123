/* GRAVEWAVE — world renderer: camera, entities, dynamic lighting with a shadow-casting flashlight, additive neon pass */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, Art = GW.Art, T = C.TILE;
  const R = (GW.Render = { cam: { x: M.pxW / 2, y: M.pxH / 2, zoom: 1 }, vw: 0, vh: 0, dpr: 1, quality: 1, maxQuality: 1, time: 0, ox: 0, oy: 0, lightsOut: 0, dim: 1, inGame: false, amb: 0 });
  /** Light level 0..1 of a zone this frame (its generator, flicker, and special-round blackouts). */
  const lv = (z) => (!R.inGame ? 1 : z < 0 || z === undefined ? 0 : GW.Interact.zoneLevel[z] || 0) * R.dim;
  const WH = 16;
  const FONT = GW.FONT;
  const view = { x: 0, y: 0, w: 0, h: 0 };
  let canvas, ctx, lcan, lctx, lightSprite;

  /* ------------------------------------------------------------------ */
  /* setup                                                              */
  /* ------------------------------------------------------------------ */
  R.init = function (cv) {
    canvas = cv;
    ctx = canvas.getContext('2d', { alpha: false });
    lcan = document.createElement('canvas');
    lctx = lcan.getContext('2d');
    // broad, flat-topped falloff used to carve light out of the darkness layer
    lightSprite = document.createElement('canvas');
    lightSprite.width = lightSprite.height = 128;
    const g = lightSprite.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.8)');
    gr.addColorStop(0.8, 'rgba(255,255,255,0.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    R.resize();
    window.addEventListener('resize', R.resize);
  };

  R.dprCap = 1.5;
  R.pixelCap = 2.8e6;
  /** Phones: fewer pixels and a slightly wider view so thumbs don't hide the action. */
  R.setTouchProfile = function (on) {
    R.dprCap = on ? 1.25 : 1.5;
    R.pixelCap = on ? 1.6e6 : 2.8e6;
    R.touch = on;
    if (canvas) R.resize();
  };

  R.resize = function () {
    const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
    let s = Math.min(window.devicePixelRatio || 1, R.dprCap);
    if (w * h * s * s > R.pixelCap) s = Math.sqrt(R.pixelCap / (w * h));
    s *= R.quality; // lowered automatically if the frame rate struggles
    R.dpr = s;
    canvas.width = Math.round(w * s);
    canvas.height = Math.round(h * s);
    R.vw = canvas.width;
    R.vh = canvas.height;
    // phones see a slightly closer view (about 15% bigger) so the player and the horde read better
    const VW = R.touch ? 1130 : 1300, VH = R.touch ? 648 : 745;
    R.cam.zoom = Math.max(R.vw / VW, R.vh / VH);
    lcan.width = Math.ceil(R.vw / 2);
    lcan.height = Math.ceil(R.vh / 2);
  };

  /** CSS-pixel screen position -> world position. */
  R.screenToWorld = function (sx, sy) {
    const z = R.cam.zoom;
    return { x: R.cam.x + (sx * R.dpr - R.vw / 2) / z, y: R.cam.y + (sy * R.dpr - R.vh / 2) / z };
  };

  R.snap = function () {
    R.cam.x = GW.Player.x;
    R.cam.y = GW.Player.y;
  };

  function updateCamera(dt, inGame) {
    const cam = R.cam;
    let tx, ty, k;
    if (inGame) {
      const P = GW.Player;
      const spec = !P.alive && GW.Net && GW.Net.active ? GW.Net.spectateTarget() : null;
      if (spec) {
        // down in co-op: watch a teammate until the next round
        tx = spec.x;
        ty = spec.y;
      } else {
        tx = P.x + (P.aimX - P.x) * 0.16;
        ty = P.y + (P.aimY - P.y) * 0.16;
      }
      k = 1 - Math.exp(-dt * 9);
    } else {
      // attract mode: drift around the plaza
      const t = R.time * 0.07;
      tx = 32 * T + Math.cos(t) * T * 7;
      ty = 24 * T + Math.sin(t * 1.3) * T * 4.5;
      k = 1 - Math.exp(-dt * 2);
    }
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    const hw = R.vw / 2 / cam.zoom, hh = R.vh / 2 / cam.zoom;
    cam.x = hw * 2 >= M.pxW ? M.pxW / 2 : U.clamp(cam.x, hw, M.pxW - hw);
    cam.y = hh * 2 >= M.pxH ? M.pxH / 2 : U.clamp(cam.y, hh, M.pxH - hh);
  }

  const inView = (x, y, r) => x + r > view.x && x - r < view.x + view.w && y + r > view.y && y - r < view.y + view.h;

  function blit(img, s) {
    const x0 = Math.max(0, Math.floor(view.x)), y0 = Math.max(0, Math.floor(view.y));
    const x1 = Math.min(M.pxW, Math.ceil(view.x + view.w)), y1 = Math.min(M.pxH, Math.ceil(view.y + view.h));
    if (x1 <= x0 || y1 <= y0) return;
    ctx.drawImage(img, x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s, x0, y0, x1 - x0, y1 - y0);
  }

  /* ------------------------------------------------------------------ */
  /* entities                                                           */
  /* ------------------------------------------------------------------ */
  function drawZombie(z) {
    if (z.type === 'boss') return drawBoss(z);
    const s = (z.r / 13) * 1.15;
    let scale = 1, alpha = 1;
    if (z.state === 'rise') {
      const k = U.clamp(1 - z.riseT / 0.9, 0, 1);
      scale = 0.4 + 0.6 * k;
      alpha = 0.3 + 0.7 * k;
    }
    const brute = z.type === 'brute';
    const bloater = z.type === 'bloater', leaper = z.type === 'leaper';
    if (z.state === 'swell') scale *= 1 + 0.4 * U.clamp(1 - z.attackT / C.ZOMBIE.bloat.swell, 0, 1) + Math.sin(R.time * 40) * 0.03;
    if (z.state === 'crouch') scale *= 0.86;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.globalAlpha = alpha * 0.38;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(2, 4, z.r * 1.05 * scale, z.r * 0.9 * scale, 0, 0, U.TAU);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.rotate(z.angle);
    ctx.scale(s * scale, s * scale);
    const sw = Math.sin(z.t * z.animRate);
    let reach = 0;
    if (z.state === 'attack') reach = Math.sin(U.clamp(1 - z.attackT / C.ZOMBIE.attackWindup, 0, 1) * Math.PI) * 7;
    else if (z.state === 'breach') reach = Math.abs(Math.sin(z.t * 6)) * 5;
    // arms
    ctx.strokeStyle = z.skin;
    ctx.lineWidth = brute ? 5.5 : 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2, -9);
    const armLen = leaper ? (z.state === 'leap' ? 24 : 19) : 15;
    ctx.lineTo(armLen + reach + sw * 1.5, -6 + sw);
    ctx.moveTo(2, 9);
    ctx.lineTo(armLen + reach - sw * 1.5, 6 - sw);
    ctx.stroke();
    // torso
    ctx.fillStyle = z.shirt;
    ctx.beginPath();
    ctx.ellipse(-1, 0, leaper ? 6 : bloater ? 9.5 : 7.5, leaper ? 10 : 12, 0, 0, U.TAU);
    ctx.fill();
    if (bloater) {
      // swollen, blistered belly
      ctx.fillStyle = z.skin;
      ctx.beginPath();
      ctx.ellipse(-2, 0, 8, 10, 0, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = '#d9e06a';
      for (const [bx, by, br] of [[-5, -4, 2.2], [0, 5, 2.6], [-3, 3, 1.6], [1, -5, 1.8], [-7, 2, 1.5]]) {
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, U.TAU);
        ctx.fill();
      }
    } else if (z.type === 'spitter') {
      // acid sac at the throat
      ctx.fillStyle = '#b4ff5a';
      ctx.beginPath();
      ctx.arc(7.5, 0, z.state === 'spit' ? 5.5 : 4, 0, U.TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-6, -3 + sw, 5, 6);
    if (brute) {
      ctx.fillStyle = '#20141c';
      ctx.beginPath();
      ctx.arc(-1, -11, 5.5, 0, U.TAU);
      ctx.arc(-1, 11, 5.5, 0, U.TAU);
      ctx.fill();
    }
    // head
    ctx.fillStyle = z.skin;
    ctx.beginPath();
    ctx.arc(3, sw * 0.6, 6.6, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(25,12,12,0.6)';
    ctx.beginPath();
    ctx.arc(1.5, sw * 0.6, 6.6, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    if (z.helmet > 0) {
      // riot helmet: headshots ring off it until it cracks
      ctx.fillStyle = '#8f96a3';
      ctx.beginPath();
      ctx.arc(2.6, sw * 0.6, 7.6, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = '#5b6170';
      ctx.beginPath();
      ctx.arc(1.4, sw * 0.6, 5.2, 0, U.TAU);
      ctx.fill();
      ctx.fillStyle = '#14161c';
      ctx.fillRect(6.2, sw * 0.6 - 4, 2.2, 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(2.6, sw * 0.6, 6.6, -2.4, -1.2);
      ctx.stroke();
    }
    if (z.burnT > 0) {
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 13, 0, 0, U.TAU);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    if (z.freezeT > 0 || z.slowT > 0) {
      ctx.globalAlpha = alpha * (z.freezeT > 0 ? 0.7 : 0.32);
      ctx.fillStyle = '#a8efff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 13, 0, 0, U.TAU);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    if (z.flash > 0) {
      ctx.globalAlpha = alpha * Math.min(1, z.flash * 8);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 13, 0, 0, U.TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBoss(z) {
    const b = z.boss || {};
    const k = z.state === 'rise' ? U.clamp(1 - z.riseT / 1.6, 0, 1) : 1;
    const stunned = b.mode === 'stunned';
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.globalAlpha = 0.4 * k;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(4, 8, z.r * 1.25, z.r * 1.05, 0, 0, U.TAU);
    ctx.fill();
    ctx.globalAlpha = 0.25 + 0.75 * k;
    ctx.rotate(z.angle + (stunned ? Math.sin(R.time * 9) * 0.12 : 0));
    ctx.scale(0.5 + 0.5 * k, 0.5 + 0.5 * k);
    const raise = b.mode === 'slamWarn' ? 10 * U.clamp(1 - b.t / GW.Boss.CFG.slam.warn, 0, 1) : 0;
    const sw = Math.sin(b.spin * 5) * 2;
    // arms: heavy steel pistons
    ctx.strokeStyle = '#6a7080';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4, -24); ctx.lineTo(30 + raise + sw, -17);
    ctx.moveTo(4, 24); ctx.lineTo(30 + raise - sw, 17);
    ctx.stroke();
    ctx.fillStyle = '#3a3f4c';
    ctx.beginPath();
    ctx.arc(32 + raise + sw, -17, 8, 0, U.TAU);
    ctx.arc(32 + raise - sw, 17, 8, 0, U.TAU);
    ctx.fill();
    // coat
    ctx.fillStyle = z.shirt;
    ctx.beginPath();
    ctx.ellipse(-3, 0, 23, 30, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd426';
    for (let i = -2; i <= 2; i++) ctx.fillRect(3, i * 9 - 1.5, 3, 3);
    // shoulder pads
    ctx.fillStyle = '#4a4f5e';
    ctx.beginPath();
    ctx.arc(-2, -27, 11, 0, U.TAU);
    ctx.arc(-2, 27, 11, 0, U.TAU);
    ctx.fill();
    // front armour plate (most damage glances off it)
    ctx.strokeStyle = b.armorFlash > 0 ? '#ffffff' : '#9aa1b0';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(-2, 0, 27, -1.05, 1.05);
    ctx.stroke();
    // exposed core on the back: the weak point
    ctx.fillStyle = '#3a2a10';
    ctx.beginPath();
    ctx.arc(-24, 0, 10, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = b.weakFlash > 0 ? '#ffffff' : '#ffd426';
    ctx.beginPath();
    ctx.arc(-24, 0, 6.5, 0, U.TAU);
    ctx.fill();
    // porcelain head and top hat
    ctx.fillStyle = z.skin;
    ctx.beginPath();
    ctx.arc(8, 0, 13, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#c22a3a';
    ctx.beginPath();
    ctx.arc(18, 0, 3.2, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#16121e';
    ctx.beginPath();
    ctx.arc(3, 0, 14.5, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#2a2436';
    ctx.beginPath();
    ctx.arc(2, 0, 9.5, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#ff3b6b';
    ctx.fillRect(-2, -9.5, 3, 19);
    if (z.flash > 0) {
      ctx.globalAlpha = Math.min(1, z.flash * 6) * 0.6;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 32, 0, 0, U.TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Ground hazards: spitter acid puddles and the shadows of globs in flight. */
  function drawHazards() {
    for (const h of GW.Zombies.hazards) {
      if (!inView(h.x, h.y, h.r + 10)) continue;
      const a = Math.min(1, h.t / 0.6);
      ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = '#3f7a1c';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y, h.r, h.r * 0.86, 0, 0, U.TAU);
      ctx.fill();
      ctx.globalAlpha = 0.5 * a;
      ctx.fillStyle = '#7dff5a';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y, h.r * 0.7, h.r * 0.58, 0, 0, U.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    for (const g of GW.Zombies.acid) {
      if (g.x === undefined) continue;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 7, 5, 0, 0, U.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Everything that warns the player: enemy wind-ups, danger zones, boss attacks. Drawn in the glow pass. */
  function drawThreats() {
    const Zs = GW.Zombies, ZC = C.ZOMBIE, Bo = GW.Boss;
    // acid
    for (const h of Zs.hazards) {
      if (!inView(h.x, h.y, h.r + 20)) continue;
      const a = Math.min(1, h.t / 0.6);
      Art.drawGlow(ctx, '#7dff5a', h.x, h.y, h.r * 1.3, 0.3 * a);
      ctx.fillStyle = '#c8ff8a';
      for (let i = 0; i < 4; i++) {
        const ph = (R.time * 1.3 + i * 0.27 + h.x * 0.01) % 1;
        ctx.globalAlpha = (1 - ph) * 0.8 * a;
        ctx.beginPath();
        ctx.arc(h.x + Math.cos(i * 2.4 + h.y) * h.r * 0.55, h.y + Math.sin(i * 1.7 + h.x) * h.r * 0.45, 1.5 + ph * 3.5, 0, U.TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const g of Zs.acid) {
      if (g.x === undefined) continue;
      Art.drawGlow(ctx, '#7dff5a', g.x, g.y - g.h, 18, 1);
      Art.drawGlow(ctx, '#ffffff', g.x, g.y - g.h, 6, 0.9);
      // where it will land
      ctx.strokeStyle = '#7dff5a';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(g.tx, g.ty, ZC.spit.puddleR, 0, U.TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    for (const z of Zs.list) {
      if (!inView(z.x, z.y, 400)) continue;
      const ca = Math.cos(z.angle), sa = Math.sin(z.angle);
      if (z.state === 'spit') {
        const k = U.clamp(1 - z.attackT / ZC.spit.windup, 0, 1);
        Art.drawGlow(ctx, '#7dff5a', z.x + ca * 9, z.y + sa * 9, 10 + k * 18, 0.5 + k * 0.5);
      } else if (z.state === 'crouch' || z.state === 'leap') {
        const d = Math.min(ZC.leap.range, M.raycast(z.x, z.y, ca, sa, ZC.leap.range, M.solidForZombie));
        ctx.strokeStyle = '#ff4fd8';
        ctx.globalAlpha = z.state === 'crouch' ? 0.35 + 0.45 * Math.abs(Math.sin(R.time * 22)) : 0.25;
        ctx.lineWidth = z.state === 'crouch' ? 3 : 6;
        ctx.setLineDash(z.state === 'crouch' ? [8, 6] : []);
        ctx.beginPath();
        ctx.moveTo(z.x, z.y);
        ctx.lineTo(z.x + ca * d, z.y + sa * d);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        Art.drawGlow(ctx, '#ff4fd8', z.x, z.y, 26, 0.6);
      } else if (z.state === 'swell') {
        const k = U.clamp(1 - z.attackT / ZC.bloat.swell, 0, 1);
        ctx.fillStyle = '#ff7a1a';
        ctx.globalAlpha = 0.08 + k * 0.14;
        ctx.beginPath();
        ctx.arc(z.x, z.y, ZC.bloat.radius, 0, U.TAU);
        ctx.fill();
        ctx.strokeStyle = '#ffd426';
        ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(R.time * 24));
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y, ZC.bloat.radius * (0.2 + 0.8 * k), 0, U.TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        Art.drawGlow(ctx, '#ffd426', z.x, z.y, 30 + k * 30, 0.7);
      }
      if (z.burnT > 0 && Math.random() < 0.3) FX.sparks(z.x + U.rand(-6, 6), z.y + U.rand(-6, 6), -Math.PI / 2, 1, '#ff7a1a', 110, 0.5);
    }

    // boss
    const z = Bo.ref;
    if (z && z.boss && inView(z.x, z.y, 900)) {
      const b = z.boss, BC = Bo.CFG;
      const ca = Math.cos(z.angle), sa = Math.sin(z.angle);
      // weak point always glows on its back
      const wx = z.x - ca * 26, wy = z.y - sa * 26;
      Art.drawGlow(ctx, '#ffd426', wx, wy, b.mode === 'stunned' ? 34 + Math.sin(R.time * 14) * 8 : 22, b.mode === 'stunned' ? 1 : 0.75);
      if (b.mode === 'chargeWarn' || b.mode === 'charge') {
        const d = M.raycast(z.x, z.y, b.dirX, b.dirY, BC.charge.range, M.blocksBullet);
        const k = b.mode === 'charge' ? 1 : U.clamp(1 - b.t / BC.charge.warn, 0, 1);
        const nx = -b.dirY * z.r, ny = b.dirX * z.r;
        ctx.fillStyle = '#ff3b4e';
        ctx.globalAlpha = 0.1 + 0.22 * k * (0.6 + 0.4 * Math.abs(Math.sin(R.time * 20)));
        ctx.beginPath();
        ctx.moveTo(z.x + nx, z.y + ny);
        ctx.lineTo(z.x + nx + b.dirX * d, z.y + ny + b.dirY * d);
        ctx.lineTo(z.x - nx + b.dirX * d, z.y - ny + b.dirY * d);
        ctx.lineTo(z.x - nx, z.y - ny);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ff3b4e';
        ctx.globalAlpha = 0.5 + 0.5 * k;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (b.mode === 'slamWarn') {
        const k = U.clamp(1 - b.t / BC.slam.warn, 0, 1);
        ctx.fillStyle = '#ff3b4e';
        ctx.globalAlpha = 0.1 + 0.2 * k;
        ctx.beginPath();
        ctx.arc(z.x, z.y, BC.slam.radius, 0, U.TAU);
        ctx.fill();
        ctx.strokeStyle = '#ff3b4e';
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(z.x, z.y, BC.slam.radius, 0, U.TAU);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(z.x, z.y, BC.slam.radius * k, 0, U.TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (b.mode === 'volleyWarn') {
        Art.drawGlow(ctx, '#ff4fd8', z.x, z.y, 60 + (1 - b.t / BC.volley.warn) * 50, 0.8);
      } else if (b.mode === 'phase') {
        Art.drawGlow(ctx, '#ffffff', z.x, z.y, 90 + Math.sin(R.time * 30) * 14, 0.8);
      } else if (b.mode === 'stunned') {
        for (let i = 0; i < 3; i++) {
          const a = R.time * 5 + (i * U.TAU) / 3;
          Art.drawGlow(ctx, '#ffe14d', z.x + Math.cos(a) * 26, z.y - 30 + Math.sin(a) * 9, 9, 1);
        }
      }
      if (b.phase >= 3) Art.drawGlow(ctx, '#ff3b4e', z.x, z.y, 70 + Math.sin(R.time * 10) * 10, 0.35);
    }
    for (const o of Bo.orbs) {
      if (!inView(o.x, o.y, 30)) continue;
      Art.drawGlow(ctx, '#ff4fd8', o.x, o.y, 22, 1);
      Art.drawGlow(ctx, '#ffffff', o.x, o.y, 8, 1);
    }

    // panic-room hatch lights up whenever it can be used
    const S = M.safeRoom;
    if ((S.state === 'sealed' || S.hatchT > 0) && inView(S.rx, S.ry, 300)) {
      const hx = (S.hatch.tx + 0.5) * T, hy = (S.hatch.ty + 0.5) * T;
      Art.drawGlow(ctx, '#3dff8b', hx, hy, 34 + Math.sin(R.time * 6) * 6, 0.8);
      ctx.strokeStyle = '#3dff8b';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(hx - 15, hy - 15, 30, 30);
      ctx.globalAlpha = 1;
    }

    // the Starwheel turns slowly once its zone has power
    const W = GW.MapArt.WHEEL, wl = lv(M.Z.FERRIS);
    if (wl > 0.05 && inView(W.x, W.y, W.r + 40)) {
      const cols = ['#ffd426', '#ff4fd8', '#19f0ff', '#3dff8b'];
      for (let i = 0; i < 12; i++) {
        const a = R.time * 0.16 + (i / 12) * U.TAU;
        const cx = W.x + Math.cos(a) * W.r, cy = W.y + Math.sin(a) * W.r;
        Art.drawGlow(ctx, cols[i % 4], cx, cy, 26, 0.8 * wl);
        ctx.fillStyle = cols[i % 4];
        ctx.globalAlpha = wl;
        ctx.fillRect(cx - 7, cy - 6, 14, 12);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawCorpse(c) {
    const a = U.clamp(c.life / 1.2, 0, 1);
    const s = c.r / 13;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.scale(s, s);
    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = '#4a0912';
    ctx.beginPath();
    ctx.ellipse(-2, 0, 15, 12, 0, 0, U.TAU);
    ctx.fill();
    ctx.strokeStyle = c.skin;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(13, -13);
    ctx.moveTo(0, 9);
    ctx.lineTo(10, 15);
    ctx.stroke();
    ctx.fillStyle = c.shirt;
    ctx.beginPath();
    ctx.ellipse(-3, 0, 9, 11, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.arc(6, 1, 6, 0, U.TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Co-op: names and health over teammates, and an arrow at the screen edge when they are off-screen. */
  function drawTags() {
    const z = R.cam.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const fs = Math.round(11 * R.dpr);
    ctx.font = '900 ' + fs + 'px ' + GW.FONT;
    for (const rp of GW.Net.remotes.values()) {
      if (!rp.alive) continue;
      const sx = rp.x * z + R.ox, sy = rp.y * z + R.oy;
      const m = 26 * R.dpr;
      if (sx > -m && sx < R.vw + m && sy > -m && sy < R.vh + m) {
        const y = sy - 26 * z;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = rp.jacket;
        ctx.shadowColor = rp.jacket;
        ctx.shadowBlur = 8;
        ctx.fillText(rp.name, sx, y - 5 * R.dpr);
        ctx.shadowBlur = 0;
        const bw = 34 * R.dpr, bh = 3 * R.dpr;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sx - bw / 2, y - 3 * R.dpr, bw, bh);
        ctx.fillStyle = rp.jacket;
        ctx.fillRect(sx - bw / 2, y - 3 * R.dpr, bw * U.clamp(rp.hp / (rp.maxHp || 100), 0, 1), bh);
      } else {
        // edge arrow pointing toward the teammate
        const cx = R.vw / 2, cy = R.vh / 2, a = Math.atan2(sy - cy, sx - cx);
        const pad = 22 * R.dpr;
        const k = Math.min((cx - pad) / Math.abs(Math.cos(a) || 1e-6), (cy - pad) / Math.abs(Math.sin(a) || 1e-6));
        const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = rp.jacket;
        ctx.beginPath();
        ctx.moveTo(10 * R.dpr, 0);
        ctx.lineTo(-6 * R.dpr, -7 * R.dpr);
        ctx.lineTo(-6 * R.dpr, 7 * R.dpr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = rp.jacket;
        ctx.fillText(rp.name, ax - Math.cos(a) * 18 * R.dpr, ay - Math.sin(a) * 18 * R.dpr + fs / 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Perk machines read as scenery to new players: give each one a floating sign with its icon,
   * name and price (or what it still needs), and a pulsing glow when it is ready to sell.
   */
  const perkIcons = {};
  function drawMachineTags() {
    const z = R.cam.zoom, I = GW.Interact, P = GW.Player, L = GW.L;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const d = R.dpr;
    for (const sp of M.perkSpots) {
      if (sp.zone === undefined || !M.zones[sp.zone] || !M.zones[sp.zone].open) continue;
      const sx = sp.x * z + R.ox, sy = sp.y * z + R.oy;
      if (sx < -120 * d || sx > R.vw + 120 * d || sy < -120 * d || sy > R.vh + 120 * d) continue;
      const perk = GW.PERKS[sp.perk];
      const powered = I.powered(sp.zone), owned = !!P.perks[sp.perk];
      const near = U.dist(P.x, P.y, sp.x, sp.y) < 260;
      const bob = Math.sin(R.time * 2.2 + sp.tx) * 3 * d;
      const y = sy - 64 * z + bob;
      // glow on the machine itself
      if (powered && !owned) Art.drawGlow(ctx, perk.color, sx, sy - 10 * z, 70 * z, 0.35 + 0.2 * Math.sin(R.time * 4 + sp.ty));
      // sign: icon + name, and the price or what it needs
      const ic = perkIcons[sp.perk] || (perkIcons[sp.perk] = Art.iconCanvas('perk', sp.perk, 40));
      const isz = (near ? 30 : 24) * d;
      ctx.globalAlpha = owned ? 0.45 : powered ? 1 : 0.7;
      ctx.drawImage(ic, sx - isz / 2, y - isz / 2 - 12 * d, isz, isz);
      const name = L ? L.t(perk.name) : perk.name;
      ctx.font = '900 ' + Math.round((near ? 12 : 10) * d) + 'px ' + GW.FONT;
      ctx.lineWidth = 3 * d;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(name, sx, y + 12 * d);
      ctx.fillStyle = perk.color;
      ctx.fillText(name, sx, y + 12 * d);
      const sub = owned ? '✓' : !powered ? (L ? L.t('NEEDS POWER') : 'NEEDS POWER') : '$' + perk.cost;
      ctx.font = '700 ' + Math.round(9 * d) + 'px ' + GW.FONT;
      ctx.strokeText(sub, sx, y + 25 * d);
      ctx.fillStyle = owned ? '#3dff8b' : powered ? '#ffe14d' : '#ff6b7a';
      ctx.fillText(sub, sx, y + 25 * d);
      ctx.globalAlpha = 1;
    }
  }

  function drawPlayer(P) {
    const w = P.weapon();
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(2, 4, 14, 12, 0, 0, U.TAU);
    ctx.fill();
    ctx.globalAlpha = P.invuln > 0 && Math.sin(R.time * 30) > 0 ? 0.45 : 1;
    ctx.rotate(P.angle);
    ctx.scale(1.15, 1.15);
    const rec = P.recoil * 3;
    const bob = P.moving ? Math.sin(P.walkT) * 1.2 : 0;
    ctx.lineCap = 'round';
    if (P.dashT > 0) {
      // sliding: low and stretched along the slide, with a speed streak behind
      ctx.rotate(U.angDiff(P.angle, P.dashA || P.angle));
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = P.jacket || '#23aebf';
      ctx.fillRect(-34, -6, 26, 12);
      ctx.globalAlpha /= 0.5;
      ctx.rotate(-U.angDiff(P.angle, P.dashA || P.angle));
      ctx.scale(1.12, 0.86);
    }
    if (w && P.meleeT <= 0 && w.s.type === 'melee') {
      // katana / axe: held ready, swept across on a swing
      const s = w.s, axe = s.cls === 'axe';
      const sw = P.swingT > 0 ? 1 - P.swingT / (P.swingDur || 0.24) : -1;
      const side = P.swingSide || 1;
      const a = sw >= 0 ? (-1.35 + 2.7 * (1 - (1 - sw) * (1 - sw))) * side : 0.5;
      const hx = Math.cos(a) * 13, hy = Math.sin(a) * 13;
      ctx.strokeStyle = '#1d8f9e';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(1, 9);
      ctx.lineTo(hx, hy);
      ctx.moveTo(1, -9);
      ctx.lineTo(hx * 0.8, hy * 0.8 - 2);
      ctx.stroke();
      const ca = Math.cos(a), sa = Math.sin(a);
      const L = axe ? 24 : 32;
      // handle
      ctx.strokeStyle = axe ? '#6b4a2b' : '#231b33';
      ctx.lineWidth = axe ? 3.4 : 3;
      ctx.beginPath();
      ctx.moveTo(hx - ca * 4, hy - sa * 4);
      ctx.lineTo(hx + ca * (axe ? L : 7), hy + sa * (axe ? L : 7));
      ctx.stroke();
      if (axe) {
        // axe head at the end of the haft
        const ex = hx + ca * L, ey = hy + sa * L, nx = -sa * side, ny = ca * side;
        ctx.fillStyle = '#c9ced8';
        ctx.beginPath();
        ctx.moveTo(ex - ca * 3, ey - sa * 3);
        ctx.lineTo(ex - ca * 7 + nx * 11, ey - sa * 7 + ny * 11);
        ctx.lineTo(ex + ca * 5 + nx * 12, ey + sa * 5 + ny * 12);
        ctx.lineTo(ex + ca * 4, ey + sa * 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(ex - ca * 7 + nx * 11, ey - sa * 7 + ny * 11);
        ctx.lineTo(ex + ca * 5 + nx * 12, ey + sa * 5 + ny * 12);
        ctx.stroke();
      } else {
        // guard and a glowing blade
        ctx.strokeStyle = '#ffd426';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx + ca * 7 - sa * 4, hy + sa * 7 + ca * 4);
        ctx.lineTo(hx + ca * 7 + sa * 4, hy + sa * 7 - ca * 4);
        ctx.stroke();
        ctx.strokeStyle = s.color;
        ctx.globalAlpha *= 0.45;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(hx + ca * 8, hy + sa * 8);
        ctx.lineTo(hx + ca * L, hy + sa * L);
        ctx.stroke();
        ctx.globalAlpha /= 0.45;
        ctx.strokeStyle = '#eef6ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = '#e0b890';
      ctx.beginPath();
      ctx.arc(hx, hy, 2.6, 0, U.TAU);
      ctx.fill();
    } else if (w && P.meleeT <= 0) {
      const s = w.s, len = s.len;
      const thick = s.cls === 'minigun' || s.cls === 'launcher' ? 7.5 : s.cls === 'lmg' || s.cls === 'shotgun' || s.cls === 'energy' || s.cls === 'flame' ? 6.5 : s.cls === 'pistol' ? 4.5 : 5.2;
      const gx = (s.cls === 'pistol' ? 12 : 7) - rec;
      // arms reaching to the weapon
      ctx.strokeStyle = '#1d8f9e';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(1, -9);
      ctx.lineTo(gx + (s.cls === 'pistol' ? 1 : len * 0.55), -1.5);
      ctx.moveTo(1, 9);
      ctx.lineTo(gx + 2, 2);
      ctx.stroke();
      // weapon body
      ctx.fillStyle = '#15131b';
      ctx.fillRect(gx, -thick / 2, len + 4, thick);
      ctx.fillStyle = '#2b2836';
      ctx.fillRect(gx, -thick / 2, (len + 4) * 0.45, thick);
      if (s.cls === 'sniper') ctx.fillRect(gx + 6, -thick / 2 - 2.5, 10, 2.5);
      if (s.cls === 'minigun') {
        // barrel cluster, spinning while it fires
        ctx.fillStyle = '#3a3646';
        const spin = P.recoil > 0 ? (R.time * 40) % 1 : 0;
        for (let i = 0; i < 3; i++) ctx.fillRect(gx + len * 0.5, -3 + ((i + spin) % 3) * 2.2, len * 0.6, 1.3);
      } else if (s.cls === 'flame') {
        // fuel tank and a pilot light
        ctx.fillStyle = '#7a2a12';
        ctx.fillRect(gx + 3, thick / 2, 9, 4);
        ctx.fillStyle = w.up ? s.color : '#ff9a2a';
        ctx.beginPath();
        ctx.arc(gx + len + 5, 0, 1.8 + Math.sin(R.time * 30) * 0.5, 0, U.TAU);
        ctx.fill();
      } else if (s.cls === 'launcher') {
        ctx.fillStyle = '#3a3646';
        ctx.fillRect(gx + len * 0.3, -thick / 2 - 1.5, len * 0.4, thick + 3);
      }
      if (w.up || s.cls === 'energy') {
        ctx.fillStyle = s.color;
        ctx.fillRect(gx + 2, -0.9, len + 1, 1.8);
      }
      // hands
      ctx.fillStyle = '#e0b890';
      ctx.beginPath();
      ctx.arc(gx + 2, 2, 2.6, 0, U.TAU);
      ctx.arc(gx + (s.cls === 'pistol' ? 1 : len * 0.55), -1.5, 2.6, 0, U.TAU);
      ctx.fill();
    } else {
      // knife swing / empty hands
      const k = P.meleeT > 0 ? 1 - P.meleeT / 0.2 : 0.5;
      const a = -1.0 + k * 2.0;
      ctx.strokeStyle = '#1d8f9e';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(1, 9);
      ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
      ctx.moveTo(1, -9);
      ctx.lineTo(9, -7);
      ctx.stroke();
      ctx.strokeStyle = '#dfe9f2';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 15);
      ctx.lineTo(Math.cos(a) * 27, Math.sin(a) * 27);
      ctx.stroke();
      if (P.meleeT > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 26, -1.0, a);
        ctx.stroke();
      }
    }
    // torso (jacket): each co-op player wears their own colour
    ctx.fillStyle = P.jacket || '#23aebf';
    ctx.beginPath();
    ctx.ellipse(-1, bob * 0.4, 8, 12.5, 0, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#ff4fd8';
    ctx.fillRect(-5, -12 + bob * 0.4, 3, 24); // racing stripe
    // head with cap
    ctx.fillStyle = '#e0b890';
    ctx.beginPath();
    ctx.arc(1.5, 0, 6.4, 0, U.TAU);
    ctx.fill();
    ctx.fillStyle = '#231b33';
    ctx.beginPath();
    ctx.arc(0.5, 0, 6.6, Math.PI * 0.42, Math.PI * 1.58);
    ctx.fill();
    ctx.fillRect(1, -5.5, 5.5, 11);
    ctx.fillStyle = '#ffe14d';
    ctx.fillRect(5.5, -4.5, 1.6, 9);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* ground-level dynamic objects                                       */
  /* ------------------------------------------------------------------ */
  function drawGround(power) {
    const I = GW.Interact;
    // dance floor on the Overclock Stage pulses to the beat once powered
    const stage = lv(M.Z.VAULT);
    if (stage > 0.3 && inView(32 * T, 36 * T, 7 * T)) {
      const beat = Math.floor(R.time * (104 / 60));
      const pal = ['#ff4fd8', '#19f0ff', '#ffe14d', '#a855ff', '#3dff8b'];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let ty = 33; ty <= 38; ty++)
        for (let tx = 26; tx <= 37; tx++) {
          if (M.tile(tx, ty) !== M.TT.FLOOR) continue;
          for (let j = 0; j < 2; j++)
            for (let i = 0; i < 2; i++) {
              const h = U.hash(tx * 2 + i, ty * 2 + j, beat);
              if (h > 0.34) continue;
              ctx.globalAlpha = stage * (0.2 + h);
              ctx.fillStyle = pal[Math.floor(h * 14.7) % 5];
              ctx.fillRect(tx * T + i * 24 + 1, ty * T + j * 24 + 1, 22, 22);
            }
        }
      ctx.restore();
    }

    for (const c of FX.corpses) if (inView(c.x, c.y, 30)) drawCorpse(c);

    // power-up ground halo
    for (const pu of I.powerups) {
      if (!inView(pu.x, pu.y, 60)) continue;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = GW.POWERUPS[pu.type].color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, 18 + Math.sin(pu.t * 4) * 3, 0, U.TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // grenades
    for (const g of GW.Weapons.grenades) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(g.x + 2, g.y + 3, 5, 0, U.TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.spin);
      ctx.fillStyle = g.kind === 'cryo' ? '#4a8fa8' : g.kind === 'lure' ? '#a8327f' : g.kind === 'bubble' ? '#2f8a54' : '#3a5a32';
      ctx.fillRect(-4.5, -5.5, 9, 11);
      ctx.fillStyle = '#1e2e1a';
      ctx.fillRect(-2, -8, 4, 3);
      ctx.restore();
    }

    // opaque particles (blood, casings, smoke)
    for (const p of FX.parts) {
      if (p.glow || !inView(p.x, p.y, 20)) continue;
      const a = U.clamp(p.life / p.max, 0, 1);
      if (p.smoke) {
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, U.TAU);
        ctx.fill();
      } else {
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ */
  /* dynamic objects that sit at wall height                            */
  /* ------------------------------------------------------------------ */
  function drawDoors() {
    for (const d of M.doors) {
      if (d.open && d.openT >= 1) continue;
      if (!inView(d.x, d.y, 160)) continue;
      const k = d.open ? d.openT : 0;
      const col = M.zones[d.b].color;
      if (d.power) {
        // laser gate emitters (the beams are drawn in the glow pass)
        ctx.fillStyle = '#1b1528';
        ctx.fillRect(d.rx - 6, d.ry - WH + 8, 12, T - 8);
        ctx.fillRect(d.rx + d.rw - 6, d.ry - WH + 8, 12, T - 8);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = 1 - k;
      for (const [tx, ty] of d.tiles) {
        const x = tx * T, y = ty * T - WH + k * 14;
        ctx.fillStyle = '#0a0812';
        ctx.fillRect(x, y + T, T, WH - k * 14);
        ctx.fillStyle = '#17132a';
        ctx.fillRect(x, y, T, T);
        // hazard chevrons in the destination zone's colour
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 3, y + 3, T - 6, T - 6);
        ctx.clip();
        ctx.strokeStyle = U.rgba(col, 0.55);
        ctx.lineWidth = 6;
        for (let i = -2; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(x + i * 16, y + T);
          ctx.lineTo(x + i * 16 + T, y);
          ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
      }
      ctx.restore();
    }
  }

  function drawPlanks() {
    for (const w of M.windows) {
      if (w.planks <= 0 || !inView(w.x, w.y, 60)) continue;
      ctx.save();
      ctx.translate(w.x, w.y);
      if (w.dx !== 0) ctx.rotate(Math.PI / 2);
      for (let i = 0; i < w.planks; i++) {
        const off = (i - 2.5) * 7.2;
        const jig = (U.hash(w.id, i, 3) - 0.5) * 0.16;
        ctx.save();
        ctx.translate(0, off);
        ctx.rotate(jig);
        ctx.fillStyle = i % 2 ? '#6b4a2b' : '#7a5632';
        ctx.fillRect(-T / 2 - 3, -2.8, T + 6, 5.6);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-T / 2 - 3, 1.8, T + 6, 1);
        ctx.fillStyle = '#2a1c10';
        ctx.fillRect(-T / 2, -1, 2, 2);
        ctx.fillRect(T / 2 - 2, -1, 2, 2);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function drawBoxes(power) {
    const b = GW.Interact.box;
    M.boxSpots.forEach((s, idx) => {
      if (!inView(s.x, s.y, 120)) return;
      const x = s.tx * T, y = s.ty * T, w = s.w * T, h = s.h * T;
      const active = idx === b.spot;
      // plinth
      ctx.fillStyle = '#0c0914';
      ctx.fillRect(x + 2, y + h - 8, w - 4, 8);
      ctx.fillStyle = '#181226';
      ctx.fillRect(x + 2, y - 6, w - 4, h - 2);
      if (!active) {
        ctx.strokeStyle = 'rgba(255,225,77,0.18)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 7, y - 2, w - 14, h - 12);
        ctx.setLineDash([]);
        return;
      }
      let lift = 0, alpha = 1;
      if (b.state === 'moving') {
        const k = 1 - b.t / 1.4;
        lift = k * 40;
        alpha = 1 - k;
      } else if (b.state === 'jester') lift = Math.sin(R.time * 40) * 1.5;
      const open = b.state === 'rolling' || b.state === 'ready' || b.state === 'jester';
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(0, -8 - lift);
      if (GW.Assets.drawFit(ctx, open ? 'box_open' : 'box_closed', x + 2, y - 2, w - 4, h - 4)) {
        if (open) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = U.rgba(b.state === 'jester' ? '#ff3b4e' : '#ffe14d', 0.18 + 0.12 * Math.sin(R.time * 12));
          ctx.fillRect(x + 8, y + 3, w - 16, h - 16);
        }
        ctx.restore();
        return;
      }
      // crate body
      ctx.fillStyle = '#3d2616';
      ctx.fillRect(x + 5, y, w - 10, h - 10);
      ctx.fillStyle = open ? '#120a05' : '#5a3a20';
      ctx.fillRect(x + 8, y + 3, w - 16, h - 16);
      if (open) {
        ctx.fillStyle = U.rgba(b.state === 'jester' ? '#ff3b4e' : '#ffe14d', 0.35 + 0.2 * Math.sin(R.time * 12));
        ctx.fillRect(x + 8, y + 3, w - 16, h - 16);
      }
      ctx.strokeStyle = '#ffd426';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 5, y, w - 10, h - 10);
      if (!open) {
        ctx.fillStyle = '#ffd426';
        ctx.font = '900 20px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (s.w > s.h) {
          ctx.fillText('?', x + w * 0.27, y + h / 2 - 5);
          ctx.fillText('?', x + w * 0.73, y + h / 2 - 5);
        } else {
          ctx.fillText('?', x + w / 2, y + h * 0.25);
          ctx.fillText('?', x + w / 2, y + h * 0.68);
        }
      }
      ctx.restore();
    });
  }

  function drawPap(power) {
    const pm = M.pap, k = GW.Interact.pap;
    if (!inView(pm.x, pm.y, 160)) return;
    const x = pm.tx * T, y = pm.ty * T - WH, w = pm.w * T, h = pm.h * T;
    const shake = k.state === 'working' ? U.rand(-1.2, 1.2) : 0;
    if (GW.Assets.get('pap')) {
      ctx.save();
      ctx.translate(shake, 0);
      ctx.fillStyle = '#12081a';
      ctx.fillRect(x, y + h, w, WH);
      GW.Assets.drawFit(ctx, 'pap', x, y, w, h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(shake, 0);
    ctx.fillStyle = '#12081a';
    ctx.fillRect(x, y + h, w, WH);
    ctx.fillStyle = '#2a0f33';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#16081c';
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    // twin rotors
    for (const side of [-1, 1]) {
      const cx = pm.x + side * 26, cy = y + h / 2;
      const spin = k.anim * (k.state === 'working' ? 14 : 1.5) * side * (lv(M.Z.VAULT) > 0.3 ? 1 : 0);
      ctx.strokeStyle = '#5a2a66';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, U.TAU);
      ctx.stroke();
      ctx.strokeStyle = '#8b3fa0';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const a = spin + (i * U.TAU) / 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#07040b';
    ctx.fillRect(pm.x - 8, y + 10, 16, h - 20); // weapon slot
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  function drawWallPlates(power) {
    for (const wb of M.wallbuys) {
      if (!inView(wb.x, wb.y, 100)) continue;
      ctx.fillStyle = 'rgba(8,5,16,0.85)';
      ctx.fillRect(wb.x - 44, wb.y - WH - 19, 88, 38);
    }
    // generator breaker boxes, one per zone
    for (const ps of M.generators) {
      if (!inView(ps.x, ps.y, 80)) continue;
      const on = GW.Interact.powered(ps.zone);
      const x = ps.x, y = ps.y - WH;
      ctx.fillStyle = '#2b3036';
      ctx.fillRect(x - 15, y - 17, 30, 34);
      ctx.fillStyle = '#0f1114';
      ctx.fillRect(x - 3, y - 12, 6, 24);
      ctx.strokeStyle = '#d0d4da';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (on ? 0 : 0), y + (on ? 11 : -11));
      ctx.stroke();
      ctx.fillStyle = on ? '#3dff8b' : '#ff3b4e';
      ctx.beginPath();
      ctx.arc(x, y + (on ? 11 : -11), 4, 0, U.TAU);
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ */
  /* lighting                                                           */
  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /* expansion: allies, gadgets, facilities                             */
  /* ------------------------------------------------------------------ */
  function drawLure() {
    const l = GW.Gadgets.activeLure();
    if (!l || !inView(l.x, l.y, 40)) return;
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(2, 5, 10, 7, 0, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#c9c4dc';
    ctx.beginPath(); ctx.arc(0, -2, 8, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = '#6a6290';
    ctx.lineWidth = 1;
    for (let i = -6; i <= 6; i += 3) {
      ctx.beginPath(); ctx.moveTo(-8, -2 + i); ctx.lineTo(8, -2 + i); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, -10); ctx.lineTo(i, 6); ctx.stroke();
    }
    ctx.restore();
  }

  function drawAllies() {
    const AL = GW.Allies;
    const p = AL.pal;
    if (p && inView(p.x, p.y, 40)) {
      const bob = Math.sin(p.anim * 5) * 2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(2, 9, 11, 7, 0, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.translate(0, -5 + bob);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#1d1530';
      ctx.fillRect(4, -2.5, 17, 5);
      ctx.fillStyle = '#6b44a8';
      ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#3a2563';
      ctx.beginPath(); ctx.arc(-2.5, 0, 8, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#100820';
      Art.roundRect(ctx, 2.5, -6.5, 7, 13, 2.5);
      ctx.fill();
      ctx.strokeStyle = '#9b7fd0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-14, -9); ctx.stroke();
      ctx.restore();
    }
    const st = AL.sentry;
    if (st && inView(st.x, st.y, 40)) {
      const hover = -4 - st.rise * 4 + Math.sin(st.anim * 4) * 1.5;
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(1, 6, 13, 8, 0, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.translate(0, hover);
      ctx.fillStyle = '#1b2a33';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * U.TAU;
        if (i === 0) ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
        else ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
      }
      ctx.closePath();
      ctx.fill();
      ctx.rotate(st.angle);
      ctx.fillStyle = '#0c1418';
      ctx.fillRect(2, -3.5, 20, 3);
      ctx.fillRect(2, 0.5, 20, 3);
      ctx.fillStyle = '#2f4a57';
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, U.TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawShutter() {
    const S = M.safeRoom;
    if (!inView(S.dx, S.dy, 150)) return;
    const x = S.dx, y = S.dy - WH;
    if (S.state === 'sealed') {
      ctx.fillStyle = '#0d1410';
      ctx.fillRect(x, y + S.dh, S.dw, WH);
      ctx.fillStyle = '#3b4a44';
      ctx.fillRect(x, y, S.dw, S.dh);
      ctx.fillStyle = '#26302c';
      for (let i = 0; i < 12; i++) ctx.fillRect(x + 4, y + 4 + i * 8, S.dw - 8, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, S.dw - 2, S.dh - 2);
    } else {
      // open shutter: the rolled-up drum and side rails
      ctx.fillStyle = '#26302c';
      ctx.fillRect(x + 2, y - 2, S.dw - 4, 8);
      ctx.fillRect(x + 2, y + S.dh - 6, S.dw - 4, 6);
    }
  }

  function wallItems() {
    const items = [];
    for (const v of M.vendors) {
      const icon = v.kind === 'tactical' ? v.item : v.kind;
      const price = v.kind === 'armor' ? C.ARMOR.cost : v.kind === 'tactical' ? GW.TACTICALS[v.item].cost : v.kind === 'pal' ? C.PAL.cost : C.SENTRY.cost;
      items.push({ spot: v, icon, price, needsPower: v.kind === 'pal' || v.kind === 'sentry', zone: v.zone });
    }
    for (const tr of M.traps) items.push({ spot: tr.sw, icon: tr.kind, price: C.TRAP.cost, needsPower: true, trap: tr, zone: tr.zone });
    items.push({ spot: M.safeRoom.console, icon: 'safe', price: C.SAFEROOM.cost, needsPower: false, safe: true });
    return items;
  }

  function drawFacilityPlates() {
    for (const it of wallItems()) {
      const v = it.spot;
      if (!inView(v.x, v.y, 80)) continue;
      ctx.fillStyle = 'rgba(8,5,16,0.88)';
      ctx.fillRect(v.x - 19, v.y - WH - 19, 38, 38);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(v.x - 18.5, v.y - WH - 18.5, 37, 37);
    }
  }

  function drawFacilityGlow(power) {
    const I = GW.Interact, AL = GW.Allies, Gd = GW.Gadgets;
    // active traps
    for (const tr of M.traps) {
      if (tr.state !== 'active' || !inView(tr.rx + tr.rw / 2, tr.ry + tr.rh / 2, 200)) continue;
      const col = GW.TRAPS[tr.kind].color;
      const cx = tr.rx + tr.rw / 2, cy = tr.ry + tr.rh / 2;
      const fade = Math.min(1, tr.t / 1.5);
      if (tr.kind === 'zap') {
        ctx.globalAlpha = fade * (0.12 + Math.random() * 0.12);
        ctx.fillStyle = col;
        ctx.fillRect(tr.rx, tr.ry, tr.rw, tr.rh);
        ctx.globalAlpha = 1;
        Art.drawGlow(ctx, col, cx, cy, Math.max(tr.rw, tr.rh) * 0.8, 0.35 * fade);
      } else if (tr.kind === 'fire') {
        for (let j = 0; j < tr.h; j++)
          for (let i = 0; i < tr.w; i++) {
            const fx = tr.rx + (i + 0.5) * T, fy = tr.ry + (j + 0.5) * T;
            const fl = 0.6 + 0.4 * Math.sin(R.time * 23 + i * 3.1 + j * 5.3);
            Art.drawGlow(ctx, '#ff7a1a', fx, fy, 34 + fl * 14, 0.55 * fade);
            Art.drawGlow(ctx, '#ffd426', fx, fy - 6, 16 + fl * 8, 0.6 * fade);
          }
      } else {
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const y = tr.ry + 8 + (0.5 + 0.5 * Math.sin(R.time * (2.2 + i * 0.7) + i * 2.1)) * (tr.rh - 16);
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.35 * fade;
          ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(tr.rx, y); ctx.lineTo(tr.rx + tr.rw, y); ctx.stroke();
          ctx.globalAlpha = fade;
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // wall machines: icon + status light
    for (const it of wallItems()) {
      const v = it.spot;
      if (!inView(v.x, v.y, 80)) continue;
      const live = !it.needsPower || I.powered(it.zone);
      let col = Art.GADGET_COLORS[it.icon] || '#ffffff';
      let lamp = live ? '#3dff8b' : '#ff3b4e';
      if (it.trap && it.trap.state === 'active') lamp = '#ff3b4e';
      else if (it.trap && it.trap.state === 'cooldown') lamp = '#ffb14d';
      if (it.safe) {
        const S = M.safeRoom;
        lamp = S.state === 'sealed' ? '#ff3b4e' : S.cd > 0 ? '#ffb14d' : '#3dff8b';
      }
      const a = live ? 0.85 + 0.15 * Math.sin(R.time * 2.6 + v.tx) : 0.3;
      Art.drawGlow(ctx, col, v.x, v.y - WH, 46, 0.22 * a);
      ctx.globalAlpha = a;
      Art.gadgetIcon(ctx, it.icon, v.x, v.y - WH - 2, 22, col);
      ctx.globalAlpha = 1;
      Art.drawGlow(ctx, lamp, v.x + 13, v.y - WH - 13, 9, 0.9);
    }

    // teleporter pads
    for (const pr of M.pads) {
      for (const [e, other] of [[pr.a, pr.b], [pr.b, pr.a]]) {
        if (!inView(e.x, e.y, 80)) continue;
        const ready = I.powered(e.zone) && I.powered(other.zone) && M.zones[other.zone].open && M.zones[e.zone].open;
        if (!ready) continue;
        const cd = pr.cd > 0 ? pr.cd / C.TELEPORT.cooldown : 0;
        const a = (cd > 0 ? 0.35 : 0.85) * lv(e.zone);
        Art.drawGlow(ctx, pr.color, e.x, e.y, 48, a * 0.6);
        ctx.strokeStyle = pr.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = a;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -R.time * 30;
        ctx.beginPath(); ctx.arc(e.x, e.y, 24, 0, U.TAU); ctx.stroke();
        ctx.setLineDash([]);
        if (cd > 0) {
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(e.x, e.y, 29, -Math.PI / 2, -Math.PI / 2 + U.TAU * (1 - cd)); ctx.stroke();
        } else {
          ctx.globalAlpha = a * 0.5;
          Art.gadgetIcon(ctx, 'teleport', e.x, e.y, 18 + Math.sin(R.time * 3) * 2, pr.color);
        }
        ctx.globalAlpha = 1;
      }
    }

    // panic room status lamp
    const S = M.safeRoom;
    if (inView(S.dx, S.dy, 150)) {
      const lamp = S.state === 'sealed' ? '#ff3b4e' : S.cd > 0 ? '#ffb14d' : '#3dff8b';
      Art.drawGlow(ctx, lamp, S.dx + S.dw / 2, S.dy - WH - 4, 20, 0.6 + 0.4 * Math.sin(R.time * (S.state === 'sealed' ? 9 : 2)));
      if (S.state === 'sealed') Art.drawGlow(ctx, '#3dff8b', S.rx + S.rw / 2, S.ry + S.rh / 2, 120, 0.12);
    }

    // lure
    const l = Gd.activeLure();
    if (l && inView(l.x, l.y, 200)) {
      const k = 1 - l.t / l.max;
      const pulse = (R.time * (1.5 + k * 4)) % 1;
      Art.drawGlow(ctx, '#ff4fd8', l.x, l.y - 2, 50 + 20 * Math.sin(R.time * 10), 0.7);
      ctx.strokeStyle = '#ff4fd8';
      ctx.globalAlpha = (1 - pulse) * 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(l.x, l.y, 20 + pulse * 120, 0, U.TAU); ctx.stroke();
      ctx.save();
      ctx.translate(l.x, l.y - 2);
      ctx.rotate(R.time * 2);
      ctx.fillStyle = ['#ff4fd8', '#19f0ff', '#ffe14d'][Math.floor(R.time * 6) % 3];
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 5; i++) {
        ctx.rotate(U.TAU / 5);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(110, -7); ctx.lineTo(110, 7); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // safety bubbles
    for (const b of Gd.bubbles) {
      if (!inView(b.x, b.y, b.r + 20)) continue;
      const r = b.r * (0.3 + 0.7 * b.grow);
      const blink = b.t < 2 ? (Math.sin(R.time * 20) > 0 ? 1 : 0.4) : 1;
      Art.drawGlow(ctx, '#3dff8b', b.x, b.y, r * 1.1, 0.22 * blink);
      ctx.strokeStyle = '#3dff8b';
      ctx.globalAlpha = 0.85 * blink;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, U.TAU); ctx.stroke();
      ctx.globalAlpha = 0.25 * blink;
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = R.time * 0.5 + (i / 6) * Math.PI;
        ctx.beginPath(); ctx.ellipse(b.x, b.y, r, r * Math.abs(Math.cos(a)), 0, 0, U.TAU); ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, r + 6, -Math.PI / 2, -Math.PI / 2 + U.TAU * (b.t / b.max)); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // allies: visors, muzzles and remaining-time rings
    const p = AL.pal;
    if (p && inView(p.x, p.y, 60)) {
      const bob = Math.sin(p.anim * 5) * 2;
      const vx = p.x + Math.cos(p.angle) * 6, vy = p.y - 5 + bob + Math.sin(p.angle) * 6;
      Art.drawGlow(ctx, '#b77dff', vx, vy, 22, 0.9);
      Art.drawGlow(ctx, '#ffffff', vx, vy, 6, 0.8);
      const ax = p.x + Math.cos(p.angle) * -14 - Math.sin(p.angle) * -9, ay = p.y - 5 + bob + Math.sin(p.angle) * -14 + Math.cos(p.angle) * -9;
      if (Math.sin(R.time * 6) > 0) Art.drawGlow(ctx, '#ff4fd8', ax, ay, 8, 0.9);
      if (p.muzzleT > 0) Art.drawGlow(ctx, '#c99bff', p.x + Math.cos(p.angle) * 22, p.y - 5 + Math.sin(p.angle) * 22, 20, 1);
      ringTimer(p.x, p.y + 2, 19, p.t / p.max, '#b77dff');
    }
    const st = AL.sentry;
    if (st && inView(st.x, st.y, 60)) {
      const hover = -4 - st.rise * 4 + Math.sin(st.anim * 4) * 1.5;
      Art.drawGlow(ctx, '#19f0ff', st.x, st.y + hover, 26, 0.5);
      if (st.muzzleT > 0) Art.drawGlow(ctx, '#7dfcff', st.x + Math.cos(st.angle) * 24, st.y + hover + Math.sin(st.angle) * 24, 20, 1);
      ringTimer(st.x, st.y + 2, 20, st.t / st.max, '#19f0ff');
    }
  }

  function ringTimer(x, y, r, frac, col) {
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.stroke();
    ctx.globalAlpha = frac < 0.2 && Math.sin(R.time * 16) < 0 ? 0.3 : 0.9;
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + U.TAU * U.clamp(frac, 0, 1)); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function facilityLabels() {
    const I = GW.Interact;
    for (const it of wallItems()) {
      const v = it.spot;
      if (!inView(v.x, v.y, 80)) continue;
      let text = String(it.price), col = '#ffe14d';
      if (it.trap && it.trap.state !== 'idle') {
        text = Math.ceil(it.trap.t) + 's';
        col = it.trap.state === 'active' ? '#ff3b4e' : '#ffb14d';
      } else if (it.safe && (M.safeRoom.state === 'sealed' || M.safeRoom.cd > 0)) {
        text = Math.ceil(M.safeRoom.state === 'sealed' ? M.safeRoom.t : M.safeRoom.cd) + 's';
        col = M.safeRoom.state === 'sealed' ? '#3dff8b' : '#ffb14d';
      } else if (it.needsPower && !I.powered(it.zone)) col = '#8a7fa6';
      label(text, v.x, v.y - WH + 14, 10, col, 0.95);
    }
    const S = M.safeRoom;
    if (S.state === 'sealed' && inView(S.dx, S.dy, 150)) label(Math.ceil(S.t) + '', S.dx + S.dw / 2, S.dy - WH - 16, 16, S.t <= C.SAFEROOM.warn ? '#ff3b4e' : '#3dff8b');
  }

  function castPath(g, px, py, a0, a1, n, range, fan) {
    g.beginPath();
    if (fan) g.moveTo(px, py);
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const dx = Math.cos(a), dy = Math.sin(a);
      let d = M.raycast(px, py, dx, dy, range, M.blocksBullet);
      if (d < range) d = Math.min(range, d + 24); // let light spill onto the wall it hits
      const x = px + dx * d, y = py + dy * d;
      if (i === 0 && !fan) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
  }

  function carve(x, y, r, a) {
    if (a <= 0.01 || !inView(x, y, r)) return;
    lctx.globalAlpha = Math.min(1, a);
    lctx.drawImage(lightSprite, x - r, y - r, r * 2, r * 2);
  }

  function drawLighting(inGame, power) {
    const P = GW.Player, I = GW.Interact;
    const ls = R.cam.zoom * 0.5;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, lcan.width, lcan.height);
    const amb = U.lerp(0.8, 0.48, power); // `power` = light level where the camera is
    lctx.fillStyle = 'rgba(4,2,14,' + amb + ')';
    lctx.fillRect(0, 0, lcan.width, lcan.height);
    lctx.setTransform(ls, 0, 0, ls, R.ox * 0.5, R.oy * 0.5);
    lctx.globalCompositeOperation = 'destination-out';

    for (const L of M.lights) {
      let a;
      if (L.always) {
        const fl = Math.sin(R.time * 1.7 + L.phase) > 0.92 ? 0.25 : 1; // occasional dip
        a = Math.max(0.5 * fl, lv(L.zone) * 0.85);
      } else a = lv(L.zone) * (0.82 + 0.05 * Math.sin(R.time * 3 + L.phase));
      carve(L.x, L.y, L.r, a);
    }
    for (const f of FX.lights) carve(f.x, f.y, f.r, f.life / f.max);
    for (const pu of I.powerups) carve(pu.x, pu.y, 100, 0.7);
    if (GW.Net && GW.Net.active) for (const rp of GW.Net.remotes.values()) if (rp.alive) carve(rp.x, rp.y, 170, 0.75);
    for (const wb of M.wallbuys) carve(wb.x, wb.y + wb.fy * 20, 95, 0.5);
    const bs = M.boxSpots[I.box.spot];
    if (I.box.state !== 'moving') carve(bs.x, bs.y, 150, 0.7);
    for (const g of M.generators) carve(g.x + g.fx * 20, g.y + g.fy * 20, 80, 0.4);
    for (const f of I.fuses) if (!f.taken) carve(f.x, f.y, 46, 0.25 + 0.15 * Math.sin(R.time * 4 + f.t));
    if (lv(M.Z.VAULT) > 0.1) carve(M.pap.x, M.pap.y - 20, 190, lv(M.Z.VAULT) * 0.8);
    for (const pr of GW.Weapons.projectiles) carve(pr.x, pr.y, 110, 0.8);
    const AL = GW.Allies, Gd = GW.Gadgets;
    for (const h of GW.Zombies.hazards) carve(h.x, h.y, h.r * 1.5, 0.5);
    for (const o of GW.Boss.orbs) carve(o.x, o.y, 60, 0.7);
    if (GW.Boss.ref) carve(GW.Boss.ref.x, GW.Boss.ref.y, 230, 0.7);
    if (AL.pal) carve(AL.pal.x, AL.pal.y, 150, 0.75);
    if (AL.sentry) carve(AL.sentry.x, AL.sentry.y, 120, 0.6);
    const lure = Gd.activeLure();
    if (lure) carve(lure.x, lure.y, 170 + Math.sin(R.time * 10) * 20, 0.8);
    for (const b of Gd.bubbles) carve(b.x, b.y, b.r * 1.25, 0.65);
    for (const tr of M.traps) if (tr.state === 'active') carve(tr.rx + tr.rw / 2, tr.ry + tr.rh / 2, Math.max(tr.rw, tr.rh) * 1.1, 0.7 + Math.random() * 0.2);
    for (const v of M.vendors) carve(v.x, v.y + v.fy * 20, 75, 0.4);
    for (const pr of M.pads) for (const e of [pr.a, pr.b]) if (lv(e.zone) > 0.1) carve(e.x, e.y, 80, 0.5 * lv(e.zone));

    if (inGame && P.alive) {
      lctx.globalAlpha = 1;
      // personal glow: you can always see what is right next to you
      let gr = lctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, 200);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0.85)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = gr;
      castPath(lctx, P.x, P.y, 0, U.TAU, 72, 200, false);
      lctx.fill();
      // flashlight: wide soft cone + tight bright cone, both stopped by walls
      gr = lctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, 660);
      gr.addColorStop(0, 'rgba(0,0,0,0.5)');
      gr.addColorStop(0.6, 'rgba(0,0,0,0.38)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = gr;
      castPath(lctx, P.x, P.y, P.angle - 0.6, P.angle + 0.6, 36, 660, true);
      lctx.fill();
      gr = lctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, 660);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.8)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = gr;
      castPath(lctx, P.x, P.y, P.angle - 0.4, P.angle + 0.4, 36, 660, true);
      lctx.fill();
    }
    lctx.globalAlpha = 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(lcan, 0, 0, R.vw, R.vh);
  }

  /* ------------------------------------------------------------------ */
  /* emissive pass (drawn after the darkness, so it always glows)       */
  /* ------------------------------------------------------------------ */
  function label(text, x, y, size, color, alpha) {
    if (GW.L) text = GW.L.t(text);
    ctx.font = '900 ' + size + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4,2,12,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  function drawEmissive(inGame, power) {
    const P = GW.Player, I = GW.Interact, MA = GW.MapArt, Zs = GW.Zombies;
    ctx.globalCompositeOperation = 'lighter';

    // coloured light pools
    // (powered lights are baked into the neon layer; only emergency lights are dynamic)
    for (const L of M.lights) {
      if (!L.always || !inView(L.x, L.y, L.r)) continue;
      Art.drawGlow(ctx, L.color, L.x, L.y, L.r * 1.15, Math.max(0.1, lv(L.zone) * 0.16));
    }
    for (const f of FX.lights) if (inView(f.x, f.y, f.r)) Art.drawGlow(ctx, f.color, f.x, f.y, f.r * 0.7, 0.55 * (f.life / f.max));

    // neon tubes, signs and screens
    const hum = 0.92 + 0.08 * Math.sin(R.time * 23) * Math.sin(R.time * 3.1);
    for (const nz of MA.neonZones) {
      const x0 = Math.max(view.x, nz.x), y0 = Math.max(view.y, nz.y);
      const x1 = Math.min(view.x + view.w, nz.x + nz.w), y1 = Math.min(view.y + view.h, nz.y + nz.h);
      if (x1 <= x0 || y1 <= y0) continue;
      ctx.globalAlpha = U.clamp(0.1 + 0.88 * lv(nz.z) * hum, 0, 1);
      const s = MA.NEON_SCALE;
      ctx.drawImage(nz.canvas, (x0 - nz.x) * s, (y0 - nz.y) * s, (x1 - x0) * s, (y1 - y0) * s, x0, y0, x1 - x0, y1 - y0);
    }
    ctx.globalAlpha = 1;

    // laser gate across the Overclock Stage entrance
    const gate = M.gate;
    if ((!gate.open || gate.openT < 1) && inView(gate.x, gate.y, 140)) {
      const k = gate.open ? gate.openT : 0;
      const flick = gate.open ? (Math.random() < 1 - k ? 1 : 0) : 1;
      if (flick) {
        for (let i = 0; i < 4; i++) {
          const y = gate.ry - WH + 13 + i * 9;
          ctx.strokeStyle = '#ff3b4e';
          ctx.globalAlpha = 0.9 * (1 - k);
          ctx.lineWidth = 2 + Math.sin(R.time * 30 + i) * 0.6;
          ctx.beginPath();
          ctx.moveTo(gate.rx, y);
          ctx.lineTo(gate.rx + gate.rw, y);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        Art.drawGlow(ctx, '#ff3b4e', gate.x, gate.y - 4, 120, 0.3 * (1 - k));
      }
    }

    // wall-buy neon outlines (they work without power)
    for (const wb of M.wallbuys) {
      if (!inView(wb.x, wb.y, 100)) continue;
      const pulse = 0.85 + 0.15 * Math.sin(R.time * 2.4 + wb.tx);
      Art.drawGlow(ctx, '#ffe14d', wb.x, wb.y - WH, 70, 0.22 * pulse);
      ctx.globalAlpha = pulse;
      Art.weapon(ctx, wb.def.cls, wb.x, wb.y - WH - 3, 70, '#fff3b0', 'neon');
      ctx.globalAlpha = 1;
    }
    // generator lamps, and the faint glint of hidden fuses
    for (const ps of M.generators) {
      if (!inView(ps.x, ps.y, 80)) continue;
      const on = I.powered(ps.zone);
      Art.drawGlow(ctx, on ? '#3dff8b' : '#ff3b4e', ps.x, ps.y - WH + (on ? 11 : -11), 26, 0.7 + 0.3 * Math.sin(R.time * 6));
    }
    for (const f of I.fuses) {
      if (f.taken || !inView(f.x, f.y, 40)) continue;
      const tw = Math.max(0, Math.sin(f.t * 2.3)) ** 6;
      Art.drawGlow(ctx, '#ffe14d', f.x, f.y, 14 + tw * 22, 0.35 + tw * 0.65);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(0.5);
      ctx.fillStyle = '#ffe14d';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(-4, -8, 8, 16);
      ctx.fillStyle = '#3a2a10';
      ctx.fillRect(-4, -3, 8, 6);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Prize Crate beam + contents
    const b = I.box, bs = M.boxSpots[b.spot];
    if (inView(bs.x, bs.y, 260)) {
      const fade = b.state === 'moving' ? b.t / 1.4 : 1;
      const bcol = b.state === 'jester' ? '#ff3b4e' : '#ffe14d';
      Art.drawGlow(ctx, bcol, bs.x, bs.y - 10, 110 + Math.sin(R.time * 3) * 10, 0.3 * fade);
      // rotating sky-beam rays
      ctx.save();
      ctx.translate(bs.x, bs.y - 10);
      ctx.rotate(R.time * 0.6);
      ctx.globalAlpha = 0.06 * fade;
      ctx.fillStyle = bcol;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(U.TAU / 6);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(120, -12);
        ctx.lineTo(120, 12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      if ((b.state === 'rolling' || b.state === 'ready') && b.display) {
        const def = GW.WEAPONS[b.display];
        const bobY = bs.y - 34 + Math.sin(R.time * 5) * 3;
        const blink = b.state === 'ready' && b.t < 3 ? (Math.sin(R.time * 18) > 0 ? 1 : 0.3) : 1;
        Art.drawGlow(ctx, def.wonder ? '#7dff5a' : '#ffe14d', bs.x, bobY, 60, 0.45 * blink);
        ctx.globalAlpha = blink;
        Art.weapon(ctx, def.cls, bs.x, bobY, 64, def.wonder ? '#b6ff9c' : '#fff3b0', 'neon');
        ctx.globalAlpha = 1;
      } else if (b.state === 'jester') {
        Art.drawGlow(ctx, '#ff3b4e', bs.x, bs.y - 34, 70, 0.6);
        Art.powerupIcon(ctx, 'instakill', bs.x + U.rand(-1.5, 1.5), bs.y - 34 + U.rand(-1.5, 1.5), 38);
      }
    }

    // Overclocker glow + weapon
    const pm = M.pap, pk = I.pap;
    const stagePow = lv(M.Z.VAULT);
    if (stagePow > 0.1 && inView(pm.x, pm.y, 200)) {
      const hot = pk.state === 'working' ? 1 : pk.state === 'ready' ? 0.8 : 0.45;
      Art.drawGlow(ctx, '#ff4fd8', pm.x, pm.y - WH, 120, stagePow * hot * (0.4 + 0.12 * Math.sin(R.time * 5)));
      ctx.strokeStyle = '#ff4fd8';
      ctx.lineWidth = 2;
      ctx.globalAlpha = stagePow * (0.6 + 0.4 * Math.sin(R.time * 4));
      ctx.strokeRect(pm.tx * T + 3, pm.ty * T - WH + 3, pm.w * T - 6, pm.h * T - 6);
      ctx.globalAlpha = 1;
      if (pk.weapon) {
        const wy = pk.state === 'ready' ? pm.y - 46 + Math.sin(R.time * 5) * 3 : pm.y - WH;
        const blink = pk.state === 'ready' && pk.t < 4 ? (Math.sin(R.time * 18) > 0 ? 1 : 0.3) : 1;
        const col = pk.state === 'ready' ? pk.weapon.s.color : '#ffffff';
        Art.drawGlow(ctx, col, pm.x, wy, 60, 0.5 * blink);
        ctx.globalAlpha = blink;
        Art.weapon(ctx, pk.weapon.s.cls, pm.x + (pk.state === 'working' ? U.rand(-2, 2) : 0), wy, pk.state === 'ready' ? 66 : 44, col, 'neon');
        ctx.globalAlpha = 1;
        if (pk.state === 'ready') {
          // the four ammo mods orbit above; the lit one is what you get
          GW.MOD_ORDER.forEach((id, i) => {
            const md = GW.MODS[id], on = i === pk.modIdx;
            const mx2 = pm.x + (i - 1.5) * 30, my2 = wy - 34;
            if (on) Art.drawGlow(ctx, md.color, mx2, my2, 26, 0.9);
            ctx.globalAlpha = on ? 1 : 0.25;
            if (md.icon === 'nuke') Art.powerupIcon(ctx, 'nuke', mx2, my2, on ? 20 : 14);
            else Art.gadgetIcon(ctx, md.icon, mx2, my2, on ? 20 : 14, md.color);
            ctx.globalAlpha = 1;
          });
        }
      }
    }

    // power-ups
    for (const pu of I.powerups) {
      if (!inView(pu.x, pu.y, 80)) continue;
      const def = GW.POWERUPS[pu.type];
      const blink = pu.life < 6 ? (Math.sin(pu.t * (pu.life < 3 ? 22 : 11)) > 0 ? 1 : 0.2) : 1;
      const by = pu.y - 6 + Math.sin(pu.t * 3.5) * 4;
      Art.drawGlow(ctx, def.color, pu.x, by, 46, 0.6 * blink);
      ctx.globalAlpha = blink;
      Art.powerupIcon(ctx, pu.type, pu.x, by, 26);
      ctx.globalAlpha = 1;
    }

    drawFacilityGlow(power);
    drawThreats();

    // zombie eyes burn through the dark
    for (const z of Zs.list) {
      if (!inView(z.x, z.y, 30)) continue;
      const s = (z.r / 13) * 1.15, ca = Math.cos(z.angle), sa = Math.sin(z.angle);
      const a = z.state === 'rise' ? U.clamp(1 - z.riseT / 0.9, 0, 1) : 1;
      for (const side of [-1, 1]) {
        const lx = 7.2 * s, ly = side * 2.9 * s;
        const ex = z.x + ca * lx - sa * ly, ey = z.y + sa * lx + ca * ly;
        ctx.fillStyle = z.eye;
        ctx.globalAlpha = 0.3 * a;
        ctx.beginPath();
        ctx.arc(ex, ey, 4.6 * s, 0, U.TAU);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(ex, ey, 1.9 * s, 0, U.TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(ex - 0.7, ey - 0.7, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    }

    // plasma bolts
    for (const pr of GW.Weapons.projectiles) {
      Art.drawGlow(ctx, pr.color, pr.x, pr.y, 26, 1);
      Art.drawGlow(ctx, '#ffffff', pr.x, pr.y, 9, 1);
    }
    // grenade fuse blink
    for (const g of GW.Weapons.grenades) if (Math.sin(g.fuse * 26) > 0) Art.drawGlow(ctx, '#ff3b4e', g.x, g.y, 12, 0.9);

    // tracers + overclocked laser beams
    ctx.lineCap = 'round';
    for (const t of FX.tracers) {
      const a = t.life / t.max;
      if (t.laser) {
        ctx.strokeStyle = t.color;
        ctx.globalAlpha = a * 0.35;
        ctx.lineWidth = t.width * 3.2;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.lineWidth = t.width;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = t.width * 0.35;
        ctx.stroke();
      } else {
        ctx.strokeStyle = t.color;
        ctx.globalAlpha = a * 0.75;
        ctx.lineWidth = t.width;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
    }
    // lightning
    ctx.lineJoin = 'round';
    for (const bt of FX.bolts) {
      const a = bt.life / bt.max;
      ctx.beginPath();
      ctx.moveTo(bt.pts[0], bt.pts[1]);
      for (let i = 2; i < bt.pts.length; i += 2) ctx.lineTo(bt.pts[i] + U.rand(-2, 2), bt.pts[i + 1] + U.rand(-2, 2));
      ctx.strokeStyle = bt.color;
      ctx.globalAlpha = a * 0.4;
      ctx.lineWidth = bt.width * 3;
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.lineWidth = bt.width;
      ctx.stroke();
    }
    // shock rings
    for (const rg of FX.rings) {
      const k = 1 - rg.life / rg.max;
      ctx.strokeStyle = rg.color;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.lineWidth = rg.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r * (0.15 + 0.85 * k), 0, U.TAU);
      ctx.stroke();
    }
    // blade swings
    for (const sl of FX.slashes) {
      const k = 1 - sl.life / sl.max;
      const a0 = sl.dir - 1.3 * sl.side, a1 = sl.dir - 1.3 * sl.side + 2.6 * sl.side * Math.min(1, k * 1.6);
      ctx.strokeStyle = sl.color;
      ctx.lineCap = 'round';
      for (const [w, al, rr] of [[9, 0.25, 1], [3.5, 0.9, 1], [2, 0.5, 0.72]]) {
        ctx.globalAlpha = al * (1 - k);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(sl.x, sl.y, sl.r * rr, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // glowing particles
    for (const p of FX.parts) {
      if (!p.glow || !inView(p.x, p.y, 10)) continue;
      const a = U.clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.flame) {
        ctx.globalAlpha = a * 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2.6 - 1.6 * a), 0, U.TAU);
        ctx.fill();
      } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // grenade aim: while a grenade button is dragged, show the throw line and where it will land
    if (inGame && P.alive && GW.Input.touch.throw && GW.Touch) {
      const tg = GW.Touch.throwTarget(P);
      const pulse = 0.75 + 0.25 * Math.sin(R.time * 10);
      ctx.strokeStyle = '#ffb14d';
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(P.x, P.y);
      const mx = (P.x + tg.x) / 2, my = (P.y + tg.y) / 2 - U.dist(P.x, P.y, tg.x, tg.y) * 0.25;
      ctx.quadraticCurveTo(mx, my, tg.x, tg.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.9 * pulse;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tg.x, tg.y, 165, 0, U.TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.25 * pulse;
      ctx.fillStyle = '#ffb14d';
      ctx.fill();
      ctx.globalAlpha = 1;
      Art.drawGlow(ctx, '#ffb14d', tg.x, tg.y, 30, 0.9);
    }

    // muzzle flash + laser sight
    if (inGame && P.alive) {
      const w = P.weapon();
      if (w && P.meleeT <= 0 && w.s.type !== 'melee') {
        const ca = Math.cos(P.angle), sa = Math.sin(P.angle);
        const ml = P.r + w.s.len;
        const mx = P.x + ca * ml, my = P.y + sa * ml;
        if (P.muzzleT > 0) {
          const col = w.up || w.s.cls === 'energy' ? w.s.color : '#ffd68a';
          Art.drawGlow(ctx, col, mx + ca * 4, my + sa * 4, w.s.pellets > 1 ? 34 : 24, 1);
          Art.drawGlow(ctx, '#ffffff', mx, my, 10, 1);
        }
        const d = M.raycast(P.x, P.y, ca, sa, Math.min(w.s.range, 620), M.blocksBullet);
        if (d > ml) {
          ctx.strokeStyle = w.up ? w.s.color : '#ff5a5a';
          ctx.globalAlpha = w.up ? 0.3 : 0.14;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 7]);
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(P.x + ca * d, P.y + sa * d);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    facilityLabels();

    // price tags on locked doors
    for (const d of M.doors) {
      if (d.open || d.power || !inView(d.x, d.y, 120)) continue;
      const bob = Math.sin(R.time * 2.5 + d.id) * 2;
      label(String(d.cost), d.x, d.y - WH - 2 + bob, 20, '#ffe14d');
      label('LOCKED', d.x, d.y - WH + 16 + bob, 9, M.zones[d.b].color, 0.9);
    }
    for (const wb of M.wallbuys) {
      if (!inView(wb.x, wb.y, 100)) continue;
      label(String(wb.def.cost), wb.x, wb.y - WH + 15, 11, '#ffe14d', 0.95);
    }
    const pm2 = M.pap;
    if (lv(M.Z.VAULT) > 0.5 && inView(pm2.x, pm2.y, 200) && I.pap.state === 'idle') label('OVERCLOCKER', pm2.x, pm2.y + 22, 10, '#ff8fe6', 0.9);
    // brute health bars
    for (const z of Zs.list) {
      if (z.type !== 'brute' || z.hp >= z.maxHp || !inView(z.x, z.y, 40)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(z.x - 22, z.y - z.r - 14, 44, 5);
      ctx.fillStyle = '#ff3b4e';
      ctx.fillRect(z.x - 21, z.y - z.r - 13, 42 * U.clamp(z.hp / z.maxHp, 0, 1), 3);
    }
    // floating score / damage text
    for (const p of FX.popups) {
      if (!inView(p.x, p.y, 60)) continue;
      label(p.text, p.x, p.y, p.size, p.color, U.clamp(p.life / (p.max * 0.5), 0, 1));
    }
  }

  /* ------------------------------------------------------------------ */
  /* screen-space overlay: crosshair + hit marker                       */
  /* ------------------------------------------------------------------ */
  function drawCrosshair() {
    const P = GW.Player, In = GW.Input;
    const x = In.mouse.x * R.dpr, y = In.mouse.y * R.dpr, s = R.dpr;
    const w = P.weapon();
    const gap = (6 + (w ? w.s.spread * 90 : 4) + P.recoil * 5 + (P.moving ? 2 : 0)) * s;
    const len = 7 * s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineCap = 'butt';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? '#19f0ff' : 'rgba(0,0,0,0.7)';
      ctx.lineWidth = (pass ? 2 : 4) * s;
      ctx.beginPath();
      ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
      ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
      ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
      ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - s, y - s, 2 * s, 2 * s);
    // reload ring
    if (w && w.reloadT > 0) {
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.arc(x, y, 20 * s, -Math.PI / 2, -Math.PI / 2 + U.TAU * (1 - w.reloadT / w.reloadDur));
      ctx.stroke();
    }
    // hit marker
    const hm = FX.hitmark;
    if (hm.t > 0) {
      const a = U.clamp(hm.t / 0.1, 0, 1);
      const r1 = (hm.kill ? 9 : 7) * s, r2 = (hm.kill ? 17 : 13) * s;
      ctx.globalAlpha = a;
      ctx.strokeStyle = hm.kill ? '#ff3b4e' : hm.crit ? '#ffe14d' : '#ffffff';
      ctx.lineWidth = (hm.kill ? 3 : 2) * s;
      ctx.beginPath();
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        ctx.moveTo(x + dx * r1, y + dy * r1);
        ctx.lineTo(x + dx * r2, y + dy * r2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* ------------------------------------------------------------------ */
  /* frame                                                              */
  /* ------------------------------------------------------------------ */
  /** Draw moving things between their last two simulation steps (see the fixed-step loop in game.js). */
  const lerped = [];
  function lerpIn(a) {
    lerped.length = 0;
    const take = (e) => {
      if (!e || e.px === undefined) return;
      const dx = e.x - e.px, dy = e.y - e.py;
      if (dx * dx + dy * dy > 90 * 90) return; // teleported this step: don't smear
      lerped.push(e, e.x, e.y, e.angle);
      e.x = e.px + dx * a;
      e.y = e.py + dy * a;
      if (e.pa !== undefined) e.angle = e.pa + U.angDiff(e.pa, e.angle) * a;
    };
    take(GW.Player);
    if (GW.Net && GW.Net.active) for (const rp of GW.Net.remotes.values()) take(rp);
    for (const z of GW.Zombies.list) take(z);
    take(GW.Allies.pal);
  }
  function lerpOut() {
    for (let i = 0; i < lerped.length; i += 4) {
      const e = lerped[i];
      e.x = lerped[i + 1];
      e.y = lerped[i + 2];
      e.angle = lerped[i + 3];
    }
    lerped.length = 0;
  }

  R.draw = function (dt) {
    const interp = GW.Game.state === 'playing' && GW.Game.alpha < 1;
    if (interp) lerpIn(GW.Game.alpha);
    try {
      drawFrame(dt);
    } finally {
      if (interp) lerpOut();
    }
  };

  function drawFrame(dt) {
    R.time += dt;
    const G = GW.Game, P = GW.Player, I = GW.Interact, MA = GW.MapArt, Zs = GW.Zombies, D = GW.Director;
    if (!MA.floor) return;
    const inGame = G.state !== 'menu';
    updateCamera(dt, inGame);
    const cam = R.cam, z = cam.zoom;
    const shake = G.state === 'playing' ? FX.shakeAmt : 0;
    const sx = shake ? U.rand(-1, 1) * shake : 0, sy = shake ? U.rand(-1, 1) * shake : 0;
    R.ox = R.vw / 2 - (cam.x + sx) * z;
    R.oy = R.vh / 2 - (cam.y + sy) * z;
    view.w = R.vw / z;
    view.h = R.vh / z;
    view.x = cam.x + sx - view.w / 2;
    view.y = cam.y + sy - view.h / 2;

    // special rounds kill the lights; the attract screen always shows the park lit up
    const wantOut = inGame && D.special && D.state === 'active' ? 1 : 0;
    R.lightsOut += (wantOut - R.lightsOut) * Math.min(1, dt * 2.5);
    R.inGame = inGame;
    R.dim = 1 - 0.8 * R.lightsOut * (0.85 + 0.15 * Math.sin(R.time * 31));
    // ambient darkness follows the power of whichever zone the camera is over
    const camZone = M.zoneAt(cam.x, cam.y);
    if (camZone >= 0) R.amb += ((I.zoneLevel[camZone] || 0) - R.amb) * Math.min(1, dt * 3);
    const power = inGame ? R.amb * R.dim : 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#04030b';
    ctx.fillRect(0, 0, R.vw, R.vh);
    ctx.setTransform(z, 0, 0, z, R.ox, R.oy);

    blit(MA.floor, 1);
    drawGround(power);
    drawHazards();
    drawLure();
    for (const zb of Zs.list) if (inView(zb.x, zb.y, 40)) drawZombie(zb);
    if (inGame) drawAllies();
    const N = GW.Net;
    if (inGame && N && N.active) for (const rp of N.remotes.values()) if (rp.alive && inView(rp.x, rp.y, 40)) drawPlayer(rp);
    if (inGame && P.alive) drawPlayer(P);
    blit(MA.top, 1);
    drawDoors();
    drawShutter();
    drawPlanks();
    drawBoxes(power);
    drawPap(power);
    drawWallPlates(power);
    drawFacilityPlates();

    drawLighting(inGame, power);

    ctx.setTransform(z, 0, 0, z, R.ox, R.oy);
    drawEmissive(inGame, power);

    // cold tint during special rounds
    if (R.lightsOut > 0.02) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(40,200,230,' + 0.06 * R.lightsOut + ')';
      ctx.fillRect(0, 0, R.vw, R.vh);
    }
    if (inGame) drawMachineTags();
    if (inGame && N && N.active) drawTags();
    if (G.state === 'playing' && P.alive && !GW.Input.touch.active) drawCrosshair();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
})();
