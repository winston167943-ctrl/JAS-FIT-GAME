import * as THREE from 'three';
import { isLawn, terrainY } from './layout';

/** Deterministic hash so blades don't shuffle when the patch re-centres. */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Living grass: tens of thousands of instanced blades in a patch that follows Yasmin,
 * swaying in the wind (and in the rain gusts).
 */
export class Grass {
  private mesh: THREE.InstancedMesh | null = null;
  private center = new THREE.Vector2(1e9, 1e9);
  private uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
  private readonly R = 32;

  constructor(private scene: THREE.Scene, private count: number) {
    if (count > 0) this.build();
  }

  setCount(n: number): void {
    this.count = n;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (n > 0) this.build();
    this.center.set(1e9, 1e9);
  }

  private build(): void {
    // A tapered 3-segment blade
    const segs = 3, w = 0.045, h = 0.36;
    const pos: number[] = [], col: number[] = [], uv: number[] = [], nor: number[] = [];
    const base = new THREE.Color('#3f8a3a'), tip = new THREE.Color('#b8e07a'), c = new THREE.Color();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, ww = w * (1 - t * 0.85);
      for (const sx of [-1, 1]) {
        pos.push(sx * ww, t * h, 0);
        c.copy(base).lerp(tip, t);
        col.push(c.r, c.g, c.b);
        uv.push(sx > 0 ? 1 : 0, t);
        nor.push(0, 1, 0);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uWind = this.uniforms.uWind;
      sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
         float gust = sin(uTime * 1.3 + ip.x * 0.15 + ip.z * 0.1) * 0.5 + 0.5;
         float sway = sin(uTime * 2.4 + ip.x * 0.7 + ip.z * 0.4) * (0.08 + gust * 0.14) * uWind;
         transformed.x += sway * uv.y * uv.y * 2.0;
         transformed.z += sway * 0.6 * uv.y * uv.y * 2.0;`,
      );
    };
    this.mesh = new THREE.InstancedMesh(g, mat, this.count);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.scene.add(this.mesh);
  }

  update(dt: number, focus: THREE.Vector3, wind: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uWind.value = wind;
    if (!this.mesh) return;
    if (Math.hypot(focus.x - this.center.x, focus.z - this.center.y) < 6) return;
    const cx = Math.round(focus.x / 6) * 6, cz = Math.round(focus.z / 6) * 6;
    this.center.set(cx, cz);
    const R = this.R;
    const spacing = Math.sqrt((Math.PI * R * R) / this.count) * 0.92;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    let n = 0;
    const gx0 = Math.floor((cx - R) / spacing), gx1 = Math.ceil((cx + R) / spacing);
    const gz0 = Math.floor((cz - R) / spacing), gz1 = Math.ceil((cz + R) / spacing);
    for (let gx = gx0; gx <= gx1 && n < this.count; gx++) {
      for (let gz = gz0; gz <= gz1 && n < this.count; gz++) {
        const h1 = hash(gx, gz), h2 = hash(gz + 17.3, gx - 3.1);
        const x = (gx + h1) * spacing, z = (gz + h2) * spacing;
        const d = Math.hypot(x - cx, z - cz);
        if (d > R || !isLawn(x, z)) continue;
        const edge = THREE.MathUtils.smoothstep(R - d, 0, 6);
        const sc = (0.6 + hash(x, z) * 0.9) * edge;
        if (sc < 0.05) continue;
        p.set(x, terrainY(x, z), z);
        q.setFromAxisAngle(up, hash(z, x) * Math.PI * 2);
        s.set(1, sc, 1);
        m.compose(p, q, s);
        this.mesh.setMatrixAt(n, m);
        color.setHSL(0.26 + hash(x * 2, z) * 0.06, 0.55, 0.42 + hash(x, z * 2) * 0.2);
        this.mesh.setColorAt(n, color);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
