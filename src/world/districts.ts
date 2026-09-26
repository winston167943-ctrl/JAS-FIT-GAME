import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { World } from './world';
import { canvasTexture, textTexture } from '../core/textures';
import { DOWNTOWN, HILL, PIER, RING, SEA_X, BEACH_X, terrainY } from './layout';

export interface DistrictRuntime { update(dt: number, glow: number, t: number): void }

/** Facade texture: colour + a grid of windows (and a matching emissive map for lit windows). */
function facade(base: string, frame: string, glass: string): { map: THREE.Texture; emissive: THREE.Texture } {
  const cols = 4, rows = 4, S = 256, cw = S / cols, rh = S / rows;
  const lit: boolean[] = [];
  const map = canvasTexture(S, S, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      g.fillStyle = frame; g.fillRect(c * cw + 5, r * rh + 5, cw - 10, rh - 8);
      const grd = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      grd.addColorStop(0, glass); grd.addColorStop(1, '#1d2a3a');
      g.fillStyle = grd; g.fillRect(c * cw + 8, r * rh + 8, cw - 16, rh - 14);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(c * cw + 8, r * rh + 8, (cw - 16) * 0.35, rh - 14);
      lit.push(Math.random() < 0.55);
    }
  });
  const emissive = canvasTexture(S, S, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    let i = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (lit[i++]) { g.fillStyle = ['#ffd89a', '#fff1d0', '#ffc97a', '#cfe8ff'][(r + c) % 4]; g.fillRect(c * cw + 8, r * rh + 8, cw - 16, rh - 14); }
    }
  });
  for (const t of [map, emissive]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return { map, emissive };
}

/** A box whose UVs repeat by size, so the window grid keeps a constant scale. */
function towerGeo(w: number, h: number, d: number, x: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const scale = [[d / 7, h / 7], [d / 7, h / 7], [0.001, 0.001], [0.001, 0.001], [w / 7, h / 7], [w / 7, h / 7]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * scale[f][0], uv.getY(i) * scale[f][1]);
  }
  g.translate(x, h / 2, z);
  return g;
}

export function buildDistricts(w: World, scene: THREE.Scene): DistrictRuntime {
  const runtime: ((dt: number, glow: number, t: number) => void)[] = [];
  const road = (cx: number, cz: number, lw: number, ld: number) => w.box(cx, 0, cz, lw, 0.03, ld, '#3d4049', { bucket: 'ground' });
  const walk = (cx: number, cz: number, lw: number, ld: number) => w.box(cx, 0, cz, lw, 0.06, ld, '#e6ddd2', { bucket: 'ground' });
  const dash = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 4);
    for (let i = 1; i < n; i++) {
      const k = i / n, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      w.box(x0 + (x1 - x0) * k, 0.03, z0 + (z1 - z0) * k, alongX ? 1.8 : 0.18, 0.01, alongX ? 0.18 : 1.8, '#f7f3ea', { bucket: 'ground' });
    }
  };

  // ---------- Connecting roads ----------
  // West: main street to downtown
  road((RING.x0 - 4.5 + DOWNTOWN.x1) / 2, 0, RING.x0 - 4.5 - DOWNTOWN.x1, 9);
  walk((RING.x0 - 4.5 + DOWNTOWN.x1) / 2, -5.6, RING.x0 - 4.5 - DOWNTOWN.x1 - 9, 2.2);
  walk((RING.x0 - 4.5 + DOWNTOWN.x1) / 2, 5.6, RING.x0 - 4.5 - DOWNTOWN.x1 - 9, 2.2);
  dash(RING.x0 - 4.5, 0, DOWNTOWN.x1, 0);
  for (let x = RING.x0 - 12; x > DOWNTOWN.x1 + 4; x -= 14) { w.lamp(x, -7.2, 0); w.tree(x - 7, -9, 0.8); w.tree(x - 7, 9, 0.8); }
  // North: road to the lookout hill
  const nz0 = RING.z0 - 4.5, nz1 = HILL.z + HILL.r * 0.9 + 2;
  road(0, (nz0 + nz1) / 2, 7, nz0 - nz1);
  walk(-4.6, (nz0 + nz1) / 2, 2.2, nz0 - nz1);
  walk(4.6, (nz0 + nz1) / 2, 2.2, nz0 - nz1);
  dash(0, nz0, 0, nz1);
  for (let z = nz0 - 8; z > nz1 + 2; z -= 12) { w.lamp(-6, z, Math.PI / 2); w.lamp(6, z, -Math.PI / 2); }
  // Parking turnaround at the foot of the hill
  w.cyl(0, 0, nz1 - 5, 9, 0.035, '#3d4049', 'ground');

  // ---------- Downtown ----------
  const D = DOWNTOWN;
  road((D.x0 + D.x1) / 2, D.z0, D.x1 - D.x0 + D.w, D.w);
  road((D.x0 + D.x1) / 2, D.z1, D.x1 - D.x0 + D.w, D.w);
  road(D.x0, 0, D.w, D.z1 - D.z0 - D.w);
  road(D.x1, 0, D.w, D.z1 - D.z0 - D.w);
  road(D.ax, 0, D.w, D.z1 - D.z0 - D.w);
  road((D.x0 + D.x1) / 2, 0, D.x1 - D.x0 - D.w, D.w);
  dash(D.x0, D.z0, D.x1, D.z0); dash(D.x0, D.z1, D.x1, D.z1); dash(D.x0, 0, D.x1, 0);
  dash(D.x0, D.z0, D.x0, D.z1); dash(D.x1, D.z0, D.x1, D.z1); dash(D.ax, D.z0, D.ax, D.z1);
  // Plaza paving inside the blocks (sidewalk-coloured slabs with a darker border)
  const blocks = [
    { x0: D.x0 + 4.5, x1: D.ax - 4.5, z0: D.z0 + 4.5, z1: -4.5 },
    { x0: D.ax + 4.5, x1: D.x1 - 4.5, z0: D.z0 + 4.5, z1: -4.5 },
    { x0: D.x0 + 4.5, x1: D.ax - 4.5, z0: 4.5, z1: D.z1 - 4.5 },
    { x0: D.ax + 4.5, x1: D.x1 - 4.5, z0: 4.5, z1: D.z1 - 4.5 },
  ];
  for (const b of blocks) {
    w.box((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2, b.x1 - b.x0, 0.07, b.z1 - b.z0, '#d8cfc4', { bucket: 'ground' });
    w.box((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2, b.x1 - b.x0 - 3, 0.08, b.z1 - b.z0 - 3, '#e9e2d8', { bucket: 'ground' });
  }
  // Zebra crossings at downtown intersections
  for (const [zx, zz] of [[D.x1, 0], [D.ax, 0], [D.x0, 0]]) for (let i = -3; i <= 3; i++) w.box(zx + (zx === D.x1 ? 7 : 0), 0.035, zz + i * 0.9, 3, 0.012, 0.5, '#f7f3ea', { bucket: 'ground' });

  // Towers: merged per facade style so the whole skyline is a handful of draw calls
  const styles = [
    facade('#9fb4c8', '#dfe8f0', '#5f86ad'),
    facade('#e8d8c4', '#fff6ea', '#6d8fb0'),
    facade('#f3f1ee', '#ffffff', '#7aa3c8'),
    facade('#c9a88f', '#ecd9c6', '#56789c'),
  ];
  const towerMats = styles.map((s) => new THREE.MeshStandardMaterial({ map: s.map, emissiveMap: s.emissive, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.45, metalness: 0.15 }));
  const geos: THREE.BufferGeometry[][] = styles.map(() => []);
  const plaza = blocks[3];
  blocks.forEach((b, bi) => {
    if (bi === 3) return;
    const cells = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]];
    const cw = (b.x1 - b.x0) / 2, cd = (b.z1 - b.z0) / 3;
    for (const [cx, cz] of cells) {
      if (Math.random() < 0.12) continue;
      const tw = cw * (0.62 + Math.random() * 0.22), td = cd * (0.62 + Math.random() * 0.2);
      const h = 12 + Math.pow(Math.random(), 1.6) * 46;
      const x = b.x0 + cw * (cx + 0.5), z = b.z0 + cd * (cz + 0.5);
      const st = Math.floor(Math.random() * styles.length);
      geos[st].push(towerGeo(tw, h, td, x, z));
      w.col.box(x, z, tw + 0.4, td + 0.4);
      w.occluders.push({ x0: x - tw / 2, x1: x + tw / 2, z0: z - td / 2, z1: z + td / 2, h });
      // Roof: parapet, AC units, antenna, occasional billboard glow strip
      w.box(x, h, z, tw + 0.3, 0.6, td + 0.3, '#6c6f78');
      w.box(x + tw * 0.2, h + 0.6, z - td * 0.15, 1.6, 1.1, 1.6, '#b9bec8', { r: 0.1 });
      if (h > 35) { w.cyl(x, h + 0.6, z, 0.12, 6, '#8a8f99'); w.sph(x, h + 6.8, z, 0.3, '#ff4d4d', 1, 'glow'); }
      if (Math.random() < 0.5) w.box(x, h - 1.2, z + td / 2 + 0.05, tw * 0.8, 0.3, 0.1, ['#ff5fa2', '#6fd3ff', '#ffd166'][Math.floor(Math.random() * 3)], { bucket: 'glow' });
      // Ground-floor shopfront awning
      w.box(x, 3.2, z + td / 2 + 0.6, tw * 0.9, 0.15, 1.2, ['#ff8fb1', '#7fd6c2', '#ffd166', '#c792ea'][Math.floor(Math.random() * 4)]);
    }
  });
  styles.forEach((_, i) => {
    if (!geos[i].length) return;
    const m = new THREE.Mesh(mergeGeometries(geos[i], false)!, towerMats[i]);
    m.castShadow = true; m.receiveShadow = true;
    w.group.add(m);
  });
  runtime.push((_dt, glow) => { for (const m of towerMats) m.emissiveIntensity = 0.02 + glow * 0.42; });

  // JAS Plaza: giant LED screen with Yasmin, neon sign, fountain, trees
  const px = (plaza.x0 + plaza.x1) / 2, pz = (plaza.z0 + plaza.z1) / 2;
  const scrH = 22, scrW = scrH * (432 / 723);
  const screenTower = towerGeo(scrW + 4, 34, 8, plaza.x0 + 8, plaza.z1 - 6);
  const stMesh = new THREE.Mesh(screenTower, towerMats[0]);
  stMesh.castShadow = true;
  w.group.add(stMesh);
  w.col.box(plaza.x0 + 8, plaza.z1 - 6, scrW + 4.4, 8.4);
  w.occluders.push({ x0: plaza.x0 + 8 - scrW / 2 - 2, x1: plaza.x0 + 8 + scrW / 2 + 2, z0: plaza.z1 - 10, z1: plaza.z1 - 2, h: 34 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(scrW, scrH), new THREE.MeshBasicMaterial({ map: w.tex.hero, toneMapped: false }));
  screen.position.set(plaza.x0 + 8, 18, plaza.z1 - 1.9);
  screen.rotation.y = Math.PI;
  screen.rotation.y = 0;
  screen.lookAt(plaza.x0 + 8, 18, plaza.z0 - 10);
  w.group.add(screen);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(scrW + 1, scrH + 1, 0.4), new THREE.MeshStandardMaterial({ color: '#15151a', roughness: 0.4 }));
  bezel.position.copy(screen.position).add(new THREE.Vector3(0, 0, 0.25));
  w.group.add(bezel);
  const neonTex = textTexture(['JAS FITNESS'], { w: 1024, h: 180, color: '#ffe0a3', glow: '#ff7fb0', sizes: [120] });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.8), new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, toneMapped: false }));
  neon.position.set(plaza.x0 + 8, 31.5, plaza.z1 - 1.85);
  neon.lookAt(plaza.x0 + 8, 31.5, plaza.z0 - 10);
  w.group.add(neon);
  const screenMat = screen.material as THREE.MeshBasicMaterial;
  runtime.push((_dt, glow, t) => {
    const k = 0.75 + glow * 0.5 + Math.sin(t * 2) * 0.03;
    screenMat.color.setScalar(k);
  });
  // Fountain + benches + planters
  w.cyl(px + 4, 0, pz - 6, 5, 0.6, '#d8d1c7');
  w.cyl(px + 4, 0.55, pz - 6, 4.5, 0.1, '#5ab3d6', 'glow');
  w.cyl(px + 4, 0, pz - 6, 0.6, 2.4, '#d8d1c7');
  w.cyl(px + 4, 2.4, pz - 6, 1.6, 0.25, '#d8d1c7');
  w.col.circle(px + 4, pz - 6, 5.1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    w.bench(px + 4 + Math.cos(a) * 8, pz - 6 + Math.sin(a) * 8, -a + Math.PI / 2);
  }
  for (const [tx, tz] of [[plaza.x1 - 3, plaza.z0 + 3], [plaza.x1 - 3, plaza.z1 - 3], [plaza.x0 + 3, plaza.z0 + 3], [px + 4, plaza.z0 + 3]]) {
    w.cyl(tx, 0, tz, 1.2, 0.7, '#b9b0a4');
    w.tree(tx, tz, 1.0, 'blossom', true, 0.6);
  }
  w.spot('plaza', px + 4, pz - 14.5, { x: px + 4, z: pz - 14, face: 0 }, 2.2);
  // Street lamps + street trees along downtown streets
  for (let x = D.x0 + 12; x < D.x1 - 4; x += 16) {
    for (const z of [D.z0 + 6.4, -6.4, 6.4, D.z1 - 6.4]) w.lamp(x, z, z > 0 === (Math.abs(z) < 10) ? Math.PI : 0);
  }
  for (let z = D.z0 + 14; z < D.z1 - 10; z += 18) { if (Math.abs(z) > 8) { w.lamp(D.ax - 6.4, z, Math.PI / 2); w.lamp(D.ax + 6.4, z, -Math.PI / 2); } }
  // Bus stop
  w.box(D.x1 - 7, 0, -9, 4, 0.1, 1.6, '#c9ccd4');
  w.box(D.x1 - 7, 2.6, -9, 4.2, 0.12, 1.8, '#5a2f2d', { r: 0.05 });
  w.box(D.x1 - 7, 0, -9.7, 4, 2.6, 0.08, '#bfe6ff');

  // ---------- Lookout hill ----------
  const topY = terrainY(HILL.x, HILL.z);
  w.cyl(HILL.x, topY - 0.3, HILL.z, 6.5, 0.6, '#b98a5f');
  w.b.add(new THREE.TorusGeometry(6.4, 0.08, 6, 64), '#8d5b3a', { x: HILL.x, y: topY + 1.1, z: HILL.z }, { rot: { x: Math.PI / 2, y: 0, z: 0 } });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; w.cyl(HILL.x + Math.cos(a) * 6.4, topY, HILL.z + Math.sin(a) * 6.4, 0.07, 1.1, '#8d5b3a'); }
  // Telescope facing the town
  w.cyl(HILL.x + 3, topY, HILL.z + 3.5, 0.08, 1.2, '#3a3d48');
  w.b.add(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 16), '#d4a24c', { x: HILL.x + 3, y: topY + 1.35, z: HILL.z + 3.9 }, { rot: { x: 1.2, y: 0, z: 0 } });
  // Flag with the JAS logo
  w.cyl(HILL.x - 2.5, topY, HILL.z - 2.5, 0.08, 7, '#e8e8ee');
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6, 12, 4), new THREE.MeshStandardMaterial({ map: w.tex.logo, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(HILL.x - 2.5 + 1.3, topY + 6.1, HILL.z - 2.5);
  w.group.add(flag);
  const fp = flag.geometry.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(fp.array as Float32Array);
  runtime.push((_dt, _g, t) => {
    for (let i = 0; i < fp.count; i++) {
      const x = base[i * 3] + 1.3;
      fp.setZ(i, Math.sin(x * 2.2 - t * 5) * 0.15 * x);
    }
    fp.needsUpdate = true;
  });
  w.bench(HILL.x - 3.5, HILL.z + 3.5, Math.PI * 0.75);
  w.spot('lookout', HILL.x, HILL.z + 3, { x: HILL.x, z: HILL.z + 4.2, face: 0 }, 3);
  // Trees and wildflowers on the slopes
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * (HILL.r - 8);
    const x = HILL.x + Math.cos(a) * r, z = HILL.z + Math.sin(a) * r / 1.1;
    const pathT = ((a + Math.PI) / (Math.PI * 2));
    let onPath = false;
    for (let k = -1; k <= 2; k++) { const tt = (pathT + k) / 2.2; if (tt >= 0 && tt <= 1 && Math.abs(r - (HILL.r - 2 - tt * (HILL.r - 6))) < 3) onPath = true; }
    if (onPath) continue;
    if (i % 3 === 0) w.tree(x, z, 0.9 + Math.random() * 0.5, Math.random() < 0.4 ? 'pine' : 'round', true, terrainY(x, z));
    else {
      const y = terrainY(x, z);
      const c = ['#ff8fb1', '#ffd166', '#ffffff', '#c792ea'][i % 4];
      for (let f = 0; f < 5; f++) w.sph(x + (Math.random() - 0.5) * 2, y + 0.15, z + (Math.random() - 0.5) * 2, 0.1, c, 0.8, 'solid', true);
    }
  }

  // ---------- Marina: pier, boats, lighthouse ----------
  const P = PIER;
  for (let x = P.x0; x <= P.x1; x += 1.2) w.box(x, P.y - 0.15, (P.z0 + P.z1) / 2, 1.1, 0.15, P.z1 - P.z0, x % 2.4 < 1.2 ? '#b98a5f' : '#a97c52');
  for (let x = P.x0 + 2; x <= P.x1; x += 4) for (const z of [P.z0 + 0.3, P.z1 - 0.3]) w.cyl(x, -2, z, 0.18, P.y + 2.9, '#6b4a33');
  for (const z of [P.z0 + 0.1, P.z1 - 0.1]) w.box((P.x0 + P.x1) / 2 + 2, P.y + 0.9, z, P.x1 - P.x0 - 4, 0.08, 0.08, '#e8e1d6');
  for (let x = P.x0 + 6; x <= P.x1 - 4; x += 16) { w.lamp(x, P.z0 + 0.4, 0); }
  // Lighthouse at the end of the pier
  const lx = P.x1 + 4, lz = (P.z0 + P.z1) / 2;
  w.cyl(lx, -2, lz, 3.4, 3, '#8f8a82');
  for (let i = 0; i < 6; i++) w.b.add(new THREE.CylinderGeometry(1.9 - i * 0.12, 2.0 - i * 0.12, 3, 24), i % 2 ? '#ffffff' : '#e05a52', { x: lx, y: 1 + i * 3 + 1.5, z: lz });
  w.cyl(lx, 19, lz, 1.4, 0.3, '#3a3d48');
  w.cyl(lx, 19.3, lz, 0.9, 1.6, '#fff4c2', 'glow');
  w.cone(lx, 20.9, lz, 1.3, 1.4, '#3a3d48');
  w.col.circle(lx, lz, 3.4);
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff1c4', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beams = new THREE.Group();
  for (const s of [1, -1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 70, 24, 1, true), beamMat);
    cone.rotation.z = s * Math.PI / 2;
    cone.position.x = s * 35;
    beams.add(cone);
  }
  beams.position.set(lx, 20, lz);
  scene.add(beams);
  runtime.push((dt, glow) => { beams.rotation.y += dt * 0.6; beamMat.opacity = glow * 0.16; beams.visible = glow > 0.05; });
  // Boats bobbing by the pier
  const boats: THREE.Group[] = [];
  const hullCols = ['#ffffff', '#5a2f2d', '#7fb6d6', '#ffd166'];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.8, 5.5, 12, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: hullCols[i % 4], roughness: 0.4 }));
    hull.rotation.set(Math.PI / 2, 0, Math.PI);
    g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 5.2), new THREE.MeshStandardMaterial({ color: '#c9955f' }));
    deck.position.y = 0.05; g.add(deck);
    if (i % 2 === 0) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 8), new THREE.MeshStandardMaterial({ color: '#e8e8ee' }));
      mast.position.y = 3.5; g.add(mast);
      const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.8, -0.2), new THREE.Vector3(0, 6.8, -0.2), new THREE.Vector3(0, 0.8, -2.4)]), new THREE.MeshStandardMaterial({ color: '#fffaf0', side: THREE.DoubleSide }));
      sail.geometry.computeVertexNormals(); g.add(sail);
    } else {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 2), new THREE.MeshStandardMaterial({ color: '#f3f1ee' }));
      cab.position.set(0, 0.6, -0.4); g.add(cab);
    }
    g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    const side = i % 2 ? 1 : -1;
    g.position.set(P.x0 + 20 + i * 7, 0.2, side > 0 ? P.z1 + 3 : P.z0 - 3);
    g.userData.ph = Math.random() * 6;
    scene.add(g);
    boats.push(g);
    w.col.circle(g.position.x, g.position.z, 1.6);
  }
  runtime.push((_dt, _g, t) => {
    for (const b of boats) {
      const ph = b.userData.ph as number;
      b.position.y = 0.15 + Math.sin(t * 1.3 + ph) * 0.12;
      b.rotation.z = Math.sin(t * 1.1 + ph) * 0.05;
      b.rotation.x = Math.sin(t * 0.9 + ph) * 0.03;
    }
  });
  // Marina promenade: palms and a snack kiosk along the south beach
  for (let z = 70; z < 145; z += 12) w.palm(BEACH_X + 1 + Math.random() * 2, z, 1 + Math.random() * 0.3);
  w.box(BEACH_X - 1, 0, 108, 4, 2.6, 3, '#7fd6c2', { r: 0.15 });
  w.box(BEACH_X - 1, 2.6, 108, 4.6, 0.3, 3.6, '#ffffff', { r: 0.1 });
  w.col.box(BEACH_X - 1, 108, 4, 3);
  void SEA_X;

  return { update: (dt, glow, t) => runtime.forEach((f) => f(dt, glow, t)) };
}
