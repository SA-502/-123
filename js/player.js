/* GRAVEWAVE — the player: movement, sprint/stamina, shooting input, knife, health + regen, perks, loadout */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U, C = GW.CFG, M = GW.Map, FX = GW.FX, A = GW.Audio, In = GW.Input, Wp = GW.Weapons;
  const P = (GW.Player = { perks: {}, perkOrder: [], weapons: [], cur: 0, stats: {}, alive: false, x: 0, y: 0, r: C.PLAYER.radius, angle: 0 });

  P.reset = function () {
    const PC = C.PLAYER;
    P.x = M.spawn.x;
    P.y = M.spawn.y;
    P.r = PC.radius;
    P.angle = -Math.PI / 2;
    P.vx = P.vy = 0;
    P.aimX = P.x;
    P.aimY = P.y - 120;
    P.hp = P.maxHp = PC.maxHp;
    P.sinceHurt = 99;
    P.regenerating = false;
    P.points = PC.startPoints;
    P.weapons = [Wp.create('stinger')];
    P.cur = 0;
    P.perks = {};
    P.perkOrder = [];
    P.windBought = 0;
    P.grenades = PC.grenadesStart;
    P.tactical = { type: null, count: 0 };
    P.armor = 0;
    P.sentryCarried = false;
    P.fuses = 0;
    P.stamina = P.staminaMax = PC.stamina;
    P.staminaDelay = 0;
    P.exhausted = false;
    P.sprinting = false;
    P.moving = false;
    P.meleeCd = 0;
    P.meleeT = 0;
    P.swingT = 0;
    P.swingDur = 0.24;
    P.swingSide = 1;
    P.faceT = 0;
    P.dashT = 0;
    P.dashCd = 0;
    P.dashA = 0;
    P.switchT = 0;
    P.invuln = 0;
    P.hitGrace = 0;
    P.alive = true;
    P.recoil = 0;
    P.muzzleT = 0;
    P.fireBuffer = 0;
    P.hurtFlash = 0;
    P.heartT = 0;
    P.walkT = 0;
    P.stats = { kills: 0, crits: 0, shots: 0, hits: 0, earned: 0, downs: 0, round: 0, doors: 0, time: 0 };
  };

  /* ---------------- loadout ---------------- */
  P.weapon = () => P.weapons[P.cur] || null;
  P.hasWeapon = (id) => P.weapons.findIndex((w) => w.id === id);

  P.switchTo = function (i) {
    if (i === P.cur || !P.weapons[i]) return;
    const w = P.weapon();
    if (w) w.reloadT = 0;
    P.cur = i;
    P.switchT = 0.25;
    A.play('swap');
  };

  /** Give a fresh weapon by id. Owning it already just tops up its ammo. */
  P.giveWeapon = function (id) {
    const i = P.hasWeapon(id);
    if (i >= 0) {
      const w = P.weapons[i];
      w.reserve = w.s.reserve;
      w.clip = w.s.mag;
      w.reloadT = 0;
      P.switchTo(i);
      return w;
    }
    return P.giveInstance(Wp.create(id));
  };

  /** Take a weapon instance into the free slot, or swap out the one in hand. */
  P.giveInstance = function (w) {
    const cur = P.weapon();
    if (cur) cur.reloadT = 0;
    if (P.weapons.length < 2) {
      P.weapons.push(w);
      P.cur = P.weapons.length - 1;
    } else {
      P.weapons[P.cur] = w;
    }
    P.switchT = 0.25;
    A.play('swap');
    return w;
  };

  /** Remove and return the weapon in hand (used by the Overclocker). */
  P.removeCurrent = function () {
    const w = P.weapon();
    if (!w) return null;
    w.reloadT = 0;
    P.weapons.splice(P.cur, 1);
    P.cur = Math.max(0, Math.min(P.cur, P.weapons.length - 1));
    P.switchT = 0.2;
    return w;
  };

  /* ---------------- perks ---------------- */
  P.addPerk = function (id) {
    if (P.perks[id]) return;
    P.perks[id] = true;
    P.perkOrder.push(id);
    if (id === 'thick') {
      P.maxHp = C.PLAYER.perkHp;
      P.hp = P.maxHp;
    } else if (id === 'burner') {
      P.staminaMax = C.PLAYER.stamina * 2;
      P.stamina = P.staminaMax;
      P.exhausted = false;
    } else if (id === 'wind') {
      P.windBought++;
    }
    GW.HUD.perksChanged();
  };

  P.clearPerks = function () {
    P.perks = {};
    P.perkOrder = [];
    P.maxHp = C.PLAYER.maxHp;
    P.staminaMax = C.PLAYER.stamina;
    P.stamina = Math.min(P.stamina, P.staminaMax);
    GW.HUD.perksChanged();
  };

  /* ---------------- combat ---------------- */
  P.melee = function () {
    if (!P.alive) return;
    // holding a katana or an axe: the knife button swings the blade instead
    const w = P.weapon();
    if (w && w.s.type === 'melee') {
      if (P.switchT <= 0) Wp.tryFire(P, w, true);
      return;
    }
    if (P.meleeCd > 0) return;
    const PC = C.PLAYER;
    P.meleeCd = PC.meleeCooldown;
    P.meleeT = 0.2;
    // the knife finds its own target: it turns you toward the closest zombie in reach, even behind you
    const best = Wp.meleeTargets(P, PC.meleeAssist, PC.meleeArc, 1)[0];
    if (best) {
      A.play('stab');
      const killed = GW.Zombies.damage(best, PC.meleeDamage, { melee: true, dir: P.angle });
      if (!killed) GW.Game.addPoints(C.POINTS.hit, best.x, best.y - best.r, { small: true });
      FX.hit(killed, false);
      FX.shake(3);
    } else {
      A.play('swing');
    }
  };

  /** Take damage. `melee` hits grant a brief grace window so a pile-up can't land every swing in one frame. */
  P.hurt = function (amount, melee) {
    if (!P.alive || P.invuln > 0 || GW.debug.god) return;
    if (melee) {
      if (P.hitGrace > 0) return;
      P.hitGrace = 0.4;
    }
    if (P.armor > 0) {
      const soak = Math.min(P.armor, amount * C.ARMOR.absorb);
      P.armor -= soak;
      amount -= soak;
      if (P.armor <= 0.5) {
        P.armor = 0;
        A.play('armorBreak');
        FX.burst(P.x, P.y, 14, '#4f8bff', 260);
      }
    }
    P.hp -= amount;
    P.sinceHurt = 0;
    P.hurtFlash = 1;
    FX.shake(7);
    A.play('hurt');
    if (P.hp <= 0) down();
  };

  function down() {
    P.stats.downs++;
    if (P.perks.wind) {
      // Second Wind: a shockwave throws the horde back, but every perk is burned
      P.clearPerks();
      P.hp = P.maxHp;
      P.invuln = 3;
      P.sinceHurt = 99;
      FX.ring(P.x, P.y, 320, '#35c8ff', 0.6, 8);
      FX.ring(P.x, P.y, 200, '#ffffff', 0.4, 4);
      FX.light(P.x, P.y, 600, '#35c8ff', 0.7);
      FX.burst(P.x, P.y, 40, '#35c8ff', 520);
      FX.flash = 0.6;
      FX.shake(14);
      A.play('secondWind');
      for (const z of GW.Zombies.list) {
        const d = U.dist(P.x, P.y, z.x, z.y);
        if (d > 320 || z.state === 'breach') continue;
        const a = Math.atan2(z.y - P.y, z.x - P.x);
        const f = 250 + 650 * (1 - d / 320);
        z.kx += Math.cos(a) * f;
        z.ky += Math.sin(a) * f;
        z.stun = 2.4;
        z.attackCd = 2.6;
        if (z.state === 'attack') z.state = 'chase';
      }
      GW.Game.announce('SECOND WIND', 'All perks lost — keep moving', '#35c8ff');
    } else {
      P.hp = 0;
      P.alive = false;
      if (GW.Net && GW.Net.active) GW.Net.localDown(); // co-op: spectate, back next round
      else GW.Game.gameOver();
    }
  }

  /** Slide / dash: a quick burst along the stick (or where you face). You can shoot out of it. */
  P.dash = function (ix, iy) {
    const D = C.PLAYER.dash;
    if (!P.alive || P.dashT > 0 || P.dashCd > 0 || P.stamina < D.stamina * 0.4) {
      if (P.alive && P.dashT <= 0) A.play('deny');
      return false;
    }
    P.dashA = ix || iy ? Math.atan2(iy, ix) : P.angle;
    P.dashT = D.time;
    P.dashCd = D.cooldown;
    P.stamina = Math.max(0, P.stamina - D.stamina);
    P.staminaDelay = C.PLAYER.staminaDelay;
    P.hitGrace = Math.max(P.hitGrace, D.time + 0.1); // claws miss you mid-slide
    A.play('slide');
    FX.sparks(P.x, P.y, P.dashA + Math.PI, 8, '#cdb8ea', 220, 0.5);
    return true;
  };

  /* ---------------- per-frame update ---------------- */
  P.update = function (dt) {
    if (!P.alive) return;
    if (GW.Game.modPickOpen) {
      // choosing an ammo mod at the Overclocker (co-op): shielded and standing still
      P.invuln = Math.max(P.invuln, 0.3);
      P.vx = P.vy = 0;
      return;
    }
    const PC = C.PLAYER;
    P.stats.time += dt;

    const TI = In.touch;

    // movement input: keys, or the left thumb stick (analog)
    let ix = (In.down('KeyD') || In.down('ArrowRight') ? 1 : 0) - (In.down('KeyA') || In.down('ArrowLeft') ? 1 : 0);
    let iy = (In.down('KeyS') || In.down('ArrowDown') ? 1 : 0) - (In.down('KeyW') || In.down('ArrowUp') ? 1 : 0);
    let il = Math.hypot(ix, iy), analog = 1;
    if (TI.active && il === 0 && (TI.mx || TI.my)) {
      ix = TI.mx;
      iy = TI.my;
      il = Math.hypot(ix, iy);
      analog = U.clamp((Math.min(1, il) - 0.14) / 0.7, 0.35, 1);
    }
    if (il > 0) {
      ix /= il;
      iy /= il;
    }
    P.moving = il > 0;

    // aim: the cursor, or the right thumb stick (with gentle aim assist); thumbs-off faces where you walk
    if (P.faceT > 0) P.faceT -= dt;
    if (TI.active) {
      if (TI.aiming) P.angle = GW.Touch.assist(P, Math.atan2(TI.ay, TI.ax));
      else if (TI.autoAim) {
        // tap-to-fire: lock onto the nearest zombie you can see
        const tz = GW.Touch.autoTarget(P);
        if (tz) P.angle = Math.atan2(tz.y - P.y, tz.x - P.x);
      } else if (P.moving && P.faceT <= 0) P.angle += U.angDiff(P.angle, Math.atan2(iy, ix)) * Math.min(1, dt * 12);
      P.aimX = P.x + Math.cos(P.angle) * 260;
      P.aimY = P.y + Math.sin(P.angle) * 260;
    } else {
      const mw = GW.Render.screenToWorld(In.mouse.x, In.mouse.y);
      P.aimX = mw.x;
      P.aimY = mw.y;
      if (U.dist(P.x, P.y, mw.x, mw.y) > 6 && P.faceT <= 0) P.angle = Math.atan2(mw.y - P.y, mw.x - P.x);
    }

    let w = P.weapon();
    const firing = In.mouse.down && w && w.clip > 0 && w.reloadT <= 0;
    const wantSprint = (In.down('ShiftLeft') || In.down('ShiftRight') || (TI.active && TI.sprint)) && P.moving && !firing;
    if (wantSprint && P.stamina > 0 && !P.exhausted) {
      P.sprinting = true;
      P.stamina -= dt;
      P.staminaDelay = PC.staminaDelay;
      if (P.stamina <= 0) {
        P.stamina = 0;
        P.exhausted = true;
      }
    } else {
      P.sprinting = false;
      if (P.staminaDelay > 0) P.staminaDelay -= dt;
      else P.stamina = Math.min(P.staminaMax, P.stamina + PC.staminaRegen * (P.perks.burner ? 1.6 : 1) * dt);
      if (P.exhausted && P.stamina > P.staminaMax * 0.25) P.exhausted = false;
    }

    // slide: Space / C / Ctrl, or the DASH button
    if (P.dashCd > 0) P.dashCd -= dt;
    if (In.hit('Space') || In.hit('KeyC') || In.hit('ControlLeft')) P.dash(ix, iy);

    const speed = (P.sprinting ? PC.sprintSpeed : PC.walkSpeed) * (P.perks.burner ? 1.1 : 1) * (w ? w.s.move : 1);
    if (P.dashT > 0) {
      // the slide carries you, fading out; the stick can still bend it a little
      const D = PC.dash;
      P.dashT -= dt;
      if (il > 0) P.dashA += U.angDiff(P.dashA, Math.atan2(iy, ix)) * Math.min(1, dt * 5);
      const f = D.speed * (0.4 + 0.6 * Math.max(0, P.dashT) / D.time);
      P.vx = Math.cos(P.dashA) * f;
      P.vy = Math.sin(P.dashA) * f;
      if (Math.random() < 0.5) FX.sparks(P.x, P.y, P.dashA + Math.PI, 1, '#cdb8ea', 140, 0.4);
    } else {
      const k = 1 - Math.exp(-dt * 16);
      P.vx += (ix * speed * analog - P.vx) * k;
      P.vy += (iy * speed * analog - P.vy) * k;
    }
    M.moveCircle(P, P.vx * dt, P.vy * dt, M.solidForPlayer);
    if (P.moving) P.walkT += dt * (P.sprinting ? 15 : 10);

    // zombies body-block the player (mostly the player gives way); a slide squeezes past them
    for (const z of GW.Zombies.list) {
      if (P.dashT > 0) break;
      if (z.state === 'breach' || z.dead) continue;
      const dx = P.x - z.x, dy = P.y - z.y;
      const min = P.r + z.r - 1;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-4) continue;
      const d = Math.sqrt(d2), push = min - d;
      P.x += (dx / d) * push * 0.8;
      P.y += (dy / d) * push * 0.8;
      z.x -= (dx / d) * push * 0.2;
      z.y -= (dy / d) * push * 0.2;
    }
    M.resolveCircle(P, P.r, M.solidForPlayer);

    // timers
    for (const ww of P.weapons) if (ww.cd > -1) ww.cd -= dt; // runs slightly negative: time since ready
    if (P.hitGrace > 0) P.hitGrace -= dt;
    if (P.switchT > 0) P.switchT -= dt;
    if (P.meleeCd > 0) P.meleeCd -= dt;
    if (P.meleeT > 0) P.meleeT -= dt;
    if (P.swingT > 0) P.swingT -= dt;
    if (P.muzzleT > 0) P.muzzleT -= dt;
    if (P.invuln > 0) P.invuln -= dt;
    if (P.hurtFlash > 0) P.hurtFlash = Math.max(0, P.hurtFlash - dt * 2.2);
    P.recoil = Math.max(0, P.recoil - dt * 9);

    // weapon swap
    if (P.weapons.length > 1 && (In.hit('KeyQ') || In.wheel !== 0)) P.switchTo((P.cur + 1) % P.weapons.length);
    if (In.hit('Digit1')) P.switchTo(0);
    if (In.hit('Digit2')) P.switchTo(1);
    w = P.weapon();

    // reload
    if (w && w.reloadT > 0) {
      w.reloadT -= dt;
      if (w.reloadT <= 0) Wp.finishReload(w);
    }
    if (In.hit('KeyR')) Wp.startReload(w, P);
    if (w && w.clip <= 0 && w.reserve > 0 && w.reloadT <= 0 && w.cd <= 0) Wp.startReload(w, P);

    // fire (with a small press buffer so semi-auto clicks are never swallowed)
    if (In.mouse.pressed) P.fireBuffer = 0.14;
    else if (P.fireBuffer > 0) P.fireBuffer -= dt;
    if (In.mouse.down || P.fireBuffer > 0) {
      if (!w) {
        if (In.mouse.pressed) P.melee();
      } else if (P.switchT <= 0 && P.meleeT <= 0) {
        const fired = Wp.tryFire(P, w, P.fireBuffer > 0);
        if (fired || w.clip <= 0) P.fireBuffer = 0;
      }
    }

    // touch grenades land where the button was dragged to (or on the nearest crowd)
    const ta = TI.active && TI.throwAt;
    if (In.hit('KeyG')) Wp.throwGrenade(P, ta ? ta.x : P.aimX, ta ? ta.y : P.aimY);
    if (In.hit('KeyT')) GW.Gadgets.throwTactical(P, ta ? ta.x : undefined, ta ? ta.y : undefined);
    if (In.hit('KeyG') || In.hit('KeyT')) TI.throwAt = null;
    if (In.hit('KeyX')) GW.Allies.deploySentry(P);
    if (In.hit('KeyV') || In.mouse.rpressed) P.melee();

    // health regeneration
    P.sinceHurt += dt;
    if (P.hp < P.maxHp && P.sinceHurt > PC.regenDelay) {
      P.hp = Math.min(P.maxHp, P.hp + PC.regenRate * (P.maxHp / 100) * dt);
      P.regenerating = true;
    } else P.regenerating = false;

    // heartbeat when badly hurt
    if (P.hp / P.maxHp < 0.45) {
      P.heartT -= dt;
      if (P.heartT <= 0) {
        A.play('heartbeat');
        P.heartT = 0.85;
      }
    } else P.heartT = 0;

    A.listener.x = P.x;
    A.listener.y = P.y;
  };
})();
