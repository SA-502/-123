/* GRAVEWAVE — Web Audio: recorded CC0 sample SFX (assets/sfx, with synthesised fallbacks), voice limiting,
   a master limiter, and a sequenced synthwave soundtrack */
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
  /** Older iPhones only start Web Audio after a sound is played inside a tap: a silent blip does it. */
  function unlock() {
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  A.init = function () {
    if (A.ctx) {
      // 'suspended' before the first tap, 'interrupted' on iPhone after a call or switching apps
      if (ctx.state !== 'running') {
        try {
          ctx.resume().catch(() => {});
        } catch (e) {
          /* old browser */
        }
        unlock();
      }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iPhone: play like a game (heard even with the silent switch on), not like a ringtone
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) {
      /* not supported */
    }
    try {
      ctx = A.ctx = new AC();
    } catch (e) {
      return;
    }
    unlock();
    // master: gentle bus compressor, then a hard limiter so a crowd of sounds can never clip the output
    master = ctx.createGain();
    master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.12;
    master.connect(comp);
    comp.connect(lim);
    lim.connect(ctx.destination);

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
    loadSamples();
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
  // Every A.play() call builds one "voice": all of that sound's nodes feed the voice's own output
  // gain (and, if it uses reverb, its own send), so the voice limiter can fade it out, stop its
  // sources and disconnect the whole sub-graph in one go. `cur` is the voice being built.
  let cur = null;
  /** Register a scheduled source with the voice being built (so it can be stopped early) + its end. */
  function track(src, end) {
    if (!cur) return;
    cur.srcs.push(src);
    if (end > cur.end) cur.end = end;
  }
  function verbIn() {
    if (!cur) return verb;
    if (!cur.send) {
      cur.send = ctx.createGain();
      if (cur.lp) {
        // far sounds: muffle the reverb send too
        cur.lpv = ctx.createBiquadFilter();
        cur.lpv.type = 'lowpass';
        cur.lpv.frequency.value = cur.lp.frequency.value;
        cur.lpv.Q.value = 0.6;
        cur.send.connect(cur.lpv);
        cur.lpv.connect(verb);
      } else cur.send.connect(verb);
    }
    return cur.send;
  }

  function route(node, o) {
    let n = node;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = U.clamp(o.pan, -1, 1);
      n.connect(p);
      n = p;
    }
    n.connect(o.dest || (cur ? cur.out : sfxBus));
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
      if (!o.dest) track(lfo, t + dur + 0.05);
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
    if (!o.dest) track(osc, t + dur + 0.05);
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
    if (!o.dest) track(src, t + dur + 0.05);
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
  const THROTTLE = { hit: 0.035, groan: 0.3, plank: 0.1, casing: 0.05, zdeath: 0.05, explosion: 0.05, deny: 0.2, step: 0.05, zattack: 0.08, flame: 0.09, slash: 0.06 };

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
    minigun: (t, v, pan) => {
      noise({ t, dur: 0.06, vol: 0.38 * v, type: 'bandpass', f: 2200, f2: 700, q: 0.8, pan, verb: 0.2 });
      tone({ t, type: 'square', f: 200, f2: 70, dur: 0.045, vol: 0.18 * v, pan });
    },
    launcher: (t, v, pan) => {
      tone({ t, type: 'sine', f: 120, f2: 45, dur: 0.22, vol: 0.55 * v, pan });
      noise({ t, dur: 0.18, vol: 0.35 * v, type: 'lowpass', f: 900, f2: 200, pan, verb: 0.4 });
    },
    flame: (t, v, pan) => {
      noise({ t, dur: 0.16, vol: 0.32 * v, type: 'lowpass', f: 700, f2: 1400, pan, a: 0.02 });
    },
    katana: (t, v, pan) => {
      noise({ t, dur: 0.14, vol: 0.3 * v, type: 'bandpass', f: 1800, f2: 4200, q: 1.4, pan });
    },
    axe: (t, v, pan) => {
      noise({ t, dur: 0.2, vol: 0.32 * v, type: 'bandpass', f: 500, f2: 1600, q: 1.1, pan });
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
    slash(t, s, p) {
      if (p.heavy) {
        noise({ t, dur: 0.22, vol: 0.32, type: 'bandpass', f: 450, f2: 1500, q: 1.1 });
        tone({ t: t + 0.02, type: 'sine', f: 140, f2: 80, dur: 0.12, vol: 0.12 });
      } else {
        noise({ t, dur: 0.15, vol: 0.28, type: 'bandpass', f: 1600, f2: 4800, q: 1.5 });
        tone({ t, type: 'triangle', f: 2600, f2: 3400, dur: 0.12, vol: 0.05 });
      }
    },
    flame(t) {
      noise({ t, dur: 0.2, vol: 0.3, type: 'lowpass', f: 650, f2: 1300, a: 0.02 });
      noise({ t, dur: 0.12, vol: 0.08, type: 'highpass', f: 3500 });
    },
    slide(t) {
      noise({ t, dur: 0.3, vol: 0.26, type: 'bandpass', f: 900, f2: 300, q: 0.8 });
      tone({ t, type: 'sine', f: 220, f2: 120, dur: 0.14, vol: 0.08 });
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
    track(osc, end + 0.05);
    if (nz) {
      nz.start(t, Math.random() * 1.5);
      nz.stop(end + 0.05);
      track(nz, end + 0.05);
    }
    if (lfo) {
      lfo.start(t);
      lfo.stop(end + 0.05);
      track(lfo, end + 0.05);
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
    track(src, t + span + dc * 8 + 0.05);
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
    track(osc, t + span + 0.15);
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
  const horde = { target: 0, applied: -1, next: 0, bus: null, muf: null, live: [] };

  /** 0..1 — called every frame by the game, so it only stores the target. */
  A.setHorde = function (level) {
    level = +level || 0;
    horde.target = level <= 0 ? 0 : level >= 1 ? 1 : level;
  };

  function setupHorde() {
    const bus = (horde.bus = ctx.createGain());
    bus.gain.value = 0;
    bus.connect(sfxBus);
    // one shared "far away" filter for the sampled distant moans
    horde.muf = ctx.createBiquadFilter();
    horde.muf.type = 'lowpass';
    horde.muf.frequency.value = 850;
    horde.muf.Q.value = 0.5;
    horde.muf.connect(bus);
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
    // at most a few overlapping distant moans (each synth moan is ~20 nodes)
    horde.live = horde.live.filter((e) => e > now);
    if (horde.live.length >= (MOBILE ? 2 : 3)) return;
    const t = now + R(0.03, 0.2);
    const s = { vol: R(0.35, 1), pan: R(-0.9, 0.9) };
    if (bank.zgroan && SM.enabled) {
      const big = Math.random() < 0.25;
      const c = { srcs: [], end: t };
      cur = c;
      try {
        smp(big ? 'zbig' : 'zgroan', t, s, { vol: big ? 0.45 : 0.55, rate: big ? R(0.6, 0.75) : R(0.7, 0.92), rv: 0, dest: horde.muf });
      } finally {
        cur = null;
      }
      horde.live.push(c.end);
      return;
    }
    horde.live.push(t + 1.6);
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

  /* ------------------------------------------------------------------ */
  /* recorded samples (assets/sfx/*.mp3, CC0 — see docs/CREDITS.md)     */
  /* ------------------------------------------------------------------ */
  // group -> number of takes (files are <group>-<n>.mp3). Loaded + decoded after the first tap.
  const BANK = {
    // most frequent first: they decode first
    pistol: 3, smg: 3, rifle: 3, shotgun: 3, minigun: 2, lmg: 3, sniper: 3, launcher: 2, laser: 3, arc: 2, flame: 2,
    hit: 4, zgroan: 10, zdeath: 5, zattack: 5, bite: 3, zscream: 4, zbig: 5, explode: 3, swing: 4, stab: 2,
    dryfire: 2, magout: 1, magin: 1, swap: 1, hurt: 4, cash: 1, deny: 2, ui: 2, roundstart: 1, roundend: 1,
    rise: 2, spit: 3, splat: 3, gulp: 2, clink: 2, lasersmall: 2, zap: 2, plank: 3, hammer: 2, door: 1,
    power: 1, generator: 1, perk: 1, upgrade: 1, papwork: 1, pdrop: 2, pickup: 2, broar: 3, bslam: 1,
    special: 1, gameover: 1, nuke: 1, siren: 1, thunder: 1, shutter: 1, bang: 2, helmet: 1, armor: 1,
    glass: 1, teleport: 1,
  };
  const bank = {}; // group -> [AudioBuffer]
  const lastTake = {};
  const SM = (A.samples = { enabled: true, loaded: 0, failed: 0, pending: 0, total: 0, dir: 'assets/sfx/' });

  function decode(ab) {
    return new Promise((res, rej) => {
      // callback form for old Safari; promise form rejects on its own in new browsers
      const pr = ctx.decodeAudioData(ab, res, rej);
      if (pr && pr.catch) pr.catch(rej);
    });
  }
  function b64(str) {
    const bin = atob(str), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  /** Encoder padding: start each take at its first audible sample. */
  function leadIn(buf) {
    const d = buf.getChannelData(0), n = Math.min(d.length, (buf.sampleRate * 0.08) | 0);
    let i = 0;
    while (i < n && Math.abs(d[i]) < 0.0025) i++;
    return i >= n ? 0 : Math.max(0, i - 8) / buf.sampleRate;
  }

  function loadSamples() {
    if (SM.total || !SM.enabled) return;
    const emb = GW.SFX_DATA; // single-file bundle: base64 mp3s inlined by tools/bundle.py --sfx
    // a page opened straight from disk cannot fetch files: stay on the synthesised set, no console noise
    if (!emb && (location.protocol === 'file:' || !window.fetch)) return;
    const jobs = [];
    for (const g in BANK) for (let i = 1; i <= BANK[g]; i++) jobs.push([g, g + '-' + i]);
    SM.total = SM.pending = jobs.length;
    let next = 0;
    const worker = () => {
      if (next >= jobs.length) return;
      const [g, f] = jobs[next++];
      const get = emb
        ? emb[f] ? Promise.resolve(b64(emb[f])) : Promise.reject(new Error('missing'))
        : fetch(SM.dir + f + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))));
      get
        .then(decode)
        .then((buf) => {
          buf._off = leadIn(buf);
          (bank[g] || (bank[g] = [])).push(buf);
          SM.loaded++;
        })
        .catch(() => SM.failed++)
        .then(() => {
          SM.pending--;
          worker();
        });
    };
    for (let k = 0; k < 4; k++) worker();
  }

  /**
   * Play one random take of a sample group into the voice being built.
   * o: { vol, rate, rv (rate jitter, default 0.05), vv (volume jitter, default 0.12), at (delay s),
   *      max (cut after s), verb, lp (lowpass Hz), pan, dest }. Returns false if the group isn't loaded.
   */
  function smp(name, t, s, o) {
    const list = SM.enabled && bank[name];
    if (!list || !list.length) return false;
    o = o || {};
    let i = (Math.random() * list.length) | 0;
    if (list.length > 1 && i === lastTake[name]) i = (i + 1) % list.length;
    lastTake[name] = i;
    const buf = list[i];
    const vv = o.vv === undefined ? 0.12 : o.vv, rv = o.rv === undefined ? 0.05 : o.rv;
    const vol = (o.vol === undefined ? 1 : o.vol) * s.vol * (1 + (Math.random() * 2 - 1) * vv);
    if (vol < 0.002) return true;
    const rate = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * rv);
    const st = t + (o.at || 0);
    const full = (buf.duration - buf._off) / rate;
    const len = o.max && o.max < full ? o.max : full;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (len < full) {
      g.gain.setValueAtTime(vol, st + Math.max(0, len - 0.05));
      g.gain.linearRampToValueAtTime(0.0001, st + len);
    }
    let n = src;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      f.Q.value = 0.7;
      src.connect(f);
      n = f;
    }
    n.connect(g);
    route(g, { pan: o.pan === undefined ? s.pan : o.pan, verb: o.verb, dest: o.dest });
    src.start(st, buf._off);
    src.stop(st + len + 0.02);
    track(src, st + len + 0.05);
    return true;
  }

  const GUN = {
    pistol: ['pistol', 0.8, 0.12], smg: ['smg', 0.62, 0.08], rifle: ['rifle', 0.75, 0.12], lmg: ['lmg', 0.82, 0.12],
    shotgun: ['shotgun', 0.95, 0.22], sniper: ['sniper', 1, 0.3], minigun: ['minigun', 0.55, 0.06],
    launcher: ['launcher', 0.85, 0.2], energy: ['laser', 0.5, 0.15],
  };
  /** creature vocal kind -> [group, volume, rate lo, rate hi, extra] */
  const VOX = {
    walker: ['zgroan', 0.5, 0.84, 1.0], runner: ['zgroan', 0.45, 1.0, 1.15], sprinter: ['zscream', 0.32, 1.05, 1.3],
    helmet: ['zgroan', 0.5, 0.8, 0.95, { lp: 1000 }], brute: ['zbig', 0.6, 0.74, 0.88], bloater: ['zbig', 0.55, 0.62, 0.72],
    spitter: ['zgroan', 0.45, 0.74, 0.86], leaper: ['zscream', 0.34, 0.85, 1.0], shrieker: ['zscream', 0.36, 1.35, 1.6],
    boss: ['broar', 0.9, 0.95, 1.05],
  };
  const PERK_RATE = { thick: 1, quick: 1.12, burner: 0.94, twin: 1.06, wind: 0.89 };
  const R2 = (a, b) => a + Math.random() * (b - a);

  /** Sample versions of the sounds; each returns false when its samples aren't loaded (-> synth). */
  const SAMPLED = {
    shot(t, s, p) {
      const cls = p.cls || 'pistol';
      if (cls === 'flame') return smp('flame', t, s, { vol: 0.45, rv: 0.08 });
      if (cls === 'katana' || cls === 'axe') return smp('swing', t, s, { vol: 0.6, rate: cls === 'axe' ? 0.75 : 1.1 });
      const g = GUN[cls] || GUN.pistol;
      if (!smp(g[0], t, s, { vol: g[1] * (p.x === undefined ? 1 : 0.8), rv: 0.06, verb: g[2] })) return false;
      if (p.up && cls !== 'energy') smp('lasersmall', t, s, { vol: 0.16, rate: 1.15 });
      return true;
    },
    arc: (t, s) => smp('arc', t, s, { vol: 0.6, verb: 0.2 }),
    empty: (t, s) => smp('dryfire', t, s, { vol: 0.5 }),
    reloadStart: (t, s) => smp('magout', t, s, { vol: 0.5 }),
    reloadEnd: (t, s) => smp('magin', t, s, { vol: 0.55 }),
    swap: (t, s) => smp('swap', t, s, { vol: 0.45 }),
    slash: (t, s, p) => smp('swing', t, s, p.heavy ? { vol: 0.6, rate: 0.72 } : { vol: 0.55, rate: 1.12 }),
    flame: (t, s) => smp('flame', t, s, { vol: 0.42, rv: 0.08 }),
    slide: (t, s) => smp('swing', t, s, { vol: 0.4, rate: 0.55 }),
    swing: (t, s) => smp('swing', t, s, { vol: 0.5 }),
    stab: (t, s) => smp('stab', t, s, { vol: 0.7 }),
    hit: (t, s) => smp('hit', t, s, { vol: 0.3, rv: 0.12, vv: 0.25 }),
    zdeath: (t, s) => smp('zdeath', t, s, { vol: 0.5, rate: R2(0.85, 1.05), rv: 0 }),
    voice(t, s, p) {
      const v = VOX[p.kind] || VOX.walker;
      const pitch = p.kind && p.pitch > 0 ? U.clamp(p.pitch, 0.5, 2) : 1;
      const o = Object.assign({ vol: v[1], rate: R2(v[2], v[3]) * pitch, rv: 0, verb: p.kind === 'boss' ? 0.3 : 0.08 }, v[4]);
      if (!smp(v[0], t, s, o)) return false;
      if (p.kind === 'spitter' || p.kind === 'bloater') smp('gulp', t, s, { vol: 0.25, rate: 0.7, at: 0.15 });
      return true;
    },
    groan(t, s, p) {
      const pitch = p.pitch || 1;
      return SAMPLED.voice(t, s, { kind: p.kind || (pitch < 0.8 ? 'brute' : pitch > 1.2 ? 'sprinter' : 'walker') });
    },
    shriek: (t, s) => SAMPLED.voice(t, s, { kind: 'shrieker' }),
    zattack: (t, s) => smp('zattack', t, s, { vol: 0.45, rate: R2(0.85, 1.05), rv: 0 }),
    bite: (t, s) => smp('bite', t, s, { vol: 0.75 }),
    hurt: (t, s) => smp('hurt', t, s, { vol: 0.8 }),
    purchase: (t, s) => smp('cash', t, s, { vol: 0.75, rv: 0.02 }),
    deny: (t, s) => smp('deny', t, s, { vol: 0.5, rv: 0 }),
    door: (t, s) => smp('door', t, s, { vol: 0.8, verb: 0.3 }),
    power: (t, s) => smp('power', t, s, { vol: 0.9, rv: 0, vv: 0 }),
    roundStart: (t, s) => smp('roundstart', t, s, { vol: 0.95, rv: 0, vv: 0 }),
    roundEnd: (t, s) => smp('roundend', t, s, { vol: 0.85, rv: 0, vv: 0 }),
    special: (t, s) => smp('special', t, s, { vol: 0.85, rv: 0, vv: 0 }),
    gameOver: (t, s) => smp('gameover', t, s, { vol: 0.95, rv: 0, vv: 0 }),
    perk: (t, s, p) => smp('perk', t, s, { vol: 0.75, rate: PERK_RATE[p.id] || 1, rv: 0 }),
    powerup: (t, s) => smp('pickup', t, s, { vol: 0.6 }),
    powerupDrop: (t, s) => smp('pdrop', t, s, { vol: 0.45, verb: 0.2 }),
    explosion: (t, s) => smp('explode', t, s, { vol: 0.95, verb: 0.25, rv: 0.08 }),
    plasmaHit: (t, s) => smp('explode', t, s, { vol: 0.45, rate: 1.45, verb: 0.2 }),
    nuke: (t, s) => smp('nuke', t, s, { vol: 1, rv: 0, vv: 0 }),
    bounce: (t, s) => smp('clink', t, s, { vol: 0.3, rv: 0.15 }),
    throw: (t, s) => smp('swing', t, s, { vol: 0.4, rate: 0.82 }),
    plank: (t, s) => smp('plank', t, s, { vol: 0.55 }),
    repair: (t, s) => smp('hammer', t, s, { vol: 0.55 }),
    papWork: (t, s) => smp('papwork', t, s, { vol: 0.65, rv: 0 }),
    papDone: (t, s) => smp('upgrade', t, s, { vol: 0.8, rv: 0 }),
    tierUp: (t, s, p) => smp('upgrade', t, s, { vol: 0.85, rate: [1, 1.06, 1.12][U.clamp(Math.round(p.tier || 1), 1, 3) - 1], rv: 0 }),
    ui: (t, s) => smp('ui', t, s, { vol: 0.4 }),
    modCycle: (t, s) => smp('ui', t, s, { vol: 0.3, rate: 1.3 }),
    rise: (t, s) => smp('rise', t, s, { vol: 0.5 }),
    lightning: (t, s) => smp('thunder', t, s, { vol: 0.8 }),
    trapOn: (t, s) => smp('arc', t, s, { vol: 0.5, rate: 0.8, verb: 0.2 }),
    zap: (t, s) => smp('zap', t, s, { vol: 0.42 }),
    shutter: (t, s) => smp('shutter', t, s, { vol: 0.8, verb: 0.25 }),
    hatch: (t, s) => smp('shutter', t, s, { vol: 0.8, rate: 0.8, verb: 0.3 }),
    bang: (t, s) => smp('bang', t, s, { vol: 0.6 }),
    siren: (t, s) => smp('siren', t, s, { vol: 0.55, rv: 0 }),
    freeze: (t, s) => smp('glass', t, s, { vol: 0.5, rate: 1.3, verb: 0.3 }),
    allyShot: (t, s) => smp('lasersmall', t, s, { vol: 0.28 }),
    armor: (t, s) => smp('armor', t, s, { vol: 0.6 }),
    armorBreak: (t, s) => smp('glass', t, s, { vol: 0.6 }),
    teleport: (t, s) => smp('teleport', t, s, { vol: 0.6, verb: 0.3 }),
    helmetBreak: (t, s) => smp('helmet', t, s, { vol: 0.55 }),
    spit: (t, s) => smp('spit', t, s, { vol: 0.55 }),
    acidSplash: (t, s) => smp('splat', t, s, { vol: 0.55 }),
    swell(t, s) {
      if (!smp('zbig', t, s, { vol: 0.45, rate: 1.15 })) return false;
      smp('gulp', t, s, { vol: 0.35, rate: 0.6, at: 0.2 });
      return true;
    },
    bloaterPop(t, s) {
      if (!smp('splat', t, s, { vol: 0.8, rate: 0.8 })) return false;
      smp('explode', t, s, { vol: 0.45, rate: 1.6 });
      return true;
    },
    leapWarn: (t, s) => smp('zscream', t, s, { vol: 0.42, rate: 1.4, rv: 0.05 }),
    leap: (t, s) => smp('swing', t, s, { vol: 0.5, rate: 0.6 }),
    bossRoar: (t, s) => smp('broar', t, s, { vol: 1, verb: 0.35 }),
    bossCharge: (t, s) => smp('bslam', t, s, { vol: 0.55, rate: 1.25 }),
    bossSlam: (t, s) => smp('bslam', t, s, { vol: 1, verb: 0.3 }),
    bossPhase(t, s) {
      if (!smp('broar', t, s, { vol: 0.9, rate: 1.1, verb: 0.35 })) return false;
      smp('bang', t, s, { vol: 0.4 });
      return true;
    },
    bossDeath(t, s) {
      if (!smp('broar', t, s, { vol: 1, rate: 0.8, verb: 0.4 })) return false;
      smp('explode', t, s, { vol: 0.8, at: 0.5 });
      smp('nuke', t, s, { vol: 0.7, at: 1.2 });
      return true;
    },
    generator: (t, s) => smp('generator', t, s, { vol: 0.8, rv: 0 }),
    modFire: (t, s) => smp('flame', t, s, { vol: 0.3, rate: 1.2 }),
    modShock: (t, s) => smp('zap', t, s, { vol: 0.3, rate: 1.2 }),
    modBlast: (t, s) => smp('explode', t, s, { vol: 0.4, rate: 1.5 }),
    shockwave(t, s) {
      if (!smp('explode', t, s, { vol: 0.8, rate: 0.8, verb: 0.3 })) return false;
      smp('arc', t, s, { vol: 0.4 });
      return true;
    },
  };

  /* ------------------------------------------------------------------ */
  /* voice limiter                                                      */
  /* ------------------------------------------------------------------ */
  // Crowds used to stack 50+ live sources (every groan ~20 nodes, every shot several) until the
  // audio thread under-ran and crackled. Now each play is one voice; a global cap and per-sound caps
  // steal the least important / oldest voice (20 ms fade), and finished voices are disconnected.
  const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));
  const MAX_VOICES = MOBILE ? 20 : 30, MAX_SRCS = MOBILE ? 32 : 52;
  /** importance 0..10 (stingers / UI never get stolen); own gun shots (no x) get +3 in play() */
  const PRI = {
    roundStart: 10, roundEnd: 10, special: 10, gameOver: 10, power: 10, purchase: 10, deny: 10, ui: 10, perk: 10,
    tierUp: 10, papDone: 10, papWork: 9, secondWind: 10, nuke: 10, powerup: 10, boxRoll: 10, boxReady: 10, boxJester: 10,
    siren: 10, bossDeath: 10, door: 9, generator: 9, fusePickup: 9, fuseInsert: 9, modCycle: 9,
    hurt: 9, reloadStart: 9, reloadEnd: 9, empty: 9, swap: 9, stab: 9, swing: 9, slash: 8, throw: 8, armorBreak: 9,
    armor: 9, heartbeat: 9, slide: 9, bite: 8, explosion: 8, bossRoar: 8, bossSlam: 8, bossCharge: 8, bossPhase: 8,
    bossVolley: 7, leapWarn: 7, shot: 6, arc: 6, flame: 6, bloaterPop: 7, shockwave: 7, lightning: 7, shutter: 7,
    zattack: 6, spit: 6, acidSplash: 6, leap: 6, swell: 6, crit: 6, helmetBreak: 5, zdeath: 5, plasmaHit: 5,
    allyShot: 4, plank: 4, bounce: 4, lureBeep: 4, modFire: 4, modShock: 4, modFrost: 4, modBlast: 4,
    hit: 3, voice: 3, groan: 3, shriek: 3, rise: 3, acidSizzle: 2,
  };
  /** max simultaneous voices of one sound */
  const CAP = {
    shot: 8, arc: 3, flame: 2, voice: MOBILE ? 4 : 6, groan: 3, shriek: 2, hit: 3, zdeath: 3, zattack: 3, bite: 2,
    explosion: 4, plasmaHit: 3, plank: 2, rise: 2, spit: 2, acidSplash: 2, acidSizzle: 1, allyShot: 3, crit: 2,
    bounce: 2, lureBeep: 1, modFire: 2, modShock: 2, modFrost: 2, modBlast: 2, swell: 2, leap: 2, leapWarn: 2,
    helmetBreak: 2, zap: 2, laser: 1, siren: 1, heartbeat: 1, papWork: 1, boxRoll: 1,
  };
  const voices = [], dying = [];
  const VS = { played: 0, stolen: 0, dropped: 0, peak: 0 };

  function release(v) {
    try {
      v.out.disconnect();
      if (v.lp) v.lp.disconnect();
      if (v.send) v.send.disconnect();
      if (v.lpv) v.lpv.disconnect();
    } catch (e) {
      /* already gone */
    }
    v.srcs.length = 0;
  }
  /** Fade a voice out fast, stop its sources, disconnect it shortly after. */
  function steal(v, now) {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
    const end = now + 0.025;
    for (const gn of [v.out.gain, v.send && v.send.gain]) {
      if (!gn) continue;
      gn.cancelScheduledValues(now);
      gn.setValueAtTime(gn.value, now);
      gn.linearRampToValueAtTime(0, end);
    }
    for (const src of v.srcs) {
      try {
        src.stop(end + 0.01);
      } catch (e) {
        /* not started yet / already stopped */
      }
    }
    v.end = end + 0.05;
    dying.push(v);
    VS.stolen++;
  }
  /** Disconnect voices that have finished (called from play() and the scheduler tick). */
  function reap(now) {
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].end + 0.05 < now) release(voices.splice(i, 1)[0]);
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      if (dying[i].end < now) release(dying.splice(i, 1)[0]);
    }
  }
  /** Make room for a new voice; false if it should be dropped instead. */
  function admit(name, pri, now) {
    const cap = CAP[name] || 4;
    let same = 0, oldest = null;
    for (const v of voices) {
      if (v.name !== name) continue;
      same++;
      if (!oldest || v.t0 < oldest.t0) oldest = v;
    }
    if (same >= cap) {
      if (oldest.pri > pri) return false;
      steal(oldest, now);
    }
    // global budget: voices, and live sources (a synthesised groan is 3-6 of them, a sample 1-2)
    let cost = 0;
    for (const v of voices) cost += v.srcs.length;
    while (voices.length && (voices.length >= MAX_VOICES || cost >= MAX_SRCS)) {
      let victim = null;
      for (const v of voices) if (!victim || v.pri < victim.pri || (v.pri === victim.pri && v.t0 < victim.t0)) victim = v;
      if (victim.pri > pri) return false;
      cost -= victim.srcs.length;
      steal(victim, now);
    }
    return true;
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
    reap(now);
    // the local player's own weapon (no position given) outranks everything in the crowd
    let pri = PRI[name] === undefined ? 5 : PRI[name];
    if ((name === 'shot' || name === 'arc' || name === 'flame') && p.x === undefined) pri += 3;
    pri -= s.muffle * 2; // far-away sounds are the first to go
    if (!admit(name, pri, now)) {
      VS.dropped++;
      return;
    }
    const v = { name, pri, t0: now, end: now + 0.1, out: null, lp: null, send: null, lpv: null, srcs: [] };
    try {
      v.out = ctx.createGain();
      // far positional sounds go through a per-voice lowpass so distance muffles, not just fades
      if (s.lp && s.lp < 15000) {
        v.lp = ctx.createBiquadFilter();
        v.lp.type = 'lowpass';
        v.lp.frequency.value = s.lp;
        v.lp.Q.value = 0.6;
        v.out.connect(v.lp);
        v.lp.connect(sfxBus);
      } else v.out.connect(sfxBus);
      cur = v;
      const sf = SAMPLED[name];
      if (!(sf && sf(now + 0.001, s, p))) fn(now + 0.001, s, p);
    } catch (e) {
      /* never let an audio hiccup break the game loop */
    } finally {
      cur = null;
    }
    if (!v.srcs.length) {
      release(v);
      return;
    }
    voices.push(v);
    VS.played++;
    if (voices.length > VS.peak) VS.peak = voices.length;
  };
  A.sfx = SFX; // exposed for debugging / tooling (names, direct calls)
  A.sampled = SAMPLED;
  A.throttle = THROTTLE;
  /** Debug / test numbers: live voices, limiter activity, sample loading. */
  A.stats = () => ({
    voices: voices.length, dying: dying.length, max: MAX_VOICES, played: VS.played, stolen: VS.stolen, dropped: VS.dropped,
    peak: VS.peak, horde: horde.live.length, samples: SM.loaded + '/' + SM.total, failed: SM.failed,
    srcs: voices.reduce((n, v) => n + v.srcs.length, 0),
    live: voices.reduce((o, v) => ((o[v.name] = (o[v.name] || 0) + 1), o), {}),
  });

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
      reap(ctx.currentTime);
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
