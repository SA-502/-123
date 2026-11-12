/* GRAVEWAVE — pre-rendered map layers: floor (with decals), wall/prop tops, and an additive neon layer */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, T = GW.CFG.TILE, M = GW.Map, TT = M.TT, Z = M.Z, Art = GW.Art;
  const WH = 16; // fake wall height in pixels (tops are drawn shifted up by this much)
  const NS = 0.5; // neon layer resolution scale
  const MA = (GW.MapArt = { WALL_H: WH, NEON_SCALE: NS, floor: null, top: null, neon: null, mini: null });
  let fg, tg, ng;

  const SIGNS = [
    { text: 'PIXEL PALACE', tx: 20, ty: 21, zone: Z.ARCADE, size: 15 },
    { text: 'DEEP SIX', tx: 36, ty: 15, zone: Z.AQUA, size: 18 },
    { text: 'SPEEDWAY', tx: 44, ty: 21, zone: Z.SPEED, size: 17 },
    { text: 'OVERCLOCK', tx: 28, ty: 32, zone: Z.VAULT, size: 17 },
    { text: 'SUBSTATION', tx: 12.5, ty: 41, zone: Z.SUB, size: 13 },
    { text: 'SUBSTATION', tx: 51.5, ty: 41, zone: Z.SUB, size: 13 },
    { text: 'SAFE ROOM', tx: 14, ty: 35, zone: Z.ARCADE, size: 11, color: '#3dff8b' },
  ];

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  MA.build = function () {
    if (!MA.floor) {
      MA.floor = makeCanvas(M.pxW, M.pxH);
      MA.top = makeCanvas(M.pxW, M.pxH);
      MA.neon = makeCanvas(M.pxW * NS, M.pxH * NS);
      MA.mini = makeCanvas(M.W * 3, M.H * 3);
    }
    fg = MA.floor.getContext('2d');
    tg = MA.top.getContext('2d');
    ng = MA.neon.getContext('2d');
    paintFloor();
    paintTop();
    paintNeon();
    paintMini();
  };

  const isWall = (x, y) => M.tile(x, y) === TT.WALL;
  const zoneColor = (z) => (z >= 0 ? M.zones[z].color : '#ffffff');

  /* ================================================================== */
  /* floor layer                                                        */
  /* ================================================================== */
  function floorTile(g, x, y, z) {
    const px = x * T, py = y * T;
    if (z === Z.HUB) {
      // weathered boardwalk planks
      for (let i = 0; i < 3; i++) {
        const h = U.hash(x, y * 3 + i, 7);
        g.fillStyle = 'hsl(' + (268 + h * 16) + ',26%,' + (15 + h * 6) + '%)';
        g.fillRect(px, py + i * 16, T, 16);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(px, py + i * 16, T, 1);
        if (U.hash(x, y * 3 + i, 11) < 0.45) g.fillRect(px + Math.floor(U.hash(x, y * 3 + i, 9) * (T - 2)), py + i * 16, 1, 16);
        g.fillStyle = 'rgba(255,255,255,0.03)';
        g.fillRect(px, py + i * 16 + 1, T, 1);
      }
    } else if (z === Z.ARCADE) {
      // 80s arcade carpet with confetti shapes
      g.fillStyle = (x + y) % 2 ? '#21133d' : '#271747';
      g.fillRect(px, py, T, T);
      const cols = ['#ff4fd8', '#19f0ff', '#ffe14d', '#a855ff'];
      for (let i = 0; i < 3; i++) {
        const hx = U.hash(x, y, 20 + i), hy = U.hash(x, y, 30 + i), hk = U.hash(x, y, 40 + i);
        const cx = px + 6 + hx * (T - 12), cy = py + 6 + hy * (T - 12);
        g.save();
        g.translate(cx, cy);
        g.rotate(hk * 6.28);
        g.globalAlpha = 0.45;
        g.strokeStyle = g.fillStyle = cols[Math.floor(hk * 4)];
        g.lineWidth = 2;
        if (hk < 0.33) {
          g.beginPath();
          g.moveTo(-5, 4); g.lineTo(0, -5); g.lineTo(5, 4);
          g.closePath();
          g.stroke();
        } else if (hk < 0.66) {
          g.beginPath();
          g.moveTo(-7, 0); g.lineTo(-3, -4); g.lineTo(1, 0); g.lineTo(5, -4);
          g.stroke();
        } else {
          g.fillRect(-2, -2, 4, 4);
        }
        g.restore();
      }
    } else if (z === Z.AQUA) {
      // glossy sea-blue tiles
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const h = U.hash(x * 2 + i, y * 2 + j, 3);
          g.fillStyle = (x * 2 + i + y * 2 + j) % 2 ? 'hsl(200,62%,' + (15 + h * 3) + '%)' : 'hsl(196,58%,' + (19 + h * 3) + '%)';
          g.fillRect(px + i * 24, py + j * 24, 24, 24);
          g.fillStyle = 'rgba(160,235,255,0.07)';
          g.fillRect(px + i * 24, py + j * 24, 24, 1);
          g.fillRect(px + i * 24, py + j * 24, 1, 24);
        }
    } else if (z === Z.SPEED) {
      // asphalt
      g.fillStyle = 'hsl(240,10%,' + (14.5 + U.hash(x, y, 2) * 3) + '%)';
      g.fillRect(px, py, T, T);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = U.hash(x, y, 50 + i) < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)';
        g.fillRect(px + U.hash(x, y, 60 + i) * (T - 2), py + U.hash(x, y, 70 + i) * (T - 2), 2, 2);
      }
    } else if (z === Z.SUB) {
      // riveted steel deck
      g.fillStyle = 'hsl(205,12%,' + (15 + U.hash(x, y, 4) * 3) + '%)';
      g.fillRect(px, py, T, T);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(px, py, T, 1);
      g.fillRect(px, py, 1, T);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(px, py + T - 1, T, 1);
      g.fillRect(px + T - 1, py, 1, T);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      for (const [rx, ry] of [[5, 5], [T - 7, 5], [5, T - 7], [T - 7, T - 7]]) g.fillRect(px + rx, py + ry, 2, 2);
      if (U.hash(x, y, 5) < 0.12) {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        for (let i = 0; i < 5; i++) g.fillRect(px + 10, py + 11 + i * 6, T - 20, 2); // floor grate
      }
    } else if (z === Z.VAULT) {
      // light-up dance floor (lit dynamically when the power is on)
      const pal = ['#3a1244', '#13244f', '#4a1231', '#123844'];
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          g.fillStyle = pal[Math.floor(U.hash(x * 2 + i, y * 2 + j, 6) * 4)];
          g.fillRect(px + i * 24, py + j * 24, 24, 24);
          g.strokeStyle = 'rgba(0,0,0,0.6)';
          g.lineWidth = 1;
          g.strokeRect(px + i * 24 + 0.5, py + j * 24 + 0.5, 23, 23);
        }
    } else {
      g.fillStyle = '#04030b';
      g.fillRect(px, py, T, T);
    }
  }

  function hubGuides(g, glow) {
    // painted wayfinding lines from the fountain toward each attraction
    const cx = 32 * T, cy = 24 * T;
    const guides = [
      { to: [20.5 * T, 24 * T], zone: Z.ARCADE }, { to: [43.5 * T, 24 * T], zone: Z.SPEED },
      { to: [32 * T, 14.5 * T], zone: Z.AQUA }, { to: [32 * T, 31.6 * T], zone: Z.VAULT },
    ];
    g.save();
    g.lineCap = 'round';
    for (const gd of guides) {
      const col = zoneColor(gd.zone);
      const dx = gd.to[0] - cx, dy = gd.to[1] - cy, d = Math.hypot(dx, dy);
      const ux = dx / d, uy = dy / d;
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.globalAlpha = glow ? 0.8 : 0.3;
      g.setLineDash([14, 12]);
      g.beginPath();
      g.moveTo(cx + ux * 118, cy + uy * 118);
      g.lineTo(gd.to[0] - ux * 26, gd.to[1] - uy * 26);
      g.stroke();
      g.setLineDash([]);
      // arrow head
      g.beginPath();
      g.moveTo(gd.to[0] - ux * 24 - uy * 10, gd.to[1] - uy * 24 + ux * 10);
      g.lineTo(gd.to[0], gd.to[1]);
      g.lineTo(gd.to[0] - ux * 24 + uy * 10, gd.to[1] - uy * 24 - ux * 10);
      g.stroke();
    }
    g.globalAlpha = glow ? 0.85 : 0.32;
    g.strokeStyle = zoneColor(Z.HUB);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, 104, 0, U.TAU);
    g.stroke();
    g.strokeStyle = '#19f0ff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, 92, 0, U.TAU);
    g.stroke();
    g.restore();
  }

  function speedwayPaint(g, glow) {
    g.save();
    g.globalAlpha = glow ? 0.7 : 0.4;
    g.strokeStyle = glow ? '#ffd426' : '#d8d2c0';
    g.lineWidth = 3;
    g.setLineDash([22, 18]);
    Art.roundRect(g, 48.5 * T, 14.5 * T, 10 * T, 17 * T, 2.2 * T);
    g.stroke();
    g.setLineDash([]);
    if (!glow) {
      // start / finish checkers
      for (let i = 0; i < 28; i++)
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? '#e8e4d8' : '#111';
          g.globalAlpha = 0.5;
          g.fillRect(46 * T + i * 8, 24 * T + j * 8 - 8, 8, 8);
        }
    }
    g.restore();
  }

  function aquaPaint(g, glow) {
    g.save();
    g.strokeStyle = glow ? '#19d8ff' : '#8fe6ff';
    g.globalAlpha = glow ? 0.35 : 0.13;
    g.lineWidth = 2;
    for (const yy of [4.6, 9.6, 10.6]) {
      g.beginPath();
      for (let x = 20 * T; x <= 44 * T; x += 8) {
        const y = yy * T + Math.sin(x / 34 + yy) * 7;
        if (x === 20 * T) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  }

  function hazardPaint(g, glow) {
    // hazard borders around the generators
    g.save();
    g.globalAlpha = glow ? 0.7 : 0.45;
    g.strokeStyle = glow ? '#c8ff3a' : '#c9b21f';
    g.lineWidth = 4;
    g.setLineDash([12, 10]);
    for (const p of M.props) {
      if (p.kind !== 'generator') continue;
      g.strokeRect(p.tx * T - 14, p.ty * T - 14, p.w * T + 28, p.h * T + 28);
    }
    // power switch floor marking
    g.strokeRect(31 * T, 40 * T + 4, 3 * T, T * 1.2);
    g.restore();
  }

  /** Trap floor plates and teleporter rings. `glow` = the powered neon version. */
  function facilityPaint(g, glow) {
    g.save();
    for (const tr of M.traps) {
      const col = GW.TRAPS[tr.kind].color;
      if (!glow) {
        g.fillStyle = 'rgba(0,0,0,0.38)';
        g.fillRect(tr.rx + 3, tr.ry + 3, tr.rw - 6, tr.rh - 6);
        g.strokeStyle = 'rgba(160,170,190,0.18)';
        g.lineWidth = 2;
        const vertical = tr.kind !== 'laser';
        for (let o = 10; o < (vertical ? tr.rh : tr.rw); o += 9) {
          g.beginPath();
          if (vertical) { g.moveTo(tr.rx + 6, tr.ry + o); g.lineTo(tr.rx + tr.rw - 6, tr.ry + o); }
          else { g.moveTo(tr.rx + o, tr.ry + 6); g.lineTo(tr.rx + o, tr.ry + tr.rh - 6); }
          g.stroke();
        }
        // hazard border
        g.save();
        g.beginPath();
        g.rect(tr.rx, tr.ry, tr.rw, tr.rh);
        g.rect(tr.rx + 5, tr.ry + 5, tr.rw - 10, tr.rh - 10);
        g.clip('evenodd');
        for (let i = -tr.rh; i < tr.rw + tr.rh; i += 14) {
          g.fillStyle = (i / 14) % 2 ? '#c9b21f' : '#141018';
          g.globalAlpha = 0.55;
          g.beginPath();
          g.moveTo(tr.rx + i, tr.ry); g.lineTo(tr.rx + i + 7, tr.ry); g.lineTo(tr.rx + i + 7 + tr.rh, tr.ry + tr.rh); g.lineTo(tr.rx + i + tr.rh, tr.ry + tr.rh);
          g.closePath();
          g.fill();
        }
        g.restore();
      } else {
        g.globalAlpha = 0.35;
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.setLineDash([8, 8]);
        g.strokeRect(tr.rx + 3, tr.ry + 3, tr.rw - 6, tr.rh - 6);
        g.setLineDash([]);
      }
    }
    for (const pr of M.pads) {
      for (const e of [pr.a, pr.b]) {
        g.globalAlpha = glow ? 0.9 : 0.4;
        g.strokeStyle = glow ? pr.color : '#6a6290';
        g.lineWidth = glow ? 3 : 2;
        g.beginPath(); g.arc(e.x, e.y, 20, 0, U.TAU); g.stroke();
        g.lineWidth = glow ? 2 : 1.5;
        g.beginPath(); g.arc(e.x, e.y, 13, 0, U.TAU); g.stroke();
        if (!glow) {
          g.fillStyle = '#16122a';
          g.globalAlpha = 0.8;
          g.beginPath(); g.arc(e.x, e.y, 11, 0, U.TAU); g.fill();
        }
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * U.TAU + Math.PI / 4;
          g.beginPath();
          g.moveTo(e.x + Math.cos(a) * 21, e.y + Math.sin(a) * 21);
          g.lineTo(e.x + Math.cos(a) * 25, e.y + Math.sin(a) * 25);
          g.stroke();
        }
      }
    }
    // panic room floor: green safety stripe inside the shutter line
    const S = M.safeRoom;
    g.globalAlpha = glow ? 0.6 : 0.35;
    g.strokeStyle = '#3dff8b';
    g.lineWidth = 3;
    g.setLineDash([10, 8]);
    g.strokeRect(S.rx + 6, S.ry + 6, S.rw - 12, S.rh - 12);
    g.setLineDash([]);
    g.restore();
  }

  function drawLowProp(g, p) {
    const x = p.tx * T, y = p.ty * T, w = p.w * T, h = p.h * T;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.fillRect(x + 5, y + 7, w - 4, h - 4);
    if (p.kind === 'fountain') {
      const cx = x + w / 2, cy = y + h / 2;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath(); g.arc(cx + 4, cy + 6, 46, 0, U.TAU); g.fill();
      g.fillStyle = '#4a4266';
      g.beginPath(); g.arc(cx, cy, 46, 0, U.TAU); g.fill();
      const wg = g.createRadialGradient(cx, cy, 4, cx, cy, 38);
      wg.addColorStop(0, '#2bb6d6'); wg.addColorStop(1, '#0b3a57');
      g.fillStyle = wg;
      g.beginPath(); g.arc(cx, cy, 38, 0, U.TAU); g.fill();
      g.strokeStyle = 'rgba(200,245,255,0.35)';
      g.lineWidth = 1.5;
      for (const r of [14, 24, 32]) { g.beginPath(); g.arc(cx, cy, r, 0, U.TAU); g.stroke(); }
      g.fillStyle = '#6a6090';
      g.beginPath(); g.arc(cx, cy, 8, 0, U.TAU); g.fill();
      g.fillStyle = '#d9f7ff';
      g.beginPath(); g.arc(cx, cy, 3.5, 0, U.TAU); g.fill();
    } else if (p.kind === 'bench') {
      g.fillStyle = '#3d2a22';
      g.fillRect(x + 4, y + 9, w - 8, h - 18);
      g.fillStyle = '#5c4032';
      for (let i = 0; i < 4; i++) g.fillRect(x + 4, y + 10 + i * 7.5, w - 8, 5);
      g.fillStyle = '#17121f';
      g.fillRect(x + 8, y + 7, 4, h - 14);
      g.fillRect(x + w - 12, y + 7, 4, h - 14);
    } else if (p.kind === 'counter') {
      g.fillStyle = '#2a1c48';
      g.fillRect(x + 2, y + 5, w - 4, h - 10);
      g.fillStyle = '#4b3580';
      g.fillRect(x + 6, y + 9, w - 12, h - 20);
      const cols = ['#ff4fd8', '#19f0ff', '#ffe14d', '#3dff8b'];
      for (let i = 0; i < 9; i++) {
        g.fillStyle = cols[i % 4];
        g.globalAlpha = 0.75;
        g.fillRect(x + 12 + i * 14, y + 14 + (i % 2) * 9, 7, 7);
      }
    } else if (p.kind === 'hockey') {
      g.fillStyle = '#d8d2e8';
      g.fillRect(x + 3, y + 6, w - 6, h - 12);
      g.fillStyle = '#0e4c6a';
      g.fillRect(x + 7, y + 10, w - 14, h - 20);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(x + w / 2 - 1, y + 10, 2, h - 20);
      g.fillStyle = '#ff3b4e';
      g.beginPath(); g.arc(x + w * 0.63, y + h * 0.56, 4, 0, U.TAU); g.fill();
    } else if (p.kind === 'tires') {
      for (let j = 0; j < p.h * 2; j++)
        for (let i = 0; i < p.w * 2; i++) {
          const cx = x + 12 + i * 24, cy = y + 12 + j * 24;
          g.fillStyle = (i + j) % 2 ? '#c8c3d6' : '#c22a3a';
          g.beginPath(); g.arc(cx, cy, 11.5, 0, U.TAU); g.fill();
          g.fillStyle = '#121016';
          g.beginPath(); g.arc(cx, cy, 9.5, 0, U.TAU); g.fill();
          g.fillStyle = '#2c2933';
          g.beginPath(); g.arc(cx, cy, 5, 0, U.TAU); g.fill();
          g.fillStyle = '#08070b';
          g.beginPath(); g.arc(cx, cy, 3, 0, U.TAU); g.fill();
        }
    } else if (p.kind === 'crate') {
      for (let i = 0; i < p.w; i++) {
        const bx = x + i * T + 4, by = y + 4;
        g.fillStyle = '#5a4428';
        g.fillRect(bx, by, T - 8, T - 8);
        g.strokeStyle = '#33260f';
        g.lineWidth = 3;
        g.strokeRect(bx + 1.5, by + 1.5, T - 11, T - 11);
        g.beginPath();
        g.moveTo(bx + 3, by + 3); g.lineTo(bx + T - 11, by + T - 11);
        g.moveTo(bx + T - 11, by + 3); g.lineTo(bx + 3, by + T - 11);
        g.stroke();
      }
    } else if (p.kind === 'kart') {
      g.translate(x + w / 2, y + h / 2);
      g.rotate(p.rot || 0);
      g.fillStyle = '#0c0b10';
      for (const [wx, wy] of [[-13, -15], [-13, 15], [13, -14], [13, 14]]) g.fillRect(wx - 5, wy - 4, 10, 8);
      g.fillStyle = p.rot > 0 ? '#ff8a1f' : '#19c8e8';
      g.beginPath();
      g.moveTo(-18, -9); g.lineTo(12, -11); g.lineTo(20, 0); g.lineTo(12, 11); g.lineTo(-18, 9);
      g.closePath();
      g.fill();
      g.fillStyle = '#16131d';
      g.fillRect(-10, -6, 11, 12);
      g.fillStyle = '#e8e4f0';
      g.fillRect(6, -7, 3, 14);
    }
    g.restore();
  }

  function paintFloor() {
    const g = fg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = '#04030b';
    g.fillRect(0, 0, M.pxW, M.pxH);

    for (let y = 0; y < M.H; y++)
      for (let x = 0; x < M.W; x++) {
        const t = M.tile(x, y);
        if (t === TT.WALL) continue;
        if (t === TT.WINDOW) continue; // painted below
        floorTile(g, x, y, M.zone[M.idx(x, y)]);
      }

    hubGuides(g, false);
    speedwayPaint(g, false);
    aquaPaint(g, false);
    hazardPaint(g, false);
    facilityPaint(g, false);

    // riser spawn cracks
    for (const r of M.risers) {
      g.save();
      g.translate(r.x, r.y);
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * U.TAU, rr = 13 + U.hash(r.tx, r.ty, i) * 9;
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = U.hash(r.tx, r.ty, 20 + i) * U.TAU;
        g.beginPath();
        g.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
        g.lineTo(Math.cos(a + 0.3) * 30, Math.sin(a + 0.3) * 30);
        g.stroke();
      }
      g.restore();
    }

    // windows: dark opening with a sill on the inside edge
    for (const w of M.windows) {
      const px = w.tx * T, py = w.ty * T;
      g.fillStyle = '#020106';
      g.fillRect(px, py, T, T);
      const fog = g.createRadialGradient(px + T / 2, py + T / 2, 2, px + T / 2, py + T / 2, T * 0.7);
      fog.addColorStop(0, 'rgba(60,90,70,0.28)');
      fog.addColorStop(1, 'rgba(60,90,70,0)');
      g.fillStyle = fog;
      g.fillRect(px, py, T, T);
      g.fillStyle = '#2d2647';
      if (w.dy === 1) g.fillRect(px, py + T - 6, T, 6);
      else if (w.dy === -1) g.fillRect(px, py, T, 6);
      else if (w.dx === 1) g.fillRect(px + T - 6, py, 6, T);
      else g.fillRect(px, py, 6, T);
    }

    // ambient-occlusion shadows where floor meets walls
    for (let y = 0; y < M.H; y++)
      for (let x = 0; x < M.W; x++) {
        const t = M.tile(x, y);
        if (t === TT.WALL || t === TT.WINDOW) continue;
        const px = x * T, py = y * T;
        if (isWall(x, y - 1)) {
          const gr = g.createLinearGradient(0, py, 0, py + 18);
          gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(px, py, T, 18);
        }
        if (isWall(x - 1, y)) {
          const gr = g.createLinearGradient(px, 0, px + 12, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(px, py, 12, T);
        }
        if (isWall(x + 1, y)) {
          const gr = g.createLinearGradient(px + T, 0, px + T - 12, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(px + T - 12, py, 12, T);
        }
      }

    for (const p of M.props) if (!p.tall) drawLowProp(g, p);

    // south-facing wall faces
    for (let y = 0; y < M.H - 1; y++)
      for (let x = 0; x < M.W; x++) {
        if (!isWall(x, y) || isWall(x, y + 1)) continue;
        const px = x * T, py = y * T + T - WH;
        const gr = g.createLinearGradient(0, py, 0, py + WH);
        gr.addColorStop(0, '#231c3d'); gr.addColorStop(1, '#0d0a1a');
        g.fillStyle = gr;
        g.fillRect(px, py, T, WH);
        const zn = M.zone[M.idx(x, y + 1)];
        g.fillStyle = U.rgba(zoneColor(zn), 0.3);
        g.fillRect(px, py + 6, T, 2);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        if (U.hash(x, y, 8) < 0.5) g.fillRect(px + Math.floor(U.hash(x, y, 9) * T), py, 1, WH);
      }
  }

  /** Stamp a permanent decal (blood, scorch) onto the floor layer. */
  MA.decal = function (x, y, r, color, alpha) {
    if (!fg) return;
    const t = M.tileAt(x, y);
    if (t === TT.WALL || t === TT.WINDOW) return;
    fg.save();
    fg.globalAlpha = alpha;
    fg.fillStyle = color;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU, d = Math.random() * r * 0.8;
      const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d;
      const bt = M.tileAt(bx, by);
      if (bt === TT.WALL || bt === TT.WINDOW) continue;
      fg.beginPath();
      fg.ellipse(bx, by, r * U.rand(0.25, 0.6), r * U.rand(0.2, 0.5), Math.random() * 3, 0, U.TAU);
      fg.fill();
    }
    fg.restore();
  };

  /* ================================================================== */
  /* tall props (shared between the dim top layer and the neon layer)   */
  /* ================================================================== */
  function tallProp(g, p, neon) {
    const x = p.tx * T, y = p.ty * T - WH, w = p.w * T, h = p.h * T;
    const box = (roof, face) => {
      if (neon) return;
      g.fillStyle = face;
      g.fillRect(x, y + h, w, WH);
      g.fillStyle = roof;
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
    g.save();
    if (p.kind === 'cabinet') {
      box('#17102a', '#0c0817');
      const cols = ['#ff4fd8', '#19f0ff', '#ffe14d', '#3dff8b', '#a855ff', '#ff7a1a'];
      for (let j = 0; j < p.h; j++)
        for (let i = 0; i < p.w; i++) {
          const cx = x + i * T, cy = y + j * T;
          const col = cols[Math.floor(U.hash(p.tx + i, p.ty + j, 3) * cols.length)];
          if (!neon) {
            g.fillStyle = '#241840';
            g.fillRect(cx + 3, cy + 3, T - 6, T - 6);
            g.fillStyle = '#0a0714';
            g.fillRect(i === 0 ? cx + 4 : cx + T - 20, cy + 8, 16, T - 16);
          }
          g.globalAlpha = neon ? 0.95 : 0.3;
          g.fillStyle = col;
          const sx = i === 0 ? cx + 6 : cx + T - 18;
          g.fillRect(sx, cy + 10, 12, T - 20);
          // pixel doodle on screen
          g.fillStyle = neon ? '#ffffff' : 'rgba(255,255,255,0.4)';
          for (let k = 0; k < 4; k++) g.fillRect(sx + 2 + Math.floor(U.hash(cx, cy, k) * 3) * 3, cy + 13 + k * 6, 3, 3);
          g.globalAlpha = neon ? 0.9 : 0.35;
          g.fillStyle = col;
          g.fillRect(i === 0 ? cx + 26 : cx + 12, cy + 12, 10, 4); // marquee strip
          g.globalAlpha = 1;
        }
    } else if (p.kind === 'tank') {
      box('#14303d', '#0a1a22');
      if (!neon) {
        const wg = g.createLinearGradient(x, y, x + w, y + h);
        wg.addColorStop(0, '#0d6c8c'); wg.addColorStop(1, '#063247');
        g.fillStyle = wg;
        g.fillRect(x + 6, y + 6, w - 12, h - 12);
        g.fillStyle = '#1a5a2e';
        for (let i = 0; i < 4; i++) g.fillRect(x + 14 + i * 19, y + h - 26 - U.hash(p.tx, i, 1) * 16, 3, 20 + U.hash(p.tx, i, 1) * 16);
      } else {
        g.globalAlpha = 0.4;
        g.fillStyle = '#19d8ff';
        g.fillRect(x + 6, y + 6, w - 12, h - 12);
        g.globalAlpha = 1;
      }
      const fc = ['#ff8a1f', '#ffe14d', '#ff4fd8'];
      for (let i = 0; i < 5; i++) {
        const fx = x + 16 + U.hash(p.tx, p.ty, 10 + i) * (w - 36), fy = y + 16 + U.hash(p.tx, p.ty, 20 + i) * (h - 34);
        g.fillStyle = fc[i % 3];
        g.globalAlpha = neon ? 0.95 : 0.7;
        g.beginPath(); g.ellipse(fx, fy, 6, 3, 0, 0, U.TAU); g.fill();
        g.beginPath(); g.moveTo(fx - 5, fy); g.lineTo(fx - 10, fy - 4); g.lineTo(fx - 10, fy + 4); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    } else if (p.kind === 'generator') {
      box('#2a2f35', '#14171b');
      if (!neon) {
        g.fillStyle = '#1b1f24';
        g.fillRect(x + 8, y + 8, w - 16, h - 16);
        g.fillStyle = '#0b0d10';
        for (let i = 0; i < 6; i++) g.fillRect(x + 14, y + 16 + i * 10, w - 46, 4);
        g.fillStyle = '#c9b21f';
        for (let i = 0; i < 6; i++) g.fillRect(x + 4 + i * 16, y + h - 8, 8, 5);
      }
      g.fillStyle = '#c8ff3a';
      g.globalAlpha = neon ? 0.95 : 0.25;
      g.beginPath(); g.arc(x + w - 20, y + 24, 9, 0, U.TAU); g.fill();
      g.fillStyle = '#3dff8b';
      g.fillRect(x + w - 26, y + 44, 5, 5);
      g.fillRect(x + w - 17, y + 44, 5, 5);
      g.fillStyle = '#ff3b4e';
      g.fillRect(x + w - 26, y + 54, 5, 5);
      g.globalAlpha = 1;
    } else if (p.kind === 'booth') {
      box('#3a1d4d', '#170c22');
      if (!neon) {
        for (let i = 0; i < 6; i++) {
          g.fillStyle = i % 2 ? '#7a2a66' : '#c9b8d8';
          g.globalAlpha = 0.8;
          g.fillRect(x + i * (w / 6), y, w / 6, h);
        }
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x, y + h - 10, w, 10);
        g.fillStyle = '#12091f';
        g.fillRect(x + 14, y + h / 2 - 11, w - 28, 22);
      }
      g.font = '900 13px ' + GW.FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffe14d';
      g.globalAlpha = neon ? 1 : 0.4;
      g.fillText('TICKETS', x + w / 2, y + h / 2 + 1);
      g.globalAlpha = 1;
    } else if (p.kind === 'podium') {
      box('#2a2632', '#141218');
      if (!neon) {
        for (let j = 0; j < 12; j++)
          for (let i = 0; i < 6; i++) {
            g.fillStyle = (i + j) % 2 ? '#d8d4e4' : '#16141c';
            g.fillRect(x + i * 8, y + j * 8, 8, 8);
          }
      }
      g.fillStyle = '#ffd426';
      g.globalAlpha = neon ? 0.9 : 0.6;
      g.beginPath(); g.arc(x + w / 2, y + h / 2, 11, 0, U.TAU); g.fill();
      g.globalAlpha = 1;
    } else if (p.kind === 'coil') {
      box('#23272c', '#101316');
      const cx = x + w / 2, cy = y + h / 2;
      if (!neon) {
        g.fillStyle = '#3a4047';
        g.beginPath(); g.arc(cx, cy, 19, 0, U.TAU); g.fill();
        g.fillStyle = '#15181c';
        g.beginPath(); g.arc(cx, cy, 13, 0, U.TAU); g.fill();
      }
      g.strokeStyle = '#c8ff3a';
      g.lineWidth = 3;
      g.globalAlpha = neon ? 0.95 : 0.3;
      g.beginPath(); g.arc(cx, cy, 16, 0, U.TAU); g.stroke();
      g.fillStyle = '#c8ff3a';
      g.beginPath(); g.arc(cx, cy, 5, 0, U.TAU); g.fill();
      g.globalAlpha = 1;
    } else if (p.kind === 'speaker') {
      box('#0f0c16', '#07050b');
      const cx = x + w / 2;
      g.strokeStyle = '#ff4fd8';
      g.lineWidth = 2.5;
      g.globalAlpha = neon ? 0.95 : 0.3;
      g.beginPath(); g.arc(cx, y + 15, 9, 0, U.TAU); g.stroke();
      g.beginPath(); g.arc(cx, y + 34, 6, 0, U.TAU); g.stroke();
      g.globalAlpha = 1;
    } else if (p.kind === 'perk') {
      const perk = GW.PERKS[p.perk];
      box('#191025', '#0b0712');
      g.fillStyle = perk.color;
      g.globalAlpha = neon ? 0.55 : 0.22;
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.globalAlpha = neon ? 1 : 0.5;
      Art.perkIcon(g, p.perk, x + w / 2, y + h / 2, 32);
      if (!neon) {
        g.globalAlpha = 0.5;
        g.fillStyle = perk.color;
        g.fillRect(x + 6, y + h + 5, w - 12, 4); // front light bar
      } else {
        g.globalAlpha = 1;
        g.fillStyle = perk.color;
        g.fillRect(x + 6, y + h + 5, w - 12, 4);
      }
      g.globalAlpha = 1;
    } else if (p.kind === 'box' || p.kind === 'pap') {
      // base plate only; the machine itself is drawn dynamically
      if (!neon) {
        g.fillStyle = '#0d0a16';
        g.fillRect(x, y + WH, w, h);
      }
    }
    g.restore();
  }

  /* ================================================================== */
  /* wall tops + neon trims                                             */
  /* ================================================================== */
  function collectTrims() {
    const byColor = {};
    const add = (zn, x1, y1, x2, y2) => {
      if (zn < 0) return;
      const c = zoneColor(zn);
      (byColor[c] = byColor[c] || []).push(x1, y1, x2, y2);
    };
    for (let y = 0; y < M.H; y++)
      for (let x = 0; x < M.W; x++) {
        if (!isWall(x, y)) continue;
        const px = x * T, py = y * T - WH;
        if (M.inb(x, y - 1) && !isWall(x, y - 1)) add(M.zone[M.idx(x, y - 1)], px, py, px + T, py);
        if (M.inb(x, y + 1) && !isWall(x, y + 1)) add(M.zone[M.idx(x, y + 1)], px, py + T, px + T, py + T);
        if (M.inb(x - 1, y) && !isWall(x - 1, y)) add(M.zone[M.idx(x - 1, y)], px, py, px, py + T);
        if (M.inb(x + 1, y) && !isWall(x + 1, y)) add(M.zone[M.idx(x + 1, y)], px + T, py, px + T, py + T);
      }
    return byColor;
  }

  function strokeSegs(g, segs) {
    g.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      g.moveTo(segs[i], segs[i + 1]);
      g.lineTo(segs[i + 2], segs[i + 3]);
    }
    g.stroke();
  }

  function drawSigns(g, neon) {
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const s of SIGNS) {
      const col = s.color || zoneColor(s.zone);
      const x = s.tx * T, y = (s.ty + 0.5) * T - WH;
      g.font = '900 ' + s.size + 'px ' + GW.FONT;
      if (neon) {
        g.shadowColor = col;
        g.shadowBlur = 8;
        g.fillStyle = col;
        g.globalAlpha = 1;
        g.fillText(s.text, x, y);
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillText(s.text, x, y);
      } else {
        g.fillStyle = col;
        g.globalAlpha = 0.35;
        g.fillText(s.text, x, y);
      }
    }
    g.restore();
  }

  function paintTop() {
    const g = tg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, M.pxW, M.pxH);
    // roofs
    for (let y = 0; y < M.H; y++)
      for (let x = 0; x < M.W; x++) {
        if (!isWall(x, y)) continue;
        const h = U.hash(x, y, 12);
        g.fillStyle = 'hsl(252,32%,' + (5.2 + h * 1.6) + '%)';
        g.fillRect(x * T, y * T - WH, T, T + 0.5);
        if (h < 0.08) {
          g.fillStyle = 'rgba(255,255,255,0.025)';
          g.fillRect(x * T + 10, y * T - WH + 10, T - 20, T - 20); // roof vent
        }
      }
    // dim (unpowered) trims
    const trims = collectTrims();
    g.lineCap = 'square';
    for (const c in trims) {
      g.strokeStyle = U.rgba(c, 0.42);
      g.lineWidth = 2;
      strokeSegs(g, trims[c]);
    }
    for (const p of M.props) if (p.tall) tallProp(g, p, false);
    drawSigns(g, false);
  }

  function paintNeon() {
    const g = ng;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, MA.neon.width, MA.neon.height);
    g.setTransform(NS, 0, 0, NS, 0, 0);
    // bake the coloured pools of every powered light so they cost nothing per frame
    g.globalCompositeOperation = 'lighter';
    for (const L of M.lights) if (!L.always) Art.drawGlow(g, L.color, L.x, L.y, L.r * 1.15, 0.17);
    g.globalCompositeOperation = 'source-over';
    hubGuides(g, true);
    speedwayPaint(g, true);
    aquaPaint(g, true);
    hazardPaint(g, true);
    facilityPaint(g, true);
    const trims = collectTrims();
    g.lineCap = 'round';
    for (const c in trims) {
      g.shadowColor = c;
      g.shadowBlur = 9;
      g.strokeStyle = c;
      g.lineWidth = 3.5;
      strokeSegs(g, trims[c]);
      strokeSegs(g, trims[c]); // second pass thickens the bloom
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.2;
      strokeSegs(g, trims[c]);
    }
    g.shadowBlur = 0;
    for (const p of M.props) if (p.tall) tallProp(g, p, true);
    // fountain glow ring
    for (const p of M.props) {
      if (p.kind !== 'fountain') continue;
      g.strokeStyle = '#19f0ff';
      g.shadowColor = '#19f0ff';
      g.shadowBlur = 10;
      g.lineWidth = 4;
      g.beginPath();
      g.arc((p.tx + 1) * T, (p.ty + 1) * T, 42, 0, U.TAU);
      g.stroke();
      g.shadowBlur = 0;
    }
    drawSigns(g, true);
  }

  function paintMini() {
    const g = MA.mini.getContext('2d');
    g.clearRect(0, 0, MA.mini.width, MA.mini.height);
    for (let y = 0; y < M.H; y++)
      for (let x = 0; x < M.W; x++) {
        const t = M.tile(x, y);
        if (t === TT.WALL) continue;
        const zn = M.zone[M.idx(x, y)];
        g.fillStyle = t === TT.WINDOW ? 'rgba(255,255,255,0.25)' : U.rgba(zoneColor(zn), t === TT.FLOOR || t === TT.DOOR ? 0.4 : 0.2);
        g.fillRect(x * 3, y * 3, 3, 3);
      }
  }
})();
