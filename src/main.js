import * as THREE from 'three';
import { World, ChunkRenderer, CS } from './world.js';
import { generate, PY, WX0, WX1 } from './worldgen.js';
import { B, COLORS } from './blocks.js';
import { Particles } from './particles.js';
import { FireSystem } from './fire.js';
import { Humanoids } from './humanoids.js';
import { Population, JOB_TITLE } from './npc.js';
import { Siege } from './siege.js';
import { Dragon } from './dragon.js';
import { Player } from './player.js';
import { UI } from './ui.js';

const W = 512, H = 64, D = 512;
const $ = (id) => document.getElementById(id);
const setProgress = (p, msg) => { $('bar').style.width = `${Math.round(p * 100)}%`; if (msg) $('loadmsg').textContent = msg; };
// rAF can stall in hidden/occluded tabs, so fall back to a timer during loading
const SYNC = new URLSearchParams(location.search).has('sync');
const nextFrame = () => SYNC ? Promise.resolve() : new Promise(r => { let done = false; const fin = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(fin); setTimeout(fin, 60); });

async function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1200);
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

  const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x4a3a2a, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.1); scene.add(sun);
  scene.fog = new THREE.Fog(0xbfd4ea, 140, 760);

  setProgress(0.02, 'Raising mountains and carving the river...');
  await nextFrame();
  const world = new World(W, H, D);
  const R = generate(world);
  setProgress(0.25, `Built ${R.buildings.length} buildings. Meshing the kingdom...`);
  await nextFrame();

  const chunks = new ChunkRenderer(world, scene);
  const total = world.cx * world.cz;
  // mesh the chunks nearest the spawn first; the rest stream in during the first seconds of play
  const spawn = { x: 256, z: 388 };
  const order = [];
  for (let cz = 0; cz < world.cz; cz++) for (let cx = 0; cx < world.cx; cx++) order.push({ key: cx + cz * world.cx, d: Math.hypot((cx + 0.5) * CS - spawn.x, (cz + 0.5) * CS - spawn.z) });
  order.sort((a, b) => a.d - b.d);
  const upfront = 72;
  world.dirty.clear();
  for (let i = 0; i < order.length; i++) {
    if (i < upfront) {
      chunks.rebuild(order[i].key);
      if (i % 6 === 5) { setProgress(0.25 + 0.7 * i / upfront, `Meshing chunks ${i + 1}/${total} (the rest stream in while you play)`); await nextFrame(); }
    } else world.dirty.add(order[i].key);
  }

  setProgress(0.96, 'Waking the townsfolk...');
  await nextFrame();

  const ui = new UI(world, R);
  ui.buildMinimap();
  const log = (m, k) => ui.log(m, k);
  const particles = new Particles(scene, world);
  const fire = new FireSystem(world, particles);
  const siege = new Siege(scene, world, R, particles, fire, log);
  const pop = new Population(world, R, { log, fire, particles, siege });
  siege.pop = pop;
  const dragon = new Dragon(scene, world, R, particles, fire, log);
  dragon.pop = pop; siege.dragon = dragon;
  const humanoids = new Humanoids(scene, 900);
  const player = new Player(camera, world, renderer.domElement);
  player.pos.set(256.5, PY, 388);
  player.yaw = 0; // look north toward the gate
  window.game = { player, world, R, scene, camera, renderer, pop, dragon, siege, fire, particles, chunks };

  let destroyedTotal = 0;
  world.onBlockChanged = (list) => { destroyedTotal += list.length; };
  fire.onBurnt = () => { destroyedTotal++; };

  // ------- interaction -------
  let hoverInfo = '';
  let hitCache = null;
  player.onClick = (button) => {
    const f = player.forward();
    const o = camera.position;
    if (button === 0) {
      const hit = world.raycast(o.x, o.y, o.z, f.x, f.y, f.z, 60);
      if (hit) {
        const d = world.explode(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 1.7, 1.2);
        for (const q of d) particles.debris(q[0], q[1], q[2], q[3], 2);
        pop.damageArea(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 2.5, 60, 'the royal warhammer');
      }
      // melee hit on units / dragon
      const u = unitUnderCrosshair(6);
      if (u) pop.damage(u, 60, 'the royal warhammer');
      if (dragon.alive) { const dd = distToRay(dragon.pos); if (dd < dragon.hitR && Math.hypot(dragon.pos.x - o.x, dragon.pos.y - o.y, dragon.pos.z - o.z) < 10) dragon.damage(80, 'the royal warhammer'); }
    } else if (button === 2) {
      siege.fireball({ x: o.x + f.x * 1.5, y: o.y + f.y * 1.5 - 0.3, z: o.z + f.z * 1.5 }, f, 60);
    } else if (button === 1) {
      const hit = world.raycast(o.x, o.y, o.z, f.x, f.y, f.z, 40);
      if (hit) { world.set(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz, B.COBBLE); }
    }
  };
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI') { if (!pop.invasion) pop.startInvasion(); else log('The invasion is already underway.'); }
    if (e.code === 'KeyG') { if (dragon.alive) { if (dragon.hostile) { dragon.callOff(); log(`${dragon.name} breaks off its attack.`); } else dragon.attack(); } else log('The dragon is dead. Its bones lie where it fell.'); }
    if (e.code === 'KeyT') { hour = (hour + 3) % 24; }
    if (e.code === 'KeyQ') { const f = player.forward(); const o = camera.position; const hit = world.raycast(o.x, o.y, o.z, f.x, f.y, f.z, 40); if (hit) world.set(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz, B.COBBLE); }
    if (e.code === 'KeyX') { const f = player.forward(); const o = camera.position; const hit = world.raycast(o.x, o.y, o.z, f.x, f.y, f.z, 40); if (hit) fire.ignite(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz); }
    if (e.code === 'KeyH') { $('help').classList.toggle('hidden'); }
    if (e.code === 'KeyP') { $('help').classList.add('hidden'); }
  });
  function distToRay(p) {
    const f = player.forward(); const o = camera.position;
    const vx = p.x - o.x, vy = p.y - o.y, vz = p.z - o.z;
    const t = vx * f.x + vy * f.y + vz * f.z;
    if (t < 0) return Infinity;
    return Math.hypot(vx - f.x * t, vy - f.y * t, vz - f.z * t);
  }
  function unitUnderCrosshair(maxDist = 60) {
    const o = camera.position;
    let best = null, bd = 1.0;
    for (const u of pop.units) {
      if (u.dead) continue;
      const dist = Math.hypot(u.pos.x - o.x, u.pos.z - o.z);
      if (dist > maxDist) continue;
      const d = distToRay({ x: u.pos.x, y: u.pos.y + 1, z: u.pos.z });
      const tol = 0.6 + dist * 0.02;
      if (d < tol && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  const ACT = { work: 'working', sleep: 'sleeping', social: 'drinking at the tavern', evening: 'heading home', wander: 'wandering the streets', shelter: 'RUNNING FOR SHELTER', hide: 'hiding', patrol: 'patrolling the wall', defend: 'DEFENDING THE CITY', operate: 'manning a ballista', train: 'training in the yard', camp: 'waiting in camp', march: 'MARCHING ON THE CITY', breach: 'BATTERING THE GATE', raid: 'RAIDING', siege: 'crewing a trebuchet', idle: 'idle' };

  // ------- day/night -------
  let hour = 8.5;
  const skyDay = new THREE.Color(0x8fb8e8), skyDusk = new THREE.Color(0xe08a5a), skyNight = new THREE.Color(0x0b1026);
  const sky = new THREE.Color();
  function updateDaylight(dt) {
    hour = (hour + dt / 15) % 24; // one day = 6 minutes
    const a = (hour / 24) * Math.PI * 2 - Math.PI / 2; // sunrise at 6
    const elev = Math.sin(a);
    sun.position.set(Math.cos(a) * 200, Math.max(-20, elev * 200), 120).add(new THREE.Vector3(player.pos.x, 0, player.pos.z));
    sun.target.position.set(player.pos.x, 0, player.pos.z); sun.target.updateMatrixWorld();
    const day = Math.max(0, Math.min(1, (elev + 0.1) / 0.5));
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.25);
    sky.copy(skyNight).lerp(skyDay, day).lerp(skyDusk, dusk * 0.6 * (1 - Math.abs(day - 0.5)));
    scene.background = sky; scene.fog.color.copy(sky);
    sun.intensity = 0.15 + day * 1.05; sun.color.setHSL(0.09, 0.6 * dusk + 0.2, 0.9 - dusk * 0.2);
    hemi.intensity = 0.25 + day * 0.7;
    ui.setClock(hour);
  }

  // ------- auto-events -------
  let elapsed = 0, autoInvasion = false, autoDragon = false;

  // ------- loop -------
  $('loading').style.display = 'none';
  $('hud').style.display = 'block';
  log('Welcome to the Kingdom of Aldermere. Click to take control. Press H for help.');
  log(`${R.buildings.length} buildings, every one with an interior and a purpose.`);
  let last = performance.now();
  // rAF with a timer fallback so the simulation keeps ticking (slowly) in occluded/background views
  const schedule = (fn) => { let done = false; requestAnimationFrame((t) => { if (!done) { done = true; fn(t); } }); setTimeout(() => { if (!done) { done = true; fn(performance.now()); } }, 120); };
  function frame(now) {
    schedule(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt);
  }
  window.game.step = step;
  function step(dt) {
    elapsed += dt;
    if (!autoInvasion && elapsed > 75) { autoInvasion = true; pop.startInvasion(); }
    if (!autoDragon && elapsed > 140) { autoDragon = true; dragon.attack(); }
    if (dragon.alive && !dragon.hostile && dragon.state === 'roost' && elapsed > 140 && Math.random() < dt * (pop.invasion ? 0.02 : 0.006)) dragon.attack();

    player.update(dt);
    updateDaylight(dt);
    pop.update(dt, hour);
    siege.update(dt, hour);
    dragon.update(dt);
    fire.update(dt);
    particles.update(dt);
    humanoids.update(pop.units);
    chunks.update(world.dirty.size > 12 ? 40 : 8);

    // hover info
    hoverInfo = '';
    const u = unitUnderCrosshair(60);
    if (u) {
      const act = ACT[u.activity] || u.activity;
      const where = u.inBuilding ? ` in ${u.inBuilding.name}` : '';
      const wk = u.work ? `Works at ${u.work.name}. ` : u.field ? 'Works the fields. ' : '';
      const hm = u.home ? `Lives at ${u.home.name}.` : '';
      hoverInfo = `<b>${u.name}</b> <span class="job">${JOB_TITLE(u.job)}${u.faction === 'enemy' ? ' of the Iron Reach' : ''}</span><br>${act}${where} · ${Math.ceil(u.hp)} HP<br><span class="dim">${wk}${hm}</span>`;
    } else {
      const f = player.forward(); const o = camera.position;
      if (dragon.alive && distToRay(dragon.pos) < dragon.hitR + 2) hoverInfo = `<b>${dragon.name}</b> <span class="job">Dragon</span><br>${dragon.state} · ${Math.ceil(dragon.hp)} HP · ${dragon.blocksBurnt} blocks torched`;
      else {
        const hit = world.raycast(o.x, o.y, o.z, f.x, f.y, f.z, 70);
        if (hit) {
          const b = R.buildings.find(b => hit.x >= b.x0 - 1 && hit.x <= b.x1 + 1 && hit.z >= b.z0 - 1 && hit.z <= b.z1 + 1 && hit.y >= b.y0 - 1 && hit.y <= b.y1);
          if (b) {
            const staff = pop.units.filter(x => (x.work === b || x.home === b) && !x.dead);
            const jobs = [...new Set(staff.map(s => JOB_TITLE(s.job)))].slice(0, 6).join(', ');
            hoverInfo = `<b>${b.name}</b> <span class="job">${b.district || ''}</span><br><span class="dim">${b.desc}</span>${jobs ? `<br>${staff.length} people: ${jobs}` : ''}${b.damage ? `<br><span class="warn">${b.damage} blocks damaged</span>` : ''}${b.burnt ? '<br><span class="warn">Set ablaze by raiders</span>' : ''}`;
          }
        }
      }
    }
    // location
    const inB = R.buildings.find(b => player.pos.x >= b.x0 && player.pos.x <= b.x1 + 1 && player.pos.z >= b.z0 && player.pos.z <= b.z1 + 1 && player.pos.y >= b.y0 - 1 && player.pos.y <= b.y1);
    const loc = inB ? `${inB.name} — ${inB.district || ''}` : R.districtOf(player.pos.x, player.pos.z);
    let citizens = 0, soldiers = 0, enemies = 0;
    for (const x of pop.units) { if (x.dead) continue; if (x.faction === 'enemy') enemies++; else if (x.military) soldiers++; else citizens++; }
    let status;
    if (pop.invasion) {
      const g = R.gates.E;
      status = pop.fallen ? 'THE CITY HAS FALLEN' : g.closed ? `SIEGE — East Gate holding (${Math.max(0, Math.round(g.hp / g.maxHp * 100))}%)` : pop.enemiesInside() ? 'SIEGE — RAIDERS INSIDE THE WALLS' : 'SIEGE — enemy at the gates';
    } else status = elapsed < 75 ? `Peace. The Iron Reach stirs in the east... (${Math.max(0, Math.ceil(75 - elapsed))}s)` : 'Peace';
    ui.update(dt, { location: loc, fly: player.fly, citizens, soldiers, enemies, fires: fire.burning.size, destroyed: destroyedTotal, status, invasion: pop.invasion, hover: hoverInfo, dragon, player, units: pop.units });
    renderer.render(scene, camera);
  }
  schedule(frame);
}

boot().catch(err => { console.error(err); $('loadmsg').textContent = 'Error: ' + err.message; });
