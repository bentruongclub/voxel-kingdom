import { COLORS, B } from './blocks.js';

export class UI {
  constructor(world, R) {
    this.world = world; this.R = R;
    this.$ = (id) => document.getElementById(id);
    this.logEl = this.$('log');
    this.entries = [];
    this.mini = this.$('minimap'); this.mctx = this.mini.getContext('2d');
    this.base = document.createElement('canvas'); this.base.width = 256; this.base.height = 256;
    this.miniAcc = 0;
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 0;
  }
  log(msg, kind = '') {
    const d = document.createElement('div');
    d.className = 'entry ' + kind;
    const t = this.clock || '';
    d.innerHTML = `<span class="t">${t}</span>${msg}`;
    this.logEl.prepend(d);
    this.entries.push(d);
    if (this.entries.length > 14) { const old = this.entries.shift(); old.remove(); }
    setTimeout(() => { d.classList.add('fade'); }, 14000);
  }
  buildMinimap() {
    const ctx = this.base.getContext('2d');
    const img = ctx.createImageData(256, 256);
    const w = this.world;
    for (let z = 0; z < 256; z++) for (let x = 0; x < 256; x++) {
      const wx = x * 2, wz = z * 2;
      let y = w.H - 1;
      while (y > 0 && w.get(wx, y, wz) === B.AIR) y--;
      const t = w.get(wx, y, wz);
      const c = COLORS[t];
      const shade = 0.6 + (y / w.H) * 0.7;
      const i = (x + z * 256) * 4;
      img.data[i] = c[0] * 255 * shade; img.data[i + 1] = c[1] * 255 * shade; img.data[i + 2] = c[2] * 255 * shade; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  updateMinimap(player, units, dragon) {
    const c = this.mctx;
    c.drawImage(this.base, 0, 0);
    for (const u of units) {
      if (u.dead) continue;
      c.fillStyle = u.faction === 'enemy' ? '#ff3030' : u.military ? '#4aa3ff' : '#f5f0e0';
      c.fillRect(u.pos.x / 2 - 1, u.pos.z / 2 - 1, 2, 2);
    }
    if (dragon && dragon.state !== 'dead') { c.fillStyle = '#ff8a1f'; c.beginPath(); c.arc(dragon.pos.x / 2, dragon.pos.z / 2, 4, 0, 7); c.fill(); }
    // player arrow
    c.save(); c.translate(player.pos.x / 2, player.pos.z / 2); c.rotate(-player.yaw + Math.PI);
    c.fillStyle = '#7CFC00'; c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 5); c.lineTo(-4, 5); c.closePath(); c.fill(); c.restore();
  }
  setClock(hour) {
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    this.clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    this.$('clock').textContent = this.clock;
  }
  update(dt, state) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    this.$('fps').textContent = this.fps;
    this.$('loc').textContent = state.location;
    this.$('mode').textContent = state.fly ? 'FLYING' : 'ON FOOT';
    this.$('pop').textContent = `${state.citizens} citizens · ${state.soldiers} soldiers · ${state.enemies} raiders`;
    this.$('fires').textContent = `${state.fires} fires · ${state.destroyed} blocks destroyed`;
    this.$('status').textContent = state.status;
    this.$('status').className = state.invasion ? 'alarm' : '';
    const hv = this.$('hover');
    if (state.hover) { hv.style.display = 'block'; hv.innerHTML = state.hover; } else hv.style.display = 'none';
    const dragonBar = this.$('dragonbar');
    if (state.dragon && state.dragon.hostile || (state.dragon && state.dragon.state === 'dying')) {
      dragonBar.style.display = 'block';
      this.$('dragonhp').style.width = `${Math.max(0, state.dragon.hp / state.dragon.maxHp * 100)}%`;
      this.$('dragonname').textContent = `${state.dragon.name} — ${state.dragon.alive ? Math.ceil(state.dragon.hp) + ' / ' + state.dragon.maxHp : 'SLAIN'}`;
    } else dragonBar.style.display = 'none';
    const gate = this.R.gates.E;
    const gb = this.$('gatebar');
    if (gate.closed) { gb.style.display = 'block'; this.$('gatehp').style.width = `${Math.max(0, gate.hp / gate.maxHp * 100)}%`; } else gb.style.display = 'none';
    this.miniAcc += dt;
    if (this.miniAcc > 0.15) { this.miniAcc = 0; this.updateMinimap(state.player, state.units, state.dragon); }
  }
}
