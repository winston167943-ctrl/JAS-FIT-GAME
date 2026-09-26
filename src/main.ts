import './styles.css';
import heroUrl from './assets/yasmin-hero.jpg';
import logoUrl from './assets/jas-logo.png';

const app = document.getElementById('app')!;

// Title screen (shown immediately while the 3D world builds)
const title = document.createElement('div');
title.className = 'title';
const confetti = Array.from({ length: 36 }, () => {
  const c = ['#d4a24c', '#5a2f2d', '#f3cf85', '#ffffff', '#c98c4e'][Math.floor(Math.random() * 5)];
  return `<i style="left:${Math.random() * 100}%;background:${c};animation-duration:${6 + Math.random() * 8}s;animation-delay:${-Math.random() * 10}s"></i>`;
}).join('');
const touch = matchMedia('(pointer: coarse)').matches;
title.innerHTML = `
  <div class="confetti">${confetti}</div>
  <div class="title-card">
    <div class="title-hero"><img src="${heroUrl}" alt="יסמין"></div>
    <div class="title-text">
      <div class="brand"><img src="${logoUrl}" alt=""><span class="serif">Jas Fitness</span></div>
      <h1>יום בחיים של <span>יסמין</span></h1>
      <p class="sub">סימולציית חיים בריאים: אוכל, מים, אימונים, ריצה ונהיגה בשכונה. כל בחירה משנה את הגוף — לטובה או לרעה.</p>
      <div class="loading-bar"><i></i></div>
      <button class="play-btn" disabled>טוען את השכונה...</button>
      <div class="controls-help">
        <div><kbd>WASD</kbd> תנועה</div><div><kbd>Shift</kbd> ריצה</div><div><kbd>E</kbd> פעולה</div>
        <div><kbd>F</kbd> רכב</div><div><kbd>Tab</kbd> טלפון</div><div><kbd>C</kbd> סלפי</div>
        <div><kbd>רווח</kbd> קפיצה</div><div><kbd>M</kbd> מפה</div><div>🖱️ גרירה = מצלמה</div>
      </div>
    </div>
  </div>`;
app.append(title);
const bar = title.querySelector('.loading-bar i') as HTMLElement;
const btn = title.querySelector('.play-btn') as HTMLButtonElement;
bar.style.width = '15%';

// Let the title paint before the heavy world build.
requestAnimationFrame(() => setTimeout(async () => {
  try {
    bar.style.width = '45%';
    const { Game } = await import('./game');
    const game = new Game(app);
    bar.style.width = '85%';
    await new Promise((r) => setTimeout(r, 30));
    game.warmup();
    bar.style.width = '100%';
    btn.disabled = false;
    btn.innerHTML = touch ? '▶ בואי נתחיל' : '▶ בואי נתחיל <span style="opacity:.6;font-size:15px">(Enter)</span>';
    const go = () => {
      title.classList.add('hide');
      game.start();
      window.removeEventListener('keydown', onKey);
      if (touch) document.documentElement.requestFullscreen?.().catch(() => undefined);
    };
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Enter' || e.code === 'Space') go(); };
    btn.addEventListener('click', go);
    window.addEventListener('keydown', onKey);
  } catch (err) {
    console.error(err);
    btn.textContent = 'שגיאה בטעינה — נסי לרענן';
    const msg = document.createElement('pre');
    msg.style.cssText = 'white-space:pre-wrap;font-size:12px;color:#5a2f2d;max-width:520px';
    msg.textContent = String((err as Error)?.stack ?? err);
    btn.after(msg);
  }
}, 50));
