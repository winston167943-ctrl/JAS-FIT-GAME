import * as THREE from 'three';

/** Key colors of the day. `t` is the hour (0-24). */
interface SkyKey {
  t: number; top: string; horizon: string; bottom: string; sun: string; sunI: number; hemi: number; fog: string; glow: number;
}

const KEYS: SkyKey[] = [
  { t: 0, top: '#070b24', horizon: '#1b2150', bottom: '#0b0f26', sun: '#8fa6ff', sunI: 0.35, hemi: 0.35, fog: '#141a3d', glow: 1 },
  { t: 4.8, top: '#0e1435', horizon: '#2b2c63', bottom: '#12163a', sun: '#8fa6ff', sunI: 0.3, hemi: 0.35, fog: '#1c2148', glow: 1 },
  { t: 6, top: '#3d4f9a', horizon: '#ff9e7a', bottom: '#f6b98e', sun: '#ffb27a', sunI: 1.2, hemi: 0.6, fog: '#e8a98f', glow: 0.5 },
  { t: 7.5, top: '#5aa6ff', horizon: '#ffd9b0', bottom: '#fbe4c8', sun: '#ffe2b8', sunI: 2.4, hemi: 0.9, fog: '#f3dcc4', glow: 0 },
  { t: 12, top: '#3f95ff', horizon: '#bfe3ff', bottom: '#e8f3ff', sun: '#fff6e8', sunI: 3.1, hemi: 1.05, fog: '#cfe6f7', glow: 0 },
  { t: 16.5, top: '#4a90f0', horizon: '#ffe0b8', bottom: '#fbe6cc', sun: '#ffe0b0', sunI: 2.6, hemi: 0.95, fog: '#f1dcc5', glow: 0 },
  { t: 18.6, top: '#4b4d9e', horizon: '#ff8a5c', bottom: '#ffb07a', sun: '#ff9a5a', sunI: 1.6, hemi: 0.65, fog: '#e79a7c', glow: 0.35 },
  { t: 19.8, top: '#1d1f55', horizon: '#9b4f7a', bottom: '#4a2f5e', sun: '#c08aff', sunI: 0.6, hemi: 0.45, fog: '#3a2c58', glow: 0.9 },
  { t: 21, top: '#0a0e2c', horizon: '#252a62', bottom: '#11153a', sun: '#8fa6ff', sunI: 0.35, hemi: 0.35, fog: '#161b40', glow: 1 },
  { t: 24, top: '#070b24', horizon: '#1b2150', bottom: '#0b0f26', sun: '#8fa6ff', sunI: 0.35, hemi: 0.35, fog: '#141a3d', glow: 1 },
];

const ca = new THREE.Color(), cb = new THREE.Color();
function lerpColor(a: string, b: string, k: number, out: THREE.Color): THREE.Color {
  ca.set(a); cb.set(b);
  return out.copy(ca).lerp(cb, k);
}

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly stars: THREE.Points;
  readonly clouds = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private uniforms: Record<string, THREE.IUniform>;
  /** 0 by day, 1 at full night — drives windows, street lamps and bloom. */
  glow = 0;
  private sunDir = new THREE.Vector3();
  private fogColor = new THREE.Color();

  constructor(private scene: THREE.Scene, shadowSize: number) {
    this.uniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      moonDir: { value: new THREE.Vector3(0, -1, 0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top, horizon, bottom, sunColor, sunDir, moonDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, -0.25, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.08) * step(-0.05, sunDir.y);
          float m = max(dot(d, normalize(moonDir)), 0.0);
          col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.4 + pow(m, 40.0) * 0.12) * step(0.0, moonDir.y);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // Stars
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.08;
      const th = u * Math.PI * 2, ph = Math.acos(1 - v);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 380;
      pos[i * 3 + 1] = Math.cos(ph) * 380;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 380;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // Puffy clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.15, fog: false, transparent: true, opacity: 0.95 });
    const puff = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      const parts = 4 + Math.floor(Math.random() * 4);
      for (let j = 0; j < parts; j++) {
        const m = new THREE.Mesh(puff, cloudMat);
        const s = 3 + Math.random() * 4;
        m.scale.set(s * 1.3, s * 0.8, s);
        m.position.set((j - parts / 2) * 4 + Math.random() * 2, Math.random() * 2, Math.random() * 3);
        c.add(m);
      }
      const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 120;
      c.position.set(Math.cos(a) * r, 55 + Math.random() * 30, Math.sin(a) * r);
      c.userData.speed = 0.6 + Math.random() * 0.8;
      this.clouds.add(c);
    }
    scene.add(this.clouds);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a5a3a, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = shadowSize > 0;
    if (shadowSize > 0) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const cam = this.sun.shadow.camera;
      cam.left = -32; cam.right = 32; cam.top = 32; cam.bottom = -32; cam.near = 1; cam.far = 160;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.radius = 3;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.Fog(0xcfe6f7, 120, 420);
  }

  update(hour: number, dt: number, focus: THREE.Vector3, camPos: THREE.Vector3): void {
    let i = 0;
    while (i < KEYS.length - 2 && hour >= KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = THREE.MathUtils.smoothstep(hour, a.t, b.t);
    lerpColor(a.top, b.top, k, this.uniforms.top.value);
    lerpColor(a.horizon, b.horizon, k, this.uniforms.horizon.value);
    lerpColor(a.bottom, b.bottom, k, this.uniforms.bottom.value);
    lerpColor(a.sun, b.sun, k, this.uniforms.sunColor.value);
    lerpColor(a.fog, b.fog, k, this.fogColor);
    (this.scene.fog as THREE.Fog).color.copy(this.fogColor);
    this.glow = THREE.MathUtils.lerp(a.glow, b.glow, k);

    // Sun path: rises in the east (+x) at 6:00, sets in the west at 19:00.
    const dayT = (hour - 6) / 13;
    const ang = dayT * Math.PI;
    this.sunDir.set(Math.cos(ang), Math.sin(ang) * 0.9 + 0.02, 0.35).normalize();
    this.uniforms.sunDir.value.copy(this.sunDir);
    const moonAng = ((hour + 24 - 19) % 24) / 11 * Math.PI;
    const moonDir = this.uniforms.moonDir.value as THREE.Vector3;
    moonDir.set(Math.cos(moonAng), Math.sin(moonAng) * 0.8, -0.3).normalize();

    const isDay = this.sunDir.y > 0.05;
    const lightDir = isDay ? this.sunDir : (moonDir.y > 0.1 ? moonDir : new THREE.Vector3(0.3, 1, 0.2).normalize());
    this.sun.color.copy(this.uniforms.sunColor.value);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, k) * 0.72;
    this.sun.position.copy(focus).addScaledVector(lightDir, 70);
    this.sun.target.position.copy(focus);
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, k) * 0.6;
    this.hemi.color.copy(this.uniforms.top.value).lerp(new THREE.Color(0xffffff), 0.55);
    this.hemi.groundColor.set(0x5d4a3a).lerp(this.fogColor, 0.3);

    (this.stars.material as THREE.PointsMaterial).opacity = this.glow * 0.95;
    this.mesh.position.copy(camPos);
    this.stars.position.copy(camPos);
    this.stars.rotation.y += dt * 0.004;
    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 220) c.position.x = -220;
    }
    const cloudMat = (this.clouds.children[0].children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    cloudMat.color.copy(this.uniforms.horizon.value).lerp(new THREE.Color(0xffffff), 0.6 - this.glow * 0.3);
    cloudMat.emissiveIntensity = 0.15 - this.glow * 0.12;
    cloudMat.opacity = 0.95 - this.glow * 0.5;
  }
}
