/*
 * GRAVEWAVE server-side game: runs the real game code (rounds, spawns, every zombie) for one
 * co-op room, without drawing or sound. The players' phones only draw and send their own moves,
 * so nobody's phone is "the host" and the game keeps going if any one player drops out.
 *
 * Each room gets its own sandbox (Node `vm` context) with the browser-only parts replaced by
 * do-nothing stand-ins: rendering, HUD, audio, particles, input.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
// game logic that runs on the server, in the same order as index.html
const LOGIC = ['utils', 'config', 'map', 'map_gemini', 'map_frostfall', 'weapons', 'zombies', 'boss', 'director', 'player', 'gadgets', 'allies', 'facilities', 'interact', 'quest_frostfall', 'game', 'net'];
// browser-only modules: replaced by stand-ins
const STUBBED = ['Art', 'Assets', 'Audio', 'Input', 'Touch', 'MapArt', 'FX', 'Render', 'HUD', 'Perf'];

let scripts = null;
function compile() {
  if (!scripts) scripts = LOGIC.map((n) => new vm.Script(fs.readFileSync(path.join(ROOT, 'js', n + '.js'), 'utf8'), { filename: 'js/' + n + '.js' }));
  return scripts;
}

/**
 * A do-anything stand-in: every property is another stand-in, every call returns one, values you
 * assign are kept, it counts as 0 in arithmetic and as an empty list in for..of loops.
 */
function stub() {
  const store = Object.create(null);
  let proxy;
  const target = function () {
    return proxy;
  };
  proxy = new Proxy(target, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then' || k === 'toJSON') return undefined;
      if (k === 'length') return 0;
      if (typeof k === 'symbol') return undefined;
      return (store[k] = stub());
    },
    set(t, k, v) {
      store[k] = v;
      return true;
    },
    apply() {
      return proxy;
    },
    has() {
      return true;
    },
  });
  return proxy;
}

class Sim {
  /**
   * @param {number} seed       same seed the players use, so the park is identical
   * @param {number[]} players  player ids in the room
   * @param {(text: string) => void} out  messages from the game to the room
   * @param {string} [map]  'lumina' (default) or 'gemini'
   */
  constructor(seed, players, out, map) {
    this.out = out;
    this.dead = false;
    const sandbox = {
      console,
      setTimeout,
      clearTimeout,
      setInterval: () => 0, // the client's keep-alive ping: not needed here
      clearInterval: () => {},
      performance: { now: () => performance.now() },
      requestAnimationFrame: () => 0,
      navigator: { userAgent: 'gravewave-server', maxTouchPoints: 0 },
      location: { protocol: 'https:', host: 'server', hostname: 'server', search: '' },
      localStorage: { getItem: () => null, setItem: () => {} },
      URLSearchParams,
      document: stub(),
      WebSocket: function () {},
    };
    sandbox.document.readyState = 'loading'; // keeps the browser boot code from running
    sandbox.window = sandbox;
    sandbox.addEventListener = () => {};
    const GW = (sandbox.GW = {});
    for (const n of STUBBED) GW[n] = stub();
    const ctx = vm.createContext(sandbox);
    for (const s of compile()) s.runInContext(ctx);
    this.GW = GW;

    const N = GW.Net;
    N.ws = { readyState: 1, send: (text) => this.out(text) };
    N.serverMode = true;
    N.active = true;
    N.isHost = true;
    N.isGuest = false;
    N.myId = 0;
    N.hostId = 0;
    N.lobby = players.slice();
    if (map) GW.Map.activeMap = map; // the room's map, picked by its leader
    GW.Game.newGame(seed);
    this.last = performance.now();
    this.acc = 0;
  }

  /** A message from a player (already tagged with `from`). */
  receive(m) {
    if (this.dead) return;
    try {
      this.GW.Net.receive(m);
    } catch (e) {
      console.error('[sim] message', m && m.t, e);
    }
  }

  /** Advance in fixed 1/60 s steps to the current time. Returns false once the run is over. */
  tick() {
    if (this.dead) return false;
    const G = this.GW.Game;
    const now = performance.now();
    this.acc += Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const STEP = 1 / 60;
    try {
      while (this.acc >= STEP && G.state === 'playing') {
        G.update(STEP);
        this.acc -= STEP;
      }
    } catch (e) {
      console.error('[sim] step', e);
    }
    if (G.state !== 'playing') this.dead = true;
    return !this.dead;
  }

  stop() {
    this.dead = true;
  }
}

module.exports = { Sim };
