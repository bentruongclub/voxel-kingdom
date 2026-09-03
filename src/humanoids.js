import * as THREE from 'three';

// Instanced humanoid renderer: 7 box parts per unit (head, torso, 2 legs, 2 arms, hat/helmet).
const PARTS = [
  { name: 'head', size: [0.5, 0.5, 0.5], pivot: [0, 1.45, 0], offset: [0, 0.25, 0], colorKey: 'skin' },
  { name: 'hat', size: [0.56, 0.22, 0.56], pivot: [0, 1.85, 0], offset: [0, 0.1, 0], colorKey: 'hat' },
  { name: 'torso', size: [0.6, 0.7, 0.34], pivot: [0, 0.75, 0], offset: [0, 0.35, 0], colorKey: 'shirt' },
  { name: 'legL', size: [0.26, 0.72, 0.3], pivot: [-0.15, 0.75, 0], offset: [0, -0.36, 0], colorKey: 'pants', swing: 1 },
  { name: 'legR', size: [0.26, 0.72, 0.3], pivot: [0.15, 0.75, 0], offset: [0, -0.36, 0], colorKey: 'pants', swing: -1 },
  { name: 'armL', size: [0.2, 0.66, 0.24], pivot: [-0.41, 1.4, 0], offset: [0, -0.33, 0], colorKey: 'shirt', swing: -1 },
  { name: 'armR', size: [0.2, 0.66, 0.24], pivot: [0.41, 1.4, 0], offset: [0, -0.33, 0], colorKey: 'shirt', swing: 1 },
];

export class Humanoids {
  constructor(scene, capacity = 700) {
    this.capacity = capacity;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    this.meshes = PARTS.map(() => {
      const m = new THREE.InstancedMesh(geo, mat, capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    this.m = new THREE.Matrix4(); this.a = new THREE.Matrix4(); this.b = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.col = new THREE.Color();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }
  // units: array of {pos:{x,y,z}, yaw, walkPhase, moving, colors:{skin,shirt,pants,hat}, dead, fall, scale}
  update(units) {
    const n = Math.min(units.length, this.capacity);
    for (let p = 0; p < PARTS.length; p++) {
      const part = PARTS[p], mesh = this.meshes[p];
      for (let i = 0; i < n; i++) {
        const u = units[i];
        if (u.removed || (part.name === 'hat' && !u.colors.hat)) { mesh.setMatrixAt(i, this.zero); continue; }
        const sc = u.scale || 1;
        const swing = part.swing ? Math.sin(u.walkPhase) * (u.moving ? 0.8 : 0) * part.swing : 0;
        // base: translate to unit pos, rotate yaw (and fall when dead)
        this.e.set(u.dead ? -Math.PI / 2 * Math.min(1, u.deadT || 1) : 0, u.yaw, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        this.v.set(u.pos.x, u.pos.y + (u.dead ? 0.3 : 0), u.pos.z);
        this.s.set(sc, sc, sc);
        this.m.compose(this.v, this.q, this.s);
        // pivot
        this.a.makeTranslation(part.pivot[0], part.pivot[1], part.pivot[2]);
        this.m.multiply(this.a);
        if (swing !== 0) { this.a.makeRotationX(swing); this.m.multiply(this.a); }
        if (part.name === 'armR' && u.attackT > 0) { this.a.makeRotationX(-1.6 * Math.sin(u.attackT * Math.PI)); this.m.multiply(this.a); }
        this.a.makeTranslation(part.offset[0], part.offset[1], part.offset[2]); this.m.multiply(this.a);
        this.a.makeScale(part.size[0], part.size[1], part.size[2]); this.m.multiply(this.a);
        mesh.setMatrixAt(i, this.m);
        const c = u.colors[part.colorKey] ?? u.colors.shirt;
        this.col.setHex(c);
        if (u.dead) this.col.multiplyScalar(0.6);
        mesh.setColorAt(i, this.col);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
