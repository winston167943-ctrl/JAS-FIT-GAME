import * as THREE from 'three';
import { Chibi, type Look, type Pose } from './chibi';
import { RING, DOWNTOWN, HILL, CAFE, BEACH_X, SEA_X, terrainY, trackPoint } from '../world/layout';

type P = { x: number; z: number };

const SKINS = ['#f1c7a8', '#e7b08a', '#cf8b5f', '#a8714f', '#7b4a33', '#5e3826', '#f5d2b8'];
const HAIRS: [string, string][] = [['#1d120c', '#3a2618'], ['#4a2616', '#8a5230'], ['#e6b85c', '#f7dc8f'], ['#7a3b1c', '#c46a32'], ['#2b2b33', '#55555f'], ['#c9c3bb', '#ffffff']];
const OUTFIT = ['#ff8fb1', '#7fd6c2', '#ffd166', '#c792ea', '#4d96ff', '#ff6b6b', '#2d2d3a', '#ffffff', '#5b2b30', '#9bd67a', '#ff9f68'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function randomLook(): Look {
  const male = Math.random() < 0.45;
  const [hair, tip] = pick(HAIRS);
  const sporty = Math.random() < 0.5;
  return {
    skin: pick(SKINS), hair, hairTip: tip,
    top: pick(OUTFIT), bottom: sporty ? pick(['#2d2d3a', '#3a3a44', '#5b2b30', '#4d5a8a']) : pick(['#4d6ea8', '#c9b79c', '#2d2d3a', '#f4f1ea']),
    shoes: pick(['#ffffff', '#ff5d5d', '#26262c', '#ffd166']), eyes: pick(['#3a2a1a', '#3b6ea5', '#4a6b3a', '#2a1a10']),
    hairStyle: male ? 'short' : pick(['bun', 'ponytail', 'bun', 'short']),
    topStyle: male ? 'tee' : pick(['tee', 'bra', 'tee']),
    shorts: sporty && Math.random() < 0.5, male, beard: male && Math.random() < 0.3, lashes: !male,
    headphones: Math.random() < 0.15, scale: 0.92 + Math.random() * 0.14,
  };
}

/** Closed loop around a rectangle. */
const rect = (x0: number, z0: number, x1: number, z1: number): P[] => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
/** Out-and-back along a line (two sides so people don't bump). */
const line = (x0: number, z0: number, x1: number, z1: number, off: number): P[] => {
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = -dz / l * off, nz = dx / l * off;
  return [{ x: x0 + nx, z: z0 + nz }, { x: x1 + nx, z: z1 + nz }, { x: x1 - nx, z: z1 - nz }, { x: x0 - nx, z: z0 - nz }];
};
function hillTrail(): P[] {
  const pts: P[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, ang = t * Math.PI * 2 * 2.2 - Math.PI;
    const r = HILL.r - 2 - t * (HILL.r - 6);
    pts.push({ x: HILL.x + Math.cos(ang) * r, z: HILL.z + Math.sin(ang) * r / 1.1 });
  }
  return pts.concat(pts.slice(1, -1).reverse());
}

interface Walker {
  c: Chibi; mode: 'path' | 'track' | 'still';
  path?: P[]; seg: number; speed: number; lane: number;
  a: number; pose: Pose; home: P; face: number; bob: number;
}

export class Crowd {
  private people: Walker[] = [];
  maxVisible = 14;
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    const H = RING;
    const paths: P[][] = [
      rect(H.x0 + 5.6, H.z0 + 5.6, H.x1 - 5.6, H.z1 - 5.6),
      rect(H.x0 - 5.6, H.z0 - 5.6, H.x1 + 5.6, H.z1 + 5.6),
      rect(DOWNTOWN.x0 + 5.6, DOWNTOWN.z0 + 5.6, DOWNTOWN.x1 - 5.6, DOWNTOWN.z1 - 5.6),
      line(DOWNTOWN.ax, DOWNTOWN.z0 + 6, DOWNTOWN.ax, DOWNTOWN.z1 - 6, 6.4),
      line(H.x0 - 6, 0, DOWNTOWN.x1 + 6, 0, 5.6),
      line(BEACH_X - 3.5, -56, BEACH_X - 3.5, 56, 0.7),
      line(0, H.z0 - 6, 0, HILL.z + HILL.r * 0.9, 4.6),
      hillTrail(),
    ];
    const plan: [number, number][] = [[0, 5], [1, 4], [2, 6], [3, 3], [4, 2], [5, 4], [6, 2], [7, 3]];
    for (const [pi, n] of plan) {
      const path = paths[pi];
      for (let i = 0; i < n; i++) {
        const c = new Chibi(randomLook());
        const seg = Math.floor(Math.random() * path.length);
        const w: Walker = { c, mode: 'path', path, seg, speed: 1.1 + Math.random() * 0.6, lane: (Math.random() - 0.5) * 1.2, a: 0, pose: 'walk', home: { ...path[seg] }, face: 0, bob: Math.random() * 6 };
        c.root.position.set(path[seg].x, 0, path[seg].z);
        this.add(w);
      }
    }
    // Joggers on the park track
    for (let i = 0; i < 4; i++) this.add({ c: new Chibi(randomLook()), mode: 'track', seg: 0, speed: 0.28 + Math.random() * 0.08, lane: 0.3 + i * 0.5, a: Math.random() * 6.28, pose: 'run', home: { x: 0, z: 0 }, face: 0, bob: 0 });
    // Stationary life: café, beach, sea, plaza
    const still = (x: number, z: number, face: number, pose: Pose) => this.add({ c: new Chibi(randomLook()), mode: 'still', seg: 0, speed: 0, lane: 0, a: 0, pose, home: { x, z }, face, bob: Math.random() * 6 });
    still(CAFE.x - 4 + 1.05, CAFE.z - CAFE.d / 2 - 5.5, Math.PI / 2 + 0.5, 'sit');
    still(CAFE.x + 5 - 1.05, CAFE.z - CAFE.d / 2 - 5.5, -Math.PI / 2, 'sit');
    still(CAFE.x + 0.5, CAFE.z - CAFE.d / 2 - 7.85, 0, 'sit');
    for (let i = 0; i < 3; i++) still(SEA_X + 5 + Math.random() * 12, -30 + Math.random() * 60, Math.random() * 6, 'swim');
    still(BEACH_X + 5, -9 + 1.3, -Math.PI / 2, 'lounge');
    still(BEACH_X + 5, 9 + 1.3, -Math.PI / 2, 'lounge');
    const px = (DOWNTOWN.ax + DOWNTOWN.x1) / 2 + 4, pz = (4.5 + DOWNTOWN.z1 - 4.5) / 2 - 6;
    for (let i = 0; i < 3; i++) { const a = i * 2.1; still(px + Math.cos(a) * 11, pz + Math.sin(a) * 11, a + Math.PI, i === 0 ? 'wave' : 'dance'); }
    still(HILL.x + 2, HILL.z - 3, Math.PI, 'wave');
  }

  private add(w: Walker): void {
    this.scene.add(w.c.root);
    this.people.push(w);
  }

  /** Positions of everyone near `p` (for car collisions). */
  near(p: THREE.Vector3, r: number): THREE.Vector3[] {
    return this.people.filter((w) => w.c.root.visible && w.c.root.position.distanceTo(p) < r).map((w) => w.c.root.position);
  }

  update(dt: number, cam: THREE.Vector3, player: THREE.Vector3, t: number): void {
    // Simulate everyone cheaply; render/animate only the closest few.
    for (const w of this.people) {
      const r = w.c.root;
      if (w.mode === 'path' && w.path) {
        const target = w.path[(w.seg + 1) % w.path.length];
        const dx = target.x - r.position.x, dz = target.z - r.position.z;
        const d = Math.hypot(dx, dz);
        const nearPlayer = r.position.distanceTo(player) < 2.2;
        if (d < 0.6) w.seg = (w.seg + 1) % w.path.length;
        else if (!nearPlayer) {
          r.position.x += (dx / d) * w.speed * dt;
          r.position.z += (dz / d) * w.speed * dt;
          w.face = Math.atan2(dx, dz);
        }
        if (nearPlayer) w.face = Math.atan2(player.x - r.position.x, player.z - r.position.z);
        w.pose = nearPlayer ? 'wave' : 'walk';
      } else if (w.mode === 'track') {
        w.a += dt * w.speed;
        const p = trackPoint(w.a), q = trackPoint(w.a + 0.05);
        r.position.set(p.x + Math.cos(w.a) * w.lane, 0, p.z + Math.sin(w.a) * w.lane * 0.7);
        w.face = Math.atan2(q.x - p.x, q.z - p.z);
      } else {
        r.position.set(w.home.x, 0, w.home.z);
        w.face = w.home && w.pose === 'swim' ? w.face + dt * 0.1 : w.face;
      }
      r.position.y = w.pose === 'swim' ? Math.sin(t * 1.5 + w.bob) * 0.08 : w.pose === 'lounge' ? 0.35 : terrainY(r.position.x, r.position.z);
    }
    const ranked = this.people.map((w) => ({ w, d: w.c.root.position.distanceToSquared(cam) })).sort((a, b) => a.d - b.d);
    ranked.forEach(({ w, d }, i) => {
      const vis = i < this.maxVisible && d < 75 * 75;
      w.c.root.visible = vis;
      if (!vis) return;
      let dy = w.face - w.c.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      w.c.root.rotation.y += dy * Math.min(1, dt * 6);
      w.c.pose = w.pose;
      w.c.update(dt, w.mode === 'track' ? 5.5 : w.pose === 'walk' ? w.speed : 0);
    });
    void this.tmp;
  }
}
