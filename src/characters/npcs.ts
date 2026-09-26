import * as THREE from 'three';
import { Chibi, type Look } from './chibi';
import { trackPoint, CAFE, RING } from '../world/layout';

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  emoji: string;
  look: Look;
  behavior: 'idle' | 'track' | 'walk';
  x: number; z: number; face: number;
  path?: { x: number; z: number }[];
  bubbles: string[];
}

export const NPCS: NpcDef[] = [
  {
    id: 'coach', name: 'אבי', role: 'המאמן', emoji: '🧔🏽‍♂️', behavior: 'idle', x: 27, z: -23, face: Math.PI * 0.85,
    look: { skin: '#a8714f', hair: '#1d120c', hairTip: '#3a2618', top: '#26262e', bottom: '#3a3a44', shoes: '#ff5d5d', eyes: '#2a1a10', hairStyle: 'short', topStyle: 'tee', shorts: true, male: true, beard: true, scale: 1.08 },
    bubbles: ['עוד סט אחד! 💪', 'שתית מים לפני האימון?', 'טכניקה לפני משקל!', 'את בנויה לזה!'],
  },
  {
    id: 'noa', name: 'נועה', role: 'החברה לריצה', emoji: '👱🏼‍♀️', behavior: 'track', x: 0, z: 0, face: 0,
    look: { skin: '#f1c7a8', hair: '#e6b85c', hairTip: '#f7dc8f', top: '#ff8fb1', bottom: '#2d2d3a', shoes: '#ffffff', eyes: '#3b6ea5', hairStyle: 'ponytail', topStyle: 'bra', lashes: true },
    bubbles: ['יאללה עוד הקפה! 🏃‍♀️', 'בואי תדביקי אותי!', 'ריצה בבוקר = יום מושלם ☀️'],
  },
  {
    id: 'dani', name: 'דני', role: 'הבריסטה', emoji: '🧑🏻‍🍳', behavior: 'idle', x: CAFE.x + 2, z: CAFE.z - 0.6, face: Math.PI,
    look: { skin: '#f0c19f', hair: '#6b3b22', hairTip: '#8a5230', top: '#ffffff', bottom: '#3a3a44', shoes: '#26262c', eyes: '#3a2a1a', hairStyle: 'short', topStyle: 'apron', male: true },
    bubbles: ['שייק ירוק? ☕', 'הפוקי היום מטורף!', 'בוקר טוב יסמין!'],
  },
  {
    id: 'maya', name: 'מאיה', role: 'השכנה', emoji: '👩🏾', behavior: 'walk', x: -45, z: -10, face: 0,
    look: { skin: '#7b4a33', hair: '#1a100b', hairTip: '#3a2418', top: '#7fd6c2', bottom: '#f4f1ea', shoes: '#ffd166', eyes: '#2a1a10', hairStyle: 'bun', topStyle: 'tee', lashes: true },
    path: [{ x: RING.x0 + 6.5, z: -40 }, { x: RING.x0 + 6.5, z: 40 }, { x: -10, z: 40 }, { x: -10, z: 6.6 }, { x: RING.x0 + 6.5, z: 6.6 }],
    bubbles: ['איזה יום יפה! 🌸', 'ראית את הכלב שלי? 🐶', 'שמעתי שיש שייקים חדשים בקפה'],
  },
];

/** A little dog that follows its owner. */
function makeDog(): THREE.Group {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: '#e0a86b', roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: '#fff4e6', roughness: 0.8 });
  const dark = new THREE.MeshBasicMaterial({ color: '#1a1a1a' });
  const s = (r: number, m: THREE.Material, x: number, y: number, z: number, sc: [number, number, number] = [1, 1, 1]) => {
    const me = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); me.position.set(x, y, z); me.scale.set(...sc); me.castShadow = true; g.add(me); return me;
  };
  s(0.22, fur, 0, 0.35, 0, [1, 0.85, 1.5]);
  s(0.18, white, 0, 0.3, 0.12, [0.9, 0.8, 1]);
  const head = s(0.18, fur, 0, 0.58, 0.32);
  s(0.1, white, 0, 0.53, 0.47, [1, 0.8, 1]);
  s(0.04, dark, 0, 0.56, 0.56);
  for (const sx of [-1, 1]) {
    s(0.03, dark, sx * 0.07, 0.64, 0.46);
    const ear = s(0.08, new THREE.MeshStandardMaterial({ color: '#a86b3c' }), sx * 0.14, 0.64, 0.28, [0.5, 1.2, 0.8]);
    ear.rotation.z = sx * 0.4;
  }
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.1, 0.18], [0.1, 0.18], [-0.1, -0.18], [0.1, -0.18]]) {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), fur);
    l.position.set(x, 0.12, z); l.castShadow = true; g.add(l); legs.push(l);
  }
  const tail = s(0.05, fur, 0, 0.45, -0.32, [1, 1, 2.2]);
  g.userData = { legs, tail, head };
  return g;
}

export class Npc {
  readonly chibi: Chibi;
  private seg = 0;
  private trackA = Math.PI / 2;
  private dog: THREE.Group | null = null;
  speed = 0;
  bubbleCooldown = 0;
  talking = false;
  constructor(readonly def: NpcDef, scene: THREE.Scene) {
    this.chibi = new Chibi(def.look);
    this.chibi.root.position.set(def.x, 0, def.z);
    this.chibi.root.rotation.y = def.face;
    scene.add(this.chibi.root);
    if (def.id === 'maya') { this.dog = makeDog(); scene.add(this.dog); }
  }

  get pos(): THREE.Vector3 { return this.chibi.root.position; }

  update(dt: number, player: THREE.Vector3, t: number): void {
    const c = this.chibi;
    const d = this.def;
    const near = this.pos.distanceTo(player) < 3.2;
    if (this.talking || (near && d.behavior !== 'track')) {
      // Turn to face Yasmin and chat
      const want = Math.atan2(player.x - this.pos.x, player.z - this.pos.z);
      let dy = want - c.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.root.rotation.y += dy * Math.min(1, dt * 5);
      c.pose = this.talking ? 'talk' : 'wave';
      this.speed = 0;
    } else if (d.behavior === 'track') {
      this.trackA += dt * 0.34;
      const p = trackPoint(this.trackA);
      const q = trackPoint(this.trackA + 0.05);
      const outer = 0.9;
      c.root.position.set(p.x + (p.x + 25) * 0.0 + Math.cos(this.trackA) * outer, 0, p.z + Math.sin(this.trackA) * outer * 0.7);
      c.root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      c.pose = 'run';
      this.speed = 5.5;
    } else if (d.behavior === 'walk' && d.path) {
      const target = d.path[this.seg];
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.5) this.seg = (this.seg + 1) % d.path.length;
      else {
        this.pos.x += (dx / dist) * 1.8 * dt;
        this.pos.z += (dz / dist) * 1.8 * dt;
        const want = Math.atan2(dx, dz);
        let dy = want - c.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        c.root.rotation.y += dy * Math.min(1, dt * 5);
      }
      c.pose = 'walk';
      this.speed = 1.8;
    } else {
      c.pose = 'idle';
      this.speed = 0;
    }
    c.update(dt, this.speed);
    if (this.dog) {
      const yaw = c.root.rotation.y;
      const want = new THREE.Vector3(this.pos.x + Math.cos(yaw) * 0.9 - Math.sin(yaw) * 0.4, 0, this.pos.z - Math.sin(yaw) * 0.9 - Math.cos(yaw) * 0.4);
      const moving = this.dog.position.distanceTo(want) > 0.05;
      this.dog.position.lerp(want, 1 - Math.exp(-dt * 4));
      this.dog.rotation.y = THREE.MathUtils.damp(this.dog.rotation.y, yaw, 5, dt);
      const u = this.dog.userData as { legs: THREE.Mesh[]; tail: THREE.Mesh; head: THREE.Mesh };
      u.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(t * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0));
      u.tail.rotation.y = Math.sin(t * 14) * 0.6;
      u.head.rotation.x = Math.sin(t * 2) * 0.1;
    }
  }
}
