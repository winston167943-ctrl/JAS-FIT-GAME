import * as THREE from 'three';
import { el } from '../ui/ui';
import type { Input } from '../core/input';
import type { Audio } from '../core/audio';
import type { Avatar } from '../characters/chibi';
import type { GameState } from '../systems/state';
import { trackPoint, TRACK } from '../world/layout';

export interface MgContext {
  host: HTMLElement;
  input: Input;
  audio: Audio;
  chibi: Avatar;
  state: GameState;
  shake: (v: number) => void;
  sweat: (v: number) => void;
  setSpeed: (v: number) => void;
  done: (quality: number, summary: string) => void;
}

export interface MiniGame {
  update(dt: number): void;
  destroy(): void;
}

/** Shared overlay scaffolding for the timing mini-games. */
abstract class OverlayGame implements MiniGame {
  protected root = el('div', 'mg');
  protected card = el('div', 'mg-card');
  protected ended = false;
  private keyHandler: (code: string) => void;
  constructor(protected ctx: MgContext, title: string, sub: string) {
    const top = el('div', 'mg-top', `<h3>${title}</h3><p>${sub}</p>`);
    const exit = el('button', 'btn mg-exit', '✕ יציאה');
    exit.addEventListener('click', () => this.finish(true));
    this.root.append(top, exit, this.card);
    ctx.host.append(this.root);
    this.keyHandler = (code) => this.onKey(code);
    ctx.input.onKey = this.keyHandler;
  }
  protected onKey(_code: string): void { /* override */ }
  protected feedback(text: string, tone: 'good' | 'perfect' | 'bad'): void {
    const f = el('div', `mg-feedback ${tone}`, text);
    this.root.append(f);
    setTimeout(() => f.remove(), 750);
  }
  protected abstract result(): { quality: number; summary: string };
  protected finish(aborted = false): void {
    if (this.ended) return;
    this.ended = true;
    const r = aborted ? { quality: 0, summary: '' } : this.result();
    setTimeout(() => this.ctx.done(r.quality, r.summary), aborted ? 0 : 900);
  }
  abstract update(dt: number): void;
  destroy(): void {
    this.root.remove();
    if (this.ctx.input.onKey === this.keyHandler) this.ctx.input.onKey = null;
    this.ctx.chibi.hold(null);
    this.ctx.chibi.action = 0;
  }
  protected hearts(n: number, max: number): string {
    return '❤️'.repeat(n) + '🤍'.repeat(Math.max(0, max - n));
  }
}

/** Dumbbell curls: hit the green zone on a moving meter. */
export class WeightsGame extends OverlayGame {
  private needle = 0;
  private dir = 1;
  private reps = 0;
  private target = 8;
  private lives = 3;
  private scores: number[] = [];
  private zone = { c: 0.5, w: 0.2 };
  private curl = 0;
  private meter: HTMLElement;
  private needleEl: HTMLElement;
  private zoneEl: HTMLElement;
  private perfEl: HTMLElement;
  private repsEl: HTMLElement;
  private heartsEl: HTMLElement;

  constructor(ctx: MgContext) {
    super(ctx, '🏋️‍♀️ תרגיל משקולות', 'עצרי את המחוג באזור הירוק — בזהב זה מושלם!');
    ctx.chibi.pose = 'lift';
    ctx.chibi.hold('dumbbells');
    this.card.innerHTML = `
      <div class="mg-row"><div class="mg-reps">0 / 8</div><div class="mg-hearts"></div></div>
      <div class="meter"><div class="zone"></div><div class="zone perfect"></div><div class="needle"></div></div>
      <div class="mg-hint">רווח / קליק / E · חזרה</div>`;
    const tap = el('button', 'mg-tap', '💪 הרימי!');
    tap.addEventListener('pointerdown', (e) => { e.preventDefault(); this.hit(); });
    this.card.append(tap);
    this.meter = this.card.querySelector('.meter')!;
    [this.zoneEl, this.perfEl] = [...this.meter.querySelectorAll('.zone')] as HTMLElement[];
    this.needleEl = this.meter.querySelector('.needle')!;
    this.repsEl = this.card.querySelector('.mg-reps')!;
    this.heartsEl = this.card.querySelector('.mg-hearts')!;
    this.newZone();
    this.render();
  }

  private newZone(): void {
    const s = this.ctx.state;
    let w = 0.2 * (0.75 + s.toneN * 0.5 - s.fatN * 0.35);
    if (s.st.hydration < 25) w *= 0.7;
    if (s.st.energy < 25) w *= 0.75;
    w = Math.max(0.07, w * (1 - this.reps * 0.03));
    this.zone = { c: 0.25 + Math.random() * 0.5, w };
    this.zoneEl.style.left = `${(this.zone.c - w / 2) * 100}%`;
    this.zoneEl.style.width = `${w * 100}%`;
    this.perfEl.style.left = `${(this.zone.c - w * 0.15) * 100}%`;
    this.perfEl.style.width = `${w * 30}%`;
  }

  protected onKey(code: string): void {
    if (code === 'Space' || code === 'KeyE' || code === 'Enter') this.hit();
  }

  private hit(): void {
    if (this.ended || this.curl > 0.2) return;
    const d = Math.abs(this.needle - this.zone.c);
    const { audio, chibi, shake, sweat } = this.ctx;
    if (d < this.zone.w * 0.15) { this.scores.push(1); this.feedback('מושלם! ✨', 'perfect'); audio.play('success'); }
    else if (d < this.zone.w / 2) { this.scores.push(0.7); this.feedback('יפה! 💪', 'good'); audio.play('rep'); }
    else { this.lives--; this.feedback('פספוס 😬', 'bad'); audio.play('fail'); chibi.expression = 'sad'; this.render(); if (this.lives <= 0) this.finish(); return; }
    this.reps++;
    this.curl = 1;
    chibi.expression = 'effort';
    shake(this.reps === this.target ? 0.8 : 0.25);
    sweat(6 + this.ctx.state.fatN * 20);
    this.render();
    if (this.reps >= this.target) { this.feedback('🔥 סט הושלם!', 'perfect'); this.finish(); }
    else this.newZone();
  }

  private render(): void {
    this.repsEl.textContent = `${this.reps} / ${this.target}`;
    this.heartsEl.textContent = this.hearts(this.lives, 3);
  }

  update(dt: number): void {
    const s = this.ctx.state;
    const speed = (0.85 + this.reps * 0.08) * (1 + s.fatN * 0.5) * (s.st.energy < 25 ? 1.25 : 1);
    if (!this.ended) {
      this.needle += this.dir * speed * dt;
      if (this.needle > 1) { this.needle = 1; this.dir = -1; }
      if (this.needle < 0) { this.needle = 0; this.dir = 1; }
      this.needleEl.style.left = `${this.needle * 100}%`;
    }
    this.curl = Math.max(0, this.curl - dt * 1.6);
    const c = this.ctx.chibi;
    c.action = Math.sin(this.curl * Math.PI);
    if (this.curl <= 0 && c.expression === 'effort') c.expression = 'happy';
  }

  protected result(): { quality: number; summary: string } {
    const q = this.scores.reduce((a, b) => a + b, 0) / this.target;
    const r = this.ctx.state.workout('weights', q);
    return { quality: q, summary: `${this.reps} חזרות · ${r}` };
  }
}

/** Resistance band overhead pulls: hold to build tension, release inside the window. */
export class BandGame extends OverlayGame {
  private fill = 0;
  private holding = false;
  private reps = 0;
  private target = 6;
  private lives = 3;
  private scores: number[] = [];
  private win = { a: 0.68, b: 0.88 };
  private fillEl: HTMLElement;
  private zoneEl: HTMLElement;
  private repsEl: HTMLElement;
  private heartsEl: HTMLElement;
  private tap: HTMLElement;

  constructor(ctx: MgContext) {
    super(ctx, '🎗️ גומיית התנגדות', 'החזיקי כדי למתוח — שחררי בדיוק בחלון הירוק');
    ctx.chibi.pose = 'band';
    this.card.innerHTML = `
      <div class="mg-row"><div class="mg-reps">0 / 6</div><div class="mg-hearts"></div></div>
      <div class="meter"><div class="fill"></div><div class="zone"></div></div>
      <div class="mg-hint">החזיקי רווח / כפתור · שחררי בזמן</div>`;
    this.tap = el('button', 'mg-tap', '✊ החזיקי ומתחי');
    const down = (e: Event) => { e.preventDefault(); this.holding = true; this.tap.classList.add('hold'); };
    const up = (e: Event) => { e.preventDefault(); if (this.holding) this.let(); };
    this.tap.addEventListener('pointerdown', down);
    this.tap.addEventListener('pointerup', up);
    this.tap.addEventListener('pointerleave', up);
    this.card.append(this.tap);
    this.fillEl = this.card.querySelector('.fill')!;
    this.zoneEl = this.card.querySelector('.zone')!;
    this.repsEl = this.card.querySelector('.mg-reps')!;
    this.heartsEl = this.card.querySelector('.mg-hearts')!;
    window.addEventListener('keyup', this.keyUp);
    this.newWin();
    this.render();
  }

  private keyUp = (e: KeyboardEvent) => { if ((e.code === 'Space' || e.code === 'KeyE') && this.holding) this.let(); };
  protected onKey(code: string): void { if (code === 'Space' || code === 'KeyE') this.holding = true; }

  private newWin(): void {
    const s = this.ctx.state;
    const w = Math.max(0.08, 0.2 * (0.8 + s.toneN * 0.4 - s.fatN * 0.3) - this.reps * 0.015);
    const a = 0.45 + Math.random() * (0.5 - w);
    this.win = { a, b: a + w };
    this.zoneEl.style.left = `${a * 100}%`;
    this.zoneEl.style.width = `${w * 100}%`;
  }

  private let(): void {
    this.holding = false;
    this.tap.classList.remove('hold');
    if (this.ended) return;
    const f = this.fill;
    const { audio, shake, sweat } = this.ctx;
    if (f >= this.win.a && f <= this.win.b) {
      const mid = (this.win.a + this.win.b) / 2;
      const q = 1 - Math.abs(f - mid) / ((this.win.b - this.win.a) / 2) * 0.4;
      this.scores.push(q);
      this.reps++;
      this.feedback(q > 0.85 ? 'מושלם! ✨' : 'יפה! 💪', q > 0.85 ? 'perfect' : 'good');
      audio.play('rep');
      shake(0.2);
      sweat(8 + this.ctx.state.fatN * 20);
      if (this.reps >= this.target) { this.feedback('🔥 סט הושלם!', 'perfect'); this.finish(); }
      else this.newWin();
    } else if (f > 0.05) {
      this.lives--;
      this.feedback(f > this.win.b ? 'יותר מדי! 😵' : 'חלש מדי 😅', 'bad');
      audio.play('fail');
      if (this.lives <= 0) this.finish();
    }
    this.render();
  }

  private render(): void {
    this.repsEl.textContent = `${this.reps} / ${this.target}`;
    this.heartsEl.textContent = this.hearts(this.lives, 3);
  }

  update(dt: number): void {
    const s = this.ctx.state;
    if (this.holding && !this.ended) {
      this.fill = Math.min(1, this.fill + dt * (0.55 + this.reps * 0.05) * (1 + s.fatN * 0.3));
      this.ctx.chibi.expression = this.fill > 0.6 ? 'effort' : 'happy';
      if (this.fill >= 1) this.let();
    } else {
      this.fill = Math.max(0, this.fill - dt * 2.2);
      if (this.fill === 0) this.ctx.chibi.expression = 'happy';
    }
    this.fillEl.style.width = `${this.fill * 100}%`;
    this.ctx.chibi.action = this.fill;
  }

  protected result(): { quality: number; summary: string } {
    const q = this.scores.reduce((a, b) => a + b, 0) / this.target;
    const r = this.ctx.state.workout('band', q);
    return { quality: q, summary: `${this.reps} חזרות · ${r}` };
  }

  destroy(): void {
    super.destroy();
    window.removeEventListener('keyup', this.keyUp);
  }
}

/** Treadmill: alternate left/right to keep the pace inside the target band. */
export class TreadmillGame extends OverlayGame {
  private speed = 0;
  private last: 'L' | 'R' | null = null;
  private time = 0;
  private dur = 20;
  private inZone = 0;
  private band = { a: 0.45, b: 0.7 };
  private bandT = 0;
  private gauge: HTMLElement;
  private fillEl: HTMLElement;
  private zoneEl: HTMLElement;
  private timeEl: HTMLElement;

  constructor(ctx: MgContext) {
    super(ctx, '🏃‍♀️ הליכון', 'לחצי שמאל-ימין לסירוגין ושמרי על הקצב בתוך האזור הירוק');
    ctx.chibi.pose = 'treadmill';
    this.card.innerHTML = `
      <div class="mg-row"><div class="speed-gauge">0.0 <small>קמ״ש</small></div><div class="mg-reps">20″</div></div>
      <div class="meter"><div class="zone"></div><div class="fill" style="opacity:.55"></div></div>
      <div class="mg-hint">A / D או ← / → לסירוגין</div>`;
    const two = el('div', 'mg-two');
    const l = el('button', 'mg-tap', '🦶 שמאל');
    const r = el('button', 'mg-tap', 'ימין 🦶');
    l.addEventListener('pointerdown', (e) => { e.preventDefault(); this.step('L'); });
    r.addEventListener('pointerdown', (e) => { e.preventDefault(); this.step('R'); });
    two.append(r, l);
    this.card.append(two);
    this.gauge = this.card.querySelector('.speed-gauge')!;
    this.fillEl = this.card.querySelector('.fill')!;
    this.zoneEl = this.card.querySelector('.zone')!;
    this.timeEl = this.card.querySelector('.mg-reps')!;
  }

  protected onKey(code: string): void {
    if (code === 'KeyA' || code === 'ArrowLeft') this.step('L');
    if (code === 'KeyD' || code === 'ArrowRight') this.step('R');
  }

  private step(f: 'L' | 'R'): void {
    if (this.ended) return;
    const s = this.ctx.state;
    if (f === this.last) {
      this.speed *= 0.6;
      this.feedback('מעידה! 😵', 'bad');
      this.ctx.audio.play('fail');
    } else {
      this.speed = Math.min(1, this.speed + 0.075 * (1 - s.fatN * 0.45 + s.toneN * 0.2));
      this.ctx.audio.play('step');
    }
    this.last = f;
  }

  update(dt: number): void {
    const s = this.ctx.state;
    if (!this.ended) {
      this.time += dt;
      this.speed = Math.max(0, this.speed - dt * (0.28 + s.fatN * 0.15));
      this.bandT += dt;
      const c = 0.55 + Math.sin(this.bandT * 0.5) * 0.18;
      this.band = { a: c - 0.12, b: c + 0.12 };
      if (this.speed >= this.band.a && this.speed <= this.band.b) this.inZone += dt;
      if (this.time >= this.dur) { this.feedback('🔥 סיימת!', 'perfect'); this.finish(); }
    }
    this.zoneEl.style.left = `${this.band.a * 100}%`;
    this.zoneEl.style.width = `${(this.band.b - this.band.a) * 100}%`;
    this.fillEl.style.width = `${this.speed * 100}%`;
    this.gauge.innerHTML = `${(this.speed * 14).toFixed(1)} <small>קמ״ש</small>`;
    this.timeEl.textContent = `${Math.max(0, Math.ceil(this.dur - this.time))}″`;
    this.ctx.chibi.expression = this.speed > 0.7 ? 'effort' : 'happy';
    this.ctx.setSpeed(1 + this.speed * 6);
    this.ctx.sweat(this.speed * (6 + s.fatN * 25));
  }

  protected result(): { quality: number; summary: string } {
    const q = Math.min(1, this.inZone / (this.dur * 0.8));
    const r = this.ctx.state.workout('treadmill', q);
    return { quality: q, summary: `${Math.round((this.inZone / this.dur) * 100)}% בקצב · ${r}` };
  }
}

/** Basketball free throws: stop the power meter at the right spot. */
export class HoopGame extends OverlayGame {
  private power = 0;
  private dir = 1;
  private shots = 0;
  private made = 0;
  private flying = 0;
  private ok = false;
  private needleEl: HTMLElement;
  private repsEl: HTMLElement;
  private ball: THREE.Mesh;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();

  constructor(ctx: MgContext, scene: THREE.Scene, hoop: THREE.Vector3) {
    super(ctx, '🏀 זריקות עונשין', '5 זריקות — עצרי את המחוג באזור הירוק');
    ctx.chibi.pose = 'shoot';
    ctx.chibi.hold('ball');
    this.card.innerHTML = `
      <div class="mg-row"><div class="mg-reps">0 / 5</div><div class="mg-hearts">🏀🏀🏀🏀🏀</div></div>
      <div class="meter"><div class="zone" style="left:62%;width:14%"></div><div class="needle"></div></div>`;
    const tap = el('button', 'mg-tap', '🏀 זרקי!');
    tap.addEventListener('pointerdown', (e) => { e.preventDefault(); this.shoot(); });
    this.card.append(tap);
    this.needleEl = this.card.querySelector('.needle')!;
    this.repsEl = this.card.querySelector('.mg-reps')!;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshStandardMaterial({ color: '#e8762c', roughness: 0.7 }));
    this.ball.visible = false;
    scene.add(this.ball);
    this.to.copy(hoop);
  }

  protected onKey(code: string): void { if (code === 'Space' || code === 'KeyE') this.shoot(); }

  private shoot(): void {
    if (this.ended || this.flying > 0) return;
    this.ok = this.power > 0.62 && this.power < 0.76;
    this.shots++;
    this.flying = 1;
    this.ctx.chibi.hold(null);
    this.ctx.chibi.headWorld(this.from);
    this.from.y += 0.3;
    this.ball.visible = true;
    this.ctx.audio.play('whoosh');
  }

  update(dt: number): void {
    if (this.flying <= 0 && !this.ended) {
      this.power += this.dir * dt * 1.1;
      if (this.power > 1) { this.power = 1; this.dir = -1; }
      if (this.power < 0) { this.power = 0; this.dir = 1; }
    }
    this.needleEl.style.left = `${this.power * 100}%`;
    this.ctx.chibi.action = this.flying > 0 ? 1 : 0;
    if (this.flying > 0) {
      this.flying -= dt * 1.1;
      const t = 1 - Math.max(0, this.flying);
      const target = this.ok ? this.to : this.to.clone().add(new THREE.Vector3((this.power - 0.69) * 3, this.power < 0.62 ? -1.2 : 0.4, 0));
      this.ball.position.lerpVectors(this.from, target, t);
      this.ball.position.y += Math.sin(t * Math.PI) * 2.2;
      this.ball.rotation.x += dt * 10;
      if (this.flying <= 0) {
        if (this.ok) { this.made++; this.feedback('סל! 🎉', 'perfect'); this.ctx.audio.play('success'); }
        else { this.feedback('החטאה', 'bad'); this.ctx.audio.play('fail'); }
        this.ball.visible = false;
        this.ctx.chibi.hold('ball');
        this.repsEl.textContent = `${this.made} / ${this.shots}`;
        (this.card.querySelector('.mg-hearts') as HTMLElement).textContent = '🏀'.repeat(5 - this.shots);
        if (this.shots >= 5) this.finish();
      }
    }
  }

  protected result(): { quality: number; summary: string } {
    const q = this.made / 5;
    const r = this.ctx.state.workout('hoop', 0.4 + q * 0.6);
    return { quality: q, summary: `${this.made}/5 סלים · ${r}` };
  }

  destroy(): void {
    super.destroy();
    this.ball.removeFromParent();
  }
}

/** Lap challenge around the park track through glowing checkpoint gates. */
export class TrackRun {
  private gates: THREE.Mesh[] = [];
  private idx = 0;
  private time = 0;
  private lapStart = 0;
  laps = 0;
  private hud: HTMLElement;
  private idle = 0;
  private readonly angles: number[] = [];

  constructor(private scene: THREE.Scene, private host: HTMLElement, private state: GameState, private audio: Audio, private onEnd: () => void) {
    const n = 8;
    for (let i = 1; i <= n; i++) this.angles.push(Math.PI / 2 + (i / n) * Math.PI * 2);
    const geo = new THREE.TorusGeometry(2.1, 0.12, 12, 48);
    for (const a of this.angles) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb347', emissiveIntensity: 0.6, transparent: true, opacity: 0.35 }));
      const p = trackPoint(a);
      const q = trackPoint(a + 0.01);
      m.position.set(p.x, 1.6, p.z);
      m.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      scene.add(m);
      this.gates.push(m);
    }
    this.hud = el('div', 'race');
    host.append(this.hud);
    this.highlight();
  }

  private highlight(): void {
    this.gates.forEach((g, i) => {
      const m = g.material as THREE.MeshStandardMaterial;
      const on = i === this.idx;
      m.opacity = on ? 0.95 : 0.25;
      m.emissiveIntensity = on ? 2.2 : 0.3;
      m.color.set(on ? '#7bffb2' : '#ffd166');
      m.emissive.set(on ? '#3dff8f' : '#ffb347');
    });
  }

  update(dt: number, player: THREE.Vector3, speed: number): void {
    this.time += dt;
    const g = this.gates[this.idx];
    g.rotation.z += dt * 2;
    g.scale.setScalar(1 + Math.sin(this.time * 6) * 0.05);
    if (Math.hypot(player.x - g.position.x, player.z - g.position.z) < 2.4) {
      this.audio.play('coin');
      this.idx++;
      if (this.idx >= this.gates.length) {
        const lapTime = this.time - this.lapStart;
        this.laps++;
        this.state.lap(lapTime);
        this.state.emit({ type: 'toast', text: `🏁 הקפה ${this.laps} — ${lapTime.toFixed(1)} שניות · שומן −1.2 🔥`, tone: 'good' });
        this.audio.play('success');
        this.lapStart = this.time;
        this.idx = 0;
      }
      this.highlight();
    }
    this.idle = speed < 0.5 ? this.idle + dt : 0;
    const best = this.state.s.best.lap ? ` · שיא ${this.state.s.best.lap.toFixed(1)}″` : '';
    this.hud.innerHTML = `⏱️ ${(this.time - this.lapStart).toFixed(1)}″ <small>הקפות: ${this.laps}${best} · עברי בטבעות הירוקות · Esc ליציאה</small>`;
    const d = Math.hypot((player.x - TRACK.x) / (TRACK.rx + 6), (player.z - TRACK.z) / (TRACK.rz + 6));
    if (this.idle > 12 || d > 1.25) this.onEnd();
  }

  destroy(): void {
    for (const g of this.gates) { this.scene.remove(g); (g.material as THREE.Material).dispose(); }
    this.hud.remove();
    void this.host;
  }
}
