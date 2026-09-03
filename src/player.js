import * as THREE from 'three';

export class Player {
  constructor(camera, world, dom) {
    this.camera = camera; this.world = world; this.dom = dom;
    this.pos = new THREE.Vector3(256.5, 20, 392);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI; this.pitch = 0;
    this.fly = false; this.onGround = false;
    this.keys = {};
    this.locked = false;
    this.height = 1.7; this.radius = 0.3;
    this.speed = 6; this.flySpeed = 22;
    this.onClick = null;
    dom.addEventListener('click', () => { if (!this.locked) dom.requestPointerLock(); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022; this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    });
    document.addEventListener('keydown', (e) => { this.keys[e.code] = true; if (e.code === 'KeyF') this.fly = !this.fly; if (e.code === 'Space') e.preventDefault(); });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    dom.addEventListener('mousedown', (e) => { if (this.locked && this.onClick) this.onClick(e.button); });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  collides(p) {
    const w = this.world;
    const r = this.radius;
    for (const dx of [-r, r]) for (const dz of [-r, r]) for (const dy of [0.05, 0.9, this.height - 0.05]) {
      if (w.isSolid(p.x + dx, p.y + dy, p.z + dz)) return true;
    }
    return false;
  }
  update(dt) {
    const k = this.keys;
    const sprint = k.ShiftLeft || k.ShiftRight;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rgt = new THREE.Vector3(-f.z, 0, f.x);
    const move = new THREE.Vector3();
    if (k.KeyW) move.add(f); if (k.KeyS) move.sub(f); if (k.KeyD) move.add(rgt); if (k.KeyA) move.sub(rgt);
    if (move.lengthSq() > 0) move.normalize();
    if (this.fly) {
      const sp = this.flySpeed * (sprint ? 2.5 : 1);
      this.vel.set(move.x * sp, 0, move.z * sp);
      if (k.Space) this.vel.y = sp * 0.7; if (k.KeyC || k.ControlLeft) this.vel.y = -sp * 0.7;
      this.pos.addScaledVector(this.vel, dt);
      this.pos.y = Math.max(2, Math.min(this.world.H + 40, this.pos.y));
    } else {
      const sp = this.speed * (sprint ? 1.8 : 1);
      this.vel.x = move.x * sp; this.vel.z = move.z * sp;
      this.vel.y -= 24 * dt;
      if (k.Space && this.onGround) { this.vel.y = 8.5; this.onGround = false; }
      // axis-separated collision
      const p = this.pos.clone();
      p.x += this.vel.x * dt;
      if (this.collides(p)) { p.x = this.pos.x; // try step up
        const up = p.clone(); up.x += this.vel.x * dt; up.y += 1.01;
        if (this.onGround && !this.collides(up)) { p.copy(up); }
      }
      p.z += this.vel.z * dt;
      if (this.collides(p)) { p.z = this.pos.z; const up = p.clone(); up.z += this.vel.z * dt; up.y += 1.01; if (this.onGround && !this.collides(up)) p.copy(up); }
      p.y += this.vel.y * dt;
      this.onGround = false;
      if (this.collides(p)) {
        if (this.vel.y < 0) { p.y = Math.floor(p.y + 0.5); if (this.collides(p)) p.y = Math.ceil(p.y); this.onGround = true; }
        else { p.y = this.pos.y; }
        this.vel.y = 0;
      }
      this.pos.copy(p);
      if (this.pos.y < 1) { this.pos.y = this.world.heightAt(this.pos.x, this.pos.z) + 1; }
    }
    this.camera.position.set(this.pos.x, this.pos.y + this.height - 0.1, this.pos.z);
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotation.y = this.yaw; this.camera.rotation.x = this.pitch;
  }
}
