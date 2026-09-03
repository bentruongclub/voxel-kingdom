import * as THREE from 'three';
import { rand, pick, randInt } from './util.js';
import { PY, WX0, WX1 } from './worldgen.js';

const box = (w, h, d, color, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color })); m.position.set(x, y, z); return m; };

export class Dragon {
  constructor(scene, world, R, particles, fire, log) {
    this.scene = scene; this.world = world; this.R = R; this.particles = particles; this.fire = fire; this.log = log;
    this.pop = null;
    this.maxHp = 2600; this.hp = this.maxHp; this.alive = true; this.hostile = false; this.hitR = 5;
    this.pos = { x: R.roost.x, y: R.roost.y, z: R.roost.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.speed = 14;
    this.state = 'roost'; this.stateT = 0; this.passes = 0; this.breathing = false; this.breathAcc = 0; this.t = 0;
    this.name = 'Scorrath the Ashen';
    this.build();
    this.target = null; this.waypoint = { x: R.roost.x + 30, y: R.roost.y, z: R.roost.z };
    this.circleA = 0;
    this.kills = 0; this.blocksBurnt = 0;
  }
  build() {
    const g = new THREE.Group();
    const red = 0x6e1d1d, dark = 0x3a1010, belly = 0x9a6a3a, horn = 0xd8d0b0;
    g.add(box(3, 2.2, 6.5, red));
    g.add(box(2.2, 0.6, 5.5, belly, 0, -1.2, 0));
    for (let i = 0; i < 5; i++) g.add(box(0.5, 0.7, 1.0, dark, 0, 1.3, -2.5 + i * 1.2));
    // neck
    const neck = new THREE.Group(); neck.position.set(0, 0.6, 3.2); g.add(neck);
    for (let i = 0; i < 3; i++) { const s = 1.5 - i * 0.2; neck.add(box(s, s, 1.8, red, 0, i * 0.6, i * 1.5 + 0.8)); }
    const head = new THREE.Group(); head.position.set(0, 2.1, 5.6); neck.add(head);
    head.add(box(1.5, 1.3, 2.8, red, 0, 0, 0.8));
    const jaw = box(1.3, 0.4, 2.2, dark, 0, -0.75, 1.0); head.add(jaw);
    head.add(box(0.3, 0.3, 0.3, 0xffd020, -0.6, 0.3, 1.2)); head.add(box(0.3, 0.3, 0.3, 0xffd020, 0.6, 0.3, 1.2));
    const h1 = box(0.3, 1.6, 0.3, horn, -0.5, 1.1, -0.4); h1.rotation.x = -0.6; head.add(h1);
    const h2 = box(0.3, 1.6, 0.3, horn, 0.5, 1.1, -0.4); h2.rotation.x = -0.6; head.add(h2);
    this.head = head; this.jaw = jaw; this.neck = neck;
    // wings
    this.wings = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(side * 1.4, 0.8, 0.5); g.add(w);
      const bone = box(7, 0.35, 0.35, dark, side * 3.5, 0, 0); w.add(bone);
      const mem = box(7, 0.12, 4.5, 0x4a1414, side * 3.5, -0.2, -1.6); w.add(mem);
      const tip = box(4, 0.3, 0.3, dark, side * 8.5, 0, -0.5); w.add(tip);
      const mem2 = box(4, 0.12, 3.2, 0x4a1414, side * 8.5, -0.2, -1.8); w.add(mem2);
      this.wings.push(w);
    }
    // tail
    const tail = new THREE.Group(); tail.position.set(0, 0, -3.2); g.add(tail);
    this.tailSegs = [];
    let parent = tail;
    for (let i = 0; i < 6; i++) { const s = 1.4 - i * 0.18; const seg = new THREE.Group(); seg.position.z = -1.6; seg.add(box(s, s, 1.7, i % 2 ? dark : red, 0, 0, -0.8)); parent.add(seg); parent = seg; this.tailSegs.push(seg); }
    parent.add(box(1.4, 0.2, 1.6, dark, 0, 0, -1.6));
    // legs
    for (const [x, z] of [[-1.2, 1.6], [1.2, 1.6], [-1.2, -2.0], [1.2, -2.0]]) g.add(box(0.6, 1.6, 0.6, dark, x, -1.6, z));
    this.root = g;
    this.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.scene.add(g);
  }
  attack() {
    if (!this.alive) return;
    if (this.state === 'roost' || this.state === 'retreat') { this.log(`A shadow crosses the sun. ${this.name} has left its roost!`, 'alarm'); }
    this.hostile = true; this.passes = 0;
    this.pickTarget();
  }
  callOff() { this.hostile = false; this.state = 'retreat'; this.waypoint = { ...this.R.roost }; }
  pickTarget() {
    const cands = this.R.buildings.filter(b => b.cx > WX0 && b.cx < WX1 && b.cz > WX0 && b.cz < WX1 && b.type !== 'stall' && b.type !== 'camp');
    const b = Math.random() < 0.25 ? this.R.keep : pick(cands);
    this.target = { x: b.cx, y: b.y0, z: b.cz, b };
    // approach from a random direction
    const a = rand(0, Math.PI * 2);
    this.dir = { x: Math.cos(a), z: Math.sin(a) };
    this.waypoint = { x: b.cx - this.dir.x * 70, y: PY + 20, z: b.cz - this.dir.z * 70 };
    this.state = 'approach'; this.stateT = 0; this.breathing = false;
  }
  damage(amount, source) {
    if (!this.alive) return;
    this.hp -= amount;
    this.hurtT = 0.3;
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; this.hostile = false; this.state = 'dying'; this.breathing = false;
      this.log(`${this.name.toUpperCase()} IS MORTALLY WOUNDED${source ? ' by ' + source : ''}! It falls from the sky!`, 'alarm');
    } else if (this.hp < this.maxHp * 0.2 && this.state !== 'retreat' && this.state !== 'dying') {
      this.state = 'retreat'; this.hostile = false; this.breathing = false; this.waypoint = { ...this.R.roost }; this.stateT = 0;
      this.log(`${this.name} shrieks and retreats toward the mountains, bleeding.`, 'alarm');
    }
  }
  forward() { return { x: Math.sin(this.yaw) * Math.cos(this.pitch), y: Math.sin(this.pitch), z: Math.cos(this.yaw) * Math.cos(this.pitch) }; }
  steer(dt, wp, speed, turnRate = 1.1) {
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, dy = wp.y - this.pos.y;
    const dh = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(dx, dz);
    let dyaw = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw));
    const step = Math.sign(dyaw) * Math.min(Math.abs(dyaw), turnRate * dt);
    this.yaw += step;
    this.roll += (-step / dt * 0.6 - this.roll) * Math.min(1, dt * 3);
    const wantPitch = Math.max(-0.55, Math.min(0.5, Math.atan2(dy, Math.max(dh, 8))));
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 2);
    this.speed += (speed - this.speed) * Math.min(1, dt);
    const f = this.forward();
    this.vel.x = f.x * this.speed; this.vel.y = f.y * this.speed; this.vel.z = f.z * this.speed;
    this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
    // never fly into terrain
    const g = this.world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < g + 6) this.pos.y = g + 6;
    return dh;
  }
  update(dt) {
    this.t += dt; this.stateT += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    const R = this.R;
    if (this.state !== 'strafe') this.breathing = false;
    if (this.state === 'dead') { return; }
    if (this.state === 'dying') {
      this.vel.y -= 14 * dt; this.vel.x *= 0.995; this.vel.z *= 0.995;
      this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
      this.roll += dt * 3; this.pitch -= dt * 0.8;
      this.particles.smoke(this.pos.x, this.pos.y, this.pos.z, 1.5); this.particles.fire(this.pos.x, this.pos.y, this.pos.z, 0, 0, 0, 2, 0.8);
      const g = this.world.heightAt(this.pos.x, this.pos.z);
      if (this.pos.y <= g + 1.5) {
        this.pos.y = g + 1.5; this.state = 'dead';
        this.roll = 2.6; this.pitch = 0;
        const d = this.world.explode(this.pos.x, this.pos.y, this.pos.z, 6, 1.6);
        for (const q of d) if (Math.random() < 0.4) this.particles.debris(q[0], q[1], q[2], q[3], 1);
        this.particles.explosion(this.pos.x, this.pos.y, this.pos.z, 6);
        for (let i = 0; i < 25; i++) this.fire.ignite(Math.floor(this.pos.x + rand(-7, 7)), Math.floor(g + randInt(0, 3)), Math.floor(this.pos.z + rand(-7, 7)));
        if (this.pop) this.pop.damageArea(this.pos.x, this.pos.y, this.pos.z, 9, 200, 'the falling dragon');
        this.log(`${this.name.toUpperCase()} IS SLAIN! Its carcass crashes down in the ${R.districtOf(this.pos.x, this.pos.z)}.`, 'alarm');
      }
      this.updateVisual(dt);
      return;
    }
    if (this.state === 'roost') {
      this.circleA += dt * 0.25;
      const wp = { x: R.roost.x + Math.cos(this.circleA) * 28, y: R.roost.y + Math.sin(this.circleA * 2) * 4, z: R.roost.z + Math.sin(this.circleA) * 28 };
      this.steer(dt, wp, 11);
    } else if (this.state === 'retreat') {
      const dh = this.steer(dt, this.waypoint, 22, 1.4);
      if (dh < 20) { this.state = 'roost'; this.stateT = 0; this.hostile = false; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25); }
    } else if (this.state === 'approach') {
      const dh = this.steer(dt, this.waypoint, 20, 1.3);
      if (dh < 10 || this.stateT > 18) {
        this.state = 'strafe'; this.stateT = 0;
        this.waypoint = { x: this.target.x + this.dir.x * 60, y: PY + 9, z: this.target.z + this.dir.z * 60 };
      }
    } else if (this.state === 'strafe') {
      const dh = this.steer(dt, this.waypoint, 22, 0.9);
      const dt2 = Math.hypot(this.pos.x - this.target.x, this.pos.z - this.target.z);
      this.breathing = dt2 < 42 && this.pos.y < PY + 32;
      if (this.breathing) this.breathe(dt);
      if (dh < 8 || this.stateT > 14) {
        this.breathing = false; this.passes++;
        if (this.passes >= 3 + randInt(0, 2)) { this.state = 'circle'; this.stateT = 0; this.circleA = Math.atan2(this.pos.z - 256, this.pos.x - 256); }
        else this.pickTarget();
      }
    } else if (this.state === 'circle') {
      this.circleA += dt * 0.22;
      const wp = { x: 256 + Math.cos(this.circleA) * 105, y: PY + 40, z: 256 + Math.sin(this.circleA) * 105 };
      this.steer(dt, wp, 18);
      if (this.stateT > 20 && this.hostile) { this.passes = 0; this.pickTarget(); }
      else if (this.stateT > 20) { this.state = 'retreat'; this.waypoint = { ...R.roost }; }
    }
    this.updateVisual(dt);
  }
  breathe(dt) {
    const f = this.forward();
    // mouth position in world space
    const m = new THREE.Vector3(0, 0, 0); this.head.localToWorld(m); m.add(new THREE.Vector3(f.x, f.y, f.z).multiplyScalar(1.5));
    // aim the breath at the ground ahead: steeper when flying higher
    const ground = this.world.heightAt(this.pos.x + f.x * 12, this.pos.z + f.z * 12);
    const down = Math.min(1.4, Math.max(0.45, (this.pos.y - ground) / 14));
    const dir = { x: f.x, y: f.y - down, z: f.z };
    const l = Math.hypot(dir.x, dir.y, dir.z); dir.x /= l; dir.y /= l; dir.z /= l;
    this.particles.fire(m.x, m.y, m.z, dir.x * 28 + this.vel.x * 0.5, dir.y * 28, dir.z * 28 + this.vel.z * 0.5, Math.ceil(20 * dt * 30), 0.9);
    this.breathAcc += dt;
    if (this.breathAcc >= 0.07) {
      this.breathAcc = 0;
      const hit = this.world.raycast(m.x, m.y, m.z, dir.x, dir.y, dir.z, 60);
      if (hit) {
        const hx = hit.x + hit.nx, hy = hit.y + hit.ny, hz = hit.z + hit.nz;
        this.fire.ignite(hit.x, hit.y, hit.z) || this.fire.ignite(hx, hy, hz);
        for (let k = 0; k < 3; k++) this.fire.ignite(hit.x + randInt(-2, 2), hit.y + randInt(-1, 1), hit.z + randInt(-2, 2));
        this.blocksBurnt++;
        if (Math.random() < 0.08) { const d = this.world.explode(hit.x, hit.y, hit.z, 1.6, 0.7); for (const q of d) this.particles.debris(q[0], q[1], q[2], q[3], 1); }
        if (this.pop) this.pop.damageArea(hx, hy, hz, 3.5, 6, 'dragonfire');
        if (this.target && this.target.b && !this.target.b.torchedLogged && Math.hypot(hit.x - this.target.x, hit.z - this.target.z) < 8) { this.target.b.torchedLogged = true; this.log(`${this.name} torches ${this.target.b.name}!`, 'fire'); }
      }
    }
  }
  updateVisual(dt) {
    this.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.root.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    const climbing = this.pitch > 0.1;
    const rate = this.state === 'dying' ? 1 : climbing ? 7 : this.state === 'strafe' ? 3 : 5;
    const amp = this.state === 'strafe' && !climbing ? 0.25 : 0.7;
    const flap = Math.sin(this.t * rate) * amp;
    this.wings[0].rotation.z = -flap; this.wings[1].rotation.z = flap;
    for (let i = 0; i < this.tailSegs.length; i++) this.tailSegs[i].rotation.y = Math.sin(this.t * 2.5 - i * 0.6) * 0.18;
    this.neck.rotation.x = this.breathing ? 0.35 : Math.sin(this.t * 1.3) * 0.08;
    this.jaw.rotation.x = this.breathing ? 0.6 : 0.05;
    if (this.hurtT > 0) this.root.position.y += Math.sin(this.t * 60) * 0.15;
  }
}
