import * as THREE from 'three';
import { B } from './blocks.js';
import { WX1, PY } from './worldgen.js';
import { rand, randInt, pick } from './util.js';

const G = 20;
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));

function ballisticLowArc(from, to, v) {
  const dx = Math.hypot(to.x - from.x, to.z - from.z), dy = to.y - from.y;
  const disc = v * v * v * v - G * (G * dx * dx + 2 * dy * v * v);
  let theta;
  if (disc < 0) theta = Math.atan2(dy, dx) + 0.15;
  else theta = Math.atan((v * v - Math.sqrt(disc)) / (G * dx));
  const hx = (to.x - from.x) / dx, hz = (to.z - from.z) / dx;
  const c = Math.cos(theta), s = Math.sin(theta);
  return { vx: hx * c * v, vy: s * v, vz: hz * c * v, t: dx / (v * c) };
}
function ballisticAngle(from, to, theta) {
  const dx = Math.hypot(to.x - from.x, to.z - from.z), dy = to.y - from.y;
  const c = Math.cos(theta), t = Math.tan(theta);
  const denom = 2 * c * c * (dx * t - dy);
  if (denom <= 0) return null;
  const v = Math.sqrt(G * dx * dx / denom);
  const hx = (to.x - from.x) / dx, hz = (to.z - from.z) / dx;
  return { vx: hx * c * v, vy: Math.sin(theta) * v, vz: hz * c * v, t: dx / (v * c) };
}

export class Siege {
  constructor(scene, world, R, particles, fire, log) {
    this.scene = scene; this.world = world; this.R = R; this.particles = particles; this.fire = fire; this.log = log;
    this.ballistas = []; this.trebuchets = []; this.projectiles = [];
    this.pop = null; this.dragon = null; this.active = false;
    this.impactLogCd = 0;
    this.boltGeo = new THREE.BoxGeometry(0.16, 0.16, 2.2);
    this.boltMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
    this.javMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    this.boulderGeo = new THREE.DodecahedronGeometry(0.9, 0);
    this.boulderMat = new THREE.MeshLambertMaterial({ color: 0x6a6a6a });
    this.fireGeo = new THREE.SphereGeometry(0.55, 8, 6);
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    for (const b of R.ballistas) this.makeBallista(b);
    for (const s of R.camp.trebuchetSpots) this.makeTrebuchet(s);
  }
  makeBallista(b) {
    const g = new THREE.Group();
    g.position.set(b.x, b.y, b.z);
    const base = box(1.6, 0.25, 1.6, 0x5a3a1a); base.position.y = 0.12; g.add(base);
    const post = box(0.35, 0.9, 0.35, 0x4a2a12); post.position.y = 0.6; g.add(post);
    const pivot = new THREE.Group(); pivot.position.y = 1.05; g.add(pivot);
    const rail = box(0.3, 0.25, 2.6, 0x7a5a2a); rail.position.z = 0.2; pivot.add(rail);
    const bow = box(2.6, 0.14, 0.14, 0x3a2a1a); bow.position.z = 1.3; pivot.add(bow);
    const string = box(2.2, 0.04, 0.04, 0xd0c0a0); string.position.z = 0.7; pivot.add(string);
    const bolt = box(0.12, 0.12, 2.0, 0x8a6a3a); bolt.position.set(0, 0.2, 0.4); pivot.add(bolt);
    const yaw = Math.atan2(b.fx, b.fz);
    g.rotation.y = yaw;
    this.scene.add(g);
    // operator stands beside the engine, on the inner side
    const standX = b.x - b.fx * 1.4 + (b.fx === 0 ? 1.2 : 0), standZ = b.z - b.fz * 1.4 + (b.fz === 0 ? 1.2 : 0);
    this.ballistas.push({ pos: { x: b.x, y: b.y, z: b.z }, fx: b.fx, fz: b.fz, group: g, pivot, bolt, baseYaw: yaw, reload: rand(1, 5), operator: null, standX, standZ, kills: 0 });
  }
  makeTrebuchet(s) {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    const wood = 0x4a3220, dark = 0x2a1a10;
    const base1 = box(1, 0.5, 8, wood); base1.position.set(-1.6, 0.25, 0); g.add(base1);
    const base2 = box(1, 0.5, 8, wood); base2.position.set(1.6, 0.25, 0); g.add(base2);
    for (const sx of [-1.6, 1.6]) {
      const a1 = box(0.4, 6, 0.4, wood); a1.position.set(sx, 3, -1.6); a1.rotation.x = 0.5; g.add(a1);
      const a2 = box(0.4, 6, 0.4, wood); a2.position.set(sx, 3, 1.6); a2.rotation.x = -0.5; g.add(a2);
    }
    const axle = box(4, 0.4, 0.4, dark); axle.position.y = 5.5; g.add(axle);
    const arm = new THREE.Group(); arm.position.y = 5.5; g.add(arm);
    const beam = box(0.5, 0.5, 12, wood); beam.position.z = 2.5; arm.add(beam);
    const cw = box(2.2, 2.2, 2.2, 0x555555); cw.position.set(0, -1.6, -3.2); arm.add(cw);
    const sling = new THREE.Mesh(this.boulderGeo || new THREE.DodecahedronGeometry(0.9, 0), new THREE.MeshLambertMaterial({ color: 0x6a6a6a })); sling.position.set(0, -0.8, 8.2); arm.add(sling);
    arm.rotation.x = 0.95;
    const wheels = [];
    for (const [wx, wz] of [[-2.3, -3], [2.3, -3], [-2.3, 3], [2.3, 3]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.4, 10), new THREE.MeshLambertMaterial({ color: dark })); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.8, wz); g.add(w); wheels.push(w); }
    g.rotation.y = -Math.PI / 2; // face west toward the city
    this.scene.add(g);
    const names = ['Wall-Breaker', 'Widowmaker', 'Iron Fist', 'Stone Rain', "Vargath's Wrath", 'Gate Crusher', 'Skullsplitter', 'The Widow'];
    const t = { pos: { x: s.x, y: s.y, z: s.z }, group: g, arm, sling, wheels, state: 'camp', hp: 1400, maxHp: 1400, destroyed: false, reload: rand(2, 6), fireT: 0, crew: [], target: null, name: names[this.trebuchets.length % names.length] };
    this.trebuchets.push(t);
  }
  beginSiege(pop) {
    this.pop = pop; this.active = true;
    const raiders = pop.units.filter(u => u.faction === 'enemy' && u.job === 'raider' && !u.dead);
    let ri = 0;
    this.trebuchets.forEach((t, i) => {
      if (t.destroyed) return;
      t.state = 'moving';
      t.dest = { x: WX1 + 42 + rand(0, 12), z: 256 + (i - (this.trebuchets.length - 1) / 2) * 16 + rand(-3, 3) };
      for (let k = 0; k < 3 && ri < raiders.length; k++) { const u = raiders[ri++]; u.crewOf = t; u.crewOff = { x: rand(-3, 3), z: rand(3, 5) }; t.crew.push(u); }
    });
    this.log(`${this.trebuchets.filter(t => !t.destroyed).length} trebuchets roll out of the camp.`, 'alarm');
  }
  endSiege() { this.active = false; for (const t of this.trebuchets) if (!t.destroyed) t.state = 'idle'; }

  // ---------- projectiles ----------
  spawnProjectile(type, from, vel, o = {}) {
    let mesh;
    if (type === 'bolt' || type === 'javelin') mesh = new THREE.Mesh(this.boltGeo, type === 'bolt' ? this.boltMat : this.javMat);
    else if (type === 'boulder') mesh = new THREE.Mesh(this.boulderGeo, this.boulderMat);
    else mesh = new THREE.Mesh(this.fireGeo, this.fireMat);
    if (type === 'javelin') mesh.scale.set(0.6, 0.6, 0.7);
    mesh.position.set(from.x, from.y, from.z);
    this.scene.add(mesh);
    this.projectiles.push({ type, mesh, pos: { ...from }, vel: { ...vel }, life: 12, faction: o.faction || 'city', dmg: o.dmg || 60, owner: o.owner || null, gravity: o.gravity ?? G, prev: { ...from } });
  }
  throwJavelin(u, target) {
    const from = { x: u.pos.x, y: u.pos.y + 1.6, z: u.pos.z };
    const to = { x: target.pos.x, y: target.pos.y + 1, z: target.pos.z };
    const v = ballisticLowArc(from, to, 26);
    if (!v) return;
    this.spawnProjectile('javelin', from, v, { faction: 'city', dmg: 24, owner: u });
  }
  fireball(from, dir, speed = 55) {
    this.spawnProjectile('fireball', from, { vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed }, { faction: 'player', dmg: 130, gravity: 6 });
    this.particles.fire(from.x, from.y, from.z, dir.x * 5, dir.y * 5, dir.z * 5, 8, 0.4);
  }
  explodeAt(x, y, z, r, power, dmg, source, ignite = 0) {
    const destroyed = this.world.explode(x, y, z, r, power);
    for (const d of destroyed) if (Math.random() < 0.35) this.particles.debris(d[0], d[1], d[2], d[3], 1);
    this.particles.explosion(x, y, z, r);
    if (this.pop) this.pop.damageArea(x, y, z, r + 1.5, dmg, source);
    for (let i = 0; i < ignite; i++) this.fire.ignite(x + randInt(-r, r), y + randInt(-1, 2), z + randInt(-r, r));
    if (this.dragon && this.dragon.alive) {
      const dd = Math.hypot(this.dragon.pos.x - x, this.dragon.pos.y - y, this.dragon.pos.z - z);
      if (dd < r + 4) this.dragon.damage(dmg * 0.8, source);
    }
    for (const t of this.trebuchets) if (!t.destroyed && Math.hypot(t.pos.x - x, t.pos.y + 3 - y, t.pos.z - z) < r + 4) this.damageTrebuchet(t, dmg, source);
    // impact log (rate limited)
    if (this.impactLogCd <= 0 && destroyed.length > 6) {
      const b = this.R.buildings.find(b => x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1 && b.type !== 'camp');
      if (b) { this.impactLogCd = 2; this.log(`${source ? source.charAt(0).toUpperCase() + source.slice(1) : 'An explosion'} smashes into ${b.name}! (${destroyed.length} blocks)`, 'impact'); b.damage = (b.damage || 0) + destroyed.length; }
      else if (Math.abs(x - WX1) < 4 || Math.abs(x - 136) < 4 || Math.abs(z - WX1) < 4 || Math.abs(z - 136) < 4) { this.impactLogCd = 2; this.log(`${source ? source.charAt(0).toUpperCase() + source.slice(1) : 'An explosion'} tears a hole in the city wall!`, 'impact'); }
    }
  }
  damageTrebuchet(t, dmg, source) {
    if (t.destroyed) return;
    t.hp -= dmg;
    this.particles.debris(t.pos.x, t.pos.y + 3, t.pos.z, B.LOG, 4);
    if (t.hp <= 0) {
      t.destroyed = true; t.state = 'destroyed';
      t.group.rotation.z = 0.6; t.group.position.y -= 0.8;
      this.particles.explosion(t.pos.x, t.pos.y + 3, t.pos.z, 2.5);
      for (let i = 0; i < 6; i++) this.fire.ignite(Math.floor(t.pos.x + rand(-2, 2)), Math.floor(t.pos.y), Math.floor(t.pos.z + rand(-3, 3)));
      this.log(`Trebuchet "${t.name}" is destroyed${source ? ' by ' + source : ''}!`, 'kill');
      for (const c of t.crew) c.crewOf = null;
    }
  }

  // ---------- targeting ----------
  ballistaTarget(b) {
    const d = this.dragon;
    if (d && d.alive && d.hostile) {
      const dd = Math.hypot(d.pos.x - b.pos.x, d.pos.z - b.pos.z);
      if (dd < 85) return { kind: 'dragon', pos: d.pos, vel: d.vel };
    }
    if (!this.pop) return null;
    let best = null, bd = 140;
    for (const t of this.trebuchets) { if (t.destroyed || t.state === 'camp') continue; const dd = Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z); if (dd < bd) { bd = dd; best = { kind: 'trebuchet', pos: { x: t.pos.x, y: t.pos.y + 3, z: t.pos.z }, vel: { x: 0, y: 0, z: 0 }, ref: t }; } }
    if (best && bd < 100) return best;
    let bu = null, bud = 120;
    for (const u of this.pop.units) {
      if (u.faction !== 'enemy' || u.dead || u.activity === 'camp') continue;
      const dd = Math.hypot(u.pos.x - b.pos.x, u.pos.z - b.pos.z);
      if (dd < bud) { bud = dd; bu = u; }
    }
    if (bu) return { kind: 'unit', pos: { x: bu.pos.x, y: bu.pos.y + 1, z: bu.pos.z }, vel: { x: 0, y: 0, z: 0 }, ref: bu };
    return best;
  }

  update(dt, hour) {
    this.impactLogCd -= dt;
    // ballistas
    for (const b of this.ballistas) {
      b.reload -= dt;
      const opOk = b.operator && !b.operator.dead && Math.hypot(b.operator.pos.x - b.standX, b.operator.pos.z - b.standZ) < 2.5;
      const tgt = opOk ? this.ballistaTarget(b) : null;
      if (tgt) {
        const t = ballisticLowArc({ x: b.pos.x, y: b.pos.y + 1.2, z: b.pos.z }, tgt.pos, 58).t;
        const aim = { x: tgt.pos.x + tgt.vel.x * t, y: tgt.pos.y + tgt.vel.y * t, z: tgt.pos.z + tgt.vel.z * t };
        const v = ballisticLowArc({ x: b.pos.x, y: b.pos.y + 1.2, z: b.pos.z }, aim, 58);
        const yaw = Math.atan2(v.vx, v.vz);
        b.group.rotation.y += (Math.atan2(Math.sin(yaw - b.group.rotation.y), Math.cos(yaw - b.group.rotation.y))) * Math.min(1, dt * 4);
        const pitch = -Math.atan2(v.vy, Math.hypot(v.vx, v.vz));
        b.pivot.rotation.x += (pitch - b.pivot.rotation.x) * Math.min(1, dt * 4);
        if (b.reload <= 0 && Math.abs(Math.atan2(Math.sin(yaw - b.group.rotation.y), Math.cos(yaw - b.group.rotation.y))) < 0.15) {
          b.reload = 4 + rand(0, 2.5);
          const from = { x: b.pos.x + v.vx / 58 * 1.5, y: b.pos.y + 1.3, z: b.pos.z + v.vz / 58 * 1.5 };
          // crews are good, not perfect: a little spread so volleys miss now and then
          const sp = 1 + rand(-0.06, 0.06), jy = rand(-0.03, 0.03);
          const shot = { vx: (v.vx * Math.cos(jy) - v.vz * Math.sin(jy)) * sp, vy: v.vy * sp * (1 + rand(-0.04, 0.04)), vz: (v.vx * Math.sin(jy) + v.vz * Math.cos(jy)) * sp };
          this.spawnProjectile('bolt', from, shot, { faction: 'city', dmg: 70, owner: b });
          b.bolt.visible = false; setTimeout(() => { b.bolt.visible = true; }, 1500);
          if (b.operator) b.operator.attackT = 1;
        }
      } else {
        const ry = b.baseYaw;
        b.group.rotation.y += (Math.atan2(Math.sin(ry - b.group.rotation.y), Math.cos(ry - b.group.rotation.y))) * Math.min(1, dt * 2);
        b.pivot.rotation.x += (-0.2 - b.pivot.rotation.x) * Math.min(1, dt * 2);
      }
    }
    // trebuchets
    for (const t of this.trebuchets) {
      if (t.destroyed) { if (Math.random() < 0.3) this.particles.smoke(t.pos.x + rand(-2, 2), t.pos.y + 3, t.pos.z + rand(-2, 2), 0.8); continue; }
      if (t.state === 'moving') {
        const dx = t.dest.x - t.pos.x, dz = t.dest.z - t.pos.z, d = Math.hypot(dx, dz);
        if (d < 1) { t.state = 'firing'; t.reload = rand(2, 6); this.log(`Trebuchet "${t.name}" is in position and winding up.`, 'alarm'); }
        else {
          const sp = 2.6 * dt;
          t.pos.x += dx / d * sp; t.pos.z += dz / d * sp;
          const gy = this.world.heightAt(t.pos.x, t.pos.z);
          t.pos.y += (gy - t.pos.y) * Math.min(1, dt * 3);
          t.group.position.set(t.pos.x, t.pos.y, t.pos.z);
          t.group.rotation.y = Math.atan2(dx, dz);
          for (const w of t.wheels) w.rotation.x += sp * 1.3;
        }
      } else if (t.state === 'firing') {
        t.group.rotation.y = -Math.PI / 2;
        t.reload -= dt;
        // arm animation
        if (t.fireT > 0) { t.fireT -= dt; const k = 1 - t.fireT / 0.6; t.arm.rotation.x = 0.95 - 2.1 * Math.sin(Math.min(1, k) * Math.PI / 2); t.sling.visible = false; }
        else { t.arm.rotation.x += (0.95 - t.arm.rotation.x) * Math.min(1, dt * 0.5); t.sling.visible = true; }
        if (t.reload <= 0) {
          t.reload = 9 + rand(0, 5);
          t.fireT = 0.6;
          const target = this.pickTrebuchetTarget();
          const from = { x: t.pos.x - 4, y: t.pos.y + 10, z: t.pos.z };
          const v = ballisticAngle(from, target, 0.9);
          if (v) setTimeout(() => { if (!t.destroyed) this.spawnProjectile('boulder', from, v, { faction: 'enemy', dmg: 90, owner: t }); }, 350);
        }
        // crew members near the engine can be attacked; if all dead the engine goes silent
        const alive = t.crew.filter(c => !c.dead);
        if (!alive.length && t.crew.length) { t.state = 'silent'; this.log(`Trebuchet "${t.name}" falls silent - its crew is dead.`, 'kill'); }
      }
    }
    // projectiles
    const P = this.projectiles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
      p.vel.vy -= p.gravity * dt;
      p.pos.x += p.vel.vx * dt; p.pos.y += p.vel.vy * dt; p.pos.z += p.vel.vz * dt;
      p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.type !== 'boulder') {
        p.mesh.lookAt(p.pos.x + p.vel.vx, p.pos.y + p.vel.vy, p.pos.z + p.vel.vz);
      } else { p.mesh.rotation.x += dt * 4; p.mesh.rotation.z += dt * 2; }
      if (p.type === 'fireball') this.particles.fire(p.pos.x, p.pos.y, p.pos.z, 0, 1, 0, 2, 0.35);
      let hit = false;
      // block hit (substep by sampling along the segment)
      const steps = Math.ceil(Math.hypot(p.pos.x - p.prev.x, p.pos.y - p.prev.y, p.pos.z - p.prev.z) / 0.8) || 1;
      for (let s = 1; s <= steps && !hit; s++) {
        const f = s / steps;
        const sx = p.prev.x + (p.pos.x - p.prev.x) * f, sy = p.prev.y + (p.pos.y - p.prev.y) * f, sz = p.prev.z + (p.pos.z - p.prev.z) * f;
        if (this.world.isSolid(sx, sy, sz) || sy < 1) { p.pos.x = sx; p.pos.y = sy; p.pos.z = sz; hit = true; }
      }
      // unit hit
      if (!hit && this.pop) {
        for (const u of this.pop.units) {
          if (u.dead || u.faction === p.faction || (p.faction === 'player' && u.faction === 'city')) continue;
          const dd = Math.hypot(u.pos.x - p.pos.x, u.pos.y + 0.9 - p.pos.y, u.pos.z - p.pos.z);
          if (dd < (p.type === 'boulder' ? 1.6 : 1.0)) { hit = true; if (p.type !== 'boulder' && p.type !== 'fireball') { this.pop.damage(u, p.dmg, p.type === 'bolt' ? 'a ballista bolt' : 'a javelin'); if (p.owner && p.owner.kills != null) p.owner.kills++; } break; }
        }
      }
      if (!hit && this.dragon && this.dragon.alive && p.faction !== 'enemy') {
        const d = this.dragon;
        if (Math.hypot(d.pos.x - p.pos.x, d.pos.y - p.pos.y, d.pos.z - p.pos.z) < d.hitR) { hit = true; if (p.type !== 'fireball') { d.damage(p.type === 'bolt' ? 18 : 5, p.type === 'bolt' ? 'a ballista bolt' : 'a javelin'); this.particles.spawn(p.pos.x, p.pos.y, p.pos.z, rand(-3, 3), 3, rand(-3, 3), 0.6, 0.3, 3, 0.6, 0.1, 0.1); } }
      }
      if (!hit && p.faction !== 'enemy') for (const t of this.trebuchets) { if (!t.destroyed && Math.hypot(t.pos.x - p.pos.x, t.pos.y + 3 - p.pos.y, t.pos.z - p.pos.z) < 3) { hit = true; if (p.type !== 'fireball') this.damageTrebuchet(t, p.type === 'bolt' ? 40 : 6, 'ballista fire'); break; } }
      if (hit || p.life <= 0) {
        if (p.type === 'boulder') this.explodeAt(p.pos.x, p.pos.y, p.pos.z, 3.3, 1.3, 90, 'a trebuchet boulder');
        else if (p.type === 'fireball') this.explodeAt(p.pos.x, p.pos.y, p.pos.z, 3.6, 1.4, 140, 'your fireball', 5);
        else if (p.type === 'bolt') { const d = this.world.explode(p.pos.x, p.pos.y, p.pos.z, 1.1, 0.5); for (const q of d) this.particles.debris(q[0], q[1], q[2], q[3], 1); }
        this.scene.remove(p.mesh);
        P.splice(i, 1);
      }
    }
  }
  pickTrebuchetTarget() {
    const r = Math.random();
    if (r < 0.35) return { x: WX1 - 1, y: PY + 5 + rand(0, 4), z: 256 + rand(-30, 30) };
    if (r < 0.5) { const t = pick(this.R.ballistas.filter(b => b.x > 300)); return { x: t.x, y: t.y, z: t.z }; }
    const cands = this.R.buildings.filter(b => b.cx > 290 && b.cx < WX1 && b.cz > 136 && b.cz < WX1 && b.type !== 'camp' && b.type !== 'stall');
    const b = pick(cands);
    return { x: b.cx + rand(-2, 2), y: b.y1 - 5, z: b.cz + rand(-2, 2) };
  }
}
