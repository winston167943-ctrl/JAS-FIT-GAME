import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { blobTexture } from '../core/textures';

/**
 * Stylized, fully procedural "chibi" character in the spirit of the JAS Fitness mascot.
 * Built behind a small interface (pose / shape / expression) so a rigged GLB can
 * replace it later without touching gameplay code.
 */
export interface Look {
  skin: string;
  hair: string;
  hairTip: string;
  top: string;
  bottom: string;
  shoes: string;
  eyes: string;
  hairStyle: 'curly' | 'short' | 'bun' | 'ponytail';
  topStyle: 'bra' | 'tee' | 'apron';
  shorts?: boolean;
  male?: boolean;
  headphones?: boolean;
  necklace?: boolean;
  beard?: boolean;
  lashes?: boolean;
  scale?: number;
}

export const YASMIN: Look = {
  skin: '#cf8b5f', hair: '#3f2014', hairTip: '#c98a48', top: '#5b2b30', bottom: '#5b2b30', shoes: '#fbfbfb',
  eyes: '#4a2a18', hairStyle: 'curly', topStyle: 'bra', headphones: true, necklace: true, lashes: true,
};

export type Pose =
  | 'idle' | 'walk' | 'run' | 'jump' | 'tired' | 'lift' | 'band' | 'treadmill' | 'eat' | 'drink'
  | 'sleep' | 'sit' | 'drive' | 'wave' | 'flex' | 'selfie' | 'dance' | 'swim' | 'lounge' | 'shoot' | 'talk';

export type Expression = 'happy' | 'tired' | 'effort' | 'sleep' | 'sad' | 'wow';

export type Item = 'dumbbells' | 'cup' | 'phone' | 'food' | 'ball' | null;

/** What gameplay needs from a character — implemented by the procedural Chibi and by ModelAvatar. */
export interface Avatar {
  readonly root: THREE.Object3D;
  pose: Pose;
  expression: Expression;
  action: number;
  fat: number;
  tone: number;
  fatigue: number;
  update(dt: number, speed: number): void;
  hold(item: Item): void;
  headWorld(out: THREE.Vector3): THREE.Vector3;
  setOutfit(color: string): void;
}

const matCache = new Map<string, THREE.Material>();
function mat(color: string, o: { rough?: number; metal?: number; clear?: number; sheen?: string; emissive?: number } = {}): THREE.Material {
  const k = `${color}|${o.rough}|${o.metal}|${o.clear}|${o.sheen}|${o.emissive}`;
  let m = matCache.get(k);
  if (!m) {
    const p = new THREE.MeshPhysicalMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, clearcoat: o.clear ?? 0, clearcoatRoughness: 0.15 });
    if (o.sheen) { p.sheen = 1; p.sheenColor.set(o.sheen); p.sheenRoughness = 0.4; }
    if (o.emissive) { p.emissive.set(color); p.emissiveIntensity = o.emissive; }
    m = p;
    matCache.set(k, m);
  }
  return m;
}

const SPH = new THREE.SphereGeometry(1, 32, 24);
const SPH_LO = new THREE.SphereGeometry(1, 10, 8);
function capsule(r: number, len: number): THREE.CapsuleGeometry {
  return new THREE.CapsuleGeometry(r, len, 8, 20);
}
const damp = THREE.MathUtils.damp;

class FnCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private fn: (t: number, target: THREE.Vector3) => THREE.Vector3) { super(); }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 { return this.fn(t, target); }
}

/** Smooth body-of-revolution; depth is squashed so bodies read as oval, not round. */
function lathe(pts: [number, number][], open = false, depth = 0.8): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  g.scale(1, 1, depth);
  if (open) (g as THREE.BufferGeometry).userData.open = true;
  g.computeVertexNormals();
  return g;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, pos?: [number, number, number], scale?: [number, number, number]): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  if (pos) me.position.set(...pos);
  if (scale) me.scale.set(...scale);
  me.castShadow = true;
  parent.add(me);
  return me;
}

/** Joint set driven by the pose system. */
interface Joints {
  bodyY: number; lean: number; sway: number; twist: number; spine: number; head: number; headY: number; headZ: number;
  shL: number; shLz: number; shR: number; shRz: number; elL: number; elR: number;
  lgL: number; lgR: number; lgLz: number; lgRz: number; knL: number; knR: number;
  rootRx: number;
}
const ZERO: Joints = { bodyY: 0, lean: 0, sway: 0, twist: 0, spine: 0, head: 0, headY: 0, headZ: 0, shL: 0, shLz: 0.12, shR: 0, shRz: -0.12, elL: -0.15, elR: -0.15, lgL: 0, lgR: 0, lgLz: 0, lgRz: 0, knL: 0, knR: 0, rootRx: 0 };

export class Chibi implements Avatar {
  readonly root = new THREE.Group();
  /** Everything that tilts/rotates with the character (inside root, above the blob shadow). */
  readonly rig = new THREE.Group();
  private body = new THREE.Group();
  private pelvis = new THREE.Group();
  private spineG = new THREE.Group();
  private chest = new THREE.Group();
  readonly head = new THREE.Group();
  private hairG = new THREE.Group();
  private shL = new THREE.Group(); private shR = new THREE.Group();
  private elL = new THREE.Group(); private elR = new THREE.Group();
  private lgL = new THREE.Group(); private lgR = new THREE.Group();
  private knL = new THREE.Group(); private knR = new THREE.Group();
  private handL = new THREE.Group(); private handR = new THREE.Group();
  private parts: Record<string, THREE.Object3D> = {};
  private eyes: THREE.Group[] = [];
  private brows: THREE.Mesh[] = [];
  private mouth!: THREE.Mesh;
  private cheeks: THREE.Mesh[] = [];
  private absMat!: THREE.MeshStandardMaterial;
  private shadow: THREE.Mesh;
  private j: Joints = { ...ZERO };
  private phase = 0;
  private t = 0;
  private blink = 0;
  private blinkTimer = 2;
  private items: Record<Exclude<Item, null>, THREE.Object3D>;
  pose: Pose = 'idle';
  expression: Expression = 'happy';
  /** 0..1 progress used by exercise poses (driven by mini-games). */
  action = 0;
  /** 0..1, how fat / how toned the body currently looks. */
  fat = 0;
  tone = 0;
  /** 0..1 fatigue — heavier breathing, droopier animation. */
  fatigue = 0;
  private shownFat = -1;
  private shownTone = -1;

  constructor(readonly look: Look) {
    const s = look.scale ?? 1;
    this.root.add(this.rig);
    this.rig.add(this.body);
    this.rig.scale.setScalar(s);

    const skin = mat(look.skin, { rough: 0.5, sheen: '#ffc9a8', emissive: 0.02 });
    const top = mat(look.top, { rough: 0.62, sheen: '#b07a7a' });
    const bottom = mat(look.bottom, { rough: 0.55, sheen: '#b07a7a' });
    const shoe = mat(look.shoes, { rough: 0.45, clear: 0.3 });
    const legMat = look.shorts ? skin : bottom;

    // --- Legs ---
    this.pelvis.position.y = 0.78;
    this.body.add(this.pelvis);
    this.parts.pelvis = mesh(SPH, bottom, this.pelvis, [0, 0.0, -0.01], [0.16, 0.12, 0.125]);
    for (const [lg, kn, sx] of [[this.lgL, this.knL, 1], [this.lgR, this.knR, -1]] as const) {
      lg.position.set(0.095 * sx, -0.02, 0);
      this.pelvis.add(lg);
      const thigh = mesh(capsule(0.085, 0.24), look.shorts ? bottom : legMat, lg, [0, -0.17, 0]);
      if (look.shorts) { mesh(capsule(0.075, 0.2), skin, lg, [0, -0.24, 0]); thigh.scale.set(1.08, 0.55, 1.08); thigh.position.y = -0.1; }
      this.parts[`thigh${sx}`] = thigh;
      kn.position.y = -0.36;
      lg.add(kn);
      this.parts[`shin${sx}`] = mesh(capsule(0.068, 0.24), look.shorts ? skin : legMat, kn, [0, -0.16, 0]);
      const foot = new THREE.Group();
      foot.position.y = -0.37;
      kn.add(foot);
      mesh(new RoundedBoxGeometry(0.17, 0.12, 0.3, 3, 0.055), shoe, foot, [0, -0.01, 0.05]);
      mesh(new RoundedBoxGeometry(0.18, 0.04, 0.31, 2, 0.018), mat('#e8e4de', { rough: 0.8 }), foot, [0, -0.07, 0.05]);
      mesh(new RoundedBoxGeometry(0.1, 0.02, 0.08, 2, 0.01), mat(look.male ? '#4d96ff' : '#f4a7bd', { rough: 0.5 }), foot, [0.0, 0.052, 0.07]);
    }

    // --- Torso: smooth lathe body with clothing shells ---
    this.spineG.position.y = 0.84;
    this.body.add(this.spineG);
    const torsoG = new THREE.Group();
    this.spineG.add(torsoG);
    this.parts.torso = torsoG;
    const skinProfile: [number, number][] = [[0, -0.07], [0.12, -0.06], [0.148, -0.01], [0.14, 0.06], [0.122, 0.13], [0.126, 0.2], [0.145, 0.27], [0.152, 0.32], [0.142, 0.37], [0.108, 0.415], [0.062, 0.44], [0, 0.45]];
    const maleK = look.male ? 1.12 : 1;
    const widen = (pts: [number, number][], d: number) => pts.map(([r, y]) => [r > 0 ? r * maleK + d : 0, y] as [number, number]);
    mesh(lathe(widen(skinProfile, 0)), skin, torsoG);
    // hips / leggings waistband
    const hips: [number, number][] = [[0, -0.1], [0.126, -0.085], [0.156, -0.02], [0.148, 0.05], [0.136, 0.085], [0, 0.09]];
    mesh(lathe(widen(hips, 0.004)), bottom, torsoG);
    mesh(lathe([[0.137 * maleK, 0.07], [0.14 * maleK, 0.088], [0.137 * maleK, 0.1]], true), mat(look.bottom === '#ffffff' ? '#e8e8e8' : '#3a1c1f', { rough: 0.5 }), torsoG);
    if (look.topStyle === 'bra') {
      mesh(lathe([[0.139, 0.225], [0.152, 0.255], [0.158, 0.3], [0.156, 0.335], [0.146, 0.36]], true), top, torsoG);
    } else {
      // tee / apron: full shirt shell
      mesh(lathe(widen([[0.13, 0.04], [0.13, 0.13], [0.132, 0.2], [0.15, 0.27], [0.158, 0.32], [0.148, 0.37], [0.114, 0.415], [0.07, 0.435]], 0.006), true), top, torsoG);
    }
    const bellyMat = look.topStyle === 'bra' ? skin : top;
    this.parts.belly = mesh(SPH, bellyMat, this.spineG, [0, 0.1, 0.03], [0.11, 0.09, 0.07]);
    if (look.topStyle === 'bra') {
      // Subtle abs, visible when toned
      this.absMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.7), transparent: true, opacity: 0, roughness: 0.6 });
      const absG = new THREE.Group();
      absG.position.set(0, 0.12, 0.099);
      for (let r = 0; r < 3; r++) for (const sx of [-1, 1]) {
        const a = new THREE.Mesh(new THREE.CircleGeometry(0.016, 12), this.absMat);
        a.position.set(sx * 0.024, 0.04 - r * 0.036, 0);
        a.scale.set(1, 1.2, 1);
        absG.add(a);
      }
      absG.add(new THREE.Mesh(new THREE.PlaneGeometry(0.005, 0.11), this.absMat));
      this.parts.abs = absG;
      this.spineG.add(absG);
    }
    this.chest.position.y = 0.2;
    this.spineG.add(this.chest);
    if (!look.male && look.topStyle === 'bra') {
      for (const sx of [-1, 1]) {
        mesh(SPH, top, this.chest, [sx * 0.058, 0.098, 0.062], [0.066, 0.06, 0.058]);
        const strap = mesh(new THREE.CapsuleGeometry(0.011, 0.1, 4, 8), top, this.chest, [sx * 0.085, 0.2, 0.05]);
        strap.rotation.z = sx * 0.28; strap.rotation.x = -0.25;
        const strapB = mesh(new THREE.CapsuleGeometry(0.011, 0.1, 4, 8), top, this.chest, [sx * 0.085, 0.2, -0.05]);
        strapB.rotation.z = sx * 0.28; strapB.rotation.x = 0.25;
      }
    }
    if (look.topStyle === 'apron') {
      mesh(new RoundedBoxGeometry(0.24, 0.4, 0.03, 2, 0.015), mat('#5a2f2d', { rough: 0.8 }), this.chest, [0, -0.02, 0.125]);
    }
    if (look.necklace) {
      const neck = mesh(new THREE.TorusGeometry(0.064, 0.005, 8, 32), mat('#e2b04a', { metal: 1, rough: 0.25 }), this.chest, [0, 0.215, 0.018]);
      neck.rotation.x = Math.PI / 2 - 0.55;
      mesh(SPH, mat('#e2b04a', { metal: 1, rough: 0.2 }), this.chest, [0, 0.17, 0.085], [0.013, 0.013, 0.008]);
    }
    this.parts.neck = mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.14, 20), skin, this.chest, [0, 0.25, 0]);

    // --- Arms ---
    for (const [sh, el, hand, sx] of [[this.shL, this.elL, this.handL, 1], [this.shR, this.elR, this.handR, -1]] as const) {
      sh.position.set(0.162 * sx, 0.15, 0);
      this.chest.add(sh);
      mesh(SPH, look.topStyle === 'tee' || look.topStyle === 'apron' ? top : skin, sh, [0, 0, 0], [0.058, 0.06, 0.058]);
      this.parts[`upper${sx}`] = mesh(capsule(0.056, 0.16), skin, sh, [0, -0.12, 0]);
      if (look.topStyle !== 'bra') mesh(capsule(0.062, 0.06), top, sh, [0, -0.05, 0]);
      el.position.y = -0.25;
      sh.add(el);
      this.parts[`fore${sx}`] = mesh(capsule(0.045, 0.15), skin, el, [0, -0.1, 0]);
      mesh(SPH, skin, el, [0, -0.23, 0.005], [0.055, 0.06, 0.045]);
      if (look.necklace && sx === 1) {
        const br = mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 20), mat('#e2b04a', { metal: 1, rough: 0.25 }), el, [0, -0.17, 0]);
        br.rotation.x = Math.PI / 2;
      }
      hand.position.set(0, -0.25, 0.02);
      el.add(hand);
    }

    // --- Head ---
    this.buildHead(skin);
    this.head.position.y = 0.45;
    this.chest.add(this.head);

    // --- Items for actions ---
    this.items = this.buildItems();

    // Soft blob shadow for grounding
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture('rgba(40,20,10,0.45)'), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.06;
    this.shadow.scale.setScalar(0.9 * s);
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
    this.applyShape();
  }

  private buildHead(skin: THREE.Material): void {
    const L = this.look;
    const h = this.head;
    this.parts.skull = mesh(SPH, skin, h, [0, 0, 0], [0.3, 0.29, 0.28]);
    // cheeks volume (grows when fat)
    for (const sx of [-1, 1]) {
      this.cheeks.push(mesh(SPH, skin, h, [sx * 0.13, -0.1, 0.16], [0.1, 0.085, 0.09]));
    }
    // chin
    mesh(SPH, skin, h, [0, -0.17, 0.12], [0.12, 0.09, 0.1]);
    // ears
    for (const sx of [-1, 1]) mesh(SPH, skin, h, [sx * 0.29, -0.03, 0], [0.045, 0.065, 0.035]);
    // nose
    mesh(SPH, mat(L.skin, { rough: 0.5, sheen: '#ffd2b8', emissive: 0.1 }), h, [0, -0.055, 0.275], [0.032, 0.026, 0.03]);

    const white = mat('#ffffff', { rough: 0.2, clear: 1 });
    const iris = mat(L.eyes, { rough: 0.2, clear: 1 });
    const pupil = mat('#120905', { rough: 0.2, clear: 1 });
    const hl = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const dark = mat('#2a160c', { rough: 0.8 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.105, 0.0, 0.228);
      mesh(SPH, white, eye, [0, 0, 0], [0.068, 0.078, 0.045]);
      mesh(SPH, iris, eye, [0, -0.004, 0.028], [0.05, 0.058, 0.03]);
      mesh(SPH, pupil, eye, [0, -0.004, 0.044], [0.027, 0.032, 0.018]);
      const h1 = new THREE.Mesh(SPH_LO, hl); h1.position.set(sx * 0.014 + 0.012, 0.022, 0.062); h1.scale.setScalar(0.013); eye.add(h1);
      const h2 = new THREE.Mesh(SPH_LO, hl); h2.position.set(-0.016, -0.02, 0.06); h2.scale.setScalar(0.007); eye.add(h2);
      if (L.lashes) {
        const lash = mesh(new THREE.TorusGeometry(0.072, 0.009, 6, 24, Math.PI * 0.95), dark, eye, [0, 0.004, 0.012]);
        lash.rotation.z = 0.08;
        lash.scale.set(1, 1.08, 1);
        const flick = mesh(new THREE.ConeGeometry(0.012, 0.045, 6), dark, eye, [sx * 0.07, 0.035, 0.012]);
        flick.rotation.z = -sx * 1.0;
      }
      eye.rotation.y = sx * 0.28;
      h.add(eye);
      this.eyes.push(eye);
      // Brows
      const brow = mesh(new THREE.TorusGeometry(0.075, L.male ? 0.016 : 0.013, 6, 20, Math.PI * 0.62), mat(L.hair === '#f1e3d3' ? '#8a6b4a' : '#2d170c', { rough: 0.9 }), h, [sx * 0.105, 0.075, 0.25]);
      brow.rotation.z = Math.PI * 0.19 + (sx > 0 ? 0.12 : -0.12);
      brow.rotation.y = sx * 0.3;
      brow.scale.set(1, 0.7, 1);
      this.brows.push(brow);
      // Blush
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshBasicMaterial({ color: '#ff8a8a', transparent: true, opacity: 0.35, depthWrite: false }));
      blush.position.set(sx * 0.17, -0.08, 0.24);
      blush.lookAt(new THREE.Vector3(sx * 0.17, -0.08, 0.24).multiplyScalar(3));
      h.add(blush);
    }
    // Mouth: open smile (lower half-disc) with teeth
    const mouthG = new THREE.Group();
    mouthG.position.set(0, -0.125, 0.262);
    mouthG.rotation.x = -0.35;
    this.mouth = mesh(new THREE.CircleGeometry(0.058, 24, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: '#7a2230', roughness: 0.6 }), mouthG, [0, 0, 0]);
    const teeth = mesh(new THREE.PlaneGeometry(0.09, 0.018), new THREE.MeshStandardMaterial({ color: '#ffffff' }), this.mouth, [0, -0.01, 0.001]);
    teeth.castShadow = false;
    const lip = mesh(new THREE.TorusGeometry(0.058, 0.007, 6, 24, Math.PI), mat(L.male ? '#b0624a' : '#c0505a', { rough: 0.4, clear: 0.6 }), this.mouth, [0, 0, 0.001]);
    lip.rotation.z = Math.PI;
    h.add(mouthG);
    if (!L.male) mesh(SPH_LO, dark, h, [0.07, -0.1, 0.265], [0.007, 0.007, 0.005]);
    if (L.beard) {
      const bm = mat(L.hair, { rough: 0.9 });
      mesh(SPH, bm, h, [0, -0.19, 0.12], [0.16, 0.08, 0.1]);
      for (const sx of [-1, 1]) mesh(SPH, bm, h, [sx * 0.17, -0.12, 0.1], [0.07, 0.1, 0.08]);
    }

    this.buildHair();
    h.add(this.hairG);

    if (L.headphones) {
      const hp = mat('#fafafa', { rough: 0.22, clear: 1 });
      const pad = mat('#dedee6', { rough: 0.85 });
      const band = mesh(new THREE.TorusGeometry(0.43, 0.032, 14, 48, Math.PI), hp, h, [0, 0.04, -0.03]);
      band.scale.set(1.0, 1.08, 1.6);
      const bandPad = mesh(new THREE.TorusGeometry(0.42, 0.02, 10, 40, Math.PI * 0.5), pad, h, [0, 0.04, -0.03]);
      bandPad.rotation.z = Math.PI * 0.25; bandPad.scale.set(1, 1.08, 1.6);
      for (const sx of [-1, 1]) {
        const cup = mesh(new THREE.CylinderGeometry(0.135, 0.125, 0.13, 40), hp, h, [sx * 0.4, -0.02, -0.02]);
        cup.rotation.z = Math.PI / 2;
        const cushion = mesh(new THREE.TorusGeometry(0.1, 0.036, 14, 32), pad, h, [sx * 0.33, -0.02, -0.02]);
        cushion.rotation.y = Math.PI / 2;
        const cap = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 40), mat('#f2f2f5', { rough: 0.15, clear: 1 }), h, [sx * 0.47, -0.02, -0.02]);
        cap.rotation.z = Math.PI / 2;
        const yoke = mesh(new THREE.CapsuleGeometry(0.02, 0.12, 4, 10), hp, h, [sx * 0.42, 0.14, -0.03]);
        yoke.rotation.z = sx * 0.15;
      }
    }
  }

  /** Builds the hair as ONE merged mesh of many curls with a dark→golden gradient. */
  private buildHair(): void {
    const L = this.look;
    const geos: THREE.BufferGeometry[] = [];
    const cA = new THREE.Color(L.hair), cB = new THREE.Color(L.hairTip), tmp = new THREE.Color();
    const add = (x: number, y: number, z: number, r: number, k: number, sy = 1) => {
      const g = SPH_LO.clone();
      g.scale(r, r * sy, r);
      g.translate(x, y, z);
      tmp.copy(cA).lerp(cB, Math.max(0, Math.min(1, k)));
      const v = 0.85 + Math.random() * 0.3;
      tmp.multiplyScalar(v);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    };
    const tubes: THREE.BufferGeometry[] = [];
    /** A corkscrew curl: a tube spiralling around an axis, colored root→tip. */
    const ringlet = (start: THREE.Vector3, dir: THREE.Vector3, len: number, coil: number, turns: number, tubeR: number, k0: number, k1: number) => {
      const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const u1 = new THREE.Vector3().crossVectors(dir, up).normalize();
      const v1 = new THREE.Vector3().crossVectors(dir, u1).normalize();
      const ph = Math.random() * Math.PI * 2;
      const curve = new FnCurve((t, target) => {
        const a = ph + t * turns * Math.PI * 2;
        const cr = coil * (0.7 + t * 0.5);
        return target.copy(start).addScaledVector(dir, len * t).addScaledVector(u1, Math.cos(a) * cr).addScaledVector(v1, Math.sin(a) * cr);
      });
      const seg = Math.max(12, Math.round(turns * 10));
      const g = new THREE.TubeGeometry(curve, seg, tubeR, 6, false);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const var_ = 0.88 + Math.random() * 0.24;
      for (let i = 0; i < n; i++) {
        const t = Math.floor(i / 7) / seg;
        tmp.copy(cA).lerp(cB, THREE.MathUtils.clamp(k0 + (k1 - k0) * Math.pow(t, 1.8), 0, 1)).multiplyScalar(var_);
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    };
    const isFace = (x: number, y: number, z: number) => z > 0.05 && y < 0.2 - Math.abs(x) * 0.25 && Math.abs(x) < 0.3;
    // Base cap so no scalp shows
    add(0, 0.08, -0.05, 0.295, 0.05, 0.98);
    if (L.hairStyle === 'curly') {
      // Soft inner volume so no scalp shows between curls
      for (let i = 0; i < 46; i++) {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - 2 * Math.random());
        const dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        if (dir.y < -0.25) continue;
        const p = dir.clone().multiplyScalar(0.25);
        p.x *= 1.06;
        if (isFace(p.x, p.y, p.z) || (p.z > 0.12 && p.y < 0.24)) continue;
        add(p.x, p.y + 0.04, p.z - 0.03, 0.11 + Math.random() * 0.03, 0.05 + Math.random() * 0.1);
      }
      // Curl loops lying on the crown — curly texture without spikes
      const loop = new THREE.TorusGeometry(0.036, 0.017, 6, 14);
      const q = new THREE.Quaternion();
      for (let i = 0; i < 120; i++) {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - 2 * Math.random());
        const dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        if (dir.y < -0.15) continue;
        const p = dir.clone().multiplyScalar(0.335 + Math.random() * 0.03);
        p.x *= 1.06; p.y += 0.04; p.z -= 0.03;
        if (p.z > 0.14 && p.y < 0.27) continue;
        if (Math.abs(dir.x) > 0.72 && dir.y < 0.4) continue; // leave room for the headphone cups
        const g = loop.clone();
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)).normalize());
        g.applyQuaternion(q);
        g.scale(1 + Math.random() * 0.4, 1 + Math.random() * 0.4, 1);
        g.translate(p.x, p.y, p.z);
        tmp.copy(cA).lerp(cB, 0.05 + Math.random() * 0.25 + Math.max(0, -p.y) * 0.8).multiplyScalar(0.85 + Math.random() * 0.3);
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) { col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        tubes.push(g);
      }
      // Bangs: a few curls along the hairline
      for (let i = 0; i < 7; i++) {
        const a = -0.75 + (i / 6) * 1.5;
        const p = new THREE.Vector3(Math.sin(a) * 0.23, 0.25 + Math.cos(a * 1.6) * 0.03, 0.16 + Math.cos(a) * 0.05);
        tubes.push(ringlet(p, new THREE.Vector3(Math.sin(a) * 0.6, -0.5, 0.6).normalize(), 0.09, 0.026, 1.3, 0.023, 0.2, 0.45));
      }
      // Long bouncy ringlets — the signature look (dark roots, golden tips)
      const count = 58;
      for (let i = 0; i < count; i++) {
        const u = i / (count - 1);
        const ang = THREE.MathUtils.lerp(0.95, Math.PI * 2 - 0.95, u) + (Math.random() - 0.5) * 0.12; // 0 = front
        const ear = Math.min(Math.abs(ang - Math.PI / 2), Math.abs(ang - Math.PI * 1.5));
        if (ear < 0.36) continue; // keep the headphone cups visible
        const layer = i % 2;
        const r = 0.28 + layer * 0.03;
        const out = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
        const start = out.clone().multiplyScalar(r).add(new THREE.Vector3(0, 0.1 + Math.random() * 0.1 - layer * 0.04, -0.03));
        start.x *= 1.06;
        const dir = out.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, -1, 0)).normalize();
        const len = 0.4 + Math.random() * 0.22 - (Math.abs(Math.cos(ang)) > 0.5 && Math.cos(ang) > 0 ? 0.12 : 0);
        tubes.push(ringlet(start, dir, len, 0.03 + Math.random() * 0.008, 5 + Math.random() * 2, 0.023, 0.05, 0.9));
      }
      // Face-framing curls in front of the headphones
      for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) {
        const start = new THREE.Vector3(sx * (0.27 + k * 0.03), 0.12 - k * 0.04, 0.12 - k * 0.05);
        tubes.push(ringlet(start, new THREE.Vector3(sx * 0.3, -1, 0.12).normalize(), 0.34 + k * 0.08, 0.028, 5, 0.022, 0.1, 0.9));
      }
    } else if (L.hairStyle === 'short') {
      for (let i = 0; i < 90; i++) {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - 2 * Math.random());
        const p = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)).multiplyScalar(0.3);
        if (p.y < 0.02 || isFace(p.x, p.y, p.z) && p.y < 0.2) continue;
        add(p.x, p.y + 0.02, p.z - 0.01, 0.06, 0.2);
      }
    } else {
      // bun / ponytail: smooth hair + bun on top or tail at back
      for (let i = 0; i < 70; i++) {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(1 - 2 * Math.random());
        const p = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)).multiplyScalar(0.3);
        if (p.y < -0.12 || isFace(p.x, p.y, p.z)) continue;
        add(p.x * 1.02, p.y + 0.015, p.z * 1.02 - 0.01, 0.07, 0.15);
      }
      if (L.hairStyle === 'bun') {
        add(0, 0.36, -0.06, 0.14, 0.5);
        add(0, 0.3, -0.02, 0.1, 0.4);
      } else {
        add(0, 0.18, -0.3, 0.06, 0.3);
        for (let j = 0; j < 7; j++) add(0, 0.14 - j * 0.07, -0.34 - Math.sin(j * 0.5) * 0.04, 0.085 - j * 0.004, 0.3 + j * 0.1);
      }
    }
    const merged = mergeGeometries([...geos.map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }), ...tubes.map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; })], false)!;
    const hairMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#b8844e'), sheenRoughness: 0.4, clearcoat: 0.2, clearcoatRoughness: 0.4 });
    const hm = new THREE.Mesh(merged, hairMat);
    hm.castShadow = true;
    this.hairG.add(hm);
  }

  private buildItems(): Record<Exclude<Item, null>, THREE.Object3D> {
    const makeDumb = (color: string) => {
      const g = new THREE.Group();
      mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 10), mat('#c9ccd4', { metal: 0.8, rough: 0.3 }), g).rotation.z = Math.PI / 2;
      for (const sx of [-1, 1]) mesh(new RoundedBoxGeometry(0.07, 0.11, 0.11, 2, 0.03), mat(color, { rough: 0.35, clear: 0.6 }), g, [sx * 0.1, 0, 0]);
      return g;
    };
    const dl = makeDumb('#ff7aa2'); this.handL.add(dl);
    const dr = makeDumb('#ff7aa2'); this.handR.add(dr);
    const dumbbells = new THREE.Group();
    dumbbells.userData.parts = [dl, dr];
    const cup = new THREE.Group();
    const glass = mesh(new THREE.CylinderGeometry(0.045, 0.036, 0.13, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: '#cfefff', transmission: 0.7, roughness: 0.05, transparent: true, opacity: 0.6, side: THREE.DoubleSide }), cup, [0, 0.05, 0.03]);
    glass.castShadow = false;
    mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.09, 20), mat('#7cc8ff', { rough: 0.1, clear: 1 }), cup, [0, 0.03, 0.03]);
    this.handR.add(cup);
    const phone = new THREE.Group();
    mesh(new RoundedBoxGeometry(0.1, 0.19, 0.015, 2, 0.012), mat('#1c1c22', { rough: 0.3, clear: 1 }), phone, [0, 0.06, 0.03]);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.17), new THREE.MeshBasicMaterial({ color: '#ffd9e6' }));
    scr.position.set(0, 0.06, 0.039);
    scr.rotation.y = 0;
    phone.add(scr);
    this.handR.add(phone);
    const food = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.05, 20), mat('#ffffff', { rough: 0.3 }), food, [0, 0.0, 0.08]);
    for (let i = 0; i < 5; i++) mesh(SPH_LO, mat(['#7bd389', '#ff7b6b', '#ffd166', '#ff9f68', '#8fd06a'][i]), food, [(Math.random() - 0.5) * 0.1, 0.035, 0.08 + (Math.random() - 0.5) * 0.08], [0.03, 0.025, 0.03]);
    this.handR.add(food);
    const ball = new THREE.Group();
    mesh(SPH, mat('#e8762c', { rough: 0.7 }), ball, [0, 0.05, 0.1], [0.12, 0.12, 0.12]);
    this.handR.add(ball);
    const all = { dumbbells, cup, phone, food, ball };
    for (const k of Object.keys(all) as (keyof typeof all)[]) this.setItemVisible(all[k], false);
    return all;
  }

  private setItemVisible(o: THREE.Object3D, v: boolean): void {
    if (o.userData.parts) (o.userData.parts as THREE.Object3D[]).forEach((p) => (p.visible = v));
    else o.visible = v;
  }

  /** Recolors the outfit (top + bottom). */
  setOutfit(color: string): void {
    const oldTop = mat(this.look.top, { rough: 0.62, sheen: '#b07a7a' });
    const oldBottom = mat(this.look.bottom, { rough: 0.55, sheen: '#b07a7a' });
    const newTop = mat(color, { rough: 0.62, sheen: '#b07a7a' });
    const newBottom = mat(color, { rough: 0.55, sheen: '#b07a7a' });
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.material === oldTop) m.material = newTop;
      else if (m.material === oldBottom) m.material = newBottom;
    });
    this.look.top = color;
    this.look.bottom = color;
  }

  hold(item: Item): void {
    for (const k of Object.keys(this.items) as Exclude<Item, null>[]) this.setItemVisible(this.items[k], k === item);
  }

  /** Current world position of the head — used for sweat particles and speech bubbles. */
  headWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.head.getWorldPosition(out);
  }

  private applyShape(): void {
    const f = this.fat, t = this.tone * (1 - this.fat);
    if (Math.abs(f - this.shownFat) < 0.002 && Math.abs(t - this.shownTone) < 0.002) return;
    this.shownFat = f; this.shownTone = t;
    const male = this.look.male ? 1 : 0;
    const P = this.parts;
    const fb = Math.max(0, f - 0.18);
    P.belly.scale.set(0.11 * (1 + fb * 1.3 + male * 0.1), 0.09 * (1 + fb * 0.7), 0.066 * (1 + fb * 3.4));
    P.belly.position.z = 0.03 + fb * 0.04;
    P.pelvis.scale.set(0.16 * (1 + f * 0.55), 0.12 * (1 + f * 0.2), 0.125 * (1 + f * 0.6));
    P.torso.scale.set(1 + f * 0.38 + t * 0.03, 1, 1 + f * 0.55);
    for (const sx of [1, -1]) {
      P[`thigh${sx}`].scale.set(1 + f * 0.75 + t * 0.06, 1, 1 + f * 0.7 + t * 0.06);
      P[`shin${sx}`].scale.set(1 + f * 0.4 + t * 0.08, 1, 1 + f * 0.4 + t * 0.08);
      P[`upper${sx}`].scale.set(1 + f * 0.65 + t * 0.35, 1, 1 + f * 0.65 + t * 0.3);
      P[`fore${sx}`].scale.set(1 + f * 0.4 + t * 0.12, 1, 1 + f * 0.4 + t * 0.12);
    }
    this.lgL.position.x = 0.095 + f * 0.05; this.lgR.position.x = -0.095 - f * 0.05;
    this.shL.position.x = 0.162 + f * 0.055 + t * 0.01; this.shR.position.x = -(0.162 + f * 0.055 + t * 0.01);
    P.neck.scale.set(1 + f * 0.6, 1, 1 + f * 0.6);
    for (const c of this.cheeks) c.scale.set(0.1 * (1 + f * 0.7), 0.085 * (1 + f * 0.5), 0.09 * (1 + f * 0.6));
    P.skull.scale.set(0.3 * (1 + f * 0.06), 0.29, 0.28 * (1 + f * 0.04));
    if (this.absMat) this.absMat.opacity = Math.max(0, t * 1.4 - 0.25) * 0.7;
  }

  update(dt: number, speed: number): void {
    this.t += dt;
    this.applyShape();
    const J = this.target(speed, dt);
    const k = this.pose === 'walk' || this.pose === 'run' || this.pose === 'treadmill' || this.pose === 'swim' || this.pose === 'dance' ? 18 : 10;
    for (const key of Object.keys(J) as (keyof Joints)[]) this.j[key] = damp(this.j[key], J[key], k, dt);
    const j = this.j;
    this.body.position.y = j.bodyY;
    this.body.rotation.set(j.lean, j.twist, j.sway);
    this.rig.rotation.x = j.rootRx;
    this.spineG.rotation.x = j.spine;
    this.head.rotation.set(j.head, j.headY, j.headZ);
    this.shL.rotation.set(j.shL, 0, j.shLz);
    this.shR.rotation.set(j.shR, 0, j.shRz);
    this.elL.rotation.x = j.elL; this.elR.rotation.x = j.elR;
    this.lgL.rotation.set(j.lgL, 0, j.lgLz); this.lgR.rotation.set(j.lgR, 0, j.lgRz);
    this.knL.rotation.x = j.knL; this.knR.rotation.x = j.knR;
    // Breathing: faster & deeper when tired or out of shape
    const br = 1.6 + this.fatigue * 6;
    const depth = 0.012 + this.fatigue * 0.05;
    this.chest.scale.set(1 + Math.sin(this.t * br) * depth * 0.6, 1 + Math.sin(this.t * br) * depth, 1 + Math.sin(this.t * br) * depth);
    // Hair bounce
    this.hairG.position.y = Math.sin(this.phase * 2) * 0.006 * Math.min(speed, 6);
    this.hairG.rotation.x = damp(this.hairG.rotation.x, Math.min(speed, 8) * 0.012, 6, dt);
    this.updateFace(dt);
    this.shadow.scale.setScalar((0.9 + this.fat * 0.35) * (this.look.scale ?? 1) * (1 - Math.min(0.5, j.bodyY * 0.8)));
    this.shadow.visible = this.pose !== 'sleep' && this.pose !== 'lounge' && this.pose !== 'swim';
  }

  private updateFace(dt: number): void {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blink = 1; this.blinkTimer = 2 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - dt * 7);
    const e = this.expression;
    let open = 1 - Math.sin(this.blink * Math.PI) * 0.9;
    if (e === 'sleep') open = 0.08;
    if (e === 'tired') open *= 0.55;
    if (e === 'wow') open *= 1.15;
    for (const eye of this.eyes) eye.scale.y = damp(eye.scale.y, open, 25, dt);
    let mouthY = 1, mouthX = 1;
    if (e === 'tired') { mouthY = 0.9 + Math.abs(Math.sin(this.t * (2 + this.fatigue * 5))) * 0.9; mouthX = 0.6; }
    if (e === 'effort') { mouthY = 0.35; mouthX = 1.15; }
    if (e === 'sleep') { mouthY = 0.15; mouthX = 0.5; }
    if (e === 'sad') { mouthY = -0.4; mouthX = 0.7; }
    if (e === 'wow') { mouthY = 1.5; mouthX = 0.7; }
    this.mouth.scale.x = damp(this.mouth.scale.x, mouthX, 12, dt);
    this.mouth.scale.y = damp(this.mouth.scale.y, mouthY, 12, dt);
    const browLift = e === 'effort' ? -0.02 : e === 'wow' ? 0.03 : e === 'sad' || e === 'tired' ? 0.01 : 0;
    const browTilt = e === 'effort' ? -0.25 : e === 'sad' || e === 'tired' ? 0.25 : 0;
    this.brows.forEach((b, i) => {
      const sx = i === 0 ? -1 : 1;
      b.position.y = damp(b.position.y, 0.075 + browLift, 10, dt);
      b.rotation.z = damp(b.rotation.z, Math.PI * 0.19 + (sx > 0 ? 0.12 : -0.12) + sx * browTilt, 10, dt);
    });
  }

  private target(speed: number, dt: number): Joints {
    const J: Joints = { ...ZERO };
    const t = this.t, fat = this.fat, fg = this.fatigue;
    const idleBreath = Math.sin(t * 1.8) * 0.01;
    switch (this.pose) {
      case 'idle':
      case 'talk': {
        J.bodyY = idleBreath;
        J.sway = Math.sin(t * 0.9) * 0.025;
        J.head = Math.sin(t * 0.7) * 0.05 + fg * 0.2;
        J.headY = Math.sin(t * 0.45) * 0.15;
        J.shLz = 0.14 + fat * 0.35; J.shRz = -0.14 - fat * 0.35;
        if (this.pose === 'talk') { J.shR = -0.5 + Math.sin(t * 4) * 0.2; J.elR = -1.1; J.headZ = Math.sin(t * 2) * 0.08; }
        break;
      }
      case 'walk':
      case 'run':
      case 'treadmill': {
        const run = this.pose !== 'walk';
        const freq = run ? 1.25 : 1.65;
        this.phase += dt * Math.max(speed, this.pose === 'treadmill' ? 1 : run ? 5 : 2) * freq;
        const p = this.phase;
        const heavy = 1 - fat * 0.45 - fg * 0.25;
        const amp = (run ? 0.95 : 0.55) * heavy;
        J.lgL = Math.sin(p) * amp; J.lgR = -Math.sin(p) * amp;
        J.knL = Math.max(0, -Math.cos(p)) * (run ? 1.5 : 0.7) * heavy + 0.05;
        J.knR = Math.max(0, Math.cos(p)) * (run ? 1.5 : 0.7) * heavy + 0.05;
        J.shL = -Math.sin(p) * amp * 0.9; J.shR = Math.sin(p) * amp * 0.9;
        J.shLz = 0.12 + fat * 0.45; J.shRz = -0.12 - fat * 0.45;
        J.elL = run ? -1.4 : -0.35; J.elR = run ? -1.4 : -0.35;
        J.bodyY = Math.abs(Math.sin(p)) * (run ? 0.07 : 0.035) - (run ? 0.03 : 0);
        J.lean = run ? 0.2 + fg * 0.15 : 0.05;
        J.sway = Math.sin(p) * (0.04 + fat * 0.12);
        J.twist = Math.sin(p) * 0.08;
        J.head = -J.lean * 0.6 + fg * 0.25;
        break;
      }
      case 'jump':
        J.bodyY = 0; J.lgL = -0.7; J.lgR = -0.2; J.knL = 1.2; J.knR = 0.5;
        J.shL = -2.6; J.shR = -2.6; J.shLz = 0.4; J.shRz = -0.4; J.elL = -0.3; J.elR = -0.3;
        break;
      case 'tired':
        J.lean = 0.55; J.bodyY = -0.08 + Math.sin(t * 7) * 0.012; J.lgL = -0.35; J.lgR = -0.35; J.knL = 0.6; J.knR = 0.6;
        J.shL = -0.9; J.shR = -0.9; J.elL = -0.1; J.elR = -0.1; J.shLz = 0.25; J.shRz = -0.25; J.head = -0.35;
        break;
      case 'lift': {
        const a = this.action; // 0 = arms down, 1 = full curl
        J.bodyY = idleBreath - a * 0.01;
        J.shL = -0.15 - a * 0.25; J.shR = -0.15 - a * 0.25;
        J.shLz = 0.18 + fat * 0.3; J.shRz = -0.18 - fat * 0.3;
        J.elL = -0.3 - a * 1.95; J.elR = -0.3 - a * 1.95;
        J.lean = -a * 0.06; J.head = -a * 0.08;
        J.lgLz = 0.08; J.lgRz = -0.08;
        break;
      }
      case 'band': {
        const a = this.action; // overhead pull like in the video
        J.shLz = 0.3 + a * 2.25; J.shRz = -0.3 - a * 2.25;
        J.shL = -0.2; J.shR = -0.2;
        J.elL = -0.2 + a * 0.1; J.elR = -0.2 + a * 0.1;
        J.head = -a * 0.2; J.bodyY = 0.35 + idleBreath; J.lgLz = 0.12; J.lgRz = -0.12;
        break;
      }
      case 'eat':
      case 'drink': {
        const cyc = (Math.sin(t * 3) + 1) / 2;
        J.shR = -0.6 - cyc * 0.7; J.elR = -1.6 - cyc * 0.6; J.shRz = -0.25;
        J.head = this.pose === 'drink' ? -0.2 - cyc * 0.2 : 0.05; J.bodyY = idleBreath;
        J.shLz = 0.15;
        break;
      }
      case 'sleep':
        J.rootRx = -Math.PI / 2; J.shLz = 0.15; J.shRz = -0.15; J.elL = -0.3; J.elR = -0.3; J.headY = 0.2;
        break;
      case 'lounge':
        J.rootRx = -Math.PI / 2 + 0.5; J.shL = -2.6; J.shR = -2.6; J.elL = -1.8; J.elR = -1.8; J.lgL = -0.2; J.knL = 0.5; J.bodyY = 0.05;
        break;
      case 'sit':
      case 'drive':
        J.lgL = -1.5; J.lgR = -1.5; J.knL = 1.45; J.knR = 1.45; J.bodyY = -0.34;
        if (this.pose === 'drive') { J.shL = -1.1; J.shR = -1.1; J.elL = -0.4; J.elR = -0.4; J.shLz = 0.25; J.shRz = -0.25; J.headY = Math.sin(t * 0.5) * 0.1; }
        else { J.shL = -0.3; J.shR = -0.3; J.elL = -0.9; J.elR = -0.9; J.headY = Math.sin(t * 0.5) * 0.3; J.head = -0.05; }
        break;
      case 'wave':
        J.shRz = -2.5; J.elR = -0.3 + Math.sin(t * 9) * 0.35; J.shR = -0.2; J.headZ = 0.12; J.bodyY = idleBreath; J.sway = 0.05;
        break;
      case 'flex':
        J.shLz = 1.5; J.shRz = -1.5; J.shL = -0.1; J.shR = -0.1; J.elL = -2.2; J.elR = -2.2;
        J.bodyY = idleBreath; J.head = -0.05; J.headZ = Math.sin(t * 2) * 0.05; J.lgLz = 0.1; J.lgRz = -0.1;
        break;
      case 'selfie':
        J.shR = -1.6; J.shRz = -0.5; J.elR = -0.35; J.shLz = 1.4; J.elL = -2.4; J.shL = -0.2;
        J.headZ = -0.15; J.head = -0.05; J.sway = -0.05; J.lgLz = 0.12;
        break;
      case 'dance': {
        const b = t * 7;
        J.bodyY = Math.abs(Math.sin(b)) * 0.06; J.sway = Math.sin(b / 2) * 0.12; J.twist = Math.sin(b / 2) * 0.3;
        J.shLz = 1.2 + Math.sin(b) * 0.9; J.shRz = -1.2 + Math.sin(b) * 0.9; J.elL = -0.8; J.elR = -0.8;
        J.lgL = Math.max(0, Math.sin(b)) * -0.4; J.lgR = Math.max(0, -Math.sin(b)) * -0.4; J.knL = -J.lgL; J.knR = -J.lgR;
        J.headZ = Math.sin(b / 2) * 0.15;
        break;
      }
      case 'swim': {
        const s = t * 5;
        J.rootRx = Math.PI / 2 - 0.15; J.bodyY = -0.5;
        J.shL = -Math.PI + Math.sin(s) * 2.2; J.shR = -Math.PI - Math.sin(s) * 2.2; J.elL = -0.3; J.elR = -0.3;
        J.lgL = Math.sin(s * 2) * 0.3; J.lgR = -Math.sin(s * 2) * 0.3; J.head = -0.6;
        break;
      }
      case 'shoot': {
        const a = this.action;
        J.shL = -2.2 - a * 0.6; J.shR = -2.2 - a * 0.6; J.elL = -1.3 + a * 1.1; J.elR = -1.3 + a * 1.1;
        J.knL = 0.5 - a * 0.5; J.knR = 0.5 - a * 0.5; J.lgL = -0.3 + a * 0.3; J.lgR = -0.3 + a * 0.3; J.bodyY = -0.06 + a * 0.2;
        break;
      }
    }
    return J;
  }
}
