import * as THREE from 'three';

export type CamMode =
  | { kind: 'follow' }
  | { kind: 'car'; yaw: number; speed: number }
  | { kind: 'focus'; x: number; z: number; face: number; dist?: number; height?: number; side?: number }
  | { kind: 'selfie'; x: number; z: number; face: number };

/** Third-person orbit camera with smooth transitions between gameplay framings. */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.32;
  dist = 7.5;
  private target = new THREE.Vector3();
  private look = new THREE.Vector3();
  private idleT = 0;
  private shake = 0;
  mode: CamMode = { kind: 'follow' };

  constructor(readonly cam: THREE.PerspectiveCamera) {}

  addShake(v: number): void { this.shake = Math.min(1, this.shake + v); }

  snap(p: THREE.Vector3): void {
    this.target.copy(p).setY(p.y + 1.3);
    this.look.copy(this.target);
    this.place(1, 1);
  }

  update(dt: number, subject: THREE.Vector3, subjectYaw: number, look: { dx: number; dy: number; zoom: number }, moving: boolean): void {
    const m = this.mode;
    const manual = Math.abs(look.dx) + Math.abs(look.dy) > 0.5;
    if (m.kind === 'follow' || m.kind === 'car') {
      this.yaw -= look.dx * 0.0055;
      this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.004, -0.05, 1.25);
      this.dist = THREE.MathUtils.clamp(this.dist + look.zoom, 3.2, 16);
      if (manual) this.idleT = 0; else this.idleT += dt;
      if (m.kind === 'car') {
        const behind = m.yaw + Math.PI;
        if (this.idleT > 0.8) {
          let d = behind - this.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          this.yaw += d * Math.min(1, dt * (1 + Math.abs(m.speed) * 0.15));
        }
        this.target.lerp(new THREE.Vector3(subject.x, 1.4, subject.z), 1 - Math.exp(-dt * 10));
        const d = THREE.MathUtils.clamp(this.dist + 2.5 + Math.abs(m.speed) * 0.12, 6, 18);
        this.cam.fov = THREE.MathUtils.damp(this.cam.fov, 55 + Math.abs(m.speed) * 0.8, 4, dt);
        this.orbit(d, dt);
      } else {
        // Gently swing behind Yasmin while she moves and the player isn't steering the camera.
        if (moving && this.idleT > 1.2) {
          let d = subjectYaw + Math.PI - this.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          this.yaw += d * Math.min(1, dt * 0.9);
        }
        this.target.lerp(new THREE.Vector3(subject.x, subject.y + 1.3, subject.z), 1 - Math.exp(-dt * 12));
        this.cam.fov = THREE.MathUtils.damp(this.cam.fov, 52, 4, dt);
        this.orbit(this.dist, dt);
      }
    } else if (m.kind === 'focus' || m.kind === 'selfie') {
      const selfie = m.kind === 'selfie';
      const d = selfie ? 2.1 : (m as { dist?: number }).dist ?? 4.2;
      const h = selfie ? 1.55 : (m as { height?: number }).height ?? 1.9;
      const side = selfie ? 0.25 : (m as { side?: number }).side ?? 0.35;
      const a = m.face + side;
      const want = new THREE.Vector3(m.x + Math.sin(a) * d, h, m.z + Math.cos(a) * d);
      this.cam.position.lerp(want, 1 - Math.exp(-dt * 5));
      this.look.lerp(new THREE.Vector3(m.x, selfie ? 1.45 : 1.1, m.z), 1 - Math.exp(-dt * 6));
      this.cam.fov = THREE.MathUtils.damp(this.cam.fov, selfie ? 40 : 48, 4, dt);
      this.cam.lookAt(this.look);
      // Keep orbit state in sync so returning to follow is smooth.
      const off = this.cam.position.clone().sub(subject);
      this.yaw = Math.atan2(off.x, off.z);
      this.target.copy(this.look);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * this.shake * 0.12;
      this.cam.position.x += (Math.random() - 0.5) * s;
      this.cam.position.y += (Math.random() - 0.5) * s;
    }
    this.cam.updateProjectionMatrix();
  }

  private orbit(d: number, dt: number): void {
    this.place(d, 1 - Math.exp(-dt * 14));
  }

  private place(d: number, k: number): void {
    const cp = Math.cos(this.pitch);
    const want = new THREE.Vector3(
      this.target.x + Math.sin(this.yaw) * cp * d,
      Math.max(0.6, this.target.y + Math.sin(this.pitch) * d),
      this.target.z + Math.cos(this.yaw) * cp * d,
    );
    this.cam.position.lerp(want, k);
    this.look.lerp(this.target, k);
    this.cam.lookAt(this.look);
  }
}
