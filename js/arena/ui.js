/* GRAVEWAVE ARENA — menus: mode, character, play with bots or an online room; the match HUD and results */
(function () {
  'use strict';
  const GW = window.GW, A = GW.Arena, C = GW.AC, K = GW.AControls, D = GW.ADraw, Au = GW.Audio;
  const $ = (id) => document.getElementById(id);
  const T = (s) => (GW.L ? GW.L.t(s) : s);
  const store = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) {
      /* storage unavailable */
    }
    return null;
  };

  let mode = store('gravewave.arena.mode') === 'ffa' ? 'ffa' : 'team';
  let char = A.CHARS[store('gravewave.arena.char')] ? store('gravewave.arena.char') : 'guard';
  const room = { in: false, leader: 0, players: [], picks: {} };

  const MODE_NOTE = {
    team: '3 against 3 · first team to 15 knockouts wins · bots fill empty places',
    ffa: '10 players · last one standing wins · break boxes for power cubes · the gas closes in',
  };

  /* ---------------- menu ---------------- */
  function renderModes() {
    document.querySelectorAll('.a-mode').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('a-mode-note').textContent = MODE_NOTE[mode];
  }
  function renderChars() {
    const box = $('a-chars');
    if (!box.children.length) {
      for (const id of A.CHAR_IDS) {
        const ch = A.CHARS[id];
        const card = document.createElement('div');
        card.className = 'a-char';
        card.dataset.c = id;
        card.style.setProperty('--c', ch.color);
        const cv = document.createElement('canvas');
        cv.width = cv.height = 128;
        D.portrait(cv, id);
        const b = document.createElement('b');
        b.textContent = ch.name;
        b.style.color = ch.color;
        const s = document.createElement('span');
        s.textContent = ch.role;
        card.append(cv, b, s);
        card.addEventListener('click', () => {
          char = id;
          store('gravewave.arena.char', id);
          renderChars();
          if (room.in) sendPick();
          Au.init();
          Au.play('ui');
        });
        box.appendChild(card);
      }
    }
    for (const card of box.children) card.classList.toggle('on', card.dataset.c === char);
    const ch = A.CHARS[char];
    $('a-char-info').textContent = '';
    for (const t of [ch.name, ' · ', ch.role, ' · ', 'HEALTH', ' ' + ch.hp, ' · ', 'SUPER: ', SUPER_NAME[char]]) {
      const sp = document.createElement('span');
      sp.textContent = t;
      $('a-char-info').appendChild(sp);
    }
  }
  const SUPER_NAME = { guard: 'Ram charge', sniper: 'Piercing laser', engineer: 'Turret', medic: 'Healing zone', bomber: 'Mega bomb', ninja: 'Shadow leap' };

  function showMenu() {
    C.state = 'menu';
    $('a-menu').classList.remove('hidden');
    $('a-hud').classList.add('hidden');
    $('a-over').classList.add('hidden');
    renderRoom();
  }

  /* ---------------- online room ---------------- */
  function roomMsg(t) {
    $('a-room-msg').textContent = t || '';
  }
  function sendPick() {
    C.ws && C.ws.readyState === 1 && C.ws.send(JSON.stringify({ t: 'pick', c: char }));
    room.picks[C.myId] = char;
    renderRoom();
  }
  function sendMode() {
    if (room.leader === C.myId) C.ws && C.ws.readyState === 1 && C.ws.send(JSON.stringify({ t: 'mode', m: mode }));
  }
  function renderRoom() {
    $('a-room-pick').classList.toggle('hidden', room.in);
    $('a-room-in').classList.toggle('hidden', !room.in);
    $('a-play-row').classList.toggle('hidden', room.in);
    if (!room.in) return;
    const list = $('a-room-players');
    list.textContent = '';
    for (const id of room.players) {
      const c = room.picks[id];
      const el = document.createElement('div');
      el.className = 'a-pl' + (id === C.myId ? ' me' : '');
      if (c) el.style.setProperty('--c', A.CHARS[c].color);
      const nm = document.createElement('span');
      nm.textContent = 'P' + id + (id === C.myId ? ' (YOU)' : '') + (id === room.leader ? ' ★' : '') + ' · ';
      const cn = document.createElement('span');
      cn.textContent = c ? A.CHARS[c].name : '…';
      el.append(nm, cn);
      list.appendChild(el);
    }
    const lead = room.leader === C.myId;
    $('a-start').classList.toggle('hidden', !lead);
    const tooMany = mode === 'team' && room.players.length > 6;
    $('a-start').disabled = tooMany;
    $('a-room-wait').textContent = tooMany ? 'Too many players for 3 v 3 (6 at most): pick 10 · everyone' : lead ? (room.players.length < 2 ? 'Tell your friends this code · bots fill the rest' : 'Ready when you are') : 'Waiting for the leader to start…';
  }

  C.onLobby = function (m) {
    switch (m.t) {
      case 'created':
      case 'joined':
        room.in = true;
        C.myId = m.id;
        room.leader = m.leader;
        room.players = (m.players || []).concat([m.id]).sort((a, b) => a - b);
        room.picks = {};
        $('a-room-code').textContent = m.code;
        roomMsg('');
        sendPick();
        sendMode();
        renderRoom();
        return;
      case 'peer+':
        if (room.players.indexOf(m.id) < 0) room.players.push(m.id);
        room.players.sort((a, b) => a - b);
        sendPick(); // so the newcomer knows what everyone picked
        sendMode();
        renderRoom();
        return;
      case 'peer-':
        room.players = room.players.filter((id) => id !== m.id);
        delete room.picks[m.id];
        renderRoom();
        return;
      case 'leader':
        room.leader = m.id;
        renderRoom();
        return;
      case 'pick':
        if (A.CHARS[m.c]) room.picks[m.from] = m.c;
        renderRoom();
        return;
      case 'mode':
        if (m.from === room.leader && (m.m === 'team' || m.m === 'ffa')) {
          mode = m.m;
          renderModes();
          renderRoom();
        }
        return;
      case 'err':
        roomMsg(m.msg);
        return;
    }
  };
  C.onClosed = function (opened) {
    if (C.state === 'play') {
      $('a-msg').textContent = T('Connection lost');
      $('a-msg').classList.remove('hidden');
    }
    room.in = false;
    roomMsg(opened ? 'Connection lost' : 'Could not connect to the game server');
    renderRoom();
  };

  /* ---------------- match HUD ---------------- */
  C.onBegin = function () {
    $('a-menu').classList.add('hidden');
    $('a-over').classList.add('hidden');
    $('a-hud').classList.remove('hidden');
    $('a-msg').classList.add('hidden');
    $('a-feed').textContent = '';
    lastTop = '';
  };
  let lastTop = '', lastMsg = '';
  C.onFrame = function () {
    if (C.state !== 'play' && C.state !== 'over') return;
    let html;
    if (C.ffa) {
      const alive = [...C.ents.values()].filter((e) => e.alive).length;
      html = '<span class="small">' + T('PLAYERS LEFT') + '</span> <span>' + alive + '</span>' + (C.me && C.me.cubes ? ' <span class="small" style="color:#3dff8b">■ ' + C.me.cubes + '</span>' : '');
    } else {
      const my = C.me ? C.me.tm : 0;
      const t = C.timeLeft, mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
      html = '<span class="blue">' + C.score[my] + '</span><span class="time">' + mm + ':' + ss + '</span><span class="red">' + C.score[1 - my] + '</span>';
    }
    if (html !== lastTop) {
      lastTop = html;
      $('a-top').innerHTML = html;
    }
    let msg = '';
    if (C.state === 'play' && C.me && !C.me.alive) msg = C.ffa ? T('KNOCKED OUT') + ' · #' + (C.L.rank || '?') + ' · ' + T('watching') : T('RESPAWNING…');
    if (msg !== lastMsg) {
      lastMsg = msg;
      $('a-msg').textContent = msg;
      $('a-msg').classList.toggle('hidden', !msg);
    }
  };
  C.onFeed = function () {
    const box = $('a-feed');
    box.textContent = '';
    for (const f of C.feed) {
      const row = document.createElement('div');
      const k = document.createElement('span');
      const by = C.ents.get(f.by), v = C.ents.get(f.v);
      const col = (e) => (!e ? '#fff' : e === C.me ? '#3dff8b' : C.me && e.tm === C.me.tm ? '#19f0ff' : '#ff3b4e');
      k.textContent = f.by ? C.nameOf(f.by) : T('GAS');
      k.style.color = col(by);
      const x = document.createElement('span');
      x.textContent = '  ✕  ';
      const vv = document.createElement('span');
      vv.textContent = C.nameOf(f.v);
      vv.style.color = col(v);
      row.append(k, x, vv);
      box.appendChild(row);
    }
  };
  C.onEnd = function (m) {
    const won = C.won(m);
    let title, color;
    if (C.ffa) {
      const mine = m.ranks.find((r) => r[0] === C.myId);
      title = won ? T('WINNER!') : '#' + (mine ? mine[1] : '?');
      color = won ? '#ffe14d' : '#ff4fd8';
    } else if (m.win === -1) {
      title = T('DRAW');
      color = '#cdb8ea';
    } else {
      title = won ? T('VICTORY') : T('DEFEAT');
      color = won ? '#3dff8b' : '#ff3b4e';
    }
    $('a-over-title').textContent = title;
    $('a-over-title').style.color = color;
    const my = C.me ? C.me.tm : 0;
    $('a-over-sub').textContent = C.ffa ? (m.win > 0 ? T('Last one standing: ') + C.nameOf(m.win) : '') : m.sc[my] + ' — ' + m.sc[1 - my];
    const list = $('a-over-list');
    list.textContent = '';
    const rows = m.ranks.slice().sort((a, b) => a[1] - b[1] || b[2] - a[2]);
    for (const [id, place, kills] of rows) {
      const e = C.ents.get(id);
      for (const t of [C.ffa ? '#' + place : e && C.me && e.tm === C.me.tm ? '●' : '○', C.nameOf(id) + (e ? ' · ' + T(A.CHARS[e.c].name) : ''), kills + ' ' + T('KO')]) {
        const s = document.createElement('span');
        s.textContent = t;
        if (id === C.myId) s.className = 'me';
        list.appendChild(s);
      }
    }
    $('a-again').textContent = C.local ? 'PLAY AGAIN' : 'BACK TO ROOM';
    setTimeout(() => $('a-over').classList.remove('hidden'), 900);
  };

  function leaveMatch() {
    C.stopLocal();
    if (C.state === 'play' && C.ws) {
      // leaving an online match drops the connection: a bot takes over
      C.disconnect();
      room.in = false;
    }
    showMenu();
  }

  /* ---------------- wiring ---------------- */
  function init() {
    D.init($('view'));
    K.onResize = D.resize; // (set first: K.init may turn the game sideways right away)
    K.init($('view'), () => C.state === 'play' && C.me && C.me.alive);
    D.resize();
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, () => Au.init(), { passive: true, capture: true });

    document.querySelectorAll('.a-mode').forEach((b) =>
      b.addEventListener('click', () => {
        if (room.in && room.leader !== C.myId) return; // the room's leader picks the mode
        mode = b.dataset.mode;
        store('gravewave.arena.mode', mode);
        renderModes();
        sendMode();
        renderRoom();
      })
    );
    $('a-solo').addEventListener('click', () => C.startSolo(mode, char));
    $('a-online').addEventListener('click', () => {
      $('a-room').classList.toggle('hidden');
      roomMsg('');
    });
    $('a-create').addEventListener('click', () => {
      roomMsg('Connecting…');
      C.connect(() => C.ws.send(JSON.stringify({ t: 'create', game: 'arena' })), () => roomMsg('Could not connect to the game server'));
    });
    const join = () => {
      const code = $('a-code').value.toUpperCase().replace(/[^A-Z]/g, '');
      if (code.length !== 4) return roomMsg('Enter the 4-letter code');
      $('a-code').blur();
      roomMsg('Connecting…');
      C.connect(() => C.ws.send(JSON.stringify({ t: 'join', code, game: 'arena' })), () => roomMsg('Could not connect to the game server'));
    };
    $('a-join').addEventListener('click', join);
    $('a-code').addEventListener('keydown', (e) => e.key === 'Enter' && join());
    $('a-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)));
    $('a-start').addEventListener('click', () => {
      if (room.leader !== C.myId || !C.ws) return;
      C.ws.send(JSON.stringify({ t: 'start', mode, picks: room.picks }));
    });
    $('a-room-leave').addEventListener('click', () => {
      C.disconnect();
      room.in = false;
      renderRoom();
    });
    $('a-leave').addEventListener('click', leaveMatch);
    $('a-again').addEventListener('click', () => {
      $('a-over').classList.add('hidden');
      if (C.local) C.startSolo(mode, char);
      else showMenu();
    });
    $('a-menu-btn').addEventListener('click', () => {
      C.stopLocal();
      C.disconnect();
      room.in = false;
      showMenu();
    });
    // a room link: arena.html?room=ABCD
    const q = new URLSearchParams(location.search).get('room');
    if (q) {
      $('a-room').classList.remove('hidden');
      $('a-code').value = q.toUpperCase().slice(0, 4);
    }
    renderModes();
    renderChars();
    showMenu();
    C.run();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
