/** Unified keyboard / mouse / touch input. */
export type Action = 'interact' | 'jump' | 'phone' | 'car' | 'escape' | 'map' | 'selfie';

const KEY_ACTIONS: Record<string, Action> = {
  KeyE: 'interact',
  Enter: 'interact',
  Space: 'jump',
  Tab: 'phone',
  KeyP: 'phone',
  KeyF: 'car',
  Escape: 'escape',
  KeyM: 'map',
  KeyC: 'selfie',
};

export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<Action>();
  /** Virtual joystick vector, written by the touch controls. */
  joy = { x: 0, y: 0 };
  touchSprint = false;
  lookDX = 0;
  lookDY = 0;
  zoom = 0;
  /** When false, movement/look is ignored (menus open). Actions still queue. */
  enabled = true;
  readonly isTouch: boolean;
  /** Anything that wants raw key presses (e.g. mini-games) can subscribe. */
  onKey: ((code: string) => void) | null = null;

  constructor(private readonly canvas: HTMLElement) {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) {
        const a = KEY_ACTIONS[e.code];
        if (a) this.pressed.add(a);
        this.onKey?.(e.code);
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.bindPointerLook();
  }

  private bindPointerLook(): void {
    const c = this.canvas;
    let dragId: number | null = null;
    let lx = 0, ly = 0;
    const pinch = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    c.addEventListener('pointerdown', (e) => {
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2) {
        const [a, b] = [...pinch.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      if (dragId === null) {
        dragId = e.pointerId; lx = e.clientX; ly = e.clientY;
        c.setPointerCapture(e.pointerId);
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2) {
        const [a, b] = [...pinch.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom += (pinchDist - d) * 0.02;
        pinchDist = d;
        return;
      }
      if (e.pointerId !== dragId) return;
      const k = e.pointerType === 'touch' ? 1.4 : 1;
      this.lookDX += (e.clientX - lx) * k;
      this.lookDY += (e.clientY - ly) * k;
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e: PointerEvent) => {
      pinch.delete(e.pointerId);
      if (e.pointerId === dragId) dragId = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY) * 1.2; e.preventDefault(); }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  press(a: Action): void { this.pressed.add(a); }

  consume(a: Action): boolean {
    const had = this.pressed.has(a);
    this.pressed.delete(a);
    return had;
  }

  clearActions(): void { this.pressed.clear(); }

  /** Movement vector in local screen space: x = right, y = forward. */
  move(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.joy.x; y += this.joy.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  sprint(): boolean {
    return this.enabled && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint);
  }

  brake(): boolean {
    return this.keys.has('Space');
  }

  takeLook(): { dx: number; dy: number; zoom: number } {
    const r = this.enabled ? { dx: this.lookDX, dy: this.lookDY, zoom: this.zoom } : { dx: 0, dy: 0, zoom: 0 };
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
    return r;
  }
}
