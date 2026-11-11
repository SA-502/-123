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
    P.stamina = P.staminaMax = PC.stamina;
    P.staminaDelay = 0;
    P.exhausted = false;
    P.sprinting = false;
    P.moving = false;
    P.meleeCd = 0;
    P.meleeT = 0;
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
    if (P.meleeCd > 0 || !P.alive) return;
    const PC = C.PLAYER;
    P.meleeCd = PC.meleeCooldown;
    P.meleeT = 0.2;
    let best = null, bd = Infinity;
    for (const z of GW.Zombies.list) {
      if (z.dead) continue;
      const d = U.dist(P.x, P.y, z.x, z.y) - z.r;
      if (d > PC.meleeRange) continue;
      const a = Math.atan2(z.y - P.y, z.x - P.x);
      if (d > 10 && Math.abs(U.angDiff(P.angle, a)) > PC.meleeArc) continue;
      if (!M.los(P.x, P.y, z.x, z.y, M.blocksBullet)) continue;
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
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
      GW.Game.gameOver();
    }
  }

  /* ---------------- per-frame update ---------------- */
  P.update = function (dt) {
    if (!P.alive) return;
    const PC = C.PLAYER;
    P.stats.time += dt;

    // aim at the cursor
    const mw = GW.Render.screenToWorld(In.mouse.x, In.mouse.y);
    P.aimX = mw.x;
    P.aimY = mw.y;
    if (U.dist(P.x, P.y, mw.x, mw.y) > 6) P.angle = Math.atan2(mw.y - P.y, mw.x - P.x);

    // movement input
    let ix = (In.down('KeyD') || In.down('ArrowRight') ? 1 : 0) - (In.down('KeyA') || In.down('ArrowLeft') ? 1 : 0);
    let iy = (In.down('KeyS') || In.down('ArrowDown') ? 1 : 0) - (In.down('KeyW') || In.down('ArrowUp') ? 1 : 0);
    const il = Math.hypot(ix, iy);
    if (il > 0) {
      ix /= il;
      iy /= il;
    }
    P.moving = il > 0;

    let w = P.weapon();
    const firing = In.mouse.down && w && w.clip > 0 && w.reloadT <= 0;
    const wantSprint = (In.down('ShiftLeft') || In.down('ShiftRight')) && P.moving && !firing;
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

    const speed = (P.sprinting ? PC.sprintSpeed : PC.walkSpeed) * (P.perks.burner ? 1.1 : 1) * (w ? w.s.move : 1);
    const k = 1 - Math.exp(-dt * 16);
    P.vx += (ix * speed - P.vx) * k;
    P.vy += (iy * speed - P.vy) * k;
    M.moveCircle(P, P.vx * dt, P.vy * dt, M.solidForPlayer);
    if (P.moving) P.walkT += dt * (P.sprinting ? 15 : 10);

    // zombies body-block the player (mostly the player gives way)
    for (const z of GW.Zombies.list) {
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

    if (In.hit('KeyG')) Wp.throwGrenade(P, P.aimX, P.aimY);
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
