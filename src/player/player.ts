import * as THREE from 'three';
import { Chibi, YASMIN, type Pose, type Avatar } from '../characters/chibi';
import type { Input } from '../core/input';
import type { CollisionWorld } from '../core/collision';
import type { GameState, Activity } from '../systems/state';
import type { Audio } from '../core/audio';

const UP = new THREE.Vector3(0, 1, 0);

/** Sweat droplets that fall from Yasmin's head when she's struggling. */
class Sweat {
  readonly mesh: THREE.InstancedMesh;
  private drops: { p: THREE.Vector3; v: THREE.Vector3; life: number }[] = [];
  private m = new THREE.Matrix4();
  private acc = 0;
  constructor(scene: THREE.Scene) {
    const g = new THREE.SphereGeometry(0.035, 8, 6);
    g.scale(1, 1.6, 1);
    const mat = new THREE.MeshPhysicalMaterial({ color: '#bfe9ff', roughness: 0.05, transmission: 0.4, transparent: true, opacity: 0.85, clearcoat: 1 });
    this.mesh = new THREE.InstancedMesh(g, mat, 60);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(dt: number, rate: number, head: THREE.Vector3): void {
    this.acc += rate * dt;
    while (this.acc > 1 && this.drops.length < 60) {
      this.acc -= 1;
      const a = Math.random() * Math.PI * 2;
      this.drops.push({
        p: head.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, 0.05 + Math.random() * 0.15, Math.sin(a) * 0.3)),
        v: new THREE.Vector3(Math.cos(a) * 0.6, 1.2 + Math.random(), Math.sin(a) * 0.6),
        life: 0.9,
      });
    }
    if (this.acc > 1) this.acc = 1;
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      d.v.y -= 9 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.life <= 0 || d.p.y < 0) { this.drops.splice(i, 1); continue; }
    }
    for (const d of this.drops) {
      this.m.makeScale(d.life + 0.2, d.life + 0.2, d.life + 0.2).setPosition(d.p);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Player {
  chibi: Avatar = new Chibi(YASMIN);
  readonly pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  vy = 0;
  grounded = true;
  /** When set, gameplay drives the pose/position (mini-games, eating, sleeping…). */
  locked = false;
  exhausted = 0;
  activity: Activity = 'idle';
  private sweat: Sweat;
  private stepT = 0;
  private headPos = new THREE.Vector3();
  sweatBoost = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.chibi.root);
    this.sweat = new Sweat(scene);
  }

  place(x: number, z: number, face: number): void {
    this.pos.set(x, 0, z);
    this.yaw = face;
    this.sync();
  }

  /** Swap in a different character (e.g. the real rigged model once it has loaded). */
  setAvatar(a: Avatar, scene: THREE.Scene): void {
    const old = this.chibi;
    a.fat = old.fat; a.tone = old.tone;
    old.root.removeFromParent();
    this.chibi = a;
    scene.add(a.root);
    this.sync();
  }

  private sync(): void {
    const r = this.chibi.root;
    if (r.parent && r.parent.type !== 'Scene') return; // seated in a car
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
  }

  /** Returns the distance travelled this frame. */
  update(dt: number, input: Input, camYaw: number, state: GameState, col: CollisionWorld, audio: Audio): number {
    const st = state.st;
    const c = this.chibi;
    c.fat = THREE.MathUtils.damp(c.fat, state.fatN, 1.5, dt);
    c.tone = THREE.MathUtils.damp(c.tone, state.toneN, 1.5, dt);
    let dist = 0;

    if (!this.locked) {
      const mv = input.move();
      const f = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
      const r = new THREE.Vector3().crossVectors(f, UP);
      const dir = f.multiplyScalar(mv.y).addScaledVector(r, mv.x);
      const mag = Math.min(1, dir.length());
      if (this.exhausted > 0) this.exhausted -= dt;
      const wantsRun = input.sprint() && st.stamina > 1 && this.exhausted <= 0 && mag > 0.2;
      const walkSpeed = 3.3, runSpeed = 7.2;
      const target = mag * (wantsRun ? runSpeed : walkSpeed) * state.speedMul;
      this.speed = THREE.MathUtils.damp(this.speed, target, 8, dt);
      if (mag > 0.05) {
        const want = Math.atan2(dir.x, dir.z);
        let d = want - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 12);
        dir.normalize();
        const step = this.speed * dt;
        this.pos.x += dir.x * step;
        this.pos.z += dir.z * step;
        dist = step;
      }
      // Stamina
      if (wantsRun) {
        st.stamina = Math.max(0, st.stamina - state.staminaDrain * dt);
        if (st.stamina <= 0) {
          this.exhausted = 2.5;
          state.emit({ type: 'toast', text: state.fatN > 0.4 ? 'יסמין מתנשפת... הגוף כבד מדי 😮‍💨' : 'נגמר האוויר! 😮‍💨', tone: 'bad' });
        }
      } else {
        st.stamina = Math.min(100, st.stamina + (this.speed < 0.5 ? 22 : 12) * dt * (1 - state.fatN * 0.4));
      }
      // Jump
      if (input.consume('jump') && this.grounded) {
        this.vy = 5.2 * (1 - state.fatN * 0.4);
        this.grounded = false;
        audio.play('whoosh');
      }
      this.vy -= 16 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }
      col.resolve(this.pos, 0.42);
      this.chibi.root.rotation.y = this.yaw;

      const running = wantsRun && this.speed > 4;
      let pose: Pose = 'idle';
      if (!this.grounded) pose = 'jump';
      else if (this.speed > 4.2) pose = 'run';
      else if (this.speed > 0.3) pose = 'walk';
      else if (this.exhausted > 0) pose = 'tired';
      c.pose = pose;
      this.activity = running ? 'run' : this.speed > 0.3 ? 'walk' : 'idle';
      // Footsteps
      if (this.grounded && this.speed > 0.5) {
        this.stepT -= dt * this.speed * (running ? 0.42 : 0.6);
        if (this.stepT <= 0) { this.stepT = 1; audio.play('step'); }
      }
    }

    // Fatigue drives breathing, facial expression and sweat.
    const staminaF = 1 - st.stamina / 100;
    const energyF = THREE.MathUtils.clamp((30 - st.energy) / 30, 0, 1);
    const moving = this.activity === 'run' ? 1 : 0;
    c.fatigue = THREE.MathUtils.clamp(Math.max(staminaF * 0.9, energyF, state.fatN * 0.6 * moving) + (this.exhausted > 0 ? 0.4 : 0), 0, 1);
    if (!this.locked) {
      c.expression = c.fatigue > 0.55 ? 'tired' : st.mood < 30 ? 'sad' : 'happy';
    }
    let sweatRate = 0;
    if (this.activity === 'run') sweatRate = 4 + state.fatN * 26 + staminaF * 12;
    if (this.exhausted > 0) sweatRate += 18;
    sweatRate += this.sweatBoost;
    this.sync();
    this.chibi.headWorld(this.headPos);
    this.sweat.update(dt, sweatRate, this.headPos);
    c.update(dt, this.speed);
    return dist;
  }
}
