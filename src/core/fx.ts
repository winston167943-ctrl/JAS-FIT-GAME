import * as THREE from 'three';

/** Sparkle bursts for level-ups, quests and body transformations. */
export class Sparkles {
  private points: THREE.Points;
  private parts: { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number }[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private N = 240;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.N * 3);
    this.col = new Float32Array(this.N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const tex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d')!;
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(at: THREE.Vector3, colors: string[], n = 80, spread = 1): void {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.N) this.parts.shift();
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
      const dir = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a), Math.abs(u) + 0.3, Math.sqrt(1 - u * u) * Math.sin(a));
      const life = 0.8 + Math.random() * 0.9;
      const part = { p: at.clone().add(new THREE.Vector3(0, 0.8 + Math.random() * 0.8, 0)), v: dir.multiplyScalar((1.5 + Math.random() * 3) * spread), life, max: life };
      this.parts.push(part);
      c.set(colors[i % colors.length]);
      (part as unknown as { c: THREE.Color }).c = c.clone();
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.v.y -= 2.5 * dt;
      p.v.multiplyScalar(1 - dt * 1.5);
      p.p.addScaledVector(p.v, dt);
    }
    for (const p of this.parts) {
      const k = p.life / p.max;
      const c = (p as unknown as { c: THREE.Color }).c;
      this.pos[n * 3] = p.p.x; this.pos[n * 3 + 1] = p.p.y; this.pos[n * 3 + 2] = p.p.z;
      this.col[n * 3] = c.r * k * 2; this.col[n * 3 + 1] = c.g * k * 2; this.col[n * 3 + 2] = c.b * k * 2;
      n++;
    }
    for (let i = n; i < this.N; i++) { this.pos[i * 3 + 1] = -999; }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
