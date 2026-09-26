import * as THREE from 'three';

export type WeatherKind = 'clear' | 'cloudy' | 'rain';

/**
 * Dynamic weather: clear → clouds → rain → a rainbow when the sun comes back.
 * Exposes `rain` (0..1) and `overcast` (0..1) for lighting, audio and wind.
 */
export class Weather {
  kind: WeatherKind = 'clear';
  rain = 0;
  overcast = 0;
  private target = { rain: 0, overcast: 0 };
  private nextChange = 0;
  private rainbowT = 0;
  private drops: THREE.LineSegments;
  private dropMat: THREE.ShaderMaterial;
  private rainbow: THREE.Mesh;
  private rainbowMat: THREE.ShaderMaterial;
  private t = 0;
  onChange: ((k: WeatherKind) => void) | null = null;

  constructor(scene: THREE.Scene) {
    const n = 5000;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60;
      pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.02], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dropMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmt: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime, uAmt; uniform vec3 uCam; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y - uTime * 22.0, 30.0) - 4.0;
          p.x = mod(p.x - uCam.x + 30.0, 60.0) - 30.0 + uCam.x;
          p.z = mod(p.z - uCam.z + 30.0, 60.0) - 30.0 + uCam.z;
          p.y += uCam.y - 6.0;
          vA = step(fract(position.x * 13.7 + position.z * 7.1), uAmt);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: 'varying float vA; void main(){ if (vA < 0.5) discard; gl_FragColor = vec4(0.75, 0.82, 0.95, 0.45); }',
    });
    this.drops = new THREE.LineSegments(g, this.dropMat);
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    scene.add(this.drops);

    this.rainbowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uA; varying vec2 vUv;
        vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); }
        void main(){
          float r = vUv.y;
          vec3 c = hue(0.8 * (1.0 - r));
          float a = smoothstep(0.0, 0.15, r) * smoothstep(1.0, 0.85, r) * uA * 0.55;
          a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          gl_FragColor = vec4(c * a, a);
        }`,
    });
    // RingGeometry UVs are planar; build our own half-annulus with radial v.
    const rg = new THREE.RingGeometry(150, 172, 96, 1, 0, Math.PI);
    const uvs = rg.attributes.uv as THREE.BufferAttribute, rp = rg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), y = rp.getY(i);
      uvs.setXY(i, Math.atan2(y, x) / Math.PI, (Math.hypot(x, y) - 150) / 22);
    }
    this.rainbow = new THREE.Mesh(rg, this.rainbowMat);
    this.rainbow.visible = false;
    this.rainbow.frustumCulled = false;
    scene.add(this.rainbow);
  }

  /** Forces a weather state (debug / events). */
  set(k: WeatherKind): void {
    const was = this.kind;
    this.kind = k;
    this.target = k === 'rain' ? { rain: 1, overcast: 1 } : k === 'cloudy' ? { rain: 0, overcast: 0.6 } : { rain: 0, overcast: 0 };
    if (was === 'rain' && k !== 'rain') this.rainbowT = 1;
    if (was !== k) this.onChange?.(k);
  }

  update(dt: number, gameMinutes: number, hour: number, cam: THREE.Camera, sunDir: THREE.Vector3): void {
    this.t += dt;
    this.nextChange -= gameMinutes;
    if (this.nextChange <= 0) {
      this.nextChange = 120 + Math.random() * 180;
      const r = Math.random();
      this.set(this.kind === 'rain' ? (r < 0.7 ? 'clear' : 'cloudy') : r < 0.62 ? 'clear' : r < 0.82 ? 'cloudy' : 'rain');
    }
    this.rain = THREE.MathUtils.damp(this.rain, this.target.rain, 0.35, dt);
    this.overcast = THREE.MathUtils.damp(this.overcast, this.target.overcast, 0.35, dt);
    this.dropMat.uniforms.uTime.value = this.t;
    this.dropMat.uniforms.uAmt.value = this.rain;
    this.dropMat.uniforms.uCam.value.copy(cam.position);
    this.drops.visible = this.rain > 0.02;
    // Rainbow: opposite the sun, only by day
    this.rainbowT = Math.max(0, this.rainbowT - gameMinutes / 150);
    const day = hour > 7 && hour < 18.5;
    const a = this.rainbowT > 0 && day ? Math.min(1, this.rainbowT * 3) * (1 - this.rain) : 0;
    this.rainbowMat.uniforms.uA.value = a;
    this.rainbow.visible = a > 0.01;
    if (this.rainbow.visible) {
      const away = new THREE.Vector3(-sunDir.x, 0, -sunDir.z).normalize();
      this.rainbow.position.set(cam.position.x + away.x * 230, -20, cam.position.z + away.z * 230);
      this.rainbow.lookAt(cam.position.x, -20, cam.position.z);
    }
  }
}
