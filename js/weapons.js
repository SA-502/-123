/* GRAVEWAVE — weapon instances, hitscan / projectile / chain-lightning fire modes, explosions, grenades */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio;
  const Wp = (GW.Weapons = { projectiles: [], grenades: [] });
  const PLASMA_SPEED = 950;

  Wp.reset = function () {
    Wp.projectiles = [];
    Wp.grenades = [];
  };

  /** New weapon instance with a full magazine and reserve. */
  Wp.create = function (id) {
    const def = GW.WEAPONS[id];
    return { id, def, up: false, tier: 0, mod: null, s: def, clip: def.mag, reserve: def.reserve, cd: 0, reloadT: 0, reloadDur: 0 };
  };

  /**
   * Stats of a weapon at an Overclocker tier (1..3): the `up` overrides, then the tier's damage
   * multiplier (per weapon: `up.tiers`, else CFG.TIER.dmg), more magazine, a little more fire rate,
   * a bigger share of max health for blades and flames, longer chains for the Arc Caster.
   */
  Wp.tierStats = function (def, tier) {
    const TR = C.TIER, i = tier - 1;
    const s = Object.assign({}, def, def.up);
    delete s.up;
    const m = (s.tiers || TR.dmg)[i];
    s.dmg = Math.round(s.dmg * m);
    if (s.splash) s.splash = Math.round(s.splash * m);
    if (s.mag > 1) s.mag = Math.round(s.mag * TR.mag[i]);
    s.reserve = Math.round(s.reserve * TR.mag[i]);
    s.rpm = Math.round(s.rpm * TR.rpm[i]);
    if (s.chain) s.chain += i * 2;
    if (s.frac) s.frac = s.type === 'melee' ? Math.min(0.9, s.frac + TR.frac[i]) : s.frac * (1 + 0.25 * i);
    if (s.burn) s.burn *= 1 + 0.25 * i;
    s.name += TR.suffix[i];
    s.tier = tier;
    return s;
  };

  /** Apply the Overclocker upgrade: merged stats, new name, full ammo. */
  Wp.upgrade = function (w) {
    w.tier = Math.min(3, (w.tier || 0) + 1);
    const s = Wp.tierStats(w.def, w.tier);
    s.mod = w.mod;
    w.up = true;
    w.s = s;
    w.clip = s.mag;
    w.reserve = s.reserve;
    w.reloadT = 0;
    w.cd = 0;
  };

  Wp.startReload = function (w, player) {
    if (!w || w.reloadT > 0 || w.clip >= w.s.mag || w.reserve <= 0) return false;
    w.reloadDur = w.s.reload * (player.perks.quick ? 0.5 : 1);
    w.reloadT = w.reloadDur;
    // Quick Hands: green sparks at the hands, so the faster reload reads as the perk
    if (player.perks.quick && player.x !== undefined) FX.burst(player.x + Math.cos(player.angle) * 12, player.y + Math.sin(player.angle) * 12, 6, '#3dff8b', 150);
    A.play('reloadStart');
    return true;
  };

  Wp.finishReload = function (w) {
    const take = Math.min(w.s.mag - w.clip, w.reserve);
    w.clip += take;
    w.reserve -= take;
    w.reloadT = 0;
    A.play('reloadEnd');
  };

  /**
   * Attempt to fire. `pressed` is true on a fresh (or buffered) trigger pull, which semi-autos require.
   * Returns true when a shot actually left the barrel.
   */
  Wp.tryFire = function (p, w, pressed) {
    if (!w || w.reloadT > 0 || w.cd > 0) return false;
    // semi-autos fire per click; holding the trigger still works, just at a slower cadence
    if (!w.s.auto && !pressed && w.cd > -(60 / w.s.rpm) * 0.7) return false;
    if (w.clip <= 0) {
      if (w.reserve > 0) Wp.startReload(w, p);
      else if (pressed) A.play('empty');
      return false;
    }
    fire(p, w);
    return true;
  };

  function fire(p, w) {
    const s = w.s;
    if (s.type === 'melee') return swingFire(p, w);
    if (s.type === 'flame') return flameFire(p, w);
    w.clip--;
    w.cd = (60 / s.rpm) * (p.perks.twin ? 0.75 : 1);
    p.stats.shots++;
    const a = p.angle, ca = Math.cos(a), sa = Math.sin(a);

    // muzzle position, pulled back if the barrel would poke through a wall
    let ml = p.r + s.len;
    const free = M.raycast(p.x, p.y, ca, sa, ml + 2, M.blocksBullet);
    if (free < ml + 2) ml = Math.max(0, free - 2);
    const mx = p.x + ca * ml, my = p.y + sa * ml;

    const shot = { hits: new Set(), hitAny: false, killAny: false, crit: false };
    const spread = s.spread * (p.moving ? 1.35 : 1);

    if (s.type === 'plasma') {
      const ang = a + U.rand(-spread, spread);
      Wp.projectiles.push({
        x: mx, y: my, vx: Math.cos(ang) * (s.speed || PLASMA_SPEED), vy: Math.sin(ang) * (s.speed || PLASMA_SPEED),
        life: s.range / (s.speed || PLASMA_SPEED), s, color: s.color, trail: 0,
      });
    } else if (s.type === 'arc') {
      arcFire(p, s, mx, my, ca, sa, shot);
    } else {
      for (let i = 0; i < s.pellets; i++) Wp.traceShot(p.x, p.y, a + U.rand(-spread, spread), s, shot, mx, my, w.up ? 'laser' : 'plain', 'player');
    }

    const flashCol = w.up || s.cls === 'energy' ? s.color : '#ffd68a';
    const tier = w.tier || 0;
    FX.light(mx, my, (s.pellets > 1 ? 210 : 150) * (1 + 0.28 * tier), flashCol, 0.07 + 0.015 * tier);
    FX.sparks(mx, my, a, (s.pellets > 1 ? 7 : 3) + tier * 2, flashCol, 320 + 50 * tier, 0.35 + 0.05 * tier);
    if (tier) FX.muzzle(mx, my, a, flashCol, tier, s.mod ? GW.MODS[s.mod].color : null);
    if (p.perks.twin && Math.random() < 0.5) FX.sparks(mx, my, a, 1, '#ff7a1a', 380, 0.25); // Twin Trigger
    if (s.cls !== 'energy') FX.casing(p.x + ca * 8, p.y + sa * 8, a);
    FX.shake(s.kick * 0.55);
    p.recoil = 1;
    p.muzzleT = 0.05;
    A.play(s.type === 'arc' ? 'arc' : 'shot', { cls: s.cls, up: w.up });
    if (shot.hitAny) {
      p.stats.hits++;
      FX.hit(shot.killAny, shot.crit);
      if (shot.crit) A.play('crit');
    }
  }

  /* ---------------- blades: the knife, the katana and the axe ---------------- */

  /**
   * Who a swing hits. The swing turns the player toward the closest zombie in reach — even one
   * behind them — so you can run and still cut down whatever is chasing you. Then every zombie
   * inside the arc around that new heading is hit, nearest first, up to `max`.
   */
  Wp.meleeTargets = function (p, reach, arc, max) {
    let best = null, bs = Infinity;
    for (const z of GW.Zombies.list) {
      if (z.dead || z.state === 'rise') continue;
      const d = U.dist(p.x, p.y, z.x, z.y) - z.r;
      if (d > reach) continue;
      if (!M.los(p.x, p.y, z.x, z.y, M.blocksBullet)) continue;
      // prefer what is in front, but anything in reach will do
      const score = d + Math.abs(U.angDiff(p.angle, Math.atan2(z.y - p.y, z.x - p.x))) * 14;
      if (score < bs) {
        bs = score;
        best = z;
      }
    }
    if (!best) return [];
    p.angle = Math.atan2(best.y - p.y, best.x - p.x);
    p.faceT = 0.3; // hold the new heading for a moment so the swing reads
    const out = [best];
    if (max > 1) {
      const more = [];
      for (const z of GW.Zombies.list) {
        if (z === best || z.dead || z.state === 'rise') continue;
        const d = U.dist(p.x, p.y, z.x, z.y) - z.r;
        if (d > reach) continue;
        if (d > 8 && Math.abs(U.angDiff(p.angle, Math.atan2(z.y - p.y, z.x - p.x))) > arc) continue;
        if (!M.los(p.x, p.y, z.x, z.y, M.blocksBullet)) continue;
        more.push({ z, d });
      }
      more.sort((a, b) => a.d - b.d);
      for (let i = 0; i < more.length && out.length < max; i++) out.push(more[i].z);
    }
    return out;
  };

  /** Blade damage: a flat amount plus a share of the zombie's max health, so blades stay useful in late rounds. */
  Wp.bladeDamage = function (z, dmg, frac) {
    if (!frac || z.type === 'boss') return dmg;
    return dmg + z.maxHp * frac * (z.type === 'brute' ? 0.15 : 1);
  };

  function swingFire(p, w) {
    const s = w.s;
    w.cd = (60 / s.rpm) * (p.perks.twin ? 0.8 : 1);
    p.stats.shots++;
    p.swingT = p.swingDur = 0.24;
    p.swingSide = -(p.swingSide || 1); // alternate forehand / backhand
    const hits = Wp.meleeTargets(p, s.reach, s.arc, s.cleave);
    const a = p.angle;
    FX.slash(p.x, p.y, a, s.reach + p.r, s.color, p.swingSide);
    A.play('slash', { heavy: s.cls === 'axe' });
    if (!hits.length) return;
    let kill = false;
    for (const z of hits) {
      const dir = Math.atan2(z.y - p.y, z.x - p.x);
      const dmg = Wp.bladeDamage(z, s.dmg, s.frac);
      const killed = GW.Zombies.damage(z, dmg, { melee: true, dir });
      if (killed) kill = true;
      if (s.mod) Wp.applyMod(z, s, dir); // the flat blade damage: the %-of-health part stays on this zombie
      FX.sparks(z.x, z.y, dir, 5 + (s.tier || 0) * 2, s.color, 260);
    }
    p.stats.hits++;
    FX.hit(kill, false);
    FX.shake(s.kick);
    A.play('stab');
  }

  /* ---------------- flamethrower ---------------- */
  function flameFire(p, w) {
    const s = w.s;
    w.clip--;
    w.cd = (60 / s.rpm) * (p.perks.twin ? 0.75 : 1);
    p.stats.shots++;
    const a = p.angle, ca = Math.cos(a), sa = Math.sin(a);
    const ml = p.r + s.len;
    const mx = p.x + ca * ml, my = p.y + sa * ml;
    // the flames stop at the first wall
    const reach = Math.min(s.range, M.raycast(p.x, p.y, ca, sa, s.range, M.blocksBullet) + 10);
    let any = false, kill = false, n = 0;
    for (const z of GW.Zombies.list.slice()) {
      if (z.dead || z.state === 'rise' || n >= 10) continue;
      const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy) - z.r;
      if (d > reach) continue;
      const diff = Math.abs(U.angDiff(a, Math.atan2(dy, dx)));
      if (d > 10 && diff > s.spread + Math.atan2(z.r, Math.max(1, d))) continue;
      if (!M.los(p.x, p.y, z.x, z.y, M.blocksBullet)) continue;
      n++;
      const big = z.type === 'brute' || z.type === 'boss';
      const dmg = s.dmg + (big ? 0 : z.maxHp * s.frac);
      if (!z.dead && !big) {
        // set them alight: the burn keeps working after the flames pass
        z.burnT = Math.max(z.burnT || 0, 2.5);
        z.burnDps = Math.max(z.burnDps || 0, z.maxHp * s.burn);
        if (!(z.burnTick > 0)) z.burnTick = 0.25;
      }
      const killed = GW.Zombies.damage(z, dmg, { burn: true, dir: a });
      any = true;
      if (killed) kill = true;
      // a flame tick touches many zombies ten times a second: its mod procs far less often per tick
      if (s.mod && Math.random() < 0.25) Wp.applyMod(z, s, a);
    }
    FX.flame(mx, my, a, reach, s.spread, w.up ? s.color : null);
    FX.light(mx + ca * reach * 0.5, my + sa * reach * 0.5, reach * 1.2, w.up ? s.color : '#ff8a2a', 0.08);
    p.muzzleT = 0.05;
    A.play('flame');
    if (any) {
      p.stats.hits++;
      FX.hit(kill, false);
    }
  }
  Wp.flameFx = function (x, y, a, s, up) {
    FX.flame(x, y, a, s.range, s.spread, up ? s.color : null);
  };

  /** Set the ammo mod on an overclocked weapon. */
  Wp.setMod = function (w, mod) {
    w.mod = mod;
    if (w.s !== w.def) w.s.mod = mod;
    if (GW.Player && GW.Player.alive) Wp.celebrate(GW.Player, w);
  };

  /** The moment a freshly overclocked weapon comes out of the machine: rings, light, its name, its mod. */
  Wp.celebrate = function (p, w) {
    const s = w.s, tier = w.tier || 1;
    const modCol = w.mod ? GW.MODS[w.mod].color : '#ffffff';
    FX.ring(p.x, p.y, 70 + 40 * tier, s.color, 0.55, 5 + tier);
    FX.ring(p.x, p.y, 40 + 25 * tier, modCol, 0.45, 3);
    FX.light(p.x, p.y, 320 + 80 * tier, s.color, 0.6);
    FX.burst(p.x, p.y, 18 + tier * 8, s.color, 380);
    FX.burst(p.x, p.y, 12, modCol, 260);
    for (let i = 0; i < 6 + tier * 2; i++) {
      const a = (i / (6 + tier * 2)) * U.TAU;
      FX.tracer(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, p.x + Math.cos(a) * (70 + 30 * tier), p.y + Math.sin(a) * (70 + 30 * tier), i % 2 ? modCol : s.color, 2 + tier, 0.35, true);
    }
    FX.flash = Math.max(FX.flash || 0, 0.25 + 0.08 * tier);
    FX.shake(5 + tier * 2);
    FX.popup(p.x, p.y - 46, s.name, s.color, 18 + tier * 2, 1.8);
    if (w.mod) FX.popup(p.x, p.y - 24, GW.MODS[w.mod].name.toUpperCase(), modCol, 14, 1.8);
  };

  /** Chance for one projectile to trigger its ammo mod: slow guns proc often, bullet hoses rarely. */
  function modChance(s) {
    const MC = C.MOD;
    return U.clamp(MC.procBase / s.rpm, MC.procMin, MC.procMax) / Math.sqrt(s.pellets || 1);
  }
  Wp.modChance = modChance;

  /** A share of a normal zombie's health this round: keeps mod damage useful on low-damage guns. */
  function roundHp(f) {
    return GW.Rounds.health(Math.max(1, GW.Director.round || 1)) * f;
  }

  /**
   * Roll and apply an ammo mod on a zombie that was just hit (and survived, or not).
   * dmg: the damage of the hit that carried it (defaults to the weapon's damage).
   * Status fields it sets on zombies: burnT / burnDps / burnTick (Inferno), shockT + dazeT (Arc),
   * frost (stacks) / slowT / freezeT (Frost), blastT (Blast).
   */
  Wp.applyMod = function (z, s, ang, dmg) {
    if (!s.mod || Math.random() > modChance(s)) return false;
    const MC = C.MOD, Zs = GW.Zombies;
    const big = z.type === 'brute' || z.type === 'boss';
    const hit = dmg || s.dmg;
    if (s.mod === 'fire') {
      if (z.dead) return false;
      z.burnT = MC.burnTime;
      z.burnDps = Math.max(z.burnDps && z.burnT > 0 ? z.burnDps : 0, z.maxHp * (big ? MC.burnFracBig : MC.burnFrac));
      z.burnTick = 0.25;
      FX.flame(z.x, z.y + 6, -Math.PI / 2, 46, 0.7, null);
      FX.burst(z.x, z.y, 10, '#ff7a1a', 220);
      FX.light(z.x, z.y, 110, '#ff7a1a', 0.25);
      A.play('modFire', { x: z.x, y: z.y });
    } else if (s.mod === 'shock') {
      const chain = [z];
      let px = z.x, py = z.y;
      for (let j = 0; j < MC.shockJumps; j++) {
        let nxt = null, bd = MC.shockRange;
        for (const o of Zs.list) {
          if (o.dead || chain.indexOf(o) >= 0) continue;
          const d = U.dist(px, py, o.x, o.y);
          if (d < bd && M.los(px, py, o.x, o.y, M.blocksBullet)) {
            bd = d;
            nxt = o;
          }
        }
        if (!nxt) break;
        FX.bolt(px, py, nxt.x, nxt.y, '#8fd8ff', 0.28, 4);
        FX.bolt(px, py, nxt.x, nxt.y, '#ffffff', 0.16, 1.6);
        FX.burst(nxt.x, nxt.y, 6, '#bfe9ff', 220);
        chain.push(nxt);
        px = nxt.x;
        py = nxt.y;
      }
      FX.burst(z.x, z.y, 8, '#8fd8ff', 260);
      FX.light(z.x, z.y, 140, '#8fd8ff', 0.22);
      if (!z.dead) z.shockT = 0.6;
      const zap = Math.max(hit * MC.shockMult, roundHp(MC.shockFloor));
      for (let j = 1; j < chain.length; j++) {
        const o = chain[j];
        o.shockT = 0.6;
        if (o.type !== 'boss') o.dazeT = Math.max(o.dazeT || 0, MC.shockDaze);
        Zs.damage(o, zap, { shock: true, dir: Math.atan2(o.y - z.y, o.x - z.x) });
      }
      A.play('modShock', { x: z.x, y: z.y });
    } else if (s.mod === 'frost') {
      if (z.dead || big) return false;
      z.frost = (z.frost || 0) + 1;
      z.slowT = Math.max(z.slowT || 0, MC.frostSlow);
      FX.sparks(z.x, z.y, (ang || 0) + Math.PI, 7, '#bff4ff', 200, 1.4);
      FX.ring(z.x, z.y, 22, '#8fe9ff', 0.2, 2);
      if (z.frost >= MC.frostStacks) {
        z.frost = 0;
        z.freezeT = Math.max(z.freezeT || 0, MC.frostFreeze);
        if (z.state === 'attack') z.state = 'chase';
        FX.ring(z.x, z.y, 52, '#8fe9ff', 0.4, 4);
        FX.ring(z.x, z.y, 30, '#ffffff', 0.25, 2);
        FX.burst(z.x, z.y, 18, '#bff4ff', 280);
        FX.light(z.x, z.y, 150, '#8fe9ff', 0.35);
        A.play('modFrost', { x: z.x, y: z.y });
      }
    } else if (s.mod === 'blast') {
      const bx = z.x, by = z.y;
      FX.ring(bx, by, MC.blastR, '#ffd426', 0.3, 5);
      FX.ring(bx, by, MC.blastR * 0.55, '#ffffff', 0.18, 3);
      FX.burst(bx, by, 16, '#ffd426', 320);
      FX.smoke(bx, by, 3);
      FX.light(bx, by, MC.blastR * 2.6, '#ffd426', 0.2);
      FX.shake(2.5);
      A.play('modBlast', { x: bx, y: by });
      const boom = Math.max(hit * MC.blastMult, roundHp(MC.blastFloor));
      for (const o of Zs.list.slice()) {
        if (o.dead) continue;
        const d = U.dist(bx, by, o.x, o.y) - o.r;
        if (d > MC.blastR) continue;
        o.blastT = 0.3;
        Zs.damage(o, boom * (1 - (0.5 * Math.max(0, d)) / MC.blastR), { explosive: true, dir: Math.atan2(o.y - by, o.x - bx) });
      }
    }
    return true;
  };

  /** Floating damage number: crits always, big hits sometimes (throttled per zombie). */
  Wp.damageText = function (z, dmg, crit) {
    if (!(dmg >= 1) || z.dmgTxtT > (crit ? 0.08 : 0)) return;
    if (!crit && dmg < z.maxHp * 0.3) return;
    z.dmgTxtT = 0.2;
    FX.popup(z.x + U.rand(-10, 10), z.y - z.r - 10, String(Math.round(dmg)), crit ? '#ff7a8a' : '#ffffff', crit ? 13 : 11, 0.6);
  };

  /**
   * Instant bullet from (ox,oy): walls stop it, zombies are hit in order with limited penetration.
   * look: 'plain' | 'laser' | a colour for ally tracers. owner: 'player' (earns hit points) | 'ally'.
   */
  Wp.traceShot = function (ox, oy, ang, s, shot, mx, my, look, owner) {
    const upgraded = look === 'laser';
    const ally = owner === 'ally';
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const wallD = M.raycast(ox, oy, dx, dy, s.range, M.blocksBullet);
    const hits = [];
    const zs = GW.Zombies.list;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (z.dead) continue;
      const rx = z.x - ox, ry = z.y - oy;
      const t = rx * dx + ry * dy;
      if (t < -z.r || t > wallD + z.r) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      const hr = z.r + 2;
      if (perp > hr) continue;
      const th = t - Math.sqrt(hr * hr - perp * perp);
      if (th > wallD) continue;
      hits.push({ z, t: Math.max(0, th), perp });
    }
    hits.sort((a, b) => a.t - b.t);

    let endD = wallD, dmg = s.dmg, count = 0;
    for (const h of hits) {
      if (count >= s.pierce) break;
      const z = h.z;
      const crit = h.perp < z.r * 0.38;
      let d = dmg * (crit ? s.crit : 1);
      if (s.pellets > 1) {
        const f = h.t / s.range;
        if (f > 0.55) d *= U.lerp(1, 0.35, (f - 0.55) / 0.45);
      }
      const hp0 = z.hp;
      const killed = GW.Zombies.damage(z, d, { crit: crit && !ally, critMult: s.crit, dir: ang, ally, weapon: s, hitT: h.t });
      shot.hitAny = true;
      if (crit) shot.crit = true;
      if (!ally) {
        if (s.mod && !shot.hits.has(z.id)) Wp.applyMod(z, s, ang, d);
        if (crit || s.pellets === 1) Wp.damageText(z, Math.min(d, hp0 > 0 ? hp0 : d), crit);
      }
      shot.hits.add(z.id);
      if (killed) shot.killAny = true;
      count++;
      dmg *= 0.8;
      if (count >= s.pierce) endD = h.t;
    }

    const ex = ox + dx * endD, ey = oy + dy * endD;
    if (upgraded) {
      // thicker, longer-lived beams per tier; tier II+ adds a mod-coloured side beam, tier III a second one
      const tier = s.tier || 1, tk = 1 + 0.45 * (tier - 1), pel = s.pellets > 1;
      FX.tracer(mx, my, ex, ey, s.color, (pel ? 2.2 : 3.2) * tk, 0.11 + 0.03 * tier, true);
      if (!pel || Math.random() < 0.35) {
        const ox2 = -dy * (2 + tier), oy2 = dx * (2 + tier);
        const side = s.mod ? GW.MODS[s.mod].color : s.color;
        if (tier >= 2 || s.mod) FX.tracer(mx + ox2, my + oy2, ex + ox2, ey + oy2, side, 1.2 * tk, 0.15, true);
        if (tier >= 3) FX.tracer(mx - ox2, my - oy2, ex - ox2, ey - oy2, side, 1.2 * tk, 0.15, true);
      }
      if (count) FX.sparks(ex, ey, ang + Math.PI, 1 + tier, s.color, 240, 0.8);
    } else if (look && look[0] === '#') FX.tracer(mx, my, ex, ey, look, 1.8, 0.09, true);
    else FX.tracer(mx, my, ex, ey, '#ffe7a3', s.pellets > 1 ? 1 : 1.5, 0.07, false);
    if (endD === wallD && wallD < s.range - 0.5) FX.sparks(ex, ey, ang + Math.PI, ally ? 2 : 4, upgraded ? s.color : look && look[0] === '#' ? look : '#ffd68a', 200);
  };

  /** Chain lightning: strikes the first zombie in the beam, then leaps between neighbours. */
  function arcFire(p, s, mx, my, dx, dy, shot) {
    const wallD = M.raycast(p.x, p.y, dx, dy, s.range, M.blocksBullet);
    const zs = GW.Zombies.list;
    let first = null, bestT = Infinity;
    for (const z of zs) {
      if (z.dead) continue;
      const rx = z.x - p.x, ry = z.y - p.y;
      const t = rx * dx + ry * dy;
      if (t < 0 || t > wallD + z.r) continue;
      if (Math.abs(rx * dy - ry * dx) > z.r + 18) continue;
      if (t < bestT) {
        bestT = t;
        first = z;
      }
    }
    if (!first) {
      const ex = p.x + dx * wallD, ey = p.y + dy * wallD;
      FX.bolt(mx, my, ex, ey, s.color, 0.2, 3);
      FX.burst(ex, ey, 10, s.color, 260);
      FX.light(ex, ey, 160, s.color, 0.2);
      return;
    }
    const chain = [];
    let cur = first, px = mx, py = my;
    while (cur && chain.length < s.chain) {
      FX.bolt(px, py, cur.x, cur.y, s.color, 0.3, 3.5);
      FX.bolt(px, py, cur.x, cur.y, '#ffffff', 0.16, 1.5);
      FX.light(cur.x, cur.y, 170, s.color, 0.3);
      FX.burst(cur.x, cur.y, 8, s.color, 240);
      chain.push(cur);
      px = cur.x;
      py = cur.y;
      let nxt = null, bd = 250;
      for (const z of zs) {
        if (z.dead || chain.indexOf(z) >= 0) continue;
        const d = U.dist(px, py, z.x, z.y);
        if (d < bd && M.los(px, py, z.x, z.y, M.blocksBullet)) {
          bd = d;
          nxt = z;
        }
      }
      cur = nxt;
    }
    for (const z of chain) {
      const dmg = z.type === 'boss' ? z.maxHp * 0.03 : z.type === 'brute' ? Math.max(3500, z.maxHp * 0.5) : z.maxHp * 3;
      const killed = GW.Zombies.damage(z, dmg, { dir: Math.atan2(z.y - p.y, z.x - p.x), shock: true });
      shot.hitAny = true;
      if (killed) shot.killAny = true;
      else if (s.mod) Wp.applyMod(z, s, Math.atan2(z.y - p.y, z.x - p.x), dmg);
    }
  }

  /**
   * Radial damage with linear falloff and line-of-sight.
   * opts: { color, sound, skip (zombie already hit directly), hurtPlayer (max self damage) }
   */
  Wp.explode = function (x, y, r, dmgMax, dmgMin, opts) {
    opts = opts || {};
    FX.explosion(x, y, r, opts.color || '#ffb14d');
    A.play(opts.sound || 'explosion', { x, y });
    const Zs = GW.Zombies;
    let any = false, kill = false;
    for (const z of Zs.list.slice()) {
      if (z.dead || z === opts.skip) continue;
      const d = Math.max(0, U.dist(x, y, z.x, z.y) - z.r);
      if (d > r) continue;
      if (!M.los(x, y, z.x, z.y, M.blocksBullet)) continue;
      const f = 1 - d / r;
      const ang = Math.atan2(z.y - y, z.x - x);
      z.kx += Math.cos(ang) * 280 * f;
      z.ky += Math.sin(ang) * 280 * f;
      const killed = Zs.damage(z, U.lerp(dmgMin, dmgMax, f), { explosive: true, dir: ang, ally: opts.ally });
      any = true;
      if (killed) kill = true;
    }
    if (opts.hurtPlayer) {
      const P = GW.Player;
      const pr = r * 0.7;
      const d = U.dist(x, y, P.x, P.y);
      if (d < pr && M.los(x, y, P.x, P.y, M.blocksBullet)) P.hurt(U.lerp(10, opts.hurtPlayer, 1 - d / pr));
    }
    if (any) FX.hit(kill, false);
    return any;
  };

  Wp.throwGrenade = function (p, tx, ty) {
    if (p.grenades <= 0) return false;
    p.grenades--;
    Wp.launch(p, tx, ty, 'frag', 1.6);
    return true;
  };

  /** Throw any grenade kind toward (tx,ty). Frags explode; tactical kinds hand over to Gadgets on landing. */
  Wp.launch = function (p, tx, ty, kind, fuse) {
    // thrown at the target spot, not just the way you happen to be facing
    const ta = U.dist(p.x, p.y, tx, ty) > 4 ? Math.atan2(ty - p.y, tx - p.x) : p.angle;
    const ca = Math.cos(ta), sa = Math.sin(ta);
    const d = U.clamp(U.dist(p.x, p.y, tx, ty), 130, 540);
    const sp = (d * 2.2) / (1 - Math.exp(-2.2 * fuse)); // slows to a stop right on the spot when the fuse runs out
    let gx = p.x + ca * 16, gy = p.y + sa * 16;
    if (M.blocksGrenade(Math.floor(gx / C.TILE), Math.floor(gy / C.TILE))) {
      gx = p.x;
      gy = p.y;
    }
    Wp.grenades.push({ x: gx, y: gy, vx: ca * sp, vy: sa * sp, fuse, spin: 0, kind });
    A.play('throw');
  };

  Wp.update = function (dt) {
    const T = C.TILE;
    const Zs = GW.Zombies;

    // plasma bolts
    for (let i = Wp.projectiles.length - 1; i >= 0; i--) {
      const pr = Wp.projectiles[i];
      const speed = Math.hypot(pr.vx, pr.vy);
      const ux = pr.vx / speed, uy = pr.vy / speed;
      let remaining = speed * dt;
      let boom = false, direct = null;
      pr.life -= dt;
      while (remaining > 0 && !boom) {
        const step = Math.min(8, remaining);
        remaining -= step;
        const nx = pr.x + ux * step, ny = pr.y + uy * step;
        if (M.blocksBullet(Math.floor(nx / T), Math.floor(ny / T))) {
          boom = true;
          break;
        }
        pr.x = nx;
        pr.y = ny;
        for (const z of Zs.list) {
          if (z.dead) continue;
          const rr = z.r + 5;
          const ddx = z.x - pr.x, ddy = z.y - pr.y;
          if (ddx * ddx + ddy * ddy < rr * rr) {
            direct = z;
            boom = true;
            break;
          }
        }
      }
      pr.trail -= dt;
      if (pr.trail <= 0) {
        pr.trail = 0.016;
        FX.sparks(pr.x, pr.y, Math.atan2(-uy, -ux), 1, pr.color, 90, 0.5);
      }
      if (boom || pr.life <= 0) {
        Wp.projectiles.splice(i, 1);
        const s = pr.s;
        if (direct) {
          const hp0 = direct.hp;
          const killed = Zs.damage(direct, s.dmg, { dir: Math.atan2(uy, ux) });
          if (s.mod) Wp.applyMod(direct, s, Math.atan2(uy, ux));
          Wp.damageText(direct, Math.min(s.dmg, hp0), false);
          FX.hit(killed, false);
        }
        Wp.explode(pr.x, pr.y, s.splashR, s.splash, s.splash * 0.4, { color: pr.color, skip: direct, sound: 'plasmaHit' });
      }
    }

    // grenades: slide, bounce, then detonate
    for (let i = Wp.grenades.length - 1; i >= 0; i--) {
      const g = Wp.grenades[i];
      const k = Math.exp(-2.2 * dt);
      g.vx *= k;
      g.vy *= k;
      g.spin += dt * 14;
      const sub = 3;
      for (let s = 0; s < sub; s++) {
        const nx = g.x + (g.vx * dt) / sub;
        if (M.blocksGrenade(Math.floor(nx / T), Math.floor(g.y / T))) {
          g.vx = -g.vx * 0.45;
          A.play('bounce', { x: g.x, y: g.y });
        } else g.x = nx;
        const ny = g.y + (g.vy * dt) / sub;
        if (M.blocksGrenade(Math.floor(g.x / T), Math.floor(ny / T))) {
          g.vy = -g.vy * 0.45;
          A.play('bounce', { x: g.x, y: g.y });
        } else g.y = ny;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        Wp.grenades.splice(i, 1);
        if (g.kind !== 'frag') {
          GW.Gadgets.land(g);
          continue;
        }
        const dmg = Math.max(350, GW.Rounds.health(GW.Director.round || 1) * 0.9);
        Wp.explode(g.x, g.y, 165, dmg, dmg * 0.25, { color: '#ffb14d', hurtPlayer: 70 });
      }
    }
  };
})();
