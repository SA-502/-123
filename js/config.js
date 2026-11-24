/* GRAVEWAVE — tuning constants, round math and content definitions */
(function () {
  'use strict';
  const GW = (window.GW = window.GW || {});

  GW.FONT = '"Orbitron", "Trebuchet MS", "Segoe UI", sans-serif';

  GW.CFG = {
    TILE: 48,
    MAX_ALIVE: 24,
    PLAYER: {
      radius: 13,
      walkSpeed: 190,
      sprintSpeed: 290,
      maxHp: 100,
      perkHp: 250,
      regenDelay: 4.0, // seconds without damage before regen starts
      regenRate: 75, // hp per second once regen starts
      stamina: 4.0, // seconds of sprint
      staminaRegen: 1.5,
      staminaDelay: 1.0,
      startPoints: 500,
      meleeDamage: 150,
      meleeRange: 60,
      meleeArc: 1.0,
      meleeCooldown: 0.6,
      meleeAssist: 96, // the knife turns you toward any zombie this close, even one behind you
      dash: { speed: 660, time: 0.3, cooldown: 1.0, stamina: 0.7 }, // slide: a quick burst you can shoot out of
      grenadesStart: 2,
      grenadesMax: 4,
    },
    ZOMBIE: {
      radius: 13,
      helmetFrac: 0.4,
      spit: { min: 200, max: 420, windup: 0.8, cd: [3.5, 5.5], flight: 0.75, puddleR: 55, puddleLife: 4, puddleDmg: 15, puddleTick: 0.5 },
      bloat: { trigger: 30, swell: 0.8, radius: 130, dmg: 70, deathRadius: 110, deathDmg: 40, zombieFrac: 0.5 },
      leap: { min: 140, max: 300, crouch: 0.45, speed: 520, range: 320, dmg: 30, cd: [3, 5], recover: 0.6 },
      caps: { spitter: 3, bloater: 3, leaper: 4 },
      damage: 45,
      attackWindup: 0.3,
      attackCooldown: 0.8,
      speeds: { walk: [52, 72], run: [125, 150], sprint: [182, 206] },
      plankTearTime: 0.9,
    },
    POINTS: { hit: 10, kill: 60, crit: 100, melee: 130, brute: 250, nuke: 400, carpenter: 200, plank: 10, trap: 50, ally: 50, boss: 2000 },
    COSTS: { box: 950, pap: 5000, papTiers: [5000, 10000, 15000], upgradedAmmo: 4500 },
    TIER: { dmg: [1, 2, 3.5], mag: [1, 1.15, 1.3], suffix: ['', ' II', ' III'] },
    MOD: { burnTime: 3, burnFrac: 0.08, burnFracBig: 0.01, shockJumps: 3, shockRange: 200, shockMult: 2, frostStacks: 5, frostSlow: 3, frostFreeze: 1.5, blastR: 62, blastMult: 1.5 },
    POWERUP_LIFE: 26,
    POWERUP_DURATION: 30,
    TRAP: { cost: 1000, duration: 25, cooldown: 60, tick: 0.25, playerDmg: 40, playerTick: 0.5, bruteFrac: 0.07 },
    SAFEROOM: { cost: 1500, duration: 20, cooldown: 120, warn: 3, blastR: 380, daze: 3, blastFrac: 0.2, hatchWindow: 10 },
    ARMOR: { cost: 1250, max: 150, absorb: 0.7 },
    // co-op: a player at 0 health goes down and bleeds out unless a teammate holds USE next to them
    REVIVE: { bleed: 30, time: 3, range: 66, hpFrac: 0.5, invuln: 2.5, crawl: 42 },
    TELEPORT: { cost: 500, cooldown: 25 },
    TACTICAL_MAX: 3,
    PAL: { cost: 2000, duration: 45, dropDuration: 25, cooldown: 90, rpm: 600, range: 520, speed: 270, dmgBase: 30, dmgRound: 10 },
    SENTRY: { cost: 1500, duration: 40, rpm: 700, range: 470, dmgBase: 25, dmgRound: 9 },
    CRYO: { radius: 170, freeze: 1.5, slow: 6, slowMult: 0.4, damage: 50 },
    LURE: { life: 7, pull: 260, pullFlow: 110, radius: 190, mult: 1.5 },
    BUBBLE: { life: 10, radius: 120, max: 2 },
  };

  /**
   * Round scaling. These follow the classic round-based survival curves:
   *  - health: +100 per round through round 9, then compounding x1.1
   *  - horde size: 24 base, scaled by a round multiplier, with early-round tapering
   *  - spawn delay: 2s decaying 5% per round
   *  - move speed: a rising base plus a random spread decides walk / run / sprint
   */
  GW.Rounds = {
    health(r) {
      return r < 10 ? 150 + 100 * (r - 1) : Math.floor(950 * Math.pow(1.1, r - 9));
    },
    count(r) {
      let mult = Math.max(1, r / 5);
      if (r >= 10) mult *= r * 0.15;
      let max = 24 + Math.floor(0.5 * 6 * mult);
      if (r < 2) max *= 0.25;
      else if (r < 3) max *= 0.3;
      else if (r < 4) max *= 0.5;
      else if (r < 5) max *= 0.7;
      else if (r < 6) max *= 0.9;
      return Math.max(1, Math.floor(max));
    },
    spawnDelay(r) {
      return Math.max(0.08, 2 * Math.pow(0.95, r - 1));
    },
    /** Which kind of zombie to send next: specials join gradually as the rounds climb. */
    mix(r) {
      return [
        ['walker', 1],
        ['helmet', r >= 6 ? Math.min(0.4, (r - 5) * 0.05) : 0],
        ['spitter', r >= 8 ? Math.min(0.16, (r - 7) * 0.025) : 0],
        ['bloater', r >= 10 ? Math.min(0.13, (r - 9) * 0.02) : 0],
        ['leaper', r >= 12 ? Math.min(0.18, (r - 11) * 0.025) : 0],
      ];
    },
    speedClass(r) {
      const base = r <= 1 ? 1 : r * 8;
      const roll = base + Math.random() * 35;
      return roll <= 35 ? 'walk' : roll <= 70 ? 'run' : 'sprint';
    },
  };

  /* ------------------------------------------------------------------ *
   * Weapons. `up` holds the overrides applied by the Overclocker.
   * type: 'bullet' (hitscan) | 'plasma' (explosive projectile) | 'arc' (chain lightning)
   *       | 'melee' (a blade swing: dmg + frac of the target's max health, hits `cleave` zombies) | 'flame' (a short cone that sets fire)
   * box: mystery-crate weight (0 = never in the crate)
   * ------------------------------------------------------------------ */
  const DEF = { type: 'bullet', pellets: 1, pierce: 1, crit: 2, move: 1, kick: 2, len: 20, color: '#ffe7a3', cost: 0, box: 0 };
  const W = {
    stinger: {
      name: 'P-9 Stinger', cls: 'pistol', auto: false, dmg: 35, rpm: 450, mag: 8, reserve: 80, reload: 1.3,
      spread: 0.03, range: 1000, crit: 2.2, len: 15,
      up: { name: 'Stinger Supernova', type: 'plasma', dmg: 700, splash: 420, splashR: 85, mag: 10, reserve: 120, rpm: 380, color: '#ff4fd8' },
    },
    ranger: {
      name: 'Ranger DMR', cls: 'rifle', auto: false, dmg: 115, rpm: 330, mag: 10, reserve: 100, reload: 2.0,
      spread: 0.012, range: 1400, pierce: 2, crit: 2.5, kick: 3, len: 26, cost: 500, box: 2,
      up: { name: 'Star Ranger', dmg: 300, mag: 16, reserve: 160, pierce: 4, color: '#7dfcff' },
    },
    bulldog: {
      name: 'Bulldog 12', cls: 'shotgun', auto: false, dmg: 48, rpm: 80, mag: 6, reserve: 54, reload: 2.3,
      spread: 0.16, pellets: 8, range: 420, crit: 1.5, kick: 6, len: 24, cost: 500, box: 2,
      up: { name: 'Hellhound', dmg: 120, pellets: 9, mag: 10, reserve: 80, rpm: 100, range: 480, color: '#ff7a1a' },
    },
    buzzsaw: {
      name: 'Buzzsaw SMG', cls: 'smg', auto: true, dmg: 38, rpm: 800, mag: 30, reserve: 240, reload: 1.9,
      spread: 0.06, range: 900, crit: 1.8, kick: 1.5, len: 19, cost: 1000, box: 3,
      up: { name: 'Chainsaw Choir', dmg: 85, rpm: 880, mag: 45, reserve: 360, color: '#3dff8b' },
    },
    kestrel: {
      name: 'Kestrel AR', cls: 'rifle', auto: true, dmg: 62, rpm: 600, mag: 30, reserve: 270, reload: 2.2,
      spread: 0.035, range: 1200, kick: 2, len: 26, cost: 1400, box: 3,
      up: { name: 'Peregrine', dmg: 135, rpm: 650, mag: 45, reserve: 405, pierce: 2, color: '#19f0ff' },
    },
    riptide: {
      name: 'Riptide Auto-12', cls: 'shotgun', auto: true, dmg: 42, rpm: 210, mag: 8, reserve: 64, reload: 2.6,
      spread: 0.14, pellets: 6, range: 400, crit: 1.5, kick: 4.5, len: 23, cost: 1500, box: 3,
      up: { name: 'Tsunami', dmg: 100, pellets: 7, rpm: 250, mag: 12, reserve: 96, color: '#35c8ff' },
    },
    hornet: {
      name: 'Hornet MP', cls: 'smg', auto: true, dmg: 29, rpm: 1100, mag: 36, reserve: 288, reload: 1.6,
      spread: 0.075, range: 800, crit: 1.8, kick: 1.3, len: 17, cost: 1250, box: 3,
      up: { name: 'Yellowjacket', dmg: 64, rpm: 1200, mag: 54, reserve: 432, color: '#ffe14d' },
    },
    anvil: {
      name: 'Anvil LMG', cls: 'lmg', auto: true, dmg: 80, rpm: 520, mag: 100, reserve: 300, reload: 4.2,
      spread: 0.05, range: 1300, pierce: 2, kick: 2.5, len: 30, move: 0.88, cost: 2500, box: 3,
      up: { name: 'Thunder Anvil', dmg: 170, rpm: 560, mag: 150, reserve: 450, pierce: 3, color: '#c44dff' },
    },
    longshot: {
      name: 'Longshot', cls: 'sniper', auto: false, dmg: 650, rpm: 55, mag: 5, reserve: 40, reload: 2.8,
      spread: 0.003, range: 2200, pierce: 6, crit: 2.5, kick: 7, len: 34, move: 0.94, box: 2,
      up: { name: 'Eclipse', dmg: 1900, mag: 8, reserve: 64, pierce: 12, rpm: 70, color: '#ff3b6b' },
    },
    boomstick: {
      name: 'Boomstick', cls: 'shotgun', auto: false, dmg: 75, rpm: 260, mag: 2, reserve: 60, reload: 1.9,
      spread: 0.2, pellets: 10, range: 380, crit: 1.5, kick: 8, len: 20, cost: 1750, box: 2,
      up: { name: 'Doomstick', dmg: 185, reserve: 80, reload: 1.5, color: '#ff4fd8' },
    },
    sixgun: {
      name: 'Sixgun .50', cls: 'pistol', auto: false, dmg: 330, rpm: 200, mag: 6, reserve: 72, reload: 2.2,
      spread: 0.012, range: 1300, pierce: 3, crit: 2.5, kick: 5, len: 18, cost: 1500, box: 3,
      up: { name: 'Dead Ringer', dmg: 850, mag: 8, reserve: 96, pierce: 5, color: '#ffd426' },
    },
    quasar: {
      name: 'Quasar Blaster', cls: 'energy', type: 'plasma', auto: false, dmg: 1200, splash: 700, splashR: 90, rpm: 190,
      mag: 20, reserve: 160, reload: 2.6, spread: 0.01, range: 1400, kick: 3, len: 20, wonder: true, box: 1, color: '#7dff5a',
      up: { name: 'Quasar Hypernova', dmg: 2600, splash: 1600, splashR: 110, mag: 40, reserve: 200, color: '#ff5ad1' },
    },
    // ---- crate-only extras: rare, and stronger than the wall guns ----
    thumper: {
      name: 'Thumper GL', cls: 'launcher', type: 'plasma', auto: false, dmg: 700, splash: 900, splashR: 125, speed: 720, rpm: 95,
      mag: 6, reserve: 42, reload: 2.6, spread: 0.02, range: 950, kick: 6, len: 22, box: 1.4, color: '#ffb14d',
      up: { name: 'Big Bertha', dmg: 1800, splash: 2400, splashR: 150, mag: 10, reserve: 70, rpm: 120, color: '#ff4fd8' },
    },
    ripper: {
      name: 'Ripper Minigun', cls: 'minigun', auto: true, dmg: 78, rpm: 1500, mag: 200, reserve: 600, reload: 4.8,
      spread: 0.075, range: 1100, pierce: 2, kick: 1.1, len: 30, move: 0.8, box: 0.8, color: '#ffd426',
      up: { name: 'Deathroll', dmg: 175, mag: 300, reserve: 900, pierce: 3, color: '#ff4fd8' },
    },
    katana: {
      name: 'Neon Katana', cls: 'katana', type: 'melee', auto: true, dmg: 450, frac: 0.34, reach: 96, arc: 1.25, cleave: 3, rpm: 160,
      mag: 1, reserve: 0, reload: 0, spread: 0, range: 96, kick: 2, len: 30, box: 0.8, color: '#19f0ff',
      up: { name: 'Moonlight Katana', dmg: 1100, frac: 0.6, reach: 108, cleave: 5, rpm: 190, color: '#ff4fd8' },
    },
    axe: {
      name: 'Fire Axe', cls: 'axe', type: 'melee', auto: true, dmg: 700, frac: 0.5, reach: 86, arc: 1.6, cleave: 4, rpm: 100,
      mag: 1, reserve: 0, reload: 0, spread: 0, range: 86, kick: 4, len: 26, box: 1, color: '#ff3b4e',
      up: { name: 'Executioner', dmg: 1600, frac: 0.9, reach: 96, cleave: 6, rpm: 115, color: '#ffd426' },
    },
    dragon: {
      name: "Dragon's Breath", cls: 'flame', type: 'flame', auto: true, dmg: 70, frac: 0.012, burn: 0.06, rpm: 600, mag: 120, reserve: 480,
      reload: 2.8, spread: 0.32, range: 250, kick: 0.4, len: 26, move: 0.92, wonder: true, box: 0.6, color: '#ff7a1a',
      up: { name: 'Hellfire Breath', dmg: 170, frac: 0.02, burn: 0.1, range: 300, mag: 200, reserve: 800, color: '#3dd6ff' },
    },
    photon: {
      name: 'Photon Ray', cls: 'energy', type: 'plasma', auto: false, dmg: 1500, splash: 450, splashR: 70, speed: 1150, rpm: 280,
      mag: 24, reserve: 192, reload: 2.0, spread: 0.008, range: 1500, kick: 2, len: 18, wonder: true, box: 0.6, color: '#ff3b4e',
      up: { name: 'Photon Supernova', dmg: 3400, splash: 1300, splashR: 95, mag: 40, reserve: 280, rpm: 320, color: '#3dff8b' },
    },
    arccaster: {
      name: 'Arc Caster', cls: 'energy', type: 'arc', auto: false, dmg: 0, chain: 6, rpm: 55, mag: 3, reserve: 15,
      reload: 3.2, spread: 0, range: 700, kick: 6, len: 26, wonder: true, box: 0.8, color: '#8fd8ff',
      up: { name: 'Storm Sovereign', chain: 12, mag: 6, reserve: 30, rpm: 70, color: '#ffe14d' },
    },
  };
  for (const id in W) W[id] = Object.assign({ id }, DEF, W[id]);
  GW.WEAPONS = W;

  GW.PERKS = {
    thick: { id: 'thick', name: 'Thick Skin', cost: 2500, color: '#ff3355', desc: 'Max health 100 → 250' },
    quick: { id: 'quick', name: 'Quick Hands', cost: 3000, color: '#3dff8b', desc: 'Reload twice as fast' },
    burner: { id: 'burner', name: 'Afterburner', cost: 2000, color: '#ffd426', desc: 'Move faster, sprint longer' },
    twin: { id: 'twin', name: 'Twin Trigger', cost: 2000, color: '#ff7a1a', desc: '+33% rate of fire' },
    wind: { id: 'wind', name: 'Second Wind', cost: 1500, color: '#35c8ff', desc: 'Cheat death once' },
  };

  GW.POWERUPS = {
    ammo: { id: 'ammo', name: 'FULL RELOAD', color: '#3dff8b', sub: 'All reserves refilled' },
    instakill: { id: 'instakill', name: 'OVERKILL', color: '#ff3b4e', sub: 'Everything dies in one hit', timed: true },
    double: { id: 'double', name: 'DOUBLE SCORE', color: '#ffe14d', sub: 'All points x2', timed: true },
    nuke: { id: 'nuke', name: 'PURGE', color: '#ff7a1a', sub: 'The horde is vaporised  +400' },
    carpenter: { id: 'carpenter', name: 'BOARD UP', color: '#19f0ff', sub: 'All barricades rebuilt  +200' },
    pal: { id: 'pal', name: 'PIXEL PAL', color: '#b77dff', sub: 'A robot buddy joins the fight' },
  };

  /** Tactical grenades (thrown with T). One type carried at a time. */
  GW.TACTICALS = {
    cryo: { id: 'cryo', name: 'Cryo Grenade', cost: 750, max: 3, color: '#8fe9ff', desc: 'Freezes, then slows the horde' },
    lure: { id: 'lure', name: 'Neon Lure', cost: 2000, max: 1, color: '#ff4fd8', desc: 'Draws zombies in, then detonates' },
    bubble: { id: 'bubble', name: 'Safety Bubble', cost: 1500, max: 2, color: '#3dff8b', desc: 'A dome zombies cannot enter' },
  };

  /** Ammo mods chosen at the Overclocker. `icon` is a glyph id from art.js. */
  GW.MODS = {
    fire: { id: 'fire', name: 'Inferno', color: '#ff7a1a', icon: 'fire', desc: 'burns a share of max health' },
    shock: { id: 'shock', name: 'Arc', color: '#8fd8ff', icon: 'zap', desc: 'chains to nearby zombies' },
    frost: { id: 'frost', name: 'Frost', color: '#8fe9ff', icon: 'cryo', desc: 'slows, then freezes' },
    blast: { id: 'blast', name: 'Blast', color: '#ffd426', icon: 'nuke', desc: 'small explosions' },
  };
  GW.MOD_ORDER = ['fire', 'shock', 'frost', 'blast'];

  GW.TRAPS = {
    zap: { name: 'Zapper Floor', color: '#8fd8ff' },
    fire: { name: 'Burnout Jets', color: '#ff7a1a' },
    laser: { name: 'Laser Grid', color: '#ff3b6b' },
  };
})();
