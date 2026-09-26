/** Shared map layout — used by the world builder, traffic, mini-map and fast-travel. */
export const RING = { x0: -60, x1: 60, z0: -50, z1: 50, w: 9 };
export const MID_Z = 0;

export const HOUSE = { x0: -40, x1: -22, z0: -34, z1: -21 };
export const GYM = { x0: 18, x1: 42, z0: -34, z1: -19 };
export const CAFE = { x: 32, z: 27, w: 11, d: 5 };
export const TRACK = { x: -25, z: 25, rx: 17, rz: 12, width: 3.6 };
export const POND = { x: -25, z: 25, rx: 6.5, rz: 4 };
export const BEACH_X = 70;
export const SEA_X = 80;

export interface Place { id: string; name: string; emoji: string; x: number; z: number }
export const PLACES: Place[] = [
  { id: 'home', name: 'הבית', emoji: '🏡', x: -31, z: -17 },
  { id: 'gym', name: 'חדר הכושר', emoji: '🏋️‍♀️', x: 30, z: -15 },
  { id: 'park', name: 'הפארק והמסלול', emoji: '🌳', x: -25, z: 9.5 },
  { id: 'cafe', name: 'בית הקפה', emoji: '☕', x: 32, z: 17 },
  { id: 'beach', name: 'החוף', emoji: '🏖️', x: 74, z: 0 },
  { id: 'downtown', name: 'מרכז העיר', emoji: '🏙️', x: -122, z: 8 },
  { id: 'hill', name: 'גבעת התצפית', emoji: '⛰️', x: 0, z: -92 },
  { id: 'marina', name: 'המרינה', emoji: '⛵', x: 72, z: 92 },
];

/** The whole playable area. */
export const EXT = { x0: -200, x1: 126, z0: -160, z1: 150 };
/** Downtown district (its own ring road + avenue). */
export const DOWNTOWN = { x0: -190, x1: -100, z0: -60, z1: 60, ax: -145, w: 9 };
export const HILL = { x: 0, z: -125, r: 40, h: 15 };
export const PIER = { x0: 66, x1: 118, z0: 96, z1: 101, y: 0.9 };

/** Ground height (hill, pier deck). Everything that walks uses this. */
export function terrainY(x: number, z: number): number {
  if (x >= PIER.x0 && x <= PIER.x1 && z >= PIER.z0 && z <= PIER.z1) return PIER.y;
  const d = Math.hypot(x - HILL.x, (z - HILL.z) * 1.1);
  if (d < HILL.r) { const k = Math.cos((d / HILL.r) * Math.PI) * 0.5 + 0.5; return HILL.h * k * k * (3 - 2 * k); }
  return 0;
}

/** True where Yasmin is in deep enough water to swim. */
export function inSea(x: number, z: number): boolean {
  if (x >= PIER.x0 && x <= PIER.x1 && z >= PIER.z0 - 0.3 && z <= PIER.z1 + 0.3) return false;
  return x > SEA_X + 2.2;
}

/** Rough "is this a lawn" test used to scatter grass blades. */
export function isLawn(x: number, z: number): boolean {
  if (x > BEACH_X - 7 || x < EXT.x0 || z < EXT.z0 || z > EXT.z1) return false;
  const onRect = (x0: number, x1: number, z0: number, z1: number, w: number) =>
    (Math.abs(z - z0) < w || Math.abs(z - z1) < w) && x > x0 - w && x < x1 + w || (Math.abs(x - x0) < w || Math.abs(x - x1) < w) && z > z0 - w && z < z1 + w;
  if (onRect(RING.x0, RING.x1, RING.z0, RING.z1, 7.2)) return false;
  if (Math.abs(z) < 7.2 && x > DOWNTOWN.x0 - 8 && x < RING.x1 + 7) return false;
  if (x > DOWNTOWN.x0 - 8 && x < DOWNTOWN.x1 + 8 && z > DOWNTOWN.z0 - 8 && z < DOWNTOWN.z1 + 8) return false;
  if (Math.abs(x) < 5 && z < RING.z0 && z > -98) return false;
  if (x > HOUSE.x0 - 1 && x < HOUSE.x1 + 1 && z > HOUSE.z0 - 1 && z < HOUSE.z1 + 1) return false;
  if (x > GYM.x0 - 1 && x < GYM.x1 + 1 && z > GYM.z0 - 1 && z < GYM.z1 + 4) return false;
  if (Math.abs(x - CAFE.x) < 9 && z > 14 && z < 31) return false;
  if (Math.hypot((x - TRACK.x) / (TRACK.rx + 0.8), (z - TRACK.z) / (TRACK.rz + 0.8)) < 1 && Math.hypot((x - TRACK.x) / (TRACK.rx - TRACK.width - 0.3), (z - TRACK.z) / (TRACK.rz - TRACK.width - 0.3)) > 1) return false;
  if (Math.hypot((x - POND.x) / (POND.rx + 1), (z - POND.z) / (POND.rz + 1)) < 1) return false;
  if (Math.abs(x) < 9 && z > -39 && z < -13) return false;
  if (Math.abs(x - 8) < 5 && Math.abs(z - 12) < 3) return false;
  if (x > -34 && x < -29 && z > -22 && z < -6) return false; // garden path
  if (z > -38 && z < -6 && (x < -44 || x > -18) && Math.abs(z + 7.6) < 1) return false;
  return true;
}

/** Returns the point on the running track's center line at angle `a`. */
export function trackPoint(a: number): { x: number; z: number } {
  const r = TRACK.rx - TRACK.width / 2, rz = TRACK.rz - TRACK.width / 2;
  return { x: TRACK.x + Math.cos(a) * r, z: TRACK.z + Math.sin(a) * rz };
}
