import * as THREE from 'three';

/** Simple 2D (XZ-plane) collision world: axis-aligned boxes and circles. */
interface Box { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number }
interface Circle { kind: 'circle'; x: number; z: number; r: number }
type Collider = Box | Circle;

export class CollisionWorld {
  private colliders: Collider[] = [];
  bounds = { x0: -95, x1: 95, z0: -95, z1: 95 };

  box(cx: number, cz: number, w: number, d: number): void {
    this.colliders.push({ kind: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  }

  circle(x: number, z: number, r: number): void {
    this.colliders.push({ kind: 'circle', x, z, r });
  }

  /** Pushes a circle at `p` out of every collider. Returns true if it hit something. */
  resolve(p: THREE.Vector3, r: number): boolean {
    let hit = false;
    for (const c of this.colliders) {
      if (c.kind === 'box') {
        const nx = Math.max(c.minX, Math.min(p.x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
        let dx = p.x - nx;
        let dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          hit = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x = nx + (dx / d) * r;
            p.z = nz + (dz / d) * r;
          } else {
            // Center is inside the box: push out along the shallowest axis.
            const left = p.x - c.minX, right = c.maxX - p.x, top = p.z - c.minZ, bottom = c.maxZ - p.z;
            const m = Math.min(left, right, top, bottom);
            if (m === left) p.x = c.minX - r; else if (m === right) p.x = c.maxX + r;
            else if (m === top) p.z = c.minZ - r; else p.z = c.maxZ + r;
          }
        }
      } else {
        const dx = p.x - c.x, dz = p.z - c.z;
        const d2 = dx * dx + dz * dz;
        const rr = r + c.r;
        if (d2 < rr * rr && d2 > 1e-8) {
          hit = true;
          const d = Math.sqrt(d2);
          p.x = c.x + (dx / d) * rr;
          p.z = c.z + (dz / d) * rr;
        }
      }
    }
    const b = this.bounds;
    if (p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) {
      hit = true;
      p.x = Math.max(b.x0, Math.min(b.x1, p.x));
      p.z = Math.max(b.z0, Math.min(b.z1, p.z));
    }
    return hit;
  }
}
