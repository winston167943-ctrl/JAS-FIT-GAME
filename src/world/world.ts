import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { StaticBatcher, makeGlowMaterial, type Bucket } from '../core/batch';
import { CollisionWorld } from '../core/collision';
import { canvasTexture, textTexture, blobTexture } from '../core/textures';
import { makeWaterMaterial } from './water';
import { RING, HOUSE, GYM, CAFE, TRACK, POND, BEACH_X, SEA_X, EXT, HILL, terrainY } from './layout';
import { buildDistricts, type DistrictRuntime } from './districts';
import heroUrl from '../assets/yasmin-hero.jpg';
import logoUrl from '../assets/jas-logo.png';

export type SpotId =
  | 'fridge' | 'water_home' | 'bed' | 'mirror' | 'sofa'
  | 'dumbbells' | 'band' | 'treadmill' | 'water_gym'
  | 'track' | 'cafe' | 'foodtruck' | 'bench' | 'swim' | 'lounger' | 'hoop' | 'plaza' | 'lookout';

export interface Spot {
  id: SpotId;
  x: number; z: number;
  /** Interaction radius. */
  r: number;
  /** Where the character stands / faces while doing the action. */
  stand: { x: number; z: number; face: number };
}

interface Building {
  x0: number; x1: number; z0: number; z1: number;
  roof: THREE.Mesh[];
  walls: { mesh: THREE.Mesh; out: (c: THREE.Vector3) => boolean }[];
  fade: number;
}

const P = {
  grass: '#7cc261', grass2: '#8fd06a', grassDark: '#5aa84a',
  road: '#3d4049', line: '#f7f3ea', walk: '#e6ddd2', curb: '#cfc4b8',
  cream: '#f6ecdf', brown: '#5a2f2d', gold: '#d4a24c', terracotta: '#d0714f',
  wood: '#c9955f', woodDark: '#8d5b3a', white: '#fbfaf7', pink: '#f4a7bd', mint: '#a9e2cf',
  charcoal: '#34343d', steel: '#a9adb8', window: '#ffd98f', trunk: '#8a5a3b',
};

const box1 = new THREE.BoxGeometry(1, 1, 1);
const cyl1 = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
const sph1 = new THREE.SphereGeometry(0.5, 14, 10);
const sphLo = new THREE.SphereGeometry(0.5, 9, 7);
const cone1 = new THREE.ConeGeometry(0.5, 1, 18);
const roundCache = new Map<string, THREE.BufferGeometry>();
function rounded(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const k = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}|${r}`;
  let g = roundCache.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)); roundCache.set(k, g); }
  return g;
}

export class World {
  readonly group = new THREE.Group();
  readonly col = new CollisionWorld();
  readonly spots: Spot[] = [];
  readonly lamps: THREE.Vector3[] = [];
  readonly b = new StaticBatcher();
  /** Tall solid volumes the camera must not pass through. */
  readonly occluders: { x0: number; x1: number; z0: number; z1: number; h: number }[] = [];
  private districts!: DistrictRuntime;
  private glowMat = makeGlowMaterial();
  private neonMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff5fa2, emissiveIntensity: 2.2 });
  readonly waters: THREE.ShaderMaterial[] = [];
  private buildings: Building[] = [];
  private ducks: THREE.Group[] = [];
  private fountain!: THREE.Points;
  private lights: THREE.PointLight[] = [];
  private lightTimer = 0;
  private time = 0;
  readonly tex = { hero: new THREE.TextureLoader().load(heroUrl), logo: new THREE.TextureLoader().load(logoUrl) };

  constructor(scene: THREE.Scene, pointLights: number) {
    this.tex.hero.colorSpace = THREE.SRGBColorSpace;
    this.tex.logo.colorSpace = THREE.SRGBColorSpace;
    scene.add(this.group);
    this.buildGround();
    this.buildRoads();
    this.buildHouse();
    this.buildGym();
    this.buildCafe();
    this.buildPark();
    this.buildCourt();
    this.buildFoodTruck();
    this.buildBeach();
    this.buildNeighborhood();
    this.buildNature();
    this.districts = buildDistricts(this, scene);
    this.col.bounds = { x0: EXT.x0, x1: EXT.x1, z0: EXT.z0, z1: EXT.z1 };
    this.b.build(this.group, this.glowMat);
    for (let i = 0; i < pointLights; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 18, 1.6);
      scene.add(l);
      this.lights.push(l);
    }
  }

  // ---------- helpers ----------
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, o: { r?: number; rotY?: number; bucket?: Bucket } = {}): void {
    const geo = o.r ? rounded(w, h, d, o.r) : box1;
    this.b.add(geo, color, { x, y: y + h / 2, z }, { rot: { x: 0, y: o.rotY ?? 0, z: 0 }, scale: o.r ? 1 : { x: w, y: h, z: d }, bucket: o.bucket });
  }
  cyl(x: number, y: number, z: number, r: number, h: number, color: string, bucket?: Bucket, rot?: THREE.Vector3Like): void {
    this.b.add(cyl1, color, { x, y: y + h / 2, z }, { scale: { x: r * 2, y: h, z: r * 2 }, bucket, rot });
  }
  sph(x: number, y: number, z: number, r: number, color: string, sy = 1, bucket?: Bucket, lo = false): void {
    this.b.add(lo ? sphLo : sph1, color, { x, y, z }, { scale: { x: r * 2, y: r * 2 * sy, z: r * 2 }, bucket });
  }
  cone(x: number, y: number, z: number, r: number, h: number, color: string, rotY = 0, segGeo?: THREE.BufferGeometry): void {
    this.b.add(segGeo ?? cone1, color, { x, y: y + h / 2, z }, { scale: { x: r * 2, y: h, z: r * 2 }, rot: { x: 0, y: rotY, z: 0 } });
  }
  spot(id: SpotId, x: number, z: number, stand: { x: number; z: number; face: number }, r = 1.6): void {
    this.spots.push({ id, x, z, r, stand });
  }
  lamp(x: number, z: number, rotY = 0): void {
    this.cyl(x, 0, z, 0.09, 4.2, '#2f3340');
    this.cyl(x, 0, z, 0.2, 0.3, '#2f3340');
    const ax = Math.sin(rotY) * 0.6, az = Math.cos(rotY) * 0.6;
    this.box(x + ax / 2, 4.1, z + az / 2, 0.08, 0.08, 0.7, '#2f3340', { rotY });
    this.cone(x + ax, 3.85, z + az, 0.28, 0.3, '#2f3340');
    this.sph(x + ax, 3.85, z + az, 0.2, '#ffe2a6', 1, 'glow');
    this.lamps.push(new THREE.Vector3(x + ax, 3.6, z + az));
    this.col.circle(x, z, 0.2);
  }
  tree(x: number, z: number, s = 1, kind: 'round' | 'pine' | 'blossom' = 'round', collide = true, y0 = 0): void {
    const greens = ['#5eaa4c', '#6dbb52', '#4f9c46', '#7cc35d'];
    const c = kind === 'blossom' ? ['#f6a8c4', '#f8bcd2', '#f292b4'][Math.floor(Math.random() * 3)] : greens[Math.floor(Math.random() * greens.length)];
    this.cyl(x, y0 - 0.3, z, 0.18 * s, 1.9 * s, P.trunk);
    if (kind === 'pine') {
      for (let i = 0; i < 3; i++) this.cone(x, y0 + (1.2 + i * 0.9) * s, z, (1.4 - i * 0.35) * s, 1.6 * s, '#3f8a4a');
    } else {
      this.sph(x, y0 + 2.4 * s, z, 1.25 * s, c, 0.9, 'solid', true);
      this.sph(x + 0.7 * s, y0 + 2.0 * s, z + 0.3 * s, 0.85 * s, c, 0.9, 'solid', true);
      this.sph(x - 0.6 * s, y0 + 2.1 * s, z - 0.3 * s, 0.9 * s, c, 0.9, 'solid', true);
      this.sph(x + 0.1 * s, y0 + 3.1 * s, z - 0.1 * s, 0.8 * s, c, 0.9, 'solid', true);
    }
    if (collide) this.col.circle(x, z, 0.35 * s);
  }
  palm(x: number, z: number, s = 1): void {
    let px = x, py = 0;
    const lean = (Math.random() - 0.5) * 0.5;
    for (let i = 0; i < 7; i++) {
      this.b.add(cyl1, i % 2 ? '#a07650' : '#8c6443', { x: px, y: py + 0.4 * s, z }, { scale: { x: 0.3 * s, y: 0.8 * s, z: 0.3 * s }, rot: { x: 0, y: 0, z: -lean * 0.3 } });
      py += 0.75 * s; px += lean * 0.25 * s;
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const lx = px + Math.cos(a) * 1.3 * s, lz = z + Math.sin(a) * 1.3 * s;
      this.b.add(sph1, i % 2 ? '#4fa04a' : '#5db352', { x: lx, y: py + 0.1 * s, z: lz }, { scale: { x: 2.8 * s, y: 0.18 * s, z: 0.8 * s }, rot: { x: 0, y: -a, z: 0.35 } });
    }
    this.sph(px, py, z, 0.35 * s, '#6b4a2e');
    this.col.circle(x, z, 0.3);
  }
  bush(x: number, z: number, s = 1, flowers = true): void {
    const c = ['#5aa84a', '#66b453', '#4d9a45'][Math.floor(Math.random() * 3)];
    this.sph(x, 0.45 * s, z, 0.6 * s, c, 0.85, 'solid', true);
    this.sph(x + 0.45 * s, 0.35 * s, z + 0.2 * s, 0.45 * s, c, 0.85, 'solid', true);
    this.sph(x - 0.4 * s, 0.35 * s, z - 0.15 * s, 0.45 * s, c, 0.85, 'solid', true);
    if (flowers) {
      const fc = ['#ff8fb1', '#ffd166', '#ffffff', '#c792ea', '#ff9f68'][Math.floor(Math.random() * 5)];
      for (let i = 0; i < 5; i++) this.sph(x + (Math.random() - 0.5) * 1.1 * s, (0.6 + Math.random() * 0.35) * s, z + (Math.random() - 0.5) * 0.9 * s, 0.09 * s, fc, 1, 'solid', true);
    }
  }
  flowerBed(x: number, z: number, w: number, d: number): void {
    this.box(x, 0, z, w, 0.25, d, '#8a5a3b', { r: 0.08 });
    this.box(x, 0.2, z, w - 0.2, 0.08, d - 0.2, '#5b3a26');
    const cols = ['#ff8fb1', '#ffd166', '#ffffff', '#c792ea', '#ff6b6b', '#ff9f68'];
    const n = Math.floor(w * d * 3);
    for (let i = 0; i < n; i++) {
      const fx = x + (Math.random() - 0.5) * (w - 0.4), fz = z + (Math.random() - 0.5) * (d - 0.4);
      this.cyl(fx, 0.25, fz, 0.025, 0.3, '#4f9c46');
      this.sph(fx, 0.58, fz, 0.1, cols[Math.floor(Math.random() * cols.length)], 0.8, 'solid', true);
    }
    this.col.box(x, z, w, d);
  }
  bench(x: number, z: number, rotY: number): void {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const at = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
    for (let i = 0; i < 3; i++) { const p = at(0, -0.2 + i * 0.2); this.box(p.x, 0.45, p.z, 1.8, 0.07, 0.16, P.wood, { rotY }); }
    for (let i = 0; i < 2; i++) { const p = at(0, 0.3); this.box(p.x, 0.65 + i * 0.22, p.z, 1.8, 0.12, 0.06, P.wood, { rotY }); }
    for (const lx of [-0.75, 0.75]) { const p = at(lx, 0); this.box(p.x, 0, p.z, 0.08, 0.45, 0.6, '#3a3d48', { rotY }); }
    this.col.box(x, z, Math.abs(1.9 * c) + Math.abs(0.7 * s), Math.abs(1.9 * s) + Math.abs(0.7 * c));
  }
  umbrellaTable(x: number, z: number, color: string): void {
    this.cyl(x, 0, z, 0.55, 0.06, P.white);
    this.cyl(x, 0.72, z, 0.6, 0.05, P.white);
    this.cyl(x, 0, z, 0.05, 2.5, '#d9d4cc');
    const seg = new THREE.ConeGeometry(0.5, 1, 8, 1, true);
    this.cone(x, 2.2, z, 1.5, 0.6, color, 0, seg);
    this.cone(x, 2.2, z, 1.52, 0.6, P.white, Math.PI / 8, new THREE.ConeGeometry(0.5, 1, 8, 1, true, 0, Math.PI / 4));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const cx = x + Math.cos(a) * 1.05, cz = z + Math.sin(a) * 1.05;
      this.cyl(cx, 0, cz, 0.22, 0.45, color);
      this.box(cx + Math.cos(a) * 0.2, 0.45, cz + Math.sin(a) * 0.2, 0.1, 0.45, 0.4, color, { rotY: -a });
    }
    this.col.circle(x, z, 0.8);
  }

  private wallMesh(b: Building, x: number, y: number, z: number, w: number, h: number, d: number, color: string, out: (c: THREE.Vector3) => boolean, tex?: THREE.Texture): void {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true, map: tex ?? null });
    const m = new THREE.Mesh(rounded(w, h, d, 0.06), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    b.walls.push({ mesh: m, out });
  }

  // ---------- ground & roads ----------
  private buildGround(): void {
    const size = 1100, seg = 240;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const c1 = new THREE.Color(P.grass), c2 = new THREE.Color(P.grass2), c3 = new THREE.Color(P.grassDark), sand = new THREE.Color('#f0d9a8');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = Math.sin(x * 0.08) * Math.cos(z * 0.07) + Math.sin(x * 0.21 + z * 0.13) * 0.5;
      tmp.copy(c1).lerp(n > 0 ? c2 : c3, Math.min(1, Math.abs(n) * 0.6));
      // Outside the playable area the land rolls up into hills.
      const ox = Math.max(0, EXT.x0 + 6 - x), oz = Math.max(0, EXT.z0 + 6 - z, z - EXT.z1 + 6);
      const out = Math.hypot(ox, oz);
      let y = terrainY(x, z);
      if (out > 0 && x < BEACH_X - 6) y += Math.pow(out / 45, 2) * 10 * (0.6 + 0.4 * Math.sin(x * 0.03 + z * 0.05));
      // Hill trail: a dirt path spiralling to the lookout
      const hd = Math.hypot(x - HILL.x, (z - HILL.z) * 1.1);
      if (hd < HILL.r + 2) {
        const ang = Math.atan2(z - HILL.z, x - HILL.x);
        for (let k = -1; k <= 2; k++) {
          const tt = ((ang + Math.PI) / (Math.PI * 2) + k) / 2.2;
          if (tt < 0 || tt > 1) continue;
          const pr = HILL.r - 2 - tt * (HILL.r - 6);
          if (Math.abs(hd - pr) < 1.6) tmp.set('#c9a878');
        }
        if (hd < 7) tmp.set('#d9c29a');
        else if (tmp.getHex() !== new THREE.Color('#c9a878').getHex()) tmp.lerp(new THREE.Color('#6fb84f'), 0.3);
      }
      if (x > BEACH_X - 6) { tmp.copy(sand); y = x > SEA_X + 4 ? -2 - (x - SEA_X) * 0.05 : 0; }
      pos.setY(i, y);
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const grassTex = canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        const v = 200 + Math.floor(Math.random() * 55);
        ctx.fillStyle = `rgb(${v - 10},${v},${v - 20})`;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 3 + Math.random() * 4);
      }
    }, [180, 180]);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 1 }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  private buildRoads(): void {
    const { x0, x1, z0, z1, w } = RING;
    const hw = w / 2;
    const road = (cx: number, cz: number, lw: number, ld: number) => this.box(cx, 0, cz, lw, 0.03, ld, P.road, { bucket: 'ground' });
    road((x0 + x1) / 2, z0, x1 - x0 + w, w);
    road((x0 + x1) / 2, z1, x1 - x0 + w, w);
    road(x0, 0, w, z1 - z0 - w);
    road(x1, 0, w, z1 - z0 - w);
    road(0, 0, x1 - x0 - w, w);
    // Sidewalks with curbs on both sides of every road.
    const walk = (cx: number, cz: number, lw: number, ld: number) => {
      this.box(cx, 0, cz, lw, 0.06, ld, P.walk, { bucket: 'ground' });
    };
    const sw = 2.2;
    walk(0, z0 - hw - sw / 2, x1 - x0 + w + sw * 2, sw);
    walk(0, z0 + hw + sw / 2, x1 - x0 - w, sw);
    walk(0, z1 + hw + sw / 2, x1 - x0 + w + sw * 2, sw);
    walk(0, z1 - hw - sw / 2, x1 - x0 - w, sw);
    walk(x0 - hw - sw / 2, 0, sw, z1 - z0 + w);
    walk(x1 + hw + sw / 2, 0, sw, z1 - z0 + w);
    for (const sx of [-1, 1]) {
      const cx = sx < 0 ? (x0 + hw + sw / 2) : (x1 - hw - sw / 2);
      walk(cx, (z0 + hw + -hw) / 2 - 22.5 - 0.5, sw, 36);
      walk(cx, 22.5 + 0.5, sw, 36);
      walk(sx * 30.25 - 0, -hw - sw / 2, 50.5 - 0, sw);
      walk(sx * 30.25, hw + sw / 2, 50.5, sw);
    }
    // Lane markings (dashed)
    const dash = (cx: number, cz: number, alongX: boolean) => this.box(cx, 0.03, cz, alongX ? 1.8 : 0.18, 0.01, alongX ? 0.18 : 1.8, P.line, { bucket: 'ground' });
    for (let x = x0 + 6; x <= x1 - 6; x += 4) { dash(x, z0, true); dash(x, z1, true); dash(x, 0, true); }
    for (let z = z0 + 6; z <= z1 - 6; z += 4) { if (Math.abs(z) > 6) { dash(x0, z, false); dash(x1, z, false); } }
    // Crosswalks (zebra)
    const zebra = (cx: number, cz: number, alongX: boolean) => {
      for (let i = -3; i <= 3; i++) {
        if (alongX) this.box(cx + i * 0.9, 0.03, cz, 0.5, 0.012, 3, P.line, { bucket: 'ground' });
        else this.box(cx, 0.03, cz + i * 0.9, 3, 0.012, 0.5, P.line, { bucket: 'ground' });
      }
    };
    zebra(-31, 0, false); zebra(30, 0, false);
    const zebraV = (cx: number, cz: number) => { for (let i = -3; i <= 3; i++) this.box(cx, 0.03, cz + i * 0.9, 3.2, 0.012, 0.5, P.line, { bucket: 'ground' }); };
    zebraV(-31, 0); zebraV(30, 0);
    zebra(0, z0, true); zebra(0, z1, true);
    // Lamps along roads
    for (let x = x0 + 10; x <= x1 - 10; x += 20) {
      this.lamp(x, z0 + hw + 1.2, Math.PI); this.lamp(x, z1 - hw - 1.2, 0);
      this.lamp(x + 10, -hw - 1.2, 0); this.lamp(x + 10 > x1 - 10 ? x - 10 : x + 10, hw + 1.2, Math.PI);
    }
    for (let z = z0 + 12; z <= z1 - 12; z += 24) { this.lamp(x0 + hw + 1.2, z, Math.PI / 2); this.lamp(x1 - hw - 1.2, z, -Math.PI / 2); }
  }

  // ---------- Yasmin's house ----------
  private buildHouse(): void {
    const { x0, x1, z0, z1 } = HOUSE;
    const cx = (x0 + x1) / 2;
    const H = 3.6, T = 0.3;
    const bld: Building = { x0, x1, z0, z1, roof: [], walls: [], fade: 1 };
    this.buildings.push(bld);

    // Floor with wood planks texture
    const woodTex = canvasTexture(512, 512, (g) => {
      for (let i = 0; i < 8; i++) {
        const l = 62 + Math.random() * 10;
        g.fillStyle = `hsl(28, 45%, ${l}%)`;
        g.fillRect(0, i * 64, 512, 64);
        g.fillStyle = 'rgba(80,45,20,0.35)'; g.fillRect(0, i * 64, 512, 3);
        const off = Math.random() * 512;
        g.fillRect(off, i * 64, 3, 64);
        for (let k = 0; k < 30; k++) { g.fillStyle = 'rgba(90,50,25,0.07)'; g.fillRect(Math.random() * 512, i * 64 + Math.random() * 60, 60 + Math.random() * 80, 2); }
      }
    }, [3, 3]);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.1, z1 - z0), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55, metalness: 0.02 }));
    floor.position.set(cx, 0.03, (z0 + z1) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
    // Porch
    this.box(cx - 2, 0, z1 + 0.9, 7, 0.1, 1.8, '#e2d3c1', { r: 0.04 });

    // Walls (fade when the camera looks through them)
    const wallTex = canvasTexture(256, 256, (g) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(200,170,140,${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 4, 4); }
    });
    this.wallMesh(bld, cx, 0, z0 + T / 2, x1 - x0, H, T, '#f7e9da', (c) => c.z < z0, wallTex);
    this.wallMesh(bld, x0 + T / 2, 0, (z0 + z1) / 2, T, H, z1 - z0, '#f3dccb', (c) => c.x < x0, wallTex);
    this.wallMesh(bld, x1 - T / 2, 0, (z0 + z1) / 2, T, H, z1 - z0, '#f3dccb', (c) => c.x > x1, wallTex);
    // Front corner stubs
    this.box(x0 + 1, 0, z1 - 0.15, 2, H, 0.3, '#f3dccb', { r: 0.05 });
    this.box(x1 - 1, 0, z1 - 0.15, 2, H, 0.3, '#f3dccb', { r: 0.05 });
    this.box(cx, H - 0.1, z1 - 0.15, x1 - x0, 0.3, 0.35, '#e7cdb8');
    this.col.box(cx, z0 + T / 2, x1 - x0, T);
    this.col.box(x0 + T / 2, (z0 + z1) / 2, T, z1 - z0);
    this.col.box(x1 - T / 2, (z0 + z1) / 2, T, z1 - z0);
    this.col.box(x0 + 1, z1 - 0.15, 2, 0.3);
    this.col.box(x1 - 1, z1 - 0.15, 2, 0.3);
    // Baseboards
    this.box(cx, 0.05, z0 + 0.33, x1 - x0 - 0.6, 0.18, 0.06, '#ffffff');

    // Windows (glow at night)
    const win = (x: number, y: number, z: number, alongX: boolean) => {
      const w = 1.6, h = 1.3;
      this.box(x, y, z, alongX ? w + 0.25 : 0.42, h + 0.25, alongX ? 0.42 : w + 0.25, P.white, { r: 0.05 });
      this.box(x, y + 0.12, z, alongX ? w : 0.46, h, alongX ? 0.46 : w, P.window, { bucket: 'glow' });
      this.box(x, y + 0.12 + h / 2, z, alongX ? w : 0.5, 0.06, alongX ? 0.5 : w, P.white);
      this.box(x, y + 0.12, z, alongX ? 0.06 : 0.5, h, alongX ? 0.5 : 0.06, P.white);
    };
    win(x0, 1.2, -30.5, false); win(x0, 1.2, -24.5, false); win(x1, 1.2, -30.5, false); win(-25.6, 1.8, z0, true);

    // Pyramid roof (hidden when Yasmin is inside)
    const roofMat = new THREE.MeshStandardMaterial({ color: P.terracotta, roughness: 0.7, transparent: true, flatShading: true });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((x1 - x0) / 2 / 0.707 + 1.2, 3.2, (z1 - z0) / 2 / 0.707 + 1.2);
    roof.position.set(cx, H + 1.6, (z0 + z1) / 2);
    roof.castShadow = true;
    const eave = new THREE.Mesh(rounded(x1 - x0 + 1.2, 0.25, z1 - z0 + 1.2, 0.08), new THREE.MeshStandardMaterial({ color: '#f9f3ea', transparent: true }));
    eave.position.set(cx, H + 0.05, (z0 + z1) / 2);
    const chimney = new THREE.Mesh(rounded(0.9, 2, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: '#b85e44', transparent: true }));
    chimney.position.set(x0 + 4, H + 2.4, z0 + 3.5);
    for (const m of [roof, eave, chimney]) { m.castShadow = true; this.group.add(m); bld.roof.push(m); }

    // --- Kitchen ---
    const fz = z0 + 0.9;
    this.box(x0 + 1.1, 0, fz, 1.5, 2.4, 1.3, '#bfe6d8', { r: 0.18 }); // fridge
    this.box(x0 + 1.1, 1.45, fz + 0.66, 1.35, 0.03, 0.02, '#9fcfbf');
    this.box(x0 + 1.72, 0.6, fz + 0.68, 0.06, 0.7, 0.06, '#e9e9ee', { r: 0.02 });
    this.box(x0 + 1.72, 1.65, fz + 0.68, 0.06, 0.5, 0.06, '#e9e9ee', { r: 0.02 });
    this.sph(x0 + 0.8, 2.52, fz, 0.18, '#ff7b6b'); this.sph(x0 + 1.25, 2.5, fz + 0.1, 0.15, '#ffd166');
    this.col.box(x0 + 1.1, fz, 1.5, 1.3);
    this.spot('fridge', x0 + 1.4, fz + 1.8, { x: x0 + 1.3, z: fz + 1.35, face: Math.PI });
    const cx0 = x0 + 2.0, cx1 = x0 + 8.4;
    this.box((cx0 + cx1) / 2, 0, z0 + 0.8, cx1 - cx0, 0.95, 1.0, '#f4e1c9', { r: 0.05 });
    this.box((cx0 + cx1) / 2, 0.95, z0 + 0.8, cx1 - cx0 + 0.1, 0.08, 1.1, '#fbfbfb', { r: 0.03 });
    for (let x = cx0 + 0.55; x < cx1; x += 1.05) this.box(x, 0.45, z0 + 1.31, 0.04, 0.12, 0.04, '#c9a26a');
    this.box((cx0 + cx1) / 2, 2.1, z0 + 0.55, cx1 - cx0, 0.9, 0.55, '#f4e1c9', { r: 0.05 });
    // sink
    const sx = x0 + 6.8;
    this.box(sx, 0.9, z0 + 0.85, 1.0, 0.1, 0.65, '#cfd6de', { r: 0.03 });
    this.cyl(sx, 1.0, z0 + 0.45, 0.04, 0.45, '#d8dde6');
    this.box(sx, 1.4, z0 + 0.62, 0.05, 0.05, 0.35, '#d8dde6');
    this.spot('water_home', sx, z0 + 2.2, { x: sx, z: z0 + 1.75, face: Math.PI });
    // stove & kettle
    this.box(x0 + 4.2, 1.02, z0 + 0.8, 1.3, 0.04, 0.8, '#26262c');
    for (const [dx, dz] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) this.cyl(x0 + 4.2 + dx, 1.05, z0 + 0.8 + dz, 0.13, 0.01, '#55555e');
    this.sph(x0 + 4.5, 1.2, z0 + 0.62, 0.2, '#ff8fa3', 0.9);
    this.col.box((cx0 + cx1) / 2, z0 + 0.8, cx1 - cx0, 1.0);
    // Fruit bowl, plants
    this.cyl(x0 + 3.1, 1.03, z0 + 0.9, 0.3, 0.1, P.white);
    for (let i = 0; i < 4; i++) this.sph(x0 + 3.0 + (i % 2) * 0.2, 1.18 + Math.floor(i / 2) * 0.1, z0 + 0.85 + (i % 3) * 0.08, 0.1, ['#ff5e5b', '#ffd166', '#ff9f1c', '#7bd389'][i]);

    // Dining table
    const tx = x0 + 4.2, tz = -26.8;
    this.cyl(tx, 0, tz, 0.1, 0.75, P.woodDark);
    this.cyl(tx, 0, tz, 0.4, 0.05, P.woodDark);
    this.cyl(tx, 0.75, tz, 0.95, 0.07, P.wood);
    this.cyl(tx + 0.1, 0.82, tz, 0.15, 0.25, '#ffffff');
    this.sph(tx + 0.1, 1.15, tz, 0.2, '#ff8fb1', 1);
    for (const a of [0.3, Math.PI + 0.3]) {
      const chx = tx + Math.cos(a) * 1.35, chz = tz + Math.sin(a) * 1.35;
      this.box(chx, 0.45, chz, 0.55, 0.08, 0.55, P.cream, { r: 0.04 });
      for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) this.box(chx + lx, 0, chz + lz, 0.05, 0.45, 0.05, P.woodDark);
      this.box(chx + Math.cos(a) * 0.26, 0.5, chz + Math.sin(a) * 0.26, 0.08, 0.6, 0.55, P.cream, { r: 0.04, rotY: -a });
    }
    this.col.circle(tx, tz, 1.1);

    // Bedroom corner
    const bx = x1 - 3.6, bz = z0 + 1.9;
    this.box(bx, 0, bz, 2.6, 0.45, 3.2, P.woodDark, { r: 0.08 });
    this.box(bx, 0.45, bz + 0.05, 2.45, 0.35, 3.0, '#ffffff', { r: 0.15 });
    this.box(bx, 0.72, bz + 0.5, 2.5, 0.18, 2.1, '#f7b6c8', { r: 0.1 });
    this.box(bx - 0.6, 0.8, bz - 1.05, 0.85, 0.25, 0.5, '#ffffff', { r: 0.12 });
    this.box(bx + 0.6, 0.8, bz - 1.05, 0.85, 0.25, 0.5, '#ffffff', { r: 0.12 });
    this.box(bx, 0, z0 + 0.35, 2.8, 1.6, 0.2, '#b98a63', { r: 0.1 });
    this.col.box(bx, bz, 2.6, 3.2);
    this.spot('bed', bx - 1.9, bz + 0.6, { x: bx, z: bz + 0.2, face: 0 });
    this.box(x1 - 1.3, 0, z0 + 0.6, 0.8, 0.65, 0.7, '#e7cdb2', { r: 0.06 });
    this.cyl(x1 - 1.3, 0.65, z0 + 0.6, 0.08, 0.4, '#d4a24c');
    this.cone(x1 - 1.3, 1.0, z0 + 0.6, 0.28, 0.35, '#fff1d6');
    this.sph(x1 - 1.3, 1.1, z0 + 0.6, 0.12, '#ffe2a6', 1, 'glow');
    this.lamps.push(new THREE.Vector3(x1 - 1.3, 1.6, z0 + 1.2));
    // Rug
    this.cyl(x1 - 3.7, 0.08, -26.2, 1.9, 0.02, '#f2c6d3', 'ground');
    this.cyl(x1 - 3.7, 0.09, -26.2, 1.5, 0.02, '#f7dde4', 'ground');

    // Mirror + smart scale
    const mx = x0 + 10.4;
    this.box(mx, 0, z0 + 0.45, 1.2, 2.4, 0.12, P.gold, { r: 0.06 });
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), new THREE.MeshStandardMaterial({ color: '#dfeefc', metalness: 1, roughness: 0.05 }));
    mirror.position.set(mx, 1.22, z0 + 0.52);
    this.group.add(mirror);
    this.box(mx, 0.08, z0 + 1.6, 0.7, 0.06, 0.7, '#fbfbfb', { r: 0.1 });
    this.box(mx, 0.14, z0 + 1.6, 0.3, 0.01, 0.12, '#6fd3ff', { bucket: 'glow' });
    this.spot('mirror', mx, z0 + 2.4, { x: mx, z: z0 + 1.6, face: Math.PI });
    // Yoga mat
    this.box(mx + 1.5, 0.08, z0 + 2.4, 0.7, 0.03, 1.9, '#b39ddb', { r: 0.01 });

    // Living room: sofa facing the TV on the right wall
    const sfx = x1 - 5.5, sfz = -25.2;
    this.box(sfx, 0.08, sfz, 1.1, 0.5, 3.0, '#c98d75', { r: 0.15 });
    this.box(sfx - 0.45, 0.4, sfz, 0.35, 0.95, 3.0, '#c98d75', { r: 0.15 });
    this.box(sfx, 0.45, sfz - 1.4, 1.1, 0.45, 0.3, '#c98d75', { r: 0.12 });
    this.box(sfx, 0.45, sfz + 1.4, 1.1, 0.45, 0.3, '#c98d75', { r: 0.12 });
    this.box(sfx + 0.05, 0.55, sfz - 0.65, 0.95, 0.2, 1.2, '#d9a08a', { r: 0.1 });
    this.box(sfx + 0.05, 0.55, sfz + 0.65, 0.95, 0.2, 1.2, '#d9a08a', { r: 0.1 });
    this.box(sfx - 0.2, 0.75, sfz - 0.7, 0.2, 0.45, 0.45, '#ffd166', { r: 0.1 });
    this.col.box(sfx, sfz, 1.2, 3.1);
    this.spot('sofa', sfx + 1.3, sfz, { x: sfx + 0.1, z: sfz, face: Math.PI / 2 });
    // Coffee table
    this.box(sfx + 1.9, 0, sfz, 0.8, 0.4, 1.4, P.wood, { r: 0.06 });
    this.col.box(sfx + 1.9, sfz, 0.8, 1.4);
    // TV
    this.box(x1 - 0.55, 0, sfz, 0.5, 0.6, 2.6, '#e8d5c0', { r: 0.05 });
    this.box(x1 - 0.5, 1.3, sfz, 0.08, 1.2, 2.1, '#1b1b22', { r: 0.03 });
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.05), new THREE.MeshBasicMaterial({ map: textTexture(['JAS FIT', 'LIVE WORKOUT'], { w: 512, h: 280, bg: '#3a1f2b', color: '#ffd9a8', glow: '#ff7fb0' }) }));
    tvScreen.rotation.y = -Math.PI / 2;
    tvScreen.position.set(x1 - 0.55, 1.9, sfz);
    this.group.add(tvScreen);
    this.col.box(x1 - 0.55, sfz, 0.5, 2.6);

    // Poster of Yasmin + logo frame on the walls
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.4), new THREE.MeshStandardMaterial({ map: this.tex.hero, roughness: 0.6 }));
    poster.rotation.y = Math.PI / 2;
    poster.position.set(x0 + 0.33, 2.0, -27.2);
    this.group.add(poster);
    this.box(x0 + 0.3, 0.72, -27.2, 0.06, 2.56, 1.66, P.gold);
    const logoFrame = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshStandardMaterial({ map: this.tex.logo }));
    logoFrame.position.set(x0 + 12.9, 2.6, z0 + 0.34);
    this.group.add(logoFrame);
    this.box(x0 + 12.9, 2.15, z0 + 0.3, 0.92, 0.92, 0.05, P.gold);
    // Plants
    for (const [px, pz] of [[x0 + 0.8, z1 - 1.0], [x1 - 0.8, z1 - 1.0], [x0 + 8.9, z0 + 0.9]] as const) {
      this.cyl(px, 0, pz, 0.32, 0.55, '#e9d7c5');
      this.sph(px, 0.95, pz, 0.5, '#5fae57', 1.1, 'solid', true);
      this.sph(px + 0.2, 1.3, pz, 0.32, '#6fbe62', 1, 'solid', true);
      this.col.circle(px, pz, 0.35);
    }
    // Ceiling pendant light
    this.lamps.push(new THREE.Vector3(cx, 3.2, -27));

    // Garden: path, hedges, flower beds, mailbox
    for (let z = z1 + 2.2; z < -6.6; z += 1.1) this.box(cx - 2 + Math.sin(z) * 0.15, 0, z, 1.6, 0.05, 0.8, '#d9cbbb', { r: 0.2, bucket: 'ground' });
    this.flowerBed(cx - 6, z1 + 2.5, 5, 1.4);
    this.flowerBed(cx + 3, z1 + 2.5, 3.5, 1.4);
    for (let x = x0 - 2; x <= x1 + 2; x += 1.6) { if (Math.abs(x - (cx - 2)) > 1.8) this.bush(x, -7.6, 0.7, false); }
    this.col.box(x0 + 3.7, -7.6, 11.5, 1.2);
    this.col.box(x1 - 0.6, -7.6, 7, 1.2);
    this.box(cx + 0.2, 0, -8.6, 0.12, 1.1, 0.12, P.woodDark);
    this.box(cx + 0.2, 1.1, -8.6, 0.35, 0.3, 0.5, '#ff8fa3', { r: 0.1 });
    for (let z = z0 - 3; z <= z1 + 4; z += 3.2) this.tree(x0 - 3.5, z, 0.9, 'round');
    this.tree(x1 + 3, z0 - 2, 1.1, 'blossom');
    this.tree(x1 + 3.5, -14, 1, 'blossom');
  }

  // ---------- Gym ----------
  private buildGym(): void {
    const { x0, x1, z0, z1 } = GYM;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const H = 4.6, T = 0.35;
    const bld: Building = { x0, x1, z0, z1, roof: [], walls: [], fade: 1 };
    this.buildings.push(bld);
    const tileTex = canvasTexture(256, 256, (g) => {
      g.fillStyle = '#2d2d34'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? '#303038' : '#2a2a31';
        g.fillRect(i * 64 + 1, j * 64 + 1, 62, 62);
      }
      for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
    }, [6, 4]);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.1, z1 - z0), new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.85 }));
    floor.position.set(cx, 0.03, cz);
    floor.receiveShadow = true;
    this.group.add(floor);
    this.box(cx, 0, z1 + 1, x1 - x0, 0.08, 2, '#d8d0c6', { r: 0.04 });

    this.wallMesh(bld, cx, 0, z0 + T / 2, x1 - x0, H, T, '#3b3a45', (c) => c.z < z0);
    this.wallMesh(bld, x0 + T / 2, 0, cz, T, H, z1 - z0, '#46444f', (c) => c.x < x0);
    this.wallMesh(bld, x1 - T / 2, 0, cz, T, H, z1 - z0, '#46444f', (c) => c.x > x1);
    this.col.box(cx, z0 + T / 2, x1 - x0, T);
    this.col.box(x0 + T / 2, cz, T, z1 - z0);
    this.col.box(x1 - T / 2, cz, T, z1 - z0);
    // Front columns + header with glowing sign
    for (const x of [x0 + 0.5, x1 - 0.5]) { this.box(x, 0, z1 - 0.4, 1, H, 0.8, '#2b2a33', { r: 0.08 }); this.col.box(x, z1 - 0.4, 1, 0.8); }
    this.box(cx, H - 0.8, z1 - 0.4, x1 - x0, 0.9, 0.8, '#2b2a33', { r: 0.08 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), new THREE.MeshBasicMaterial({ map: textTexture(['JAS GYM'], { w: 1024, h: 136, color: '#ffe0a3', glow: '#ffb347', sizes: [104] }), transparent: true }));
    sign.position.set(cx, H - 0.35, z1 + 0.02);
    this.group.add(sign);
    // Neon strips (always lit)
    const neon = (x: number, y: number, z: number, w: number, h: number, d: number, color: number) => {
      const m = new THREE.Mesh(rounded(w, h, d, Math.min(w, h, d) / 2), this.neonMat.clone());
      (m.material as THREE.MeshStandardMaterial).emissive.setHex(color);
      m.position.set(x, y, z);
      this.group.add(m);
    };
    neon(cx, 3.9, z0 + 0.4, x1 - x0 - 1.5, 0.08, 0.08, 0xff5fa2);
    neon(x0 + 0.4, 3.9, cz, 0.08, 0.08, z1 - z0 - 1.5, 0xffb347);
    neon(x1 - 0.4, 3.9, cz, 0.08, 0.08, z1 - z0 - 1.5, 0xffb347);
    neon(cx, 0.35, z1 + 0.05, x1 - x0 - 2, 0.06, 0.06, 0xffb347);
    // Mirror wall
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.6), new THREE.MeshStandardMaterial({ color: '#cfe2f2', metalness: 1, roughness: 0.08 }));
    mirror.position.set(cx + 1, 1.8, z0 + 0.37);
    this.group.add(mirror);
    // Motivational wall text
    const quote = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.8), new THREE.MeshBasicMaterial({ map: textTexture(['STRONGER EVERY DAY'], { w: 1024, h: 136, color: '#ffffff', sizes: [70] }), transparent: true }));
    quote.rotation.y = Math.PI / 2;
    quote.position.set(x0 + 0.37, 3.2, cz);
    this.group.add(quote);

    // Roof
    const roofMat = new THREE.MeshStandardMaterial({ color: '#2b2a33', roughness: 0.6, transparent: true });
    const roof = new THREE.Mesh(rounded(x1 - x0 + 0.8, 0.5, z1 - z0 + 0.8, 0.15), roofMat);
    roof.position.set(cx, H + 0.25, cz);
    roof.castShadow = true;
    const trim = new THREE.Mesh(rounded(x1 - x0 + 1, 0.15, z1 - z0 + 1, 0.05), new THREE.MeshStandardMaterial({ color: P.gold, metalness: 0.6, roughness: 0.3, transparent: true }));
    trim.position.set(cx, H + 0.55, cz);
    for (const m of [roof, trim]) { this.group.add(m); bld.roof.push(m); }

    // Dumbbell rack (left wall)
    const rx = x0 + 1.2;
    this.box(rx, 0, -28, 0.9, 0.9, 6, '#1f1f25', { r: 0.05 });
    this.box(rx, 0.9, -28, 0.95, 0.05, 6.1, P.gold);
    const dbCols = ['#ff7aa2', '#7fd6c2', '#ffd166', '#c792ea', '#5b5b66', '#ff9f68'];
    for (let i = 0; i < 12; i++) {
      const z = -30.7 + i * 0.5, c = dbCols[i % dbCols.length];
      const s = 0.9 + (i % 4) * 0.12;
      this.cyl(rx + 0.2, 0.92, z, 0.03, 0.3, '#bbbbc4', 'solid', { x: 0, y: 0, z: Math.PI / 2 });
      this.sph(rx + 0.05, 1.0, z, 0.11 * s, c, 1);
      this.sph(rx + 0.35, 1.0, z, 0.11 * s, c, 1);
    }
    this.col.box(rx, -28, 0.9, 6);
    this.spot('dumbbells', rx + 1.6, -28, { x: rx + 1.9, z: -28, face: Math.PI / 2 });

    // Bench press + barbell
    const bpx = 25, bpz = -29.2;
    this.box(bpx, 0, bpz, 0.5, 0.5, 1.6, '#1f1f25', { r: 0.05 });
    this.box(bpx, 0.5, bpz, 0.45, 0.14, 1.6, '#7a2f3d', { r: 0.07 });
    for (const dz of [-0.7, 0.7]) this.box(bpx + dz * 0 + 0, 0, bpz - 0.9 + (dz > 0 ? 0 : 0), 0.08, 1.3, 0.08, '#55555f');
    this.box(bpx + 0.6, 0, bpz - 0.9, 0.08, 1.3, 0.08, '#55555f');
    this.box(bpx - 0.6, 0, bpz - 0.9, 0.08, 1.3, 0.08, '#55555f');
    this.cyl(bpx, 1.3, bpz - 0.9, 0.03, 2.4, '#c9ccd4', 'solid', { x: 0, y: 0, z: Math.PI / 2 });
    for (const dx of [-1.0, 1.0]) this.cyl(bpx + dx, 1.33, bpz - 0.9, 0.32, 0.12, '#2a2a30', 'solid', { x: 0, y: 0, z: Math.PI / 2 });
    this.col.box(bpx, bpz - 0.3, 2.6, 2.2);
    // Squat rack
    const sqx = 29.5, sqz = -32;
    for (const [dx, dz] of [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]]) this.box(sqx + dx, 0, sqz + dz, 0.1, 2.6, 0.1, P.gold);
    this.box(sqx, 2.6, sqz, 1.9, 0.1, 1.3, P.gold);
    this.cyl(sqx, 1.5, sqz + 0.6, 0.03, 2.6, '#c9ccd4', 'solid', { x: 0, y: 0, z: Math.PI / 2 });
    for (const dx of [-1.1, 1.1]) this.cyl(sqx + dx, 1.53, sqz + 0.6, 0.4, 0.14, '#ff7aa2', 'solid', { x: 0, y: 0, z: Math.PI / 2 });
    this.col.box(sqx, sqz, 2.4, 1.6);
    // Resistance band station (like in the video)
    const bdx = 34.2, bdz = -31.6;
    this.box(bdx, 0, bdz, 1.3, 0.35, 0.7, '#1f1f25', { r: 0.08 });
    this.box(bdx, 0.35, bdz, 1.2, 0.05, 0.6, '#3c3c46', { r: 0.02 });
    this.box(bdx, 0, z0 + 0.45, 0.4, 3, 0.15, '#1f1f25');
    for (let i = 0; i < 4; i++) this.cyl(bdx - 0.1 + i * 0.07, 1.2, z0 + 0.55, 0.02, 1.4, ['#ff4d6d', '#ff9f1c', '#7bd389', '#4d96ff'][i]);
    this.spot('band', bdx, bdz + 1.7, { x: bdx, z: bdz, face: 0 });
    // Treadmills
    for (const tx of [38.8, 40.8]) {
      this.box(tx, 0, -29.8, 0.9, 0.25, 2.3, '#1f1f25', { r: 0.08 });
      this.box(tx, 0.25, -29.8, 0.7, 0.02, 2.0, '#3d3d46');
      this.box(tx - 0.42, 0, -28.9, 0.08, 1.3, 0.08, '#55555f');
      this.box(tx + 0.42, 0, -28.9, 0.08, 1.3, 0.08, '#55555f');
      this.box(tx, 1.3, -28.8, 0.95, 0.35, 0.3, '#1f1f25', { r: 0.06 });
      this.box(tx, 1.45, -28.64, 0.6, 0.18, 0.02, '#6fd3ff', { bucket: 'glow' });
    }
    this.col.box(40.8, -29.8, 0.9, 2.3);
    this.col.box(38.8, -28.9, 1.0, 0.3);
    this.spot('treadmill', 38.8, -27.4, { x: 38.8, z: -30.2, face: 0 });
    // Kettlebells, med balls, mats
    for (let i = 0; i < 5; i++) {
      const kx = 21.5 + i * 0.7;
      this.sph(kx, 0.22, -33.3, 0.22, ['#ff7aa2', '#7fd6c2', '#ffd166', '#c792ea', '#ff9f68'][i]);
      this.b.add(new THREE.TorusGeometry(0.12, 0.035, 8, 16, Math.PI), '#26262c', { x: kx, y: 0.4, z: -33.3 });
    }
    for (let i = 0; i < 3; i++) this.box(23 + i * 1.1, 0.06, -21.5, 0.8, 0.03, 1.9, ['#f4a7bd', '#a9e2cf', '#ffd6a5'][i], { r: 0.01 });
    // Water cooler
    const wx = x1 - 1.1, wz = z1 - 2.0;
    this.box(wx, 0, wz, 0.6, 1.1, 0.6, '#f2f2f6', { r: 0.08 });
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.7, 20), new THREE.MeshPhysicalMaterial({ color: '#7cc8ff', transmission: 0.6, roughness: 0.05, thickness: 0.3, transparent: true, opacity: 0.85 }));
    jug.position.set(wx, 1.45, wz);
    this.group.add(jug);
    this.col.box(wx, wz, 0.6, 0.6);
    this.spot('water_gym', wx - 1.2, wz, { x: wx - 0.8, z: wz, face: Math.PI / 2 });
    // Speaker boxes + plant
    this.box(x0 + 0.8, 3.0, z0 + 0.8, 0.6, 0.9, 0.5, '#15151a', { r: 0.06 });
    this.box(x1 - 0.8, 3.0, z0 + 0.8, 0.6, 0.9, 0.5, '#15151a', { r: 0.06 });
    this.lamps.push(new THREE.Vector3(cx - 5, 3.8, cz), new THREE.Vector3(cx + 5, 3.8, cz));
    // Outside: bike rack, planters, trees
    for (let i = 0; i < 4; i++) this.b.add(new THREE.TorusGeometry(0.45, 0.04, 8, 20, Math.PI), '#c9ccd4', { x: x0 + 2 + i * 0.8, y: 0, z: z1 + 3.2 }, { rot: { x: 0, y: Math.PI / 2, z: 0 } });
    this.flowerBed(x1 - 3, z1 + 3, 4, 1.2);
    this.flowerBed(cx, z1 + 3, 4, 1.2);
    for (let z = z0 - 2; z <= z1 + 4; z += 3.5) this.tree(x1 + 4, z, 0.95, 'round');
    this.tree(x0 - 3.5, z0 - 1, 1.1, 'round');
  }

  // ---------- Café ----------
  private buildCafe(): void {
    const { x, z, w, d } = CAFE;
    const zf = z - d / 2;
    this.box(x, 0, z, w, 1.1, d, '#f7c7d4', { r: 0.1 });
    this.box(x, 1.1, zf + 0.35, w, 0.12, 0.8, '#fbfbfb', { r: 0.04 });
    this.box(x, 0, z + d / 2 - 0.3, w, 3.6, 0.6, '#f7c7d4', { r: 0.1 });
    this.box(x - w / 2 + 0.3, 0, z, 0.6, 3.6, d, '#f7c7d4', { r: 0.1 });
    this.box(x + w / 2 - 0.3, 0, z, 0.6, 3.6, d, '#f7c7d4', { r: 0.1 });
    this.box(x, 3.6, z, w + 0.4, 0.4, d + 0.4, '#ffffff', { r: 0.1 });
    // Striped awning
    for (let i = 0; i < 12; i++) {
      const ax = x - w / 2 + (i + 0.5) * (w / 12);
      this.b.add(box1, i % 2 ? '#ffffff' : '#ff8fb1', { x: ax, y: 3.25, z: zf - 0.8 }, { scale: { x: w / 12, y: 0.08, z: 1.9 }, rot: { x: 0.35, y: 0, z: 0 } });
      this.sph(ax, 2.9, zf - 1.7, 0.2, i % 2 ? '#ffffff' : '#ff8fb1', 0.6);
    }
    const signTex = textTexture(['JAS CAFÉ', 'SMOOTHIES • BOWLS • COFFEE'], { w: 1024, h: 256, bg: '#5a2f2d', color: '#ffe6c7', radius: 40, border: '#d4a24c' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.25 }));
    sign.position.set(x, 4.45, zf - 0.23);
    sign.rotation.y = Math.PI;
    sign.rotation.y = 0;
    sign.position.z = zf - 0.24;
    sign.lookAt(x, 4.45, zf - 10);
    this.group.add(sign);
    this.box(x, 3.8, zf - 0.2, 5.2, 1.35, 0.1, P.gold);
    // Coffee machine, cups, fruit display
    this.box(x - 3, 1.22, zf + 0.5, 0.9, 0.8, 0.6, '#c9ccd4', { r: 0.08 });
    this.box(x - 3, 1.9, zf + 0.5, 0.95, 0.12, 0.65, '#26262c', { r: 0.04 });
    for (let i = 0; i < 6; i++) this.cyl(x - 1.6 + i * 0.3, 1.22, zf + 0.4, 0.09, 0.2, i % 2 ? '#ffffff' : '#ffd6a5');
    for (let i = 0; i < 8; i++) this.sph(x + 1.5 + (i % 4) * 0.28, 1.32 + Math.floor(i / 4) * 0.18, zf + 0.45, 0.13, ['#ff5e5b', '#ffd166', '#7bd389', '#ff9f1c'][i % 4]);
    this.box(x + 3.6, 1.22, zf + 0.5, 0.5, 0.9, 0.5, '#ffffff', { r: 0.1 });
    this.col.box(x, z, w, d);
    this.spot('cafe', x, zf - 1.6, { x, z: zf - 1.1, face: 0 + Math.PI * 0 });
    this.lamps.push(new THREE.Vector3(x, 3.0, zf - 1.2));
    // Tables with umbrellas
    this.umbrellaTable(x - 4, zf - 5.5, '#ff8fb1');
    this.umbrellaTable(x + 0.5, zf - 6.8, '#7fd6c2');
    this.umbrellaTable(x + 5, zf - 5.5, '#ffd166');
    this.flowerBed(x - 7.5, z, 1.4, 4);
    this.flowerBed(x + 7.5, z, 1.4, 4);
    for (let i = 0; i < 4; i++) this.tree(x - 8 + i * 5.5, z + 7, 1, i % 2 ? 'blossom' : 'round');
  }

  // ---------- Park + running track + pond ----------
  private buildPark(): void {
    const { x, z, rx, rz, width } = TRACK;
    const ring = (ox: number, oz: number, ix: number, iz: number) => {
      const s = new THREE.Shape();
      s.absellipse(0, 0, ox, oz, 0, Math.PI * 2, false, 0);
      const h = new THREE.Path();
      h.absellipse(0, 0, ix, iz, 0, Math.PI * 2, true, 0);
      s.holes.push(h);
      const g = new THREE.ShapeGeometry(s, 96);
      g.rotateX(-Math.PI / 2);
      return g;
    };
    this.b.add(ring(rx + 0.5, rz + 0.5, rx, rz), '#e8e1d6', { x, y: 0.035, z }, { bucket: 'ground' });
    this.b.add(ring(rx, rz, rx - width, rz - width), '#d66a4e', { x, y: 0.04, z }, { bucket: 'ground' });
    for (let i = 0; i <= 3; i++) {
      const o = i * (width / 3);
      this.b.add(ring(rx - o + 0.05, rz - o + 0.05, rx - o - 0.05, rz - o - 0.05), '#fff6ec', { x, y: 0.045, z }, { bucket: 'ground' });
    }
    // Start / finish line (checkered) at the bottom of the track
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
      this.box(x - 0.25 + j * 0.5, 0.046, z + rz - width + 0.225 + i * 0.45, 0.5, 0.01, 0.45, (i + j) % 2 ? '#1c1c22' : '#ffffff', { bucket: 'ground', rotY: 0 });
    }
    // Start arch
    for (const dz of [-0.4, width + 0.4]) this.box(x, 0, z + rz - width + dz - 0.2 + (dz > 0 ? 0 : 0), 0.3, 3.6, 0.3, P.gold, { r: 0.1 });
    const arch = new THREE.Mesh(new THREE.PlaneGeometry(width + 1.6, 0.8), new THREE.MeshBasicMaterial({ map: textTexture(['START • FINISH'], { w: 1024, h: 180, bg: '#5a2f2d', color: '#ffe6c7', sizes: [100], radius: 30 }), side: THREE.DoubleSide }));
    arch.rotation.y = Math.PI / 2;
    arch.position.set(x, 3.3, z + rz - width / 2);
    this.group.add(arch);
    this.box(x, 3.6, z + rz - width / 2, 0.3, 0.2, width + 1.6, P.gold);
    this.col.circle(x, z + rz - width - 0.6, 0.2);
    this.col.circle(x, z + rz + 0.2, 0.2);
    this.spot('track', x - 1.4, z + rz - width / 2, { x: x - 1, z: z + rz - width / 2, face: -Math.PI / 2 }, 2.2);

    // Pond with rocks, fountain and ducks
    const ps = new THREE.Shape();
    ps.absellipse(0, 0, POND.rx, POND.rz, 0, Math.PI * 2, false, 0);
    const pg = new THREE.ShapeGeometry(ps, 64);
    pg.rotateX(-Math.PI / 2);
    const pmat = makeWaterMaterial({ deep: '#2d8fb8', shallow: '#6fd3e6', waves: 0.02 });
    this.waters.push(pmat);
    const pond = new THREE.Mesh(pg, pmat);
    pond.position.set(POND.x, 0.12, POND.z);
    this.group.add(pond);
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      this.sph(POND.x + Math.cos(a) * (POND.rx + 0.2), 0.12, POND.z + Math.sin(a) * (POND.rz + 0.2), 0.3 + Math.random() * 0.15, i % 3 ? '#b8b2aa' : '#a39d95', 0.6, 'solid', true);
    }
    this.col.circle(POND.x - 3.2, POND.z, 3.8);
    this.col.circle(POND.x + 3.2, POND.z, 3.8);
    this.col.circle(POND.x, POND.z, 4.1);
    this.cyl(POND.x, 0, POND.z, 0.9, 0.5, '#e8e1d6');
    this.cyl(POND.x, 0.5, POND.z, 0.2, 1.2, '#e8e1d6');
    this.cyl(POND.x, 1.6, POND.z, 0.55, 0.15, '#e8e1d6');
    const fn = 260;
    const fpos = new Float32Array(fn * 3);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    this.fountain = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#dff6ff', size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
    this.fountain.userData.seeds = Array.from({ length: fn }, () => [Math.random() * Math.PI * 2, Math.random(), 0.6 + Math.random() * 0.6]);
    this.fountain.frustumCulled = false;
    this.group.add(this.fountain);
    for (let i = 0; i < 3; i++) {
      const duck = new THREE.Group();
      const yellow = new THREE.MeshStandardMaterial({ color: i === 0 ? '#ffffff' : '#ffd84d', roughness: 0.5 });
      const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), yellow); b1.scale.set(1, 0.75, 1.3); duck.add(b1);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), yellow); hd.position.set(0, 0.25, 0.25); duck.add(hd);
      const bk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 8), new THREE.MeshStandardMaterial({ color: '#ff8c1a' })); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.23, 0.44); duck.add(bk);
      for (const sx of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#111' })); e.position.set(sx, 0.3, 0.38); duck.add(e); }
      duck.userData.phase = (i / 3) * Math.PI * 2;
      duck.userData.r = 0.55 + i * 0.12;
      this.group.add(duck);
      this.ducks.push(duck);
    }

    // Park dressing: trees, benches, lamps, flower beds, picnic blanket
    const around = 26;
    for (let i = 0; i < around; i++) {
      const a = (i / around) * Math.PI * 2 + 0.1;
      const tx = x + Math.cos(a) * (rx + 4.5 + Math.random() * 2), tz = z + Math.sin(a) * (rz + 3.8 + Math.random() * 1.5);
      if (tz < 7.5 || tz > 44 || tx < -54 || tx > 0) continue;
      if (Math.abs(tx - x) < 3 && tz > z) continue;
      this.tree(tx, tz, 0.85 + Math.random() * 0.35, i % 5 === 0 ? 'blossom' : 'round');
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      this.tree(x + Math.cos(a) * 9.2, z + Math.sin(a) * 6.3, 0.7, i % 2 ? 'blossom' : 'round');
    }
    this.bench(x - 8, z - rz - 1.8, 0);
    this.bench(x + 8, z - rz - 1.8, 0);
    this.bench(x + 3.5, z + rz + 1.8, Math.PI);
    this.spot('bench', x + 8, z - rz - 3, { x: x + 8, z: z - rz - 2, face: Math.PI });
    for (const a of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI, Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
      this.lamp(x + Math.cos(a) * (rx + 1.4), z + Math.sin(a) * (rz + 1.4), a + Math.PI / 2);
    }
    this.box(x - 11, 0.05, z - 3, 2.2, 0.02, 1.8, '#ff8fb1', { bucket: 'ground' });
    for (let i = 0; i < 5; i++) this.box(x - 11 - 1.1 + i * 0.44 + 0.22, 0.06, z - 3, 0.2, 0.02, 1.8, '#ffffff', { bucket: 'ground' });
    this.cyl(x - 10.6, 0.06, z - 2.7, 0.25, 0.2, '#c98d52');
    this.sph(x - 11.4, 0.2, z - 3.4, 0.14, '#ff5e5b');
  }

  private buildCourt(): void {
    const cx = 0, cz = -26;
    this.box(cx, 0, cz, 16, 0.05, 24, '#4c7fd1', { bucket: 'ground' });
    this.box(cx, 0.01, cz, 14, 0.05, 22, '#e98a4f', { bucket: 'ground' });
    const line = (x: number, z: number, w: number, d: number) => this.box(x, 0.025, z, w, 0.04, d, '#ffffff', { bucket: 'ground' });
    line(cx, cz - 11, 14, 0.1); line(cx, cz + 11, 14, 0.1); line(cx - 7, cz, 0.1, 22); line(cx + 7, cz, 0.1, 22); line(cx, cz, 14, 0.1);
    const circ = new THREE.RingGeometry(1.7, 1.8, 48); circ.rotateX(-Math.PI / 2);
    this.b.add(circ, '#ffffff', { x: cx, y: 0.065, z: cz }, { bucket: 'ground' });
    for (const s of [-1, 1]) {
      const hz = cz + s * 10.5;
      this.cyl(cx, 0, hz + s * 0.9, 0.1, 3.4, '#34343d');
      this.box(cx, 2.9, hz + s * 0.4, 1.8, 1.1, 0.08, '#ffffff', { r: 0.03 });
      this.b.add(new THREE.TorusGeometry(0.28, 0.03, 8, 20), '#ff5a36', { x: cx, y: 3.0, z: hz }, { rot: { x: Math.PI / 2, y: 0, z: 0 } });
      this.col.circle(cx, hz + s * 0.9, 0.15);
    }
    this.sph(cx + 2, 0.25, cz + 3, 0.25, '#e8762c');
    this.spot('hoop', cx, cz + 8, { x: cx, z: cz + 7, face: Math.PI });
    for (let x = -9; x <= 9; x += 3) { this.bush(x, cz - 13.2, 0.7); }
  }

  private buildFoodTruck(): void {
    const tx = 8, tz = 12;
    this.box(tx, 0.5, tz, 5.6, 2.6, 2.4, '#ffd166', { r: 0.3 });
    this.box(tx - 2.9, 0.5, tz, 1.2, 1.8, 2.3, '#ffd166', { r: 0.3 });
    this.box(tx - 3.3, 1.5, tz, 0.3, 0.7, 2.0, '#9ad7ff', { r: 0.1 });
    this.box(tx + 0.3, 1.4, tz - 1.2, 3.4, 1.2, 0.1, '#3b2a2a', { r: 0.05 });
    this.box(tx + 0.3, 1.3, tz - 1.45, 3.6, 0.1, 0.6, '#ff6b6b');
    for (const [dx, dz] of [[-2.2, -1.2], [1.8, -1.2], [-2.2, 1.2], [1.8, 1.2]]) this.cyl(tx + dx, 0.45, tz + dz, 0.45, 0.35, '#26262c', 'solid', { x: Math.PI / 2, y: 0, z: 0 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.9), new THREE.MeshBasicMaterial({ map: textTexture(['🍔 BURGER • 🍕 PIZZA • 🍩'], { w: 1024, h: 230, bg: '#ff6b6b', color: '#fff', sizes: [90], radius: 30 }) }));
    sign.position.set(tx + 0.3, 3.35, tz - 1.23);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
    // Giant burger on the roof
    this.cyl(tx + 1, 3.1, tz, 0.8, 0.3, '#d99a4e');
    this.cyl(tx + 1, 3.4, tz, 0.85, 0.2, '#6b3e26');
    this.cyl(tx + 1, 3.6, tz, 0.9, 0.08, '#7bd389');
    this.sph(tx + 1, 3.75, tz, 0.8, '#e0a458', 0.55);
    this.col.box(tx - 0.3, tz, 7, 2.6);
    this.spot('foodtruck', tx + 0.3, tz - 2.6, { x: tx + 0.3, z: tz - 2.2, face: 0 + Math.PI * 0 });
    this.umbrellaTable(tx - 1, tz - 6, '#ff6b6b');
  }

  private buildBeach(): void {
    const smat = makeWaterMaterial({ deep: '#1f7fb8', shallow: '#48c6d9', waves: 0.18, foam: true });
    this.waters.push(smat);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 600, 90, 90), smat);
    sea.rotation.x = -Math.PI / 2;
    sea.rotation.z = Math.PI;
    sea.position.set(SEA_X + 210, 0.08, 0);
    this.group.add(sea);
    // Open water: Yasmin can swim ~45m out before the buoy line.
    this.col.box(SEA_X + 45 + 50, 0, 100, 600);
    for (let z = -90; z <= 90; z += 6) this.sph(SEA_X + 45, 0.15, z, 0.35, z % 12 === 0 ? '#ff5e5b' : '#ffd166');
    // Boardwalk
    this.box(BEACH_X - 3.5, 0, 0, 3, 0.12, 120, '#c9955f', { bucket: 'ground' });
    for (let z = -58; z <= 58; z += 1) this.box(BEACH_X - 3.5, 0.12, z, 3, 0.01, 0.06, '#9c6c42', { bucket: 'ground' });
    for (let z = -40; z <= 40; z += 13) this.palm(BEACH_X + 1 + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 4, 1 + Math.random() * 0.3);
    for (let z = -60; z <= 60; z += 20) this.lamp(BEACH_X - 5.4, z + 10, Math.PI / 2);
    const cols = ['#ff8fb1', '#7fd6c2', '#ffd166', '#c792ea'];
    for (let i = 0; i < 4; i++) {
      const lz = -18 + i * 9, lx = BEACH_X + 5;
      this.box(lx, 0.2, lz, 2.1, 0.12, 0.8, cols[i], { r: 0.05, rotY: 0 });
      this.box(lx - 0.95, 0.3, lz, 0.5, 0.12, 0.8, cols[i], { r: 0.05 });
      this.box(lx, 0, lz, 2, 0.2, 0.7, P.white);
      this.cyl(lx + 1.3, 0, lz + 0.8, 0.04, 2.6, P.white);
      this.cone(lx + 1.3, 2.3, lz + 0.8, 1.4, 0.5, cols[(i + 1) % 4]);
      this.col.box(lx, lz, 2.2, 0.9);
    }
    this.spot('lounger', BEACH_X + 5, -18 + 1.3, { x: BEACH_X + 5, z: -18, face: -Math.PI / 2 });
    // Lifeguard tower
    const lgx = BEACH_X + 6, lgz = 12;
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) this.box(lgx + dx, 0, lgz + dz, 0.15, 2.2, 0.15, P.white);
    this.box(lgx, 2.2, lgz, 2.2, 1.4, 2.2, '#ff6b6b', { r: 0.1 });
    this.box(lgx, 3.6, lgz, 2.6, 0.2, 2.6, P.white, { r: 0.05 });
    this.col.box(lgx, lgz, 1.9, 1.9);
    // Beach ball + sandcastle
    this.sph(BEACH_X + 3, 0.35, 2, 0.35, '#ff5e5b');
    this.cone(BEACH_X + 7, 0, -4, 0.6, 0.9, '#e7c88c');
    this.cyl(BEACH_X + 7.6, 0, -4.3, 0.3, 0.5, '#e7c88c');
  }

  private buildNeighborhood(): void {
    const pastel = ['#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#ffadad', '#f1e3d3'];
    const roofs = ['#d0714f', '#6d8ca8', '#8a6bb0', '#c2575b', '#5e8f6c'];
    const house = (x: number, z: number, face: number) => {
      const w = 7 + Math.random() * 2, d = 6, h = 3.4 + Math.random() * 1.6;
      const c = pastel[Math.floor(Math.random() * pastel.length)];
      this.box(x, 0, z, w, h, d, c, { r: 0.12, rotY: face });
      const roofGeo = new THREE.ConeGeometry(1, 1, 4);
      this.b.add(roofGeo, roofs[Math.floor(Math.random() * roofs.length)], { x, y: h + 1.2, z }, { scale: { x: w / 1.35, y: 2.4, z: d / 1.35 }, rot: { x: 0, y: Math.PI / 4 + face, z: 0 } });
      const fx = Math.sin(face), fz = Math.cos(face);
      const px = Math.cos(face), pz = -Math.sin(face);
      const off = d / 2 + 0.02;
      this.box(x + fx * off, 0, z + fz * off, 1.1, 2.1, 0.12, '#8d5b3a', { rotY: face, r: 0.04 });
      for (const s of [-1, 1]) this.box(x + fx * off + px * s * 2.2, 1.2, z + fz * off + pz * s * 2.2, 1.2, 1.1, 0.14, P.window, { rotY: face, bucket: 'glow' });
      if (h > 4.2) for (const s of [-1, 1]) this.box(x + fx * off + px * s * 1.8, 2.9, z + fz * off + pz * s * 1.8, 1.0, 0.9, 0.14, P.window, { rotY: face, bucket: 'glow' });
      const ww = Math.abs(Math.cos(face)) > 0.5 ? w : d, dd = Math.abs(Math.cos(face)) > 0.5 ? d : w;
      this.col.box(x, z, ww, dd);
      this.bush(x + fx * (off + 1.2) + px * 3, z + fz * (off + 1.2) + pz * 3, 0.7);
    };
    for (let x = -52; x <= 52; x += 13) { if (Math.abs(x) > 6) house(x, -66, 0); house(x, 66, Math.PI); }
    for (let z = -40; z <= 40; z += 13) if (Math.abs(z) > 8) house(-76, z, Math.PI / 2);
  }

  private buildNature(): void {
    // Forest ring beyond the neighborhood
    for (let i = 0; i < 420; i++) {
      const tx = EXT.x0 - 30 + Math.random() * (BEACH_X - 10 - EXT.x0 + 30), tz = EXT.z0 - 40 + Math.random() * (EXT.z1 - EXT.z0 + 80);
      const inside = tx > EXT.x0 + 4 && tz > EXT.z0 + 4 && tz < EXT.z1 - 4;
      if (inside) continue;
      this.tree(tx, tz, 1.1 + Math.random() * 0.8, Math.random() < 0.35 ? 'pine' : 'round', false);
    }
    // Trees in the empty lots
    for (const [tx, tz] of [[-10, -40], [-14, -12], [12, -42], [10, -12], [-5, 40], [8, 40], [15, 32], [-47, 43], [52, 42], [52, -42], [-47, -43], [-47, 10], [52, 10], [18, 42]] as const) {
      this.tree(tx, tz, 0.9 + Math.random() * 0.4, Math.random() < 0.3 ? 'blossom' : 'round');
    }
    for (let i = 0; i < 40; i++) {
      const bx = (Math.random() - 0.5) * 108, bz = (Math.random() - 0.5) * 88;
      if (Math.abs(bz) < 7 || Math.abs(bx) > 54 || Math.abs(bz) > 44) continue;
      if (bx > HOUSE.x0 - 2 && bx < HOUSE.x1 + 2 && bz > HOUSE.z0 - 2 && bz < -5) continue;
      if (bx > GYM.x0 - 2 && bx < GYM.x1 + 2 && bz > GYM.z0 - 2 && bz < -5) continue;
      if (Math.hypot((bx - TRACK.x) / (TRACK.rx + 3), (bz - TRACK.z) / (TRACK.rz + 3)) < 1) continue;
      if (Math.abs(bx - CAFE.x) < 10 && bz > 12 && bz < 33) continue;
      if (Math.abs(bx) < 10 && bz < -12) continue;
      if (Math.abs(bx - 8) < 6 && Math.abs(bz - 10) < 6) continue;
      this.bush(bx, bz, 0.7 + Math.random() * 0.4);
    }
    // Distant mountains
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 0.55 + (i / 15) * Math.PI * 0.95;
      const r = 250 + Math.random() * 40;
      this.cone(Math.cos(a) * r, -2, Math.sin(a) * r, 40 + Math.random() * 30, 40 + Math.random() * 35, i % 2 ? '#7e9bb8' : '#8aa6bf', Math.random());
    }
    // Blob shadows under trees would be nice but real shadows cover it.
    void blobTexture;
  }

  // ---------- runtime ----------
  update(dt: number, glow: number, player: THREE.Vector3, cam: THREE.Vector3, skyColor?: THREE.Color): void {
    this.time += dt;
    for (const w of this.waters) { w.uniforms.uTime.value = this.time; w.uniforms.uNight.value = glow; if (skyColor) w.uniforms.uSky.value.copy(skyColor); }
    this.glowMat.emissive.setScalar(0.08 + glow * 2.4);
    this.districts.update(dt, glow, this.time);
    // Fountain particles
    const seeds = this.fountain.userData.seeds as number[][];
    const arr = this.fountain.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < seeds.length; i++) {
      const [a, off, sp] = seeds[i];
      const t = (this.time * 0.8 * sp + off) % 1;
      const r = t * 1.3;
      arr[i * 3] = POND.x + Math.cos(a) * r;
      arr[i * 3 + 1] = 1.75 + t * 2.4 - t * t * 3.6;
      arr[i * 3 + 2] = POND.z + Math.sin(a) * r;
    }
    this.fountain.geometry.attributes.position.needsUpdate = true;
    for (const d of this.ducks) {
      const ph = d.userData.phase + this.time * 0.25;
      const r = d.userData.r as number;
      d.position.set(POND.x + Math.cos(ph) * POND.rx * r, 0.18 + Math.sin(this.time * 3 + ph) * 0.02, POND.z + Math.sin(ph) * POND.rz * r);
      d.rotation.y = -ph;
    }
    // Dollhouse cut-away: hide roofs and fade walls between camera and Yasmin.
    for (const b of this.buildings) {
      const inside = player.x > b.x0 - 0.2 && player.x < b.x1 + 0.2 && player.z > b.z0 - 0.2 && player.z < b.z1 + 0.6;
      b.fade = THREE.MathUtils.damp(b.fade, inside ? 0 : 1, 8, dt);
      for (const r of b.roof) {
        const m = r.material as THREE.MeshStandardMaterial;
        m.opacity = b.fade; r.visible = b.fade > 0.02; m.depthWrite = b.fade > 0.9;
      }
      for (const w of b.walls) {
        const m = w.mesh.material as THREE.MeshStandardMaterial;
        const target = inside && w.out(cam) ? 0.12 : 1;
        m.opacity = THREE.MathUtils.damp(m.opacity, target, 10, dt);
        m.depthWrite = m.opacity > 0.9;
        w.mesh.castShadow = m.opacity > 0.5;
      }
    }
    // Assign the few real point lights to the lamps closest to the player.
    this.lightTimer -= dt;
    if (this.lights.length && this.lightTimer <= 0) {
      this.lightTimer = 0.4;
      const near = [...this.lamps].sort((a, b) => a.distanceToSquared(player) - b.distanceToSquared(player));
      this.lights.forEach((l, i) => { if (near[i]) l.position.copy(near[i]); });
    }
    for (const l of this.lights) l.intensity = glow * 22;
  }

  /** The active street-lamp light closest to `p` (for lighting the cut-out avatar). */
  nearestLamp(p: THREE.Vector3): THREE.PointLight | null {
    let best: THREE.PointLight | null = null, bd = Infinity;
    for (const l of this.lights) { const d = l.position.distanceToSquared(p); if (l.visible && d < bd) { bd = d; best = l; } }
    return best;
  }

  nearestSpot(p: THREE.Vector3): Spot | null {
    let best: Spot | null = null, bd = Infinity;
    for (const s of this.spots) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    return best;
  }
}
