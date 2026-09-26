import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { blobTexture } from '../core/textures';
import type { Avatar, Pose, Expression } from './chibi';

/**
 * A real, rigged 3D character (e.g. generated from Yasmin's image with Tripo/Meshy and
 * rigged in Mixamo). Drop the files into `public/models/yasmin/` with a manifest.json:
 *
 * {
 *   "model": "character.fbx",            // or .glb (may already contain animations)
 *   "animations": { "idle": "idle.fbx", "walk": "walk.fbx", "run": "run.fbx", ... }
 * }
 *
 * Body shape (fat / tone) is applied by scaling bone thickness, so the real model
 * gains or loses weight just like the procedural one.
 */
interface Manifest {
  model: string;
  animations?: Partial<Record<Pose, string>>;
  height?: number;
}

/** Which clip to fall back to when a pose has no dedicated animation. */
const FALLBACK: Record<Pose, Pose[]> = {
  idle: [], walk: ['idle'], run: ['walk'], jump: ['idle'], tired: ['idle'], lift: ['flex', 'idle'], band: ['flex', 'idle'],
  treadmill: ['run', 'walk'], eat: ['drink', 'idle'], drink: ['eat', 'idle'], sleep: ['lounge', 'sit', 'idle'], sit: ['idle'],
  drive: ['sit', 'idle'], wave: ['talk', 'idle'], flex: ['wave', 'idle'], selfie: ['wave', 'idle'], dance: ['wave', 'idle'],
  swim: ['run', 'idle'], lounge: ['sleep', 'sit', 'idle'], shoot: ['wave', 'idle'], talk: ['wave', 'idle'],
};

/** Poses whose animation is scrubbed by gameplay (mini-game progress) instead of looping. */
const SCRUB: Partial<Record<Pose, number>> = { lift: 0.5, band: 0.5, shoot: 1 };

const MIXAMO = (n: string) => n.replace(/^mixamorig[:_]?/i, '').toLowerCase();

export class ModelAvatar implements Avatar {
  readonly root = new THREE.Group();
  pose: Pose = 'idle';
  expression: Expression = 'happy';
  action = 0;
  fat = 0;
  tone = 0;
  fatigue = 0;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Pose, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentPose: Pose | null = null;
  private bones: Record<string, THREE.Bone> = {};
  private head: THREE.Object3D;
  private shadow: THREE.Mesh;

  private constructor(model: THREE.Object3D, clips: Map<Pose, THREE.AnimationClip>, height: number) {
    // Normalize size so the model matches the world scale.
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1;
    const s = height / h;
    model.scale.multiplyScalar(s);
    model.position.y -= box.min.y * s;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
      if ((o as THREE.Bone).isBone) this.bones[MIXAMO(o.name)] = o as THREE.Bone;
    });
    this.root.add(model);
    this.head = this.bones.head ?? model;
    this.mixer = new THREE.AnimationMixer(model);
    for (const [pose, clip] of clips) {
      // Drop scale tracks (we drive bone scale for body shape) and root motion on the hips.
      clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale') && !(/hips\.position$/i.test(MIXAMO(t.name)) && pose !== 'jump' && pose !== 'sleep' && pose !== 'sit' && pose !== 'drive' && pose !== 'lounge' && pose !== 'swim'));
      const a = this.mixer.clipAction(clip);
      this.actions.set(pose, a);
    }
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture('rgba(40,20,10,0.45)'), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.06;
    this.root.add(this.shadow);
  }

  /** Loads the character described by `<base>/manifest.json`, or returns null if absent. */
  static async load(base = 'models/yasmin/'): Promise<ModelAvatar | null> {
    let manifest: Manifest;
    try {
      const r = await fetch(base + 'manifest.json', { cache: 'no-cache' });
      if (!r.ok) return null;
      manifest = await r.json();
    } catch { return null; }
    const load = async (file: string): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> => {
      if (/\.fbx$/i.test(file)) {
        const o = await new FBXLoader().loadAsync(base + file);
        return { scene: o, clips: o.animations };
      }
      const g = await new GLTFLoader().loadAsync(base + file);
      return { scene: g.scene, clips: g.animations };
    };
    const main = await load(manifest.model);
    const clips = new Map<Pose, THREE.AnimationClip>();
    // Clips embedded in the model file are matched by name.
    for (const c of main.clips) {
      const n = c.name.toLowerCase();
      for (const p of Object.keys(FALLBACK) as Pose[]) if (n.includes(p) && !clips.has(p)) clips.set(p, c);
    }
    if (main.clips.length && !clips.has('idle')) clips.set('idle', main.clips[0]);
    for (const [pose, file] of Object.entries(manifest.animations ?? {}) as [Pose, string][]) {
      try {
        const a = await load(file);
        if (a.clips[0]) clips.set(pose, a.clips[0]);
      } catch (e) { console.warn('animation failed', pose, e); }
    }
    return new ModelAvatar(main.scene, clips, manifest.height ?? 1.9);
  }

  private clipFor(p: Pose, seen = new Set<Pose>()): { pose: Pose; action: THREE.AnimationAction } | null {
    const a = this.actions.get(p);
    if (a) return { pose: p, action: a };
    seen.add(p);
    for (const f of FALLBACK[p]) {
      if (seen.has(f)) continue;
      const r = this.clipFor(f, seen);
      if (r) return r;
    }
    return null;
  }

  update(dt: number, speed: number): void {
    const found = this.clipFor(this.pose);
    if (found && found.action !== this.current) {
      const next = found.action;
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.play();
      if (this.current) next.crossFadeFrom(this.current, 0.25, true);
      this.current = next;
      this.currentPose = found.pose;
    }
    if (this.current) {
      const scrub = SCRUB[this.pose];
      if (scrub !== undefined && this.currentPose === this.pose) {
        this.current.paused = true;
        this.current.time = this.action * this.current.getClip().duration * scrub;
      } else {
        this.current.paused = false;
        const moving = this.pose === 'walk' || this.pose === 'run' || this.pose === 'treadmill';
        this.current.timeScale = moving ? THREE.MathUtils.clamp(speed / (this.pose === 'walk' ? 3.2 : 6.5), 0.5, 1.6) * (1 - this.fat * 0.3) : 1 + this.fatigue * 0.3;
      }
    }
    this.mixer.update(dt);
    this.applyShape();
    this.shadow.scale.setScalar(0.9 + this.fat * 0.4);
  }

  /** Thickens / slims limbs and torso by scaling bones across their length axis. */
  private applyShape(): void {
    const f = this.fat, t = this.tone * (1 - f);
    const want: Record<string, number> = {
      hips: 1 + f * 0.25, spine: 1 + f * 0.55 - t * 0.05, spine1: 1 + f * 0.38, spine2: 1 + f * 0.18 + t * 0.04, neck: 1 + f * 0.25,
      leftupleg: 1 + f * 0.4 + t * 0.05, rightupleg: 1 + f * 0.4 + t * 0.05, leftleg: 1 + f * 0.25, rightleg: 1 + f * 0.25,
      leftarm: 1 + f * 0.4 + t * 0.22, rightarm: 1 + f * 0.4 + t * 0.22, leftforearm: 1 + f * 0.25 + t * 0.08, rightforearm: 1 + f * 0.25 + t * 0.08,
    };
    for (const [name, bone] of Object.entries(this.bones)) {
      const d = want[name] ?? 1;
      const parentName = bone.parent ? MIXAMO(bone.parent.name) : '';
      const pd = want[parentName] ?? 1;
      const k = d / pd;
      bone.scale.set(k, 1, k);
    }
  }

  hold(): void { /* props on the real model come later */ }
  setOutfit(): void { /* texture-based outfits come later */ }

  headWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.head.getWorldPosition(out);
  }
}
