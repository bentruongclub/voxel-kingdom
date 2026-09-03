import { B, FLAMMABLE } from './blocks.js';

const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 0], [-1, 1, 0]];

export class FireSystem {
  constructor(world, particles) {
    this.world = world; this.particles = particles;
    this.burning = new Map(); // key -> {x,y,z,ttl,under}
    this.acc = 0;
    this.onBurnt = null;
    this.maxBurning = 2200;
  }
  key(x, y, z) { return (y * this.world.D + z) * this.world.W + x; }
  ignite(x, y, z, ttl = 6) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (!this.world.inBounds(x, y, z)) return false;
    const k = this.key(x, y, z);
    if (this.burning.has(k)) return false;
    if (this.burning.size >= this.maxBurning) return false;
    const t = this.world.get(x, y, z);
    if (t === B.FIRE) return false;
    if (FLAMMABLE[t]) {
      this.world.set(x, y, z, B.FIRE);
      this.burning.set(k, { x, y, z, ttl: ttl + Math.random() * 6, under: t });
      return true;
    }
    if (t === B.AIR) {
      const below = this.world.get(x, y - 1, z);
      if (below === B.AIR || below === B.WATER) return false;
      this.world.set(x, y, z, B.FIRE);
      this.burning.set(k, { x, y, z, ttl: FLAMMABLE[below] ? ttl : 1.5, under: B.AIR });
      return true;
    }
    return false;
  }
  isBurning(x, y, z) { return this.burning.has(this.key(Math.floor(x), Math.floor(y), Math.floor(z))); }
  update(dt) {
    this.acc += dt;
    if (this.acc < 0.25) return;
    const step = this.acc; this.acc = 0;
    const w = this.world;
    const toRemove = [];
    const spreadBudget = this.burning.size < this.maxBurning * 0.8;
    for (const [k, f] of this.burning) {
      f.ttl -= step;
      if (w.get(f.x, f.y, f.z) !== B.FIRE) { toRemove.push(k); continue; }
      if (Math.random() < 0.5) this.particles.fire(f.x + 0.5, f.y + 0.8, f.z + 0.5, 0, 2.5, 0, 1, 0.45);
      if (Math.random() < 0.15) this.particles.smoke(f.x + 0.5, f.y + 1.2, f.z + 0.5, 0.7);
      if (spreadBudget && Math.random() < 0.28) {
        const d = NB[Math.floor(Math.random() * NB.length)];
        const nx = f.x + d[0], ny = f.y + d[1], nz = f.z + d[2];
        const t = w.get(nx, ny, nz);
        if (FLAMMABLE[t]) this.ignite(nx, ny, nz);
        else if (t === B.AIR && Math.random() < 0.3) {
          // fire creeps across flammable surfaces
          if (FLAMMABLE[w.get(nx, ny - 1, nz)]) this.ignite(nx, ny, nz);
        }
      }
      if (f.ttl <= 0) toRemove.push(k);
    }
    for (const k of toRemove) {
      const f = this.burning.get(k);
      this.burning.delete(k);
      if (w.get(f.x, f.y, f.z) === B.FIRE) {
        const below = w.get(f.x, f.y - 1, f.z);
        const leaveAsh = f.under !== B.AIR && (below === B.DIRT || below === B.GRASS || below === B.SOIL || below === B.COBBLE || below === B.STONE || below === B.CASTLE || below === B.PLANK && Math.random() < 0.3);
        w.set(f.x, f.y, f.z, leaveAsh && Math.random() < 0.5 ? B.ASH : B.AIR);
        if (f.under !== B.AIR && this.onBurnt) this.onBurnt(f.x, f.y, f.z, f.under);
      }
    }
  }
}
