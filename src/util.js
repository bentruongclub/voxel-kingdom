export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = mulberry32(1337);
export const rand = (a = 0, b = 1) => a + rng() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hash3(x, y, z) {
  let h = (x * 374761393 + y * 1103515245 + z * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  const u = smooth(xf), v = smooth(zf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x, z, octaves = 4) {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * f + i * 17.3, z * f - i * 9.1) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

export const FIRST_NAMES = ['Aldric', 'Bertha', 'Cedric', 'Dunstan', 'Edith', 'Godfrey', 'Hilda', 'Isolde', 'Jorund', 'Katla', 'Leofric', 'Maud', 'Nyle', 'Osric', 'Piers', 'Rowena', 'Sigrun', 'Tancred', 'Ulf', 'Wynne', 'Ymma', 'Alric', 'Brand', 'Cwen', 'Dagny', 'Eadric', 'Frida', 'Gunnar', 'Hrothgar', 'Ingrid', 'Kenric', 'Leif', 'Merewyn', 'Oswin', 'Ragna', 'Sunniva', 'Torvald', 'Wulfric'];
export const SURNAMES = ['Cooper', 'Fletcher', 'Thatcher', 'Baker', 'Smith', 'Miller', 'Wright', 'Tanner', 'Mason', 'Ward', 'Brewer', 'Hollowell', 'Ashdown', 'Blackwood', 'Greymere', 'Stonebridge', 'Redfern', 'Underhill', 'Wexley', 'Harrow'];
export const randomName = () => `${pick(FIRST_NAMES)} ${pick(SURNAMES)}`;
