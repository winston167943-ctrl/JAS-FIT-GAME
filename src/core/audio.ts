/** Tiny procedural audio engine: sound effects, ambience, engine hum and music. No files needed. */
export type Sfx = 'click' | 'coin' | 'success' | 'fail' | 'eat' | 'drink' | 'whoosh' | 'step' | 'rep' | 'open' | 'close' | 'camera' | 'levelup' | 'honk';

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engine: { osc: OscillatorNode; gain: GainNode } | null = null;
  private musicTimer: number | null = null;
  private ambTimer: number | null = null;
  muted = false;
  private rainNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  track = -1;
  night = false;

  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, when = 0, slideTo?: number, dest?: AudioNode): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol = 0.2, freq = 1000, when = 0, q = 1, dest?: AudioNode): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest ?? this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(s: Sfx): void {
    if (!this.ctx) return;
    switch (s) {
      case 'click': this.tone(880, 0.06, 'triangle', 0.12); break;
      case 'open': this.tone(520, 0.08, 'sine', 0.15); this.tone(780, 0.1, 'sine', 0.15, 0.06); break;
      case 'close': this.tone(780, 0.08, 'sine', 0.12); this.tone(520, 0.1, 'sine', 0.12, 0.06); break;
      case 'coin': this.tone(988, 0.08, 'square', 0.08); this.tone(1319, 0.25, 'square', 0.08, 0.08); break;
      case 'success': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.14, i * 0.08)); break;
      case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.16, i * 0.07)); break;
      case 'fail': this.tone(330, 0.3, 'sawtooth', 0.08, 0, 160); break;
      case 'rep': this.tone(660, 0.1, 'triangle', 0.15); this.noise(0.08, 0.12, 200); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.07, 0.25, 2400, i * 0.12, 2); break;
      case 'drink': for (let i = 0; i < 4; i++) this.tone(300 + Math.random() * 200, 0.08, 'sine', 0.12, i * 0.1, 700); break;
      case 'whoosh': this.noise(0.4, 0.2, 800, 0, 0.6); break;
      case 'step': this.noise(0.05, 0.05, 500, 0, 1.5); break;
      case 'camera': this.noise(0.12, 0.4, 3000, 0, 0.8); this.tone(1800, 0.05, 'square', 0.05, 0.05); break;
      case 'honk': this.tone(420, 0.25, 'square', 0.08); this.tone(520, 0.25, 'square', 0.06); break;
    }
  }

  /** Engine hum; pass null speed to stop. */
  setEngine(speed: number | null): void {
    const c = this.ctx; if (!c) return;
    if (speed === null) {
      if (this.engine) { this.engine.gain.gain.setTargetAtTime(0, c.currentTime, 0.1); const e = this.engine; setTimeout(() => e.osc.stop(), 400); this.engine = null; }
      return;
    }
    if (!this.engine) {
      const osc = c.createOscillator(); osc.type = 'sawtooth';
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      const gain = c.createGain(); gain.gain.value = 0;
      osc.connect(f).connect(gain).connect(this.master); osc.start();
      this.engine = { osc, gain };
    }
    const s = Math.abs(speed);
    this.engine.osc.frequency.setTargetAtTime(45 + s * 5, c.currentTime, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.04 + Math.min(s, 20) * 0.003, c.currentTime, 0.1);
  }

  /** Continuous rain hiss, 0..1. */
  setRain(v: number): void {
    const c = this.ctx; if (!c) return;
    if (v < 0.02) { if (this.rainNode) this.rainNode.gain.gain.setTargetAtTime(0, c.currentTime, 0.5); return; }
    if (!this.rainNode) {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      const gain = c.createGain(); gain.gain.value = 0;
      src.connect(f).connect(gain).connect(this.master); src.start();
      this.rainNode = { src, gain };
    }
    this.rainNode.gain.gain.setTargetAtTime(v * 0.12, c.currentTime, 0.5);
  }

  /** Birds by day, crickets by night. */
  private startAmbience(): void {
    const loop = () => {
      if (!this.ctx) return;
      if (this.night) {
        for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.04, 'sine', 0.015, i * 0.07);
      } else if (Math.random() < 0.6) {
        const base = 2000 + Math.random() * 1500;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(base, 0.09, 'sine', 0.025, i * 0.12, base * 1.4);
      }
      this.ambTimer = window.setTimeout(loop, 1200 + Math.random() * 2500);
    };
    if (this.ambTimer === null) loop();
  }

  static readonly TRACKS = [
    { name: 'Morning Glow', bpm: 92, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]] },
    { name: 'Gym Power', bpm: 124, chords: [[45, 52, 57], [45, 52, 57], [48, 55, 60], [43, 50, 55]] },
    { name: 'Night Run', bpm: 108, chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52]] },
  ];

  /** Starts a procedural lo-fi track, or stops music with -1. */
  playTrack(i: number): void {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
    this.track = i;
    if (i < 0 || !this.ctx) return;
    const tr = Audio.TRACKS[i];
    const stepDur = 60 / tr.bpm / 2;
    let step = 0;
    const mf = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const tick = () => {
      const bar = Math.floor(step / 8) % tr.chords.length;
      const s = step % 8;
      const ch = tr.chords[bar];
      if (s === 0 || s === 4) this.tone(60, 0.25, 'sine', 0.5, 0, 35, this.musicGain);
      if (s === 2 || s === 6) this.noise(0.15, 0.25, 1800, 0, 0.7, this.musicGain);
      this.noise(0.03, 0.08, 8000, 0, 1, this.musicGain);
      if (s === 0) ch.forEach((n) => this.tone(mf(n), stepDur * 7, 'triangle', 0.05, 0, undefined, this.musicGain));
      if (s % 2 === 1 && Math.random() < 0.6) this.tone(mf(ch[Math.floor(Math.random() * 3)] + 12), stepDur * 0.9, 'sine', 0.06, 0, undefined, this.musicGain);
      if (s === 0 || s === 3 || s === 6) this.tone(mf(ch[0] - 12), stepDur * 1.5, 'sine', 0.12, 0, undefined, this.musicGain);
      step++;
    };
    tick();
    this.musicTimer = window.setInterval(tick, stepDur * 1000);
  }
}
