/* GRAVEWAVE — fully procedural Web Audio: SFX synthesis + a sequenced synthwave soundtrack */
(function () {
  'use strict';
  const GW = window.GW, U = GW.U;
  const A = (GW.Audio = {
    ctx: null, ready: false, musicVol: 0.55, sfxVol: 0.85, musicOn: true, listener: { x: 0, y: 0 },
  });

  let ctx, master, sfxBus, musicBus, musicFilter, verb, noiseBuf, delayIn;
  const last = {};
  const BPM = 104;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ------------------------------------------------------------------ */
  /* setup                                                              */
  /* ------------------------------------------------------------------ */
  A.init = function () {
    if (A.ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = A.ctx = new AC();
    } catch (e) {
      return;
    }
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = A.sfxVol;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = A.musicOn ? A.musicVol : 0;
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 750;
    musicFilter.Q.value = 0.8;
    musicBus.connect(musicFilter);
    musicFilter.connect(master);

    // shared white-noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // synthetic reverb impulse for gunshot tails and big hits
    const len = Math.floor(ctx.sampleRate * 1.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    verb = ctx.createConvolver();
    verb.buffer = ir;
    const vg = ctx.createGain();
    vg.gain.value = 0.45;
    verb.connect(vg);
    vg.connect(sfxBus);

    // dotted-eighth echo for the arpeggio + lead
    delayIn = ctx.createGain();
    const dl = ctx.createDelay(1.5);
    dl.delayTime.value = (60 / BPM) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    delayIn.connect(dl);
    dl.connect(fb);
    fb.connect(dl);
    dl.connect(wet);
    wet.connect(musicBus);

    try {
      setupHorde();
    } catch (e) {
      horde.bus = null;
    }
    A.ready = true;
    startMusic();
  };

  A.setMusicVol = function (v) {
    A.musicVol = v;
    if (A.ready) musicBus.gain.setTargetAtTime(A.musicOn ? v : 0, ctx.currentTime, 0.05);
  };
  A.setSfxVol = function (v) {
    A.sfxVol = v;
    if (A.ready) sfxBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  };
  A.toggleMusic = function () {
    A.musicOn = !A.musicOn;
    A.setMusicVol(A.musicVol);
    return A.musicOn;
  };

  /* ------------------------------------------------------------------ */
  /* synthesis primitives                                               */
  /* ------------------------------------------------------------------ */
  // Per-sound distance muffling: A.play() sets curLP to a lowpass for positional sounds while
  // the sound's builder runs, and route() sends that sound's dry (and reverb) signal through it.
  let curLP = null, curLPv = null;
  function verbIn() {
    if (!curLP) return verb;
    if (!curLPv) {
      curLPv = ctx.createBiquadFilter();
      curLPv.type = 'lowpass';
      curLPv.frequency.value = curLP.frequency.value;
      curLPv.Q.value = 0.6;
      curLPv.connect(verb);
    }
    return curLPv;
  }

  function route(node, o) {
    let n = node;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = U.clamp(o.pan, -1, 1);
      n.connect(p);
      n = p;
    }
    n.connect(o.dest || curLP || sfxBus);
    if (o.verb) {
      const s = ctx.createGain();
      s.gain.value = o.verb;
      n.connect(s);
      s.connect(o.dest ? verb : verbIn());
    }
    if (o.echo) {
      const s = ctx.createGain();
      s.gain.value = o.echo;
      n.connect(s);
      s.connect(delayIn);
    }
  }

  function envelope(g, t, o, dur, vol) {
    const a = o.a || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (o.sustain) {
      const r = Math.min(o.r || 0.06, dur * 0.5);
      g.gain.setValueAtTime(vol, Math.max(t + a, t + dur - r));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
  }

  function tone(o) {
    const t = o.t || ctx.currentTime;
    const dur = o.dur || 0.2;
    const vol = o.vol === undefined ? 0.3 : o.vol;
    if (vol <= 0.0005) return;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    if (o.vib) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vibRate || 5.5;
      lg.gain.value = o.vib;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    envelope(g, t, o, dur, vol);
    let n = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + dur);
      f.Q.value = o.q || 1;
      n.connect(f);
      n = f;
    }
    n.connect(g);
    route(g, o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(o) {
    const t = o.t || ctx.currentTime;
    const dur = o.dur || 0.2;
    const vol = o.vol === undefined ? 0.3 : o.vol;
    if (vol <= 0.0005) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
    f.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    envelope(g, t, o, dur, vol);
    src.connect(f);
    f.connect(g);
    route(g, o);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /**
   * Distance attenuation + stereo pan relative to the listener (the player), plus a muffle factor
   * (0 near .. 1 at max range) and the matching lowpass cutoff (~18 kHz near -> ~900 Hz far).
   */
  function spatial(p, range) {
    if (p.x === undefined) return { vol: 1, pan: 0, muffle: 0, lp: 0 };
    const dx = p.x - A.listener.x, dy = (p.y || 0) - A.listener.y;
    const d = Math.hypot(dx, dy);
    const rng = range || 1150;
    const v = U.clamp(1 - d / rng, 0, 1);
    const m = U.clamp(d / rng, 0, 1) || 0;
    return { vol: v * v, pan: U.clamp(dx / 650, -1, 1) * 0.85, muffle: m, lp: 18000 * Math.pow(0.05, Math.pow(m, 1.3)) };
  }

  /* ------------------------------------------------------------------ */
  /* sound effect library                                               */
  /* ------------------------------------------------------------------ */
  const THROTTLE = { hit: 0.035, groan: 0.3, plank: 0.1, casing: 0.05, zdeath: 0.05, explosion: 0.05, deny: 0.2, step: 0.05, zattack: 0.08 };

  const SHOTS = {
    pistol: (t, v, pan) => {
      noise({ t, dur: 0.13, vol: 0.5 * v, type: 'bandpass', f: 2000, f2: 500, q: 0.7, pan, verb: 0.35 });
      tone({ t, type: 'square', f: 240, f2: 60, dur: 0.09, vol: 0.28 * v, pan });
    },
    smg: (t, v, pan) => {
      noise({ t, dur: 0.075, vol: 0.4 * v, type: 'bandpass', f: 2800, f2: 900, q: 0.8, pan, verb: 0.22 });
      tone({ t, type: 'square', f: 320, f2: 90, dur: 0.05, vol: 0.2 * v, pan });
    },
    rifle: (t, v, pan) => {
      noise({ t, dur: 0.15, vol: 0.5 * v, type: 'bandpass', f: 1600, f2: 380, q: 0.6, pan, verb: 0.4 });
      tone({ t, type: 'sawtooth', f: 190, f2: 50, dur: 0.11, vol: 0.26 * v, pan, lp: 900 });
    },
    lmg: (t, v, pan) => {
      noise({ t, dur: 0.16, vol: 0.52 * v, type: 'lowpass', f: 1800, f2: 300, pan, verb: 0.4 });
      tone({ t, type: 'sawtooth', f: 150, f2: 42, dur: 0.13, vol: 0.32 * v, pan, lp: 700 });
    },
    shotgun: (t, v, pan) => {
      noise({ t, dur: 0.32, vol: 0.75 * v, type: 'lowpass', f: 1500, f2: 160, pan, verb: 0.6 });
      tone({ t, type: 'sine', f: 130, f2: 38, dur: 0.24, vol: 0.5 * v, pan });
      noise({ t, dur: 0.05, vol: 0.3 * v, type: 'highpass', f: 4000, pan });
    },
    sniper: (t, v, pan) => {
      noise({ t, dur: 0.45, vol: 0.8 * v, type: 'lowpass', f: 1300, f2: 120, pan, verb: 0.9 });
      tone({ t, type: 'sine', f: 160, f2: 32, dur: 0.34, vol: 0.55 * v, pan });
      noise({ t, dur: 0.04, vol: 0.4 * v, type: 'highpass', f: 5000, pan });
    },
    energy: (t, v, pan) => {
      tone({ t, type: 'sawtooth', f: 980, f2: 170, dur: 0.2, vol: 0.26 * v, pan, lp: 3000, lp2: 600, verb: 0.3 });
      tone({ t, type: 'sine', f: 1500, f2: 300, dur: 0.16, vol: 0.2 * v, pan });
      noise({ t, dur: 0.1, vol: 0.14 * v, type: 'bandpass', f: 3500, q: 2, pan });
    },
  };

  const SFX = {
    shot(t, s, p) {
      const fn = SHOTS[p.cls] || SHOTS.pistol;
      fn(t, s.vol, s.pan);
      if (p.up && p.cls !== 'energy') {
        // overclocked weapons get a laser "pew" layered on top
        tone({ t, type: 'sawtooth', f: 1900, f2: 320, dur: 0.11, vol: 0.13 * s.vol, pan: s.pan, lp: 5000, lp2: 900 });
      }
    },
    arc(t, s) {
      for (let i = 0; i < 6; i++) {
        noise({ t: t + i * 0.035, dur: 0.06, vol: 0.4 * s.vol, type: 'bandpass', f: U.rand(1800, 5200), q: 3, pan: s.pan, verb: 0.3 });
      }
      tone({ t, type: 'square', f: 95, f2: 55, dur: 0.4, vol: 0.3 * s.vol, pan: s.pan, lp: 1200 });
      tone({ t, type: 'sawtooth', f: 2400, f2: 200, dur: 0.3, vol: 0.14 * s.vol, pan: s.pan });
    },
    empty(t) {
      tone({ t, type: 'square', f: 900, dur: 0.03, vol: 0.12 });
      noise({ t, dur: 0.03, vol: 0.12, type: 'highpass', f: 3000 });
    },
    reloadStart(t) {
      noise({ t, dur: 0.05, vol: 0.2, type: 'bandpass', f: 1800, q: 2 });
      tone({ t: t + 0.03, type: 'square', f: 300, f2: 180, dur: 0.05, vol: 0.1 });
    },
    reloadEnd(t) {
      noise({ t, dur: 0.04, vol: 0.22, type: 'bandpass', f: 2600, q: 2 });
      tone({ t: t + 0.05, type: 'square', f: 520, f2: 240, dur: 0.06, vol: 0.12 });
      noise({ t: t + 0.09, dur: 0.05, vol: 0.2, type: 'bandpass', f: 1400, q: 2 });
    },
    swap(t) {
      noise({ t, dur: 0.07, vol: 0.14, type: 'bandpass', f: 1200, f2: 2600, q: 1.5 });
    },
    swing(t) {
      noise({ t, dur: 0.16, vol: 0.22, type: 'bandpass', f: 700, f2: 2600, q: 1.2 });
    },
    stab(t) {
      noise({ t, dur: 0.1, vol: 0.4, type: 'lowpass', f: 1400, f2: 300 });
      tone({ t, type: 'sine', f: 170, f2: 70, dur: 0.1, vol: 0.3 });
    },
    hit(t, s) {
      noise({ t, dur: 0.05, vol: 0.16 * s.vol, type: 'lowpass', f: 900, f2: 300, pan: s.pan });
    },
    crit(t) {
      tone({ t, type: 'triangle', f: 1760, dur: 0.09, vol: 0.14 });
      tone({ t: t + 0.03, type: 'triangle', f: 2637, dur: 0.12, vol: 0.1 });
    },
    zdeath(t, s) {
      noise({ t, dur: 0.22, vol: 0.3 * s.vol, type: 'lowpass', f: 800, f2: 140, pan: s.pan });
      tone({ t, type: 'sawtooth', f: U.rand(120, 170), f2: 50, dur: 0.3, vol: 0.14 * s.vol, pan: s.pan, lp: 700 });
    },
    groan(t, s, p) {
      // legacy entry point: now a full formant creature voice chosen by pitch
      const pitch = p.pitch || 1;
      const kind = p.kind || (pitch < 0.8 ? 'brute' : pitch > 1.2 ? 'sprinter' : 'walker');
      creatureVoice(t, s, kind, p);
    },
    shriek(t, s, p) {
      creatureVoice(t, s, 'shrieker', p);
    },
    zattack(t, s) {
      noise({ t, dur: 0.14, vol: 0.26 * s.vol, type: 'bandpass', f: 500, f2: 1600, q: 1, pan: s.pan });
    },
    hurt(t) {
      noise({ t, dur: 0.2, vol: 0.5, type: 'lowpass', f: 700, f2: 120 });
      tone({ t, type: 'sine', f: 110, f2: 45, dur: 0.22, vol: 0.5 });
      tone({ t, type: 'sawtooth', f: 260, f2: 160, dur: 0.16, vol: 0.1, lp: 900 });
    },
    heartbeat(t) {
      tone({ t, type: 'sine', f: 62, f2: 40, dur: 0.14, vol: 0.5 });
      tone({ t: t + 0.2, type: 'sine', f: 55, f2: 36, dur: 0.16, vol: 0.38 });
    },
    purchase(t) {
      // cash register: drawer clack, two bells, coin rattle
      noise({ t, dur: 0.05, vol: 0.3, type: 'bandpass', f: 1500, q: 1.5 });
      tone({ t: t + 0.04, type: 'triangle', f: 1318.5, dur: 0.12, vol: 0.22 });
      tone({ t: t + 0.13, type: 'sine', f: 2093, dur: 0.6, vol: 0.2, verb: 0.3 });
      tone({ t: t + 0.13, type: 'sine', f: 2637, dur: 0.5, vol: 0.14 });
      tone({ t: t + 0.13, type: 'triangle', f: 4186, dur: 0.25, vol: 0.06 });
      for (let i = 0; i < 4; i++) noise({ t: t + 0.18 + i * 0.045, dur: 0.03, vol: 0.1, type: 'highpass', f: 6500 });
    },
    deny(t) {
      tone({ t, type: 'square', f: 150, f2: 110, dur: 0.12, vol: 0.16, lp: 900 });
      tone({ t: t + 0.13, type: 'square', f: 120, f2: 85, dur: 0.16, vol: 0.16, lp: 900 });
    },
    door(t, s) {
      noise({ t, dur: 0.9, vol: 0.4 * s.vol, type: 'lowpass', f: 300, f2: 90, a: 0.05, verb: 0.5 });
      tone({ t, type: 'sawtooth', f: 70, f2: 38, dur: 0.8, vol: 0.25 * s.vol, lp: 400 });
      for (let i = 0; i < 5; i++) noise({ t: t + i * 0.13, dur: 0.05, vol: 0.2 * s.vol, type: 'bandpass', f: U.rand(800, 2200), q: 3 });
    },
    power(t) {
      tone({ t, type: 'sawtooth', f: 40, f2: 420, dur: 1.8, vol: 0.3, lp: 300, lp2: 4000, sustain: true, a: 0.2, verb: 0.5 });
      tone({ t, type: 'square', f: 60, dur: 2.4, vol: 0.1, sustain: true, a: 0.5, lp: 500 });
      noise({ t: t + 0.1, dur: 0.12, vol: 0.5, type: 'lowpass', f: 400 });
      [57, 64, 69, 76, 81].forEach((m, i) => tone({ t: t + 1.5 + i * 0.09, type: 'triangle', f: mtof(m), dur: 0.7, vol: 0.2, verb: 0.5 }));
      for (let i = 0; i < 9; i++) noise({ t: t + 0.3 + i * 0.14, dur: 0.04, vol: 0.2, type: 'bandpass', f: U.rand(2000, 6000), q: 4 });
    },
    roundStart(t) {
      // tolling bell + dread rising underneath
      [0, 0.75].forEach((o, i) => {
        tone({ t: t + o, type: 'sine', f: 146.8, dur: 2.2, vol: 0.34 - i * 0.08, verb: 0.9 });
        tone({ t: t + o, type: 'sine', f: 146.8 * 2.76, dur: 1.4, vol: 0.12, verb: 0.6 });
        tone({ t: t + o, type: 'sine', f: 146.8 * 5.4, dur: 0.7, vol: 0.05 });
      });
      tone({ t: t + 0.2, type: 'sawtooth', f: 55, f2: 73.4, dur: 2.6, vol: 0.2, lp: 220, lp2: 900, sustain: true, a: 0.8 });
      tone({ t: t + 0.2, type: 'sawtooth', f: 55 * 1.5, f2: 73.4 * 1.5, dur: 2.6, vol: 0.1, lp: 300, lp2: 1100, sustain: true, a: 0.8, detune: 14 });
      noise({ t: t + 1.2, dur: 1.6, vol: 0.12, type: 'bandpass', f: 300, f2: 2400, q: 2, a: 1.3, sustain: true });
    },
    roundEnd(t) {
      [64, 67, 71, 76].forEach((m, i) => {
        tone({ t: t + i * 0.16, type: 'triangle', f: mtof(m), dur: 0.9, vol: 0.2, verb: 0.6 });
        tone({ t: t + i * 0.16, type: 'sine', f: mtof(m + 12), dur: 0.6, vol: 0.07 });
      });
      tone({ t: t + 0.64, type: 'sawtooth', f: mtof(52), dur: 1.6, vol: 0.12, lp: 900, lp2: 200, verb: 0.5 });
    },
    special(t) {
      // air-raid style warble for special rounds
      tone({ t, type: 'sawtooth', f: 300, f2: 620, dur: 1.2, vol: 0.16, lp: 1800, sustain: true, a: 0.2, verb: 0.6 });
      tone({ t: t + 1.2, type: 'sawtooth', f: 620, f2: 280, dur: 1.4, vol: 0.16, lp: 1800, sustain: true, verb: 0.6 });
      tone({ t, type: 'sine', f: 49, dur: 2.6, vol: 0.3, sustain: true, a: 0.3 });
    },
    boxRoll(t) {
      // wind-up music box that slows down as the roll settles
      const notes = [72, 76, 79, 84, 79, 76, 72, 76, 79, 84, 88, 84, 79, 76, 79, 84, 88, 91];
      let at = t;
      notes.forEach((m, i) => {
        tone({ t: at, type: 'triangle', f: mtof(m), dur: 0.35, vol: 0.13, verb: 0.3 });
        tone({ t: at, type: 'sine', f: mtof(m + 12), dur: 0.2, vol: 0.05 });
        at += 0.13 + i * 0.011;
      });
    },
    boxReady(t) {
      [79, 84, 91].forEach((m, i) => tone({ t: t + i * 0.07, type: 'triangle', f: mtof(m), dur: 0.5, vol: 0.18, verb: 0.4 }));
    },
    boxJester(t) {
      // descending cackle
      for (let i = 0; i < 7; i++) {
        tone({ t: t + i * 0.13, type: 'square', f: 740 - i * 62, f2: 520 - i * 50, dur: 0.11, vol: 0.14, lp: 2200, verb: 0.4 });
      }
      tone({ t: t + 1.0, type: 'sawtooth', f: 180, f2: 60, dur: 0.8, vol: 0.2, lp: 800, verb: 0.5 });
    },
    perk(t, s, p) {
      // each perk gets its own little jingle from a shared scale
      const sets = { thick: [60, 64, 67, 72], quick: [72, 67, 72, 76], burner: [67, 71, 74, 79], twin: [62, 62, 69, 74], wind: [64, 71, 68, 76] };
      const seq = sets[p.id] || sets.thick;
      noise({ t, dur: 0.25, vol: 0.14, type: 'bandpass', f: 500, f2: 2400, q: 2 }); // gulp
      seq.forEach((m, i) => {
        tone({ t: t + 0.2 + i * 0.11, type: 'square', f: mtof(m), dur: 0.22, vol: 0.11, lp: 2600, verb: 0.3 });
        tone({ t: t + 0.2 + i * 0.11, type: 'triangle', f: mtof(m + 12), dur: 0.2, vol: 0.07 });
      });
    },
    powerup(t) {
      [76, 80, 83, 88].forEach((m, i) => tone({ t: t + i * 0.06, type: 'triangle', f: mtof(m), dur: 0.5, vol: 0.2, verb: 0.5 }));
      tone({ t, type: 'sine', f: 110, f2: 220, dur: 0.4, vol: 0.2 });
    },
    powerupDrop(t, s) {
      tone({ t, type: 'sine', f: 880, f2: 1760, dur: 0.3, vol: 0.14 * s.vol, pan: s.pan, verb: 0.4 });
    },
    explosion(t, s) {
      noise({ t, dur: 0.7, vol: 0.9 * s.vol, type: 'lowpass', f: 1200, f2: 70, pan: s.pan, verb: 0.8 });
      tone({ t, type: 'sine', f: 110, f2: 28, dur: 0.6, vol: 0.7 * s.vol, pan: s.pan });
      noise({ t, dur: 0.08, vol: 0.4 * s.vol, type: 'highpass', f: 3000, pan: s.pan });
    },
    plasmaHit(t, s) {
      noise({ t, dur: 0.3, vol: 0.5 * s.vol, type: 'bandpass', f: 1400, f2: 200, q: 0.8, pan: s.pan, verb: 0.5 });
      tone({ t, type: 'sawtooth', f: 420, f2: 60, dur: 0.3, vol: 0.3 * s.vol, pan: s.pan, lp: 2000, lp2: 300 });
    },
    nuke(t) {
      noise({ t, dur: 2.2, vol: 0.8, type: 'lowpass', f: 2500, f2: 60, verb: 1 });
      tone({ t, type: 'sine', f: 90, f2: 22, dur: 2.0, vol: 0.8 });
      tone({ t, type: 'sawtooth', f: 1200, f2: 80, dur: 0.9, vol: 0.14, lp: 3000, lp2: 200 });
    },
    bounce(t, s) {
      tone({ t, type: 'square', f: 700, f2: 400, dur: 0.04, vol: 0.1 * s.vol, pan: s.pan });
    },
    throw(t) {
      noise({ t, dur: 0.18, vol: 0.16, type: 'bandpass', f: 500, f2: 1800, q: 1.4 });
    },
    plank(t, s) {
      noise({ t, dur: 0.12, vol: 0.4 * s.vol, type: 'bandpass', f: 900, f2: 300, q: 1.2, pan: s.pan });
      tone({ t, type: 'square', f: 180, f2: 90, dur: 0.08, vol: 0.18 * s.vol, pan: s.pan, lp: 800 });
    },
    repair(t) {
      noise({ t, dur: 0.05, vol: 0.3, type: 'bandpass', f: 1300, q: 2 });
      tone({ t, type: 'square', f: 260, f2: 200, dur: 0.06, vol: 0.14, lp: 1200 });
      tone({ t: t + 0.09, type: 'triangle', f: 1046, dur: 0.1, vol: 0.08 });
    },
    papWork(t) {
      tone({ t, type: 'sawtooth', f: 60, f2: 240, dur: 3.2, vol: 0.2, lp: 400, lp2: 2400, sustain: true, a: 0.3, verb: 0.4 });
      for (let i = 0; i < 16; i++) {
        noise({ t: t + i * 0.2, dur: 0.06, vol: 0.2, type: 'bandpass', f: 600 + i * 220, q: 4 });
        tone({ t: t + i * 0.2, type: 'square', f: 110 + i * 22, dur: 0.07, vol: 0.07, lp: 1500 });
      }
    },
    papDone(t) {
      [69, 73, 76, 81, 85].forEach((m, i) => {
        tone({ t: t + i * 0.07, type: 'sawtooth', f: mtof(m), dur: 0.7, vol: 0.12, lp: 3500, verb: 0.6 });
        tone({ t: t + i * 0.07, type: 'triangle', f: mtof(m + 12), dur: 0.5, vol: 0.08 });
      });
    },
    secondWind(t) {
      tone({ t, type: 'sine', f: 60, f2: 240, dur: 0.6, vol: 0.5 });
      noise({ t, dur: 1.0, vol: 0.5, type: 'bandpass', f: 300, f2: 5000, q: 1, verb: 0.8 });
      [64, 71, 76, 83].forEach((m, i) => tone({ t: t + 0.3 + i * 0.08, type: 'triangle', f: mtof(m), dur: 0.8, vol: 0.18, verb: 0.6 }));
    },
    gameOver(t) {
      [57, 56, 53, 52, 45].forEach((m, i) => {
        tone({ t: t + i * 0.42, type: 'sawtooth', f: mtof(m), dur: 1.2, vol: 0.2, lp: 1400, lp2: 300, verb: 0.8 });
        tone({ t: t + i * 0.42, type: 'sine', f: mtof(m - 12), dur: 1.2, vol: 0.22 });
      });
    },
    ui(t) {
      tone({ t, type: 'triangle', f: 880, f2: 1320, dur: 0.08, vol: 0.14 });
    },
    rise(t, s) {
      noise({ t, dur: 0.5, vol: 0.25 * s.vol, type: 'lowpass', f: 500, f2: 1400, pan: s.pan, a: 0.2 });
    },
    lightning(t, s) {
      noise({ t, dur: 0.35, vol: 0.5 * s.vol, type: 'highpass', f: 1800, pan: s.pan, verb: 0.7 });
      tone({ t, type: 'sawtooth', f: 90, f2: 40, dur: 0.4, vol: 0.3 * s.vol, pan: s.pan, lp: 600 });
    },
  };

  /* ---------------- expansion sounds: traps, gadgets, allies, facilities ---------------- */
  Object.assign(SFX, {
    trapOn(t, s) {
      tone({ t, type: 'square', f: 220, f2: 880, dur: 0.35, vol: 0.18 * s.vol, pan: s.pan, lp: 2400 });
      tone({ t: t + 0.3, type: 'sawtooth', f: 55, dur: 0.6, vol: 0.2 * s.vol, pan: s.pan, lp: 500, sustain: true, a: 0.05 });
      noise({ t, dur: 0.3, vol: 0.2 * s.vol, type: 'bandpass', f: 3000, q: 3, pan: s.pan });
    },
    trapOff(t, s) {
      tone({ t, type: 'sawtooth', f: 400, f2: 60, dur: 0.6, vol: 0.14 * s.vol, pan: s.pan, lp: 1500 });
    },
    zap(t, s) {
      for (let i = 0; i < 3; i++) noise({ t: t + i * 0.04, dur: 0.04, vol: 0.18 * s.vol, type: 'bandpass', f: U.rand(2500, 6000), q: 5, pan: s.pan });
      tone({ t, type: 'square', f: 60, dur: 0.22, vol: 0.12 * s.vol, pan: s.pan, lp: 400 });
    },
    flame(t, s) {
      noise({ t, dur: 0.34, vol: 0.28 * s.vol, type: 'lowpass', f: 900, f2: 500, pan: s.pan, a: 0.05, sustain: true });
      noise({ t, dur: 0.2, vol: 0.08 * s.vol, type: 'highpass', f: 3500, pan: s.pan });
    },
    laser(t, s) {
      tone({ t, type: 'sawtooth', f: 900, f2: 1300, dur: 0.48, vol: 0.06 * s.vol, pan: s.pan, lp: 3000, sustain: true, vib: 30, vibRate: 12 });
      tone({ t, type: 'sine', f: 120, dur: 0.48, vol: 0.1 * s.vol, pan: s.pan, sustain: true });
    },
    shutter(t) {
      noise({ t, dur: 0.7, vol: 0.45, type: 'lowpass', f: 600, f2: 150, a: 0.04, sustain: true, verb: 0.5 });
      for (let i = 0; i < 8; i++) noise({ t: t + i * 0.08, dur: 0.04, vol: 0.2, type: 'bandpass', f: 1200 + i * 90, q: 4 });
      tone({ t: t + 0.65, type: 'sine', f: 90, f2: 40, dur: 0.3, vol: 0.5 });
      noise({ t: t + 0.65, dur: 0.12, vol: 0.4, type: 'lowpass', f: 1200 });
    },
    bang(t, s) {
      noise({ t, dur: 0.14, vol: 0.4 * s.vol, type: 'lowpass', f: 700, f2: 200, pan: s.pan, verb: 0.4 });
      tone({ t, type: 'sine', f: 85, f2: 50, dur: 0.14, vol: 0.35 * s.vol, pan: s.pan });
    },
    siren(t) {
      for (let i = 0; i < 3; i++) tone({ t: t + i * 0.5, type: 'square', f: 660, f2: 440, dur: 0.45, vol: 0.12, lp: 2000, verb: 0.3 });
    },
    freeze(t, s) {
      noise({ t, dur: 0.6, vol: 0.4 * s.vol, type: 'highpass', f: 2500, f2: 6000, pan: s.pan, verb: 0.6 });
      tone({ t, type: 'sine', f: 2400, f2: 900, dur: 0.5, vol: 0.12 * s.vol, pan: s.pan });
      for (let i = 0; i < 6; i++) tone({ t: t + 0.05 + i * 0.05, type: 'triangle', f: U.rand(2600, 4200), dur: 0.12, vol: 0.06 * s.vol, pan: s.pan });
    },
    lure(t, s) {
      [76, 79, 83, 88].forEach((m, i) => tone({ t: t + i * 0.07, type: 'square', f: mtof(m), dur: 0.14, vol: 0.08 * s.vol, pan: s.pan, lp: 3000, echo: 0.3 }));
    },
    lureBeep(t, s, p) {
      tone({ t, type: 'square', f: 880 * (p.pitch || 1), dur: 0.06, vol: 0.09 * s.vol, pan: s.pan, lp: 3500 });
    },
    bubble(t, s) {
      tone({ t, type: 'sine', f: 180, f2: 520, dur: 0.5, vol: 0.25 * s.vol, pan: s.pan, verb: 0.5 });
      tone({ t, type: 'triangle', f: 360, f2: 1040, dur: 0.5, vol: 0.1 * s.vol, pan: s.pan });
    },
    bubblePop(t, s) {
      tone({ t, type: 'sine', f: 900, f2: 200, dur: 0.25, vol: 0.2 * s.vol, pan: s.pan });
      noise({ t, dur: 0.1, vol: 0.15 * s.vol, type: 'bandpass', f: 2000, q: 2, pan: s.pan });
    },
    pal(t, s) {
      [60, 67, 72, 79].forEach((m, i) => tone({ t: t + i * 0.06, type: 'square', f: mtof(m), dur: 0.12, vol: 0.1 * s.vol, pan: s.pan, lp: 2500 }));
      tone({ t, type: 'sawtooth', f: 100, f2: 400, dur: 0.35, vol: 0.12 * s.vol, pan: s.pan, lp: 1200 });
    },
    palBye(t, s) {
      [79, 72, 67, 60].forEach((m, i) => tone({ t: t + i * 0.06, type: 'square', f: mtof(m), dur: 0.1, vol: 0.08 * s.vol, pan: s.pan, lp: 2500 }));
    },
    allyShot(t, s, p) {
      tone({ t, type: 'square', f: p.sentry ? 1400 : 1100, f2: 300, dur: 0.06, vol: 0.12 * s.vol, pan: s.pan, lp: 4000 });
      noise({ t, dur: 0.04, vol: 0.12 * s.vol, type: 'bandpass', f: 3000, q: 1, pan: s.pan });
    },
    sentry(t, s) {
      tone({ t, type: 'sawtooth', f: 80, f2: 320, dur: 0.4, vol: 0.18 * s.vol, pan: s.pan, lp: 1400 });
      noise({ t: t + 0.35, dur: 0.06, vol: 0.2 * s.vol, type: 'bandpass', f: 2000, q: 2, pan: s.pan });
      tone({ t: t + 0.4, type: 'triangle', f: 1320, dur: 0.15, vol: 0.1 * s.vol, pan: s.pan });
    },
    armor(t) {
      noise({ t, dur: 0.12, vol: 0.3, type: 'bandpass', f: 1500, q: 2 });
      tone({ t: t + 0.05, type: 'triangle', f: 660, f2: 990, dur: 0.25, vol: 0.14 });
      noise({ t: t + 0.15, dur: 0.08, vol: 0.25, type: 'bandpass', f: 2600, q: 3 });
    },
    armorBreak(t) {
      noise({ t, dur: 0.3, vol: 0.4, type: 'highpass', f: 3000, verb: 0.3 });
      tone({ t, type: 'square', f: 500, f2: 120, dur: 0.25, vol: 0.12, lp: 1800 });
    },
    teleport(t) {
      tone({ t, type: 'sawtooth', f: 120, f2: 1800, dur: 0.45, vol: 0.18, lp: 600, lp2: 6000, verb: 0.6 });
      tone({ t: t + 0.35, type: 'sine', f: 1800, f2: 200, dur: 0.5, vol: 0.18, verb: 0.6 });
      noise({ t, dur: 0.8, vol: 0.2, type: 'bandpass', f: 400, f2: 5000, q: 1.5, verb: 0.5 });
    },
  });
  Object.assign(THROTTLE, { zap: 0.1, flame: 0.1, laser: 0.2, bang: 0.2, allyShot: 0.05, lureBeep: 0.08 });

  /* ------------------------------------------------------------------ */
  /* formant voice engine: creature vocals                              */
  /* ------------------------------------------------------------------ */
  // F1..F3 (Hz) for an adult male vocal tract; creatures scale these with `fs`
  const VOWELS = {
    uh: [640, 1190, 2390], aa: [730, 1090, 2440], oo: [300, 870, 2240], oh: [570, 840, 2410],
    eh: [530, 1840, 2480], ee: [270, 2290, 3010], ae: [660, 1720, 2410], er: [490, 1350, 1690],
  };
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  /** n vowels from a palette with no immediate repeats */
  function vowelPath(pal, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let v = pick(pal);
      if (v === out[i - 1]) v = pick(pal);
      out.push(v);
    }
    return out;
  }

  // Unnormalised PeriodicWaves carry their own amplitude, so a voice needs no extra gain nodes
  // for its voiced/breath balance or its fry LFO depth. Cached by shape + quantised amplitude.
  const waves = {};
  function ampWave(shape, amp) {
    const key = shape + amp;
    if (waves[key]) return waves[key];
    const N = shape === 'sine' ? 2 : 96, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) {
      if (shape === 'sine') im[n] = amp;
      else if (shape === 'square') im[n] = n % 2 ? (amp * 4) / (n * Math.PI) : 0;
      else if (shape === 'pulse') re[n] = ((amp * 2) / (n * Math.PI)) * Math.sin(n * Math.PI * 0.2);
      else im[n] = (amp * 2) / (n * Math.PI);
    }
    return (waves[key] = ctx.createPeriodicWave(re, im, { disableNormalization: true }));
  }
  const qLog = (v) => Math.pow(2, Math.round(Math.log2(v) * 3) / 3);
  // the waves the voice kinds use, built one per scheduler tick so first use is never a hitch
  const warmQueue = [];
  for (let k = -11; k <= 9; k++) warmQueue.push(['saw', Math.pow(2, k / 3)]);
  for (let k = 1; k <= 5; k++) warmQueue.push(['pulse', Math.pow(2, k / 3)], ['square', Math.pow(2, k / 3)]);
  for (let k = 1; k <= 9; k++) warmQueue.push(['sine', k / 20]);
  function warmTick() {
    const w = warmQueue.pop();
    if (w) ampWave(w[0], w[1]);
  }

  const curves = {};
  /** tanh drive curve; `b` rescales it for a source that was boosted by 1/b (see voice()). */
  function shaperCurve(k, b) {
    k = Math.round(k * 4) / 4;
    b = Math.round(b * 20) / 20 || 1;
    const key = k + '|' + b;
    if (!curves[key]) {
      const n = 1024, c = new Float32Array(n), drive = 1 + k * 9, norm = Math.tanh(drive) * b;
      for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * drive * b) / norm;
      curves[key] = c;
    }
    return curves[key];
  }

  /**
   * One creature vocal. Glottal source (saw / pulse / square with jitter, vibrato, pitch cracks and
   * a fast "fry" LFO doing AM+FM) + breath noise -> 2-3 parallel bandpass formants gliding through
   * a vowel path -> optional waveshaper -> envelope -> optional helmet muffle -> route().
   * o: { f0, dur, vowels, fs, q, nf, contour [[pos, mult]..], wave, voiced, breath, jitter, vib, vibRate,
   *      crack, fry, fryAmt, rough, gurgle, drive, lp, metal, a, vol, verb, dest }
   */
  function voice(t, s, o) {
    let vol = (o.vol === undefined ? 0.3 : o.vol) * s.vol;
    if (vol < 0.002) return;
    const dur = o.dur || 1, end = t + dur, f0 = o.f0 || 90;
    // breath noise enters at unity, so the glottal wave is scaled by voiced/breath instead and the
    // output by breath: same mix, two fewer nodes.
    const br = o.breath ? U.clamp(o.breath, 0.05, 1) : 0;
    const vAmp = qLog(Math.max(0.02, (o.voiced === undefined ? 1 : o.voiced) / (br || 1)));
    if (br) vol *= br;

    // --- glottal source with contour, vibrato, jitter, cracks (automation only, no extra nodes)
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(ampWave(o.wave || 'saw', vAmp));
    const fq = osc.frequency;
    const ct = o.contour || [[0, 1], [0.4, 1.15], [1, 0.7]];
    const jit = o.jitter || 0.03, vib = o.vib || 0.02, vr = (o.vibRate || 5) * 6.2832, ph = Math.random() * 6.28;
    const step = dur > 1.2 ? 0.06 : 0.045;
    let ci = 0, drift = 0;
    fq.setValueAtTime(Math.max(20, f0 * ct[0][1]), t);
    for (let x = step; x < dur + step * 0.5; x += step) {
      const u = Math.min(1, x / dur);
      while (ci < ct.length - 2 && u > ct[ci + 1][0]) ci++;
      const c0 = ct[ci], c1 = ct[ci + 1] || c0;
      const k = c1[0] > c0[0] ? U.clamp((u - c0[0]) / (c1[0] - c0[0]), 0, 1) : 0;
      drift = drift * 0.55 + (Math.random() * 2 - 1) * jit;
      let m = (c0[1] + (c1[1] - c0[1]) * k) * (1 + drift + vib * Math.sin(ph + x * vr));
      if (o.crack && Math.random() < o.crack) m *= Math.random() < 0.5 ? 1.5 : 0.62;
      fq.linearRampToValueAtTime(Math.max(20, f0 * m), t + Math.min(x, dur));
    }

    // --- source mix: voiced + breath, with irregular AM (rough) and bubbling (gurgle)
    const src = ctx.createGain();
    const fa = o.fryAmt || 0, base = 1 - fa * 0.5;
    const g = src.gain;
    g.setValueAtTime(base, t);
    if (o.rough || o.gurgle) {
      const rough = Math.min(0.95, (o.rough || 0) + (o.gurgle || 0));
      const st = o.gurgle ? 0.028 : 0.05;
      for (let x = st; x < dur; x += st * R(0.6, 1.4)) g.linearRampToValueAtTime(base * (1 - rough * Math.random()), t + x);
    }
    osc.connect(src);
    let nz = null;
    if (br) {
      nz = ctx.createBufferSource();
      nz.buffer = noiseBuf;
      nz.loop = true;
      nz.connect(src);
    }
    let lfo = null;
    if (fa) {
      // fast "vocal fry" LFO: irregular-sounding amplitude roughness on the source
      lfo = ctx.createOscillator();
      lfo.setPeriodicWave(ampWave('sine', Math.round(fa * 10) / 20));
      lfo.frequency.value = o.fry || 25;
      lfo.connect(g);
    }

    // --- formant bank (parallel bandpasses gliding between vowel targets)
    const amp = ctx.createGain();
    let sum = amp;
    if (o.drive) {
      const sh = ctx.createWaveShaper();
      sh.curve = shaperCurve(o.drive, br || 1);
      sh.connect(amp);
      sum = sh;
    }
    const vw = o.vowels || ['uh', 'oo'];
    // F3 is inaudible once distance muffling is heavy: skip it there
    const fs = o.fs || 1, q = o.q || 6, nf = s.lp && s.lp < 3000 ? Math.min(2, o.nf || 3) : o.nf || 3;
    const tp = vw.map((_, j) => (vw.length < 2 ? 0 : U.clamp(j / (vw.length - 1) + (j && j < vw.length - 1 ? R(-0.12, 0.12) : 0), 0, 1)));
    let hi = null;
    for (let i = 0; i < nf; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q * (1 + i * 0.35);
      const fr = bp.frequency, rnd = R(0.94, 1.06);
      const fAt = (j) => Math.min(9000, (VOWELS[vw[j]] || VOWELS.uh)[i] * fs * rnd);
      fr.setValueAtTime(fAt(0), t);
      if (i === 0 && o.gurgle) {
        // wet bubbling: F1 jumps around rapidly on top of the vowel glide
        let j = 0;
        for (let x = 0.03; x < dur; x += R(0.02, 0.045)) {
          const u = x / dur;
          while (j < vw.length - 2 && u > tp[j + 1]) j++;
          const k = tp[j + 1] > tp[j] ? U.clamp((u - tp[j]) / (tp[j + 1] - tp[j]), 0, 1) : 0;
          const f = fAt(j) + (fAt(Math.min(j + 1, vw.length - 1)) - fAt(j)) * k;
          fr.linearRampToValueAtTime(f * (1 + o.gurgle * R(-0.5, 0.9)), t + x);
        }
      } else {
        for (let j = 1; j < vw.length; j++) fr.linearRampToValueAtTime(fAt(j), t + dur * tp[j]);
      }
      src.connect(bp);
      if (i === 0) bp.connect(sum);
      else {
        // F2 + F3 share one level control (F3 sits lower through its narrower Q)
        if (!hi) {
          hi = ctx.createGain();
          hi.gain.value = 0.55 * (o.bright || 1);
          hi.connect(sum);
        }
        bp.connect(hi);
      }
    }

    // --- envelope
    const a = Math.min(o.a || 0.08, dur * 0.4);
    const ag = amp.gain;
    ag.setValueAtTime(0.0001, t);
    ag.linearRampToValueAtTime(vol, t + a);
    ag.linearRampToValueAtTime(vol * R(0.65, 1), t + Math.max(a + 0.01, dur * R(0.5, 0.7)));
    ag.exponentialRampToValueAtTime(0.0001, end);

    // --- optional helmet: lowpassed + tin-can comb + metallic resonances
    let out = amp;
    if (o.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lp;
      lp.Q.value = o.metal ? 2.5 : 0.7;
      out.connect(lp);
      out = lp;
    }
    if (o.metal) {
      const dl = ctx.createDelay(0.05);
      dl.delayTime.value = R(0.0022, 0.0045);
      const mix = ctx.createGain();
      mix.gain.value = 0.8;
      out.connect(mix);
      out.connect(dl);
      dl.connect(mix);
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = R(1100, 1900);
      pk.Q.value = 22;
      pk.gain.value = 16;
      mix.connect(pk);
      out = pk;
    }
    route(out, { pan: s.pan, verb: o.verb, dest: o.dest });

    osc.start(t);
    osc.stop(end + 0.05);
    if (nz) {
      nz.start(t, Math.random() * 1.5);
      nz.stop(end + 0.05);
    }
    if (lfo) {
      lfo.start(t);
      lfo.stop(end + 0.05);
    }
  }

  /** Randomised settings per zombie type: every call differs in pitch, vowels, length, roughness. */
  const VOICE_KINDS = {
    walker: () => ({
      f0: R(66, 104), dur: R(0.8, 1.6), vowels: vowelPath(['uh', 'oo', 'oh', 'aa', 'er'], 2 + ((Math.random() * 2) | 0)),
      fs: R(0.84, 1.04), q: R(5, 8), contour: [[0, R(0.85, 1)], [R(0.25, 0.55), R(1.05, 1.3)], [1, R(0.55, 0.8)]],
      breath: R(0.15, 0.35), jitter: 0.035, vib: R(0.01, 0.03), vibRate: R(3, 6), fry: R(14, 30), fryAmt: R(0.2, 0.55),
      rough: R(0.2, 0.5), a: R(0.06, 0.2), vol: 0.8, verb: 0.25,
    }),
    runner: () => ({
      f0: R(95, 140), dur: R(0.4, 0.9), vowels: vowelPath(['aa', 'ae', 'uh', 'eh'], 2 + ((Math.random() * 2) | 0)),
      fs: R(0.95, 1.1), q: R(3, 4.5), contour: [[0, 0.9], [0.15, R(1.2, 1.45)], [0.6, R(1, 1.2)], [1, R(0.6, 0.8)]],
      breath: R(0.6, 0.9), jitter: 0.09, vib: 0.02, vibRate: 7, fry: R(30, 48), fryAmt: R(0.5, 0.8), rough: 0.5,
      drive: R(0.4, 0.7), a: 0.03, vol: 0.18, verb: 0.2,
    }),
    sprinter: () => ({
      f0: R(210, 340), dur: R(0.4, 0.85), vowels: vowelPath(['ee', 'eh', 'ae', 'aa'], 2 + ((Math.random() * 2) | 0)),
      fs: R(1.2, 1.4), q: R(6, 9), contour: [[0, 0.85], [0.3, R(1.3, 1.6)], [0.8, R(1.2, 1.45)], [1, R(0.9, 1.1)]],
      breath: 0.45, jitter: 0.05, vib: R(0.03, 0.06), vibRate: R(7, 10), fry: R(40, 70), fryAmt: R(0.2, 0.4), crack: 0.05,
      drive: 0.35, a: 0.04, vol: 0.17, verb: 0.35,
    }),
    brute: () => ({
      f0: R(38, 58), dur: R(1.0, 1.6), vowels: vowelPath(['oo', 'oh', 'uh', 'aa'], 2 + ((Math.random() * 2) | 0)),
      fs: R(0.62, 0.78), q: R(5, 7), contour: [[0, 0.8], [0.3, R(1.1, 1.25)], [1, R(0.55, 0.75)]],
      breath: 0.35, jitter: 0.04, vib: 0.015, vibRate: 3, fry: R(12, 20), fryAmt: 0.5, rough: 0.3, drive: 0.45,
      a: 0.15, vol: 0.27, verb: 0.45,
    }),
    shrieker: () => ({
      f0: R(480, 760), wave: 'pulse', dur: R(0.5, 1.0), vowels: vowelPath(['ee', 'ae', 'eh'], 2 + ((Math.random() * 2) | 0)),
      fs: R(1.5, 1.8), q: 7, contour: [[0, 0.75], [0.2, R(1.3, 1.5)], [0.7, R(1.15, 1.35)], [1, R(0.8, 1)]],
      breath: 0.4, jitter: 0.06, vib: R(0.04, 0.07), vibRate: R(24, 34), fry: R(55, 70), fryAmt: 0.4, crack: 0.06,
      drive: 0.6, a: 0.03, vol: 0.13, verb: 0.5, bright: 1.3,
    }),
    spitter: () => ({
      f0: R(85, 130), dur: R(0.6, 1.2), vowels: vowelPath(['oo', 'uh', 'oh', 'er'], 2 + ((Math.random() * 2) | 0)),
      fs: R(0.9, 1.05), q: R(4, 6), contour: [[0, 1], [0.5, R(0.9, 1.2)], [1, R(0.6, 0.85)]],
      breath: 0.5, jitter: 0.06, fry: R(16, 24), fryAmt: 0.4, gurgle: R(0.35, 0.55), rough: 0.25, a: 0.05, vol: 0.7, verb: 0.25,
    }),
    bloater: () => ({
      f0: R(40, 64), wave: 'square', dur: R(0.6, 1.3), vowels: vowelPath(['oh', 'oo', 'aa', 'uh'], 2 + ((Math.random() * 2) | 0)),
      fs: R(0.58, 0.7), q: 5, nf: 2, contour: [[0, 1.1], [0.3, R(1.0, 1.2)], [1, R(0.5, 0.65)]],
      breath: 0.35, jitter: 0.08, fry: R(7, 12), fryAmt: 0.75, gurgle: 0.25, rough: 0.2, drive: 0.3, a: 0.05, vol: 0.34, verb: 0.35,
    }),
    leaper: () => ({
      f0: R(150, 260), dur: R(0.4, 0.8), voiced: R(0.08, 0.2), breath: 1, vowels: vowelPath(['ee', 'eh', 'ae'], 2),
      fs: R(1.3, 1.6), q: 3, contour: [[0, 1], [1, R(1.05, 1.3)]], jitter: 0.1, fry: R(22, 38), fryAmt: 0.85, rough: 0.6,
      a: 0.02, vol: 0.65, verb: 0.25,
    }),
    boss: () => ({
      f0: R(36, 50), dur: R(1.2, 1.6), vowels: vowelPath(['aa', 'oh', 'uh', 'aa', 'ae'], 3), fs: R(0.6, 0.7), q: 4,
      contour: [[0, 0.8], [0.2, R(1.1, 1.25)], [0.7, R(0.95, 1.05)], [1, R(0.55, 0.7)]],
      breath: 0.6, jitter: 0.05, vib: 0.02, vibRate: 4, fry: R(20, 32), fryAmt: 0.6, rough: 0.35, drive: 1, a: 0.12,
      vol: 0.42, verb: 0.9,
    }),
  };
  VOICE_KINDS.helmet = () => Object.assign(VOICE_KINDS.walker(), { lp: R(650, 950), metal: true, verb: 0.15, vol: 0.6 });

  /** Extra layers that make some kinds more than a single voice. */
  const VOICE_LAYERS = {
    brute(t, s, o) {
      tone({ t, type: 'sine', f: o.f0 * 0.98, f2: o.f0 * 0.7, dur: o.dur, vol: 0.14 * s.vol, pan: s.pan, a: 0.15, sustain: true, r: o.dur * 0.4 });
      noise({ t, dur: o.dur * 0.8, vol: 0.12 * s.vol, type: 'lowpass', f: 260, pan: s.pan, a: 0.1 });
    },
    shrieker(t, s, o) {
      tone({ t, type: 'square', f: o.f0 * 2, f2: o.f0 * 2.6, dur: o.dur * 0.8, vol: 0.03 * s.vol, pan: s.pan, lp: 5200, vib: 80, vibRate: 47 });
      crackles(t, s, 5, o.dur * 0.8, 0.16, 3500, 8000);
    },
    spitter(t, s, o) {
      bubbles(t + 0.05, s, 3 + ((Math.random() * 3) | 0), o.dur * 0.85, 0.1, 260, 650);
    },
    bloater(t, s, o) {
      tone({ t, type: 'sine', f: o.f0, f2: o.f0 * 0.6, dur: o.dur, vol: 0.2 * s.vol, pan: s.pan });
      bubbles(t + 0.1, s, 2, o.dur * 0.7, 0.12, 120, 260);
    },
    leaper(t, s, o) {
      crackles(t, s, 5 + ((Math.random() * 5) | 0), o.dur, 0.2, 2800, 5200, 6, 0.008);
    },
    boss(t, s, o) {
      // detuned upper layer + octave-down layer + sub + roar noise
      voice(t, s, Object.assign({}, o, { f0: o.f0 * R(1.006, 1.015) * 2, wave: 'pulse', vol: o.vol * 0.45, verb: o.verb * 0.6, drive: 0.6 }));
      voice(t, s, Object.assign({}, o, { f0: o.f0 * 0.5, nf: 2, vol: o.vol * 0.6, verb: 0.3, breath: 0.2 }));
      tone({ t, type: 'sine', f: 42, f2: 26, dur: o.dur, vol: 0.4 * s.vol, pan: s.pan, a: 0.1, sustain: true, r: o.dur * 0.5 });
      noise({ t, dur: o.dur, vol: 0.28 * s.vol, type: 'lowpass', f: 900, f2: 240, pan: s.pan, a: 0.08, verb: 0.6 });
    },
  };

  /** Shared entry: build a kind's options, apply caller tweaks ({dur, durMul, pitch}), play voice + layers. */
  function creatureVoice(t, s, kind, p) {
    if (!VOICE_KINDS[kind]) kind = 'walker';
    const o = VOICE_KINDS[kind]();
    p = p || {};
    if (p.dur) o.dur = p.dur;
    if (p.durMul) o.dur *= p.durMul;
    if (p.contour) o.contour = p.contour;
    if (p.kind && p.pitch && p.pitch > 0) o.f0 *= U.clamp(p.pitch, 0.25, 4);
    voice(t, s, o);
    const layer = VOICE_LAYERS[kind === 'helmet' ? '' : kind];
    if (layer) layer(t, s, o);
    return o;
  }

  /** Inharmonic struck-metal partials. */
  function metalHit(t, s, f, dur, vol) {
    [1, 2.76, 5.4, 8.93].forEach((r, i) => tone({ t, type: 'sine', f: f * r * R(0.98, 1.02), dur: dur / (1 + i * 0.6), vol: (vol / (1 + i)) * s.vol, pan: s.pan, verb: i ? 0 : 0.3 }));
  }
  /** Random times in [0, span), sorted, at least `gap` apart. */
  function times(n, span, gap) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(Math.random() * span);
    a.sort((x, y) => x - y);
    return a.filter((x, i) => i === 0 || x - a[i - 1] >= gap);
  }
  /** n crackles / clicks / splats from ONE noise source + filter + gate (cheap, any n). */
  function crackles(t, s, n, span, vol, lo, hi, q, decay) {
    const v = vol * s.vol;
    if (v < 0.002) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q || 5;
    f.frequency.setValueAtTime((lo + hi) / 2, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    const dc = decay || 0.006;
    for (const x of times(n, span, dc * 2.5)) {
      f.frequency.setValueAtTime(R(lo, hi), t + x);
      g.gain.setValueAtTime(v * R(0.5, 1), t + x);
      g.gain.setTargetAtTime(0, t + x + 0.001, dc * R(0.6, 1.4));
    }
    src.connect(f);
    f.connect(g);
    route(g, { pan: s.pan });
    src.start(t, Math.random() * 1.5);
    src.stop(t + span + dc * 8 + 0.05);
  }
  /** n wet bubble blips (rising sine chirps) from ONE oscillator. */
  function bubbles(t, s, n, span, vol, lo, hi) {
    const v = vol * s.vol;
    if (v < 0.002) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    osc.frequency.setValueAtTime(lo, t);
    for (const x of times(n, span, 0.08)) {
      const f = R(lo, hi), d = R(0.03, 0.065);
      osc.frequency.setValueAtTime(f, t + x);
      osc.frequency.exponentialRampToValueAtTime(f * R(1.8, 2.6), t + x + d);
      g.gain.setValueAtTime(v, t + x);
      g.gain.setTargetAtTime(0, t + x + 0.002, d / 3);
    }
    osc.connect(g);
    route(g, { pan: s.pan });
    osc.start(t);
    osc.stop(t + span + 0.15);
  }

  /* ---------------- creature voices, special zombies, boss, facilities, mods ---------------- */
  Object.assign(SFX, {
    voice(t, s, p) {
      creatureVoice(t, s, p.kind, p);
    },
    bite(t, s) {
      const v = s.vol, pan = s.pan;
      noise({ t, dur: 0.035, vol: 0.5 * v, type: 'bandpass', f: 2600, q: 1.4, pan });
      tone({ t, type: 'square', f: 1100, f2: 260, dur: 0.03, vol: 0.12 * v, pan, lp: 3000 });
      tone({ t: t + 0.02, type: 'sine', f: 320, f2: 85, dur: 0.13, vol: 0.4 * v, pan });
      for (let i = 0; i < 4; i++) noise({ t: t + 0.04 + i * R(0.025, 0.045), dur: 0.05, vol: (0.32 - i * 0.05) * v, type: 'bandpass', f: R(700, 1500), f2: R(300, 600), q: 2, pan });
      noise({ t: t + 0.03, dur: 0.18, vol: 0.2 * v, type: 'lowpass', f: 900, f2: 250, pan });
    },
    helmetBreak(t, s) {
      noise({ t, dur: 0.06, vol: 0.45 * s.vol, type: 'highpass', f: 2500, pan: s.pan });
      metalHit(t, s, R(380, 520), 0.9, 0.2);
      let x = 0.12, gap = 0.16;
      for (let i = 0; i < 5; i++, x += gap, gap *= 0.72) {
        noise({ t: t + x, dur: 0.03, vol: (0.22 - i * 0.03) * s.vol, type: 'bandpass', f: R(1800, 4200), q: 4, pan: s.pan });
        tone({ t: t + x, type: 'triangle', f: R(1400, 2600), dur: 0.08, vol: 0.05 * s.vol, pan: s.pan });
      }
    },
    spit(t, s) {
      noise({ t, dur: 0.2, vol: 0.28 * s.vol, type: 'bandpass', f: 380, f2: 1300, q: 3, pan: s.pan, a: 0.05 });
      tone({ t, type: 'sawtooth', f: 90, f2: 140, dur: 0.18, vol: 0.06 * s.vol, pan: s.pan, lp: 600, vib: 20, vibRate: 30 });
      noise({ t: t + 0.17, dur: 0.09, vol: 0.4 * s.vol, type: 'bandpass', f: 2400, f2: 800, q: 1.5, pan: s.pan });
      tone({ t: t + 0.18, type: 'sine', f: 700, f2: 180, dur: 0.07, vol: 0.18 * s.vol, pan: s.pan });
    },
    acidSplash(t, s) {
      noise({ t, dur: 0.2, vol: 0.5 * s.vol, type: 'lowpass', f: 1800, f2: 300, pan: s.pan });
      tone({ t, type: 'sine', f: 200, f2: 60, dur: 0.14, vol: 0.3 * s.vol, pan: s.pan });
      noise({ t: t + 0.06, dur: 0.6, vol: 0.13 * s.vol, type: 'highpass', f: 4200, pan: s.pan, a: 0.06 });
      crackles(t + 0.08, s, 6, 0.5, 0.12, 3000, 7000);
    },
    acidSizzle(t, s) {
      noise({ t, dur: 0.16, vol: 0.06 * s.vol, type: 'highpass', f: 3800, pan: s.pan, a: 0.02 });
      noise({ t, dur: 0.12, vol: 0.05 * s.vol, type: 'bandpass', f: 900, q: 2, pan: s.pan });
      crackles(t, s, 2, 0.12, 0.07, 3500, 6500);
    },
    swell(t, s) {
      creatureVoice(t, s, 'bloater', { dur: 0.8, contour: [[0, 0.6], [0.7, 1.3], [1, 1.7]] });
      tone({ t, type: 'sawtooth', f: 85, f2: 230, dur: 0.8, vol: 0.12 * s.vol, pan: s.pan, lp: 500, lp2: 1400, vib: 18, vibRate: 11, a: 0.2, sustain: true });
      noise({ t, dur: 0.8, vol: 0.14 * s.vol, type: 'bandpass', f: 300, f2: 1400, q: 4, pan: s.pan, a: 0.3, sustain: true });
      bubbles(t + 0.15, s, 5, 0.6, 0.1, 200, 520);
    },
    bloaterPop(t, s) {
      tone({ t, type: 'sine', f: 95, f2: 28, dur: 0.55, vol: 0.75 * s.vol, pan: s.pan });
      noise({ t, dur: 0.6, vol: 0.75 * s.vol, type: 'lowpass', f: 1900, f2: 110, pan: s.pan, verb: 0.6 });
      tone({ t, type: 'sine', f: 420, f2: 70, dur: 0.18, vol: 0.3 * s.vol, pan: s.pan });
      crackles(t + 0.04, s, 10, 0.55, 0.3, 500, 2500, 1.6, 0.02);
      bubbles(t + 0.1, s, 4, 0.5, 0.12, 150, 400);
    },
    leapWarn(t, s) {
      creatureVoice(t, s, 'leaper', { dur: 0.45, contour: [[0, 0.8], [1, 1.9]] });
      noise({ t, dur: 0.45, vol: 0.18 * s.vol, type: 'bandpass', f: 1400, f2: 5200, q: 3, pan: s.pan, a: 0.3, sustain: true });
    },
    leap(t, s) {
      noise({ t, dur: 0.32, vol: 0.5 * s.vol, type: 'bandpass', f: 380, f2: 2200, q: 1.2, pan: s.pan, a: 0.08 });
      noise({ t, dur: 0.25, vol: 0.18 * s.vol, type: 'lowpass', f: 450, pan: s.pan, a: 0.05 });
    },
    bossRoar(t, s) {
      creatureVoice(t, s, 'boss', { dur: R(2.2, 2.8) });
    },
    bossCharge(t, s) {
      for (let i = 0; i < 4; i++) {
        const x = t + i * 0.2;
        tone({ t: x, type: 'sine', f: 75, f2: 30, dur: 0.18, vol: 0.55 * s.vol, pan: s.pan });
        noise({ t: x, dur: 0.14, vol: 0.32 * s.vol, type: 'lowpass', f: 600, f2: 100, pan: s.pan });
      }
      tone({ t, type: 'sawtooth', f: 42, f2: 74, dur: 0.85, vol: 0.2 * s.vol, pan: s.pan, lp: 520, vib: 9, vibRate: 26, a: 0.06, sustain: true });
      tone({ t, type: 'square', f: 43, f2: 75, dur: 0.85, vol: 0.08 * s.vol, pan: s.pan, lp: 350, detune: 18, a: 0.06, sustain: true });
    },
    bossSlam(t, s) {
      noise({ t, dur: 0.08, vol: 0.5 * s.vol, type: 'highpass', f: 2200, pan: s.pan });
      tone({ t, type: 'sine', f: 85, f2: 24, dur: 1.0, vol: 0.7 * s.vol, pan: s.pan });
      noise({ t, dur: 1.2, vol: 0.7 * s.vol, type: 'lowpass', f: 2400, f2: 60, pan: s.pan, verb: 0.9 });
      tone({ t, type: 'sine', f: 40, f2: 27, dur: 1.4, vol: 0.45 * s.vol, pan: s.pan, a: 0.02 });
      crackles(t + 0.1, s, 12, 0.9, 0.22, 800, 4000, 3, 0.012);
    },
    bossPhase(t, s) {
      for (let i = 0; i < 4; i++) tone({ t: t + i * 0.12, type: 'square', f: i % 2 ? 660 : 880, dur: 0.11, vol: 0.12 * s.vol, pan: s.pan, lp: 2600, verb: 0.4 });
      tone({ t, type: 'sawtooth', f: 420, f2: 70, dur: 0.6, vol: 0.18 * s.vol, pan: s.pan, lp: 2000, lp2: 300 });
      for (let i = 0; i < 3; i++) {
        noise({ t: t + 0.05 + i * 0.13, dur: 0.05, vol: 0.25 * s.vol, type: 'bandpass', f: R(400, 1200), q: 3, pan: s.pan });
        metalHit(t + 0.05 + i * 0.13, s, R(200, 300), 0.3, 0.06);
      }
      creatureVoice(t + 0.45, s, 'boss', { dur: 1.4 });
    },
    bossVolley(t, s, p) {
      const n = U.clamp(p.n || 3, 1, 6);
      for (let i = 0; i < n; i++) {
        const x = t + i * 0.08;
        tone({ t: x, type: 'sine', f: 300, f2: 1300, dur: 0.24, vol: 0.18 * s.vol, pan: s.pan, vib: 40, vibRate: 22, verb: 0.3 });
        tone({ t: x, type: 'sawtooth', f: 140, f2: 620, dur: 0.18, vol: 0.08 * s.vol, pan: s.pan, lp: 2200 });
        noise({ t: x, dur: 0.05, vol: 0.14 * s.vol, type: 'bandpass', f: 2600, q: 2, pan: s.pan });
      }
    },
    bossDeath(t, s) {
      tone({ t, type: 'sawtooth', f: 300, f2: 28, dur: 2.9, vol: 0.28 * s.vol, pan: s.pan, lp: 2200, lp2: 180, verb: 0.6 });
      tone({ t, type: 'square', f: 120, f2: 20, dur: 3.2, vol: 0.1 * s.vol, pan: s.pan, lp: 600, detune: 15 });
      creatureVoice(t + 0.15, s, 'boss', { dur: 2.4, contour: [[0, 1.1], [0.25, 1.3], [1, 0.4]] });
      [0.3, 1.1, 2.4].forEach((o, i) => {
        noise({ t: t + o, dur: 0.6, vol: (0.55 - i * 0.1) * s.vol, type: 'lowpass', f: 1600, f2: 80, pan: U.clamp(s.pan + R(-0.3, 0.3), -1, 1), verb: 0.7 });
        tone({ t: t + o, type: 'sine', f: 90, f2: 26, dur: 0.5, vol: 0.5 * s.vol, pan: s.pan });
      });
      crackles(t, s, 14, 2.6, 0.2, 2500, 8000);
      metalHit(t + 2.9, s, 140, 1.6, 0.18);
      noise({ t: t + 2.9, dur: 1.2, vol: 0.5 * s.vol, type: 'lowpass', f: 900, f2: 60, pan: s.pan, verb: 1 });
    },
    fusePickup(t) {
      tone({ t, type: 'square', f: 1200, f2: 2400, dur: 0.08, vol: 0.09, lp: 4500 });
      tone({ t: t + 0.06, type: 'sine', f: 2400, f2: 3600, dur: 0.14, vol: 0.12, verb: 0.3 });
      tone({ t: t + 0.12, type: 'triangle', f: 1760, dur: 0.18, vol: 0.08 });
      crackles(t, { vol: 1, pan: 0 }, 3, 0.12, 0.1, 4000, 7500);
    },
    fuseInsert(t) {
      noise({ t, dur: 0.03, vol: 0.32, type: 'bandpass', f: 2500, q: 3 });
      tone({ t, type: 'square', f: 800, dur: 0.02, vol: 0.08 });
      noise({ t: t + 0.08, dur: 0.06, vol: 0.4, type: 'lowpass', f: 1300 });
      tone({ t: t + 0.08, type: 'sine', f: 170, f2: 80, dur: 0.1, vol: 0.32 });
      tone({ t: t + 0.12, type: 'sawtooth', f: 50, f2: 120, dur: 0.9, vol: 0.14, lp: 300, lp2: 1300, a: 0.2, sustain: true });
      tone({ t: t + 0.12, type: 'sine', f: 100, f2: 240, dur: 0.9, vol: 0.14, a: 0.2, sustain: true, verb: 0.3 });
    },
    generator(t, s) {
      const v = s.vol, pan = s.pan;
      [0, 0.22, 0.44, 0.64].forEach((o, i) => {
        noise({ t: t + o, dur: 0.16, vol: (0.3 + i * 0.04) * v, type: 'lowpass', f: 700, f2: 280, pan });
        tone({ t: t + o, type: 'square', f: 52 + i * 3, f2: 38, dur: 0.15, vol: 0.12 * v, pan, lp: 400 });
      });
      for (let i = 0; i < 6; i++) noise({ t: t + 0.82 + i * 0.075, dur: 0.06, vol: 0.3 * v, type: 'lowpass', f: 900, f2: 300, pan });
      tone({ t: t + 0.85, type: 'sawtooth', f: 30, f2: 60, dur: 1.25, vol: 0.2 * v, pan, lp: 420, vib: 3, vibRate: 13, a: 0.3, sustain: true, verb: 0.3 });
      tone({ t: t + 0.85, type: 'square', f: 60, dur: 1.25, vol: 0.07 * v, pan, lp: 300, a: 0.4, sustain: true });
      noise({ t: t + 0.9, dur: 1.15, vol: 0.1 * v, type: 'bandpass', f: 220, q: 2, pan, a: 0.3, sustain: true });
    },
    modFire(t, s) {
      noise({ t, dur: 0.22, vol: 0.28 * s.vol, type: 'bandpass', f: 300, f2: 1800, q: 1, pan: s.pan, a: 0.02 });
      noise({ t, dur: 0.28, vol: 0.18 * s.vol, type: 'lowpass', f: 900, f2: 400, pan: s.pan, a: 0.03 });
      tone({ t, type: 'sine', f: 130, f2: 60, dur: 0.1, vol: 0.18 * s.vol, pan: s.pan });
    },
    modShock(t, s) {
      noise({ t, dur: 0.04, vol: 0.32 * s.vol, type: 'highpass', f: 3000, pan: s.pan });
      crackles(t, s, 3, 0.06, 0.22, 2500, 7000);
      tone({ t, type: 'sawtooth', f: 3000, f2: 400, dur: 0.05, vol: 0.06 * s.vol, pan: s.pan });
      tone({ t, type: 'square', f: 70, dur: 0.08, vol: 0.1 * s.vol, pan: s.pan, lp: 600 });
    },
    modFrost(t, s) {
      for (let i = 0; i < 5; i++) tone({ t: t + i * 0.025, type: 'triangle', f: R(2800, 5200), dur: 0.05, vol: 0.05 * s.vol, pan: s.pan });
      noise({ t, dur: 0.2, vol: 0.12 * s.vol, type: 'highpass', f: 5000, pan: s.pan });
    },
    modBlast(t, s) {
      noise({ t, dur: 0.03, vol: 0.3 * s.vol, type: 'highpass', f: 3000, pan: s.pan });
      noise({ t, dur: 0.26, vol: 0.5 * s.vol, type: 'lowpass', f: 1600, f2: 120, pan: s.pan, verb: 0.3 });
      tone({ t, type: 'sine', f: 140, f2: 40, dur: 0.2, vol: 0.45 * s.vol, pan: s.pan });
    },
    hatch(t, s) {
      tone({ t, type: 'sawtooth', f: 140, f2: 108, dur: 0.6, vol: 0.1 * s.vol, pan: s.pan, lp: 1300, q: 6, vib: 7, vibRate: 9, a: 0.1, sustain: true });
      noise({ t, dur: 0.6, vol: 0.12 * s.vol, type: 'bandpass', f: 800, f2: 650, q: 8, pan: s.pan, a: 0.1, sustain: true });
      noise({ t: t + 0.65, dur: 0.3, vol: 0.6 * s.vol, type: 'lowpass', f: 1200, f2: 150, pan: s.pan, verb: 0.6 });
      tone({ t: t + 0.65, type: 'sine', f: 90, f2: 40, dur: 0.3, vol: 0.45 * s.vol, pan: s.pan });
      metalHit(t + 0.65, s, 330, 0.6, 0.12);
    },
    shockwave(t, s) {
      tone({ t, type: 'sine', f: 120, f2: 30, dur: 0.6, vol: 0.6 * s.vol, pan: s.pan });
      noise({ t, dur: 0.5, vol: 0.38 * s.vol, type: 'highpass', f: 1500, pan: s.pan, verb: 0.8 });
      tone({ t, type: 'sawtooth', f: 2000, f2: 80, dur: 0.5, vol: 0.18 * s.vol, pan: s.pan, lp: 5000, lp2: 400 });
      tone({ t, type: 'square', f: 60, dur: 0.4, vol: 0.1 * s.vol, pan: s.pan, lp: 700 });
      crackles(t, s, 8, 0.45, 0.25, 2000, 8000);
    },
    tierUp(t, s, p) {
      const tier = U.clamp(Math.round(p.tier || 1), 1, 3);
      const notes = [60, 64, 67, 72, 76, 79, 84].slice(0, [4, 5, 7][tier - 1]);
      const sp = 0.09 - tier * 0.012;
      noise({ t, dur: 0.25 + tier * 0.15, vol: 0.12, type: 'bandpass', f: 400, f2: 4000 + tier * 1500, q: 1.5, a: 0.15 });
      notes.forEach((m, i) => {
        tone({ t: t + i * sp, type: 'sawtooth', f: mtof(m), dur: 0.35, vol: 0.08, lp: 3200, verb: 0.3 });
        tone({ t: t + i * sp, type: 'triangle', f: mtof(m + 12), dur: 0.3, vol: 0.06 });
      });
      const end = t + notes.length * sp;
      const chord = tier === 1 ? [72, 79] : tier === 2 ? [72, 76, 79] : [72, 76, 79, 84];
      chord.forEach((m) => {
        tone({ t: end, type: 'sawtooth', f: mtof(m), dur: 0.5 + tier * 0.4, vol: 0.06, lp: 2400 + tier * 800, detune: -8, verb: 0.5, a: 0.02 });
        if (tier > 1) tone({ t: end, type: 'sawtooth', f: mtof(m), dur: 0.5 + tier * 0.4, vol: 0.05, lp: 2400 + tier * 800, detune: 8, a: 0.02 });
      });
      if (tier === 3) {
        tone({ t: end, type: 'sine', f: 65.4, f2: 49, dur: 1.4, vol: 0.4 });
        [96, 100, 103].forEach((m, i) => tone({ t: end + 0.1 + i * 0.07, type: 'sine', f: mtof(m), dur: 0.8, vol: 0.05, echo: 0.4 }));
      }
    },
    modCycle(t) {
      tone({ t, type: 'square', f: 1800, dur: 0.025, vol: 0.05, lp: 4000 });
      tone({ t: t + 0.02, type: 'triangle', f: 2600, dur: 0.03, vol: 0.05 });
    },
  });
  Object.assign(THROTTLE, {
    voice: 0.12, groan: 0.2, shriek: 0.15, bite: 0.1, spit: 0.08, acidSplash: 0.08, acidSizzle: 0.4, swell: 0.15,
    bloaterPop: 0.05, leapWarn: 0.1, leap: 0.08, helmetBreak: 0.05, bossVolley: 0.08, bossCharge: 0.3, bossSlam: 0.15,
    modFire: 0.06, modShock: 0.06, modFrost: 0.06, modBlast: 0.06, modCycle: 0.04, fusePickup: 0.1, hatch: 0.3, shockwave: 0.1,
  });
  /** Hearing range (px) for big sounds; everything else fades out at 1150 px. */
  const RANGE = {
    bossRoar: 2300, bossSlam: 2000, bossDeath: 2600, bossPhase: 2300, bossCharge: 1600, bossVolley: 1500,
    explosion: 1500, bloaterPop: 1400, generator: 1600, shockwave: 1600, nuke: 3000, lightning: 2000,
  };

  /* ------------------------------------------------------------------ */
  /* horde ambience: distant overlapping moans + breathing bed          */
  /* ------------------------------------------------------------------ */
  const horde = { target: 0, applied: -1, next: 0, bus: null };

  /** 0..1 — called every frame by the game, so it only stores the target. */
  A.setHorde = function (level) {
    level = +level || 0;
    horde.target = level <= 0 ? 0 : level >= 1 ? 1 : level;
  };

  function setupHorde() {
    const bus = (horde.bus = ctx.createGain());
    bus.gain.value = 0;
    bus.connect(sfxBus);
    const vs = ctx.createGain();
    vs.gain.value = 0.5;
    bus.connect(vs);
    vs.connect(verb);
    // continuous low breathing / crowd rumble bed with a slow irregular swell
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    n.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.9;
    const bg = ctx.createGain();
    bg.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lg = ctx.createGain();
    lg.gain.value = 0.07;
    lfo.connect(lg);
    lg.connect(bg.gain);
    n.connect(lp);
    lp.connect(bg);
    bg.connect(bus);
    n.start();
    lfo.start();
  }

  function hordeTick() {
    if (!horde.bus) return;
    const now = ctx.currentTime, lv = horde.target;
    if (Math.abs(lv - horde.applied) > 0.01 || (lv === 0 && horde.applied !== 0)) {
      horde.bus.gain.setTargetAtTime(lv * 0.9, now, 0.7);
      horde.applied = lv;
    }
    if (lv < 0.03) {
      horde.next = now + 0.2;
      return;
    }
    if (now < horde.next) return;
    horde.next = now + R(0.35, 1.2) / (0.3 + lv * 1.2);
    const t = now + R(0.03, 0.2);
    const s = { vol: R(0.35, 1), pan: R(-0.9, 0.9) };
    if (Math.random() < 0.2) {
      // a ragged distant exhale
      noise({ t, dur: R(0.6, 1.2), vol: 0.12 * s.vol, type: 'bandpass', f: R(250, 600), f2: R(150, 300), q: 2, pan: s.pan, a: 0.3, dest: horde.bus });
      return;
    }
    const kind = Math.random() < 0.7 ? 'walker' : Math.random() < 0.6 ? 'runner' : 'brute';
    const o = VOICE_KINDS[kind]();
    o.lp = R(420, 1000);
    o.dur *= R(1, 1.5);
    o.vol *= 0.9;
    o.verb = 0;
    o.dest = horde.bus;
    o.nf = 2;
    voice(t, s, o);
  }

  /** Play a named sound. p may carry {x,y} for positional audio plus sound-specific params. */
  A.play = function (name, p) {
    if (!A.ready || ctx.state !== 'running') return;
    const fn = SFX[name];
    if (!fn) return;
    const now = ctx.currentTime;
    const th = THROTTLE[name];
    if (th && now - (last[name] || -9) < th) return;
    p = p || {};
    let s;
    try {
      s = spatial(p, p.range || RANGE[name] || (name === 'voice' && p.kind === 'boss' ? 2000 : 0));
    } catch (e) {
      return;
    }
    if (s.vol < 0.012) return;
    last[name] = now;
    try {
      // far positional sounds go through a per-sound lowpass so distance muffles, not just fades
      if (s.lp && s.lp < 15000) {
        curLP = ctx.createBiquadFilter();
        curLP.type = 'lowpass';
        curLP.frequency.value = s.lp;
        curLP.Q.value = 0.6;
        curLP.connect(sfxBus);
      }
      fn(now + 0.001, s, p);
    } catch (e) {
      /* never let an audio hiccup break the game loop */
    } finally {
      curLP = curLPv = null;
    }
  };
  A.sfx = SFX; // exposed for debugging / tooling (names, direct calls)
  A.throttle = THROTTLE;

  /* ------------------------------------------------------------------ */
  /* synthwave sequencer                                                */
  /* ------------------------------------------------------------------ */
  const CHORDS = {
    Am: { root: 45, tones: [57, 60, 64] },
    F: { root: 41, tones: [57, 60, 65] },
    C: { root: 48, tones: [55, 60, 64] },
    G: { root: 43, tones: [55, 59, 62] },
    Em: { root: 40, tones: [55, 59, 64] },
  };
  const PROG = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'Em'];
  const ARP = [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 3, 2, 1, 2, 1];
  const LEAD = [
    [[0, 76, 6], [6, 74, 2], [8, 72, 6], [14, 74, 2]],
    [[0, 72, 8], [8, 69, 8]],
    [[0, 67, 6], [6, 72, 2], [8, 76, 6], [14, 79, 2]],
    [[0, 74, 12], [12, 71, 4]],
    [[0, 76, 6], [6, 81, 2], [8, 79, 6], [14, 76, 2]],
    [[0, 77, 8], [8, 72, 8]],
    [[0, 76, 6], [6, 72, 2], [8, 67, 8]],
    [[0, 71, 8], [8, 76, 8]],
  ];
  const music = { step: 0, next: 0, power: false, timer: null };

  function startMusic() {
    music.next = ctx.currentTime + 0.1;
    music.step = 0;
    if (music.timer) clearInterval(music.timer);
    music.timer = setInterval(schedule, 60);
  }

  function schedule() {
    if (!A.ready || ctx.state !== 'running') return;
    try {
      if (warmQueue.length) warmTick();
      hordeTick();
    } catch (e) {
      /* ambience is optional */
    }
    const stepDur = 60 / BPM / 4;
    if (music.next < ctx.currentTime) music.next = ctx.currentTime + 0.05; // tab was throttled
    while (music.next < ctx.currentTime + 0.25) {
      playStep(music.step, music.next, stepDur);
      music.next += stepDur;
      music.step++;
    }
  }

  function playStep(step, t, sd) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 8;
    const loop = Math.floor(step / 128);
    const ch = CHORDS[PROG[bar]];
    const on = music.power;
    const dest = musicBus;

    // pad: a slow detuned chord wash on every bar
    if (s16 === 0) {
      for (const m of ch.tones) {
        tone({ t, type: 'sawtooth', f: mtof(m), dur: sd * 16.5, vol: 0.035, lp: 1100, a: 0.5, sustain: true, r: 0.5, detune: -9, dest });
        tone({ t, type: 'sawtooth', f: mtof(m), dur: sd * 16.5, vol: 0.035, lp: 1100, a: 0.5, sustain: true, r: 0.5, detune: 9, dest });
      }
      tone({ t, type: 'sine', f: mtof(ch.root - 12), dur: sd * 16, vol: 0.12, a: 0.3, sustain: true, r: 0.4, dest });
    }

    // bass: driving eighths once the power is on, a slow pulse before
    if (on ? s16 % 2 === 0 : s16 % 8 === 0) {
      const oct = on && (s16 === 6 || s16 === 14) ? 12 : 0;
      tone({ t, type: 'sawtooth', f: mtof(ch.root + oct), dur: on ? sd * 1.7 : sd * 6, vol: 0.2, lp: on ? 900 : 420, lp2: 160, q: 4, dest });
      tone({ t, type: 'square', f: mtof(ch.root - 12 + oct), dur: on ? sd * 1.7 : sd * 6, vol: 0.07, lp: 300, dest });
    }

    // arpeggio
    if (on || s16 % 4 === 0) {
      const idx = ARP[s16];
      const m = idx === 3 ? ch.tones[0] + 12 : ch.tones[idx];
      tone({ t, type: 'square', f: mtof(m + 12), dur: sd * 1.5, vol: on ? 0.05 : 0.04, lp: 2600, lp2: 700, dest, echo: 0.5 });
    }

    if (on) {
      // drums: four-on-the-floor kick, gated snare on 2 and 4, eighth hats
      if (s16 % 4 === 0) {
        tone({ t, type: 'sine', f: 150, f2: 42, dur: 0.24, vol: 0.5, dest });
        noise({ t, dur: 0.02, vol: 0.1, type: 'highpass', f: 2500, dest });
      }
      const fill = bar === 7 && s16 >= 13;
      if (s16 === 4 || s16 === 12 || fill) {
        noise({ t, dur: 0.24, vol: fill ? 0.16 : 0.26, type: 'bandpass', f: 1900, q: 0.7, dest });
        tone({ t, type: 'triangle', f: 210, f2: 120, dur: 0.12, vol: 0.16, dest });
      }
      if (s16 % 2 === 0) noise({ t, dur: s16 % 4 === 2 ? 0.11 : 0.035, vol: s16 % 4 === 2 ? 0.06 : 0.045, type: 'highpass', f: 7500, dest });

      // lead melody on alternating 8-bar phrases
      if (loop % 2 === 1) {
        for (const n of LEAD[bar]) {
          if (n[0] === s16) {
            tone({ t, type: 'sawtooth', f: mtof(n[1]), dur: sd * n[2] * 0.95, vol: 0.055, lp: 3200, a: 0.02, sustain: true, r: 0.08, vib: 4, dest, echo: 0.6 });
            tone({ t, type: 'square', f: mtof(n[1]), dur: sd * n[2] * 0.95, vol: 0.02, lp: 2400, a: 0.02, sustain: true, r: 0.08, detune: 8, dest });
          }
        }
      }
    }
  }

  /** Power state drives the mix: muffled and sparse before, full band after. */
  A.setPower = function (on, instant) {
    music.power = on;
    if (!A.ready) return;
    const t = ctx.currentTime;
    musicFilter.frequency.cancelScheduledValues(t);
    if (instant) {
      musicFilter.frequency.setValueAtTime(on ? 16000 : 750, t);
    } else {
      musicFilter.frequency.setValueAtTime(musicFilter.frequency.value, t);
      musicFilter.frequency.exponentialRampToValueAtTime(on ? 16000 : 750, t + (on ? 2.2 : 0.6));
    }
  };
})();
