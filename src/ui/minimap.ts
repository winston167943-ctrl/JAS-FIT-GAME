import { PLACES, RING, HOUSE, GYM, CAFE, TRACK, POND, BEACH_X, SEA_X } from '../world/layout';

/** Heading-up circular mini-map with place markers and a home pin. */
export class MiniMap {
  readonly el: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly PX = 3; // pixels per metre in the base image
  private readonly X0 = -100;
  private readonly Z0 = -90;
  private acc = 0;
  onClick: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    const size = matchMedia('(max-width: 520px)').matches ? 116 : 150;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.el.width = this.el.height = size * dpr;
    this.el.style.width = this.el.style.height = `${size}px`;
    this.ctx = this.el.getContext('2d')!;
    this.el.addEventListener('click', () => this.onClick?.());
    host.append(this.el);
    this.base = this.drawBase();
  }

  private drawBase(): HTMLCanvasElement {
    const W = 260 * this.PX, H = 180 * this.PX;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const X = (x: number) => (x - this.X0) * this.PX;
    const Z = (z: number) => (z - this.Z0) * this.PX;
    g.fillStyle = '#8fce6f'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f0d9a8'; g.fillRect(X(BEACH_X - 6), 0, W, H);
    g.fillStyle = '#4fb3de'; g.fillRect(X(SEA_X), 0, W, H);
    g.strokeStyle = '#5b5e68'; g.lineWidth = RING.w * this.PX; g.lineJoin = 'round';
    g.strokeRect(X(RING.x0), Z(RING.z0), (RING.x1 - RING.x0) * this.PX, (RING.z1 - RING.z0) * this.PX);
    g.beginPath(); g.moveTo(X(RING.x0), Z(0)); g.lineTo(X(RING.x1), Z(0)); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5; g.setLineDash([6, 6]);
    g.strokeRect(X(RING.x0), Z(RING.z0), (RING.x1 - RING.x0) * this.PX, (RING.z1 - RING.z0) * this.PX);
    g.beginPath(); g.moveTo(X(RING.x0), Z(0)); g.lineTo(X(RING.x1), Z(0)); g.stroke(); g.setLineDash([]);
    const box = (x0: number, z0: number, x1: number, z1: number, col: string) => { g.fillStyle = col; g.beginPath(); g.roundRect(X(x0), Z(z0), (x1 - x0) * this.PX, (z1 - z0) * this.PX, 6); g.fill(); };
    box(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1, '#f7b89a');
    box(GYM.x0, GYM.z0, GYM.x1, GYM.z1, '#4a4856');
    box(CAFE.x - CAFE.w / 2, CAFE.z - CAFE.d / 2, CAFE.x + CAFE.w / 2, CAFE.z + CAFE.d / 2, '#f7a8c0');
    box(-8, -38, 8, -14, '#e98a4f');
    g.strokeStyle = '#d66a4e'; g.lineWidth = 3.6 * this.PX;
    g.beginPath(); g.ellipse(X(TRACK.x), Z(TRACK.z), (TRACK.rx - 1.8) * this.PX, (TRACK.rz - 1.8) * this.PX, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#4fb3de'; g.beginPath(); g.ellipse(X(POND.x), Z(POND.z), POND.rx * this.PX, POND.rz * this.PX, 0, 0, Math.PI * 2); g.fill();
    return c;
  }

  /** camYaw: camera orbit yaw; the view is rotated so "forward" is up. */
  update(dt: number, px: number, pz: number, playerYaw: number, camYaw: number, night: number): void {
    this.acc += dt;
    if (this.acc < 1 / 20) return;
    this.acc = 0;
    const g = this.ctx, S = this.el.width, R = S / 2;
    const zoom = S / 150 * 0.9; // screen px per base px
    // Rotation so the camera's forward vector points up.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rot = -Math.PI / 2 - Math.atan2(fz, fx);
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#7fbf62'; g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(rot);
    g.scale(zoom, zoom);
    g.drawImage(this.base, -(px - this.X0) * this.PX, -(pz - this.Z0) * this.PX);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (night > 0.05) { g.fillStyle = `rgba(10,15,50,${night * 0.45})`; g.fillRect(0, 0, S, S); }
    // Markers (kept upright, clamped to the rim when far away)
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const toScreen = (x: number, z: number) => {
      const dx = (x - px) * this.PX * zoom, dz = (z - pz) * this.PX * zoom;
      return { x: dx * cs - dz * sn, y: dx * sn + dz * cs };
    };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of PLACES) {
      let { x, y } = toScreen(p.x, p.z);
      const d = Math.hypot(x, y), max = R - 14 * (S / 150);
      const edge = d > max;
      if (edge) { x = (x / d) * max; y = (y / d) * max; }
      const home = p.id === 'home';
      const r = (home ? 12 : 9) * (S / 150);
      g.fillStyle = home ? '#ffd166' : 'rgba(255,255,255,.92)';
      g.beginPath(); g.arc(R + x, R + y, r, 0, Math.PI * 2); g.fill();
      if (home) { g.strokeStyle = '#5a2f2d'; g.lineWidth = 2 * (S / 150); g.stroke(); }
      g.font = `${Math.round(r * 1.25)}px sans-serif`;
      g.globalAlpha = edge ? 0.85 : 1;
      g.fillText(p.emoji, R + x, R + y + 1);
      g.globalAlpha = 1;
    }
    // Player arrow
    const a = rot + Math.atan2(Math.cos(playerYaw), Math.sin(playerYaw));
    g.translate(R, R); g.rotate(a);
    const k = S / 150;
    g.fillStyle = '#ff3b6b'; g.strokeStyle = '#fff'; g.lineWidth = 2.5 * k;
    g.beginPath(); g.moveTo(9 * k, 0); g.lineTo(-7 * k, -7 * k); g.lineTo(-3 * k, 0); g.lineTo(-7 * k, 7 * k); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // Rim + north
    g.strokeStyle = 'rgba(255,250,244,.95)'; g.lineWidth = 4 * (S / 150);
    g.beginPath(); g.arc(R, R, R - 3, 0, Math.PI * 2); g.stroke();
  }
}
