/* GRAVEWAVE — neon HUD: round tally, points, ammo, health/regen, perks, power-up timers, prompts, minimap */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, Art = GW.Art, T = C.TILE;
  const H = (GW.HUD = {});
  const $ = (id) => document.getElementById(id);
  const el = {};
  let last = {};
  let roundCtx, miniCtx, iconCtx, miniT = 0, denyTimer = 0;
  const puNodes = {};

  H.init = function () {
    for (const id of ['hud', 'zone-name', 'objective', 'powerups', 'announce', 'announce-main', 'announce-sub', 'prompt', 'perks',
      'health', 'health-fill', 'health-num', 'stamina-fill', 'round', 'score-pops', 'points', 'weapon-name', 'weapon-icon',
      'clip', 'reserve', 'ammo-hint', 'grenades', 'slots', 'vignette', 'flash', 'minimap', 'armor', 'armor-fill', 'armor-num',
      'tactical', 'sentry-tag', 'power-status', 'boss', 'boss-fill', 'boss-phase']) {
      el[id] = $(id);
    }
    roundCtx = el.round.getContext('2d');
    miniCtx = el.minimap.getContext('2d');
    iconCtx = el['weapon-icon'].getContext('2d');
  };

  H.show = function (v) {
    el.hud.classList.toggle('hidden', !v);
  };

  H.reset = function () {
    last = {};
    el.perks.innerHTML = '';
    el['score-pops'].innerHTML = '';
    for (const k in puNodes) {
      puNodes[k].remove();
      delete puNodes[k];
    }
    el.announce.classList.remove('show');
    el.boss.classList.remove('on', 'stunned');
    el.vignette.style.opacity = 0;
    el.vignette.classList.remove('pulse');
    el.flash.style.opacity = 0;
    H.setPrompt('');
    drawRound(0);
  };

  /** Set a DOM property only when the value actually changed. */
  function set(key, node, value, prop) {
    if (last[key] === value) return false;
    last[key] = value;
    node[prop || 'textContent'] = value;
    return true;
  }
  function cls(key, node, name, on) {
    if (last[key] === on) return;
    last[key] = on;
    node.classList.toggle(name, on);
  }

  /* ---------------- round counter ---------------- */
  function drawRound(n) {
    const g = roundCtx;
    g.clearRect(0, 0, 260, 120);
    if (n <= 0) return;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      g.shadowColor = '#ff1a2e';
      g.shadowBlur = pass ? 4 : 18;
      g.strokeStyle = g.fillStyle = pass ? '#ff5a68' : '#d40d1e';
      if (n <= 5) {
        // classic chalk tally marks; the fifth strikes through the first four
        g.lineWidth = pass ? 3.5 : 8;
        const marks = Math.min(n, 4);
        for (let i = 0; i < marks; i++) {
          const x = 30 + i * 28;
          const w1 = (U.hash(i, 1, 5) - 0.5) * 8, w2 = (U.hash(i, 2, 5) - 0.5) * 10, w3 = (U.hash(i, 3, 5) - 0.5) * 8;
          g.beginPath();
          g.moveTo(x + w1, 24);
          g.quadraticCurveTo(x + w2, 62, x + w3, 102);
          g.stroke();
        }
        if (n === 5) {
          g.beginPath();
          g.moveTo(10, 88);
          g.quadraticCurveTo(70, 66, 134, 34);
          g.stroke();
        }
      } else {
        g.font = '900 88px ' + GW.FONT;
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        g.fillText(String(n), 14, 66);
      }
    }
    g.restore();
  }

  function retrigger(node, name) {
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
  }

  H.roundChange = function (r) {
    drawRound(r);
    retrigger(el.round, 'changing');
  };
  H.roundOver = function () {
    retrigger(el.round, 'changing');
  };

  /* ---------------- messages ---------------- */
  H.setPrompt = function (html) {
    if (last.prompt === html) return;
    last.prompt = html;
    if (html) el.prompt.innerHTML = html;
    el.prompt.classList.toggle('show', !!html);
  };

  H.denyPrompt = function () {
    retrigger(el.prompt, 'deny');
    clearTimeout(denyTimer);
    denyTimer = setTimeout(() => el.prompt.classList.remove('deny'), 300);
  };

  H.announce = function (main, sub, color) {
    const c = color || '#ff4fd8';
    el['announce-main'].textContent = main;
    el['announce-main'].style.textShadow = '0 0 8px ' + c + ', 0 0 24px ' + c + ', 0 0 60px ' + c;
    el['announce-sub'].textContent = sub || '';
    retrigger(el.announce, 'show');
  };

  H.scorePop = function (n) {
    const box = el['score-pops'];
    while (box.children.length > 7) box.removeChild(box.firstChild);
    const d = document.createElement('div');
    d.className = 'score-pop' + (n < 0 ? ' neg' : '');
    d.textContent = (n > 0 ? '+' : '') + n;
    d.style.setProperty('--dx', -(20 + Math.random() * 90) + 'px');
    d.style.setProperty('--dy', -(30 + Math.random() * 70) + 'px');
    box.appendChild(d);
    setTimeout(() => d.remove(), 900);
    retrigger(el.points, 'bump');
  };

  H.perksChanged = function () {
    const P = GW.Player;
    el.perks.innerHTML = '';
    for (const id of P.perkOrder) {
      const c = Art.iconCanvas('perk', id, 44);
      c.title = GW.PERKS[id].name;
      el.perks.appendChild(c);
    }
  };

  /* ---------------- weapon panel ---------------- */
  function drawWeaponIcon(w) {
    const g = iconCtx;
    g.clearRect(0, 0, 220, 64);
    if (!w) return;
    const col = w.up ? w.s.color : '#19f0ff';
    const width = w.s.cls === 'pistol' ? 62 : 104;
    g.save();
    g.shadowColor = col;
    g.shadowBlur = 10;
    Art.weapon(g, w.s.cls, 214 - width / 2, 26, width, col, 'neon');
    g.restore();
  }

  /** Timed effects shown as pills at the top: power-ups, allies, lockdown. */
  function activeTimers() {
    const G = GW.Game, AL = GW.Allies, S = M.safeRoom;
    const out = [];
    if (G.timers.double > 0) out.push({ id: 'double', kind: 'powerup', t: G.timers.double, name: GW.POWERUPS.double.name, color: GW.POWERUPS.double.color });
    if (G.timers.instakill > 0) out.push({ id: 'instakill', kind: 'powerup', t: G.timers.instakill, name: GW.POWERUPS.instakill.name, color: GW.POWERUPS.instakill.color });
    if (AL.pal) out.push({ id: 'pal', kind: 'gadget', t: AL.pal.t, name: 'PIXEL PAL', color: '#b77dff' });
    if (AL.sentry) out.push({ id: 'sentry', kind: 'gadget', t: AL.sentry.t, name: 'SENTRY', color: '#19f0ff' });
    if (S.state === 'sealed') out.push({ id: 'safe', kind: 'gadget', t: S.t, name: 'LOCKDOWN', color: '#3dff8b' });
    return out;
  }

  function updatePowerupTimers() {
    const list = activeTimers();
    const seen = {};
    for (const e of list) {
      seen[e.id] = true;
      let node = puNodes[e.id];
      if (!node) {
        node = puNodes[e.id] = document.createElement('div');
        node.className = 'pu-timer';
        node.style.color = e.color;
        node.appendChild(Art.iconCanvas(e.kind, e.id, 26));
        const label = document.createElement('span');
        node.appendChild(label);
        node._label = label;
        el.powerups.appendChild(node);
        last['pu' + e.id] = null;
      }
      const secs = Math.ceil(e.t);
      if (last['pu' + e.id] !== secs) {
        last['pu' + e.id] = secs;
        node._label.textContent = e.name + ' ' + secs;
        node.classList.toggle('ending', secs <= 5);
      }
    }
    for (const id in puNodes) {
      if (seen[id]) continue;
      puNodes[id].remove();
      delete puNodes[id];
    }
  }

  /* ---------------- minimap ---------------- */
  function drawMini() {
    const g = miniCtx, P = GW.Player, I = GW.Interact;
    const s = 3 / T;
    const blink = Math.sin(performance.now() / 160) > 0;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, 192, 150);
    // fit the whole park into the panel
    const k = Math.min(192 / (M.W * 3), 150 / (M.H * 3));
    g.setTransform(k, 0, 0, k, (192 - M.W * 3 * k) / 2, (150 - M.H * 3 * k) / 2);
    g.drawImage(GW.MapArt.mini, 0, 0);
    for (const d of M.doors) {
      if (d.open) continue;
      g.fillStyle = d.power ? '#ff3b4e' : '#ffe14d';
      g.fillRect(d.rx * s - 0.5, d.ry * s - 0.5, d.rw * s + 1, d.rh * s + 1);
    }
    for (const sp of M.perkSpots) {
      if (!I.powered(sp.zone) || P.perks[sp.perk]) continue;
      g.fillStyle = GW.PERKS[sp.perk].color;
      g.fillRect(sp.x * s - 2, sp.y * s - 2, 4, 4);
    }
    // generators in opened zones: red until fed a fuse (blinking while you carry one)
    for (const gen of M.generators) {
      if (!M.zones[gen.zone].open) continue;
      const on = I.powered(gen.zone);
      if (!on && P.fuses > 0 && !blink) continue;
      g.fillStyle = on ? '#3dff8b' : '#ff3b4e';
      g.fillRect(gen.x * s - 2.5, gen.y * s - 2.5, 5, 5);
    }
    if (I.powered(M.Z.VAULT)) {
      g.fillStyle = '#ff4fd8';
      g.fillRect(M.pap.x * s - 3, M.pap.y * s - 2, 6, 4);
    }
    // traps, pads and the panic room
    for (const tr of M.traps) {
      if (!I.powered(tr.zone)) continue;
      g.fillStyle = tr.state === 'active' ? (blink ? GW.TRAPS[tr.kind].color : '#ffffff') : U.rgba(GW.TRAPS[tr.kind].color, tr.state === 'idle' ? 0.55 : 0.2);
      g.fillRect(tr.rx * s, tr.ry * s, tr.rw * s, tr.rh * s);
    }
    {
      for (const pr of M.pads) {
        for (const e of [pr.a, pr.b]) {
          if (!M.zones[e.zone].open || !I.powered(e.zone)) continue;
          g.strokeStyle = pr.color;
          g.globalAlpha = pr.cd > 0 ? 0.35 : 1;
          g.lineWidth = 1;
          g.beginPath();
          g.arc(e.x * s, e.y * s, 2.5, 0, U.TAU);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    const SR = M.safeRoom;
    g.strokeStyle = SR.state === 'sealed' ? '#ff3b4e' : '#3dff8b';
    g.lineWidth = 1;
    g.strokeRect(SR.rx * s + 0.5, SR.ry * s + 0.5, SR.rw * s - 1, SR.rh * s - 1);
    const AL = GW.Allies;
    if (AL.pal) {
      g.fillStyle = '#b77dff';
      g.fillRect(AL.pal.x * s - 1.5, AL.pal.y * s - 1.5, 3, 3);
    }
    if (AL.sentry) {
      g.fillStyle = '#19f0ff';
      g.fillRect(AL.sentry.x * s - 1.5, AL.sentry.y * s - 1.5, 3, 3);
    }
    const bs = M.boxSpots[I.box.spot];
    if (I.box.state !== 'moving') {
      g.fillStyle = '#ffe14d';
      g.font = '900 9px ' + GW.FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', bs.x * s, bs.y * s + 0.5);
    }
    for (const pu of I.powerups) {
      g.fillStyle = blink ? '#ffffff' : GW.POWERUPS[pu.type].color;
      g.fillRect(pu.x * s - 1.5, pu.y * s - 1.5, 3, 3);
    }
    g.fillStyle = '#ff2b3c';
    for (const z of GW.Zombies.list) g.fillRect(z.x * s - 1, z.y * s - 1, z.type === 'boss' ? 6 : z.type === 'brute' ? 3 : 2, z.type === 'boss' ? 6 : z.type === 'brute' ? 3 : 2);
    // player arrow
    g.save();
    g.translate(P.x * s, P.y * s);
    g.rotate(P.angle);
    g.fillStyle = '#19f0ff';
    g.beginPath();
    g.moveTo(5, 0);
    g.lineTo(-3.5, -3.5);
    g.lineTo(-1.5, 0);
    g.lineTo(-3.5, 3.5);
    g.closePath();
    g.fill();
    g.restore();
  }

  /* ---------------- per-frame sync ---------------- */
  H.update = function (dt) {
    const P = GW.Player, I = GW.Interact, FX = GW.FX;

    set('pts', el.points, String(P.points));

    const w = P.weapon();
    if (w) {
      set('wname', el['weapon-name'], w.s.name + (w.mod ? '  ·  ' + GW.MODS[w.mod].name.toUpperCase() : ''));
      cls('wup', el['weapon-name'], 'up', w.up);
      set('clip', el.clip, String(w.clip));
      set('res', el.reserve, String(w.reserve));
      cls('cliplow', el.clip, 'low', w.clip <= Math.ceil(w.s.mag * 0.25));
      let hint = '';
      if (w.reloadT > 0) hint = 'RELOADING';
      else if (w.clip === 0 && w.reserve === 0) hint = 'NO AMMO — FIND A WALL BUY';
      else if (w.clip <= Math.ceil(w.s.mag * 0.25) && w.reserve > 0) hint = 'PRESS R TO RELOAD';
      else if (w.reserve === 0) hint = 'LAST MAGAZINE';
      set('hint', el['ammo-hint'], hint);
      cls('hintrel', el['ammo-hint'], 'reloading', w.reloadT > 0);
    } else {
      set('wname', el['weapon-name'], 'KNIFE ONLY');
      cls('wup', el['weapon-name'], 'up', false);
      set('clip', el.clip, '—');
      set('res', el.reserve, '—');
      cls('cliplow', el.clip, 'low', false);
      set('hint', el['ammo-hint'], '');
    }
    const wkey = w ? w.id + w.tier + (w.mod || '') : 'none';
    if (last.wicon !== wkey) {
      last.wicon = wkey;
      drawWeaponIcon(w);
    }

    if (last.nades !== P.grenades) {
      last.nades = P.grenades;
      let html = '';
      for (let i = 0; i < C.PLAYER.grenadesMax; i++) html += '<div class="nade' + (i < P.grenades ? '' : ' off') + '"></div>';
      el.grenades.innerHTML = html;
    }
    const skey = P.weapons.map((x) => x.id + x.tier + (x.mod || '')).join('|') + '#' + P.cur;
    if (last.slots !== skey) {
      last.slots = skey;
      el.slots.innerHTML = P.weapons
        .map((x, i) => '<div class="slot' + (i === P.cur ? ' on' : '') + '">' + (i + 1) + ' ' + x.s.name + '</div>')
        .join('');
    }

    // armor
    cls('armoff', el.armor, 'off', P.armor <= 0);
    set('armw', el['armor-fill'].style, (U.clamp(P.armor / C.ARMOR.max, 0, 1) * 100).toFixed(1) + '%', 'width');
    set('armn', el['armor-num'], String(Math.ceil(P.armor)));

    // tactical slot + carried sentry
    const tkey = (P.tactical.type || '-') + P.tactical.count;
    if (last.tac !== tkey) {
      last.tac = tkey;
      el.tactical.innerHTML = '';
      if (P.tactical.type) {
        const def = GW.TACTICALS[P.tactical.type];
        el.tactical.appendChild(Art.iconCanvas('gadget', P.tactical.type, 22));
        const n = document.createElement('span');
        n.textContent = 'T ×' + P.tactical.count;
        n.style.color = def.color;
        n.style.textShadow = '0 0 8px ' + def.color;
        el.tactical.appendChild(n);
        el.tactical.title = def.name;
      }
      el.tactical.classList.toggle('empty', !!P.tactical.type && P.tactical.count === 0);
    }
    cls('sentrytag', el['sentry-tag'], 'on', P.sentryCarried);

    // vitals
    const frac = U.clamp(P.hp / P.maxHp, 0, 1);
    set('hpw', el['health-fill'].style, (frac * 100).toFixed(1) + '%', 'width');
    set('hpn', el['health-num'], String(Math.max(0, Math.ceil(P.hp))));
    cls('hplow', el.health, 'low', frac < 0.45);
    cls('hpregen', el.health, 'regen', P.regenerating);
    set('stw', el['stamina-fill'].style, (U.clamp(P.stamina / P.staminaMax, 0, 1) * 100).toFixed(1) + '%', 'width');
    set('stc', el['stamina-fill'].style, P.exhausted ? '#ff3b4e' : '', 'background');
    const vig = Math.max(P.hurtFlash * 0.85, Math.pow(1 - frac, 1.4) * 0.95);
    set('vig', el.vignette.style, vig.toFixed(2), 'opacity');
    cls('vigp', el.vignette, 'pulse', frac < 0.45 && P.alive);
    set('flash', el.flash.style, FX.flash.toFixed(2), 'opacity');

    // location + objective
    const zn = M.zoneAt(P.x, P.y);
    if (zn >= 0 && last.zone !== zn) {
      last.zone = zn;
      const z = M.zones[zn];
      el['zone-name'].textContent = z.name;
      el['zone-name'].style.color = z.color;
      el['zone-name'].style.textShadow = '0 0 6px ' + z.color + ', 0 0 18px ' + z.color;
    }
    set('obj', el.objective, I.objective());
    set('pow', el['power-status'], 'POWER ' + I.poweredCount() + '/' + M.generators.length + (P.fuses > 0 ? '   ·   FUSES ' + P.fuses : ''));

    updatePowerupTimers();

    // boss health bar
    const bz = GW.Boss.ref;
    cls('bosson', el.boss, 'on', !!bz);
    if (bz) {
      set('bossw', el['boss-fill'].style, (U.clamp(bz.hp / bz.maxHp, 0, 1) * 100).toFixed(1) + '%', 'width');
      const b = bz.boss;
      set('bossp', el['boss-phase'], b.mode === 'stunned' ? 'STUNNED — HIT THE CORE ON ITS BACK' : b.phase === 1 ? 'ACT I — ARMOURED FRONT, WEAK BACK' : b.phase === 2 ? 'ACT II' : 'FINALE');
      cls('bossst', el.boss, 'stunned', b.mode === 'stunned');
    }

    miniT -= dt;
    if (miniT <= 0) {
      miniT = 0.1;
      drawMini();
    }
  };
})();
