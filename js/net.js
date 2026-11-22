/*
 * GRAVEWAVE — co-op for up to 4 players.
 *
 * The host's browser runs the real game: rounds, spawns and every zombie. Each player moves and
 * shoots their own character locally (so controls stay instant) and sends:
 *   - their position / aim / weapon 20 times a second ('p', to everyone),
 *   - the damage their bullets did ('hit', to the host, which applies it and pays out kills).
 * The host sends a snapshot of the horde 15 times a second ('s'), and world changes (doors,
 * power, fuses, power-ups, traps) are announced by whoever caused them.
 */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio;
  const $ = (id) => document.getElementById(id);

  const N = (GW.Net = {
    active: false, // a co-op game is running
    isHost: false,
    isGuest: false,
    myId: 0,
    code: '',
    lobby: [], // player ids in the room
    remotes: new Map(), // id -> remote player
    applying: false, // true while applying a change that came from the network (don't echo it)
    ws: null,
    ping: 0,
  });

  const COLORS = { 1: '#23aebf', 2: '#ff4fd8', 3: '#ffb629', 4: '#3dff8b' };
  N.color = (id) => COLORS[id] || '#c8c8d8';
  N.label = (id) => 'P' + id;

  const TYPES = ['walker', 'brute', 'helmet', 'spitter', 'bloater', 'leaper', 'shrieker', 'boss'];
  const STATES = ['rise', 'breach', 'chase', 'attack', 'spit', 'crouch', 'leap', 'swell'];
  const SPEEDS = ['walk', 'run', 'sprint'];
  const F_CRIT = 1, F_MELEE = 2, F_EXPL = 4, F_SHOCK = 8, F_BURN = 16, F_COLD = 32, F_ALLY = 64, F_NUKE = 128;

  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  /** Small fast seeded PRNG so every player builds the same park (fuse spots, crate spot). */
  N.seeded = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------------------------------------------ */
  /* connection                                                         */
  /* ------------------------------------------------------------------ */
  function wsUrl() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  function send(obj) {
    if (N.ws && N.ws.readyState === 1) N.ws.send(JSON.stringify(obj));
  }
  N.send = send;

  /** Tell everyone else about a change this player made (ignored while applying a remote change). */
  N.emit = function (t, data) {
    if (!N.active || N.applying) return;
    send(Object.assign({ t }, data));
  };

  /** Run fn as a change that came from the network, so the hooks don't send it back out. */
  function applying(fn) {
    N.applying = true;
    try {
      fn();
    } finally {
      N.applying = false;
    }
  }

  function connect(then) {
    if (N.ws && N.ws.readyState === 1) return then();
    if (N.ws) closeSocket();
    lobbyMsg('Connecting…');
    let ws;
    try {
      ws = new WebSocket(wsUrl());
    } catch (e) {
      return lobbyMsg('Could not connect to the game server');
    }
    N.ws = ws;
    ws.onopen = () => {
      lobbyMsg('');
      then();
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      try {
        onMsg(m);
      } catch (err) {
        console.error('[net]', err);
      }
    };
    ws.onclose = () => {
      if (N.ws === ws) onClosed();
    };
    ws.onerror = () => {};
  }

  function closeSocket() {
    const ws = N.ws;
    N.ws = null;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch (e) {
        /* ignore */
      }
    }
  }

  function onClosed() {
    N.ws = null;
    const wasActive = N.active;
    resetSession();
    if (wasActive) {
      backToMenu();
      openLobby();
      lobbyMsg('Connection lost — the game ended');
    } else if (!$('lobby').classList.contains('hidden')) {
      showPick();
      lobbyMsg('Connection lost');
    }
  }

  function resetSession() {
    N.active = N.isHost = N.isGuest = false;
    N.myId = 0;
    N.code = '';
    N.lobby = [];
    N.remotes.clear();
    hits.length = 0;
    ghosts.clear();
  }

  setInterval(() => send({ t: 'ping', c: performance.now() }), 10000);

  /* ------------------------------------------------------------------ */
  /* lobby UI                                                           */
  /* ------------------------------------------------------------------ */
  function lobbyMsg(text) {
    const el = $('lobby-msg');
    if (el) el.textContent = text || '';
  }
  function showPick() {
    $('lobby-pick').classList.remove('hidden');
    $('lobby-room').classList.add('hidden');
  }
  function renderRoom() {
    $('lobby-pick').classList.add('hidden');
    $('lobby-room').classList.remove('hidden');
    $('room-code').textContent = N.code;
    $('room-players').innerHTML = N.lobby
      .map((id) => '<span style="color:' + N.color(id) + ';border-color:' + N.color(id) + '">' + N.label(id) + (id === N.myId ? ' (YOU)' : id === 1 ? ' HOST' : '') + '</span>')
      .join('');
    $('btn-coop-start').classList.toggle('hidden', !N.isHost);
    $('room-wait').classList.toggle('hidden', N.isHost);
    $('room-wait').textContent = N.isHost ? '' : 'Waiting for the host to start… · بانتظار المضيف';
    $('room-hint').textContent = N.isHost ? (N.lobby.length < 2 ? 'Tell your friends this code · أعط أصحابك الكود' : 'Ready when you are · جاهزين') : '';
  }
  function openLobby() {
    $('menu').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    if (N.code) renderRoom();
    else showPick();
  }
  function closeLobby() {
    $('lobby').classList.add('hidden');
    $('menu').classList.remove('hidden');
  }

  function initUi() {
    $('btn-coop').addEventListener('click', () => {
      A.init();
      openLobby();
      lobbyMsg('');
      const q = new URLSearchParams(location.search).get('room');
      if (q && !N.code) $('join-code').value = q.toUpperCase().slice(0, 4);
    });
    $('btn-host').addEventListener('click', () => connect(() => send({ t: 'create' })));
    const join = () => {
      const code = $('join-code').value.toUpperCase().replace(/[^A-Z]/g, '');
      if (code.length !== 4) return lobbyMsg('Enter the 4-letter code · اكتب الكود (4 حروف)');
      $('join-code').blur();
      connect(() => send({ t: 'join', code }));
    };
    $('btn-join').addEventListener('click', join);
    $('join-code').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') join();
    });
    $('join-code').addEventListener('keyup', (e) => e.stopPropagation());
    $('join-code').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    });
    $('btn-lobby-back').addEventListener('click', () => {
      closeSocket();
      resetSession();
      closeLobby();
    });
    $('btn-coop-start').addEventListener('click', () => {
      if (!N.isHost) return;
      const seed = 1 + Math.floor(Math.random() * 2147483000);
      send({ t: 'start', seed, players: N.lobby });
      startGame(seed);
    });
    // a link like https://game…/?room=ABCD opens straight into the join screen
    const q = new URLSearchParams(location.search).get('room');
    if (q) {
      openLobby();
      $('join-code').value = q.toUpperCase().slice(0, 4);
    }
  }

  /* ------------------------------------------------------------------ */
  /* messages                                                           */
  /* ------------------------------------------------------------------ */
  function onMsg(m) {
    switch (m.t) {
      case 'pong':
        if (m.c) N.ping = Math.round(performance.now() - m.c);
        return;
      case 'created':
        N.code = m.code;
        N.myId = m.id;
        N.isHost = true;
        N.isGuest = false;
        N.lobby = [m.id];
        renderRoom();
        return;
      case 'joined':
        N.code = m.code;
        N.myId = m.id;
        N.isHost = false;
        N.isGuest = true;
        N.lobby = m.players.concat([m.id]).sort();
        renderRoom();
        return;
      case 'err':
        lobbyMsg(m.msg);
        return;
      case 'peer+':
        if (N.lobby.indexOf(m.id) < 0) N.lobby.push(m.id);
        N.lobby.sort();
        if (!N.active) renderRoom();
        return;
      case 'peer-': {
        N.lobby = N.lobby.filter((id) => id !== m.id);
        const had = N.remotes.delete(m.id);
        if (N.active && had) GW.Game.announce(N.label(m.id) + ' LEFT', '', N.color(m.id));
        else if (!N.active) renderRoom();
        return;
      }
      case 'hostleft':
        resetSession();
        closeSocket();
        backToMenu();
        openLobby();
        lobbyMsg('The host left the game · المضيف طلع');
        return;
      case 'start':
        if (N.isGuest) startGame(m.seed, m.players);
        return;
      case 'lobby':
        if (N.isGuest) {
          N.active = false;
          backToMenu();
          openLobby();
        }
        return;
    }
    if (!N.active) return;
    const from = m.from;
    switch (m.t) {
      case 'p':
        onPlayer(from, m);
        break;
      case 's':
        if (N.isGuest && from === 1) onSnapshot(m);
        break;
      case 'hit':
        if (N.isHost) onHits(from, m);
        break;
      case 'dmg':
        GW.Player.hurt(m.n, !!m.m);
        if (m.m) A.play('bite', { x: GW.Player.x, y: GW.Player.y });
        break;
      case 'pts': {
        const P = GW.Player;
        GW.Game.addPoints(m.n, m.x, m.y, { crit: !!m.c });
        P.stats.kills++;
        if (m.c) P.stats.crits++;
        break;
      }
      case 'over':
        if (N.isGuest) {
          GW.Director.round = m.r || GW.Director.round;
          GW.Game.gameOver();
        }
        break;
      case 'door': {
        const d = M.doors[m.i];
        if (d && !d.open) {
          applying(() => M.openDoor(d));
          A.play('door');
          for (const [tx, ty] of d.tiles) FX.burst((tx + 0.5) * C.TILE, (ty + 0.5) * C.TILE, 10, M.zones[d.b].color, 260);
        }
        break;
      }
      case 'pow':
        applying(() => GW.Interact.powerZone(m.z));
        break;
      case 'fuse': {
        const f = GW.Interact.fuses[m.i];
        if (f && !f.taken) {
          f.taken = true;
          FX.burst(f.x, f.y, 14, '#ffe14d', 220);
        }
        break;
      }
      case 'fuse+':
        applying(() => GW.Interact.dropFuse(m.x, m.y));
        break;
      case 'pu+':
        applying(() => GW.Interact.spawnPowerup(m.k, m.x, m.y, m.id));
        break;
      case 'pu-':
        applying(() => GW.Interact.takePowerup(m.id, from));
        break;
      case 'box':
        GW.Interact.boxMovedTo(m.s);
        break;
      case 'plank':
        if (N.isHost) {
          const w = M.windows[m.i];
          if (w && w.planks < 6) w.planks++;
        }
        break;
      case 'trap':
        applying(() => GW.Facilities.activateTrapAt(m.i));
        break;
      case 'seal':
        applying(() => GW.Facilities.sealRemote());
        break;
      case 'gad':
        applying(() => GW.Gadgets.land({ kind: m.k, x: m.x, y: m.y, remote: true }));
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* game session                                                       */
  /* ------------------------------------------------------------------ */
  function startGame(seed, players) {
    if (players && players.length) N.lobby = players.slice().sort();
    N.active = true;
    $('lobby').classList.add('hidden');
    GW.Game.newGame(seed);
  }

  /** Called by Game.newGame once the world is reset for a co-op game. */
  N.onNewGame = function () {
    const P = GW.Player;
    N.remotes.clear();
    hits.length = 0;
    ghosts.clear();
    kills.length = 0;
    snapT = sendT = 0;
    lastRound = 0;
    for (const id of N.lobby) if (id !== N.myId) N.remotes.set(id, makeRemote(id));
    P.jacket = N.color(N.myId);
    const off = [[0, 0], [0, 0], [44, 0], [-44, 0], [0, 44]][N.myId] || [0, 0];
    P.x += off[0];
    P.y += off[1];
    M.resolveCircle(P, P.r, M.solidForPlayer);
    GW.Render.snap();
    GW.Game.announce('CO-OP · ' + N.code, 'You are ' + N.label(N.myId) + ' — stick together', N.color(N.myId));
    sendState(true);
  };

  /** Leave the co-op game entirely (pause menu). */
  N.leave = function () {
    closeSocket();
    resetSession();
    backToMenu();
  };

  /** After a game over: everyone goes back to the room; the host can start the next game. */
  N.again = function () {
    if (!N.ws) return N.leave();
    N.active = false;
    if (N.isHost) send({ t: 'lobby' });
    backToMenu();
    openLobby();
  };

  /** Solo game started from the title screen while still in a room: drop the room. */
  N.endSession = function () {
    closeSocket();
    resetSession();
  };

  function backToMenu() {
    const G = GW.Game;
    G.state = 'menu';
    G.netPaused = false;
    for (const id of ['pause', 'gameover', 'lobby']) $(id).classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('announce').classList.remove('show');
    GW.HUD.show(false);
    $('game').classList.remove('playing');
    A.setHorde(0);
    A.setPower(false);
    GW.Player.alive = false;
    GW.Zombies.list.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* players                                                            */
  /* ------------------------------------------------------------------ */
  const weaponCache = {};
  function weaponFor(id, tier) {
    const k = id + ':' + tier;
    if (!weaponCache[k]) {
      if (!GW.WEAPONS[id]) return null;
      const w = GW.Weapons.create(id);
      for (let i = 0; i < tier; i++) GW.Weapons.upgrade(w);
      weaponCache[k] = w;
    }
    return weaponCache[k];
  }

  function makeRemote(id) {
    const rp = {
      id, remote: true, name: N.label(id), jacket: N.color(id),
      x: M.spawn.x, y: M.spawn.y, tx: M.spawn.x, ty: M.spawn.y, ta: 0, angle: -Math.PI / 2,
      vx: 0, vy: 0, r: C.PLAYER.radius, alive: true, hp: 100, maxHp: 100,
      moving: false, walkT: 0, recoil: 0, meleeT: 0, invuln: 0, muzzleT: 0,
      wid: 'stinger', tier: 0, w: weaponFor('stinger', 0), shots: -1, seen: 0, pts: 0,
      perks: {}, stats: {},
      weapon() {
        return this.w;
      },
      /** A zombie on the host hit this player: tell their browser. */
      hurt(amount, melee) {
        if (!this.alive || this.invuln > 0) return;
        send({ t: 'dmg', to: this.id, n: r1(amount), m: melee ? 1 : 0 });
      },
    };
    return rp;
  }

  /** Everyone who can be targeted (host side): the local player plus the remotes. */
  N.players = function () {
    const out = [GW.Player];
    for (const rp of N.remotes.values()) out.push(rp);
    return out;
  };

  /** A living player to bias spawns toward (host side): changes every call so all players get company. */
  N.focus = function () {
    const alive = N.players().filter((p) => p.alive);
    return alive.length ? U.pick(alive) : GW.Player;
  };

  /** Nearest living player for a zombie, with a little stickiness so it doesn't flip-flop. */
  N.targetFor = function (z, players) {
    let best = null, bd = Infinity;
    for (const p of players) {
      if (!p.alive) continue;
      let d = Math.hypot(p.x - z.x, p.y - z.y);
      if (p === z.tgtRef) d *= 0.75;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    z.tgtRef = best || GW.Player;
    return z.tgtRef;
  };

  function sendState(force) {
    const P = GW.Player, w = P.weapon();
    send({
      t: 'p',
      x: Math.round(P.x), y: Math.round(P.y), a: r2(P.angle),
      vx: Math.round(P.vx || 0), vy: Math.round(P.vy || 0),
      w: w ? w.id : '', tr: w ? w.tier || 0 : 0,
      al: P.alive ? 1 : 0, hp: Math.round(P.hp), mh: P.maxHp,
      mv: P.moving ? 1 : 0, sh: P.stats.shots || 0, ml: P.meleeT > 0 ? 1 : 0, iv: P.invuln > 0 ? 1 : 0,
      pt: P.points, f: force ? 1 : 0,
    });
  }

  function onPlayer(id, m) {
    let rp = N.remotes.get(id);
    if (!rp) {
      if (N.lobby.indexOf(id) < 0) return;
      rp = makeRemote(id);
      N.remotes.set(id, rp);
    }
    const wasAlive = rp.alive;
    rp.tx = m.x;
    rp.ty = m.y;
    rp.ta = m.a;
    rp.vx = m.vx;
    rp.vy = m.vy;
    if (Math.hypot(rp.x - m.x, rp.y - m.y) > 160 || m.f) {
      rp.x = rp.px = m.x;
      rp.y = rp.py = m.y;
      rp.angle = m.a;
    }
    rp.alive = !!m.al;
    rp.hp = m.hp;
    rp.maxHp = m.mh;
    rp.moving = !!m.mv;
    rp.invuln = m.iv ? 0.2 : 0;
    rp.pts = m.pt;
    if (m.ml) rp.meleeT = 0.2;
    if (m.w && (m.w !== rp.wid || m.tr !== rp.tier)) {
      rp.wid = m.w;
      rp.tier = m.tr;
      rp.w = weaponFor(m.w, m.tr) || rp.w;
    }
    if (rp.shots >= 0 && m.sh > rp.shots) remoteShots(rp, Math.min(4, m.sh - rp.shots));
    rp.shots = m.sh;
    rp.seen = 0;
    if (wasAlive && !rp.alive) {
      FX.burst(rp.x, rp.y, 30, rp.jacket, 300);
      GW.Game.announce(rp.name + ' IS DOWN', 'Survive the round to bring them back', rp.jacket);
    }
  }

  /** Draw a teammate's shots: tracers to the first wall, the sound and the muzzle flash. */
  function remoteShots(rp, n) {
    const w = rp.w;
    if (!w) return;
    const s = w.s;
    const a = rp.ta;
    const ca = Math.cos(a), sa = Math.sin(a);
    const mx = rp.tx + ca * (rp.r + s.len), my = rp.ty + sa * (rp.r + s.len);
    for (let k = 0; k < n; k++) {
      const pellets = Math.min(s.pellets || 1, 4);
      for (let i = 0; i < pellets; i++) {
        const ang = a + U.rand(-s.spread, s.spread);
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const d = M.raycast(rp.tx, rp.ty, dx, dy, Math.min(s.range, 900), M.blocksBullet);
        const col = w.up || s.cls === 'energy' ? s.color : '#ffe7a3';
        FX.tracer(mx, my, rp.tx + dx * d, rp.ty + dy * d, col, w.up ? 2.4 : 1.4, 0.08, !!w.up);
      }
    }
    FX.light(mx, my, 150, w.up || s.cls === 'energy' ? s.color : '#ffd68a', 0.07);
    rp.recoil = 1;
    A.play(s.type === 'arc' ? 'arc' : 'shot', { cls: s.cls, up: w.up, x: rp.tx, y: rp.ty });
  }

  function updateRemotes(dt) {
    const k = 1 - Math.exp(-dt * 16);
    for (const rp of N.remotes.values()) {
      rp.seen += dt;
      // extrapolate a little along the last known velocity, then ease toward it
      const ex = rp.tx + U.clamp(rp.vx, -400, 400) * Math.min(rp.seen, 0.1);
      const ey = rp.ty + U.clamp(rp.vy, -400, 400) * Math.min(rp.seen, 0.1);
      rp.x += (ex - rp.x) * k;
      rp.y += (ey - rp.y) * k;
      rp.angle += U.angDiff(rp.angle, rp.ta) * k;
      if (rp.moving) rp.walkT += dt * 10;
      rp.recoil = Math.max(0, rp.recoil - dt * 9);
      if (rp.meleeT > 0) rp.meleeT -= dt;
      if (rp.invuln > 0) rp.invuln -= dt;
    }
  }

  /** Local player went down in co-op: spectate until the next round instead of ending the game. */
  N.localDown = function () {
    const P = GW.Player;
    FX.burst(P.x, P.y, 34, P.jacket || '#23aebf', 320);
    FX.flash = 0.4;
    A.play('gameOver');
    GW.Game.announce("YOU'RE DOWN", 'Back next round if your team survives · ترجع الجولة الجاية', '#ff3b4e');
    sendState(true);
  };

  /** New round: anyone who went down comes back next to a living teammate. */
  N.onRoundStart = function () {
    const P = GW.Player;
    if (P.alive || GW.Game.state !== 'playing') return;
    let near = null;
    for (const rp of N.remotes.values()) if (rp.alive) near = rp;
    const pt = near ? M.randomFloorNear(near.x, near.y, 30, 90) : null;
    P.x = pt ? pt.x : near ? near.x : M.spawn.x;
    P.y = pt ? pt.y : near ? near.y : M.spawn.y;
    M.resolveCircle(P, P.r, M.solidForPlayer);
    P.clearPerks();
    P.hp = P.maxHp;
    P.alive = true;
    P.invuln = 3;
    P.sinceHurt = 99;
    P.vx = P.vy = 0;
    GW.Render.snap();
    FX.ring(P.x, P.y, 90, P.jacket, 0.5, 4);
    GW.Game.announce('BACK IN THE FIGHT', 'Your perks were lost', P.jacket);
    sendState(true);
  };

  /* ------------------------------------------------------------------ */
  /* guest: damage goes to the host                                     */
  /* ------------------------------------------------------------------ */
  const hits = []; // [zombie id, damage, flags, dir, critMult]
  const hitIds = new Set();
  const ghosts = new Map(); // zombies this guest thinks it killed, until the host confirms: id -> {z, t}
  let hitT = 0;

  /** Zombies.damage on a guest: show the hit now, let the host decide what really happened. */
  N.guestDamage = function (z, amount, info) {
    if (z.dead) return false;
    info = info || {};
    const dir = info.dir === undefined ? Math.random() * U.TAU : info.dir;
    z.flash = 0.1;
    if (info.trap) return false; // traps run on the host
    FX.blood(z.x, z.y, dir, info.crit ? 9 : 4, info.crit ? 320 : 220);
    A.play('hit', { x: z.x, y: z.y });
    let f = 0;
    if (info.crit) f |= F_CRIT;
    if (info.melee) f |= F_MELEE;
    if (info.explosive) f |= F_EXPL;
    if (info.shock) f |= F_SHOCK;
    if (info.burn) f |= F_BURN;
    if (info.cold) f |= F_COLD;
    if (info.ally) f |= F_ALLY;
    if (info.nuke) f |= F_NUKE;
    hits.push([z.id, r1(amount), f, r2(dir), info.crit ? r2(info.critMult || 1) : 0]);
    hitIds.add(z.id);
    // predict the kill so the zombie drops at once; the host's snapshot corrects any mistake
    let a = amount;
    if (z.type === 'boss' || (z.helmet > 0 && info.crit && !info.explosive && !info.melee)) a = 0;
    else if (GW.Game.timers.instakill > 0) a = Math.max(a, z.hp);
    z.hp -= a;
    if (a > 0 && z.hp <= 0) {
      guestRemove(z, info, true);
      return true;
    }
    return false;
  };

  /** Zombies.kill on a guest (panic room shutter, etc.): visual only, the host pays out. */
  N.guestKill = function (z, info) {
    guestRemove(z, info || {}, true);
  };

  function guestRemove(z, info, ghost) {
    if (z.dead) return;
    z.dead = true;
    const i = GW.Zombies.list.indexOf(z);
    if (i >= 0) GW.Zombies.list.splice(i, 1);
    GW.Zombies.deathFx(z, info);
    if (ghost) ghosts.set(z.id, { z, t: 0 });
  }

  function flushHits(dt) {
    hitT += dt;
    if (!hits.length || hitT < 1 / 30) return;
    hitT = 0;
    // status effects (frost, burn) were set on our copy of the zombie: pass them on too
    const st = [];
    for (const id of hitIds) {
      const z = findZ(id) || (ghosts.get(id) || {}).z;
      if (!z) continue;
      if (z.freezeT > 0 || z.slowT > 0 || z.burnT > 0 || z.dazeT > 0) st.push([id, r2(z.freezeT || 0), r2(z.slowT || 0), r2(z.burnT || 0), r1(z.burnDps || 0), r2(z.dazeT || 0)]);
    }
    send({ t: 'hit', to: 'host', h: hits.splice(0), st });
    hitIds.clear();
  }

  function findZ(id) {
    const list = GW.Zombies.list;
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* host: apply a guest's damage */
  function onHits(from, m) {
    const Zs = GW.Zombies;
    for (const s of m.st || []) {
      const z = findZ(s[0]);
      if (!z) continue;
      if (s[1] > 0) z.freezeT = Math.max(z.freezeT || 0, s[1]);
      if (s[2] > 0) z.slowT = Math.max(z.slowT || 0, s[2]);
      if (s[3] > 0) {
        if (!(z.burnT > 0)) z.burnTick = 0.25;
        z.burnT = Math.max(z.burnT || 0, s[3]);
        z.burnDps = Math.max(z.burnDps || 0, s[4]);
      }
      if (s[5] > 0) z.dazeT = Math.max(z.dazeT || 0, s[5]);
      if (z.freezeT > 0 && z.state === 'attack') z.state = 'chase';
    }
    for (const h of m.h || []) {
      const z = findZ(h[0]);
      if (!z || !(h[1] >= 0) || h[1] > 1e6) continue;
      const f = h[2] | 0;
      Zs.damage(z, h[1], {
        crit: !!(f & F_CRIT), critMult: h[4] || 1, melee: !!(f & F_MELEE), explosive: !!(f & F_EXPL),
        shock: !!(f & F_SHOCK), burn: !!(f & F_BURN), cold: !!(f & F_COLD), ally: !!(f & F_ALLY), nuke: !!(f & F_NUKE),
        dir: h[3], by: from,
      });
    }
  }

  /** Host: a guest's damage killed a zombie: the points are theirs. */
  N.creditKill = function (by, pts, z, crit) {
    send({ t: 'pts', to: by, n: pts, x: Math.round(z.x), y: Math.round(z.y - z.r - 4), c: crit ? 1 : 0 });
  };

  /* ------------------------------------------------------------------ */
  /* host: horde snapshots                                              */
  /* ------------------------------------------------------------------ */
  const kills = [];
  let snapT = 0, sendT = 0, lastRound = 0, acidT = 0, orbId = 0;
  const hitOrbs = new Set();

  N.onZombieKilled = function (z, info) {
    if (N.isHost) kills.push([z.id, r2(info.dir === undefined ? 0 : info.dir), info.crit ? 1 : 0, info.burst ? 1 : 0]);
  };

  function zrow(z) {
    return [
      z.id, TYPES.indexOf(z.type), Math.round(z.x), Math.round(z.y), r2(z.angle), Math.round(z.hp), Math.round(z.maxHp),
      STATES.indexOf(z.state), z.r, Math.round(z.helmet || 0), r1(z.freezeT || 0), r1(z.slowT || 0), r1(z.burnT || 0),
      r2(z.attackT || 0), r2(z.riseT || 0), z.skin, z.shirt, z.eye, r1(z.animRate || 6), SPEEDS.indexOf(z.speedClass), z.flash > 0 ? 1 : 0,
    ];
  }

  function sendSnapshot() {
    const D = GW.Director, Zs = GW.Zombies, B = GW.Boss;
    const msg = {
      t: 's',
      d: [D.round, D.state === 'active' ? 1 : 0, D.special ? 1 : 0, D.boss ? 1 : 0, D.toSpawn, Math.ceil(D.timer || 0)],
      z: Zs.list.map(zrow),
      w: M.windows.map((w) => w.planks),
      k: kills.splice(0),
    };
    if (Zs.acid.length) msg.a = Zs.acid.filter((g) => g.x !== undefined).map((g) => [Math.round(g.x), Math.round(g.y), Math.round(g.h || 0), Math.round(g.tx), Math.round(g.ty)]);
    if (Zs.hazards.length) msg.h = Zs.hazards.map((h) => [Math.round(h.x), Math.round(h.y), h.r, r1(h.t), h.max]);
    if (B.orbs.length) {
      for (const o of B.orbs) if (!o.id) o.id = ++orbId;
      msg.o = B.orbs.map((o) => [o.id, Math.round(o.x), Math.round(o.y)]);
    }
    if (B.ref && B.ref.boss) {
      const b = B.ref.boss;
      msg.b = { mode: b.mode, t: r2(b.t || 0), phase: b.phase, spin: r2(b.spin || 0), dirX: r2(b.dirX || 0), dirY: r2(b.dirY || 0), armorFlash: b.armorFlash > 0 ? 0.1 : 0, weakFlash: b.weakFlash > 0 ? 0.1 : 0, sx: Math.round(b.sx || 0), sy: Math.round(b.sy || 0), slamR: b.slamR || 0 };
    }
    send(msg);
  }

  /* ------------------------------------------------------------------ */
  /* guest: apply the host's snapshot                                   */
  /* ------------------------------------------------------------------ */
  function onSnapshot(m) {
    const D = GW.Director, Zs = GW.Zombies;
    // round state: replay the start / end effects when it changes
    const d = m.d;
    const active = d[1] === 1;
    if (active && d[0] !== D.round) {
      D.round = d[0];
      D.special = !!d[2];
      D.boss = !!d[3];
      D.state = 'active';
      D.beginFx(d[0]);
    } else if (!active && D.state === 'active') {
      D.state = 'intermission';
      D.endFx();
    }
    D.round = d[0];
    D.state = active ? 'active' : 'intermission';
    D.special = !!d[2];
    D.boss = !!d[3];
    D.toSpawn = d[4];
    D.timer = d[5];

    // zombies the host says died: show the death unless we already did
    const killed = new Map();
    for (const k of m.k || []) killed.set(k[0], k);

    const seen = new Set();
    for (const row of m.z) {
      const id = row[0];
      seen.add(id);
      if (killed.has(id)) continue;
      let z = findZ(id);
      if (!z) {
        const g = ghosts.get(id);
        if (g) {
          // we predicted a kill the host didn't agree with (helmet, armour…): bring it back
          if (g.t < 0.6) continue;
          ghosts.delete(id);
          z = g.z;
          z.dead = false;
          Zs.list.push(z);
        } else {
          z = newGuestZombie(row);
          Zs.list.push(z);
        }
      }
      applyRow(z, row);
    }
    for (let i = Zs.list.length - 1; i >= 0; i--) {
      const z = Zs.list[i];
      if (seen.has(z.id) && !killed.has(z.id)) continue;
      const k = killed.get(z.id);
      if (k) guestRemove(z, { dir: k[1], crit: !!k[2], burst: !!k[3] }, false);
      else Zs.list.splice(i, 1); // gone without a death (left the round)
    }
    for (const k of m.k || []) ghosts.delete(k[0]);

    // barricades
    if (m.w)
      for (let i = 0; i < m.w.length && i < M.windows.length; i++) {
        const w = M.windows[i];
        if (m.w[i] < w.planks) A.play('plank', { x: w.x, y: w.y });
        w.planks = m.w[i];
      }

    Zs.acid = (m.a || []).map((g) => ({ x: g[0], y: g[1], h: g[2], tx: g[3], ty: g[4] }));
    Zs.hazards = (m.h || []).map((h) => ({ x: h[0], y: h[1], r: h[2], t: h[3], max: h[4] }));
    GW.Boss.orbs = (m.o || []).map((o) => ({ id: o[0], x: o[1], y: o[2] }));

    let boss = null;
    for (const z of Zs.list) if (z.type === 'boss') boss = z;
    if (boss) {
      boss.boss = Object.assign(boss.boss || {}, m.b || {});
      if (!GW.Boss.ref) GW.Game.announce('THE HEADLINER', 'Hit the glowing core on its back', '#ff3b4e');
    }
    GW.Boss.ref = boss;
  }

  function newGuestZombie(row) {
    const z = {
      id: row[0], type: TYPES[row[1]] || 'walker', x: row[2], y: row[3], px: row[2], py: row[3], nx: row[2], ny: row[3],
      angle: row[4], pa: row[4], na: row[4], t: U.rand(0, 10), flash: 0, kx: 0, ky: 0, stun: 0, dead: false, groanT: U.rand(1, 6),
    };
    if (STATES[row[7]] === 'rise') {
      A.play('rise', { x: z.x, y: z.y });
      FX.burst(z.x, z.y, 8, '#5a4a3a', 120);
    }
    return z;
  }

  function applyRow(z, row) {
    z.nx = row[2];
    z.ny = row[3];
    z.na = row[4];
    z.hp = row[5];
    z.maxHp = row[6];
    const st = STATES[row[7]] || 'chase';
    if (st !== z.state) {
      if (st === 'attack') A.play('zattack', { x: z.x, y: z.y });
      else if (st === 'crouch') A.play('leapWarn', { x: z.x, y: z.y });
      else if (st === 'leap') A.play('leap', { x: z.x, y: z.y });
      else if (st === 'swell') A.play('swell', { x: z.x, y: z.y });
      else if (st === 'spit') A.play('voice', { x: z.x, y: z.y, kind: 'spitter' });
    }
    z.state = st;
    z.r = row[8];
    z.helmet = row[9];
    if (!z.helmetMax || z.helmet > z.helmetMax) z.helmetMax = z.helmet;
    z.freezeT = row[10];
    z.slowT = row[11];
    z.burnT = row[12];
    z.attackT = row[13];
    z.riseT = row[14];
    z.skin = row[15];
    z.shirt = row[16];
    z.eye = row[17];
    z.animRate = row[18];
    z.speedClass = SPEEDS[row[19]] || 'walk';
    if (row[20]) z.flash = Math.max(z.flash, 0.06);
  }

  /** Guest world step: move the zombie copies toward the host's positions, local hazards, groans. */
  N.guestWorld = function (dt) {
    const Zs = GW.Zombies, P = GW.Player;
    const k = 1 - Math.exp(-dt * 14);
    for (const z of Zs.list) {
      z.t += dt;
      if (z.flash > 0) z.flash -= dt;
      if (z.nx === undefined) continue;
      const dx = z.nx - z.x, dy = z.ny - z.y;
      if (dx * dx + dy * dy > 200 * 200) {
        z.x = z.nx;
        z.y = z.ny;
      } else {
        z.x += dx * k;
        z.y += dy * k;
      }
      z.angle += U.angDiff(z.angle, z.na) * k;
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = U.rand(3, 8);
        const kind = z.type === 'walker' ? (z.speedClass === 'walk' ? 'walker' : z.speedClass === 'run' ? 'runner' : 'sprinter') : z.type;
        A.play('voice', { x: z.x, y: z.y, kind });
      }
    }
    for (const [id, g] of ghosts) {
      g.t += dt;
      if (g.t > 3) ghosts.delete(id);
    }

    // acid puddles and boss orbs are checked against our own player here
    const S = C.ZOMBIE.spit;
    let inAcid = false;
    if (P.alive) for (const h of Zs.hazards) if (U.dist(P.x, P.y, h.x, h.y) < h.r + P.r * 0.4) inAcid = true;
    if (inAcid) {
      acidT -= dt;
      if (acidT <= 0) {
        acidT = S.puddleTick;
        P.hurt(S.puddleDmg);
        A.play('acidSizzle', { x: P.x, y: P.y });
      }
    } else acidT = 0;
    const V = GW.Boss.CFG && GW.Boss.CFG.volley;
    if (V && P.alive)
      for (const o of GW.Boss.orbs) {
        if (hitOrbs.has(o.id) || U.dist(o.x, o.y, P.x, P.y) >= V.radius + P.r) continue;
        hitOrbs.add(o.id);
        if (!GW.Gadgets.shielded(P)) P.hurt(V.dmg);
        FX.burst(o.x, o.y, 6, '#ff4fd8', 160);
      }
    if (hitOrbs.size > 200) hitOrbs.clear();
  };

  /* ------------------------------------------------------------------ */
  /* per step                                                           */
  /* ------------------------------------------------------------------ */
  N.update = function (dt) {
    updateRemotes(dt);
    sendT += dt;
    if (sendT >= 0.05) {
      sendT = 0;
      sendState(false);
    }
    if (N.isGuest) flushHits(dt);
    if (N.isHost) {
      snapT += dt;
      if (snapT >= 1 / 15) {
        snapT = 0;
        sendSnapshot();
      }
      // everyone is down: the run is over for the whole team
      if (!GW.Player.alive) {
        let anyAlive = false;
        for (const rp of N.remotes.values()) if (rp.alive) anyAlive = true;
        if (!anyAlive) {
          send({ t: 'over', r: GW.Director.round });
          GW.Game.gameOver();
        }
      }
    }
    if (lastRound !== GW.Director.round) lastRound = GW.Director.round;
    teamT -= dt;
    if (teamT <= 0) {
      teamT = 0.25;
      renderTeam();
    }
  };

  /* teammates panel */
  let teamT = 0;
  function renderTeam() {
    const el = $('mates');
    if (!el) return;
    if (!N.active) {
      el.innerHTML = '';
      return;
    }
    let html = '';
    for (const rp of N.remotes.values()) {
      const f = rp.alive ? U.clamp(rp.hp / (rp.maxHp || 100), 0, 1) : 0;
      html += '<div class="mate' + (rp.alive ? '' : ' down') + '"><b style="color:' + rp.jacket + '">' + rp.name + '</b><i><s style="width:' + Math.round(f * 100) + '%;background:' + rp.jacket + '"></s></i><span>' + (rp.alive ? rp.pts : 'DOWN') + '</span></div>';
    }
    if (!GW.Player.alive) html += '<div class="mate spec">SPECTATING — back next round</div>';
    el.innerHTML = html;
  }

  /** Camera target while the local player is down: a living teammate. */
  N.spectateTarget = function () {
    for (const rp of N.remotes.values()) if (rp.alive) return rp;
    return null;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUi);
  else initUi();
})();
