import type { Food } from './foods';

/** All persistent game state + the rules of Yasmin's body. */
export interface Stats {
  energy: number;
  satiety: number;
  hydration: number;
  mood: number;
  /** Muscle / conditioning 0..100 */
  fitness: number;
  /** Body fat index 0..100 (≈ 22 is healthy-lean). */
  bodyFat: number;
  stamina: number;
  coins: number;
  xp: number;
  level: number;
  crash: number;
  proteinBoost: number;
}

export interface QuestDef { id: string; title: string; emoji: string; goal: number; reward: number }
export const QUESTS: QuestDef[] = [
  { id: 'water', title: 'שתי 5 כוסות מים', emoji: '💧', goal: 5, reward: 25 },
  { id: 'healthy', title: '2 ארוחות בריאות', emoji: '🥗', goal: 2, reward: 25 },
  { id: 'workout', title: 'אימון בחדר הכושר', emoji: '🏋️‍♀️', goal: 1, reward: 40 },
  { id: 'run', title: 'רוצי 2 הקפות במסלול', emoji: '🏃‍♀️', goal: 2, reward: 40 },
  { id: 'steps', title: '1,500 צעדים', emoji: '👟', goal: 1500, reward: 20 },
  { id: 'selfie', title: 'צלמי סלפי', emoji: '📸', goal: 1, reward: 15 },
];

export const OUTFITS = [
  { id: 'jas', name: 'JAS בורדו', color: '#5b2b30', level: 1 },
  { id: 'black', name: 'שחור קלאסי', color: '#23232a', level: 2 },
  { id: 'pink', name: 'ורוד פודרה', color: '#e889a8', level: 3 },
  { id: 'mint', name: 'מנטה', color: '#5fbfa4', level: 4 },
  { id: 'gold', name: 'זהב אלופה', color: '#c8973f', level: 6 },
];

export interface Save {
  v: number;
  stats: Stats;
  day: number;
  minutes: number;
  quests: Record<string, number>;
  claimed: string[];
  outfit: string;
  daily: { junk: number; healthy: number; workouts: number; laps: number; fatStart: number };
  best: { lap: number };
  tutorial: boolean;
  messagesRead: number;
}

const KEY = 'jasfit.save.v1';
export const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export function newSave(): Save {
  return {
    v: 1,
    stats: { energy: 85, satiety: 55, hydration: 60, mood: 75, fitness: 34, bodyFat: 29, stamina: 100, coins: 120, xp: 0, level: 1, crash: 0, proteinBoost: 0 },
    day: 1,
    minutes: 7 * 60 + 30,
    quests: {},
    claimed: [],
    outfit: 'jas',
    daily: { junk: 0, healthy: 0, workouts: 0, laps: 0, fatStart: 29 },
    best: { lap: 0 },
    tutorial: false,
    messagesRead: 0,
  };
}

export function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Save;
      if (s.v === 1) return { ...newSave(), ...s, stats: { ...newSave().stats, ...s.stats } };
    }
  } catch { /* storage unavailable — start fresh */ }
  return newSave();
}

export function persist(s: Save): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function wipe(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export type Activity = 'idle' | 'walk' | 'run' | 'drive' | 'sleep' | 'workout' | 'swim';

type Listener = (ev: GameEvent) => void;
export type GameEvent =
  | { type: 'toast'; text: string; icon?: string; tone?: 'good' | 'bad' | 'info' }
  | { type: 'quest'; id: string; done: boolean }
  | { type: 'level'; level: number }
  | { type: 'body'; label: string; better: boolean }
  | { type: 'coins'; delta: number };

/** Game rules for stats, body composition, time and quests. */
export class GameState {
  s: Save;
  private listeners: Listener[] = [];
  private lastBodyLabel = '';
  steps = 0;
  private stepAcc = 0;

  constructor() {
    this.s = load();
    this.lastBodyLabel = this.bodyLabel().label;
  }

  on(l: Listener): void { this.listeners.push(l); }
  emit(e: GameEvent): void { this.listeners.forEach((l) => l(e)); }
  get st(): Stats { return this.s.stats; }

  get hour(): number { return this.s.minutes / 60; }
  get clock(): string {
    const m = Math.floor(this.s.minutes) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  /** Visual fatness 0..1 */
  get fatN(): number { return clamp((this.st.bodyFat - 20) / 55, 0, 1); }
  /** Visual muscle tone 0..1 */
  get toneN(): number { return clamp((this.st.fitness - 15) / 70, 0, 1); }

  /** Movement speed multiplier — body shape matters. */
  get speedMul(): number {
    const e = this.st.energy < 15 ? 0.7 : this.st.energy < 30 ? 0.88 : 1;
    const h = this.st.hydration < 15 ? 0.85 : 1;
    return (1 - this.fatN * 0.45 + this.toneN * 0.18) * e * h;
  }
  get staminaDrain(): number { return 16 * (1 + this.fatN * 1.6 - this.toneN * 0.35) * (this.st.hydration < 25 ? 1.3 : 1); }

  bodyLabel(): { label: string; emoji: string; color: string } {
    const f = this.st.bodyFat, fit = this.st.fitness;
    if (f >= 62) return { label: 'עודף משקל', emoji: '😰', color: '#e76f51' };
    if (f >= 45) return { label: 'רכה ועייפה', emoji: '😕', color: '#f4a261' };
    if (f < 26 && fit >= 65) return { label: 'מחוטבת ואתלטית', emoji: '🔥', color: '#e9c46a' };
    if (f < 32 && fit >= 45) return { label: 'חטובה', emoji: '💪', color: '#2a9d8f' };
    return { label: 'מאוזנת', emoji: '🙂', color: '#8ab17d' };
  }

  addMinutes(m: number): void {
    // Wraps at midnight; the day counter only advances when Yasmin sleeps.
    this.s.minutes = (this.s.minutes + m) % 1440;
  }

  /** Called every frame. `gm` = game minutes elapsed. */
  tick(gm: number, act: Activity, distance: number): void {
    const st = this.st;
    this.addMinutes(gm);
    const runK = act === 'run' ? 1 : 0;
    const swimK = act === 'swim' ? 1 : 0;
    st.satiety = clamp(st.satiety - gm * (0.055 + runK * 0.12 + swimK * 0.15));
    st.hydration = clamp(st.hydration - gm * (0.07 + runK * 0.3 + swimK * 0.1));
    let dE = -0.03 - runK * 0.28 - swimK * 0.25;
    if (act === 'idle') dE += 0.01;
    if (st.satiety < 12) { dE -= 0.08; st.mood = clamp(st.mood - gm * 0.05); }
    if (st.hydration < 15) { dE -= 0.05; st.mood = clamp(st.mood - gm * 0.03); }
    if (st.crash > 0) { const c = Math.min(st.crash, gm * 0.4); st.crash -= c; dE -= c; }
    st.energy = clamp(st.energy + gm * dE);
    // Body fat dynamics
    let dF = 0;
    if (act === 'run') dF -= 0.075 * (1 + this.toneN * 0.3);
    if (act === 'swim') dF -= 0.06;
    if (act === 'walk') dF -= 0.008;
    if (st.satiety > 88) dF += 0.02;
    if (st.satiety < 35 && st.satiety > 10) dF -= 0.004;
    st.bodyFat = clamp(st.bodyFat + gm * dF, 12, 95);
    st.fitness = clamp(st.fitness - gm * 0.0035 + runK * gm * 0.015);
    // Mood drifts toward a baseline set by how balanced she is
    const base = 45 + (st.energy > 40 ? 10 : 0) + (st.hydration > 40 ? 8 : 0) + this.toneN * 15 - this.fatN * 15;
    st.mood = clamp(st.mood + (base - st.mood) * 0.004 * gm);
    // Steps
    this.stepAcc += distance / 0.7;
    if (this.stepAcc >= 1) {
      const n = Math.floor(this.stepAcc);
      this.stepAcc -= n;
      this.steps += n;
      this.progress('steps', n);
    }
    this.checkBody();
  }

  private checkBody(): void {
    const b = this.bodyLabel();
    if (b.label !== this.lastBodyLabel) {
      const order = ['עודף משקל', 'רכה ועייפה', 'מאוזנת', 'חטובה', 'מחוטבת ואתלטית'];
      const better = order.indexOf(b.label) > order.indexOf(this.lastBodyLabel);
      this.lastBodyLabel = b.label;
      this.emit({ type: 'body', label: b.label, better });
    }
  }

  eat(f: Food, free = false): boolean {
    const st = this.st;
    if (!free && st.coins < f.price) { this.emit({ type: 'toast', text: 'אין מספיק מטבעות', icon: '🪙', tone: 'bad' }); return false; }
    if (!free) this.addCoins(-f.price);
    const over = Math.max(0, st.satiety + f.satiety - 100);
    st.satiety = clamp(st.satiety + f.satiety);
    st.hydration = clamp(st.hydration + f.hydration);
    st.energy = clamp(st.energy + f.energy);
    st.mood = clamp(st.mood + f.mood);
    st.bodyFat = clamp(st.bodyFat + f.fat + over * 0.09, 12, 95);
    if (!f.healthy) { st.crash += 12; this.s.daily.junk++; }
    else { this.s.daily.healthy++; this.progress('healthy', 1); }
    if (f.protein) st.proteinBoost = 1;
    const effects = f.healthy
      ? `${f.emoji} ${f.name} — אנרגיה +${f.energy}, הגוף אוהב את זה 💚`
      : `${f.emoji} ${f.name} — מצב רוח +${f.mood}, אבל שומן +${f.fat.toFixed(1)} ⚠️`;
    this.emit({ type: 'toast', text: over > 10 ? `${effects} · אכלת יותר מדי!` : effects, tone: f.healthy ? 'good' : 'bad' });
    this.checkBody();
    return true;
  }

  drink(): void {
    const st = this.st;
    st.hydration = clamp(st.hydration + 22);
    st.energy = clamp(st.energy + 3);
    this.progress('water', 1);
    this.emit({ type: 'toast', text: `💧 כוס מים — הידרציה ${Math.round(st.hydration)}%`, tone: 'good' });
  }

  /** Applies the result of an exercise. quality 0..1 */
  workout(kind: 'weights' | 'band' | 'treadmill' | 'swim' | 'hoop', quality: number): string {
    const st = this.st;
    const hyd = st.hydration < 25 ? 0.6 : 1;
    const boost = st.proteinBoost ? 1.35 : 1;
    const gain = { weights: 5, band: 4.2, treadmill: 2.5, swim: 3, hoop: 2 }[kind] * quality * hyd * boost;
    const burn = { weights: 1.6, band: 1.4, treadmill: 2.8, swim: 2.4, hoop: 1.5 }[kind] * (0.4 + quality * 0.6);
    st.fitness = clamp(st.fitness + gain);
    st.bodyFat = clamp(st.bodyFat - burn, 12, 95);
    st.energy = clamp(st.energy - 14);
    st.hydration = clamp(st.hydration - 10);
    st.satiety = clamp(st.satiety - 8);
    st.mood = clamp(st.mood + 6 + quality * 8);
    st.proteinBoost = 0;
    this.s.daily.workouts++;
    if (kind !== 'swim' && kind !== 'hoop') this.progress('workout', 1);
    this.addXp(Math.round(20 + quality * 30));
    this.addCoins(Math.round(5 + quality * 15));
    this.addMinutes(25);
    this.checkBody();
    const extra = boost > 1 ? ' · בונוס חלבון!' : '';
    return `כושר +${gain.toFixed(1)} · שומן −${burn.toFixed(1)}${extra}${hyd < 1 ? ' · (חסרו מים — פחות תוצאות)' : ''}`;
  }

  lap(seconds: number): void {
    const st = this.st;
    st.fitness = clamp(st.fitness + 1.8);
    st.bodyFat = clamp(st.bodyFat - 1.2, 12, 95);
    st.mood = clamp(st.mood + 4);
    this.s.daily.laps++;
    this.progress('run', 1);
    this.addXp(15);
    this.addCoins(8);
    if (!this.s.best.lap || seconds < this.s.best.lap) {
      this.s.best.lap = seconds;
      this.emit({ type: 'toast', text: `🏆 שיא אישי חדש: ${seconds.toFixed(1)} שנ׳`, tone: 'good' });
    }
    this.checkBody();
  }

  addCoins(d: number): void {
    this.st.coins = Math.max(0, this.st.coins + d);
    this.emit({ type: 'coins', delta: d });
  }

  addXp(x: number): void {
    const st = this.st;
    st.xp += x;
    const need = () => 80 + st.level * 60;
    while (st.xp >= need()) {
      st.xp -= need();
      st.level++;
      this.emit({ type: 'level', level: st.level });
    }
  }

  xpNeed(): number { return 80 + this.st.level * 60; }

  progress(id: string, n: number): void {
    const q = QUESTS.find((x) => x.id === id);
    if (!q) return;
    const was = this.s.quests[id] ?? 0;
    const now = Math.min(q.goal, was + n);
    this.s.quests[id] = now;
    if (was < q.goal && now >= q.goal && !this.s.claimed.includes(id)) {
      this.s.claimed.push(id);
      this.addCoins(q.reward);
      this.addXp(25);
      this.emit({ type: 'quest', id, done: true });
    }
  }

  /** Sleep until 07:00 next morning. Returns a summary of the day. */
  sleep(): { day: number; fatDelta: number; junk: number; healthy: number; workouts: number; laps: number; quests: number } {
    const st = this.st, d = this.s.daily;
    const summary = { day: this.s.day, fatDelta: st.bodyFat - d.fatStart, junk: d.junk, healthy: d.healthy, workouts: d.workouts, laps: d.laps, quests: this.s.claimed.length };
    const hungry = st.satiety < 20;
    st.energy = hungry ? 70 : 100;
    st.satiety = clamp(st.satiety - 25);
    st.hydration = clamp(st.hydration - 25);
    // Recovery: training days build muscle overnight; junk days add fat.
    if (d.workouts + d.laps > 0) st.fitness = clamp(st.fitness + 2);
    if (d.junk > d.healthy) st.bodyFat = clamp(st.bodyFat + (d.junk - d.healthy) * 0.8, 12, 95);
    st.mood = clamp(st.mood + 10);
    st.stamina = 100;
    this.s.day++;
    this.s.minutes = 7 * 60;
    this.s.quests = {};
    this.s.claimed = [];
    this.s.daily = { junk: 0, healthy: 0, workouts: 0, laps: 0, fatStart: st.bodyFat };
    this.steps = 0;
    this.checkBody();
    persist(this.s);
    return summary;
  }

  save(): void { persist(this.s); }
}
