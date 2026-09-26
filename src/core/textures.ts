import * as THREE from 'three';

/** Draws text onto a canvas texture — used for signs, menus and posters. */
export function textTexture(
  lines: string[],
  opts: { w?: number; h?: number; bg?: string; color?: string; font?: string; sizes?: number[]; glow?: string; radius?: number; border?: string } = {},
): THREE.CanvasTexture {
  const w = opts.w ?? 1024, h = opts.h ?? 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    const r = opts.radius ?? 0;
    g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill();
  }
  if (opts.border) {
    g.strokeStyle = opts.border; g.lineWidth = h * 0.04;
    g.beginPath(); g.roundRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08, opts.radius ?? 0); g.stroke();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  const sizes = opts.sizes ?? lines.map((_, i) => (i === 0 ? h * 0.5 : h * 0.22));
  const total = sizes.reduce((a, b) => a + b * 1.15, 0);
  let y = h / 2 - total / 2;
  lines.forEach((line, i) => {
    const s = sizes[i];
    y += s * 0.575;
    g.font = `800 ${s}px ${opts.font ?? 'Rubik, Arial, sans-serif'}`;
    if (opts.glow) { g.shadowColor = opts.glow; g.shadowBlur = s * 0.35; }
    g.fillStyle = opts.color ?? '#fff';
    g.fillText(line, w / 2, y);
    y += s * 0.575;
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Generic procedural canvas texture. */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** A radial soft blob texture used for fake contact shadows and glows. */
export function blobTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}
