import { el } from '../ui/ui';
import type { GameState } from '../systems/state';
import { QUESTS, OUTFITS } from '../systems/state';
import { FOODS, MENUS } from '../systems/foods';
import { Audio } from '../core/audio';
import { PLACES, RING, HOUSE, GYM, CAFE, TRACK, POND, BEACH_X, SEA_X } from '../world/layout';
import heroUrl from '../assets/yasmin-hero.jpg';
import logoUrl from '../assets/jas-logo.png';
import { APP_URL } from '../config';

export type Quality = 'low' | 'medium' | 'high';

export interface PhoneCtx {
  state: GameState;
  audio: Audio;
  quality: () => Quality;
  setQuality: (q: Quality) => void;
  fastTravel: (id: string) => void;
  order: (foodId: string) => void;
  selfie: () => void;
  setOutfit: (id: string) => void;
  reset: () => void;
  playerPos: () => { x: number; z: number };
  onClose: () => void;
  toast: (t: string, tone?: 'good' | 'bad' | 'info') => void;
}

interface Msg { from: string; av: string; text: string; time: string }

export class Phone {
  private wrap = el('div', 'phone-wrap');
  private phone = el('div', 'phone');
  private screen = el('div', 'screen');
  private body: HTMLElement = el('div');
  private open = false;

  constructor(private host: HTMLElement, private ctx: PhoneCtx) {
    this.phone.append(this.screen);
    this.wrap.append(this.phone);
    this.wrap.addEventListener('pointerdown', (e) => { if (e.target === this.wrap) this.close(); });
  }

  get isOpen(): boolean { return this.open; }

  show(app?: string): void {
    if (!this.open) {
      this.open = true;
      this.host.append(this.wrap);
      this.phone.classList.remove('out');
      this.ctx.audio.play('open');
    }
    if (app) this.openApp(app); else this.home();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.ctx.audio.play('close');
    this.phone.classList.add('out');
    setTimeout(() => { this.wrap.remove(); this.ctx.onClose(); }, 300);
  }

  private frame(content: HTMLElement): void {
    const s = this.ctx.state;
    this.screen.innerHTML = '';
    const status = el('div', 'statusbar', `<span>${s.clock}</span><span>📶 🔋${Math.round(s.st.energy)}%</span>`);
    const notch = el('div', 'notch');
    const bar = el('div', 'homebar', '<i></i>');
    bar.addEventListener('click', () => (this.body.classList.contains('home') ? this.close() : this.home()));
    this.body = content;
    this.screen.append(notch, status, content, bar);
  }

  private messages(): Msg[] {
    const s = this.ctx.state, st = s.st;
    const list: Msg[] = [
      { from: 'JAS Fitness', av: '🌸', text: 'בוקר טוב יסמין ✨ האימון היומי שלך מחכה. מים, תנועה, אוכל טוב — וזהו.', time: '07:00' },
      { from: 'נועה', av: '👱🏼‍♀️', text: 'ריצה בפארק? אני כבר על המסלול 🏃‍♀️ תעברי בטבעות הירוקות!', time: '07:40' },
      { from: 'אבי המאמן', av: '🧔🏽‍♂️', text: 'תזכורת: מים לפני אימון, חלבון אחרי. ככה בונים גוף 💪', time: '08:15' },
    ];
    if (s.st.bodyFat > 45) list.push({ from: 'אבי המאמן', av: '🧔🏽‍♂️', text: 'שמתי לב שאת מתעייפת מהר ומזיעה... זה לא סוף העולם. אימון אחד + ארוחה בריאה ביום, ונחזיר אותך למסלול 💛', time: 'עכשיו' });
    if (s.s.daily.junk >= 2) list.push({ from: 'דני מהקפה', av: '🧑🏻‍🍳', text: 'ראיתי אותך ליד משאית הבורגרים 👀 בואי, יש לי פוקי סלמון שיעשה לך טוב.', time: 'עכשיו' });
    if (st.hydration < 30) list.push({ from: 'JAS Fitness', av: '💧', text: 'הידרציה נמוכה! בלי מים את מתעייפת מהר יותר ומקבלת פחות מהאימון.', time: 'עכשיו' });
    if (s.toneN > 0.6 && s.fatN < 0.2) list.push({ from: 'נועה', av: '👱🏼‍♀️', text: 'וואו יסמין את נראית מטורף!! 🔥 מה הסוד?', time: 'עכשיו' });
    list.push({ from: 'מאיה השכנה', av: '👩🏾', text: 'הכלב שלי שואל מתי את באה לטייל 🐶', time: '12:30' });
    return list;
  }

  unread(): number {
    return Math.max(0, this.messages().length - this.ctx.state.s.messagesRead);
  }

  private home(): void {
    const s = this.ctx.state;
    const h = el('div', 'home');
    const unread = this.unread();
    h.innerHTML = `<div class="wall" style="background-image:url(${heroUrl})"></div>
      <div class="greeting"><div class="t">${s.clock}</div><div class="d">יום ${s.s.day} · ${s.bodyLabel().emoji} ${s.bodyLabel().label}</div></div>`;
    const apps = el('div', 'apps');
    const def: [string, string, string, string, number?][] = [
      ['jas', 'JAS Fitness', `url(${logoUrl}) center/70% no-repeat, #f5ede3`, ''],
      ['food', 'משלוחים', 'linear-gradient(135deg,#ff9a8b,#ff6a88)', '🛵'],
      ['map', 'מפה', 'linear-gradient(135deg,#a8e063,#56ab2f)', '🗺️'],
      ['msgs', 'הודעות', 'linear-gradient(135deg,#43e97b,#38f9d7)', '💬', unread],
      ['quests', 'משימות', 'linear-gradient(135deg,#f6d365,#fda085)', '✅'],
      ['closet', 'ארון', 'linear-gradient(135deg,#fbc2eb,#a6c1ee)', '👗'],
      ['water', 'מים', 'linear-gradient(135deg,#89f7fe,#66a6ff)', '💧'],
      ['settings', 'הגדרות', 'linear-gradient(135deg,#d7d2cc,#304352)', '⚙️'],
    ];
    const dockDef: [string, string, string, string][] = [
      ['camera', 'מצלמה', 'linear-gradient(135deg,#434343,#000)', '📸'],
      ['music', 'מוזיקה', 'linear-gradient(135deg,#fc466b,#3f5efb)', '🎧'],
      ['body', 'גוף', 'linear-gradient(135deg,#f093fb,#f5576c)', '💪'],
      ['sleep', 'לילה', 'linear-gradient(135deg,#30cfd0,#330867)', '🌙'],
    ];
    const mk = (parent: HTMLElement, [id, name, bg, icon, badge]: [string, string, string, string, number?]) => {
      const a = el('button', 'app', `<span class="ico" style="background:${bg}">${icon}</span><span>${name}</span>${badge ? `<span class="badge">${badge}</span>` : ''}`);
      a.addEventListener('click', () => { this.ctx.audio.play('click'); this.openApp(id); });
      parent.append(a);
    };
    def.forEach((d) => mk(apps, d));
    const dock = el('div', 'dock');
    dockDef.forEach((d) => mk(dock, d));
    h.append(apps, dock);
    this.frame(h);
  }

  private view(title: string, bg = 'var(--cream-2)'): { v: HTMLElement; b: HTMLElement } {
    const v = el('div', 'appview');
    v.style.background = bg;
    const head = el('div', 'apphead', `<button class="back">‹ חזרה</button><h3>${title}</h3>`);
    head.querySelector('.back')!.addEventListener('click', () => this.home());
    const b = el('div', 'appbody');
    v.append(head, b);
    this.frame(v);
    return { v, b };
  }

  private ring(v: number, color: string, label: string, val: string): string {
    const r = 30, c = 2 * Math.PI * r;
    return `<div class="ring"><svg viewBox="0 0 70 70"><circle cx="35" cy="35" r="${r}" fill="none" stroke="#f0e4d8" stroke-width="7"/><circle cx="35" cy="35" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 35 35)"/><text x="35" y="40" text-anchor="middle" font-size="14" font-weight="800" fill="#5a2f2d">${val}</text></svg>${label}</div>`;
  }

  openApp(id: string): void {
    const s = this.ctx.state, st = s.st;
    switch (id) {
      case 'jas': {
        const { b } = this.view('JAS Fitness');
        const body = s.bodyLabel();
        const tip = st.hydration < 35 ? 'שתי מים לפני האימון — ככה תקבלי יותר מכל חזרה 💧'
          : s.s.daily.junk > s.s.daily.healthy ? 'היום היה יותר ג׳אנק מאוכל טוב. ארוחה בריאה אחת ואימון קצר יחזירו את האיזון 🥗'
          : st.energy < 30 ? 'האנרגיה נמוכה — ארוחה טובה או שינה, ואז חוזרים חזק ⚡'
          : st.fitness > 60 ? 'את בכושר שיא! נסי לשבור את שיא ההקפה שלך במסלול 🏁'
          : 'אימון משקולות + ריצה במסלול = שילוב מנצח לגוף חטוב 🔥';
        b.innerHTML = `
          <div class="jas-hero"><img src="${heroUrl}" alt=""><div class="ov"><b>Jas Fitness</b>הליווי שלך — בכיס.</div></div>
          <div class="card"><h4>הגוף שלך היום · ${body.emoji} ${body.label}</h4><div class="ring-row">
            ${this.ring(st.fitness / 100, '#e9c46a', 'כושר', String(Math.round(st.fitness)))}
            ${this.ring(1 - s.fatN, '#2a9d8f', 'גוף רזה', `${Math.round((1 - s.fatN) * 100)}%`)}
            ${this.ring(st.mood / 100, '#f78ca0', 'מצב רוח', String(Math.round(st.mood)))}
            ${this.ring(st.hydration / 100, '#56ccf2', 'מים', `${Math.round(st.hydration)}%`)}
          </div></div>
          <div class="card"><h4>היום</h4><div class="stat-grid">
            <div class="stat-card"><div class="k">צעדים</div><div class="v">${s.steps.toLocaleString()}</div></div>
            <div class="stat-card"><div class="k">אימונים</div><div class="v">${s.s.daily.workouts}</div></div>
            <div class="stat-card"><div class="k">הקפות</div><div class="v">${s.s.daily.laps}</div></div>
            <div class="stat-card"><div class="k">בריא / ג׳אנק</div><div class="v">${s.s.daily.healthy} <small>/ ${s.s.daily.junk}</small></div></div>
          </div></div>
          <div class="tip">💡 ${tip}</div>`;
        const cta = el('button', 'btn primary', '✨ להורדת האפליקציה האמיתית');
        cta.style.cssText = 'width:100%;margin-top:14px;padding:16px;font-size:16px';
        cta.addEventListener('click', () => {
          if (APP_URL) window.open(APP_URL, '_blank', 'noopener');
          else this.ctx.toast('הקישור לאפליקציה יתווסף בקרוב ✨', 'info');
        });
        b.append(cta);
        break;
      }
      case 'food': {
        const { b } = this.view('משלוחים 🛵');
        b.innerHTML = `<p style="color:#8a6a60;margin-top:0">משלוח עד הבית תוך רגע. יש לך 🪙 ${st.coins}</p>`;
        for (const fid of MENUS.delivery) {
          const f = FOODS[fid];
          const price = f.price + 6;
          const row = el('button', 'place-btn', `<span style="font-size:28px">${f.emoji}</span><span>${f.name}<br><small style="color:${f.healthy ? '#1f8a5f' : '#c2413c'};font-weight:700">${f.healthy ? 'בריא 💚' : 'ג׳אנק ⚠️'} · ${f.desc}</small></span><span class="go">🪙 ${price}</span>`);
          row.addEventListener('click', () => { this.close(); this.ctx.order(fid); });
          b.append(row);
        }
        break;
      }
      case 'map': {
        const { b } = this.view('מפה');
        const c = el('canvas', 'map-canvas') as HTMLCanvasElement;
        c.width = 640; c.height = 560;
        b.append(c);
        this.drawMap(c);
        for (const p of PLACES) {
          const row = el('button', 'place-btn', `<span style="font-size:24px">${p.emoji}</span>${p.name}<span class="go">סעי לשם ›</span>`);
          row.addEventListener('click', () => { this.close(); this.ctx.fastTravel(p.id); });
          b.append(row);
        }
        break;
      }
      case 'msgs': {
        const { b } = this.view('הודעות');
        const msgs = this.messages();
        s.s.messagesRead = msgs.length;
        b.innerHTML = msgs.slice().reverse().map((m) => `<div class="msg"><div class="av">${m.av}</div><div class="b"><b>${m.from}</b><p>${m.text}</p></div><div class="tm">${m.time}</div></div>`).join('');
        break;
      }
      case 'quests': {
        const { b } = this.view('משימות היום');
        b.innerHTML = QUESTS.map((q) => {
          const v = Math.min(q.goal, s.s.quests[q.id] ?? 0);
          const pct = (v / q.goal) * 100;
          return `<div class="card"><div style="display:flex;justify-content:space-between;font-weight:800"><span>${q.emoji} ${q.title}</span><span style="color:#b8772d">🪙 ${q.reward}</span></div>
            <div class="xp" style="height:8px;margin-top:8px"><i style="width:${pct}%"></i></div><div style="font-size:12px;color:#8a6a60;margin-top:4px">${v.toLocaleString()} / ${q.goal.toLocaleString()}</div></div>`;
        }).join('');
        break;
      }
      case 'closet': {
        const { b } = this.view('הארון של יסמין');
        b.innerHTML = `<p style="color:#8a6a60;margin-top:0">תלבושות נפתחות ברמות גבוהות יותר. רמה נוכחית: ${st.level}</p>`;
        for (const o of OUTFITS) {
          const locked = st.level < o.level;
          const row = el('button', `outfit ${s.s.outfit === o.id ? 'on' : ''}`, `<span class="sw" style="background:${o.color}"></span><span>${o.name}</span><span style="margin-inline-start:auto;font-size:12px;color:#8a6a60">${locked ? `🔒 רמה ${o.level}` : s.s.outfit === o.id ? 'לבוש ✓' : 'ללבוש'}</span>`);
          if (locked) row.setAttribute('disabled', '');
          row.addEventListener('click', () => { this.ctx.setOutfit(o.id); this.openApp('closet'); });
          b.append(row);
        }
        break;
      }
      case 'water': {
        const { b } = this.view('מים 💧', '#eef8ff');
        const cups = s.s.quests.water ?? 0;
        b.innerHTML = `<div class="card" style="text-align:center"><div style="font-size:64px">💧</div><div style="font-size:40px;font-weight:800;color:#2f80ed">${Math.round(st.hydration)}%</div><div style="color:#6d8aa8">הידרציה</div>
          <div style="font-size:28px;margin-top:10px;letter-spacing:4px">${'🥛'.repeat(Math.min(cups, 8))}${'◻️'.repeat(Math.max(0, 5 - cups))}</div><div style="color:#6d8aa8;font-size:13px">${cups} כוסות היום · יעד 5</div></div>
          <div class="tip">איפה שותים? 🚰 הכיור בבית · 💧 מתקן המים בחדר הכושר · 🥤 שייק בקפה</div>`;
        break;
      }
      case 'music': {
        const { b } = this.view('מוזיקה 🎧', '#1c1320');
        b.style.color = '#fff';
        const au = this.ctx.audio;
        const render = () => {
          b.innerHTML = '<p style="opacity:.7;margin-top:0">פלייליסט האימון של יסמין</p>';
          Audio.TRACKS.forEach((t, i) => {
            const on = au.track === i;
            const row = el('button', `track-row ${on ? 'on' : ''}`, `<span class="art" style="background:${['#ffd6a5', '#ff8fb1', '#9bf6ff'][i]}">${['☀️', '💪', '🌙'][i]}</span><span>${t.name}<br><small style="opacity:.6">${t.bpm} BPM</small></span>${on ? '<span class="eq"><i></i><i></i><i></i></span>' : ''}`);
            row.style.background = on ? '#3a2a40' : '#2a1f2e';
            row.style.color = '#fff';
            row.addEventListener('click', () => { au.playTrack(on ? -1 : i); if (!on) this.ctx.state.st.mood = Math.min(100, this.ctx.state.st.mood + 5); render(); });
            b.append(row);
          });
        };
        render();
        break;
      }
      case 'settings': {
        const { b } = this.view('הגדרות');
        const q = this.ctx.quality();
        b.innerHTML = `
          <div class="toggle">איכות גרפיקה<div class="seg">${(['low', 'medium', 'high'] as Quality[]).map((k) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${{ low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' }[k]}</button>`).join('')}</div></div>
          <div class="toggle">סאונד<div class="seg"><button data-s="1" class="${!this.ctx.audio.muted ? 'on' : ''}">פועל</button><button data-s="0" class="${this.ctx.audio.muted ? 'on' : ''}">כבוי</button></div></div>
          <div class="card" style="margin-top:14px;font-size:13px;color:#6d5550;line-height:1.6"><b>שליטה</b><br>WASD / חצים · תנועה<br>Shift · ריצה · רווח · קפיצה<br>E · פעולה · F · רכב · Tab · טלפון<br>גרירת עכבר · סיבוב מצלמה · גלגלת · זום</div>`;
        b.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((x) => x.addEventListener('click', () => { this.ctx.setQuality(x.dataset.q as Quality); this.openApp('settings'); }));
        b.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((x) => x.addEventListener('click', () => { this.ctx.audio.setMuted(x.dataset.s === '0'); this.openApp('settings'); }));
        const reset = el('button', 'btn', '🔄 התחלה מחדש');
        reset.style.marginTop = '12px';
        reset.addEventListener('click', () => { if (confirm('למחוק את ההתקדמות ולהתחיל מחדש?')) this.ctx.reset(); });
        b.append(reset);
        break;
      }
      case 'camera': this.close(); this.ctx.selfie(); break;
      case 'body': {
        const { b } = this.view('הגוף שלי');
        const bl = s.bodyLabel();
        b.innerHTML = `<div class="card" style="text-align:center"><div style="font-size:56px">${bl.emoji}</div><div style="font-size:24px;font-weight:800;color:${bl.color}">${bl.label}</div></div>
          <div class="stat-grid">
            <div class="stat-card"><div class="k">אחוז שומן (משחק)</div><div class="v">${Math.round(st.bodyFat)}<small>%</small></div></div>
            <div class="stat-card"><div class="k">כושר</div><div class="v">${Math.round(st.fitness)}</div></div>
            <div class="stat-card"><div class="k">מהירות</div><div class="v">${Math.round(s.speedMul * 100)}<small>%</small></div></div>
            <div class="stat-card"><div class="k">סבולת</div><div class="v">${Math.round(100 / (s.staminaDrain / 16))}<small>%</small></div></div>
          </div>
          <div class="tip">🍔 ג׳אנק מוסיף שומן ← הגוף מתעגל, הריצה מאטה, יסמין מזיעה ומתנשפת.<br>🥗 אוכל בריא + 🏋️‍♀️ אימונים + 🏃‍♀️ ריצה ← גוף חטוב, מהיר ומלא אנרגיה.</div>`;
        break;
      }
      case 'sleep': {
        const { b } = this.view('מצב לילה 🌙', '#1d1b3a');
        b.style.color = '#fff';
        b.innerHTML = `<p style="opacity:.8;margin-top:0">כדי לישון וללכת ליום הבא — לכי למיטה בבית 🛏️. שינה ממלאת אנרגיה ובונה שריר אחרי יום של אימונים.</p>`;
        const go = el('button', 'btn gold', '🏡 קחי אותי הביתה');
        go.addEventListener('click', () => { this.close(); this.ctx.fastTravel('home'); });
        b.append(go);
        break;
      }
    }
  }

  private drawMap(c: HTMLCanvasElement): void {
    const g = c.getContext('2d')!;
    const minX = -85, maxX = 95, minZ = -78, maxZ = 78;
    const sx = (x: number) => ((x - minX) / (maxX - minX)) * c.width;
    const sz = (z: number) => ((z - minZ) / (maxZ - minZ)) * c.height;
    const rect = (x0: number, z0: number, x1: number, z1: number, col: string, r = 0) => { g.fillStyle = col; g.beginPath(); g.roundRect(sx(x0), sz(z0), sx(x1) - sx(x0), sz(z1) - sz(z0), r); g.fill(); };
    g.fillStyle = '#9fd67f'; g.fillRect(0, 0, c.width, c.height);
    rect(BEACH_X - 6, minZ, maxX, maxZ, '#f3dca8');
    rect(SEA_X, minZ, maxX, maxZ, '#56b7e0');
    const w = RING.w;
    g.strokeStyle = '#4a4d57'; g.lineWidth = (w / (maxX - minX)) * c.width;
    g.strokeRect(sx(RING.x0), sz(RING.z0), sx(RING.x1) - sx(RING.x0), sz(RING.z1) - sz(RING.z0));
    g.beginPath(); g.moveTo(sx(RING.x0), sz(0)); g.lineTo(sx(RING.x1), sz(0)); g.stroke();
    rect(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1, '#f7c9a8', 6);
    rect(GYM.x0, GYM.z0, GYM.x1, GYM.z1, '#4a4856', 6);
    rect(CAFE.x - CAFE.w / 2, CAFE.z - CAFE.d / 2, CAFE.x + CAFE.w / 2, CAFE.z + CAFE.d / 2, '#f7a8c0', 6);
    rect(-8, -38, 8, -14, '#e98a4f', 4);
    g.strokeStyle = '#d66a4e'; g.lineWidth = 7;
    g.beginPath(); g.ellipse(sx(TRACK.x), sz(TRACK.z), (TRACK.rx - 1.8) / (maxX - minX) * c.width, (TRACK.rz - 1.8) / (maxZ - minZ) * c.height, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#56b7e0';
    g.beginPath(); g.ellipse(sx(POND.x), sz(POND.z), POND.rx / (maxX - minX) * c.width, POND.rz / (maxZ - minZ) * c.height, 0, 0, Math.PI * 2); g.fill();
    g.font = '26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of PLACES) {
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.arc(sx(p.x), sz(p.z), 20, 0, Math.PI * 2); g.fill();
      g.fillText(p.emoji, sx(p.x), sz(p.z) + 1);
    }
    const pp = this.ctx.playerPos();
    g.fillStyle = '#ff3b6b'; g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); g.arc(sx(pp.x), sz(pp.z), 10, 0, Math.PI * 2); g.fill(); g.stroke();
    c.addEventListener('click', (e) => {
      const r = c.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * c.width, my = ((e.clientY - r.top) / r.height) * c.height;
      for (const p of PLACES) if (Math.hypot(mx - sx(p.x), my - sz(p.z)) < 28) { this.close(); this.ctx.fastTravel(p.id); }
    });
  }
}
