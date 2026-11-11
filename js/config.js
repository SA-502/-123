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
      grenadesStart: 2,
      grenadesMax: 4,
    },
    ZOMBIE: {
      radius: 13,
      damage: 45,
      attackWindup: 0.3,
      attackCooldown: 0.8,
      speeds: { walk: [52, 72], run: [125, 150], sprint: [182, 206] },
      plankTearTime: 0.9,
    },
    POINTS: { hit: 10, kill: 60, crit: 100, melee: 130, brute: 250, nuke: 400, carpenter: 200, plank: 10 },
    COSTS: { box: 950, pap: 5000, upgradedAmmo: 4500 },
    POWERUP_LIFE: 26,
    POWERUP_DURATION: 30,
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
    speedClass(r) {
      const base = r <= 1 ? 1 : r * 8;
      const roll = base + Math.random() * 35;
      return roll <= 35 ? 'walk' : roll <= 70 ? 'run' : 'sprint';
    },
  };

  /* ------------------------------------------------------------------ *
   * Weapons. `up` holds the overrides applied by the Overclocker.
   * type: 'bullet' (hitscan) | 'plasma' (explosive projectile) | 'arc' (chain lightning)
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
      spread: 0.05, range: 1300, pierce: 2, kick: 2.5, len: 30, move: 0.88, box: 3,
      up: { name: 'Thunder Anvil', dmg: 170, rpm: 560, mag: 150, reserve: 450, pierce: 3, color: '#c44dff' },
    },
    longshot: {
      name: 'Longshot', cls: 'sniper', auto: false, dmg: 650, rpm: 55, mag: 5, reserve: 40, reload: 2.8,
      spread: 0.003, range: 2200, pierce: 6, crit: 2.5, kick: 7, len: 34, move: 0.94, box: 2,
      up: { name: 'Eclipse', dmg: 1900, mag: 8, reserve: 64, pierce: 12, rpm: 70, color: '#ff3b6b' },
    },
    boomstick: {
      name: 'Boomstick', cls: 'shotgun', auto: false, dmg: 75, rpm: 260, mag: 2, reserve: 60, reload: 1.9,
      spread: 0.2, pellets: 10, range: 380, crit: 1.5, kick: 8, len: 20, box: 2,
      up: { name: 'Doomstick', dmg: 185, reserve: 80, reload: 1.5, color: '#ff4fd8' },
    },
    sixgun: {
      name: 'Sixgun .50', cls: 'pistol', auto: false, dmg: 330, rpm: 200, mag: 6, reserve: 72, reload: 2.2,
      spread: 0.012, range: 1300, pierce: 3, crit: 2.5, kick: 5, len: 18, box: 3,
      up: { name: 'Dead Ringer', dmg: 850, mag: 8, reserve: 96, pierce: 5, color: '#ffd426' },
    },
    quasar: {
      name: 'Quasar Blaster', cls: 'energy', type: 'plasma', auto: false, dmg: 1200, splash: 700, splashR: 90, rpm: 190,
      mag: 20, reserve: 160, reload: 2.6, spread: 0.01, range: 1400, kick: 3, len: 20, wonder: true, box: 1, color: '#7dff5a',
      up: { name: 'Quasar Hypernova', dmg: 2600, splash: 1600, splashR: 110, mag: 40, reserve: 200, color: '#ff5ad1' },
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
  };
})();
