import * as THREE from 'three';
import { B, COLORS, TRANSPARENT, NON_SOLID, HARDNESS } from './blocks.js';
import { hash3 } from './util.js';

export const CS = 32; // chunk size in x/z

export class World {
  constructor(W, H, D) {
    this.W = W; this.H = H; this.D = D;
    this.data = new Uint8Array(W * H * D);
    this.cx = W / CS; this.cz = D / CS;
    this.dirty = new Set();
    this.onBlockChanged = null;
  }
  idx(x, y, z) { return (y * this.D + z) * this.W + x; }
  inBounds(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < this.W && z < this.D && y < this.H; }
  get(x, y, z) {
    if (x < 0 || z < 0 || x >= this.W || z >= this.D) return B.AIR;
    if (y < 0) return B.STONE;
    if (y >= this.H) return B.AIR;
    return this.data[(y * this.D + z) * this.W + x];
  }
  set(x, y, z, t, dirty = true) {
    if (!this.inBounds(x, y, z)) return;
    const i = (y * this.D + z) * this.W + x;
    if (this.data[i] === t) return;
    this.data[i] = t;
    if (dirty) this.markDirty(x, z);
  }
  fill(x0, y0, z0, x1, y1, z1, t, dirty = false) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); y0 = Math.max(0, y0);
    x1 = Math.min(this.W - 1, x1); z1 = Math.min(this.D - 1, z1); y1 = Math.min(this.H - 1, y1);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const base = (y * this.D + z) * this.W;
      this.data.fill(t, base + x0, base + x1 + 1);
    }
    if (dirty) for (let x = x0; x <= x1; x += CS) for (let z = z0; z <= z1; z += CS) this.markDirty(x, z);
  }
  // hollow box: walls of thickness 1 (all 6 sides)
  shell(x0, y0, z0, x1, y1, z1, t) {
    this.fill(x0, y0, z0, x1, y1, z1, t);
    if (x1 - x0 >= 2 && z1 - z0 >= 2 && y1 - y0 >= 2) this.fill(x0 + 1, y0 + 1, z0 + 1, x1 - 1, y1 - 1, z1 - 1, B.AIR);
  }
  // vertical walls only (no floor/ceiling)
  walls(x0, y0, z0, x1, y1, z1, t) {
    this.fill(x0, y0, z0, x1, y1, z0, t); this.fill(x0, y0, z1, x1, y1, z1, t);
    this.fill(x0, y0, z0, x0, y1, z1, t); this.fill(x1, y0, z0, x1, y1, z1, t);
  }
  isSolid(x, y, z) { return !NON_SOLID[this.get(Math.floor(x), Math.floor(y), Math.floor(z))]; }
  // top solid surface: returns y at which an entity would stand (above topmost solid block)
  heightAt(x, z, from = this.H - 1) {
    x = Math.floor(x); z = Math.floor(z);
    for (let y = Math.min(from, this.H - 1); y >= 0; y--) {
      if (!NON_SOLID[this.get(x, y, z)]) return y + 1;
    }
    return 0;
  }
  // ground under a point, searching downward up to `maxDrop`, allowing standing inside buildings
  groundBelow(x, y, z, maxDrop = 8) {
    const xi = Math.floor(x), zi = Math.floor(z);
    let yi = Math.floor(y);
    // if we're inside a solid block, go up
    let up = 0;
    while (!NON_SOLID[this.get(xi, yi, zi)] && up < 4) { yi++; up++; }
    for (let d = 0; d < maxDrop; d++) {
      if (!NON_SOLID[this.get(xi, yi - 1, zi)]) return yi;
      yi--;
    }
    return null;
  }
  markDirty(x, z) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    this.dirty.add(cx + cz * this.cx);
    const lx = x - cx * CS, lz = z - cz * CS;
    if (lx === 0 && cx > 0) this.dirty.add(cx - 1 + cz * this.cx);
    if (lx === CS - 1 && cx < this.cx - 1) this.dirty.add(cx + 1 + cz * this.cx);
    if (lz === 0 && cz > 0) this.dirty.add(cx + (cz - 1) * this.cx);
    if (lz === CS - 1 && cz < this.cz - 1) this.dirty.add(cx + (cz + 1) * this.cx);
  }
  // spherical destruction; returns list of destroyed [x,y,z,type]
  explode(cx, cy, cz, r, power = 1) {
    const out = [];
    const R = Math.ceil(r);
    const x0 = Math.floor(cx), y0 = Math.floor(cy), z0 = Math.floor(cz);
    for (let x = x0 - R; x <= x0 + R; x++) for (let y = Math.max(1, y0 - R); y <= y0 + R; y++) for (let z = z0 - R; z <= z0 + R; z++) {
      if (!this.inBounds(x, y, z)) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
      if (d > r) continue;
      const t = this.data[this.idx(x, y, z)];
      if (t === B.AIR || t === B.WATER) continue;
      const strength = power * (1 - d / r) * 1.6 + hash3(x, y, z) * 0.5;
      if (strength < HARDNESS[t] * 0.45) continue;
      if (y <= 2) continue;
      out.push([x, y, z, t]);
      this.data[this.idx(x, y, z)] = B.AIR;
      this.markDirty(x, z);
    }
    if (out.length && this.onBlockChanged) this.onBlockChanged(out);
    return out;
  }
  // Ray march through voxels. Returns {x,y,z,type,dist,nx,ny,nz} or null
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 100, skip = NON_SOLID) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx > 0 ? (x + 1 - ox) * tDeltaX : dx < 0 ? (ox - x) * tDeltaX : Infinity;
    let tMaxY = dy > 0 ? (y + 1 - oy) * tDeltaY : dy < 0 ? (oy - y) * tDeltaY : Infinity;
    let tMaxZ = dz > 0 ? (z + 1 - oz) * tDeltaZ : dz < 0 ? (oz - z) * tDeltaZ : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 1000; i++) {
      const b = this.get(x, y, z);
      if (!skip[b] && b !== B.AIR) return { x, y, z, type: b, dist: t, nx, ny, nz };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
      else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
      if (t > maxDist) return null;
      if (y < 0 || y >= this.H) return null;
    }
    return null;
  }
}

// ---------- Meshing ----------
const DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const FACE_SHADE = [0.82, 0.78, 1.0, 0.5, 0.72, 0.68];
const AO_CURVE = [0.45, 0.65, 0.82, 1.0];

// per direction: normal axis a, tangent axes u,v as unit vectors (ux,uy,uz), (vx,vy,vz)
const AXIS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const FACE = DIRS.map((dir, d) => {
  const a = d >> 1, u = (a + 1) % 3, v = (a + 2) % 3;
  return { dx: dir[0], dy: dir[1], dz: dir[2], positive: (d & 1) === 0, U: AXIS[u], V: AXIS[v], shade: FACE_SHADE[d] };
});
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const aos = [0, 0, 0, 0];

export function buildChunkGeometry(world, cx, cz) {
  const opaque = { pos: [], col: [], nor: [], idx: [], n: 0 };
  const trans = { pos: [], col: [], nor: [], idx: [], n: 0 };
  const x0 = cx * CS, z0 = cz * CS;
  const { W, D, H, data } = world;
  const get = (x, y, z) => {
    if (x < 0 || z < 0 || x >= W || z >= D) return B.AIR;
    if (y < 0) return B.STONE;
    if (y >= H) return B.AIR;
    return data[(y * D + z) * W + x];
  };
  const occl = (x, y, z) => { const t = get(x, y, z); return t !== B.AIR && !TRANSPARENT[t] ? 1 : 0; };

  // find the highest non-air block in this chunk to skip empty sky rows
  let maxY = 0;
  for (let y = H - 1; y > 0 && maxY === 0; y--) {
    for (let z = z0; z < z0 + CS && maxY === 0; z++) {
      const rowBase = (y * D + z) * W;
      for (let x = x0; x < x0 + CS; x++) if (data[rowBase + x] !== B.AIR) { maxY = y; break; }
    }
  }

  for (let y = 0; y <= maxY; y++) for (let z = z0; z < z0 + CS; z++) {
    const rowBase = (y * D + z) * W;
    for (let x = x0; x < x0 + CS; x++) {
      const t = data[rowBase + x];
      if (t === B.AIR) continue;
      const isT = TRANSPARENT[t] === 1;
      const target = isT ? trans : opaque;
      const baseCol = COLORS[t];
      const jit = t === B.WATER ? 1 : 0.92 + hash3(x, y, z) * 0.16;
      for (let d = 0; d < 6; d++) {
        const F = FACE[d];
        const nxp = x + F.dx, nyp = y + F.dy, nzp = z + F.dz;
        const nb = get(nxp, nyp, nzp);
        if (isT) { if (nb === t || (nb !== B.AIR && !TRANSPARENT[nb])) continue; }
        else if (nb !== B.AIR && !TRANSPARENT[nb]) continue;
        const U = F.U, V = F.V;
        if (isT) { aos[0] = aos[1] = aos[2] = aos[3] = 3; }
        else {
          for (let k = 0; k < 4; k++) {
            const su = CORNERS[k][0] ? 1 : -1, sv = CORNERS[k][1] ? 1 : -1;
            const o1 = occl(nxp + U[0] * su, nyp + U[1] * su, nzp + U[2] * su);
            const o2 = occl(nxp + V[0] * sv, nyp + V[1] * sv, nzp + V[2] * sv);
            const oc = occl(nxp + U[0] * su + V[0] * sv, nyp + U[1] * su + V[1] * sv, nzp + U[2] * su + V[2] * sv);
            aos[k] = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
          }
        }
        const vi = target.n;
        const ox = x + (F.positive && F.dx ? 1 : 0), oy = y + (F.positive && F.dy ? 1 : 0), oz = z + (F.positive && F.dz ? 1 : 0);
        const pos = target.pos, col = target.col, nor = target.nor;
        for (let k = 0; k < 4; k++) {
          const cu = CORNERS[k][0], cv = CORNERS[k][1];
          pos.push(ox + U[0] * cu + V[0] * cv, oy + U[1] * cu + V[1] * cv, oz + U[2] * cu + V[2] * cv);
          nor.push(F.dx, F.dy, F.dz);
          const l = F.shade * AO_CURVE[aos[k]] * jit;
          col.push(baseCol[0] * l, baseCol[1] * l, baseCol[2] * l);
        }
        const flip = aos[0] + aos[2] < aos[1] + aos[3];
        const idx = target.idx;
        if (F.positive) {
          if (flip) idx.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
          else idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
        } else {
          if (flip) idx.push(vi + 1, vi + 3, vi + 2, vi + 1, vi, vi + 3);
          else idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
        }
        target.n += 4;
      }
    }
  }
  const mk = (b) => {
    if (b.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setIndex(b.n > 65000 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
    g.computeBoundingSphere();
    return g;
  };
  return { opaque: mk(opaque), trans: mk(trans) };
}

export class ChunkRenderer {
  constructor(world, scene) {
    this.world = world; this.scene = scene;
    this.matO = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matT = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false });
    this.meshes = new Map(); // key -> {o, t}
  }
  rebuild(key) {
    const cx = key % this.world.cx, cz = Math.floor(key / this.world.cx);
    const old = this.meshes.get(key);
    if (old) {
      if (old.o) { this.scene.remove(old.o); old.o.geometry.dispose(); }
      if (old.t) { this.scene.remove(old.t); old.t.geometry.dispose(); }
    }
    const g = buildChunkGeometry(this.world, cx, cz);
    const rec = { o: null, t: null };
    if (g.opaque) { rec.o = new THREE.Mesh(g.opaque, this.matO); rec.o.frustumCulled = true; this.scene.add(rec.o); }
    if (g.trans) { rec.t = new THREE.Mesh(g.trans, this.matT); this.scene.add(rec.t); }
    this.meshes.set(key, rec);
  }
  update(budgetMs = 6) {
    if (this.world.dirty.size === 0) return;
    const t0 = performance.now();
    for (const key of this.world.dirty) {
      this.rebuild(key);
      this.world.dirty.delete(key);
      if (performance.now() - t0 > budgetMs) break;
    }
  }
}
