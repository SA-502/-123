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
  function route(node, o) {
    let n = node;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = U.clamp(o.pan, -1, 1);
      n.connect(p);
      n = p;
    }
    n.connect(o.dest || sfxBus);
    if (o.verb) {
      const s = ctx.createGain();
      s.gain.value = o.verb;
      n.connect(s);
      s.connect(verb);
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

  /** Distance attenuation + stereo pan relative to the listener (the player). */
  function spatial(p) {
    if (p.x === undefined) return { vol: 1, pan: 0 };
    const dx = p.x - A.listener.x, dy = p.y - A.listener.y;
    const d = Math.hypot(dx, dy);
    const v = U.clamp(1 - d / 1150, 0, 1);
    return { vol: v * v, pan: U.clamp(dx / 650, -1, 1) * 0.85 };
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
      const pitch = p.pitch || 1;
      const base = pitch * U.rand(70, 105);
      const dur = U.rand(0.6, 1.25);
      const vol = 0.2 * s.vol;
      if (vol < 0.004) return;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.linearRampToValueAtTime(base * U.rand(0.8, 1.3), t + dur * 0.45);
      osc.frequency.linearRampToValueAtTime(base * U.rand(0.55, 0.85), t + dur);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = U.rand(18, 34);
      const lg = ctx.createGain();
      lg.gain.value = base * 0.14;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 3.5;
      f1.frequency.setValueAtTime(U.rand(480, 820) * pitch, t);
      f1.frequency.linearRampToValueAtTime(U.rand(300, 650) * pitch, t + dur);
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.Q.value = 6;
      f2.frequency.value = U.rand(1300, 2100);
      const g2 = ctx.createGain();
      g2.gain.value = 0.35;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.09);
      g.gain.setValueAtTime(vol, t + dur * 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(f1);
      f1.connect(g);
      osc.connect(f2);
      f2.connect(g2);
      g2.connect(g);
      route(g, { pan: s.pan, verb: 0.25 });
      osc.start(t);
      lfo.start(t);
      osc.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);
    },
    shriek(t, s) {
      tone({ t, type: 'sawtooth', f: U.rand(500, 700), f2: U.rand(900, 1300), dur: 0.35, vol: 0.12 * s.vol, pan: s.pan, lp: 2600, verb: 0.5, vib: 40, vibRate: 30 });
      noise({ t, dur: 0.3, vol: 0.08 * s.vol, type: 'bandpass', f: 3200, q: 3, pan: s.pan });
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

  /** Play a named sound. p may carry {x,y} for positional audio plus sound-specific params. */
  A.play = function (name, p) {
    if (!A.ready || ctx.state !== 'running') return;
    const fn = SFX[name];
    if (!fn) return;
    const now = ctx.currentTime;
    const th = THROTTLE[name];
    if (th && now - (last[name] || -9) < th) return;
    p = p || {};
    const s = spatial(p);
    if (s.vol < 0.012) return;
    last[name] = now;
    try {
      fn(now + 0.001, s, p);
    } catch (e) {
      /* never let an audio hiccup break the game loop */
    }
  };

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
