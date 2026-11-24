/* GRAVEWAVE ARENA — drawing: the map, fighters, shots, effects, the gas, aim guides and the touch sticks */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, A = GW.Arena, K = GW.AControls;
  const D = (GW.ADraw = { zoomCss: 1 });
  let canvas, ctx, dpr = 1, vw = 0, vh = 0, mapCan = null;
  const TILE = A.TILE;
  const tr = (s) => (GW.L ? GW.L.t(s) : s);

  D.init = function (c) {
    canvas = c;
    ctx = canvas.getContext('2d');
    D.resize();
    window.addEventListener('resize', D.resize);
  };
  D.resize = function () {
    if (!canvas) return;
    const w = Math.max(320, U.viewW()), h = Math.max(240, U.viewH());
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * h * dpr * dpr > 2.6e6) dpr = Math.sqrt(2.6e6 / (w * h));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    vw = w;
    vh = h;
    // about 11 tiles from top to bottom (and at least ~17 across) on every screen
    D.zoomCss = Math.max(h / (10.6 * TILE), w / (24 * TILE));
  };

  /* ------------------------------------------------------------------ */
  /* the map, painted once                                               */
  /* ------------------------------------------------------------------ */
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  D.buildMap = function (m) {
    mapCan = document.createElement('canvas');
    mapCan.width = m.pw;
    mapCan.height = m.ph;
    const g = mapCan.getContext('2d');
    const ffa = m.mode === 'ffa';
    const floorA = ffa ? '#2a1d2c' : '#170f2e', floorB = ffa ? '#30212f' : '#1c1336';
    for (let ty = 0; ty < m.h; ty++)
      for (let tx = 0; tx < m.w; tx++) {
        const x = tx * TILE, y = ty * TILE, t = m.tiles[ty * m.w + tx];
        g.fillStyle = (tx + ty) % 2 ? floorA : floorB;
        g.fillRect(x, y, TILE, TILE);
        if (t === A.T.WATER) {
          g.fillStyle = '#0c3554';
          g.fillRect(x, y, TILE, TILE);
          g.strokeStyle = 'rgba(120,210,255,0.25)';
          g.lineWidth = 2;
          for (let i = 0; i < 2; i++) {
            const yy = y + 14 + i * 18 + hash(tx, ty + i) * 6;
            g.beginPath();
            g.moveTo(x + 6, yy);
            g.quadraticCurveTo(x + 24, yy - 5, x + 42, yy);
            g.stroke();
          }
        } else if (t === A.T.BRUSH) {
          g.fillStyle = '#1d5a33';
          g.fillRect(x, y, TILE, TILE);
          for (let i = 0; i < 7; i++) {
            const bx = x + 4 + hash(tx * 7 + i, ty) * 40, by = y + 6 + hash(tx, ty * 7 + i) * 38;
            g.fillStyle = i % 2 ? '#2f8a4c' : '#257a40';
            g.beginPath();
            g.moveTo(bx - 6, by + 6);
            g.lineTo(bx, by - 9);
            g.lineTo(bx + 6, by + 6);
            g.fill();
          }
        }
      }
    // faint lines down the middle (team) / rings (10-player)
    g.strokeStyle = ffa ? 'rgba(255,170,90,0.12)' : 'rgba(25,240,255,0.14)';
    g.lineWidth = 4;
    g.beginPath();
    if (ffa) g.arc(m.pw / 2, m.ph / 2, 5 * TILE, 0, A.TAU);
    else {
      g.moveTo(m.pw / 2, TILE);
      g.lineTo(m.pw / 2, m.ph - TILE);
    }
    g.stroke();
    // walls: a raised block with a lit top and a neon edge
    for (let ty = 0; ty < m.h; ty++)
      for (let tx = 0; tx < m.w; tx++) {
        if (m.tiles[ty * m.w + tx] !== A.T.WALL) continue;
        const x = tx * TILE, y = ty * TILE;
        g.fillStyle = ffa ? '#2e3142' : '#2b1f4a'; // (10-player walls are grey stone, so they never look like the wooden boxes)
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = ffa ? '#4d5268' : '#41306e';
        g.fillRect(x + 2, y + 2, TILE - 4, TILE - 12);
        g.strokeStyle = ffa ? 'rgba(190,205,255,0.3)' : 'rgba(255,79,216,0.35)';
        g.lineWidth = 2;
        g.strokeRect(x + 2, y + 2, TILE - 4, TILE - 12);
      }
    // spawn pads (team)
    for (const [list, col] of [[m.spawnA, '#19f0ff'], [m.spawnB, '#ff3b4e']]) {
      for (const s of list) {
        g.strokeStyle = col;
        g.globalAlpha = 0.35;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(s.x, s.y, 20, 0, A.TAU);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /* fighters                                                            */
  /* ------------------------------------------------------------------ */
  function emblem(g, c, s) {
    g.save();
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 2.6 * s;
    g.lineCap = 'round';
    g.beginPath();
    switch (c) {
      case 'guard': // shield
        g.moveTo(-7 * s, -8 * s);
        g.lineTo(7 * s, -8 * s);
        g.lineTo(7 * s, 1 * s);
        g.quadraticCurveTo(0, 10 * s, 0, 10 * s);
        g.quadraticCurveTo(-7 * s, 6 * s, -7 * s, 1 * s);
        g.closePath();
        g.fill();
        break;
      case 'sniper': // crosshair
        g.arc(0, 0, 7 * s, 0, A.TAU);
        g.moveTo(-11 * s, 0);
        g.lineTo(11 * s, 0);
        g.moveTo(0, -11 * s);
        g.lineTo(0, 11 * s);
        g.stroke();
        break;
      case 'engineer': // gear
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * A.TAU;
          g.moveTo(Math.cos(a) * 6 * s, Math.sin(a) * 6 * s);
          g.lineTo(Math.cos(a) * 10 * s, Math.sin(a) * 10 * s);
        }
        g.stroke();
        g.beginPath();
        g.arc(0, 0, 6 * s, 0, A.TAU);
        g.stroke();
        break;
      case 'medic': // plus
        g.fillRect(-3 * s, -9 * s, 6 * s, 18 * s);
        g.fillRect(-9 * s, -3 * s, 18 * s, 6 * s);
        break;
      case 'bomber': // bomb
        g.arc(-1 * s, 2 * s, 7 * s, 0, A.TAU);
        g.fill();
        g.beginPath();
        g.moveTo(3 * s, -4 * s);
        g.quadraticCurveTo(8 * s, -9 * s, 10 * s, -6 * s);
        g.stroke();
        break;
      case 'ninja': // mask band with eyes
        g.fillStyle = 'rgba(10,6,20,0.9)';
        g.fillRect(-12 * s, -4 * s, 24 * s, 8 * s);
        g.fillStyle = '#fff';
        g.fillRect(-7 * s, -1.5 * s, 4 * s, 3 * s);
        g.fillRect(3 * s, -1.5 * s, 4 * s, 3 * s);
        break;
    }
    g.restore();
  }
  /** One fighter at (x, y) facing a. ring = team colour. Used for the menu portraits too. */
  function fighter(g, c, x, y, a, ring, s, flash, hop) {
    const col = A.CHARS[c].color, R = A.R * s;
    g.save();
    g.translate(x, y);
    g.globalAlpha *= 0.4;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(2 * s, 6 * s, R, R * 0.75, 0, 0, A.TAU);
    g.fill();
    g.globalAlpha /= 0.4;
    g.translate(0, -(hop || 0));
    // weapon / hands toward the aim
    g.save();
    g.rotate(a);
    g.fillStyle = '#1b1530';
    g.fillRect(R * 0.4, -4 * s, R * 0.95, 8 * s);
    g.fillStyle = col;
    g.fillRect(R * 1.15, -3 * s, R * 0.25, 6 * s);
    g.restore();
    const grd = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.25, col);
    grd.addColorStop(1, shade(col));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, R, 0, A.TAU);
    g.fill();
    g.lineWidth = 3.4 * s;
    g.strokeStyle = ring;
    g.stroke();
    emblem(g, c, s);
    if (flash > 0) {
      g.globalAlpha *= Math.min(1, flash * 8);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(0, 0, R, 0, A.TAU);
      g.fill();
    }
    g.restore();
  }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + ((r * 0.38) | 0) + ',' + ((gg * 0.38) | 0) + ',' + ((b * 0.38) | 0) + ')';
  }
  /** Character portrait for the menu cards. */
  D.portrait = function (cv, c) {
    const g = cv.getContext('2d');
    const s = cv.width / 64;
    g.clearRect(0, 0, cv.width, cv.height);
    fighter(g, c, cv.width / 2 - 4 * s, cv.height / 2, -0.5, '#ffffff', 1.15 * s, 0, 0);
  };

  /* ------------------------------------------------------------------ */
  /* one frame                                                           */
  /* ------------------------------------------------------------------ */
  D.draw = function () {
    const C = GW.AC;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07040f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!C.map || (C.state !== 'play' && C.state !== 'over') || !mapCan) return;
    const z = D.zoomCss * dpr;
    const m = C.map;
    // camera, kept inside the map when the map is bigger than the screen
    const halfW = vw / 2 / D.zoomCss, halfH = vh / 2 / D.zoomCss;
    let cx = C.cam.x, cy = C.cam.y;
    cx = m.pw > halfW * 2 ? U.clamp(cx, halfW, m.pw - halfW) : m.pw / 2;
    cy = m.ph > halfH * 2 ? U.clamp(cy, halfH, m.ph - halfH) : m.ph / 2;
    C.cam.x = cx;
    C.cam.y = cy;
    const x0 = cx - halfW, y0 = cy - halfH;
    ctx.setTransform(z, 0, 0, z, -x0 * z, -y0 * z);
    ctx.imageSmoothingEnabled = true;
    // map (only the part on screen)
    const sx = Math.max(0, Math.floor(x0)), sy = Math.max(0, Math.floor(y0));
    const sw = Math.min(m.pw - sx, Math.ceil(halfW * 2) + 2), sh = Math.min(m.ph - sy, Math.ceil(halfH * 2) + 2);
    if (sw > 0 && sh > 0) ctx.drawImage(mapCan, sx, sy, sw, sh, sx, sy, sw, sh);
    const inView = (x, y, pad) => x > x0 - pad && x < x0 + halfW * 2 + pad && y > y0 - pad && y < y0 + halfH * 2 + pad;

    // power boxes
    for (const b of m.boxes) {
      if (C.deadBoxes.has(b.id)) continue;
      const x = b.tx * TILE, y = b.ty * TILE;
      if (!inView(x, y, TILE)) continue;
      ctx.fillStyle = '#6b4220';
      ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      ctx.fillStyle = '#a8682e';
      ctx.fillRect(x + 6, y + 4, TILE - 12, TILE - 16);
      ctx.strokeStyle = '#3dff8b';
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 14, y + 10, TILE - 28, TILE - 28);
      ctx.globalAlpha = 1;
    }
    // healing zones
    for (const zz of C.zones) {
      const [, x, y, r, tm, life] = zz;
      const mine = C.me && tm === C.me.tm;
      ctx.globalAlpha = 0.16 + 0.06 * Math.sin(C.clock * 6);
      ctx.fillStyle = mine ? '#3dff8b' : '#ff3b4e';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, A.TAU);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, life);
      ctx.strokeStyle = mine ? '#3dff8b' : '#ff3b4e';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // power cubes
    for (const cb of C.cubes) {
      const [, x, y] = cb;
      if (!inView(x, y, 30)) continue;
      const bob = Math.sin(C.clock * 4 + x) * 3;
      ctx.fillStyle = 'rgba(61,255,139,0.25)';
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, A.TAU);
      ctx.fill();
      ctx.fillStyle = '#3dff8b';
      ctx.fillRect(x - 8, y - 8 + bob, 16, 16);
      ctx.fillStyle = '#c9ffe0';
      ctx.fillRect(x - 8, y - 8 + bob, 16, 5);
    }
    // turrets
    for (const t of C.turrets) {
      const [, x, y, tm, hp, , a100] = t;
      const ally = C.me && tm === C.me.tm;
      ctx.fillStyle = '#1b1530';
      ctx.fillRect(x - 16, y - 16, 32, 32);
      ctx.strokeStyle = ally ? '#19f0ff' : '#ff3b4e';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 16, y - 16, 32, 32);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a100 / 100);
      ctx.fillStyle = '#19f0ff';
      ctx.fillRect(0, -4, 22, 8);
      ctx.restore();
      bar(x, y - 26, 34, hp / A.CHARS.engineer.sup.hp, ally ? '#19f0ff' : '#ff3b4e');
    }

    // fighters, back to front
    const list = [...C.ents.values()].filter((e) => e.alive).sort((a, b) => a.ry - b.ry);
    const ringOf = (e) => (e === C.me ? '#3dff8b' : C.me && e.tm === C.me.tm ? '#19f0ff' : '#ff3b4e');
    for (const e of list) {
      if (!inView(e.rx, e.ry, 60) || C.hidden(e)) continue;
      const inBush = A.inBrush(m, e.rx, e.ry);
      ctx.globalAlpha = inBush ? 0.55 : 1;
      if (e.sup >= A.SUPER_FULL) {
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -C.clock * 30;
        ctx.beginPath();
        ctx.arc(e.rx, e.ry, A.R + 8, 0, A.TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      fighter(ctx, e.c, e.rx, e.ry, e.a, ringOf(e), 1, e.flash, e === C.me ? C.me.hop : 0);
      ctx.globalAlpha = 1;
    }

    // shots
    for (const p of C.proj) {
      if (p.k === 'lob') {
        const q = A.lobPos(p);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, 9, 6, 0, 0, A.TAU);
        ctx.fill();
        if (p.mine || (C.me && p.tm !== C.me.tm)) {
          ctx.strokeStyle = p.mine ? 'rgba(255,255,255,0.35)' : 'rgba(255,59,78,0.45)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.tx, p.ty, p.rad, 0, A.TAU);
          ctx.stroke();
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y - q.h, p.s ? 13 : 9, 0, A.TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(q.x - 3, q.y - q.h - 3, 3, 0, A.TAU);
        ctx.fill();
        continue;
      }
      if (p.wait > 0) continue;
      const tail = Math.min(26, p.sp * 0.02);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.r * 1.3;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(p.a) * tail, p.y - Math.sin(p.a) * tail);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.7, 0, A.TAU);
      ctx.fill();
    }

    // effects
    for (const f of C.fx) {
      const t = f.t - (f.delay || 0);
      if (t < 0) continue;
      const k = t / f.life;
      ctx.globalAlpha = Math.max(0, 1 - k);
      switch (f.kind) {
        case 'num':
          ctx.font = '900 ' + (f.d < 0 ? 15 : 17) + 'px Orbitron, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = f.d < 0 ? '#3dff8b' : '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 3;
          ctx.strokeText((f.d < 0 ? '+' : '') + Math.abs(f.d), f.x, f.y - k * 30);
          ctx.fillText((f.d < 0 ? '+' : '') + Math.abs(f.d), f.x, f.y - k * 30);
          break;
        case 'slash':
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 10 * (1 - k);
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * (0.7 + k * 0.3), f.a - f.arc / 2, f.a + f.arc / 2);
          ctx.stroke();
          break;
        case 'beam':
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.w * (1 - k) + 2;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + Math.cos(f.a) * f.len, f.y + Math.sin(f.a) * f.len);
          ctx.stroke();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3 * (1 - k);
          ctx.stroke();
          break;
        case 'boom':
        case 'leap':
          ctx.fillStyle = f.color;
          ctx.globalAlpha *= 0.35;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * (0.4 + k * 0.6), 0, A.TAU);
          ctx.fill();
          ctx.globalAlpha /= 0.35;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 4 * (1 - k);
          ctx.stroke();
          break;
        case 'ring':
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * (0.5 + k), 0, A.TAU);
          ctx.stroke();
          break;
        case 'spark':
        case 'trail':
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(f.x, f.y, (f.kind === 'trail' ? 16 : 7) * (1 - k), 0, A.TAU);
          ctx.fill();
          break;
        case 'poof':
        case 'debris':
          ctx.fillStyle = f.color;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * A.TAU + f.x;
            ctx.fillRect(f.x + Math.cos(a) * 40 * k - 3, f.y + Math.sin(a) * 40 * k - 3, 6, 6);
          }
          break;
      }
      ctx.globalAlpha = 1;
    }

    // the gas
    if (C.ffa && C.gas) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - 10, y0 - 10, halfW * 2 + 20, halfH * 2 + 20);
      ctx.arc(m.pw / 2, m.ph / 2, C.gas, 0, A.TAU, true);
      ctx.fillStyle = 'rgba(70,200,90,0.3)';
      ctx.fill('evenodd');
      ctx.beginPath();
      ctx.arc(m.pw / 2, m.ph / 2, C.gas, 0, A.TAU);
      ctx.strokeStyle = 'rgba(120,255,140,0.8)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    // name, health, cubes over each fighter
    for (const e of list) {
      if (!inView(e.rx, e.ry, 60) || C.hidden(e)) continue;
      const col = ringOf(e);
      const y = e.ry - A.R - 18 - (e === C.me ? C.me.hop || 0 : 0);
      bar(e.rx, y, 52, e.hp / e.maxHp, col);
      ctx.font = '700 11px Orbitron, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3;
      const label = String(Math.max(0, Math.ceil(e.hp)));
      ctx.strokeText(label, e.rx, y - 6);
      ctx.fillText(label, e.rx, y - 6);
      ctx.font = '700 9px Orbitron, Arial, sans-serif';
      ctx.fillStyle = col;
      const nm = C.nameOf(e.id);
      ctx.strokeText(nm, e.rx, y - 19);
      ctx.fillText(nm, e.rx, y - 19);
      if (e.cubes > 0) {
        ctx.fillStyle = '#3dff8b';
        ctx.fillRect(e.rx + 30, y - 6, 13, 13);
        ctx.fillStyle = '#07040f';
        ctx.font = '900 9px Orbitron, Arial, sans-serif';
        ctx.fillText(String(e.cubes), e.rx + 36.5, y + 4);
      }
    }
    // my ammo bars and the aim guide
    const me = C.me;
    if (me && me.alive && C.state === 'play') {
      const L = C.L, ch = A.CHARS[me.c];
      const w = 15;
      for (let i = 0; i < A.AMMO; i++) {
        const fill = i < L.ammo ? 1 : i === L.ammo ? Math.min(1, L.rl / ch.reload) : 0;
        const x = me.x - (w * 3 + 4) / 2 + i * (w + 2), y = me.y + A.R + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y, w, 6);
        ctx.fillStyle = fill >= 1 ? '#ff9a2e' : '#8a5a2a';
        ctx.fillRect(x, y, w * fill, 6);
      }
      const pv = K.preview() || (!K.touch && K.mouse.inside ? mouseAim(me) : null);
      if (pv) aimGuide(me, pv);
    }

    // screen space: hurt flash, sticks, super button
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (C.hurtFlash > 0) {
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
      g.addColorStop(0, 'rgba(255,0,40,0)');
      g.addColorStop(1, 'rgba(255,0,40,' + C.hurtFlash + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (K.touch && C.state === 'play' && me && me.alive) {
      for (const kind of ['move', 'aim']) {
        const st = K.sticks[kind];
        if (!st) continue;
        stick(st, kind === 'move' ? '#19f0ff' : '#ff9a2e');
      }
      const sb = K.superBtn();
      const full = me.sup >= A.SUPER_FULL;
      ctx.fillStyle = full ? 'rgba(255,225,77,0.25)' : 'rgba(8,4,20,0.55)';
      ctx.beginPath();
      ctx.arc(sb.x, sb.y, sb.r, 0, A.TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#ffe14d';
      ctx.beginPath();
      ctx.arc(sb.x, sb.y, sb.r, -Math.PI / 2, -Math.PI / 2 + A.TAU * Math.min(1, me.sup / A.SUPER_FULL));
      ctx.stroke();
      ctx.font = '900 10px Orbitron, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = full ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.fillText(tr('SUPER'), sb.x, sb.y + 4);
      if (K.sticks.sup) stick(K.sticks.sup, '#ffe14d');
    }
  };

  function mouseAim(me) {
    const C = GW.AC;
    const w = C.screenToWorld(K.mouse.x, K.mouse.y);
    const reach = A.reach(me.c, false);
    return { sup: false, a: Math.atan2(w.y - me.y, w.x - me.x), mag: Math.min(1, Math.hypot(w.x - me.x, w.y - me.y) / reach), faint: true };
  }
  function aimGuide(me, pv) {
    const C = GW.AC, ch = A.CHARS[me.c], spec = pv.sup ? ch.sup : ch.atk;
    const reach = A.reach(me.c, pv.sup);
    ctx.save();
    ctx.globalAlpha = pv.faint ? 0.18 : 0.35;
    ctx.fillStyle = pv.sup ? '#ffe14d' : '#ffffff';
    ctx.strokeStyle = ctx.fillStyle;
    const a = pv.a;
    if (A.aimsAtSpot(me.c, pv.sup)) {
      const d = Math.max(0.15, pv.mag) * reach;
      const r = spec.radius || 40;
      ctx.beginPath();
      ctx.arc(me.x + Math.cos(a) * d, me.y + Math.sin(a) * d, r, 0, A.TAU);
      ctx.fill();
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(me.x, me.y);
      ctx.lineTo(me.x + Math.cos(a) * d, me.y + Math.sin(a) * d);
      ctx.stroke();
    } else if (spec.kind === 'spread' || spec.kind === 'slash') {
      const half = (spec.fan || spec.arc) / 2 + (spec.kind === 'spread' ? 0.05 : 0);
      const len = spec.kind === 'slash' ? spec.range + A.R : spec.range;
      ctx.beginPath();
      ctx.moveTo(me.x, me.y);
      ctx.arc(me.x, me.y, len, a - half, a + half);
      ctx.closePath();
      ctx.fill();
    } else {
      const len = A.ray(C.map, me.x, me.y, a, reach);
      const w = spec.kind === 'laser' ? spec.width + 10 : 14;
      ctx.translate(me.x, me.y);
      ctx.rotate(a);
      ctx.fillRect(A.R * 0.5, -w / 2, len - A.R * 0.5, w);
    }
    ctx.restore();
  }
  function stick(st, col) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.arc(st.ox, st.oy, K.R, 0, A.TAU);
    ctx.fill();
    ctx.stroke();
    const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy), k = d > K.R ? K.R / d : 1;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(st.ox + dx * k, st.oy + dy * k, 26, 0, A.TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function bar(x, y, w, k, col) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 7);
    ctx.fillStyle = col;
    ctx.fillRect(x - w / 2, y, w * U.clamp(k, 0, 1), 5);
  }
})();
