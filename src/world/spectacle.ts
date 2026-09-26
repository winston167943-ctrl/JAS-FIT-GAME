import * as THREE from 'three';
import { Sparkles } from '../core/fx';
import { SEA_X, BEACH_X, TRACK, HOUSE } from './layout';

/**
 * The "wow" layer: aurora and shooting stars at night, fireworks over the sea,
 * leaping dolphins, gulls, fireflies in the park, water ripples, and the glowing
 * beacon above Yasmin's home.
 */
export class Spectacle {
  private t = 0;
  private aurora: THREE.Mesh;
  private auroraMat: THREE.ShaderMaterial;
  private shooting: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private shootT = 4;
  private fireworks: Sparkles;
  private fwT = 2;
  private dolphins: { g: THREE.Group; x: number; z: number; t: number; dir: number; dur: number }[] = [];
  private gulls: THREE.Group[] = [];
  private fireflies: THREE.Points;
  private ffSeeds: number[][] = [];
  private ripples: { m: THREE.Mesh; life: number }[] = [];
  private rippleGeo = new THREE.RingGeometry(0.5, 0.62, 40);
  readonly beacon = new THREE.Group();
  private beam: THREE.Mesh;
  private gem: THREE.Mesh;

  constructor(private scene: THREE.Scene) {
    // Aurora curtain: a huge cylinder band with a flowing shader, only visible at night.
    this.auroraMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uNight; varying vec2 vUv;
        float h(float x){ return fract(sin(x*127.1)*43758.5); }
        float n(float x){ float i=floor(x), f=fract(x); return mix(h(i),h(i+1.0),f*f*(3.0-2.0*f)); }
        void main(){
          float x = vUv.x * 40.0;
          float wave = n(x*0.35 + uTime*0.15) * 0.5 + n(x*0.9 - uTime*0.25) * 0.3;
          float band = smoothstep(0.0, 0.25 + wave*0.3, vUv.y) * smoothstep(1.0, 0.45 + wave*0.2, vUv.y);
          float rays = 0.6 + 0.4 * n(x*3.0 + uTime*0.8);
          vec3 green = vec3(0.2, 1.0, 0.55), pink = vec3(0.9, 0.35, 0.9), gold = vec3(1.0, 0.8, 0.4);
          vec3 col = mix(green, pink, smoothstep(0.35, 0.95, vUv.y + wave*0.2));
          col = mix(col, gold, 0.15 * n(x*0.2 + uTime*0.05));
          float a = band * rays * uNight * 0.55;
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.aurora = new THREE.Mesh(new THREE.CylinderGeometry(330, 330, 110, 96, 1, true, Math.PI * 0.55, Math.PI * 1.1), this.auroraMat);
    this.aurora.position.y = 120;
    this.aurora.frustumCulled = false;
    this.aurora.renderOrder = -5;
    scene.add(this.aurora);

    // Shooting stars
    const streakGeo = new THREE.PlaneGeometry(9, 0.25);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.frustumCulled = false;
      scene.add(m);
      this.shooting.push({ mesh: m, v: new THREE.Vector3(), life: 0 });
    }

    // Fireworks: big additive sparkles high over the sea
    this.fireworks = new Sparkles(scene, 1.6, 900);
    this.fireworks.gravity = 3.5;

    // Dolphins
    const skin = new THREE.MeshPhysicalMaterial({ color: '#6f93b8', roughness: 0.25, clearcoat: 1 });
    const belly = new THREE.MeshStandardMaterial({ color: '#e8eef5', roughness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), skin); body.scale.set(0.7, 0.75, 2.6); g.add(body);
      const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 12), belly); b2.scale.set(0.6, 0.5, 2.2); b2.position.y = -0.12; g.add(b2);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 12), skin); beak.rotation.x = Math.PI / 2; beak.position.z = 1.45; g.add(beak);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), skin); fin.position.set(0, 0.45, -0.1); fin.rotation.x = -0.5; g.add(fin);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), skin); tail.scale.set(1.3, 0.12, 0.45); tail.position.z = -1.4; g.add(tail);
      for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin); f.scale.set(1, 0.12, 0.5); f.position.set(sx * 0.4, -0.2, 0.4); f.rotation.z = sx * 0.5; g.add(f); }
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#111' })); e.position.set(sx * 0.3, 0.12, 1.05); g.add(e); }
      g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
      g.visible = false;
      scene.add(g);
      this.dolphins.push({ g, x: 0, z: 0, t: 1, dir: 1, dur: 1.6 });
    }

    // Gulls: simple V wings that flap while circling the beach
    const gullMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), gullMat); body.scale.set(0.8, 0.8, 1.8); g.add(body);
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), gullMat);
        w.position.x = sx * 0.45;
        const pivot = new THREE.Group(); pivot.add(w); pivot.userData.sx = sx; g.add(pivot);
      }
      g.userData = { r: 10 + Math.random() * 14, h: 9 + Math.random() * 6, sp: 0.2 + Math.random() * 0.15, ph: Math.random() * 6, cx: BEACH_X + 8 + Math.random() * 10, cz: -20 + Math.random() * 40 };
      scene.add(g);
      this.gulls.push(g);
    }

    // Fireflies in the park at night
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.ffSeeds.push([Math.random() * Math.PI * 2, Math.random() * 12 + 2, Math.random() * 6, Math.random() * 1.5 + 0.4]);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#d9ff7a', size: 0.25, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fireflies.frustumCulled = false;
    scene.add(this.fireflies);

    // Home beacon: a spinning gold gem with a light beam, visible across the map
    const hx = (HOUSE.x0 + HOUSE.x1) / 2, hz = (HOUSE.z0 + HOUSE.z1) / 2;
    this.beacon.position.set(hx, 0, hz);
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb020', emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.2 }));
    this.gem.position.y = 11;
    this.gem.scale.y = 1.4;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.2, 60, 24, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime, uAlpha; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * (0.35 + 0.15 * sin(vUv.y * 30.0 - uTime * 4.0)) * uAlpha; gl_FragColor = vec4(vec3(1.0, 0.8, 0.4) * a, a); }',
    }));
    this.beam.position.y = 30;
    this.beacon.add(this.gem, this.beam);
    scene.add(this.beacon);
  }

  /** Expanding ring on the water surface (swimming, splashes). */
  ripple(x: number, z: number): void {
    let r = this.ripples.find((q) => q.life <= 0);
    if (!r) {
      if (this.ripples.length > 24) return;
      const m = new THREE.Mesh(this.rippleGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      this.scene.add(m);
      r = { m, life: 0 };
      this.ripples.push(r);
    }
    r.m.position.set(x, 0.2, z);
    r.life = 1;
  }

  update(dt: number, glow: number, hour: number, player: THREE.Vector3, cam: THREE.Camera): void {
    this.t += dt;
    const night = THREE.MathUtils.smoothstep(glow, 0.55, 1);
    this.auroraMat.uniforms.uTime.value = this.t;
    this.auroraMat.uniforms.uNight.value = night;
    this.aurora.position.x = cam.position.x;
    this.aurora.position.z = cam.position.z;
    this.aurora.visible = night > 0.01;

    // Shooting stars every few seconds at night
    this.shootT -= dt;
    if (night > 0.5 && this.shootT <= 0) {
      this.shootT = 2.5 + Math.random() * 5;
      const s = this.shooting.find((q) => q.life <= 0);
      if (s) {
        const a = Math.random() * Math.PI * 2;
        s.mesh.position.set(cam.position.x + Math.cos(a) * 200, 110 + Math.random() * 60, cam.position.z + Math.sin(a) * 200);
        s.v.set(-Math.cos(a) * 60 + (Math.random() - 0.5) * 60, -25, -Math.sin(a) * 60 + (Math.random() - 0.5) * 60);
        s.life = 1.2;
      }
    }
    for (const s of this.shooting) {
      if (s.life <= 0) { (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0; continue; }
      s.life -= dt;
      s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.lookAt(cam.position);
      s.mesh.rotateZ(Math.atan2(s.v.y, Math.hypot(s.v.x, s.v.z)) * 0.6);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin((s.life / 1.2) * Math.PI) * night;
    }

    // Fireworks show over the sea from 20:30 to 23:30
    const show = hour >= 20.5 && hour <= 23.5;
    this.fwT -= dt;
    if (show && this.fwT <= 0) {
      this.fwT = 0.5 + Math.random() * 1.1;
      const palette = [['#ff4d8d', '#ffd166'], ['#7bffb2', '#ffffff'], ['#6fd3ff', '#c792ea'], ['#ffd166', '#ff9f1c'], ['#ff8fb1', '#ffffff']][Math.floor(Math.random() * 5)];
      this.fireworks.burst(new THREE.Vector3(SEA_X + 30 + Math.random() * 40, 16 + Math.random() * 14, -35 + Math.random() * 70), palette, 130, 7);
    }
    this.fireworks.update(dt);

    // Dolphins leap in arcs out at sea
    for (const d of this.dolphins) {
      d.t += dt / d.dur;
      if (d.t >= 1) {
        if (Math.random() < dt * 0.8) {
          d.t = 0; d.dur = 1.3 + Math.random() * 0.6;
          d.x = SEA_X + 12 + Math.random() * 28; d.z = player.z - 25 + Math.random() * 50;
          d.dir = Math.random() < 0.5 ? 1 : -1;
          d.g.visible = true;
          this.ripple(d.x, d.z);
        } else { d.g.visible = false; continue; }
      }
      const k = d.t;
      const len = 7;
      d.g.position.set(d.x, -0.6 + Math.sin(k * Math.PI) * 3.2, d.z + (k - 0.5) * len * d.dir);
      d.g.rotation.set(-Math.cos(k * Math.PI) * 0.9 * d.dir, d.dir > 0 ? 0 : Math.PI, 0);
      if (k > 0.97) { this.ripple(d.x, d.z + len * 0.5 * d.dir); }
    }

    // Gulls circle the beach, flapping
    for (const g of this.gulls) {
      const u = g.userData as { r: number; h: number; sp: number; ph: number; cx: number; cz: number };
      const a = u.ph + this.t * u.sp;
      g.position.set(u.cx + Math.cos(a) * u.r, u.h + Math.sin(this.t * 0.7 + u.ph) * 1.2, u.cz + Math.sin(a) * u.r);
      g.rotation.y = -a;
      const flap = Math.sin(this.t * 7 + u.ph) * 0.6;
      g.children.forEach((c) => { if (c.userData.sx) c.rotation.z = c.userData.sx * flap; });
      g.visible = glow < 0.8;
    }

    // Fireflies
    const ffm = this.fireflies.material as THREE.PointsMaterial;
    ffm.opacity = night;
    if (night > 0.01) {
      const arr = this.fireflies.geometry.attributes.position.array as Float32Array;
      this.ffSeeds.forEach(([a, r, ph, sp], i) => {
        const aa = a + Math.sin(this.t * sp * 0.3 + ph) * 0.4;
        arr[i * 3] = TRACK.x + Math.cos(aa) * (r + Math.sin(this.t * sp + ph) * 1.5) * 1.4;
        arr[i * 3 + 1] = 0.6 + Math.abs(Math.sin(this.t * sp * 0.7 + ph)) * 2.2;
        arr[i * 3 + 2] = TRACK.z + Math.sin(aa) * (r + Math.cos(this.t * sp + ph) * 1.5);
      });
      this.fireflies.geometry.attributes.position.needsUpdate = true;
      ffm.size = 0.18 + Math.sin(this.t * 6) * 0.04;
    }

    // Ripples
    for (const r of this.ripples) {
      if (r.life <= 0) { r.m.visible = false; continue; }
      r.m.visible = true;
      r.life -= dt * 0.8;
      const s = 1 + (1 - r.life) * 3.5;
      r.m.scale.setScalar(s);
      (r.m.material as THREE.MeshBasicMaterial).opacity = r.life * 0.6;
    }

    // Beacon: spins, bobs, fades when Yasmin is home
    const dHome = Math.hypot(player.x - this.beacon.position.x, player.z - this.beacon.position.z);
    const vis = THREE.MathUtils.smoothstep(dHome, 12, 30);
    this.gem.rotation.y += dt * 1.5;
    this.gem.position.y = 11 + Math.sin(this.t * 2) * 0.5;
    this.gem.visible = vis > 0.02;
    (this.beam.material as THREE.ShaderMaterial).uniforms.uTime.value = this.t;
    (this.beam.material as THREE.ShaderMaterial).uniforms.uAlpha.value = vis;
    this.beam.visible = vis > 0.02;
  }
}
