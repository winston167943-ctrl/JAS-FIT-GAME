import * as THREE from 'three';
import { blobTexture } from '../core/textures';
import type { Avatar, Pose, Expression, Item } from './chibi';
import idleUrl from '../assets/sprites/idle.webp';
import waveUrl from '../assets/sprites/wave.webp';
import drinkUrl from '../assets/sprites/drink.webp';

/**
 * Yasmin as a "paper cut-out" (Paper Mario style): the real renders from the brand
 * video, cut out of their backgrounds and played as sprite animations inside the 3D
 * world. A shader reshapes the silhouette for body fat / tone and tints her with the
 * scene's light so she sits naturally in day and night.
 */
interface Sheet { tex: THREE.Texture; n: number; cols: number; rows: number; aspect: number; height: number; fps: number }

const SHEETS: Record<'idle' | 'wave' | 'drink', { url: string; n: number; cols: number; rows: number; aspect: number; height: number; fps: number }> = {
  idle: { url: idleUrl, n: 9, cols: 5, rows: 2, aspect: 0.5262, height: 2.0, fps: 7 },
  wave: { url: waveUrl, n: 15, cols: 5, rows: 3, aspect: 0.6595, height: 2.08, fps: 12 },
  drink: { url: drinkUrl, n: 6, cols: 4, rows: 2, aspect: 0.6548, height: 2.06, fps: 5 },
};

const vert = /* glsl */ `
  uniform float uFat, uTone, uWidth;
  varying vec2 vUv;
  varying float vWorldY;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldY = vWorld.y;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec4 uFrame;      // offset.xy, size.xy in the atlas
  uniform float uFat, uTone, uWidth, uFlip, uTime, uFlash;
  uniform vec3 uTint, uRim;
  uniform float uClipY;
  uniform vec3 uSunDir, uSunCol, uSky, uGround, uLampPos, uLampCol;
  uniform float uYaw;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vWorldY;
  #include <fog_pars_fragment>
  void main() {
    if (vWorldY < uClipY) discard;
    vec2 uv = vUv;
    if (uFlip > 0.5) uv.x = 1.0 - uv.x;
    // The quad is wider than the art by uWidth; map back to art space.
    float x = (uv.x - 0.5) * uWidth + 0.5;
    float y = uv.y;
    // Body reshaping: torso / hips / thighs widen with fat (bell-shaped around the belly).
    float belly = exp(-pow((y - 0.47) / 0.13, 2.0));
    float hips  = exp(-pow((y - 0.37) / 0.12, 2.0));
    float thigh = exp(-pow((y - 0.24) / 0.1, 2.0));
    float arms  = exp(-pow((y - 0.55) / 0.12, 2.0));
    float face  = exp(-pow((y - 0.8) / 0.07, 2.0));
    float grow = uFat * (0.42 * belly + 0.34 * hips + 0.26 * thigh + 0.18 * arms + 0.08 * face) - uTone * 0.05 * belly;
    x = (x - 0.5) / (1.0 + grow) + 0.5;
    // A forward belly bulge (slightly raises the belly area of the art).
    float cx = abs(x - 0.5);
    y += uFat * 0.02 * belly * smoothstep(0.2, 0.0, cx);
    if (x < 0.0 || x > 1.0) discard;
    vec4 c = texture2D(uMap, uFrame.xy + vec2(x, y) * uFrame.zw);
    if (c.a < 0.35) discard;
    // Scene lighting on a flat cut-out: build a rounded pseudo-normal across the body
    // (like a cylinder) so the sun, sky, ground bounce and street lamps shade her
    // from the right side — the same light the rest of the world receives.
    float nx = clamp((x - 0.5) * 2.2, -1.0, 1.0);
    vec3 nLocal = normalize(vec3(nx * 0.9, (y - 0.55) * 0.35, sqrt(max(0.0, 1.0 - nx * nx * 0.81)) + 0.25));
    vec3 right = vec3(cos(uYaw), 0.0, -sin(uYaw));
    vec3 fwd = vec3(sin(uYaw), 0.0, cos(uYaw));
    vec3 n = normalize(right * nLocal.x + vec3(0.0, 1.0, 0.0) * nLocal.y + fwd * nLocal.z);
    vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
    float sunDot = max(dot(n, normalize(uSunDir)), 0.0);
    // Soft wrap so the shadow side isn't flat black
    float wrap = max((dot(n, normalize(uSunDir)) + 0.35) / 1.35, 0.0);
    vec3 lamp = vec3(0.0);
    vec3 toLamp = uLampPos - vWorld;
    float ld = length(toLamp);
    lamp = uLampCol * max(dot(n, toLamp / ld), 0.15) / (1.0 + ld * ld * 0.08);
    vec3 light = (amb + uSunCol * (sunDot * 0.7 + wrap * 0.3)) / 3.14159 + lamp;
    // Contact occlusion near the feet grounds her on the floor
    float ao = mix(0.72, 1.0, smoothstep(0.0, 0.12, y));
    vec3 col = c.rgb * (0.28 + light * 1.25) * ao;
    // Pull the studio-render palette toward the scene's (slightly less saturated, same white point)
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.93);
    // Rim light from the sun / lamps along the silhouette edge
    float edge = 1.0 - smoothstep(0.35, 0.9, c.a);
    col += uRim * edge * 0.6 + uSunCol * edge * pow(max(dot(-fwd, normalize(uSunDir)), 0.0), 2.0) * 0.08;
    col = mix(col, vec3(1.0, 0.95, 0.8), uFlash);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class SpriteAvatar implements Avatar {
  readonly root = new THREE.Group();
  pose: Pose = 'idle';
  expression: Expression = 'happy';
  action = 0;
  fat = 0;
  tone = 0;
  fatigue = 0;
  private sheets: Record<string, Sheet> = {};
  private quad: THREE.Mesh;
  private pivot = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private shadow: THREE.Mesh;
  private t = 0;
  private frameT = 0;
  private sheetKey: 'idle' | 'wave' | 'drink' = 'idle';
  private dir = 1;
  private lastScreenX = 0;
  private camera: THREE.Camera | null = null;
  private flash = 0;
  /** Scene light tint, updated by the game from the sky. */
  static tint = new THREE.Color(1, 1, 1);
  static rim = new THREE.Color(1, 0.9, 0.75);
  /** Scene light, fed by the game each frame. */
  static light = { sunDir: new THREE.Vector3(0, 1, 0), sunCol: new THREE.Color(2, 2, 2), sky: new THREE.Color(0.6, 0.6, 0.6), ground: new THREE.Color(0.3, 0.25, 0.2), lampPos: new THREE.Vector3(0, -100, 0), lampCol: new THREE.Color(0, 0, 0) };
  private shadowQuad: THREE.Mesh;
  private shadowTex: Record<string, THREE.Texture> = {};
  private shadowMat: THREE.MeshBasicMaterial;

  constructor() {
    const loader = new THREE.TextureLoader();
    for (const [k, s] of Object.entries(SHEETS)) {
      const tex = loader.load(s.url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.sheets[k] = { tex, n: s.n, cols: s.cols, rows: s.rows, aspect: s.aspect, height: s.height, fps: s.fps };
    }
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uMap: { value: null }, uFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
        uFat: { value: 0 }, uTone: { value: 0 }, uWidth: { value: 1.6 }, uFlip: { value: 0 }, uTime: { value: 0 },
        uFlash: { value: 0 }, uClipY: { value: -99 }, uYaw: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(2, 2, 2) }, uSky: { value: new THREE.Color(0.6, 0.6, 0.6) }, uGround: { value: new THREE.Color(0.3, 0.25, 0.2) },
        uLampPos: { value: new THREE.Vector3(0, -100, 0) }, uLampCol: { value: new THREE.Color(0, 0, 0) }, uTint: { value: new THREE.Color(1, 1, 1) }, uRim: { value: new THREE.Color(0, 0, 0) },
      }]),
      vertexShader: vert,
      fragmentShader: frag,
      fog: true,
      side: THREE.DoubleSide,
    });
    this.mat.uniforms.uMap.value = this.sheets.idle.tex;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.pivot.add(this.quad);
    // Invisible silhouette card that only casts the real shadow; it turns to face the sun
    // so her shadow always has her full shape.
    // three.js reads alpha maps from the green channel, so bake each sheet's alpha into a greyscale copy.
    for (const [k, sh] of Object.entries(this.sheets)) {
      const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      blank.needsUpdate = true;
      this.shadowTex[k] = blank;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, img.width >> 1); cv.height = Math.max(1, img.height >> 1);
        const g = cv.getContext('2d')!;
        g.drawImage(img, 0, 0, cv.width, cv.height);
        const d = g.getImageData(0, 0, cv.width, cv.height);
        for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i + 3]; d.data[i] = d.data[i + 1] = d.data[i + 2] = a; d.data[i + 3] = 255; }
        g.putImageData(d, 0, 0);
        const t = new THREE.CanvasTexture(cv);
        t.repeat.set(1 / sh.cols, 1 / sh.rows);
        this.shadowTex[k] = t;
      };
      img.src = SHEETS[k as keyof typeof SHEETS].url;
    }
    // The shadow pass copies alphaMap/alphaTest from this (never-drawn) material.
    this.shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, alphaMap: this.shadowTex.idle, alphaTest: 0.5, side: THREE.DoubleSide });
    this.shadowQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMat);
    this.shadowQuad.castShadow = true;
    this.root.add(this.shadowQuad);
    this.root.add(this.pivot);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture('rgba(40,20,10,0.32)'), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.05;
    this.root.add(this.shadow);
  }

  /** The sprite always faces this camera. */
  setCamera(c: THREE.Camera): void { this.camera = c; }

  private sheetFor(p: Pose): 'idle' | 'wave' | 'drink' {
    if (p === 'wave' || p === 'talk' || p === 'selfie' || p === 'flex' || p === 'dance') return 'wave';
    if (p === 'drink' || p === 'eat') return 'drink';
    return 'idle';
  }

  update(dt: number, speed: number): void {
    this.t += dt;
    const key = this.sheetFor(this.pose);
    if (key !== this.sheetKey) { this.sheetKey = key; this.frameT = 0; this.flash = 0.5; }
    const sh = this.sheets[key];
    const moving = this.pose === 'walk' || this.pose === 'run' || this.pose === 'treadmill';
    const fpsK = moving ? 1.6 : this.pose === 'tired' ? 0.6 : 1;
    this.frameT += dt * sh.fps * fpsK;
    // Ping-pong through the frames so loops are seamless.
    const cyc = Math.max(1, sh.n * 2 - 2);
    let f = Math.floor(this.frameT) % cyc;
    if (f >= sh.n) f = cyc - f;
    const col = f % sh.cols, row = Math.floor(f / sh.cols);
    const u = this.mat.uniforms;
    u.uMap.value = sh.tex;
    // Atlas V runs bottom-up; row 0 is the top row of the image.
    u.uFrame.value.set(col / sh.cols, 1 - (row + 1) / sh.rows, 1 / sh.cols, 1 / sh.rows);
    const width = 1.55 + this.fat * 0.25;
    u.uWidth.value = width;
    u.uFat.value = this.fat;
    u.uTone.value = this.tone;
    u.uTime.value = this.t;
    u.uTint.value.copy(SpriteAvatar.tint);
    u.uRim.value.copy(SpriteAvatar.rim);
    this.flash = Math.max(0, this.flash - dt * 3);
    u.uFlash.value = this.flash * 0.25;
    u.uClipY.value = this.pose === 'swim' ? 0.12 : -99;
    const L = SpriteAvatar.light;
    u.uSunDir.value.copy(L.sunDir); u.uSunCol.value.copy(L.sunCol); u.uSky.value.copy(L.sky); u.uGround.value.copy(L.ground);
    u.uLampPos.value.copy(L.lampPos); u.uLampCol.value.copy(L.lampCol);
    // Shadow card: same frame, same size, facing the sun
    const stex = this.shadowTex[key];
    stex.offset.set(col / sh.cols, 1 - (row + 1) / sh.rows);
    if (this.shadowMat.alphaMap !== stex) { this.shadowMat.alphaMap = stex; this.shadowMat.needsUpdate = true; }

    // Paper Mario style motion: bounce, squash & stretch, lean.
    const h = sh.height;
    let bob = 0, sx = 1, sy = 1, lean = 0, lift = 0, lie = 0;
    const heavy = 1 - this.fat * 0.4;
    if (moving) {
      const run = this.pose !== 'walk';
      const ph = this.t * (run ? 13 : 9) * (0.7 + 0.3 * heavy);
      bob = Math.abs(Math.sin(ph)) * (run ? 0.16 : 0.09) * heavy;
      sy = 1 + Math.sin(ph * 2) * 0.035; sx = 1 / sy;
      lean = Math.sin(ph) * (run ? 0.09 : 0.06) + (run ? 0.06 : 0);
    } else if (this.pose === 'jump') {
      sy = 1.08; sx = 0.94;
    } else if (this.pose === 'tired') {
      sy = 0.93 + Math.sin(this.t * 8) * 0.02; sx = 1.04; lean = 0.12;
    } else if (this.pose === 'lift' || this.pose === 'band' || this.pose === 'shoot') {
      const a = this.action;
      sy = 1 - a * 0.06 + (this.pose === 'band' ? a * 0.1 : 0); sx = 1 + a * 0.05;
      bob = this.pose === 'band' ? 0.3 : 0;
    } else if (this.pose === 'sit' || this.pose === 'drive') {
      sy = 0.78; lift = -0.05;
    } else if (this.pose === 'sleep' || this.pose === 'lounge') {
      lie = 1; lift = 0.55;
    } else if (this.pose === 'swim') {
      const st = this.t * (speed > 2.5 ? 5 : 3.2);
      lift = -1.05; bob = Math.sin(st) * 0.07; lean = Math.sin(st * 0.5) * 0.14;
      sx = 1 + Math.sin(st) * 0.03; sy = 1 / sx;
    } else if (this.pose === 'dance') {
      bob = Math.abs(Math.sin(this.t * 7)) * 0.1; lean = Math.sin(this.t * 3.5) * 0.14;
    } else {
      sy = 1 + Math.sin(this.t * 1.8) * 0.008 * (1 + this.fatigue * 4);
    }
    this.quad.scale.set(h * sh.aspect * width * sx, h * sy, 1);
    this.quad.position.set(0, (h * sy) / 2, 0);
    this.shadowQuad.scale.set(h * sh.aspect * sx * (1 + this.fat * 0.3), h * sy, 1);
    this.shadowQuad.position.set(0, (h * sy) / 2 + bob + lift, 0);
    const sd = SpriteAvatar.light.sunDir;
    const parentYawS = this.root.parent ? new THREE.Euler().setFromQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
    this.shadowQuad.rotation.y = Math.atan2(sd.x, sd.z) - parentYawS;
    this.shadowQuad.visible = !(this.pose === 'swim' || this.pose === 'sleep' || this.pose === 'lounge');
    this.pivot.position.y = bob + lift;
    this.pivot.rotation.z = lean * this.dir * -1;

    // Billboard toward the camera (yaw only), lying flat when sleeping.
    if (this.camera) {
      const wp = this.root.getWorldPosition(new THREE.Vector3());
      const cp = this.camera.position;
      const yaw = Math.atan2(cp.x - wp.x, cp.z - wp.z);
      const parentYaw = this.root.parent ? new THREE.Euler().setFromQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
      this.pivot.rotation.y = yaw - parentYaw;
      u.uYaw.value = yaw;
      this.pivot.rotation.x = lie ? -1.25 : 0;
      // Face the direction of travel on screen (mirror the art).
      const sx2 = wp.clone().project(this.camera).x;
      const dx = sx2 - this.lastScreenX;
      if (moving && Math.abs(dx) > 0.0008) this.dir = dx > 0 ? 1 : -1;
      this.lastScreenX = sx2;
      u.uFlip.value = this.dir < 0 ? 1 : 0;
    }
    this.shadow.scale.set(0.8 + this.fat * 0.4, 0.55 + this.fat * 0.25, 1);
    this.shadow.visible = !lie && this.pose !== 'swim';
    void speed;
  }

  hold(_item: Item): void { /* the art already has her props */ }
  setOutfit(): void { /* outfit comes from the art */ }

  headWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.quad.localToWorld(out.set(0, 0.36, 0));
  }
}
