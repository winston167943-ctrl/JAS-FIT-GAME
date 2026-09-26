import type { GameState } from '../systems/state';
import { QUESTS } from '../systems/state';
import type { Input } from '../core/input';
import avatarUrl from '../assets/yasmin-avatar.jpg';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export interface MenuItem {
  emoji: string;
  title: string;
  desc?: string;
  tag?: { text: string; tone: 'good' | 'bad' };
  price?: string;
  disabled?: boolean;
  onClick: () => void;
}

const BAR_COLORS: Record<string, string> = {
  energy: 'linear-gradient(90deg,#f7b733,#fc4a1a)',
  satiety: 'linear-gradient(90deg,#8bc34a,#4caf50)',
  hydration: 'linear-gradient(90deg,#56ccf2,#2f80ed)',
  mood: 'linear-gradient(90deg,#f78ca0,#f9748f)',
};

/** All DOM overlay UI: HUD, toasts, prompts, menus, speech bubbles, fades. */
export class UI {
  readonly root = el('div', 'hud');
  private bars: Record<string, { wrap: HTMLElement; fill: HTMLElement; num: HTMLElement }> = {};
  private bodyChip!: HTMLElement;
  private bodyMark!: HTMLElement;
  private lvl!: HTMLElement;
  private xp!: HTMLElement;
  private clock!: HTMLElement;
  private coins!: HTMLElement;
  private questBox!: HTMLElement;
  private promptEl!: HTMLElement;
  private promptText = '';
  private staminaEl!: HTMLElement;
  private toasts = el('div', 'toasts');
  private bubbleLayer = el('div', 'bubbles');
  private bubbles = new Map<string, HTMLElement>();
  private fadeEl = el('div', 'fade');
  modalOpen = false;
  onPrompt: (() => void) | null = null;
  onPhone: (() => void) | null = null;
  onBody: (() => void) | null = null;

  constructor(private readonly host: HTMLElement) {
    host.append(this.root, this.toasts, this.fadeEl);
    this.root.append(this.bubbleLayer);
    this.buildProfile();
    this.buildTopLeft();
    this.buildQuests();
    this.promptEl = el('button', 'prompt');
    this.promptEl.addEventListener('click', () => this.onPrompt?.());
    this.staminaEl = el('div', 'stamina', '<i></i>');
    this.root.append(this.promptEl, this.staminaEl);
  }

  private buildProfile(): void {
    const p = el('div', 'profile');
    p.innerHTML = `
      <div class="row">
        <div class="avatar"><img src="${avatarUrl}" alt="יסמין"><span class="lvl">1</span></div>
        <div class="who"><b>יסמין</b><span class="chip">🙂 מאוזנת</span><div class="xp"><i></i></div></div>
      </div>
      <div class="bars"></div>
      <div class="body-meter"><div class="lbl"><span>🔥 חטובה</span><span>גוף</span><span>עודף 😰</span></div><div class="scale"><b></b></div></div>`;
    const bars = p.querySelector('.bars')!;
    for (const [k, ic] of [['energy', '⚡'], ['satiety', '🍎'], ['hydration', '💧'], ['mood', '😊']] as const) {
      const wrap = el('div', 'bar', `<span class="ic">${ic}</span><div class="track"><i></i></div><span class="num"></span>`);
      bars.append(wrap);
      const fill = wrap.querySelector('i') as HTMLElement;
      fill.style.background = BAR_COLORS[k];
      this.bars[k] = { wrap, fill, num: wrap.querySelector('.num')! };
    }
    this.bodyChip = p.querySelector('.chip')!;
    this.bodyMark = p.querySelector('.scale b')!;
    this.lvl = p.querySelector('.lvl')!;
    this.xp = p.querySelector('.xp i')!;
    p.addEventListener('click', () => this.onBody?.());
    p.style.cursor = 'pointer';
    this.root.append(p);
  }

  private buildTopLeft(): void {
    const tl = el('div', 'topleft');
    this.clock = el('div', 'pill clock');
    this.coins = el('div', 'pill');
    const phone = el('button', 'pill btn', '📱 <span class="sub">טלפון</span>');
    phone.addEventListener('click', () => this.onPhone?.());
    tl.append(this.clock, this.coins, phone);
    this.root.append(tl);
  }

  private buildQuests(): void {
    this.questBox = el('div', 'quests');
    this.root.append(this.questBox);
  }

  update(s: GameState, stamina: { show: boolean; v: number }): void {
    const st = s.st;
    for (const k of ['energy', 'satiety', 'hydration', 'mood'] as const) {
      const v = Math.round(st[k]);
      const b = this.bars[k];
      b.fill.style.width = `${v}%`;
      b.num.textContent = String(v);
      b.wrap.classList.toggle('low', v < 20);
    }
    const body = s.bodyLabel();
    const chip = `${body.emoji} ${body.label}`;
    if (this.bodyChip.textContent !== chip) { this.bodyChip.textContent = chip; this.bodyChip.style.background = body.color + '33'; }
    // 0 = toned (right side in RTL), 1 = overweight
    const shape = Math.max(0, Math.min(1, s.fatN * 0.8 + (1 - s.toneN) * 0.35));
    this.bodyMark.style.right = `${shape * 100}%`;
    this.lvl.textContent = String(st.level);
    this.xp.style.width = `${(st.xp / s.xpNeed()) * 100}%`;
    const h = s.hour;
    const icon = h >= 6 && h < 18 ? (h < 8 ? '🌅' : '☀️') : h < 20 && h >= 18 ? '🌇' : '🌙';
    this.clock.innerHTML = `${icon} ${s.clock} <span class="sub">יום ${s.s.day}</span>`;
    const c = `🪙 ${st.coins}`;
    if (!this.coins.textContent?.startsWith(c)) this.coins.textContent = c;
    this.staminaEl.classList.toggle('show', stamina.show);
    this.staminaEl.classList.toggle('low', stamina.v < 30);
    (this.staminaEl.firstChild as HTMLElement).style.width = `${stamina.v}%`;
  }

  coinPop(): void {
    this.coins.classList.remove('coin-pop');
    void this.coins.offsetWidth;
    this.coins.classList.add('coin-pop');
  }

  renderQuests(s: GameState): void {
    const collapsed = this.questBox.classList.contains('collapsed');
    const done = QUESTS.filter((q) => (s.s.quests[q.id] ?? 0) >= q.goal).length;
    this.questBox.innerHTML = `<h4><span>משימות היום · ${done}/${QUESTS.length}</span><span>${collapsed ? '▾' : '▴'}</span></h4>` + QUESTS.map((q) => {
      const v = s.s.quests[q.id] ?? 0;
      const ok = v >= q.goal;
      const prog = q.goal > 1 ? `<span class="p">${Math.min(v, q.goal).toLocaleString()}/${q.goal.toLocaleString()}</span>` : '';
      return `<div class="q ${ok ? 'done' : ''}"><span class="check">${ok ? '✓' : ''}</span><span>${q.emoji}</span><span class="t">${q.title}</span>${prog}</div>`;
    }).join('');
    this.questBox.querySelector('h4')!.addEventListener('click', () => { this.questBox.classList.toggle('collapsed'); this.renderQuests(s); });
  }

  prompt(text: string | null, key: string): void {
    const t = text ? `${key}|${text}` : '';
    if (t === this.promptText) return;
    this.promptText = t;
    if (!text) { this.promptEl.classList.remove('show'); return; }
    this.promptEl.innerHTML = `<kbd>${key}</kbd><span>${text}</span>`;
    this.promptEl.classList.add('show');
  }

  toast(text: string, tone: 'good' | 'bad' | 'info' = 'info', big = false, ms = 3200): void {
    const t = el('div', `toast ${tone} ${big ? 'big' : ''}`, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  bubble(id: string, name: string | null, text: string | null, x = 0, y = 0): void {
    let b = this.bubbles.get(id);
    if (!text) { if (b) b.style.opacity = '0'; return; }
    if (!b) { b = el('div', 'bubble'); this.bubbleLayer.append(b); this.bubbles.set(id, b); }
    const html = `${name ? `<span class="n">${name}</span>` : ''}${text}`;
    if (b.dataset.h !== html) { b.innerHTML = html; b.dataset.h = html; }
    b.style.opacity = '1';
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
  }

  /** Generic modal. Returns a close function. */
  modal(build: (box: HTMLElement, close: () => void) => void, onClose?: () => void): () => void {
    const wrap = el('div', 'modal-wrap');
    const box = el('div', 'modal');
    wrap.append(box);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.remove();
      this.modalOpen = false;
      onClose?.();
    };
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
    build(box, close);
    this.host.append(wrap);
    this.modalOpen = true;
    (this as unknown as { _close: () => void })._close = close;
    return close;
  }

  closeModal(): void {
    (this as unknown as { _close?: () => void })._close?.();
  }

  menu(title: string, subtitle: string, items: MenuItem[], onClose?: () => void): () => void {
    return this.modal((box, close) => {
      box.innerHTML = `<h2>${title}</h2><p class="subtitle">${subtitle}</p>`;
      const grid = el('div', 'menu-grid');
      for (const it of items) {
        const b = el('button', 'item');
        if (it.disabled) b.setAttribute('disabled', '');
        b.innerHTML = `<span class="em">${it.emoji}</span><span class="nm">${it.title}</span>${it.desc ? `<span class="ds">${it.desc}</span>` : ''}${it.price ? `<span class="price">${it.price}</span>` : ''}${it.tag ? `<span class="tag ${it.tag.tone}">${it.tag.text}</span>` : ''}`;
        b.addEventListener('click', () => { close(); it.onClick(); });
        grid.append(b);
      }
      box.append(grid);
      const actions = el('div', 'actions');
      const x = el('button', 'btn', 'סגירה');
      x.addEventListener('click', close);
      actions.append(x);
      box.append(actions);
    }, onClose);
  }

  dialog(face: string, name: string, text: string, buttons: { label: string; primary?: boolean; onClick?: () => void }[], onClose?: () => void): () => void {
    return this.modal((box, close) => {
      box.innerHTML = `<div class="dialog-npc"><div class="face">${face}</div><div><h2>${name}</h2><div class="txt">${text}</div></div></div>`;
      const actions = el('div', 'actions');
      for (const b of buttons) {
        const e = el('button', `btn ${b.primary ? 'primary' : ''}`, b.label);
        e.addEventListener('click', () => { close(); b.onClick?.(); });
        actions.append(e);
      }
      box.append(actions);
    }, onClose);
  }

  async fade(text: string, mid: () => void, hold = 900): Promise<void> {
    this.fadeEl.innerHTML = text;
    this.fadeEl.classList.add('on');
    await new Promise((r) => setTimeout(r, 950));
    mid();
    await new Promise((r) => setTimeout(r, hold));
    this.fadeEl.classList.remove('on');
  }

  flash(): void {
    const f = el('div', 'flash');
    this.host.append(f);
    setTimeout(() => f.remove(), 600);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }
}

/** On-screen joystick and buttons for phones/tablets. */
export class TouchControls {
  readonly root = el('div', 'touch');
  private knob: HTMLElement;
  private carBtn: HTMLElement;
  private actBtn: HTMLElement;

  constructor(host: HTMLElement, input: Input) {
    const joy = el('div', 'joy', '<i></i>');
    this.knob = joy.firstChild as HTMLElement;
    const btns = el('div', 'tbtns');
    this.actBtn = el('button', 'tbtn act', '✋');
    const jump = el('button', 'tbtn jump', '⤒<small>קפיצה</small>');
    const run = el('button', 'tbtn run', '🏃‍♀️<small>ריצה</small>');
    this.carBtn = el('button', 'tbtn car hidden', '🚗');
    btns.append(this.actBtn, jump, run, this.carBtn);
    this.root.append(joy, btns);
    host.append(this.root);

    let id: number | null = null;
    let cx = 0, cy = 0;
    const R = 50;
    const move = (e: PointerEvent) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.joy.x = dx / R;
      input.joy.y = -dy / R;
    };
    joy.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      joy.setPointerCapture(e.pointerId);
      move(e);
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      input.joy.x = 0; input.joy.y = 0;
      this.knob.style.transform = '';
    };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);

    const tap = (b: HTMLElement, fn: () => void) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    tap(this.actBtn, () => input.press('interact'));
    tap(jump, () => input.press('jump'));
    tap(this.carBtn, () => input.press('car'));
    tap(run, () => { input.touchSprint = !input.touchSprint; run.classList.toggle('on', input.touchSprint); });
  }

  setCar(label: string | null): void {
    this.carBtn.classList.toggle('hidden', !label);
    if (label) this.carBtn.textContent = label;
  }

  setAction(icon: string): void {
    if (this.actBtn.textContent !== icon) this.actBtn.textContent = icon;
  }

  setVisible(v: boolean): void { this.root.style.display = v ? '' : 'none'; }
}
