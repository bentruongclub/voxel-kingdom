import * as THREE from 'three';
import { COLORS } from './blocks.js';

const MAX = 6000;

export class Particles {
  constructor(scene, world) {
    this.world = world;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.color = new THREE.Color();
    this.mat4 = new THREE.Matrix4();
    this.px = new Float32Array(MAX); this.py = new Float32Array(MAX); this.pz = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX); this.vz = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX); this.size = new Float32Array(MAX);
    this.kind = new Uint8Array(MAX); // 0 debris, 1 fire, 2 smoke, 3 spark
    this.cr = new Float32Array(MAX); this.cg = new Float32Array(MAX); this.cb = new Float32Array(MAX);
    this.count = 0;
    scene.add(this.mesh);
    this.mesh.count = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, size, kind, r, g, b) {
    let i;
    if (this.count < MAX) i = this.count++;
    else i = Math.floor(Math.random() * MAX);
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.kind[i] = kind;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b;
  }
  debris(x, y, z, type, n = 3) {
    const c = COLORS[type] || [0.5, 0.5, 0.5];
    for (let k = 0; k < n; k++) {
      const s = 0.9 + Math.random() * 0.3;
      this.spawn(x + Math.random(), y + Math.random(), z + Math.random(), (Math.random() - 0.5) * 9, Math.random() * 9 + 2, (Math.random() - 0.5) * 9, 1.5 + Math.random() * 2, 0.25 + Math.random() * 0.3, 0, c[0] * s, c[1] * s, c[2] * s);
    }
  }
  explosion(x, y, z, r) {
    for (let k = 0; k < 40 * r; k++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, sp = Math.random() * 6 * r;
      this.spawn(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.abs(Math.sin(e)) * sp + 2, Math.sin(a) * Math.cos(e) * sp, 0.6 + Math.random() * 0.6, 0.5 + Math.random() * r * 0.4, 1, 1, 0.5 + Math.random() * 0.4, 0.1);
    }
    for (let k = 0; k < 20 * r; k++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * 2 * r;
      this.spawn(x, y, z, Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp, 2 + Math.random() * 2, 0.8 + Math.random() * r * 0.4, 2, 0.25, 0.23, 0.22);
    }
  }
  fire(x, y, z, vx, vy, vz, n = 2, size = 0.5) {
    for (let k = 0; k < n; k++) {
      const j = 1.5;
      this.spawn(x, y, z, vx + (Math.random() - 0.5) * j, vy + (Math.random() - 0.5) * j, vz + (Math.random() - 0.5) * j, 0.5 + Math.random() * 0.7, size * (0.6 + Math.random() * 0.8), 1, 1, 0.55 + Math.random() * 0.4, 0.1);
    }
  }
  smoke(x, y, z, size = 0.6) {
    this.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 1 + Math.random(), (Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 1.5, size, 2, 0.3, 0.3, 0.32);
  }
  update(dt) {
    const w = this.world;
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      let l = this.life[i] - dt;
      if (l <= 0) { // swap with last
        const j = --this.count;
        if (i !== j) {
          this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.size[i] = this.size[j]; this.kind[i] = this.kind[j];
          this.cr[i] = this.cr[j]; this.cg[i] = this.cg[j]; this.cb[i] = this.cb[j];
        }
        i--; continue;
      }
      this.life[i] = l;
      const k = this.kind[i];
      if (k === 0) {
        this.vy[i] -= 22 * dt;
        const nx = this.px[i] + this.vx[i] * dt, ny = this.py[i] + this.vy[i] * dt, nz = this.pz[i] + this.vz[i] * dt;
        if (w.isSolid(nx, ny, nz)) { this.vy[i] *= -0.35; this.vx[i] *= 0.5; this.vz[i] *= 0.5; if (Math.abs(this.vy[i]) < 1) { this.vy[i] = 0; } }
        else { this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz; }
      } else if (k === 1) {
        this.vy[i] += 6 * dt; this.vx[i] *= (1 - 2 * dt); this.vz[i] *= (1 - 2 * dt);
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      } else {
        this.vy[i] += 1.5 * dt; this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      }
      alive++;
    }
    // write matrices & colors
    const m = this.mat4;
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / this.maxLife[i];
      let s = this.size[i];
      let r = this.cr[i], g = this.cg[i], b = this.cb[i];
      if (this.kind[i] === 1) { s *= 0.4 + t; r = Math.min(1, 1.2 * t + 0.3); g = g * t * t; b = b * t; }
      else if (this.kind[i] === 2) { s *= 1.6 - t; const f = 0.5 + t * 0.5; r *= f; g *= f; b *= f; }
      else s *= Math.min(1, t * 3);
      m.makeScale(s, s, s); m.setPosition(this.px[i], this.py[i], this.pz[i]);
      this.mesh.setMatrixAt(i, m);
      this.color.setRGB(r, g, b);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
