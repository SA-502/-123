/*
 * GRAVEWAVE ARENA — the match itself: health, kills, score, respawns, power boxes and cubes,
 * the closing gas, turrets and healing zones, and the bots. Runs on the server for online rooms
 * and inside the page for games with bots only. No DOM in here.
 *
 * Players move and aim on their own phones and send:
 *   ap {x, y, a, r}            where they are 20 times a second (r: just attacked, so not hidden)
 *   as {o, c, s, x, y, a, d}   they fired (s = super): everyone draws it, the match builds turrets / zones
 *   ah {i, d, h, s, kx, ky}    their shot hit i (an id, 'b3' = box 3, 't2' = turret 2) for d damage or h healing
 * The match sends:
 *   ainit                      who is playing, teams, characters, where everyone starts
 *   aw                         a snapshot 15 times a second (bots, health, cubes, gas, score...)
 *   ae {k: ...}                events: hit, kill, resp(awn), kb (knockback), cube, box, bot, end
 *   as                         bots' and turrets' shots, so phones can draw them
 */
(function (root) {
  'use strict';
  const A = typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./core.js').Arena : root.Arena;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const STEP = 1 / 30;

  class ArenaSim {
    /**
     * @param {number} seed
     * @param {number[]} players  ids of the people in the room
     * @param {(text: string) => void} out  messages to the room
     * @param {{mode: 'team'|'ffa', picks: Object<number,string>}} opts
     */
    constructor(seed, players, out, opts) {
      opts = opts || {};
      this.out = out;
      this.dead = false;
      this.rnd = A.rng(seed || 1);
      this.mode = opts.mode === 'ffa' ? 'ffa' : 'team';
      this.ffa = this.mode === 'ffa';
      this.map = A.buildMap(this.mode);
      this.t = 0;
      this.acc = 0;
      this.last = now();
      this.frame = 0;
      this.ended = false;
      this.score = [0, 0];
      this.ents = new Map();
      this.boxes = this.map.boxes.map((b) => Object.assign({}, b, { hp: A.BOX_HP, alive: true }));
      this.cubes = [];
      this.turrets = [];
      this.zones = [];
      this.proj = [];
      this.nextId = 1;
      this.sentInit = false;

      const picks = opts.picks || {};
      const humans = players.slice(0, this.ffa ? 10 : 6);
      const pickChar = (id) => (A.CHARS[picks[id]] ? picks[id] : A.CHAR_IDS[Math.floor(this.rnd() * A.CHAR_IDS.length)]);
      const teamOf = (i) => (this.ffa ? 100 + i : i % 2);
      humans.forEach((id, i) => this.addEnt(id, pickChar(id), teamOf(i), false, 'P' + id));
      // bots fill the rest: 3 a side, or 10 in all
      let botId = 101;
      const used = new Set(humans.map((id) => this.ents.get(id).c));
      const botChar = () => {
        const free = A.CHAR_IDS.filter((c) => !used.has(c));
        const list = free.length ? free : A.CHAR_IDS;
        const c = list[Math.floor(this.rnd() * list.length)];
        used.add(c);
        if (used.size >= A.CHAR_IDS.length) used.clear();
        return c;
      };
      if (this.ffa) {
        for (let i = humans.length; i < 10; i++) {
          const c = botChar();
          this.addEnt(botId++, c, teamOf(i), true, A.CHARS[c].name);
        }
      } else {
        const count = [0, 0];
        for (const e of this.ents.values()) count[e.tm]++;
        for (const tm of [0, 1])
          while (count[tm] < 3) {
            const c = botChar();
            this.addEnt(botId++, c, tm, true, A.CHARS[c].name);
            count[tm]++;
          }
      }
      // starting spots
      if (this.ffa) {
        const spots = this.map.spawns.slice();
        for (let i = spots.length - 1; i > 0; i--) {
          const j = Math.floor(this.rnd() * (i + 1));
          [spots[i], spots[j]] = [spots[j], spots[i]];
        }
        let k = 0;
        for (const e of this.ents.values()) Object.assign(e, spots[k++ % spots.length]);
      } else {
        const k = [0, 0];
        for (const e of this.ents.values()) {
          const list = e.tm === 0 ? this.map.spawnA : this.map.spawnB;
          Object.assign(e, list[k[e.tm]++ % list.length]);
          e.a = e.tm === 0 ? 0 : Math.PI;
        }
      }
    }

    addEnt(id, c, tm, bot, name) {
      const e = {
        id, c, tm, bot, n: name, x: 0, y: 0, a: 0, alive: true, cubes: 0, sup: 0,
        maxHp: A.maxHp(c, 0), hp: A.maxHp(c, 0), lastHurt: -9, lastAtk: -9, revealT: 0, respT: 0,
        kills: 0, deaths: 0, lastBy: 0, ignoreAp: 0, rank: 0,
        // bots only
        ammo: A.AMMO, rl: 0, cd: 0.6 + Math.random() * 0.6, think: 0, target: null, goal: null, field: null, fieldKey: '', fieldT: 0, strafe: 1, strafeT: 0, dash: null, leap: null,
      };
      this.ents.set(id, e);
      return e;
    }

    send(m) {
      try {
        this.out(JSON.stringify(m));
      } catch (e) {
        /* a closed room */
      }
    }
    ev(m) {
      m.t = 'ae';
      this.send(m);
    }

    /* ---------------- the server / page drives us ---------------- */

    /** Advance to the current time. Returns false once the match is over (and announced). */
    tick() {
      if (this.dead) return false;
      const t = now();
      this.acc += Math.min(0.25, (t - this.last) / 1000);
      this.last = t;
      try {
        while (this.acc >= STEP) {
          this.step(STEP);
          this.acc -= STEP;
        }
      } catch (e) {
        console.error('[arena] step', e);
      }
      return !this.dead;
    }
    stop() {
      this.dead = true;
    }

    /** A message from a player (tagged with `from` by the server). */
    receive(m) {
      if (this.dead || !m) return;
      try {
        const e = this.ents.get(m.from);
        switch (m.t) {
          case 'ap':
            if (!e || e.bot || !e.alive || this.t < e.ignoreAp) return;
            if (typeof m.x === 'number' && typeof m.y === 'number' && isFinite(m.x) && isFinite(m.y)) {
              e.x = Math.max(0, Math.min(this.map.pw, m.x));
              e.y = Math.max(0, Math.min(this.map.ph, m.y));
            }
            if (typeof m.a === 'number') e.a = m.a;
            if (m.r) e.revealT = 0.8;
            return;
          case 'as':
            if (!e || e.bot || !e.alive) return;
            this.onShot(e, m);
            return;
          case 'ah':
            if (!e || e.bot) return;
            this.onHit(e, m);
            return;
          case 'peer-': {
            // someone left: a bot takes over their character
            const p = this.ents.get(m.id);
            if (p && !p.bot) {
              p.bot = true;
              p.n = A.CHARS[p.c].name;
              this.ev({ k: 'bot', id: p.id });
            }
            return;
          }
        }
      } catch (err) {
        console.error('[arena] message', m && m.t, err);
      }
    }

    /* ---------------- one step of the match ---------------- */
    step(dt) {
      if (!this.sentInit) {
        this.sentInit = true;
        this.send({
          t: 'ainit',
          mode: this.mode,
          e: [...this.ents.values()].map((e) => ({ id: e.id, c: e.c, tm: e.tm, n: e.n, b: e.bot ? 1 : 0, x: Math.round(e.x), y: Math.round(e.y), a: e.a })),
        });
      }
      this.t += dt;
      this.frame++;
      if (this.ended) {
        if (this.t > this.endT + 1.5) this.dead = true;
        return;
      }
      const ffa = this.ffa;
      const gasR = ffa ? A.gasRadius(this.map, this.t) : 0;
      const cx = this.map.pw / 2, cy = this.map.ph / 2;

      for (const e of this.ents.values()) {
        if (!e.alive) {
          if (!ffa && (e.respT -= dt) <= 0) this.respawn(e);
          continue;
        }
        e.revealT -= dt;
        // health comes back when you stay out of the fight for a while
        if (this.t - e.lastHurt > A.REGEN_WAIT && this.t - e.lastAtk > A.REGEN_WAIT && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * A.REGEN * dt);
        if (ffa && Math.hypot(e.x - cx, e.y - cy) > gasR) this.hurt(e, A.GAS.dps * dt, 0, true, true);
        if (e.bot && e.alive) this.bot(e, dt);
      }

      // bots' and turrets' shots
      for (let i = this.proj.length - 1; i >= 0; i--) {
        const p = this.proj[i];
        const r = A.stepProjectile(this.map, p, dt, (pp, x1, y1, x2, y2) => this.shotHits(pp, x1, y1, x2, y2));
        if (r === 'boom') {
          this.boom(p);
          this.proj.splice(i, 1);
        } else if (!r) {
          if (p.wallX !== undefined) this.hitBoxAt(p, p.wallX + Math.cos(p.a) * 6, p.wallY + Math.sin(p.a) * 6);
          this.proj.splice(i, 1);
        }
      }

      // turrets shoot the nearest enemy they can see
      for (let i = this.turrets.length - 1; i >= 0; i--) {
        const tu = this.turrets[i];
        tu.life -= dt;
        if (tu.life <= 0 || tu.hp <= 0) {
          this.turrets.splice(i, 1);
          continue;
        }
        tu.cd -= dt;
        if (tu.cd > 0) continue;
        const spec = A.CHARS.engineer.sup;
        let best = null, bd = spec.reach;
        for (const e of this.ents.values()) {
          if (!e.alive || this.sameTeam(e.tm, tu.tm) || this.hiddenFrom(e, tu.tm, tu)) continue;
          const d = Math.hypot(e.x - tu.x, e.y - tu.y);
          if (d < bd && A.los(this.map, tu.x, tu.y, e.x, e.y)) {
            bd = d;
            best = e;
          }
        }
        if (!best) continue;
        tu.cd = spec.rate;
        const a = Math.atan2(best.y - tu.y, best.x - tu.x);
        tu.a = a;
        this.proj.push({ k: 'p', o: tu.owner, tm: tu.tm, c: 'engineer', s: true, tur: tu.id, x: tu.x, y: tu.y, a, sp: 1100, life: spec.reach / 1100, r: 5, dmg: Math.round(spec.dmg * tu.mul), heal: 0, pierce: false, wait: 0, kb: 0, color: A.CHARS.engineer.color, hit: null });
        this.send({ t: 'as', o: tu.owner, c: 'engineer', tur: tu.id, x: Math.round(tu.x), y: Math.round(tu.y), a: +a.toFixed(3) });
      }

      // healing zones
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i];
        z.life -= dt;
        if (z.life <= 0) {
          this.zones.splice(i, 1);
          continue;
        }
        const spec = A.CHARS.medic.sup;
        for (const e of this.ents.values()) {
          if (!e.alive || Math.hypot(e.x - z.x, e.y - z.y) > z.r + A.R * 0.5) continue;
          if (this.sameTeam(e.tm, z.tm)) e.hp = Math.min(e.maxHp, e.hp + spec.heal * dt);
          else this.hurt(e, spec.dmg * z.mul * dt, z.owner, true, true);
        }
      }

      // power cubes are picked up by walking over them
      for (let i = this.cubes.length - 1; i >= 0; i--) {
        const cb = this.cubes[i];
        for (const e of this.ents.values()) {
          if (!e.alive || Math.hypot(e.x - cb.x, e.y - cb.y) > 40) continue;
          e.cubes++;
          const old = e.maxHp;
          e.maxHp = A.maxHp(e.c, e.cubes);
          e.hp += e.maxHp - old;
          this.cubes.splice(i, 1);
          this.ev({ k: 'cube', id: e.id, cb: cb.id });
          break;
        }
      }

      // the end
      if (!ffa) {
        if (this.score[0] >= A.TEAM_GOAL || this.score[1] >= A.TEAM_GOAL || this.t >= A.TEAM_TIME) {
          this.finish(this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1);
        }
      } else {
        const alive = [...this.ents.values()].filter((e) => e.alive);
        if (alive.length <= 1) this.finish(alive.length ? alive[0].id : -1);
      }

      if (this.frame % 2 === 0) this.snapshot(gasR);
    }

    snapshot(gasR) {
      const e = [];
      for (const x of this.ents.values())
        e.push([x.id, Math.round(x.x), Math.round(x.y), Math.round(x.a * 100), Math.round(x.hp), x.maxHp, x.alive ? 1 : 0, x.cubes, Math.floor(x.sup), x.revealT > 0 ? 1 : 0, x.kills]);
      const m = {
        t: 'aw',
        tm: +this.t.toFixed(2),
        e,
        bx: this.boxes.filter((b) => !b.alive).map((b) => b.id),
        cb: this.cubes.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]),
        tu: this.turrets.map((t) => [t.id, Math.round(t.x), Math.round(t.y), t.tm, Math.round(t.hp), +t.life.toFixed(1), Math.round((t.a || 0) * 100)]),
        z: this.zones.map((z) => [z.id, Math.round(z.x), Math.round(z.y), z.r, z.tm, +z.life.toFixed(1)]),
        sc: this.score,
      };
      if (this.ffa) m.g = Math.round(gasR);
      else m.tl = Math.max(0, Math.ceil(A.TEAM_TIME - this.t));
      this.send(m);
    }

    /* ---------------- teams, damage, deaths ---------------- */
    sameTeam(a, b) {
      return a === b;
    }
    /** Is e hidden in the bushes from team tm (looking from `from`)? */
    hiddenFrom(e, tm, from) {
      if (this.sameTeam(e.tm, tm) || e.revealT > 0 || !A.inBrush(this.map, e.x, e.y)) return false;
      if (from && Math.hypot(e.x - from.x, e.y - from.y) < A.REVEAL) return false;
      for (const o of this.ents.values()) if (o.alive && o.tm === tm && Math.hypot(e.x - o.x, e.y - o.y) < A.REVEAL) return false;
      return true;
    }

    /** Damage an ent. byId = who did it (0 = the gas). quiet = no hit number (gas / zones tick every frame). */
    hurt(e, dmg, byId, isSuper, quiet) {
      if (!e.alive || dmg <= 0 || this.ended) return;
      e.hp -= dmg;
      e.lastHurt = this.t;
      if (byId) e.lastBy = byId;
      e.revealT = Math.max(e.revealT, 0.3);
      const by = this.ents.get(byId);
      if (by && !isSuper) by.sup = Math.min(A.SUPER_FULL, by.sup + (dmg / A.CHARS[by.c].need) * A.SUPER_FULL);
      if (!quiet) this.ev({ k: 'hit', id: e.id, d: Math.round(dmg), by: byId || 0 });
      if (e.hp <= 0) this.kill(e, byId || e.lastBy);
    }
    heal(e, amount, byId) {
      if (!e.alive || amount <= 0) return;
      e.hp = Math.min(e.maxHp, e.hp + amount);
      this.ev({ k: 'hit', id: e.id, d: -Math.round(amount), by: byId || 0 });
    }
    kill(e, byId) {
      e.alive = false;
      e.hp = 0;
      e.deaths++;
      e.dash = e.leap = null;
      const by = this.ents.get(byId);
      if (by && by !== e) {
        by.kills++;
        if (!this.ffa && by.tm !== e.tm) this.score[by.tm]++;
      }
      let rank = 0;
      if (this.ffa) {
        rank = [...this.ents.values()].filter((o) => o.alive).length + 1;
        e.rank = rank;
        // the cubes it carried spill out (at least one)
        const n = Math.max(1, e.cubes);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * A.TAU + this.rnd();
          const p = { x: e.x + Math.cos(a) * 26 * (n > 1 ? 1 : 0), y: e.y + Math.sin(a) * 26 * (n > 1 ? 1 : 0) };
          this.cubes.push({ id: this.nextId++, x: p.x, y: p.y });
        }
        e.cubes = 0;
      } else e.respT = A.RESPAWN;
      this.ev({ k: 'kill', v: e.id, by: by ? by.id : 0, rank });
    }
    respawn(e) {
      const list = e.tm === 0 ? this.map.spawnA : this.map.spawnB;
      const s = list[Math.floor(this.rnd() * list.length)];
      e.x = s.x;
      e.y = s.y;
      e.alive = true;
      e.hp = e.maxHp;
      e.ammo = A.AMMO;
      e.ignoreAp = this.t + 0.5;
      e.lastHurt = -9;
      this.ev({ k: 'resp', id: e.id, x: Math.round(s.x), y: Math.round(s.y) });
    }
    finish(win) {
      this.ended = true;
      this.endT = this.t;
      // final places: alive first, then by when they fell
      const ents = [...this.ents.values()];
      const ranks = this.ffa
        ? ents.map((e) => [e.id, e.alive ? 1 : e.rank, e.kills])
        : ents.map((e) => [e.id, e.tm === win ? 1 : 2, e.kills]);
      this.ev({ k: 'end', win, sc: this.score, ranks });
    }

    /* ---------------- hits reported by players ---------------- */
    onShot(e, m) {
      e.lastAtk = this.t;
      e.revealT = 0.8;
      if (!m.s) return;
      if (e.sup < A.SUPER_FULL - 0.5) return; // not charged: ignore
      e.sup = 0;
      const spec = A.CHARS[e.c].sup;
      const d = Math.min(spec.range, Math.max(0, +m.d || 0));
      const a = +m.a || 0;
      if (spec.kind === 'turret') this.addTurret(e, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d);
      if (spec.kind === 'zone') this.addZone(e, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d);
    }
    onHit(e, m) {
      if (!e.alive && !m.late) return;
      const dmg = Math.max(0, Math.min(7000, +m.d || 0));
      const heal = Math.max(0, Math.min(3000, +m.h || 0));
      const key = m.i;
      if (typeof key === 'string' && key[0] === 'b') {
        const b = this.boxes[+key.slice(1)];
        if (b) this.hurtBox(b, dmg);
        return;
      }
      if (typeof key === 'string' && key[0] === 't') {
        const tu = this.turrets.find((t) => t.id === +key.slice(1));
        if (tu && !this.sameTeam(tu.tm, e.tm)) tu.hp -= dmg;
        return;
      }
      const target = this.ents.get(+key);
      if (!target || !target.alive) return;
      if (this.sameTeam(target.tm, e.tm)) {
        if (heal && !this.ffa && target !== e) this.heal(target, heal, e.id);
        return;
      }
      if (dmg) this.hurt(target, dmg, e.id, !!m.s);
      if (m.kx || m.ky) this.knock(target, +m.kx || 0, +m.ky || 0);
    }
    knock(target, dx, dy) {
      const L = Math.hypot(dx, dy);
      if (L > 220) {
        dx *= 220 / L;
        dy *= 220 / L;
      }
      if (target.bot) A.move(this.map, target, dx, dy);
      else this.ev({ k: 'kb', id: target.id, dx: Math.round(dx), dy: Math.round(dy) });
    }
    hurtBox(b, dmg) {
      if (!b.alive) return;
      b.hp -= dmg;
      if (b.hp > 0) return;
      b.alive = false;
      this.map.tiles[b.ty * this.map.w + b.tx] = A.T.FLOOR;
      const p = A.boxPos(this.map, b);
      this.cubes.push({ id: this.nextId++, x: p.x, y: p.y });
      this.ev({ k: 'box', id: b.id });
    }
    hitBoxAt(p, x, y) {
      if (A.tileAt(this.map, x, y) !== A.T.BOX) return;
      const tx = Math.floor(x / A.TILE), ty = Math.floor(y / A.TILE);
      const b = this.boxes.find((bb) => bb.alive && bb.tx === tx && bb.ty === ty);
      if (b) this.hurtBox(b, p.dmg);
    }
    addTurret(e, x, y) {
      const p = this.freeSpot(e, x, y);
      const spec = A.CHARS.engineer.sup;
      this.turrets = this.turrets.filter((t) => t.owner !== e.id); // one each
      this.turrets.push({ id: this.nextId++, owner: e.id, tm: e.tm, x: p.x, y: p.y, hp: spec.hp, life: spec.life, cd: 0.4, a: 0, mul: A.dmgMul(e.cubes) });
    }
    addZone(e, x, y) {
      const p = this.freeSpot(e, x, y);
      const spec = A.CHARS.medic.sup;
      this.zones.push({ id: this.nextId++, owner: e.id, tm: e.tm, x: p.x, y: p.y, r: spec.radius, life: spec.life, mul: A.dmgMul(e.cubes) });
    }
    /** The aimed spot, pulled back toward the thrower until it is not inside a wall. */
    freeSpot(e, x, y) {
      for (let k = 1; k >= 0; k -= 0.1) {
        const px = e.x + (x - e.x) * k, py = e.y + (y - e.y) * k;
        if (!A.blocksMove(A.tileAt(this.map, px, py))) return { x: px, y: py };
      }
      return { x: e.x, y: e.y };
    }

    /* ---------------- bot and turret shots ---------------- */
    shotHits(p, x1, y1, x2, y2) {
      for (const e of this.ents.values()) {
        if (!e.alive || e.id === p.o) continue;
        if (!A.segHit(x1, y1, x2, y2, e.x, e.y, A.R + p.r)) continue;
        if (p.hit && p.hit.has(e.id)) continue;
        if (this.sameTeam(e.tm, p.tm)) {
          if (p.heal && !this.ffa) {
            (p.hit = p.hit || new Set()).add(e.id);
            this.heal(e, p.heal, p.o);
          }
          continue;
        }
        (p.hit = p.hit || new Set()).add(e.id);
        this.hurt(e, p.dmg, p.o, p.s);
        if (!p.pierce) return true;
      }
      for (const tu of this.turrets) {
        if (this.sameTeam(tu.tm, p.tm) || !A.segHit(x1, y1, x2, y2, tu.x, tu.y, 18 + p.r)) continue;
        tu.hp -= p.dmg;
        if (!p.pierce) return true;
      }
      return false;
    }
    boom(p) {
      const pos = { x: p.tx, y: p.ty };
      for (const e of this.ents.values()) {
        if (!e.alive || this.sameTeam(e.tm, p.tm)) continue;
        const d = Math.hypot(e.x - pos.x, e.y - pos.y);
        if (d > p.rad + A.R) continue;
        this.hurt(e, p.dmg, p.o, p.s);
        if (p.kb) this.knock(e, ((e.x - pos.x) / (d || 1)) * p.kb, ((e.y - pos.y) / (d || 1)) * p.kb);
      }
      for (const b of this.boxes) {
        if (!b.alive) continue;
        const bp = A.boxPos(this.map, b);
        if (Math.hypot(bp.x - pos.x, bp.y - pos.y) <= p.rad + A.TILE / 2) this.hurtBox(b, p.dmg);
      }
      for (const tu of this.turrets) if (!this.sameTeam(tu.tm, p.tm) && Math.hypot(tu.x - pos.x, tu.y - pos.y) <= p.rad + 18) tu.hp -= p.dmg;
    }

    /* ---------------- bots ---------------- */
    bot(e, dt) {
      const ch = A.CHARS[e.c];
      // reload one bar at a time
      if (e.ammo < A.AMMO && (e.rl += dt) >= ch.reload) {
        e.ammo++;
        e.rl = 0;
      }
      e.cd -= dt;
      // a charge or a leap in progress moves the bot by itself
      if (e.dash) return this.botDash(e, dt);
      if (e.leap) return this.botLeap(e, dt);

      if ((e.think -= dt) <= 0) {
        e.think = 0.25 + this.rnd() * 0.1;
        this.botThink(e);
      }
      const T = e.target;
      const tgt = T && (T.ent ? (T.ent.alive ? T.ent : null) : T.box && T.box.alive ? A.boxPos(this.map, T.box) : null);
      let mx = 0, my = 0;
      const cx = this.map.pw / 2, cy = this.map.ph / 2;
      const gasR = this.ffa ? A.gasRadius(this.map, this.t) : 1e9;
      const inGas = this.ffa && Math.hypot(e.x - cx, e.y - cy) > gasR - A.TILE * 2;
      if (inGas) [mx, my] = this.botPathTo(e, cx, cy);
      else if (tgt) {
        const d = Math.hypot(tgt.x - e.x, tgt.y - e.y);
        const reach = A.reach(e.c, false);
        const want = ch.atk.kind === 'slash' ? 70 : ch.atk.kind === 'spread' ? reach * 0.55 : reach * 0.72;
        // a box blocks its own line of sight: look at the spot just in front of it
        const see = T.box ? A.los(this.map, e.x, e.y, tgt.x - ((tgt.x - e.x) / (d || 1)) * 30, tgt.y - ((tgt.y - e.y) / (d || 1)) * 30) : A.los(this.map, e.x, e.y, tgt.x, tgt.y);
        const weak = e.hp < e.maxHp * 0.33 && ch.atk.kind !== 'slash' && ch.atk.kind !== 'spread';
        if (weak && T.ent) {
          // back off and let the health come back
          [mx, my] = [e.x - tgt.x, e.y - tgt.y];
        } else if (d > want + 40 || !see) [mx, my] = this.botPathTo(e, tgt.x, tgt.y);
        else {
          // in range: circle the target, stepping in or out a little
          if ((e.strafeT -= dt) <= 0) {
            e.strafeT = 0.8 + this.rnd() * 1.4;
            e.strafe = this.rnd() < 0.5 ? -1 : 1;
          }
          const a = Math.atan2(tgt.y - e.y, tgt.x - e.x);
          const inout = d < want - 50 ? -0.6 : d > want + 10 ? 0.5 : 0;
          mx = Math.cos(a + (Math.PI / 2) * e.strafe) + Math.cos(a) * inout;
          my = Math.sin(a + (Math.PI / 2) * e.strafe) + Math.sin(a) * inout;
        }
        this.botAttack(e, tgt, d, see, T);
      } else if (e.goal) [mx, my] = this.botPathTo(e, e.goal.x, e.goal.y);
      const L = Math.hypot(mx, my);
      if (L > 0.01) {
        const sp = ch.speed * dt;
        const ox = e.x, oy = e.y;
        A.move(this.map, e, (mx / L) * sp, (my / L) * sp);
        if (!tgt || inGas) e.a = Math.atan2(e.y - oy, e.x - ox) || e.a;
      }
    }

    botThink(e) {
      // nearest enemy it can see (bushes hide people), else (10-player) the nearest box, else wander
      let best = null, bd = 1e9;
      for (const o of this.ents.values()) {
        if (!o.alive || this.sameTeam(o.tm, e.tm) || this.hiddenFrom(o, e.tm, e)) continue;
        let d = Math.hypot(o.x - e.x, o.y - e.y);
        if (!A.los(this.map, e.x, e.y, o.x, o.y)) d += 250;
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best && bd < (this.ffa ? 750 : 1400)) {
        e.target = { ent: best };
        return;
      }
      if (this.ffa) {
        let bb = null, bbd = 900;
        for (const b of this.boxes) {
          if (!b.alive) continue;
          const p = A.boxPos(this.map, b), d = Math.hypot(p.x - e.x, p.y - e.y);
          if (d < bbd) {
            bbd = d;
            bb = b;
          }
        }
        // cubes on the floor are worth walking to
        let cube = null, cd = 700;
        for (const c of this.cubes) {
          const d = Math.hypot(c.x - e.x, c.y - e.y);
          if (d < cd) {
            cd = d;
            cube = c;
          }
        }
        if (cube) {
          e.target = null;
          e.goal = { x: cube.x, y: cube.y };
          return;
        }
        if (bb) {
          e.target = { box: bb };
          return;
        }
      }
      e.target = best && bd < 2000 ? { ent: best } : null;
      if (!e.target && (!e.goal || Math.hypot(e.goal.x - e.x, e.goal.y - e.y) < 60)) {
        const cx = this.map.pw / 2, cy = this.map.ph / 2;
        e.goal = { x: cx + (this.rnd() - 0.5) * this.map.pw * 0.5, y: cy + (this.rnd() - 0.5) * this.map.ph * 0.5 };
        if (A.blocksMove(A.tileAt(this.map, e.goal.x, e.goal.y))) e.goal = { x: cx, y: cy };
      }
    }

    /** Direction to walk toward (x, y) around walls: a distance field from the goal tile. */
    botPathTo(e, x, y) {
      const m = this.map, W = m.w;
      const gx = Math.floor(x / A.TILE), gy = Math.floor(y / A.TILE);
      const key = gx + ',' + gy;
      if (key !== e.fieldKey || this.t - e.fieldT > 1.2 || !e.field) {
        e.fieldKey = key;
        e.fieldT = this.t;
        const f = (e.field = e.field || new Int16Array(W * m.h));
        f.fill(-1);
        const q = new Int32Array(W * m.h);
        let qh = 0, qt = 0;
        const start = gy * W + gx;
        if (start >= 0 && start < f.length) {
          f[start] = 0;
          q[qt++] = start;
        }
        while (qh < qt) {
          const i = q[qh++], tx = i % W, ty = (i / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = tx + dx, ny = ty + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= m.h) continue;
            const j = ny * W + nx;
            if (f[j] !== -1 || A.blocksMove(m.tiles[j])) continue;
            f[j] = f[i] + 1;
            q[qt++] = j;
          }
        }
      }
      const f = e.field;
      const tx = Math.floor(e.x / A.TILE), ty = Math.floor(e.y / A.TILE);
      if (tx === gx && ty === gy) return [x - e.x, y - e.y];
      let best = null, bv = f[ty * W + tx] >= 0 ? f[ty * W + tx] : 1e9;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = tx + dx, ny = ty + dy;
        const v = A.tile(m, nx, ny) === undefined ? -1 : f[ny * W + nx];
        if (v < 0 || v >= bv) continue;
        // no cutting corners through walls
        if (dx && dy && (A.blocksMove(A.tile(m, tx + dx, ty)) || A.blocksMove(A.tile(m, tx, ty + dy)))) continue;
        bv = v;
        best = [dx, dy];
      }
      if (!best) return [x - e.x, y - e.y];
      return [(tx + best[0] + 0.5) * A.TILE - e.x, (ty + best[1] + 0.5) * A.TILE - e.y];
    }

    botAttack(e, tgt, d, see, T) {
      const ch = A.CHARS[e.c];
      const a = Math.atan2(tgt.y - e.y, tgt.x - e.x);
      e.a = a;
      // super first, when it is charged and the target is in reach
      if (e.sup >= A.SUPER_FULL && T.ent) {
        const sp = ch.sup, reach = sp.range || 300;
        const ok = sp.kind === 'lob' || sp.kind === 'zone' || sp.kind === 'turret' ? d < reach + 60 : see && d < reach * 0.95;
        if (ok && (sp.kind !== 'zone' || e.hp < e.maxHp * 0.8 || d < 200)) {
          this.botFire(e, true, a + (this.rnd() - 0.5) * 0.06, Math.min(d, reach));
          return;
        }
      }
      if (e.ammo < 1 || e.cd > 0) return;
      const reach = A.reach(e.c, false);
      const lob = ch.atk.kind === 'lob';
      if ((!see && !lob) || d > reach * (lob ? 1 : 0.96) + (ch.atk.kind === 'slash' ? A.R : 0)) return;
      e.ammo--;
      e.rl = 0;
      e.cd = ch.cd + 0.15 + this.rnd() * 0.45; // bots pace their shots a little
      this.botFire(e, false, a + (this.rnd() - 0.5) * (T.box ? 0.05 : 0.3), d);
    }

    botFire(e, sup, a, d) {
      const ch = A.CHARS[e.c], spec = sup ? ch.sup : ch.atk;
      e.lastAtk = this.t;
      e.revealT = 0.8;
      if (sup) e.sup = 0;
      const mul = A.dmgMul(e.cubes);
      this.send({ t: 'as', o: e.id, c: e.c, s: sup ? 1 : 0, x: Math.round(e.x), y: Math.round(e.y), a: +a.toFixed(3), d: Math.round(d) });
      switch (spec.kind) {
        case 'slash':
          for (const o of this.ents.values()) {
            if (!o.alive || this.sameTeam(o.tm, e.tm)) continue;
            const dd = Math.hypot(o.x - e.x, o.y - e.y);
            let da = Math.abs(Math.atan2(o.y - e.y, o.x - e.x) - a);
            if (da > Math.PI) da = A.TAU - da;
            if (dd <= spec.range + A.R && da <= spec.arc / 2) this.hurt(o, spec.dmg * mul, e.id, sup);
          }
          return;
        case 'laser': {
          const len = A.ray(this.map, e.x, e.y, a, spec.range);
          const x2 = e.x + Math.cos(a) * len, y2 = e.y + Math.sin(a) * len;
          for (const o of this.ents.values())
            if (o.alive && !this.sameTeam(o.tm, e.tm) && A.segHit(e.x, e.y, x2, y2, o.x, o.y, A.R + spec.width / 2)) this.hurt(o, spec.dmg * mul, e.id, true);
          return;
        }
        case 'charge':
          e.dash = { a, t: spec.time, sp: spec.range / spec.time, hit: new Set(), mul };
          return;
        case 'leap': {
          const dd = Math.min(spec.range, d);
          const p = this.freeSpot(e, e.x + Math.cos(a) * dd, e.y + Math.sin(a) * dd);
          e.leap = { x0: e.x, y0: e.y, tx: p.x, ty: p.y, t: 0, T: spec.time, mul };
          return;
        }
        case 'turret':
          this.addTurret(e, e.x + Math.cos(a) * Math.min(d, spec.range), e.y + Math.sin(a) * Math.min(d, spec.range));
          return;
        case 'zone':
          this.addZone(e, e.x + Math.cos(a) * Math.min(d, spec.range), e.y + Math.sin(a) * Math.min(d, spec.range));
          return;
      }
      for (const p of A.projectiles({ o: e.id, tm: e.tm, c: e.c, s: sup, x: e.x, y: e.y, a, d, m: mul })) this.proj.push(p);
    }
    botDash(e, dt) {
      const D = e.dash, spec = A.CHARS[e.c].sup;
      const ox = e.x, oy = e.y;
      A.move(this.map, e, Math.cos(D.a) * D.sp * dt, Math.sin(D.a) * D.sp * dt);
      for (const o of this.ents.values()) {
        if (!o.alive || this.sameTeam(o.tm, e.tm) || D.hit.has(o.id)) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) > A.R * 2 + 6) continue;
        D.hit.add(o.id);
        this.hurt(o, spec.dmg * D.mul, e.id, true);
        this.knock(o, Math.cos(D.a) * spec.kb, Math.sin(D.a) * spec.kb);
      }
      D.t -= dt;
      if (D.t <= 0 || Math.hypot(e.x - ox, e.y - oy) < 1) e.dash = null;
    }
    botLeap(e, dt) {
      const L = e.leap, spec = A.CHARS[e.c].sup;
      L.t += dt;
      const k = Math.min(1, L.t / L.T);
      e.x = L.x0 + (L.tx - L.x0) * k;
      e.y = L.y0 + (L.ty - L.y0) * k;
      if (k < 1) return;
      e.leap = null;
      for (const o of this.ents.values())
        if (o.alive && !this.sameTeam(o.tm, e.tm) && Math.hypot(o.x - e.x, o.y - e.y) <= spec.radius + A.R) this.hurt(o, spec.dmg * L.mul, e.id, true);
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports.ArenaSim = ArenaSim;
  else root.ArenaSim = ArenaSim;
})(typeof window !== 'undefined' ? (window.GW = window.GW || {}) : {});
