/*
 * GRAVEWAVE ARENA — the player's side of a match: moving and shooting your own character
 * (instantly, on your phone), reporting your hits, and showing everyone else from what the
 * match sends. The match itself (js/arena/sim.js) runs on the server, or in this page for
 * games with bots only.
 */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, A = GW.Arena, K = GW.AControls, Au = GW.Audio;
  const C = (GW.AC = {
    ready: false,
    state: 'menu', // menu | wait | play | over
    myId: 0,
    mode: 'team',
    ffa: false,
    map: null,
    ents: new Map(),
    me: null,
    proj: [],
    fx: [],
    cubes: [],
    turrets: [],
    zones: [],
    deadBoxes: new Set(),
    gas: 0,
    score: [0, 0],
    timeLeft: 0,
    cam: { x: 0, y: 0 },
    clock: 0,
    local: null, // the match running in this page (bots only)
    ws: null,
    net: { code: '', leader: 0, players: [], picks: {}, mode: 'team' },
  });
  // my own fighter's state that never leaves the phone
  const L = (C.L = { ammo: A.AMMO, rl: 0, cd: 0, dash: null, leap: null, lastAtk: -9, sendT: 0, spectate: 0 });
  const SHOT_SOUND = { guard: 'shotgun', sniper: 'sniper', engineer: 'smg', medic: 'energy', bomber: 'launcher', ninja: 'katana' };

  const now = () => performance.now() / 1000;
  const T = (s) => (GW.L ? GW.L.t(s) : s);

  /* ------------------------------------------------------------------ */
  /* sending                                                             */
  /* ------------------------------------------------------------------ */
  C.send = function (m) {
    if (C.local) {
      m.from = C.myId;
      C.local.receive(m);
    } else if (C.ws && C.ws.readyState === 1) C.ws.send(JSON.stringify(m));
  };

  /* ------------------------------------------------------------------ */
  /* starting                                                            */
  /* ------------------------------------------------------------------ */
  /** A match against bots, run right here in the page. */
  C.startSolo = function (mode, char) {
    C.stopLocal();
    C.myId = 1;
    C.state = 'wait';
    C.local = new GW.ArenaSim(1 + Math.floor(Math.random() * 1e9), [1], (text) => C.onMsg(JSON.parse(text)), { mode, picks: { 1: char } });
  };
  C.stopLocal = function () {
    if (C.local) C.local.stop();
    C.local = null;
  };

  function begin(m) {
    C.mode = m.mode;
    C.ffa = m.mode === 'ffa';
    C.map = A.buildMap(m.mode);
    C.ents = new Map();
    for (const e of m.e) {
      C.ents.set(e.id, {
        id: e.id, c: e.c, tm: e.tm, n: e.n, bot: !!e.b, x: e.x, y: e.y, a: e.a || 0, rx: e.x, ry: e.y,
        hp: A.maxHp(e.c, 0), maxHp: A.maxHp(e.c, 0), alive: true, cubes: 0, sup: 0, rev: 0, revT: 0, kills: 0, buf: [], lastAp: 0, flash: 0,
      });
    }
    C.me = C.ents.get(C.myId) || null;
    Object.assign(L, { ammo: A.AMMO, rl: 0, cd: 0, dash: null, leap: null, lastAtk: -9, sendT: 0, spectate: 0 });
    C.proj = [];
    C.fx = [];
    C.cubes = [];
    C.turrets = [];
    C.zones = [];
    C.deadBoxes = new Set();
    C.score = [0, 0];
    C.gas = 0;
    C.timeLeft = A.TEAM_TIME;
    C.feed = [];
    if (C.me) {
      C.cam.x = C.me.x;
      C.cam.y = C.me.y;
    }
    K.clear();
    GW.ADraw.buildMap(C.map);
    C.state = 'play';
    if (C.onBegin) C.onBegin();
    Au.init();
    Au.play('roundStart');
  }

  /* ------------------------------------------------------------------ */
  /* messages from the match                                             */
  /* ------------------------------------------------------------------ */
  C.onMsg = function (m) {
    switch (m.t) {
      case 'ainit':
        return begin(m);
      case 'aw':
        return snapshot(m);
      case 'ae':
        return event(m);
      case 'as':
        return remoteShot(m);
      case 'ap': {
        const e = C.ents.get(m.from);
        if (!e || e === C.me) return;
        pushSample(e, m.x, m.y, m.a);
        e.lastAp = C.clock;
        if (m.r) e.revT = C.clock + 0.8;
        return;
      }
    }
    if (C.onLobby) C.onLobby(m);
  };

  function pushSample(e, x, y, a) {
    e.buf.push({ t: C.clock, x, y, a });
    if (e.buf.length > 24) e.buf.shift();
  }

  function snapshot(m) {
    if (C.state !== 'play' && C.state !== 'over') return;
    for (const r of m.e) {
      const e = C.ents.get(r[0]);
      if (!e) continue;
      e.hp = r[4];
      e.maxHp = r[5];
      const alive = !!r[6];
      if (e === C.me && !alive && C.me.alive) C.me.alive = false;
      if (e !== C.me) e.alive = alive;
      e.cubes = r[7];
      e.sup = r[8];
      e.rev = r[9];
      e.kills = r[10];
      if (e === C.me) continue;
      if (e.bot || C.clock - e.lastAp > 0.5) pushSample(e, r[1], r[2], r[3] / 100);
    }
    for (const id of m.bx) {
      if (C.deadBoxes.has(id)) continue;
      C.deadBoxes.add(id);
      const b = C.map.boxes[id];
      if (b) {
        C.map.tiles[b.ty * C.map.w + b.tx] = A.T.FLOOR;
        const p = A.boxPos(C.map, b);
        fx('debris', p.x, p.y, { color: '#c98a3c' });
        Au.play('bang', { x: p.x, y: p.y });
      }
    }
    C.cubes = m.cb;
    C.turrets = m.tu;
    C.zones = m.z;
    C.score = m.sc;
    if (m.g !== undefined) C.gas = m.g;
    if (m.tl !== undefined) C.timeLeft = m.tl;
  }

  C.nameOf = (id) => {
    const e = C.ents.get(id);
    if (!e) return '';
    if (e === C.me) return T('YOU');
    return e.bot ? T(A.CHARS[e.c].name) : e.n;
  };

  function event(m) {
    const e = C.ents.get(m.id);
    switch (m.k) {
      case 'hit':
        if (!e) return;
        fx('num', e.rx, e.ry - 30, { d: m.d });
        if (m.d > 0) {
          e.flash = 0.12;
          if (e === C.me) {
            Au.play('hurt');
            C.hurtFlash = 0.35;
          } else if (m.by === C.myId) Au.play('hit', { x: e.rx, y: e.ry });
        }
        return;
      case 'kill': {
        const v = C.ents.get(m.v);
        if (v) {
          fx('poof', v.rx, v.ry, { color: A.CHARS[v.c].color });
          v.alive = false;
          v.buf.length = 0;
        }
        C.feed.unshift({ t: C.clock, by: m.by, v: m.v });
        if (C.feed.length > 4) C.feed.pop();
        if (m.v === C.myId) {
          C.me.alive = false;
          L.dash = L.leap = null;
          L.spectate = m.by || 0;
          L.rank = m.rank;
          Au.play('gameOver');
        } else if (m.by === C.myId) Au.play('crit');
        if (C.onFeed) C.onFeed();
        return;
      }
      case 'resp':
        if (!e) return;
        e.alive = true;
        e.x = e.rx = m.x;
        e.y = e.ry = m.y;
        e.buf.length = 0;
        if (e === C.me) {
          L.ammo = A.AMMO;
          L.dash = L.leap = null;
          C.cam.x = m.x;
          C.cam.y = m.y;
          Au.play('teleport');
        }
        return;
      case 'kb':
        if (e === C.me && C.me.alive) A.move(C.map, C.me, m.dx, m.dy);
        return;
      case 'cube':
        if (e) fx('ring', e.rx, e.ry, { color: '#3dff8b', r: 40 });
        if (e === C.me) Au.play('powerup');
        return;
      case 'bot':
        if (e) {
          e.bot = true;
          e.n = A.CHARS[e.c].name;
        }
        return;
      case 'end':
        C.state = 'over';
        C.result = m;
        K.clear();
        Au.play(won(m) ? 'roundEnd' : 'gameOver');
        if (C.onEnd) C.onEnd(m);
        return;
    }
  }
  const won = (m) => (C.ffa ? m.win === C.myId : C.me && m.win === C.me.tm);
  C.won = won;

  /** Someone else fired (a player, a bot or a turret): draw it. Hits are decided by whoever fired. */
  function remoteShot(m) {
    if (C.state !== 'play') return;
    const o = m.o !== undefined ? m.o : m.from;
    if (o === C.myId && !m.tur) return;
    const ent = C.ents.get(o);
    const ch = A.CHARS[m.c];
    if (!ch) return;
    if (m.tur) {
      C.proj.push({ k: 'p', vis: true, x: m.x, y: m.y, a: m.a, sp: 1100, life: ch.sup.reach / 1100, r: 5, color: ch.color, wait: 0 });
      Au.play('allyShot', { x: m.x, y: m.y });
      return;
    }
    if (ent) {
      ent.revT = C.clock + 0.8;
      ent.a = m.a;
    }
    const spec = m.s ? ch.sup : ch.atk;
    Au.play(m.s ? 'special' : 'shot', { x: m.x, y: m.y, cls: SHOT_SOUND[m.c] });
    switch (spec.kind) {
      case 'slash':
        fx('slash', m.x, m.y, { a: m.a, r: spec.range, arc: spec.arc, color: ch.color });
        return;
      case 'laser': {
        const len = A.ray(C.map, m.x, m.y, m.a, spec.range);
        fx('beam', m.x, m.y, { a: m.a, len, color: ch.color, w: spec.width });
        return;
      }
      case 'charge':
        fx('ring', m.x, m.y, { color: ch.color, r: 50 });
        return;
      case 'leap': {
        const d = Math.min(spec.range, m.d || spec.range);
        fx('leap', m.x + Math.cos(m.a) * d, m.y + Math.sin(m.a) * d, { color: ch.color, r: spec.radius, delay: spec.time });
        return;
      }
      case 'turret':
      case 'zone':
        return;
    }
    for (const p of A.projectiles({ o, tm: ent ? ent.tm : -1, c: m.c, s: m.s, x: m.x, y: m.y, a: m.a, d: m.d })) {
      p.vis = true;
      C.proj.push(p);
    }
  }

  /* ------------------------------------------------------------------ */
  /* effects                                                             */
  /* ------------------------------------------------------------------ */
  function fx(kind, x, y, o) {
    C.fx.push(Object.assign({ kind, x, y, t: 0, life: kind === 'num' ? 0.8 : kind === 'beam' ? 0.35 : kind === 'leap' ? 0.6 : 0.45 }, o || {}));
    if (C.fx.length > 160) C.fx.shift();
  }
  C.fx_ = fx;

  /* ------------------------------------------------------------------ */
  /* my fighter                                                          */
  /* ------------------------------------------------------------------ */
  C.isEnemy = (e) => e && C.me && e !== C.me && e.tm !== C.me.tm;
  /** Hidden in the bushes from me? (my team sees what any teammate is close to) */
  C.hidden = function (e) {
    if (!C.me || !C.isEnemy(e) || !A.inBrush(C.map, e.rx, e.ry)) return false;
    if (e.rev || e.revT > C.clock) return false;
    for (const o of C.ents.values()) if (o.alive && o.tm === C.me.tm && Math.hypot(o.rx - e.rx, o.ry - e.ry) < A.REVEAL) return false;
    return true;
  };

  function enemies() {
    const out = [];
    for (const e of C.ents.values()) if (e.alive && C.isEnemy(e)) out.push({ key: e.id, x: e.rx, y: e.ry, r: A.R, e });
    for (const t of C.turrets) if (t[3] !== C.me.tm) out.push({ key: 't' + t[0], x: t[1], y: t[2], r: 18 });
    return out;
  }
  function allies() {
    const out = [];
    if (C.ffa) return out;
    for (const e of C.ents.values()) if (e.alive && e !== C.me && e.tm === C.me.tm) out.push({ key: e.id, x: e.rx, y: e.ry, r: A.R, e });
    return out;
  }
  /** Tell the match my attack hit something. */
  function report(key, dmg, sup, kx, ky, heal) {
    const m = { t: 'ah', to: 'host', i: key, d: Math.round(dmg || 0), s: sup ? 1 : 0 };
    if (heal) m.h = Math.round(heal);
    if (kx || ky) {
      m.kx = Math.round(kx);
      m.ky = Math.round(ky);
    }
    C.send(m);
  }
  function boxAt(x, y) {
    if (A.tileAt(C.map, x, y) !== A.T.BOX) return null;
    const tx = Math.floor(x / A.TILE), ty = Math.floor(y / A.TILE);
    return C.map.boxes.find((b) => b.tx === tx && b.ty === ty && !C.deadBoxes.has(b.id)) || null;
  }

  /** Nearest enemy I can see within range (for tap-to-fire). */
  function autoTarget(range) {
    let best = null, bd = range;
    for (const e of C.ents.values()) {
      if (!e.alive || !C.isEnemy(e) || C.hidden(e)) continue;
      const d = Math.hypot(e.rx - C.me.x, e.ry - C.me.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) return { x: best.rx, y: best.ry };
    // nothing to shoot: a box (10-player mode)
    if (C.ffa)
      for (const b of C.map.boxes) {
        if (C.deadBoxes.has(b.id)) continue;
        const p = A.boxPos(C.map, b), d = Math.hypot(p.x - C.me.x, p.y - C.me.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
    return best && best.x !== undefined ? best : null;
  }

  C.screenToWorld = (sx, sy) => {
    const z = GW.ADraw.zoomCss || 1;
    return { x: C.cam.x + (sx - U.viewW() / 2) / z, y: C.cam.y + (sy - U.viewH() / 2) / z };
  };

  function attack(act) {
    const me = C.me, ch = A.CHARS[me.c], sup = act.type === 'super';
    const spec = sup ? ch.sup : ch.atk;
    if (sup && me.sup < A.SUPER_FULL) return Au.play('deny');
    if (!sup && (L.ammo < 1 || L.cd > 0)) {
      if (L.ammo < 1) Au.play('empty');
      return;
    }
    const reach = A.reach(me.c, sup);
    let a, d;
    if (act.mouse) {
      const w = C.screenToWorld(K.mouse.x, K.mouse.y);
      a = Math.atan2(w.y - me.y, w.x - me.x);
      d = Math.min(reach, Math.hypot(w.x - me.x, w.y - me.y));
    } else if (act.auto) {
      const t = autoTarget(reach * (A.aimsAtSpot(me.c, sup) ? 1.1 : 1.05) + A.R);
      if (t) {
        a = Math.atan2(t.y - me.y, t.x - me.x);
        d = Math.min(reach, Math.hypot(t.x - me.x, t.y - me.y));
      } else {
        a = me.a;
        d = reach * 0.75;
      }
    } else {
      a = act.a;
      d = Math.max(0.15, act.mag) * reach;
    }
    if (sup) me.sup = 0;
    else {
      L.ammo--;
      L.cd = ch.cd;
    }
    L.lastAtk = C.clock;
    me.a = a;
    const mul = A.dmgMul(me.cubes);
    C.send({ t: 'as', o: me.id, c: me.c, s: sup ? 1 : 0, x: Math.round(me.x), y: Math.round(me.y), a: +a.toFixed(3), d: Math.round(d) });
    Au.play(sup ? 'special' : 'shot', { cls: SHOT_SOUND[me.c] });
    switch (spec.kind) {
      case 'slash': {
        for (const t of enemies()) {
          const dd = Math.hypot(t.x - me.x, t.y - me.y);
          let da = Math.abs(Math.atan2(t.y - me.y, t.x - me.x) - a);
          if (da > Math.PI) da = A.TAU - da;
          if (dd <= spec.range + t.r && da <= spec.arc / 2) report(t.key, spec.dmg * mul, sup);
        }
        if (C.ffa) {
          const bx = boxAt(me.x + Math.cos(a) * (spec.range * 0.8), me.y + Math.sin(a) * (spec.range * 0.8));
          if (bx) report('b' + bx.id, spec.dmg * mul, sup);
        }
        fx('slash', me.x, me.y, { a, r: spec.range, arc: spec.arc, color: ch.color });
        return;
      }
      case 'laser': {
        const len = A.ray(C.map, me.x, me.y, a, spec.range);
        const x2 = me.x + Math.cos(a) * len, y2 = me.y + Math.sin(a) * len;
        for (const t of enemies()) if (A.segHit(me.x, me.y, x2, y2, t.x, t.y, t.r + spec.width / 2)) report(t.key, spec.dmg * mul, true);
        const bx = boxAt(x2 + Math.cos(a) * 8, y2 + Math.sin(a) * 8);
        if (bx) report('b' + bx.id, spec.dmg * mul, true);
        fx('beam', me.x, me.y, { a, len, color: ch.color, w: spec.width });
        return;
      }
      case 'charge':
        L.dash = { a, t: spec.time, sp: spec.range / spec.time, hit: new Set(), mul };
        return;
      case 'leap': {
        let tx = me.x + Math.cos(a) * d, ty = me.y + Math.sin(a) * d;
        for (let k = 1; k >= 0; k -= 0.1) {
          tx = me.x + Math.cos(a) * d * k;
          ty = me.y + Math.sin(a) * d * k;
          if (!A.blocksMove(A.tileAt(C.map, tx, ty))) break;
        }
        L.leap = { x0: me.x, y0: me.y, tx, ty, t: 0, T: spec.time, mul };
        return;
      }
      case 'turret':
      case 'zone':
        fx('ring', me.x + Math.cos(a) * d, me.y + Math.sin(a) * d, { color: ch.color, r: 40 });
        return;
    }
    for (const p of A.projectiles({ o: me.id, tm: me.tm, c: me.c, s: sup, x: me.x, y: me.y, a, d, m: mul })) {
      p.mine = true;
      C.proj.push(p);
    }
  }

  function myShotHits(p, x1, y1, x2, y2) {
    for (const t of enemies()) {
      if (p.hit && p.hit.has(t.key)) continue;
      if (!A.segHit(x1, y1, x2, y2, t.x, t.y, t.r + p.r)) continue;
      (p.hit = p.hit || new Set()).add(t.key);
      report(t.key, p.dmg, p.s);
      fx('spark', t.x, t.y, { color: p.color });
      if (!p.pierce) return true;
    }
    if (p.heal)
      for (const t of allies()) {
        if (p.hit && p.hit.has(t.key)) continue;
        if (!A.segHit(x1, y1, x2, y2, t.x, t.y, t.r + p.r)) continue;
        (p.hit = p.hit || new Set()).add(t.key);
        report(t.key, 0, false, 0, 0, p.heal);
        fx('ring', t.x, t.y, { color: '#3dff8b', r: 30 });
      }
    return false;
  }
  function myBoom(p) {
    const x = p.tx, y = p.ty;
    for (const t of enemies()) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d > p.rad + t.r) continue;
      report(t.key, p.dmg, p.s, p.kb ? ((t.x - x) / (d || 1)) * p.kb : 0, p.kb ? ((t.y - y) / (d || 1)) * p.kb : 0);
    }
    if (C.ffa)
      for (const b of C.map.boxes) {
        if (C.deadBoxes.has(b.id)) continue;
        const bp = A.boxPos(C.map, b);
        if (Math.hypot(bp.x - x, bp.y - y) <= p.rad + A.TILE / 2) report('b' + b.id, p.dmg, p.s);
      }
  }

  function updateMe(dt) {
    const me = C.me;
    if (!me || !me.alive || C.state !== 'play') return;
    const ch = A.CHARS[me.c];
    // reload one bar at a time
    if (L.ammo < A.AMMO && (L.rl += dt) >= ch.reload) {
      L.ammo++;
      L.rl = 0;
    }
    if (L.ammo >= A.AMMO) L.rl = 0;
    L.cd -= dt;
    if (L.dash) {
      const D = L.dash, spec = ch.sup, ox = me.x, oy = me.y;
      A.move(C.map, me, Math.cos(D.a) * D.sp * dt, Math.sin(D.a) * D.sp * dt);
      for (const t of enemies()) {
        if (D.hit.has(t.key) || Math.hypot(t.x - me.x, t.y - me.y) > A.R + t.r + 6) continue;
        D.hit.add(t.key);
        report(t.key, spec.dmg * D.mul, true, Math.cos(D.a) * spec.kb, Math.sin(D.a) * spec.kb);
        fx('ring', t.x, t.y, { color: ch.color, r: 36 });
      }
      fx('trail', me.x, me.y, { color: ch.color });
      D.t -= dt;
      if (D.t <= 0 || Math.hypot(me.x - ox, me.y - oy) < 0.5) L.dash = null;
    } else if (L.leap) {
      const J = L.leap;
      J.t += dt;
      const k = Math.min(1, J.t / J.T);
      me.x = J.x0 + (J.tx - J.x0) * k;
      me.y = J.y0 + (J.ty - J.y0) * k;
      me.hop = Math.sin(k * Math.PI) * 40;
      if (k >= 1) {
        L.leap = null;
        me.hop = 0;
        const spec = ch.sup;
        for (const t of enemies()) if (Math.hypot(t.x - me.x, t.y - me.y) <= spec.radius + t.r) report(t.key, spec.dmg * J.mul, true);
        fx('boom', me.x, me.y, { color: ch.color, r: spec.radius });
        Au.play('explosion', { x: me.x, y: me.y });
      }
    } else {
      const sp = ch.speed * dt;
      if (K.mx || K.my) {
        A.move(C.map, me, K.mx * sp, K.my * sp);
        if (!K.preview()) me.a = Math.atan2(K.my, K.mx);
      }
      const pv = K.preview();
      if (pv) me.a = pv.a;
      else if (!K.touch && K.mouse.inside) {
        const w = C.screenToWorld(K.mouse.x, K.mouse.y);
        me.a = Math.atan2(w.y - me.y, w.x - me.x);
      }
      while (K.actions.length) attack(K.actions.shift());
    }
    // tell everyone where I am, 20 times a second
    if ((L.sendT -= dt) <= 0) {
      L.sendT = 0.05;
      C.send({ t: 'ap', x: Math.round(me.x), y: Math.round(me.y), a: +me.a.toFixed(2), r: C.clock - L.lastAtk < 0.8 ? 1 : 0 });
    }
  }

  function interp(e) {
    const b = e.buf;
    if (!b.length) return;
    const rt = C.clock - 0.11;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > rt) i--;
    const p1 = b[i], p0 = b[i - 1];
    if (!p0 || rt >= p1.t) {
      e.rx = p1.x;
      e.ry = p1.y;
      e.a = p1.a;
      return;
    }
    const k = U.clamp((rt - p0.t) / (p1.t - p0.t || 1), 0, 1);
    e.rx = p0.x + (p1.x - p0.x) * k;
    e.ry = p0.y + (p1.y - p0.y) * k;
    let da = p1.a - p0.a;
    if (da > Math.PI) da -= A.TAU;
    if (da < -Math.PI) da += A.TAU;
    e.a = p0.a + da * k;
  }

  C.update = function (dt) {
    C.clock = now();
    if (C.state !== 'play' && C.state !== 'over') return;
    K.update();
    if (C.state === 'over') K.actions.length = 0;
    updateMe(dt);
    if (C.me && !C.me.alive) K.actions.length = 0;
    for (const e of C.ents.values()) {
      if (e === C.me) {
        e.rx = e.x;
        e.ry = e.y;
      } else interp(e);
      e.flash = Math.max(0, e.flash - dt);
    }
    // shots in flight
    for (let i = C.proj.length - 1; i >= 0; i--) {
      const p = C.proj[i];
      const r = A.stepProjectile(C.map, p, dt, p.mine ? myShotHits : null);
      if (r === 'boom') {
        if (p.mine) myBoom(p);
        fx('boom', p.tx, p.ty, { color: p.color, r: p.rad });
        Au.play('explosion', { x: p.tx, y: p.ty });
        C.proj.splice(i, 1);
      } else if (!r) {
        if (p.mine && p.wallX !== undefined) {
          const bx = boxAt(p.wallX + Math.cos(p.a) * 6, p.wallY + Math.sin(p.a) * 6);
          if (bx) report('b' + bx.id, p.dmg, p.s);
        }
        if (p.wallX !== undefined) fx('spark', p.wallX, p.wallY, { color: p.color });
        C.proj.splice(i, 1);
      }
    }
    for (let i = C.fx.length - 1; i >= 0; i--) if ((C.fx[i].t += dt) >= C.fx[i].life + (C.fx[i].delay || 0)) C.fx.splice(i, 1);
    C.hurtFlash = Math.max(0, (C.hurtFlash || 0) - dt);

    // camera: me, or (when out in the 10-player mode) whoever is still fighting
    let focus = C.me && C.me.alive ? C.me : null;
    if (!focus) {
      focus = C.ents.get(L.spectate);
      if (!focus || !focus.alive) {
        focus = [...C.ents.values()].find((e) => e.alive) || C.me;
        if (focus) L.spectate = focus.id;
      }
    }
    if (focus) {
      const fx_ = focus === C.me ? focus.x : focus.rx, fy = focus === C.me ? focus.y : focus.ry;
      const k = 1 - Math.exp(-dt * 10);
      C.cam.x += (fx_ - C.cam.x) * k;
      C.cam.y += (fy - C.cam.y) * k;
    }
    Au.listener.x = C.cam.x;
    Au.listener.y = C.cam.y;
  };

  /* ------------------------------------------------------------------ */
  /* online rooms (the same server and protocol as zombie co-op)         */
  /* ------------------------------------------------------------------ */
  C.connect = function (then, onFail) {
    if (C.ws && C.ws.readyState === 1) return then();
    let ws;
    try {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    } catch (e) {
      return onFail && onFail();
    }
    C.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      then();
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      C.onMsg(m);
    };
    ws.onclose = () => {
      if (C.ws === ws) C.ws = null;
      if (C.onClosed) C.onClosed(opened);
    };
    ws.onerror = () => {};
  };
  C.disconnect = function () {
    const ws = C.ws;
    C.ws = null;
    if (ws)
      try {
        ws.close();
      } catch (e) {
        /* already closed */
      }
  };
  // keep the connection alive through phone proxies
  setInterval(() => {
    if (C.ws && C.ws.readyState === 1) C.ws.send('{"t":"ping"}');
  }, 20000);

  /* ------------------------------------------------------------------ */
  /* the frame loop                                                      */
  /* ------------------------------------------------------------------ */
  let last = 0, capT = 0, cap = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    // frame cap (phones / battery saver): skip this refresh if the last drawn frame is too recent
    if (t - capT > 1000) {
      capT = t; // re-read the setting once a second, not every frame (it touches localStorage)
      cap = GW.ADraw.fpsCap();
    }
    if (cap && last && t - last < 1000 / cap - 3) return;
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    try {
      if (C.local) C.local.tick();
      C.update(dt);
      GW.ADraw.draw(dt);
      if (C.onFrame) C.onFrame();
    } catch (e) {
      console.error(e);
    }
  }
  C.run = function () {
    C.ready = true;
    requestAnimationFrame(frame);
  };
})();
