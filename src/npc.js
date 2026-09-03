import { B, NON_SOLID } from './blocks.js';
import { WX0, WX1, PY } from './worldgen.js';
import { rng, rand, randInt, pick, randomName, FIRST_NAMES } from './util.js';

const JOB_COLORS = {
  farmer: 0x7a8f3a, blacksmith: 0x3a3a3a, armorer: 0x4a4a55, baker: 0xf0e6d0, innkeeper: 0x8a4a2a, cook: 0xe8e0c8, bard: 0x8a3a9a, maid: 0xd8d0c0,
  scholar: 0x2a3a7a, steward: 0x6a5a3a, stablehand: 0x7a6a3a, guildmaster: 0x7a2a4a, clerk: 0x4a5a7a, mayor: 0x7a1a3a, scribe: 0x3a5a7a,
  apothecary: 0x3a7a5a, tailor: 0x9a5aaa, butcher: 0xaa3a3a, carpenter: 0x8a6a3a, mason: 0x8a8a8a, tanner: 0x6a4a2a, teacher: 0x3a4a6a,
  priest: 0xf4f0e8, acolyte: 0xd8d0c8, miller: 0xe0d8c0, merchant: 0xc08a2a, king: 0xd4a017, queen: 0x8a2be2, chancellor: 0x2a2a6a, servant: 0x9a8a7a,
  treasurer: 0x6a6a2a, knight: 0xa0a8b8, guard: 0x8a1a1a, operator: 0x6a3a1a, footman: 0x9a2a2a, villager: 0x6a7a5a, townsfolk: 0x7a6a5a, brewer: 0x6a4a2a,
  chandler: 0xe8d8a0, weaver: 0x5a7a9a, jeweler: 0xd0b040, fishmonger: 0x4a7a9a, raider: 0x3a1a1a, warlord: 0x1a1a1a,
};
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const PANTS = [0x3a2a1a, 0x2a2a3a, 0x4a3a2a, 0x5a4a3a];

export const JOB_TITLE = (j) => j.charAt(0).toUpperCase() + j.slice(1);

let nextId = 1;
export function makeUnit(o) {
  const skin = pick(SKINS);
  const job = o.job || 'villager';
  const military = ['guard', 'operator', 'footman', 'knight', 'raider', 'warlord'].includes(job);
  return {
    id: nextId++, name: o.name || randomName(), job, faction: o.faction || 'city', military,
    pos: { x: o.x, y: o.y, z: o.z }, yaw: rand(0, Math.PI * 2), walkPhase: rand(0, 6), moving: false,
    colors: {
      skin, shirt: JOB_COLORS[job] || 0x7a6a5a, pants: pick(PANTS),
      hat: job === 'guard' || job === 'footman' || job === 'knight' ? 0x8a8f9a : job === 'raider' ? 0x2a2a2a : job === 'king' || job === 'queen' ? 0xf0c445 : job === 'warlord' ? 0x6a0a0a : job === 'priest' ? 0xf4f0e8 : null,
    },
    hp: o.hp || (military ? 90 : 40), maxHp: o.hp || (military ? 90 : 40), dmg: o.dmg || (military ? 12 : 4),
    speed: o.speed || (military ? 4.2 : 3.4),
    home: o.home || null, work: o.work || null, field: o.field || null, homeSpot: o.homeSpot || null,
    inBuilding: null, waypoints: [], activity: 'idle', idleT: rand(0, 3), decideT: rand(0, 2), attackCd: 0, attackT: 0,
    dead: false, deadT: 0, removed: false, side: 1, stuckT: 0, lastX: o.x, lastZ: o.z, panic: false, engine: o.engine || null,
    patrolSide: o.patrolSide || null, shelterB: null, quote: '',
  };
}

const insideWalls = (x, z) => x > WX0 + 2 && x < WX1 - 2 && z > WX0 + 2 && z < WX1 - 2;

export class Population {
  constructor(world, R, ctx) {
    this.world = world; this.R = R; this.ctx = ctx; // ctx: {log, fire, particles, siege}
    this.units = [];
    this.invasion = false;
    this.fallen = false;
    this.combatAcc = 0;
    this.spawnCitizens();
    this.spawnEnemies();
  }
  // ---------- spawning ----------
  spawnCitizens() {
    const R = this.R;
    const houses = R.buildings.filter(b => (b.type === 'house' || b.type === 'cottage' || b.type === 'farmhouse') && b.beds.length);
    const bedPool = [];
    for (const h of houses) for (const bed of h.beds) bedPool.push({ b: h, spot: bed });
    // shuffle
    for (let i = bedPool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bedPool[i], bedPool[j]] = [bedPool[j], bedPool[i]]; }
    const takeBed = (near) => {
      if (!bedPool.length) return null;
      let best = 0, bd = Infinity;
      if (near) for (let i = 0; i < Math.min(bedPool.length, 40); i++) { const d = Math.hypot(bedPool[i].b.cx - near.cx, bedPool[i].b.cz - near.cz); if (d < bd) { bd = d; best = i; } }
      return bedPool.splice(best, 1)[0];
    };
    // workplace jobs
    for (const b of R.buildings) {
      if (b.type === 'camp') continue;
      for (const job of b.jobs) {
        let home = null, homeSpot = null;
        if (b.beds.length && (b.type === 'keep' || b.type === 'tavern' || b.type === 'inn' || b.type === 'watchtower' || b.type === 'gatehouse')) {
          const groundBeds = b.beds.filter(s => s.y === b.y0 || b.stairs.length);
          const bed = groundBeds.length ? pick(groundBeds) : null;
          if (bed) { home = b; homeSpot = bed; }
        }
        if (!home) {
          const outside = !insideWalls(b.cx, b.cz);
          const tb = takeBed(outside ? b : b);
          if (tb) { home = tb.b; homeSpot = tb.spot; } else { home = b; homeSpot = b.workSpots[0]; }
        }
        const isRoyal = ['king', 'queen', 'chancellor', 'treasurer'].includes(job);
        const u = makeUnit({ job, x: (job === 'king' ? R.throne.x : b.workSpots[0].x) + 0.5, y: b.workSpots[0].y, z: b.workSpots[0].z + 0.5, home, work: b, homeSpot, hp: job === 'knight' ? 140 : undefined, dmg: job === 'knight' ? 18 : undefined });
        if (job === 'king') { u.name = 'King Aldric IV'; u.colors.shirt = 0xd4a017; }
        if (job === 'queen') u.name = 'Queen Merewyn';
        if (isRoyal) u.colors.pants = 0x4a1a5a;
        u.inBuilding = b;
        this.units.push(u);
      }
    }
    // farmers per field
    for (const f of R.fields) {
      for (const job of f.jobs) {
        const tb = takeBed({ cx: f.x0, cz: f.z0 });
        const home = tb ? tb.b : null;
        const u = makeUnit({ job, x: f.x0 + rand(1, f.x1 - f.x0 - 1), y: f.y, z: f.z0 + rand(1, f.z1 - f.z0 - 1), home, homeSpot: tb ? tb.spot : null, field: f });
        this.units.push(u);
      }
    }
    // remaining beds -> townsfolk / hamlet villagers
    for (const tb of bedPool) {
      if (rng() < 0.25) continue;
      const inCity = insideWalls(tb.b.cx, tb.b.cz);
      const u = makeUnit({ job: inCity ? 'townsfolk' : 'villager', x: tb.spot.x + 0.5, y: tb.spot.y, z: tb.spot.z + 0.5, home: tb.b, homeSpot: tb.spot });
      if (tb.b.family) u.name = `${pick(FIRST_NAMES)} ${tb.b.family}`;
      u.inBuilding = tb.b;
      this.units.push(u);
    }
    // guards on the walls
    const sides = ['N', 'S', 'E', 'W'];
    for (let i = 0; i < R.patrol.length; i += 2) {
      const p = R.patrol[i];
      const u = makeUnit({ job: 'guard', x: p.x, y: p.y, z: p.z, patrolSide: p.side, hp: 110, dmg: 14 });
      u.rangedCd = rand(0, 3);
      this.units.push(u);
    }
    // ballista operators
    for (const e of this.ctx.siege.ballistas) {
      const u = makeUnit({ job: 'operator', x: e.standX, y: e.pos.y, z: e.standZ, engine: e, hp: 90, dmg: 8 });
      e.operator = u;
      this.units.push(u);
    }
    // footmen in barracks & training yard
    const barracks = R.buildings.filter(b => b.type === 'barracks');
    for (let i = 0; i < 28; i++) {
      const b = barracks[i % barracks.length];
      const spot = b.beds.length ? b.beds[i % b.beds.length] : b.workSpots[0];
      const u = makeUnit({ job: 'footman', x: spot.x + 0.5, y: spot.y, z: spot.z + 0.5, home: b, homeSpot: spot, work: b, hp: 110, dmg: 14, speed: 4.6 });
      u.inBuilding = b;
      this.units.push(u);
    }
    this.log(`${this.units.length} souls live in the kingdom.`);
  }
  spawnEnemies() {
    const c = this.R.camp;
    for (let i = 0; i < 64; i++) {
      const t = c.tents[i % c.tents.length];
      const u = makeUnit({ job: 'raider', faction: 'enemy', x: t.x + rand(-4, 4), y: t.y, z: t.z + rand(4, 7), hp: 80, dmg: 11, speed: 4.0 });
      u.campSpot = { x: u.pos.x, z: u.pos.z };
      this.units.push(u);
    }
    const w = makeUnit({ job: 'warlord', faction: 'enemy', x: c.x + 12, y: c.y, z: c.z, hp: 400, dmg: 30, speed: 4.4 });
    w.name = 'Warlord Vargath'; w.scale = 1.25; w.campSpot = { x: w.pos.x, z: w.pos.z };
    this.units.push(w);
    this.warlord = w;
  }
  log(msg, kind) { if (this.ctx.log) this.ctx.log(msg, kind); }

  // ---------- routing ----------
  routeTo(u, spot, b) {
    const wps = [];
    const cur = u.inBuilding;
    const cellC = (s) => ({ x: s.x + 0.5, z: s.z + 0.5 });
    const stairsOf = (bb) => bb && bb.stairs && bb.stairs.length ? bb.stairs[0] : null;
    const upstairs = cur && u.pos.y > cur.y0 + 2.5;
    if (cur && cur !== b) {
      const st = stairsOf(cur);
      if (upstairs && st) wps.push({ x: st.x + 0.5, z: st.z1 - 0.5 }, { x: st.x + 0.5, z: st.z0 + 0.5 }, { x: st.x + 1.5, z: st.z0 + 0.5 });
      wps.push(cellC(cur.inside), cellC(cur.outside));
    }
    const fromX = cur ? cur.outside.x : u.pos.x, fromZ = cur ? cur.outside.z : u.pos.z;
    const fromIn = insideWalls(fromX, fromZ), toIn = insideWalls(spot.x, spot.z);
    if (fromIn !== toIn && Math.abs(u.pos.y - PY) < 3) {
      const g = this.nearestGate(fromIn ? spot.x : fromX, fromIn ? spot.z : fromZ);
      if (g) { if (fromIn) wps.push({ x: g.inner.x + 0.5, z: g.inner.z + 0.5 }, { x: g.outer.x + 0.5, z: g.outer.z + 0.5 }); else wps.push({ x: g.outer.x + 0.5, z: g.outer.z + 0.5 }, { x: g.inner.x + 0.5, z: g.inner.z + 0.5 }); }
    }
    if (b) {
      if (cur !== b) wps.push(cellC(b.outside), cellC(b.inside));
      const st = stairsOf(b);
      const wantUp = spot.y > b.y0 + 2;
      const isUp = cur === b && upstairs;
      if (wantUp && st && !isUp) wps.push({ x: st.x + 1.5, z: st.z0 + 0.5 }, { x: st.x + 0.5, z: st.z0 + 0.5 }, { x: st.x + 0.5, z: st.z1 - 0.5 });
      else if (!wantUp && st && isUp) wps.push({ x: st.x + 0.5, z: st.z1 - 0.5 }, { x: st.x + 0.5, z: st.z0 + 0.5 }, { x: st.x + 1.5, z: st.z0 + 0.5 });
    }
    wps.push({ x: spot.x + 0.5, z: spot.z + 0.5, final: true, b: b || null });
    u.waypoints = wps;
    u.stuckT = 0;
  }
  nearestGate(x, z) {
    const g = this.R.gates;
    const dx = x - 256, dz = z - 256;
    const order = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? ['E', 'S', 'N', 'W'] : ['W', 'S', 'N', 'E']) : (dz > 0 ? ['S', 'E', 'W', 'N'] : ['N', 'E', 'W', 'S']);
    for (const s of order) if (g[s] && !g[s].closed) return g[s];
    return g[order[0]];
  }
  canStand(x, y, z) {
    const w = this.world;
    if (w.isSolid(x, y, z) || w.isSolid(x, y + 1, z)) return false;
    return w.groundBelow(x, y, z, 4) !== null;
  }
  step(u, tx, tz, dt) {
    const dx = tx - u.pos.x, dz = tz - u.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) { u.moving = false; return true; }
    u.yaw = Math.atan2(dx, dz);
    const sp = u.speed * (u.panic ? 1.5 : 1) * dt;
    const mx = dx / d * Math.min(sp, d), mz = dz / d * Math.min(sp, d);
    const w = this.world;
    const px = u.pos.x, pz = u.pos.z;
    let ny = u.pos.y;
    const tryMove = (nx, nz) => {
      if (this.canStand(nx, ny, nz)) return true;
      if (this.canStand(nx, ny + 1, nz) && w.isSolid(nx, ny, nz)) { ny += 1; return true; }
      return false;
    };
    let moved = false;
    if (tryMove(px + mx, pz + mz)) { u.pos.x = px + mx; u.pos.z = pz + mz; moved = true; }
    else if (Math.abs(mx) > 1e-4 && tryMove(px + mx, pz)) { u.pos.x = px + mx; moved = true; }
    else if (Math.abs(mz) > 1e-4 && tryMove(px, pz + mz)) { u.pos.z = pz + mz; moved = true; }
    else {
      // sidestep perpendicular
      const sx = -dz / d * sp * u.side, sz = dx / d * sp * u.side;
      if (tryMove(px + sx, pz + sz)) { u.pos.x = px + sx; u.pos.z = pz + sz; moved = true; }
      else u.side = -u.side;
    }
    u.pos.y = ny;
    // gravity / snapping
    const g = w.groundBelow(u.pos.x, u.pos.y + 0.5, u.pos.z, 6);
    if (g !== null) { if (g < u.pos.y) u.pos.y = Math.max(g, u.pos.y - 12 * dt); else u.pos.y = g; }
    u.moving = moved;
    if (moved) u.walkPhase += dt * 9 * (u.panic ? 1.4 : 1);
    return false;
  }
  followWaypoints(u, dt) {
    if (!u.waypoints.length) { u.moving = false; return true; }
    const wp = u.waypoints[0];
    const arrived = this.step(u, wp.x, wp.z, dt);
    // stuck detection
    if (Math.hypot(u.pos.x - u.lastX, u.pos.z - u.lastZ) < 0.3 * dt * 10) u.stuckT += dt; else u.stuckT = 0;
    u.lastX = u.pos.x; u.lastZ = u.pos.z;
    if (arrived || u.stuckT > 4 || Math.hypot(u.pos.x - wp.x, u.pos.z - wp.z) < 0.6) {
      if (u.stuckT > 4 && !arrived) {
        // teleport-nudge past minor obstacles
        u.stuckT = 0;
        if (Math.hypot(u.pos.x - wp.x, u.pos.z - wp.z) < 3) { u.pos.x = wp.x; u.pos.z = wp.z; const g = this.world.groundBelow(wp.x, u.pos.y + 1, wp.z, 8); if (g !== null) u.pos.y = g; }
        else { u.waypoints = []; u.moving = false; u.idleT = 1; return true; }
      }
      u.waypoints.shift();
      if (wp.final) { u.inBuilding = wp.b; u.moving = false; return true; }
    }
    return false;
  }
  // ---------- decisions ----------
  decide(u, hour) {
    if (u.faction === 'enemy') return this.decideEnemy(u);
    if (u.job === 'operator') { u.activity = 'operate'; if (!u.waypoints.length && Math.hypot(u.pos.x - u.engine.standX, u.pos.z - u.engine.standZ) > 0.8) u.waypoints = [{ x: u.engine.standX, z: u.engine.standZ, final: true, b: null }]; u.yaw = Math.atan2(u.engine.fx, u.engine.fz); return; }
    if (u.job === 'guard') {
      if (this.invasion && this.enemyDir) {
        const pts = this.R.patrol.filter(p => p.side === this.enemyDir);
        if (u.patrolSide !== this.enemyDir && pts.length && rng() < 0.6 && !u.redeployed) {
          u.redeployed = true; // guards can only move along their own wall; those on other walls stay alert
        }
        const p = pick(this.R.patrol.filter(p => p.side === u.patrolSide));
        if (p && !u.waypoints.length && rng() < 0.4) u.waypoints = [{ x: p.x + rand(-1, 1), z: p.z, final: true, b: null }];
        u.activity = 'defend';
        return;
      }
      u.activity = 'patrol';
      if (!u.waypoints.length && rng() < 0.5) { const p = pick(this.R.patrol.filter(p => p.side === u.patrolSide)); u.waypoints = [{ x: p.x, z: p.z, final: true, b: null }]; }
      return;
    }
    if (u.job === 'footman' || u.job === 'knight') {
      if (this.invasion) {
        u.activity = 'defend';
        const g = this.R.gates[this.enemyDir || 'E'];
        const breach = this.enemiesInside();
        if (breach) {
          const e = this.nearestEnemy(u.pos.x, u.pos.z, 200);
          if (e) { this.routeTo(u, { x: Math.floor(e.pos.x), y: e.pos.y, z: Math.floor(e.pos.z) }, null); return; }
        }
        if (u.job === 'knight') { const s = pick(this.R.keep.shelterSpots); this.routeTo(u, { x: 256 + randInt(-3, 3), y: PY, z: 212 + randInt(-2, 2) }, null); return; }
        this.routeTo(u, { x: g.inner.x - g.dx * randInt(0, 6) + randInt(-3, 3), y: PY, z: g.inner.z - g.dz * randInt(0, 6) + randInt(-3, 3) }, null);
        return;
      }
      if (hour >= 7 && hour < 18 && u.job === 'footman') {
        u.activity = 'train';
        if (rng() < 0.5) { const s = pick([[236, 223], [242, 223], [270, 223], [276, 223], [256, 218], [250, 216], [262, 216]]); this.routeTo(u, { x: s[0], y: PY, z: s[1] }, null); }
        else this.routeTo(u, pick(u.work.workSpots.concat(u.work.beds)), u.work);
        return;
      }
      if (u.job === 'knight') { u.activity = hour >= 22 || hour < 6 ? 'sleep' : 'work'; this.routeTo(u, u.activity === 'sleep' ? u.homeSpot : pick(u.work.workSpots), u.work); return; }
      u.activity = 'sleep'; this.routeTo(u, u.homeSpot, u.home); return;
    }
    // ---- civilians ----
    if (this.invasion) {
      u.panic = true;
      if (u.activity !== 'shelter' && u.activity !== 'hide') {
        u.activity = 'shelter';
        const b = this.pickShelter(u);
        u.shelterB = b;
        const spots = b.shelterSpots && b.shelterSpots.length ? b.shelterSpots : b.beds.length ? b.beds : b.workSpots;
        this.routeTo(u, pick(spots), b);
        if (rng() < 0.12) this.log(`${JOB_TITLE(u.job)} ${u.name} ${pick(['runs for', 'flees to', 'drags the children to', 'bolts toward'])} ${b.name}!`, 'panic');
      } else if (!u.waypoints.length) {
        u.activity = 'hide'; u.moving = false;
        if (rng() < 0.3 && u.shelterB) { const spots = u.shelterB.shelterSpots && u.shelterB.shelterSpots.length ? u.shelterB.shelterSpots : u.shelterB.workSpots; this.routeTo(u, pick(spots), u.shelterB); }
      }
      return;
    }
    u.panic = false;
    const asleep = hour >= 22 || hour < 6;
    if (asleep) {
      if (u.activity !== 'sleep' && u.home) { u.activity = 'sleep'; this.routeTo(u, u.homeSpot || u.home.inside, u.home); }
      return;
    }
    if (hour >= 18.5 && hour < 22) {
      if (u.activity !== 'social' && u.activity !== 'evening') {
        if (rng() < 0.4) {
          const tav = this.nearest(this.R.buildings.filter(b => b.social), u.pos.x, u.pos.z);
          if (tav) { u.activity = 'social'; this.routeTo(u, pick(tav.workSpots), tav); return; }
        }
        u.activity = 'evening';
        if (u.home) this.routeTo(u, u.homeSpot || u.home.inside, u.home);
      } else if (u.activity === 'social' && !u.waypoints.length && rng() < 0.3) { const tav = u.inBuilding; if (tav) this.routeTo(u, pick(tav.workSpots), tav); }
      return;
    }
    // working hours
    if (u.field) {
      u.activity = 'work';
      if (!u.waypoints.length && rng() < 0.6) { const f = u.field; this.routeTo(u, { x: randInt(f.x0 + 1, f.x1 - 1), y: f.y, z: randInt(f.z0 + 1, f.z1 - 1) }, null); }
      return;
    }
    if (u.work) {
      u.activity = 'work';
      if (!u.waypoints.length && (u.inBuilding !== u.work || rng() < 0.35)) {
        const w = u.work;
        if (w.type === 'stall' || w.type === 'mill') { this.routeTo(u, pick(w.workSpots), null); return; }
        if (rng() < 0.15 && w.type !== 'keep' && w.type !== 'gatehouse' && w.type !== 'watchtower') { // step outside for a moment
          this.routeTo(u, { x: w.outside.x + randInt(-2, 2), y: w.y0, z: w.outside.z + randInt(-2, 2) }, null); return;
        }
        this.routeTo(u, pick(w.workSpots), w);
      }
      return;
    }
    // townsfolk / villagers: wander
    u.activity = 'wander';
    if (!u.waypoints.length && rng() < 0.5) {
      if (u.job === 'townsfolk') {
        const r = rng();
        if (r < 0.5) { const p = this.R.plaza; this.routeTo(u, { x: randInt(p.x0 + 2, p.x1 - 2), y: PY, z: randInt(p.z0 + 2, p.z1 - 2) }, null); }
        else if (r < 0.75) { const stalls = this.R.buildings.filter(b => b.type === 'stall'); const s = pick(stalls); this.routeTo(u, s.workSpots[0], null); }
        else if (r < 0.9) { const w = pick(this.R.wells); this.routeTo(u, { x: Math.floor(w.x) + randInt(-1, 1), y: PY, z: Math.floor(w.z) + 1 }, null); }
        else this.routeTo(u, u.homeSpot, u.home);
      } else {
        const h = u.home;
        this.routeTo(u, { x: h.outside.x + randInt(-8, 8), y: h.y0, z: h.outside.z + randInt(-8, 8) }, null);
      }
    }
  }
  pickShelter(u) {
    const R = this.R;
    const inCity = insideWalls(u.pos.x, u.pos.z);
    const shelters = R.buildings.filter(b => b.shelter && insideWalls(b.cx, b.cz));
    if (inCity && u.home && insideWalls(u.home.cx, u.home.cz) && rng() < 0.5) return u.home;
    return this.nearest(shelters, u.pos.x, u.pos.z) || R.keep;
  }
  nearest(list, x, z, maxD = Infinity) {
    let best = null, bd = maxD;
    for (const b of list) { const d = Math.hypot((b.cx ?? b.pos.x) - x, (b.cz ?? b.pos.z) - z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  nearestEnemy(x, z, maxD) { let best = null, bd = maxD; for (const u of this.units) { if (u.faction !== 'enemy' || u.dead) continue; const d = Math.hypot(u.pos.x - x, u.pos.z - z); if (d < bd) { bd = d; best = u; } } return best; }
  nearestDefender(x, z, maxD, militaryOnly) { let best = null, bd = maxD; for (const u of this.units) { if (u.faction !== 'city' || u.dead) continue; if (militaryOnly && !u.military) continue; const d = Math.hypot(u.pos.x - x, u.pos.z - z); if (d < bd) { bd = d; best = u; } } return best; }
  enemiesInside() { for (const u of this.units) if (u.faction === 'enemy' && !u.dead && insideWalls(u.pos.x, u.pos.z)) return true; return false; }
  livingEnemies() { let n = 0; for (const u of this.units) if (u.faction === 'enemy' && !u.dead) n++; return n; }
  livingDefenders() { let n = 0; for (const u of this.units) if (u.faction === 'city' && !u.dead && u.military) n++; return n; }

  decideEnemy(u) {
    if (!this.invasion) {
      u.activity = 'camp';
      if (!u.waypoints.length && rng() < 0.3) u.waypoints = [{ x: u.campSpot.x + rand(-5, 5), z: u.campSpot.z + rand(-5, 5), final: true, b: null }];
      return;
    }
    const g = this.R.gates.E;
    const inside = insideWalls(u.pos.x, u.pos.z);
    if (u.crewOf) { // trebuchet crew follow their engine
      const t = u.crewOf;
      if (!t.destroyed) { u.activity = 'siege'; if (Math.hypot(u.pos.x - t.pos.x, u.pos.z - t.pos.z) > 4) u.waypoints = [{ x: t.pos.x + u.crewOff.x, z: t.pos.z + u.crewOff.z, final: true, b: null }]; return; }
      u.crewOf = null;
    }
    if (!inside) {
      const dGate = Math.hypot(u.pos.x - g.outer.x, u.pos.z - g.outer.z);
      if (g.closed && dGate < 9) {
        u.activity = 'breach';
        if (dGate > 3.5) u.waypoints = [{ x: g.x + g.dx * 1.5 + rand(-0.5, 0.5), z: 256 + rand(-2.5, 2.5), final: true, b: null }];
        else { u.moving = false; u.yaw = Math.atan2(-g.dx, 0); }
        return;
      }
      u.activity = 'march';
      const def = this.nearestDefender(u.pos.x, u.pos.z, 12, false);
      if (def && !insideWalls(def.pos.x, def.pos.z)) { u.waypoints = [{ x: def.pos.x, z: def.pos.z, final: true, b: null }]; return; }
      if (g.closed) u.waypoints = [{ x: g.outer.x + rand(-4, 4), z: g.outer.z + rand(-4, 4), final: true, b: null }];
      else u.waypoints = [{ x: g.outer.x + 0.5, z: 256 + rand(-2, 2) }, { x: g.inner.x + 0.5, z: 256 + rand(-2, 2), final: true, b: null }];
      return;
    }
    // inside the city
    u.activity = 'raid';
    const def = this.nearestDefender(u.pos.x, u.pos.z, 45, true) || this.nearestDefender(u.pos.x, u.pos.z, 25, false);
    if (def) { u.waypoints = [{ x: def.pos.x, z: def.pos.z, final: true, b: null }]; return; }
    // no defenders around: torch a building or head for the keep
    if (rng() < 0.4) {
      const b = this.nearest(this.R.buildings.filter(b => b.type !== 'keep' && b.type !== 'camp' && insideWalls(b.cx, b.cz) && !b.burnt), u.pos.x, u.pos.z, 60);
      if (b) { u.torch = b; u.waypoints = [{ x: b.outside.x + 0.5, z: b.outside.z + 0.5, final: true, b: null }]; return; }
    }
    if (u === this.warlord || rng() < 0.3) u.waypoints = [{ x: this.R.keep.outside.x + 0.5, z: this.R.keep.outside.z + 0.5, final: true, b: null }];
    else u.waypoints = [{ x: u.pos.x + rand(-15, 15), z: u.pos.z + rand(-15, 15), final: true, b: null }];
  }

  // ---------- invasion control ----------
  startInvasion() {
    if (this.invasion) return;
    this.invasion = true; this.enemyDir = 'E';
    const g = this.R.gates.E;
    g.closed = true;
    for (const [x, y, z] of g.cells) this.world.set(x, y, z, B.IRON);
    this.log('THE HORNS SOUND. The Iron Reach marches on the East Gate!', 'alarm');
    this.log('The East Gate portcullis slams shut. Townsfolk run for shelter.', 'alarm');
    for (const u of this.units) { u.decideT = rand(0, 1.5); u.waypoints = []; if (u.faction === 'city' && !u.military) u.activity = 'idle'; }
    this.ctx.siege.beginSiege(this);
  }
  endInvasion(victory) {
    this.invasion = false;
    const g = this.R.gates.E;
    if (g.closed) { g.closed = false; for (const [x, y, z] of g.cells) if (this.world.get(x, y, z) === B.IRON) this.world.set(x, y, z, B.AIR); }
    for (const u of this.units) { u.decideT = rand(0, 2); u.waypoints = []; u.activity = 'idle'; u.panic = false; }
    this.log(victory ? 'VICTORY! The invaders are broken. Bells ring across the kingdom.' : 'The kingdom has fallen. Smoke rises over the walls.', 'alarm');
    this.ctx.siege.endSiege();
  }

  // ---------- damage ----------
  damage(u, amount, source) {
    if (u.dead) return;
    u.hp -= amount;
    if (u.hp <= 0) {
      u.dead = true; u.deadT = 0; u.moving = false; u.waypoints = [];
      if (u.engine) u.engine.operator = null;
      if (u.faction === 'city' && (u.military || rng() < 0.4)) this.log(`${JOB_TITLE(u.job)} ${u.name} has fallen${source ? ' to ' + source : ''}.`, 'death');
      else if (u === this.warlord) this.log('WARLORD VARGATH IS SLAIN! The raiders waver.', 'alarm');
      else if (u.faction === 'enemy' && rng() < 0.15) this.log(`A raider falls${source ? ' to ' + source : ''}.`, 'kill');
      if (u === this.warlord) for (const e of this.units) if (e.faction === 'enemy' && !e.dead) e.hp = Math.min(e.hp, 25);
    }
  }
  damageArea(x, y, z, r, amount, source) {
    for (const u of this.units) {
      if (u.dead) continue;
      const d = Math.hypot(u.pos.x - x, u.pos.y + 0.9 - y, u.pos.z - z);
      if (d < r) this.damage(u, amount * (1 - d / r * 0.5), source);
    }
  }

  // ---------- main update ----------
  update(dt, hour) {
    const w = this.world;
    this.combatAcc += dt;
    const doCombat = this.combatAcc >= 0.1;
    if (doCombat) this.combatAcc = 0;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead) { u.deadT += dt; if (u.deadT > 12) u.removed = true; continue; }
      if (u.attackT > 0) u.attackT -= dt * 2.5;
      if (u.attackCd > 0) u.attackCd -= dt;
      u.decideT -= dt;
      if (u.decideT <= 0) { u.decideT = rand(2, 5); this.decide(u, hour); }
      if (u.waypoints.length) this.followWaypoints(u, dt);
      else { u.moving = false; if (u.activity === 'work' && !u.panic) u.walkPhase += dt * 3; }
      // fire damage
      if (w.get(Math.floor(u.pos.x), Math.floor(u.pos.y), Math.floor(u.pos.z)) === B.FIRE) { this.damage(u, 25 * dt, 'the flames'); if (!u.waypoints.length) u.waypoints = [{ x: u.pos.x + rand(-4, 4), z: u.pos.z + rand(-4, 4), final: true, b: null }]; }
      if (u.pos.y < 1) this.damage(u, 1000, 'the abyss');
      // combat
      if (doCombat) this.combat(u);
    }
    // torching
    for (const u of this.units) {
      if (u.torch && !u.dead && !u.waypoints.length) {
        const b = u.torch; u.torch = null;
        if (Math.hypot(u.pos.x - b.outside.x, u.pos.z - b.outside.z) < 4) {
          const f = this.ctx.fire;
          f.ignite(b.door.x, b.y0 + 2, b.door.z); f.ignite(b.door.x + b.door.dx, b.y0, b.door.z + b.door.dz);
          for (let k = 0; k < 4; k++) f.ignite(randInt(b.x0, b.x1), b.y0 + randInt(1, 3), randInt(b.z0, b.z1));
          if (!b.burnt) { b.burnt = true; this.log(`Raiders set fire to ${b.name}!`, 'fire'); }
        }
      }
    }
    // clean removed
    if (this.units.some(u => u.removed)) this.units = this.units.filter(u => !u.removed);
    // invasion resolution
    if (this.invasion) {
      const enemies = this.livingEnemies(), defenders = this.livingDefenders();
      if (enemies === 0 && this.ctx.siege.trebuchets.every(t => t.destroyed)) this.endInvasion(true);
      else if (defenders === 0 && !this.fallen) { this.fallen = true; this.log('The garrison is wiped out. The city burns.', 'alarm'); }
    }
  }
  combat(u) {
    const hostile = u.faction === 'city' ? 'enemy' : 'city';
    let target = null, bd = 1.8;
    for (const o of this.units) {
      if (o.dead || o.faction !== hostile) continue;
      if (u.faction === 'enemy' || u.military) {
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < bd && Math.abs(o.pos.y - u.pos.y) < 2.5) { bd = d; target = o; }
      }
    }
    if (target) {
      u.yaw = Math.atan2(target.pos.x - u.pos.x, target.pos.z - u.pos.z);
      if (u.attackCd <= 0) {
        u.attackCd = 1.0; u.attackT = 1;
        this.damage(target, u.dmg, u.faction === 'enemy' ? 'a raider' : `${JOB_TITLE(u.job)} ${u.name}`);
        this.ctx.particles.spawn(target.pos.x, target.pos.y + 1.2, target.pos.z, rand(-2, 2), 3, rand(-2, 2), 0.5, 0.2, 3, 0.8, 0.1, 0.1);
      }
      u.waypoints = [];
      return;
    }
    // guards on walls throw javelins
    if (u.job === 'guard' && this.invasion) {
      u.rangedCd -= 0.1;
      if (u.rangedCd <= 0) {
        const e = this.nearestEnemy(u.pos.x, u.pos.z, 28);
        if (e) { u.rangedCd = 3.5; u.attackT = 1; u.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z); this.ctx.siege.throwJavelin(u, e); }
      }
    }
    // raiders attack the gate
    if (u.activity === 'breach' && u.faction === 'enemy') {
      const g = this.R.gates.E;
      if (g.closed && Math.hypot(u.pos.x - (g.x + g.dx), u.pos.z - 256) < 4.5 && u.attackCd <= 0) {
        u.attackCd = 1.2; u.attackT = 1; g.hp -= u.dmg * 0.5;
        this.ctx.particles.spawn(g.x + g.dx + 0.5, PY + 2, u.pos.z, rand(-1, 1), 2, rand(-1, 1), 0.4, 0.2, 3, 1, 0.8, 0.3);
        if (g.hp <= 0) {
          g.closed = false;
          for (const [x, y, z] of g.cells) { if (this.world.get(x, y, z) === B.IRON) { this.world.set(x, y, z, B.AIR); this.ctx.particles.debris(x, y, z, B.IRON, 2); } }
          this.log('THE EAST GATE IS BREACHED! Raiders pour into the Garrison Quarter!', 'alarm');
          for (const o of this.units) if (o.faction === 'enemy') { o.decideT = 0; o.waypoints = []; }
        }
      }
    }
  }
}
