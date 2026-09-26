import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Input } from '../core/input';
import type { CollisionWorld } from '../core/collision';
import { RING, terrainY } from '../world/layout';
import { blobTexture } from '../core/textures';

const glowMats: THREE.MeshStandardMaterial[] = [];

/** A cute, chunky convertible. */
export class Car {
  readonly group = new THREE.Group();
  readonly seat = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private frontWheels: THREE.Group[] = [];
  private bodyG = new THREE.Group();
  speed = 0;
  steer = 0;
  get yaw(): number { return this.group.rotation.y; }
  set yaw(v: number) { this.group.rotation.y = v; }
  get pos(): THREE.Vector3 { return this.group.position; }

  constructor(color: string, convertible = true) {
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
    const trim = new THREE.MeshPhysicalMaterial({ color: '#f3f3f5', roughness: 0.2, metalness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: '#23232a', roughness: 0.8 });
    const seatMat = new THREE.MeshStandardMaterial({ color: '#5b2b30', roughness: 0.6 });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.bodyG) => {
      const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me;
    };
    this.group.add(this.bodyG);
    add(new RoundedBoxGeometry(2.1, 0.75, 4.1, 4, 0.32), paint, 0, 0.72, 0);
    add(new RoundedBoxGeometry(1.95, 0.35, 1.5, 4, 0.17), paint, 0, 1.15, 1.25);
    add(new RoundedBoxGeometry(1.95, 0.35, 1.0, 4, 0.17), paint, 0, 1.15, -1.55);
    if (convertible) {
      // interior
      add(new RoundedBoxGeometry(1.7, 0.3, 1.9, 2, 0.1), dark, 0, 1.0, -0.15);
      for (const sx of [-0.45, 0.45]) {
        add(new RoundedBoxGeometry(0.7, 0.2, 0.7, 2, 0.08), seatMat, sx, 1.12, -0.35);
        add(new RoundedBoxGeometry(0.7, 0.8, 0.18, 2, 0.08), seatMat, sx, 1.45, -0.72);
      }
      const ws = add(new RoundedBoxGeometry(1.8, 0.6, 0.06, 2, 0.03), new THREE.MeshPhysicalMaterial({ color: '#bfe6ff', transmission: 0.8, roughness: 0.02, transparent: true, opacity: 0.35 }), 0, 1.55, 0.55);
      ws.rotation.x = -0.35;
      ws.castShadow = false;
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 20), dark);
      wheel.position.set(0.45, 1.4, 0.2); wheel.rotation.x = -0.6;
      this.bodyG.add(wheel);
    } else {
      const glass = new THREE.MeshPhysicalMaterial({ color: '#9fd4ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75 });
      add(new RoundedBoxGeometry(1.85, 0.75, 2.0, 4, 0.3), glass, 0, 1.55, -0.2);
      add(new RoundedBoxGeometry(1.9, 0.12, 2.05, 3, 0.05), paint, 0, 1.95, -0.2);
    }
    // bumpers, lights
    add(new RoundedBoxGeometry(2.0, 0.22, 0.25, 3, 0.1), trim, 0, 0.45, 2.08);
    add(new RoundedBoxGeometry(2.0, 0.22, 0.25, 3, 0.1), trim, 0, 0.45, -2.08);
    const head = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#fff1c4', emissiveIntensity: 0.2 });
    const tail = new THREE.MeshStandardMaterial({ color: '#ff4d6d', emissive: '#ff2d55', emissiveIntensity: 0.3 });
    glowMats.push(head, tail);
    for (const sx of [-0.68, 0.68]) {
      add(new THREE.SphereGeometry(0.17, 20, 14), head, sx, 0.85, 2.02).scale.z = 0.5;
      add(new RoundedBoxGeometry(0.35, 0.14, 0.08, 2, 0.04), tail, sx, 0.9, -2.06);
    }
    // wheels
    for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const w = new THREE.Group();
      w.position.set(x, 0.42, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 24), dark);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 16), trim);
      rim.rotation.z = Math.PI / 2;
      const spin = new THREE.Group(); spin.add(tire, rim);
      w.add(spin);
      this.group.add(w);
      this.wheels.push(spin as unknown as THREE.Group);
      if (z > 0) this.frontWheels.push(w);
    }
    this.seat.position.set(0.45, 0.95, -0.35);
    this.group.add(this.seat);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 5), new THREE.MeshBasicMaterial({ map: blobTexture('rgba(20,10,5,0.5)'), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.05;
    this.group.add(sh);
  }

  static setNight(glow: number): void {
    for (const m of glowMats) m.emissiveIntensity = 0.2 + glow * 3;
  }

  animate(dt: number): void {
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.42;
    for (const w of this.frontWheels) w.rotation.y = this.steer * 0.5;
    this.bodyG.rotation.z = THREE.MathUtils.damp(this.bodyG.rotation.z, -this.steer * Math.min(Math.abs(this.speed), 15) * 0.006, 6, dt);
    this.bodyG.position.y = Math.sin(performance.now() * 0.02) * 0.006 * Math.min(1, Math.abs(this.speed));
  }

  /** Player driving. Returns true if the car bumped into something. */
  drive(dt: number, input: Input, col: CollisionWorld, obstacles: THREE.Vector3[]): boolean {
    const mv = input.move();
    const throttle = mv.y;
    const steerIn = -mv.x;
    this.steer = THREE.MathUtils.damp(this.steer, steerIn, 8, dt);
    const max = 17, rev = -6;
    if (input.brake()) this.speed = THREE.MathUtils.damp(this.speed, 0, 5, dt);
    else if (throttle > 0.05) this.speed += throttle * (this.speed < 0 ? 22 : 9) * dt;
    else if (throttle < -0.05) this.speed += throttle * (this.speed > 0 ? 22 : 7) * dt;
    else this.speed = THREE.MathUtils.damp(this.speed, 0, 1.2, dt);
    this.speed = THREE.MathUtils.clamp(this.speed, rev, max);
    const turn = this.steer * (this.speed / (1 + Math.abs(this.speed) * 0.08)) * 0.32;
    this.yaw += turn * dt;
    const p = this.pos;
    p.x += Math.sin(this.yaw) * this.speed * dt;
    p.z += Math.cos(this.yaw) * this.speed * dt;
    let hit = false;
    // Two circles (front / back) approximate the car's footprint.
    const fx = Math.sin(this.yaw) * 1.1, fz = Math.cos(this.yaw) * 1.1;
    const front = new THREE.Vector3(p.x + fx, 0, p.z + fz);
    const back = new THREE.Vector3(p.x - fx, 0, p.z - fz);
    const fb = front.clone(), bb = back.clone();
    if (col.resolve(front, 1.05)) hit = true;
    if (col.resolve(back, 1.05)) hit = true;
    for (const o of obstacles) {
      for (const c of [front, back]) {
        const d = Math.hypot(c.x - o.x, c.z - o.z);
        if (d < 2.3 && d > 0.001) { c.x = o.x + ((c.x - o.x) / d) * 2.3; c.z = o.z + ((c.z - o.z) / d) * 2.3; hit = true; }
      }
    }
    p.x += (front.x - fb.x + back.x - bb.x) / 2;
    p.z += (front.z - fb.z + back.z - bb.z) / 2;
    p.y = THREE.MathUtils.damp(p.y, terrainY(p.x, p.z), 12, dt);
    if (hit && Math.abs(this.speed) > 2) this.speed *= -0.25;
    else if (hit) this.speed *= 0.5;
    this.animate(dt);
    return hit && Math.abs(this.speed) > 1;
  }

  idle(dt: number): void {
    this.speed = THREE.MathUtils.damp(this.speed, 0, 3, dt);
    this.animate(dt);
  }
}

/** Traffic cars circulating on the ring road. They brake for anything in front of them. */
type Loop = { x0: number; x1: number; z0: number; z1: number };

/** Traffic cars circulating on road loops. They brake for anything in front of them. */
export class Traffic {
  readonly cars: { car: Car; s: number; lane: number; speed: number; dir: number; loop: Loop; perim: number }[] = [];
  constructor(scene: THREE.Scene, loops: { loop: Loop; count: number }[] = [{ loop: RING, count: 6 }]) {
    const colors = ['#8fd3ff', '#ffd166', '#b5e48c', '#ffffff', '#c792ea', '#ff9f68', '#ff6b6b', '#2d2d3a', '#f7c9d4'];
    let ci = 0;
    for (const { loop, count } of loops) {
      const perim = 2 * ((loop.x1 - loop.x0) + (loop.z1 - loop.z0));
      for (let i = 0; i < count; i++) {
        const car = new Car(colors[ci++ % colors.length], false);
        scene.add(car.group);
        this.cars.push({ car, s: (i / count) * perim, lane: i % 2 ? 2.2 : -2.2, speed: 9, dir: i % 2 ? 1 : -1, loop, perim });
      }
    }
  }

  /** Point on the lane path at arc length s. lane>0 = outer lane. */
  private at(L: Loop, perim: number, s: number, lane: number): { x: number; z: number; yaw: number } {
    const { x0, x1, z0, z1 } = L;
    const w = x1 - x0, d = z1 - z0;
    s = ((s % perim) + perim) % perim;
    if (s < w) return { x: x0 + s, z: z0 - lane, yaw: Math.PI / 2 };
    s -= w;
    if (s < d) return { x: x1 + lane, z: z0 + s, yaw: 0 };
    s -= d;
    if (s < w) return { x: x1 - s, z: z1 + lane, yaw: -Math.PI / 2 };
    s -= w;
    return { x: x0 - lane, z: z1 - s, yaw: Math.PI };
  }

  update(dt: number, blockers: THREE.Vector3[]): void {
    for (const t of this.cars) {
      const ahead = this.at(t.loop, t.perim, t.s + t.dir * 6, t.lane);
      let blocked = false;
      for (const b of blockers) if (Math.hypot(b.x - ahead.x, b.z - ahead.z) < 4.5) blocked = true;
      for (const o of this.cars) if (o !== t && Math.hypot(o.car.pos.x - ahead.x, o.car.pos.z - ahead.z) < 3.5) blocked = true;
      t.speed = THREE.MathUtils.damp(t.speed, blocked ? 0 : 9, blocked ? 6 : 1.5, dt);
      t.s += t.dir * t.speed * dt;
      const p = this.at(t.loop, t.perim, t.s, t.lane);
      t.car.pos.set(p.x, 0, p.z);
      const yaw = t.dir > 0 ? p.yaw : p.yaw + Math.PI;
      let dy = yaw - t.car.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      t.car.yaw += dy * Math.min(1, dt * 6);
      t.car.speed = t.speed;
      t.car.animate(dt);
    }
  }
}
