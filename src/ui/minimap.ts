import { PLACES, RING, HOUSE, GYM, CAFE, TRACK, POND, BEACH_X, SEA_X, EXT, DOWNTOWN, HILL, PIER } from '../world/layout';

/** Draws the whole world map (shared by the mini-map and the phone map). */
export function drawWorld(g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number, k: number, W: number, H: number): void {
  g.fillStyle = '#6fae55'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#8fce6f'; g.fillRect(X(EXT.x0), Z(EXT.z0), (EXT.x1 - EXT.x0) * k, (EXT.z1 - EXT.z0) * k);
  g.fillStyle = '#f0d9a8'; g.fillRect(X(BEACH_X - 6), 0, W, H);
  g.fillStyle = '#4fb3de'; g.fillRect(X(SEA_X), 0, W, H);
  const hg = g.createRadialGradient(X(HILL.x), Z(HILL.z), 0, X(HILL.x), Z(HILL.z), HILL.r * k);
  hg.addColorStop(0, '#d9c29a'); hg.addColorStop(0.2, '#7fb85c'); hg.addColorStop(1, '#8fce6f');
  g.fillStyle = hg; g.beginPath(); g.arc(X(HILL.x), Z(HILL.z), HILL.r * k, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8cfc4'; g.fillRect(X(DOWNTOWN.x0), Z(DOWNTOWN.z0), (DOWNTOWN.x1 - DOWNTOWN.x0) * k, (DOWNTOWN.z1 - DOWNTOWN.z0) * k);
  g.fillStyle = '#9aa6b4';
  for (const [x0, x1] of [[DOWNTOWN.x0 + 7, DOWNTOWN.ax - 7], [DOWNTOWN.ax + 7, DOWNTOWN.x1 - 7]]) for (const [z0, z1] of [[DOWNTOWN.z0 + 7, -7], [7, DOWNTOWN.z1 - 7]]) { if (x0 > DOWNTOWN.ax && z0 > 0) continue; g.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); }
  g.strokeStyle = '#5b5e68'; g.lineJoin = 'round'; g.lineWidth = 9 * k;
  const line = (x0: number, z0: number, x1: number, z1: number) => { g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); };
  g.strokeRect(X(RING.x0), Z(RING.z0), (RING.x1 - RING.x0) * k, (RING.z1 - RING.z0) * k);
  g.strokeRect(X(DOWNTOWN.x0), Z(DOWNTOWN.z0), (DOWNTOWN.x1 - DOWNTOWN.x0) * k, (DOWNTOWN.z1 - DOWNTOWN.z0) * k);
  line(DOWNTOWN.x0, 0, RING.x1, 0); line(DOWNTOWN.ax, DOWNTOWN.z0, DOWNTOWN.ax, DOWNTOWN.z1);
  g.lineWidth = 7 * k; line(0, RING.z0, 0, HILL.z + HILL.r * 0.9);
  g.fillStyle = '#b98a5f'; g.fillRect(X(PIER.x0), Z(PIER.z0), (PIER.x1 - PIER.x0) * k, (PIER.z1 - PIER.z0) * k);
  const box = (x0: number, z0: number, x1: number, z1: number, col: string) => { g.fillStyle = col; g.beginPath(); g.roundRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k, 3); g.fill(); };
  box(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1, '#f7b89a');
  box(GYM.x0, GYM.z0, GYM.x1, GYM.z1, '#4a4856');
  box(CAFE.x - CAFE.w / 2, CAFE.z - CAFE.d / 2, CAFE.x + CAFE.w / 2, CAFE.z + CAFE.d / 2, '#f7a8c0');
  box(-8, -38, 8, -14, '#e98a4f');
  g.strokeStyle = '#d66a4e'; g.lineWidth = 3.6 * k;
  g.beginPath(); g.ellipse(X(TRACK.x), Z(TRACK.z), (TRACK.rx - 1.8) * k, (TRACK.rz - 1.8) * k, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#4fb3de'; g.beginPath(); g.ellipse(X(POND.x), Z(POND.z), POND.rx * k, POND.rz * k, 0, 0, Math.PI * 2); g.fill();
}

/** Heading-up circular mini-map with place markers and a home pin. */
export class MiniMap {
  readonly el: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly PX = 2.4; // pixels per metre in the base image
  private readonly X0 = EXT.x0 - 30;
  private readonly Z0 = EXT.z0 - 30;
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
    const W = (EXT.x1 - EXT.x0 + 60) * this.PX, H = (EXT.z1 - EXT.z0 + 60) * this.PX;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    drawWorld(c.getContext('2d')!, (x) => (x - this.X0) * this.PX, (z) => (z - this.Z0) * this.PX, this.PX, W, H);
    return c;
  }

  /** camYaw: camera orbit yaw; the view is rotated so "forward" is up. */
  update(dt: number, px: number, pz: number, playerYaw: number, camYaw: number, night: number): void {
    this.acc += dt;
    if (this.acc < 1 / 20) return;
    this.acc = 0;
    const g = this.ctx, S = this.el.width, R = S / 2;
    const zoom = S / 150 * 1.1; // screen px per base px
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
