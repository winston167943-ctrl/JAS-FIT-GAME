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
];

/** Returns the point on the running track's center line at angle `a`. */
export function trackPoint(a: number): { x: number; z: number } {
  const r = TRACK.rx - TRACK.width / 2, rz = TRACK.rz - TRACK.width / 2;
  return { x: TRACK.x + Math.cos(a) * r, z: TRACK.z + Math.sin(a) * rz };
}
