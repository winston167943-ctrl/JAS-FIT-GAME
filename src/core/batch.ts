import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Collects static props and merges them into a handful of draw calls.
 * Each piece keeps its own color through a vertex-color attribute, so the
 * whole town renders with ~3 materials instead of hundreds of meshes.
 */
export type Bucket = 'solid' | 'ground' | 'glow';

const tmpColor = new THREE.Color();

export class StaticBatcher {
  private pieces: Record<Bucket, THREE.BufferGeometry[]> = { solid: [], ground: [], glow: [] };

  add(
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    position: THREE.Vector3Like,
    opts: { rot?: THREE.Vector3Like; scale?: THREE.Vector3Like | number; bucket?: Bucket } = {},
  ): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (opts.rot) q.setFromEuler(new THREE.Euler(opts.rot.x, opts.rot.y, opts.rot.z));
    const s = opts.scale === undefined ? new THREE.Vector3(1, 1, 1)
      : typeof opts.scale === 'number' ? new THREE.Vector3(opts.scale, opts.scale, opts.scale)
      : new THREE.Vector3(opts.scale.x, opts.scale.y, opts.scale.z);
    m.compose(new THREE.Vector3(position.x, position.y, position.z), q, s);
    g.applyMatrix4(m);
    tmpColor.set(color);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = tmpColor.r; cols[i * 3 + 1] = tmpColor.g; cols[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.pieces[opts.bucket ?? 'solid'].push(g);
  }

  /** Adds an already-colored geometry (vertex colors present) as-is. */
  addColored(g: THREE.BufferGeometry, bucket: Bucket = 'solid'): void {
    this.pieces[bucket].push(g.index ? g.toNonIndexed() : g);
  }

  build(parent: THREE.Object3D, glowMaterial: THREE.Material): void {
    const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const make = (list: THREE.BufferGeometry[], mat: THREE.Material, cast: boolean, receive: boolean) => {
      // Split into chunks so a single draw never exceeds a sane vertex count.
      const CHUNK = 60;
      for (let i = 0; i < list.length; i += CHUNK) {
        const merged = mergeGeometries(list.slice(i, i + CHUNK), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
      }
    };
    make(this.pieces.ground, groundMat, false, true);
    make(this.pieces.solid, solidMat, true, true);
    make(this.pieces.glow, glowMaterial, false, false);
    this.pieces = { solid: [], ground: [], glow: [] };
  }
}

/** Standard material whose emissive light is tinted by the vertex color. */
export function makeGlowMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0x000000 });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;',
      'vec3 totalEmissiveRadiance = emissive * vColor.rgb;',
    );
  };
  return mat;
}
