import { B } from './blocks.js';
import { fbm, rng, rand, randInt, pick, clamp, lerp, hash2, randomName } from './util.js';

export const PY = 20;            // city ground level (entities stand at y=PY)
export const WATER_Y = 18;
export const WX0 = 136, WX1 = 376; // outer wall bounds
export const CENTER = 256;

let world, hm, R;

const smooth = (t) => t * t * (3 - 2 * t);

export function riverZ(x) { return 442 + 16 * Math.sin(x * 0.018) + 5 * Math.sin(x * 0.061 + 2); }

function terrainHeight(x, z) {
  const dc = Math.max(Math.abs(x - CENTER), Math.abs(z - CENTER));
  let h = 17 + fbm(x * 0.01, z * 0.01, 4) * 9;
  if (dc < 150) h = PY; else if (dc < 190) h = lerp(PY, h, smooth((dc - 150) / 40));
  const e = Math.max(0, (dc - 212) / 44);
  if (e > 0) h += e * e * (22 + fbm(x * 0.03, z * 0.03, 3) * 28);
  const dr = Math.abs(z - riverZ(x));
  if (dr < 7) h = Math.min(h, 15 + dr * 0.35);
  else if (dr < 11) h = Math.min(h, lerp(17.5, h, (dr - 7) / 4));
  return h;
}

function column(x, z) {
  const hi = hm[x + z * world.W];
  const W = world.W, D = world.D, data = world.data;
  for (let y = 0; y < hi; y++) {
    let t = y < hi - 4 ? B.STONE : B.DIRT;
    if (y === hi - 1) {
      if (hi - 1 < WATER_Y + 1) t = B.SAND;
      else if (hi > 46) t = B.SNOW;
      else if (hi > 38) t = (hash2(x, z) < 0.3 ? B.GRAVEL : B.STONE);
      else if (hi > 32) t = (hash2(x, z) < 0.5 ? B.MOSS : B.STONE);
      else t = B.GRASS;
    }
    data[(y * D + z) * W + x] = t;
  }
  for (let y = hi; y <= WATER_Y; y++) data[(y * D + z) * W + x] = B.WATER;
}

function genTerrain() {
  const W = world.W, D = world.D;
  hm = new Int16Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) hm[x + z * W] = Math.floor(terrainHeight(x, z));
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) column(x, z);
}

export function groundAt(x, z) { return hm[Math.floor(x) + Math.floor(z) * world.W]; }

function flatten(x0, z0, x1, z1, y, margin = 1) {
  for (let z = z0 - margin; z <= z1 + margin; z++) for (let x = x0 - margin; x <= x1 + margin; x++) {
    if (x < 0 || z < 0 || x >= world.W || z >= world.D) continue;
    hm[x + z * world.W] = y;
    world.fill(x, 0, z, x, world.H - 1, z, B.AIR);
    column(x, z);
  }
}

function avgGround(x0, z0, x1, z1) {
  let s = 0, n = 0;
  for (let z = z0; z <= z1; z += 2) for (let x = x0; x <= x1; x += 2) { s += hm[x + z * world.W]; n++; }
  return Math.round(s / n);
}

// ---------------- roads ----------------
function roadCell(x, z) {
  if (x < 0 || z < 0 || x >= world.W || z >= world.D) return;
  const hi = hm[x + z * world.W];
  if (hi - 1 <= WATER_Y) {
    // bridge
    world.set(x, WATER_Y + 1, z, B.PLANK);
    return;
  }
  world.set(x, hi - 1, z, B.COBBLE);
}
function genRoads() {
  // avenues out of the four gates to the map edges
  for (let z = WX1; z < world.D; z++) for (let x = 253; x <= 259; x++) roadCell(x, z);
  for (let z = 0; z <= WX0; z++) for (let x = 253; x <= 259; x++) roadCell(x, z);
  for (let x = WX1; x < world.W; x++) for (let z = 253; z <= 259; z++) roadCell(x, z);
  for (let x = 0; x <= WX0; x++) for (let z = 253; z <= 259; z++) roadCell(x, z);
  // bridge rails & pillars over the river on the south road
  for (let z = 400; z < 490; z++) {
    if (hm[256 + z * world.W] - 1 <= WATER_Y) {
      for (const x of [252, 260]) {
        world.set(x, WATER_Y + 1, z, B.LOG);
        if (z % 4 === 0) world.fill(x, 12, z, x, WATER_Y + 1, z, B.CASTLE);
      }
      for (let x = 253; x <= 259; x++) if (z % 4 === 0) world.fill(x, 13, z, x, WATER_Y, z, B.CASTLE);
    }
  }
}

// ---------------- registry helpers ----------------
function addBuilding(b) {
  b.id = R.buildings.length;
  b.workSpots = b.workSpots || [];
  b.beds = b.beds || [];
  b.jobs = b.jobs || [];
  b.cx = (b.x0 + b.x1) / 2; b.cz = (b.z0 + b.z1) / 2;
  R.buildings.push(b);
  return b;
}

// ---------------- generic building ----------------
const JOB_SLOTS = {
  house: [], farmhouse: [], cottage: [],
  blacksmith: ['blacksmith', 'blacksmith'], bakery: ['baker', 'baker'], tavern: ['innkeeper', 'cook', 'bard'],
  inn: ['innkeeper', 'maid'], library: ['scholar', 'scholar'], granary: ['steward'], stables: ['stablehand', 'stablehand'],
  armory: ['armorer', 'armorer'], guildhall: ['guildmaster', 'clerk', 'clerk'], townhall: ['mayor', 'clerk', 'scribe'],
  apothecary: ['apothecary'], tailor: ['tailor'], butcher: ['butcher'], carpenter: ['carpenter', 'carpenter'],
  mason: ['mason', 'mason'], tanner: ['tanner'], school: ['teacher', 'teacher'], chapel: ['priest'], church: ['priest', 'acolyte'],
  barn: ['farmer'], mill: ['miller'], stall: ['merchant'], barracks: [], watchtower: [], gatehouse: [], keep: [], kitchen: ['cook', 'cook'],
  fishmonger: ['fishmonger'], brewery: ['brewer', 'brewer'], candlemaker: ['chandler'], weaver: ['weaver'], jeweler: ['jeweler'],
  chapelry: ['priest'],
};
const NAMES = {
  blacksmith: 'Smithy', bakery: 'Bakery', tavern: 'Tavern', inn: 'Inn', library: 'Great Library', granary: 'Granary', stables: 'Stables',
  armory: 'Armory', guildhall: 'Guildhall', townhall: 'Town Hall', apothecary: 'Apothecary', tailor: "Tailor's Shop", butcher: 'Butchery',
  carpenter: "Carpenter's Workshop", mason: "Mason's Yard", tanner: 'Tannery', school: 'Schoolhouse', chapel: 'Chapel', church: 'Cathedral of St. Aldric',
  barn: 'Barn', mill: 'Windmill', house: 'House', farmhouse: 'Farmhouse', cottage: 'Cottage', barracks: 'Barracks', watchtower: 'Watchtower',
  gatehouse: 'Gatehouse', stall: 'Market Stall', kitchen: 'Royal Kitchens', fishmonger: 'Fishmonger', brewery: 'Brewery', candlemaker: 'Chandlery',
  weaver: "Weaver's House", jeweler: 'Jeweler',
};
const DESC = {
  blacksmith: 'Forges tools and weapons. Ballista bolts are made here.', bakery: 'Bakes bread for the city each morning.',
  tavern: 'Ale, songs and rumours. Busy after sundown.', inn: 'Beds for travellers and merchants.', library: 'Scholars keep the kingdom\'s records.',
  granary: 'Stores the harvest. Guarded closely in wartime.', stables: 'Horses for the royal guard.', armory: 'Arms and armour for the garrison.',
  guildhall: 'Merchants and craftsmen settle their affairs.', townhall: 'The mayor governs the lower city from here.',
  apothecary: 'Herbs, tinctures and healing salves.', tailor: 'Cloth and clothing for the townsfolk.', butcher: 'Meat from the farms outside the walls.',
  carpenter: 'Timber, furniture and siege engine parts.', mason: 'Cuts the stone that repairs the walls.', tanner: 'Leather for boots and armour.',
  school: 'Children learn letters and numbers.', chapel: 'A quiet place of prayer.', church: 'Seat of the bishop. Townsfolk shelter here in a siege.',
  barn: 'Hay and tools for the farms.', mill: 'Grinds grain from the fields into flour.', house: 'Home of a city family.', farmhouse: 'Home of a farming family.',
  cottage: 'Hamlet home.', barracks: 'Where the garrison sleeps.', watchtower: 'Guards watch the horizon.', gatehouse: 'Controls the gate. Portcullis drops during an attack.',
  stall: 'Sells goods in the market square.', kitchen: 'Feeds the royal court.', fishmonger: 'Fish from the river.', brewery: 'Brews the ale the taverns pour.',
  candlemaker: 'Candles and lamp oil.', weaver: 'Wool becomes cloth here.', jeweler: 'Gold and gems for the nobility.',
};

const STYLE = {
  timber: { wall: B.PLASTER, roof: B.ROOF_RED, beams: true },
  timber2: { wall: B.PLASTER, roof: B.ROOF_SLATE, beams: true },
  stone: { wall: B.COBBLE, roof: B.ROOF_SLATE, beams: false },
  stone2: { wall: B.CASTLE, roof: B.ROOF_GREEN, beams: false },
  thatch: { wall: B.PLASTER, roof: B.THATCH, beams: true },
  rustic: { wall: B.LOG, roof: B.THATCH, beams: false },
};

// side: 'N' (-z), 'S' (+z), 'E' (+x), 'W' (-x)
const SIDE_DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

function buildStructure(o) {
  const { x0, z0, x1, z1, type } = o;
  const floors = o.floors || 1;
  const floorH = o.floorH || 4;
  const st = STYLE[o.style || 'timber'];
  const wallMat = o.wallMat ?? st.wall, roofMat = o.roofMat ?? st.roof;
  const y0 = o.y0 ?? PY;
  const inside = type !== 'farmhouse' && type !== 'cottage' && type !== 'barn' && !o.outside;
  if (!inside) flatten(x0, z0, x1, z1, y0, 1);
  const topY = y0 + floors * floorH;
  const doorSide = o.doorSide || 'S';
  const [ddx, ddz] = SIDE_DIR[doorSide];
  const doorW = o.doorW || 1;
  // floor
  world.fill(x0, y0 - 1, z0, x1, y0 - 1, z1, o.floorMat ?? (type === 'stables' || type === 'barn' ? B.DIRT : B.PLANK));
  // walls per floor
  for (let f = 0; f < floors; f++) {
    const fy0 = y0 + f * floorH, fy1 = fy0 + floorH - 1;
    world.walls(x0, fy0, z0, x1, fy1, z1, wallMat);
    if (st.beams && !o.noBeams) {
      for (const [bx, bz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) world.fill(bx, fy0, bz, bx, fy1, bz, B.BEAM);
      world.walls(x0, fy1, z0, x1, fy1, z1, B.BEAM);
    }
    if (f > 0) world.fill(x0 + 1, fy0 - 1, z0 + 1, x1 - 1, fy0 - 1, z1 - 1, B.PLANK);
    // windows
    const wy = fy0 + 1;
    const winH = o.winH || 1;
    for (let x = x0 + 2; x <= x1 - 2; x += 3) {
      if (!(doorSide === 'N' && Math.abs(x - Math.floor((x0 + x1) / 2)) <= doorW && f === 0)) world.fill(x, wy, z0, x, wy + winH - 1, z0, B.GLASS);
      if (!(doorSide === 'S' && Math.abs(x - Math.floor((x0 + x1) / 2)) <= doorW && f === 0)) world.fill(x, wy, z1, x, wy + winH - 1, z1, B.GLASS);
    }
    for (let z = z0 + 2; z <= z1 - 2; z += 3) {
      if (!(doorSide === 'W' && Math.abs(z - Math.floor((z0 + z1) / 2)) <= doorW && f === 0)) world.fill(x0, wy, z, x0, wy + winH - 1, z, B.GLASS);
      if (!(doorSide === 'E' && Math.abs(z - Math.floor((z0 + z1) / 2)) <= doorW && f === 0)) world.fill(x1, wy, z, x1, wy + winH - 1, z, B.GLASS);
    }
  }
  // door
  const mx = Math.floor((x0 + x1) / 2), mz = Math.floor((z0 + z1) / 2);
  let door;
  if (doorSide === 'S') door = { x: mx, z: z1 }; else if (doorSide === 'N') door = { x: mx, z: z0 };
  else if (doorSide === 'E') door = { x: x1, z: mz }; else door = { x: x0, z: mz };
  const dh = o.doorH || 2;
  for (let k = -(doorW - 1); k <= doorW - 1; k++) {
    const dx = door.x + (ddz !== 0 ? k : 0), dz = door.z + (ddx !== 0 ? k : 0);
    world.fill(dx, y0, dz, dx, y0 + dh - 1, dz, B.AIR);
  }
  const insideCell = { x: door.x - ddx, z: door.z - ddz };
  const outsideCell = { x: door.x + ddx, z: door.z + ddz };
  // roof
  if (o.roofStyle === 'flat' || type === 'watchtower') {
    world.fill(x0, topY, z0, x1, topY, z1, wallMat);
    for (let x = x0; x <= x1; x += 2) { world.set(x, topY + 1, z0, wallMat); world.set(x, topY + 1, z1, wallMat); }
    for (let z = z0; z <= z1; z += 2) { world.set(x0, topY + 1, z, wallMat); world.set(x1, topY + 1, z, wallMat); }
  } else {
    pitchedRoof(x0, z0, x1, z1, topY, roofMat, wallMat, o.roofAxis);
  }
  // stairs for multi-floor buildings (NW inner corner, running along z)
  const stairs = [];
  if (floors > 1) {
    const sx = x0 + 1;
    for (let f = 1; f < floors; f++) {
      const baseY = y0 + (f - 1) * floorH;
      for (let k = 0; k < floorH; k++) {
        const sz = z0 + 1 + k;
        world.fill(sx, baseY, sz, sx, baseY + k, sz, B.DARKPLANK);
        world.set(sx, baseY + floorH - 1, sz, B.AIR); // hole in floor above
        world.set(sx, baseY + floorH - 1, sz + 1, B.AIR);
        if (k === floorH - 1) world.fill(sx, baseY, sz, sx, baseY + k, sz, B.DARKPLANK);
      }
      stairs.push({ x: sx, z0: z0 + 1, z1: z0 + floorH + 1 });
    }
  }
  const b = addBuilding({
    name: o.name || NAMES[type] || type, type, desc: o.desc || DESC[type] || '',
    x0, z0, x1, z1, y0, y1: topY + 6, door: { ...door, dx: ddx, dz: ddz }, inside: insideCell, outside: outsideCell,
    jobs: o.jobs || [...(JOB_SLOTS[type] || [])], shelter: !!o.shelter, floors, floorH, stairs,
  });
  furnish(b, o);
  return b;
}

function pitchedRoof(x0, z0, x1, z1, topY, roofMat, wallMat, axis) {
  const alongX = axis ? axis === 'x' : (x1 - x0) <= (z1 - z0); // ridge runs along z when x is shorter
  if (alongX) {
    let k = 0;
    for (let lo = x0 - 1, hi = x1 + 1; lo <= hi; lo++, hi--, k++) {
      world.fill(lo, topY + k, z0 - 1, lo, topY + k, z1 + 1, roofMat);
      world.fill(hi, topY + k, z0 - 1, hi, topY + k, z1 + 1, roofMat);
      if (lo + 1 <= hi - 1) {
        world.fill(lo + 1, topY + k, z0, hi - 1, topY + k, z0, wallMat);
        world.fill(lo + 1, topY + k, z1, hi - 1, topY + k, z1, wallMat);
      }
    }
  } else {
    let k = 0;
    for (let lo = z0 - 1, hi = z1 + 1; lo <= hi; lo++, hi--, k++) {
      world.fill(x0 - 1, topY + k, lo, x1 + 1, topY + k, lo, roofMat);
      world.fill(x0 - 1, topY + k, hi, x1 + 1, topY + k, hi, roofMat);
      if (lo + 1 <= hi - 1) {
        world.fill(x0, topY + k, lo + 1, x0, topY + k, hi - 1, wallMat);
        world.fill(x1, topY + k, lo + 1, x1, topY + k, hi - 1, wallMat);
      }
    }
  }
}

// ---------------- furnishing ----------------
function perimeterCells(b, floorIdx) {
  const ix0 = b.x0 + 1, ix1 = b.x1 - 1, iz0 = b.z0 + 1, iz1 = b.z1 - 1;
  const cells = [];
  const bad = (x, z) => {
    if (floorIdx === 0 && Math.abs(x - b.inside.x) <= 1 && Math.abs(z - b.inside.z) <= 1) return true;
    for (const s of b.stairs) if (x === s.x && z >= s.z0 - 1 && z <= s.z1) return true;
    if (Math.abs(x - b.inside.x) <= 0 && Math.abs(z - b.inside.z) <= 2) return true;
    if (Math.abs(z - b.inside.z) <= 0 && Math.abs(x - b.inside.x) <= 2) return true;
    return false;
  };
  for (let x = ix0; x <= ix1; x++) if (!bad(x, iz0)) cells.push({ x, z: iz0, nx: 0, nz: 1 });
  for (let z = iz0 + 1; z <= iz1; z++) if (!bad(ix1, z)) cells.push({ x: ix1, z, nx: -1, nz: 0 });
  for (let x = ix1 - 1; x >= ix0; x--) if (!bad(x, iz1)) cells.push({ x, z: iz1, nx: 0, nz: -1 });
  for (let z = iz1 - 1; z > iz0; z--) if (!bad(ix0, z)) cells.push({ x: ix0, z, nx: 1, nz: 0 });
  return cells;
}

function placeItem(b, cell, y, t, isWork, isBed) {
  world.set(cell.x, y, cell.z, t);
  const spot = { x: cell.x + cell.nx, y, z: cell.z + cell.nz };
  if (isWork) b.workSpots.push(spot);
  if (isBed) b.beds.push(spot);
}

const WORK_ITEMS = new Set([B.OVEN, B.ANVIL, B.BOOKSHELF, B.TABLE, B.ALTAR, B.IRON, B.BARREL]);

function furnish(b, o) {
  const type = b.type;
  const y = b.y0;
  const ix0 = b.x0 + 1, ix1 = b.x1 - 1, iz0 = b.z0 + 1, iz1 = b.z1 - 1;
  const cx = Math.floor((ix0 + ix1) / 2), cz = Math.floor((iz0 + iz1) / 2);
  const perim = perimeterCells(b, 0);
  let seq = [], spacing = 2, beds = 0;
  switch (type) {
    case 'house': case 'cottage': case 'farmhouse': seq = [B.BED, B.CHEST, B.BED, B.BOOKSHELF, B.BARREL]; beds = b.floors > 1 ? 2 : randInt(1, 3); break;
    case 'blacksmith': seq = [B.OVEN, B.BARREL, B.OVEN, B.IRON, B.CHEST]; break;
    case 'armory': seq = [B.IRON, B.CHEST, B.IRON, B.ANVIL, B.IRON, B.CHEST]; break;
    case 'bakery': seq = [B.OVEN, B.OVEN, B.BARREL, B.HAY, B.OVEN, B.CHEST]; break;
    case 'tavern': case 'inn': seq = [B.BARREL, B.BARREL, B.CHEST, B.BARREL, B.BED]; beds = 4; break;
    case 'library': case 'school': seq = [B.BOOKSHELF]; spacing = 1; break;
    case 'granary': seq = [B.HAY, B.HAY, B.BARREL]; spacing = 1; break;
    case 'stables': case 'barn': seq = [B.HAY, B.HAY, B.BARREL, B.CHEST]; spacing = 1; break;
    case 'guildhall': case 'townhall': seq = [B.BOOKSHELF, B.CHEST, B.BOOKSHELF, B.BANNER]; break;
    case 'apothecary': seq = [B.BARREL, B.BOOKSHELF, B.BARREL, B.CHEST]; break;
    case 'brewery': seq = [B.BARREL, B.BARREL, B.BARREL, B.HAY, B.OVEN]; spacing = 1; break;
    case 'carpenter': seq = [B.PLANK, B.LOG, B.CHEST, B.PLANK, B.BARREL]; break;
    case 'mason': seq = [B.STONE, B.COBBLE, B.CHEST, B.STONE]; break;
    case 'tanner': case 'weaver': case 'tailor': seq = [B.BARREL, B.CHEST, B.HAY, B.CHEST]; break;
    case 'butcher': case 'fishmonger': seq = [B.BARREL, B.CHEST, B.BARREL, B.TABLE]; break;
    case 'candlemaker': case 'jeweler': seq = [B.CHEST, B.BOOKSHELF, B.CHEST, B.GOLD]; break;
    case 'kitchen': seq = [B.OVEN, B.BARREL, B.OVEN, B.HAY, B.OVEN, B.CHEST]; break;
    case 'barracks': seq = [B.BED, B.CHEST]; spacing = 1; beds = 99; break;
    case 'chapel': seq = [B.BOOKSHELF, B.CHEST]; break;
    default: seq = [B.CHEST, B.BARREL];
  }
  let si = 0, bedCount = 0;
  for (let i = 0; i < perim.length; i += spacing) {
    const c = perim[i];
    let t = seq[si % seq.length]; si++;
    if (t === B.BED) { if (bedCount >= beds) t = B.CHEST; else bedCount++; }
    const isWork = WORK_ITEMS.has(t) && type !== 'house' && type !== 'cottage' && type !== 'farmhouse';
    placeItem(b, c, y, t, isWork, t === B.BED);
    if ((type === 'library' || type === 'school' || type === 'guildhall') && t === B.BOOKSHELF) world.set(c.x, y + 1, c.z, B.BOOKSHELF);
    if (t === B.BANNER) world.set(c.x, y + 1, c.z, B.BANNER);
    if (t === B.HAY && rng() < 0.5) world.set(c.x, y + 1, c.z, B.HAY);
  }
  // center pieces
  const w = ix1 - ix0 + 1, d = iz1 - iz0 + 1;
  if (type === 'blacksmith') { world.set(cx, y, cz, B.ANVIL); b.workSpots.push({ x: cx + 1, y, z: cz }); b.workSpots.push({ x: cx - 1, y, z: cz }); }
  else if (type === 'library' || type === 'school' || type === 'guildhall' || type === 'townhall') {
    for (let z = iz0 + 2; z <= iz1 - 2; z += 4) for (let x = ix0 + 2; x <= ix1 - 2; x++) {
      if (Math.abs(x - b.inside.x) <= 1 && Math.abs(z - b.inside.z) <= 1) continue;
      world.set(x, y, z, B.TABLE); if (x % 3 === 0) b.workSpots.push({ x, y, z: z + 1 });
    }
  } else if (type === 'tavern' || type === 'inn') {
    for (let z = iz0 + 2; z <= iz1 - 2; z += 3) for (let x = ix0 + 2; x <= ix1 - 2; x += 3) {
      if (Math.abs(x - b.inside.x) <= 1 && Math.abs(z - b.inside.z) <= 2) continue;
      world.set(x, y, z, B.TABLE); b.workSpots.push({ x: x + 1, y, z });
    }
    b.social = true;
  } else if (w >= 4 && d >= 4 && type !== 'granary' && type !== 'stables' && type !== 'barn' && type !== 'barracks' && type !== 'kitchen') {
    if (!(Math.abs(cx - b.inside.x) <= 1 && Math.abs(cz - b.inside.z) <= 1)) {
      world.set(cx, y, cz, B.TABLE); if (w >= 7) world.set(cx + 1, y, cz, B.TABLE);
      b.workSpots.push({ x: cx, y, z: cz + 1 });
    }
  }
  if (type === 'granary') for (let z = iz0 + 2; z <= iz1 - 2; z += 2) for (let x = ix0 + 2; x <= ix1 - 2; x += 2) if (rng() < 0.6) world.fill(x, y, z, x, y + randInt(0, 2), z, B.HAY);
  if (type === 'barracks') {
    for (let z = iz0 + 2; z <= iz1 - 2; z += 2) for (const x of [ix0 + 2, ix1 - 2]) { world.set(x, y, z, B.BED); b.beds.push({ x: x + (x === ix0 + 2 ? 1 : -1), y, z }); }
    world.set(cx, y, cz, B.TABLE); world.set(cx, y, cz + 1, B.TABLE);
  }
  // upper floors: bedrooms
  for (let f = 1; f < b.floors; f++) {
    const fy = b.y0 + f * b.floorH;
    const cells = perimeterCells(b, f);
    for (let i = 0; i < cells.length; i += 2) {
      const c = cells[i];
      const t = i % 6 === 0 ? B.CHEST : i % 6 === 2 ? B.BED : B.BOOKSHELF;
      placeItem(b, c, fy, t, false, t === B.BED);
    }
  }
  if (b.beds.length === 0 && b.workSpots.length === 0) b.workSpots.push({ x: cx, y, z: cz });
  if (b.workSpots.length === 0) b.workSpots.push({ x: b.inside.x, y, z: b.inside.z });
  if (b.beds.length === 0 && (type === 'house' || type === 'cottage' || type === 'farmhouse')) b.beds.push({ x: b.inside.x, y, z: b.inside.z });
}

// ---------------- church ----------------
function buildChurch(x0, z0, x1, z1, big) {
  const h = big ? 10 : 7;
  const y0 = PY;
  world.fill(x0, y0 - 1, z0, x1, y0 - 1, z1, B.COBBLE);
  world.walls(x0, y0, z0, x1, y0 + h - 1, z1, B.CASTLE);
  for (let z = z0 + 2; z <= z1 - 2; z += 3) { world.fill(x0, y0 + 2, z, x0, y0 + h - 3, z, B.GLASS); world.fill(x1, y0 + 2, z, x1, y0 + h - 3, z, B.GLASS); }
  const mx = Math.floor((x0 + x1) / 2);
  world.fill(mx - 1, y0, z1, mx + 1, y0 + 3, z1, B.AIR);
  pitchedRoof(x0, z0, x1, z1, y0 + h, B.ROOF_SLATE, B.CASTLE, 'x');
  // aisle & pews
  world.fill(mx, y0 - 1, z0 + 4, mx, y0 - 1, z1 - 1, B.CARPET);
  for (let z = z0 + 6; z <= z1 - 3; z += 2) {
    world.fill(x0 + 2, y0, z, mx - 2, y0, z, B.PEW);
    world.fill(mx + 2, y0, z, x1 - 2, y0, z, B.PEW);
  }
  // altar
  world.fill(x0 + 2, y0, z0 + 1, x1 - 2, y0, z0 + 3, B.CASTLE);
  world.set(mx, y0 + 1, z0 + 2, B.ALTAR);
  world.fill(mx, y0 + 2, z0, mx, y0 + 5, z0, B.GOLD); world.fill(mx - 1, y0 + 4, z0, mx + 1, y0 + 4, z0, B.GOLD);
  // bell tower
  if (big) {
    const tx = x1 + 3, tz = z1 - 3;
    world.fill(tx - 2, y0 - 1, tz - 2, tx + 2, y0 + h + 8, tz + 2, B.CASTLE);
    world.fill(tx - 1, y0, tz - 1, tx + 1, y0 + h + 7, tz + 1, B.AIR);
    world.fill(tx - 2, y0 + h + 4, tz - 2, tx + 2, y0 + h + 6, tz - 2, B.AIR); world.fill(tx - 2, y0 + h + 4, tz + 2, tx + 2, y0 + h + 6, tz + 2, B.AIR);
    world.fill(tx - 2, y0 + h + 4, tz - 2, tx - 2, y0 + h + 6, tz + 2, B.AIR); world.fill(tx + 2, y0 + h + 4, tz - 2, tx + 2, y0 + h + 6, tz + 2, B.AIR);
    world.fill(tx - 2, y0 + h + 7, tz - 2, tx + 2, y0 + h + 7, tz + 2, B.CASTLE);
    world.set(tx, y0 + h + 5, tz, B.GOLD);
    for (let k = 0; k < 4; k++) world.fill(tx - 2 + k, y0 + h + 8 + k, tz - 2 + k, tx + 2 - k, y0 + h + 8 + k, tz + 2 - k, B.ROOF_SLATE);
    world.fill(tx - 1, y0, tz, tx - 1, y0 + 2, tz, B.AIR);
    world.fill(x1, y0, tz, x1, y0 + 2, tz, B.AIR);
  }
  const b = addBuilding({
    name: big ? NAMES.church : NAMES.chapel, type: big ? 'church' : 'chapel', desc: DESC[big ? 'church' : 'chapel'],
    x0, z0, x1, z1, y0, y1: y0 + h + 8, door: { x: mx, z: z1, dx: 0, dz: 1 }, inside: { x: mx, z: z1 - 1 }, outside: { x: mx, z: z1 + 1 },
    jobs: [...JOB_SLOTS[big ? 'church' : 'chapel']], shelter: true, floors: 1, floorH: h, stairs: [],
  });
  b.workSpots.push({ x: mx, y: y0 + 1, z: z0 + 4 }, { x: mx - 3, y: y0, z: z0 + 5 });
  b.shelterSpots = [];
  for (let z = z0 + 5; z <= z1 - 3; z += 2) for (const x of [mx - 1, mx + 1]) b.shelterSpots.push({ x, y: y0, z });
  return b;
}

// ---------------- towers, walls, gates ----------------
function buildTower(cx, cz, r, h, opts = {}) {
  const y0 = opts.y0 ?? PY;
  world.fill(cx - r, y0 - 1, cz - r, cx + r, y0 + h, cz + r, B.CASTLE);
  world.fill(cx - r + 1, y0, cz - r + 1, cx + r - 1, y0 + h - 1, cz + r - 1, B.AIR);
  for (let fy = y0 + 4; fy < y0 + h - 1; fy += 5) {
    world.fill(cx - r + 1, fy, cz - r + 1, cx + r - 1, fy, cz + r - 1, B.PLANK);
    world.fill(cx + r - 1, fy, cz + r - 1, cx + r - 1, fy, cz + r - 1, B.AIR);
    for (let k = 0; k < 5; k++) world.set(cx + r - 1, fy - 5 + k + 1, cz + r - 2, B.DARKPLANK);
  }
  // battlements
  for (let x = cx - r; x <= cx + r; x += 2) { world.set(x, y0 + h + 1, cz - r, B.CASTLE); world.set(x, y0 + h + 1, cz + r, B.CASTLE); }
  for (let z = cz - r; z <= cz + r; z += 2) { world.set(cx - r, y0 + h + 1, z, B.CASTLE); world.set(cx + r, y0 + h + 1, z, B.CASTLE); }
  // arrow slits
  for (let fy = y0 + 2; fy < y0 + h - 1; fy += 5) {
    world.set(cx, fy, cz - r, B.GLASS); world.set(cx, fy, cz + r, B.GLASS); world.set(cx - r, fy, cz, B.GLASS); world.set(cx + r, fy, cz, B.GLASS);
  }
  // ground door toward city center
  const dx = Math.sign(CENTER - cx), dz = Math.sign(CENTER - cz);
  let door;
  if (Math.abs(CENTER - cx) > Math.abs(CENTER - cz) && dx !== 0) door = { x: cx + dx * r, z: cz, dx: -dx, dz: 0 };
  else if (dz !== 0) door = { x: cx, z: cz + dz * r, dx: 0, dz: -dz };
  else door = { x: cx + r, z: cz, dx: 1, dz: 0 };
  world.fill(door.x, y0, door.z, door.x, y0 + 1, door.z, B.AIR);
  // wall-level openings
  if (opts.wallY != null) {
    const wy = opts.wallY;
    if (opts.openX) { world.fill(cx - r, wy, cz, cx - r, wy + 1, cz, B.AIR); world.fill(cx + r, wy, cz, cx + r, wy + 1, cz, B.AIR); world.fill(cx - r + 1, wy - 1, cz - r + 1, cx + r - 1, wy - 1, cz + r - 1, B.PLANK); }
    if (opts.openZ) { world.fill(cx, wy, cz - r, cx, wy + 1, cz - r, B.AIR); world.fill(cx, wy, cz + r, cx, wy + 1, cz + r, B.AIR); world.fill(cx - r + 1, wy - 1, cz - r + 1, cx + r - 1, wy - 1, cz + r - 1, B.PLANK); }
  }
  // furnishing: beds & chest at ground level
  const b = addBuilding({
    name: opts.name || 'Watchtower', type: 'watchtower', desc: DESC.watchtower, x0: cx - r, z0: cz - r, x1: cx + r, z1: cz + r, y0, y1: y0 + h + 2,
    door, inside: { x: door.x + door.dx, z: door.z + door.dz }, outside: { x: door.x - door.dx, z: door.z - door.dz }, floors: 1, floorH: h, stairs: [],
  });
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1]]) {
    const bx = cx + ox * (r - 1), bz = cz + oz * (r - 1);
    if (Math.abs(bx - b.inside.x) + Math.abs(bz - b.inside.z) < 2) continue;
    world.set(bx, y0, bz, B.BED); b.beds.push({ x: bx - ox, y: y0, z: bz });
  }
  world.set(cx + r - 1, y0, cz + r - 1, B.CHEST);
  b.top = { x: cx, y: y0 + h + 1, z: cz };
  b.workSpots.push({ x: cx, y: y0 + h + 1, z: cz });
  return b;
}

function genWalls() {
  const y0 = PY, h = 9; // solid to PY+9, stand at PY+10
  const walkY = y0 + h + 1;
  R.walkY = walkY;
  // four wall segments (3 thick)
  world.fill(WX0, y0 - 1, WX0, WX1, y0 + h, WX0 + 2, B.CASTLE);
  world.fill(WX0, y0 - 1, WX1 - 2, WX1, y0 + h, WX1, B.CASTLE);
  world.fill(WX0, y0 - 1, WX0, WX0 + 2, y0 + h, WX1, B.CASTLE);
  world.fill(WX1 - 2, y0 - 1, WX0, WX1, y0 + h, WX1, B.CASTLE);
  // battlements on outer row
  for (let i = WX0; i <= WX1; i += 2) {
    world.set(i, walkY, WX0, B.CASTLE); world.set(i, walkY, WX1, B.CASTLE);
    world.set(WX0, walkY, i, B.CASTLE); world.set(WX1, walkY, i, B.CASTLE);
  }
  // gates
  R.gates = {};
  const gateDefs = [
    ['E', WX1 - 2, WX1, 253, 259, 1, 0], ['W', WX0, WX0 + 2, 253, 259, -1, 0],
    ['S', 253, 259, WX1 - 2, WX1, 0, 1], ['N', 253, 259, WX0, WX0 + 2, 0, -1],
  ];
  for (const [side, ax0, ax1, bz0, bz1, dx, dz] of gateDefs) {
    world.fill(ax0, y0, bz0, ax1, y0 + 5, bz1, B.AIR);
    // arch corners
    const cells = [];
    if (dx !== 0) {
      for (let x = ax0; x <= ax1; x++) { world.set(x, y0 + 5, bz0, B.CASTLE); world.set(x, y0 + 5, bz1, B.CASTLE); }
      const gx = dx > 0 ? WX1 - 1 : WX0 + 1;
      for (let z = bz0; z <= bz1; z++) for (let y = y0; y <= y0 + 5; y++) cells.push([gx, y, z]);
      // gatehouse above
      world.fill(ax0 - 2, y0 + 6, bz0 - 3, ax1 + 2, y0 + 14, bz1 + 3, B.CASTLE);
      world.fill(ax0 - 1, walkY, bz0 - 2, ax1 + 1, y0 + 13, bz1 + 2, B.AIR);
      world.fill(ax0, walkY, bz0 - 3, ax1, walkY + 1, bz0 - 3, B.AIR); world.fill(ax0, walkY, bz1 + 3, ax1, walkY + 1, bz1 + 3, B.AIR);
      for (let z = bz0 - 2; z <= bz1 + 2; z += 3) { world.set(ax0 - 2, walkY + 1, z, B.GLASS); world.set(ax1 + 2, walkY + 1, z, B.GLASS); }
      for (let z = bz0 - 3; z <= bz1 + 3; z += 2) { world.set(ax0 - 2, y0 + 15, z, B.CASTLE); world.set(ax1 + 2, y0 + 15, z, B.CASTLE); }
      for (let x = ax0 - 2; x <= ax1 + 2; x += 2) { world.set(x, y0 + 15, bz0 - 3, B.CASTLE); world.set(x, y0 + 15, bz1 + 3, B.CASTLE); }
      R.ballistas.push({ x: (ax0 + ax1) / 2 + 0.5, y: y0 + 15, z: 256.5, fx: dx, fz: 0 });
      const b = addBuilding({ name: `${side} Gatehouse`, type: 'gatehouse', desc: DESC.gatehouse, x0: ax0 - 2, z0: bz0 - 3, x1: ax1 + 2, z1: bz1 + 3, y0: walkY, y1: y0 + 16,
        door: { x: ax0 + 1, z: bz0 - 3, dx: 0, dz: -1 }, inside: { x: ax0 + 1, z: bz0 - 2 }, outside: { x: ax0 + 1, z: bz0 - 4 }, floors: 1, floorH: 4, stairs: [] });
      for (let z = bz0 - 1; z <= bz1 + 1; z += 2) { world.set(ax0 - 1, walkY, z, B.BED); b.beds.push({ x: ax0, y: walkY, z }); }
      b.workSpots.push({ x: ax0 + 1, y: walkY, z: 256 });
      R.gates[side] = { x: gx, z: 256, cells, outer: { x: gx + dx * 6, z: 256 }, inner: { x: gx - dx * 6, z: 256 }, dx, dz, hp: 3500, maxHp: 3500, closed: false, b };
    } else {
      for (let z = bz0; z <= bz1; z++) { world.set(ax0, y0 + 5, z, B.CASTLE); world.set(ax1, y0 + 5, z, B.CASTLE); }
      const gz = dz > 0 ? WX1 - 1 : WX0 + 1;
      for (let x = ax0; x <= ax1; x++) for (let y = y0; y <= y0 + 5; y++) cells.push([x, y, gz]);
      world.fill(ax0 - 3, y0 + 6, bz0 - 2, ax1 + 3, y0 + 14, bz1 + 2, B.CASTLE);
      world.fill(ax0 - 2, walkY, bz0 - 1, ax1 + 2, y0 + 13, bz1 + 1, B.AIR);
      world.fill(ax0 - 3, walkY, bz0, ax0 - 3, walkY + 1, bz1, B.AIR); world.fill(ax1 + 3, walkY, bz0, ax1 + 3, walkY + 1, bz1, B.AIR);
      for (let x = ax0 - 2; x <= ax1 + 2; x += 3) { world.set(x, walkY + 1, bz0 - 2, B.GLASS); world.set(x, walkY + 1, bz1 + 2, B.GLASS); }
      for (let x = ax0 - 3; x <= ax1 + 3; x += 2) { world.set(x, y0 + 15, bz0 - 2, B.CASTLE); world.set(x, y0 + 15, bz1 + 2, B.CASTLE); }
      for (let z = bz0 - 2; z <= bz1 + 2; z += 2) { world.set(ax0 - 3, y0 + 15, z, B.CASTLE); world.set(ax1 + 3, y0 + 15, z, B.CASTLE); }
      R.ballistas.push({ x: 256.5, y: y0 + 15, z: (bz0 + bz1) / 2 + 0.5, fx: 0, fz: dz });
      const b = addBuilding({ name: `${side} Gatehouse`, type: 'gatehouse', desc: DESC.gatehouse, x0: ax0 - 3, z0: bz0 - 2, x1: ax1 + 3, z1: bz1 + 2, y0: walkY, y1: y0 + 16,
        door: { x: ax0 - 3, z: bz0 + 1, dx: -1, dz: 0 }, inside: { x: ax0 - 2, z: bz0 + 1 }, outside: { x: ax0 - 4, z: bz0 + 1 }, floors: 1, floorH: 4, stairs: [] });
      for (let x = ax0 - 1; x <= ax1 + 1; x += 2) { world.set(x, walkY, bz0 - 1, B.BED); b.beds.push({ x, y: walkY, z: bz0 }); }
      b.workSpots.push({ x: 256, y: walkY, z: bz0 + 1 });
      R.gates[side] = { x: 256, z: gz, cells, outer: { x: 256, z: gz + dz * 6 }, inner: { x: 256, z: gz - dz * 6 }, dx, dz, hp: 3500, maxHp: 3500, closed: false, b };
    }
  }
  // towers: corners + quarter points
  const wc = WX0 + 1, wf = WX1 - 1;
  const towerPts = [[wc, wc], [wf, wc], [wc, wf], [wf, wf]];
  for (const q of [196, 316]) towerPts.push([q, wc], [q, wf], [wc, q], [wf, q]);
  for (const [tx, tz] of towerPts) {
    const onX = (tz === wc || tz === wf), onZ = (tx === wc || tx === wf);
    const t = buildTower(tx, tz, 4, 15, { wallY: walkY, openX: onX, openZ: onZ });
    const fx = Math.sign(tx - CENTER), fz = Math.sign(tz - CENTER);
    R.ballistas.push({ x: tx + 0.5, y: t.top.y, z: tz + 0.5, fx: onX && !onZ ? 0 : fx, fz: onZ && !onX ? 0 : fz });
    t.name = 'Watchtower';
  }
  // ballistas along the walls (inner row) + patrol points
  for (let i = WX0 + 30; i <= WX1 - 30; i += 30) {
    if (Math.abs(i - 256) < 16 || Math.abs(i - 196) < 8 || Math.abs(i - 316) < 8) continue;
    R.ballistas.push({ x: i + 0.5, y: walkY, z: WX0 + 1.5, fx: 0, fz: -1 });
    R.ballistas.push({ x: i + 0.5, y: walkY, z: WX1 - 0.5, fx: 0, fz: 1 });
    R.ballistas.push({ x: WX0 + 1.5, y: walkY, z: i + 0.5, fx: -1, fz: 0 });
    R.ballistas.push({ x: WX1 - 0.5, y: walkY, z: i + 0.5, fx: 1, fz: 0 });
  }
  R.patrol = [];
  for (let i = WX0 + 8; i <= WX1 - 8; i += 12) {
    if (Math.abs(i - 256) < 10) continue;
    R.patrol.push({ x: i + 0.5, y: walkY, z: WX0 + 1.5, side: 'N' }, { x: i + 0.5, y: walkY, z: WX1 - 1.5, side: 'S' });
    R.patrol.push({ x: WX0 + 1.5, y: walkY, z: i + 0.5, side: 'W' }, { x: WX1 - 1.5, y: walkY, z: i + 0.5, side: 'E' });
  }
  // ring road inside the walls & banners on the gates
  for (let i = WX0 + 3; i <= WX1 - 3; i++) {
    for (let k = 0; k < 3; k++) {
      world.set(i, PY - 1, WX0 + 3 + k, B.COBBLE); world.set(i, PY - 1, WX1 - 3 - k, B.COBBLE);
      world.set(WX0 + 3 + k, PY - 1, i, B.COBBLE); world.set(WX1 - 3 - k, PY - 1, i, B.COBBLE);
    }
  }
}

// ---------------- keep ----------------
function genKeep() {
  const kx0 = 196, kz0 = 144, kx1 = 316, kz1 = 234;
  const y0 = PY;
  // courtyard ground
  world.fill(kx0, y0 - 1, kz0, kx1, y0 - 1, kz1, B.GRASS);
  // curtain wall (2 thick, h 6)
  world.fill(kx0, y0 - 1, kz0, kx1, y0 + 6, kz0 + 1, B.CASTLE); world.fill(kx0, y0 - 1, kz1 - 1, kx1, y0 + 6, kz1, B.CASTLE);
  world.fill(kx0, y0 - 1, kz0, kx0 + 1, y0 + 6, kz1, B.CASTLE); world.fill(kx1 - 1, y0 - 1, kz0, kx1, y0 + 6, kz1, B.CASTLE);
  for (let i = kx0; i <= kx1; i += 2) { world.set(i, y0 + 7, kz0, B.CASTLE); world.set(i, y0 + 7, kz1, B.CASTLE); }
  for (let i = kz0; i <= kz1; i += 2) { world.set(kx0, y0 + 7, i, B.CASTLE); world.set(kx1, y0 + 7, i, B.CASTLE); }
  for (const [tx, tz] of [[kx0 + 1, kz0 + 1], [kx1 - 1, kz0 + 1], [kx0 + 1, kz1 - 1], [kx1 - 1, kz1 - 1]]) {
    const t = buildTower(tx, tz, 3, 10, { wallY: y0 + 7, openX: true, openZ: true, name: 'Keep Tower' });
    R.ballistas.push({ x: tx + 0.5, y: t.top.y, z: tz + 0.5, fx: Math.sign(tx - CENTER), fz: Math.sign(tz - CENTER) });
  }
  // keep gate (south)
  world.fill(253, y0, kz1 - 1, 259, y0 + 4, kz1, B.AIR);
  world.set(253, y0 + 4, kz1 - 1, B.CASTLE); world.set(259, y0 + 4, kz1 - 1, B.CASTLE); world.set(253, y0 + 4, kz1, B.CASTLE); world.set(259, y0 + 4, kz1, B.CASTLE);
  world.fill(252, y0 + 5, kz1 - 2, 260, y0 + 9, kz1 + 1, B.CASTLE);
  world.fill(253, y0 + 6, kz1 - 1, 259, y0 + 8, kz1, B.AIR);
  for (let x = 252; x <= 260; x += 2) world.set(x, y0 + 10, kz1 + 1, B.CASTLE);
  world.fill(255, y0 + 11, kz1, 257, y0 + 14, kz1, B.BANNER);
  // avenue into the courtyard
  world.fill(253, y0 - 1, 209, 259, y0 - 1, kz1, B.COBBLE);
  world.fill(kx0 + 2, y0 - 1, 212, kx1 - 2, y0 - 1, 214, B.COBBLE);
  // ---- great hall ----
  const hx0 = 226, hz0 = 154, hx1 = 286, hz1 = 208;
  const hall = { x0: hx0, z0: hz0, x1: hx1, z1: hz1 };
  world.fill(hx0, y0 - 1, hz0, hx1, y0 - 1, hz1, B.CASTLE);
  world.fill(hx0 + 1, y0 - 1, hz0 + 1, hx1 - 1, y0 - 1, hz1 - 1, B.COBBLE);
  world.walls(hx0, y0, hz0, hx1, y0 + 15, hz1, B.CASTLE);
  world.fill(hx0, y0 + 16, hz0, hx1, y0 + 16, hz1, B.CASTLE); // roof
  for (let i = hx0; i <= hx1; i += 2) { world.set(i, y0 + 17, hz0, B.CASTLE); world.set(i, y0 + 17, hz1, B.CASTLE); }
  for (let i = hz0; i <= hz1; i += 2) { world.set(hx0, y0 + 17, i, B.CASTLE); world.set(hx1, y0 + 17, i, B.CASTLE); }
  // windows
  for (let x = hx0 + 3; x <= hx1 - 3; x += 4) { world.fill(x, y0 + 3, hz0, x, y0 + 6, hz0, B.GLASS); world.fill(x, y0 + 3, hz1, x, y0 + 6, hz1, B.GLASS); world.fill(x, y0 + 11, hz0, x, y0 + 13, hz0, B.GLASS); world.fill(x, y0 + 11, hz1, x, y0 + 13, hz1, B.GLASS); }
  for (let z = hz0 + 3; z <= hz1 - 3; z += 4) { world.fill(hx0, y0 + 3, z, hx0, y0 + 6, z, B.GLASS); world.fill(hx1, y0 + 3, z, hx1, y0 + 6, z, B.GLASS); world.fill(hx0, y0 + 11, z, hx0, y0 + 13, z, B.GLASS); world.fill(hx1, y0 + 11, z, hx1, y0 + 13, z, B.GLASS); }
  // second floor slab
  world.fill(hx0 + 1, y0 + 8, hz0 + 1, hx1 - 1, y0 + 8, hz1 - 1, B.PLANK);
  // main door
  world.fill(254, y0, hz1, 258, y0 + 4, hz1, B.AIR);
  world.fill(253, y0 + 5, hz1, 259, y0 + 7, hz1, B.BANNER);
  // corner towers
  for (const [tx, tz] of [[hx0 + 1, hz0 + 1], [hx1 - 1, hz0 + 1], [hx0 + 1, hz1 - 1], [hx1 - 1, hz1 - 1]]) {
    world.fill(tx - 3, y0 - 1, tz - 3, tx + 3, y0 + 22, tz + 3, B.CASTLE);
    world.fill(tx - 2, y0 + 17, tz - 2, tx + 2, y0 + 21, tz + 2, B.AIR);
    for (let i = -3; i <= 3; i += 2) { world.set(tx + i, y0 + 23, tz - 3, B.CASTLE); world.set(tx + i, y0 + 23, tz + 3, B.CASTLE); world.set(tx - 3, y0 + 23, tz + i, B.CASTLE); world.set(tx + 3, y0 + 23, tz + i, B.CASTLE); }
    for (let k = 0; k < 4; k++) world.fill(tx - 3 + k, y0 + 24 + k, tz - 3 + k, tx + 3 - k, y0 + 24 + k, tz + 3 - k, B.ROOF_SLATE);
    world.fill(tx, y0 + 17, tz - 3, tx, y0 + 18, tz - 3, B.AIR); world.fill(tx, y0 + 17, tz + 3, tx, y0 + 18, tz + 3, B.AIR);
    world.fill(tx - 3, y0 + 17, tz, tx - 3, y0 + 18, tz, B.AIR); world.fill(tx + 3, y0 + 17, tz, tx + 3, y0 + 18, tz, B.AIR);
    R.ballistas.push({ x: tx + 0.5, y: y0 + 23, z: tz + 0.5, fx: Math.sign(tx - CENTER) || 1, fz: Math.sign(tz - 181) });
  }
  // interior walls separating wings (ground floor)
  world.fill(245, y0, hz0 + 1, 245, y0 + 7, hz1 - 1, B.CASTLE); world.fill(267, y0, hz0 + 1, 267, y0 + 7, hz1 - 1, B.CASTLE);
  world.fill(245, y0, 178, 245, y0 + 3, 182, B.AIR); world.fill(267, y0, 178, 267, y0 + 3, 182, B.AIR);
  world.fill(245, y0, 196, 245, y0 + 3, 199, B.AIR); world.fill(267, y0, 196, 267, y0 + 3, 199, B.AIR);
  // throne room
  world.fill(254, y0 - 1, 160, 258, y0 - 1, hz1 - 1, B.CARPET);
  world.fill(249, y0, hz0 + 1, 263, y0, 160, B.CASTLE); // dais
  world.fill(255, y0 - 1, hz0 + 1, 257, y0 - 1, 160, B.CARPET);
  world.set(256, y0 + 1, 158, B.GOLD); world.fill(256, y0 + 2, 157, 256, y0 + 3, 157, B.GOLD); world.set(255, y0 + 1, 157, B.GOLD); world.set(257, y0 + 1, 157, B.GOLD);
  world.fill(254, y0 + 4, hz0, 258, y0 + 7, hz0, B.BANNER);
  for (let z = 166; z <= 200; z += 6) { world.fill(248, y0 + 2, z, 248, y0 + 5, z, B.BANNER); world.fill(264, y0 + 2, z, 264, y0 + 5, z, B.BANNER); }
  for (let z = 164; z <= 202; z += 4) { world.set(250, y0, z, B.CASTLE); world.set(250, y0 + 1, z, B.FIRE); world.set(262, y0, z, B.CASTLE); world.set(262, y0 + 1, z, B.FIRE); }
  // west wing: library + stairs
  for (let x = 229; x <= 242; x += 4) for (let z = 166; z <= 200; z++) { if (z % 7 === 6) continue; world.fill(x, y0, z, x, y0 + 2, z, B.BOOKSHELF); }
  for (let z = hz0 + 1; z <= hz1 - 1; z += 2) { world.fill(hx0 + 1, y0, z, hx0 + 1, y0 + 2, z, B.BOOKSHELF); }
  for (let x = 231; x <= 240; x += 4) { world.set(x, y0, 204, B.TABLE); world.set(x + 1, y0, 204, B.TABLE); }
  for (let k = 0; k <= 8; k++) { world.fill(244, y0, hz0 + 1 + k, 244, y0 + k, hz0 + 1 + k, B.CASTLE); world.set(244, y0 + 8, hz0 + 1 + k, B.AIR); world.set(244, y0 + 8, hz0 + 10, B.AIR); }
  world.fill(243, y0 + 8, hz0 + 1, 243, y0 + 8, hz0 + 10, B.AIR);
  // east wing: banquet hall & kitchens
  for (const x of [272, 280]) { world.fill(x, y0, 168, x, y0, 200, B.TABLE); }
  for (let z = hz0 + 1; z <= hz1 - 1; z += 3) world.set(hx1 - 1, y0, z, B.BARREL);
  world.fill(268, y0, hz0 + 1, 285, y0, hz0 + 1, B.OVEN); world.fill(276, y0, hz0 + 1, 278, y0, hz0 + 1, B.HAY);
  for (let z = 170; z <= 198; z += 4) { world.set(270, y0 + 1, z, B.FIRE); world.set(270, y0, z, B.CASTLE); }
  // second floor rooms
  const fy = y0 + 9;
  world.fill(245, fy, hz0 + 1, 245, fy + 6, hz1 - 1, B.PLASTER); world.fill(267, fy, hz0 + 1, 267, fy + 6, hz1 - 1, B.PLASTER);
  world.fill(hx0 + 1, fy, 181, hx1 - 1, fy + 6, 181, B.PLASTER);
  for (const x of [235, 256, 276]) world.fill(x - 1, fy, 181, x + 1, fy + 2, 181, B.AIR);
  for (const x of [245, 267]) { world.fill(x, fy, 168, x, fy + 2, 170, B.AIR); world.fill(x, fy, 194, x, fy + 2, 196, B.AIR); }
  // royal bedchamber (center north)
  world.fill(254, fy, hz0 + 2, 258, fy, hz0 + 3, B.BED); world.fill(253, fy - 1, hz0 + 1, 259, fy - 1, 180, B.CARPET);
  world.set(250, fy, hz0 + 2, B.CHEST); world.set(262, fy, hz0 + 2, B.CHEST); world.fill(248, fy, 175, 264, fy, 175, B.TABLE);
  // treasury (NE)
  for (let x = 270; x <= 284; x += 2) for (let z = 158; z <= 178; z += 3) world.fill(x, fy, z, x, fy + (rng() < 0.4 ? 1 : 0), z, rng() < 0.6 ? B.GOLD : B.CHEST);
  // council chamber (SE)
  world.fill(272, fy, 190, 282, fy, 190, B.TABLE); world.fill(272, fy, 196, 282, fy, 196, B.TABLE);
  for (let x = 269; x <= 285; x += 3) world.fill(x, fy, hz1 - 1, x, fy + 1, hz1 - 1, B.BOOKSHELF);
  // guest chambers (NW/SW)
  for (let z = 160; z <= 176; z += 4) { world.set(hx0 + 2, fy, z, B.BED); world.set(hx0 + 2, fy, z + 1, B.CHEST); }
  for (let z = 188; z <= 204; z += 4) { world.set(hx0 + 2, fy, z, B.BED); world.set(hx0 + 2, fy, z + 1, B.CHEST); world.set(243, fy, z, B.BED); }
  for (let x = 247; x <= 265; x += 6) world.fill(x, fy, 195, x + 2, fy, 195, B.TABLE);

  const keep = addBuilding({
    name: "The King's Hall", type: 'keep', desc: 'Seat of King Aldric IV. Throne room, great library, banquet hall, royal chambers and treasury.',
    x0: hx0, z0: hz0, x1: hx1, z1: hz1, y0, y1: y0 + 28, door: { x: 256, z: hz1, dx: 0, dz: 1 }, inside: { x: 256, z: hz1 - 1 }, outside: { x: 256, z: hz1 + 1 },
    jobs: ['king', 'queen', 'chancellor', 'steward', 'servant', 'servant', 'servant', 'scholar', 'scholar', 'cook', 'cook', 'treasurer', 'knight', 'knight', 'knight', 'knight'],
    shelter: true, floors: 2, floorH: 8, stairs: [],
  });
  keep.workSpots = [
    { x: 256, y: y0 + 1, z: 160 }, { x: 255, y: y0 + 1, z: 160 }, { x: 252, y: y0 + 1, z: 162 }, { x: 260, y: y0 + 1, z: 162 },
    { x: 256, y: y0, z: 175 }, { x: 274, y: y0, z: 176 }, { x: 278, y: y0, z: 186 }, { x: 233, y: y0, z: 175 }, { x: 237, y: y0, z: 190 },
    { x: 272, y: y0, z: hz0 + 2 }, { x: 281, y: y0, z: hz0 + 2 }, { x: 276, y: fy, z: 168 }, { x: 253, y: y0, z: 200 }, { x: 259, y: y0, z: 200 }, { x: 253, y: y0, z: 170 }, { x: 259, y: y0, z: 170 },
  ];
  keep.beds = [{ x: 256, y: fy, z: hz0 + 4 }, { x: 255, y: fy, z: hz0 + 4 }, { x: hx0 + 3, y: fy, z: 160 }, { x: hx0 + 3, y: fy, z: 164 }, { x: hx0 + 3, y: fy, z: 168 }, { x: hx0 + 3, y: fy, z: 172 }, { x: hx0 + 3, y: fy, z: 188 }, { x: hx0 + 3, y: fy, z: 192 }, { x: hx0 + 3, y: fy, z: 196 }, { x: hx0 + 3, y: fy, z: 200 }, { x: 242, y: fy, z: 188 }, { x: 242, y: fy, z: 192 }, { x: 242, y: fy, z: 196 }, { x: 242, y: fy, z: 200 }, { x: 256, y: y0, z: 190 }, { x: 258, y: y0, z: 190 }];
  keep.shelterSpots = [];
  for (let z = 170; z <= 200; z += 3) for (let x = 251; x <= 261; x += 5) keep.shelterSpots.push({ x, y: y0, z });
  R.throne = { x: 256, y: y0 + 1, z: 161 };
  R.keep = keep;
  // courtyard buildings
  buildStructure({ x0: 200, z0: 150, x1: 222, z1: 188, type: 'barracks', name: 'Royal Guard Barracks', style: 'stone', doorSide: 'E', doorW: 1, floorH: 5, shelter: false });
  buildStructure({ x0: 290, z0: 150, x1: 312, z1: 176, type: 'stables', name: 'Royal Stables', style: 'rustic', doorSide: 'W', doorW: 2, floorH: 5 });
  buildStructure({ x0: 290, z0: 182, x1: 312, z1: 208, type: 'kitchen', name: 'Royal Kitchens', style: 'stone', doorSide: 'W', floorH: 4 });
  buildStructure({ x0: 200, z0: 194, x1: 222, z1: 228, type: 'armory', name: 'Royal Armory', style: 'stone2', doorSide: 'E', floorH: 5, roofStyle: 'flat' });
  buildStructure({ x0: 290, z0: 214, x1: 312, z1: 228, type: 'granary', name: 'Royal Granary', style: 'stone', doorSide: 'W', floorH: 5 });
  // training yard
  for (const [x, z] of [[232, 222], [238, 222], [244, 222], [268, 222], [274, 222], [280, 222]]) { world.fill(x, y0, z, x, y0 + 1, z, B.HAY); }
  well(256, 226);
}

function well(x, z) {
  world.fill(x - 1, PY, z - 1, x + 1, PY, z + 1, B.COBBLE); world.set(x, PY, z, B.WATER);
  world.fill(x - 1, PY + 1, z - 1, x - 1, PY + 2, z - 1, B.LOG); world.fill(x + 1, PY + 1, z + 1, x + 1, PY + 2, z + 1, B.LOG);
  world.fill(x - 1, PY + 3, z - 1, x + 1, PY + 3, z + 1, B.ROOF_SLATE);
  R.wells.push({ x: x + 0.5, y: PY, z: z + 2.5 });
}

// ---------------- city districts ----------------
const STREETS = [141, 165, 189, 213, 237, 256, 275, 299, 323, 347, 371];
function isStreetCoord(c) { for (const s of STREETS) { if (s === 256 ? Math.abs(c - s) <= 3 : Math.abs(c - s) <= 1) return true; } return false; }

function genStreets() {
  for (let x = WX0 + 3; x <= WX1 - 3; x++) for (let z = WX0 + 3; z <= WX1 - 3; z++) {
    if (x >= 196 && x <= 316 && z <= 234) continue; // keep
    if (isStreetCoord(x) || isStreetCoord(z)) world.set(x, PY - 1, z, B.COBBLE);
  }
  // plaza
  world.fill(239, PY - 1, 239, 273, PY - 1, 273, B.COBBLE);
  for (let x = 240; x <= 272; x += 4) for (let z = 240; z <= 272; z += 4) if (hash2(x, z) < 0.5) world.set(x, PY - 1, z, B.GRAVEL);
  well(246, 266); well(266, 266);
  // fountain
  world.fill(253, PY, 243, 259, PY, 249, B.CASTLE); world.fill(254, PY, 244, 258, PY, 248, B.WATER); world.fill(256, PY, 246, 256, PY + 2, 246, B.CASTLE); world.set(256, PY + 3, 246, B.GOLD);
  // market stalls around the plaza edge
  const stalls = [];
  for (let x = 241; x <= 271; x += 6) { if (Math.abs(x - 256) <= 4) continue; stalls.push([x, 241, 0, 1]); stalls.push([x, 271, 0, -1]); }
  for (let z = 247; z <= 265; z += 6) { if (Math.abs(z - 256) <= 4) continue; stalls.push([241, z, 1, 0]); stalls.push([271, z, -1, 0]); }
  const goods = ['Bread', 'Cloth', 'Fish', 'Spices', 'Pottery', 'Fruit', 'Leather', 'Candles', 'Cheese', 'Wool', 'Herbs', 'Trinkets', 'Ale', 'Honey', 'Salt', 'Furs'];
  let gi = 0;
  for (const [sx, sz, nx, nz] of stalls) {
    const canopy = gi % 2 ? B.TENT_RED : B.BANNER;
    world.fill(sx - 1, PY, sz - 1, sx + 1, PY, sz + 1, B.TABLE);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) world.fill(sx + ox, PY + 1, sz + oz, sx + ox, PY + 2, sz + oz, B.LOG);
    world.fill(sx - 1, PY + 3, sz - 1, sx + 1, PY + 3, sz + 1, canopy);
    world.set(sx, PY, sz, gi % 3 === 0 ? B.BARREL : gi % 3 === 1 ? B.CHEST : B.HAY);
    const b = addBuilding({ name: `${goods[gi % goods.length]} Stall`, type: 'stall', desc: `Sells ${goods[gi % goods.length].toLowerCase()} in the market square.`,
      x0: sx - 1, z0: sz - 1, x1: sx + 1, z1: sz + 1, y0: PY, y1: PY + 4, door: { x: sx + nx * 2, z: sz + nz * 2, dx: nx, dz: nz }, inside: { x: sx + nx * 2, z: sz + nz * 2 }, outside: { x: sx + nx * 2, z: sz + nz * 2 },
      jobs: ['merchant'], floors: 1, floorH: 3, stairs: [] });
    b.workSpots.push({ x: sx - nx * 2, y: PY, z: sz - nz * 2 });
    gi++;
  }
  R.plaza = { x0: 239, z0: 239, x1: 273, z1: 273 };
}

function districtOf(x, z) {
  if (z < 237) return x < 256 ? 'Northwest Quarter' : 'Northeast Quarter';
  if (x < 237) return z < 275 ? 'Artisan Quarter' : 'Southwest Quarter';
  if (x > 275) return z < 275 ? 'Merchant Quarter' : 'Garrison Quarter';
  return z > 275 ? 'Gate District' : 'Market Square';
}

function genLots() {
  const uniques = ['church', 'townhall', 'guildhall', 'library', 'inn', 'tavern', 'tavern', 'blacksmith', 'blacksmith', 'bakery', 'bakery', 'armory', 'carpenter', 'mason', 'tanner', 'school', 'apothecary', 'brewery', 'granary', 'stables', 'butcher', 'tailor', 'chapel', 'fishmonger', 'candlemaker', 'weaver', 'jeweler', 'barracks'];
  const lots = [];
  for (let i = 0; i < STREETS.length - 1; i++) for (let j = 0; j < STREETS.length - 1; j++) {
    const sx0 = STREETS[i], sx1 = STREETS[i + 1], sz0 = STREETS[j], sz1 = STREETS[j + 1];
    const x0 = sx0 + (sx0 === 256 ? 4 : 2), x1 = sx1 - (sx1 === 256 ? 4 : 2);
    const z0 = sz0 + (sz0 === 256 ? 4 : 2), z1 = sz1 - (sz1 === 256 ? 4 : 2);
    if (x1 >= 194 && x0 <= 318 && z0 <= 236) continue; // keep
    if (x1 >= 239 && x0 <= 273 && z1 >= 239 && z0 <= 273) continue; // plaza
    const dPlaza = Math.hypot((x0 + x1) / 2 - 256, (z0 + z1) / 2 - 256);
    lots.push({ x0, z0, x1, z1, dPlaza, w: x1 - x0 + 1, d: z1 - z0 + 1 });
  }
  lots.sort((a, b) => a.dPlaza - b.dPlaza);
  const bigLots = lots.filter(l => l.w >= 20 && l.d >= 20);
  const used = new Set();
  // assign uniques to big lots near the plaza
  let ui = 0;
  for (const lot of bigLots) {
    if (ui >= uniques.length) break;
    if (rng() < 0.25 && ui > 3) continue;
    const type = uniques[ui++];
    used.add(lot);
    placeUnique(lot, type);
  }
  for (const lot of lots) {
    if (used.has(lot)) continue;
    fillResidentialLot(lot);
  }
}

function doorSideFor(sub, lot) {
  const sides = [];
  if (sub.z1 === lot.z1) sides.push('S'); if (sub.z0 === lot.z0) sides.push('N');
  if (sub.x1 === lot.x1) sides.push('E'); if (sub.x0 === lot.x0) sides.push('W');
  // prefer facing the avenue / plaza
  const pref = sides.find(s => (s === 'E' && lot.x1 + 4 >= 253 && lot.x1 <= 253) || (s === 'W' && lot.x0 - 4 <= 259 && lot.x0 >= 259) || (s === 'S' && lot.z1 + 4 >= 253 && lot.z1 <= 253) || (s === 'N' && lot.z0 - 4 <= 259 && lot.z0 >= 259));
  return pref || pick(sides.length ? sides : ['S']);
}

function placeUnique(lot, type) {
  const { x0, z0, x1, z1 } = lot;
  const doorSide = doorSideFor(lot, lot);
  if (type === 'church') { buildChurch(x0 + 3, z0 + 1, x1 - 6, z1 - 1, true); gardens(lot); return; }
  if (type === 'chapel') { buildChurch(x0 + 5, z0 + 3, x1 - 5, z1 - 3, false); gardens(lot); return; }
  const styles = { townhall: 'stone2', guildhall: 'timber2', library: 'stone', inn: 'timber', tavern: 'timber', blacksmith: 'stone', bakery: 'timber', armory: 'stone2', carpenter: 'rustic', mason: 'stone', tanner: 'rustic', school: 'timber2', apothecary: 'timber2', brewery: 'stone', granary: 'rustic', stables: 'rustic', butcher: 'timber', tailor: 'timber2', fishmonger: 'timber', candlemaker: 'timber', weaver: 'timber2', jeweler: 'stone2', barracks: 'stone' };
  const floors = ['townhall', 'guildhall', 'inn', 'tavern', 'library', 'school', 'jeweler', 'apothecary'].includes(type) ? 2 : 1;
  const big = ['townhall', 'guildhall', 'library', 'inn', 'barracks', 'granary', 'stables', 'brewery'].includes(type);
  const inset = big ? 2 : 4;
  const flat = type === 'armory' || type === 'townhall';
  buildStructure({ x0: x0 + inset, z0: z0 + inset, x1: x1 - inset, z1: z1 - inset, type, style: styles[type] || 'timber', floors, doorSide, doorW: big ? 2 : 1, floorH: type === 'granary' || type === 'stables' || type === 'brewery' ? 5 : 4, roofStyle: flat ? 'flat' : 'pitched', shelter: type === 'townhall' || type === 'guildhall' });
  if (type === 'tavern' || type === 'inn') for (let k = 0; k < 2; k++) world.set(x0 + inset + 1 + k * 3, PY, z1 - inset + 2, B.BARREL);
  if (type === 'blacksmith') { world.fill(x0 + 1, PY - 1, z0 + 1, x0 + 2, PY - 1, z0 + 2, B.ASH); world.set(x0 + 1, PY, z0 + 1, B.ANVIL); }
  if (type === 'mason') for (let k = 0; k < 3; k++) world.fill(x0 + 1 + k * 2, PY, z0 + 1, x0 + 1 + k * 2, PY + randInt(0, 1), z0 + 1, B.STONE);
  if (type === 'carpenter') for (let k = 0; k < 3; k++) world.fill(x1 - 1 - k * 2, PY, z0 + 1, x1 - 1 - k * 2, PY, z0 + 2, B.LOG);
  if (type === 'stables') for (let x = x0 + 1; x <= x1 - 1; x += 2) { world.set(x, PY, z1 - 1, B.LOG); world.set(x, PY, z0 + 1, B.LOG); }
  gardens(lot);
}

function gardens(lot) {
  for (let x = lot.x0; x <= lot.x1; x++) for (let z = lot.z0; z <= lot.z1; z++) {
    if (world.get(x, PY, z) !== B.AIR || world.get(x, PY - 1, z) !== B.GRASS) continue;
    const r = hash2(x * 3, z * 7);
    if (r < 0.03) tree(x, z, PY, 'small');
    else if (r < 0.08) world.set(x, PY, z, B.FLOWERS);
    else if (r < 0.10) world.set(x, PY - 1, z, B.GRAVEL);
  }
}

function fillResidentialLot(lot) {
  const { x0, z0, x1, z1 } = lot;
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  const subs = [];
  const roll = rng();
  if (w >= 20 && d >= 20) {
    if (roll < 0.15) subs.push({ x0, z0, x1, z1, floors: 2 });
    else if (roll < 0.55) {
      const mid = Math.floor((z0 + z1) / 2);
      subs.push({ x0, z0, x1, z1: mid - 1 }, { x0, z0: mid + 1, x1, z1 });
    } else {
      const mx = Math.floor((x0 + x1) / 2), mz = Math.floor((z0 + z1) / 2);
      subs.push({ x0, z0, x1: mx - 1, z1: mz - 1 }, { x0: mx + 1, z0, x1, z1: mz - 1 }, { x0, z0: mz + 1, x1: mx - 1, z1 }, { x0: mx + 1, z0: mz + 1, x1, z1 });
    }
  } else if (w >= 12 && d >= 20) {
    const mid = Math.floor((z0 + z1) / 2);
    subs.push({ x0, z0, x1, z1: mid - 1 }, { x0, z0: mid + 1, x1, z1 });
  } else if (d >= 12 && w >= 20) {
    const mid = Math.floor((x0 + x1) / 2);
    subs.push({ x0, z0, x1: mid - 1, z1 }, { x0: mid + 1, z0, x1, z1 });
  } else subs.push({ x0, z0, x1, z1 });
  const smallShops = ['house', 'house', 'house', 'house', 'house', 'weaver', 'candlemaker', 'tailor', 'butcher', 'apothecary', 'fishmonger'];
  for (const s of subs) {
    const inset = 1;
    const bx0 = s.x0 + inset, bz0 = s.z0 + inset, bx1 = s.x1 - inset, bz1 = s.z1 - inset;
    if (bx1 - bx0 < 5 || bz1 - bz0 < 5) continue;
    // shrink a bit randomly for variety
    const sh = randInt(0, 2), sd = randInt(0, 2);
    const type = subs.length === 1 && rng() < 0.3 ? pick(smallShops) : rng() < 0.12 ? pick(smallShops) : 'house';
    const floors = s.floors || (rng() < 0.45 ? 2 : 1);
    const b = buildStructure({ x0: bx0 + sh, z0: bz0 + sd, x1: bx1 - sh, z1: bz1 - sd, type, style: pick(['timber', 'timber', 'timber2', 'stone', 'thatch']), floors, doorSide: doorSideFor(s, lot), floorH: 4 });
    if (type === 'house') { const fam = pick(['Cooper', 'Fletcher', 'Thatcher', 'Baker', 'Smith', 'Miller', 'Wright', 'Tanner', 'Mason', 'Ward', 'Brewer', 'Hollowell', 'Ashdown', 'Blackwood', 'Greymere', 'Stonebridge', 'Redfern', 'Underhill', 'Wexley', 'Harrow']); b.name = `${fam} House`; b.desc = `Home of the ${fam} family.`; b.family = fam; }
    b.district = districtOf(b.cx, b.cz);
  }
  gardens(lot);
}

// ---------------- trees ----------------
function tree(x, z, y, kind) {
  if (kind === 'small') {
    world.fill(x, y, z, x, y + 2, z, B.LOG);
    world.fill(x - 1, y + 2, z - 1, x + 1, y + 3, z + 1, B.LEAVES); world.set(x, y + 4, z, B.LEAVES);
    return;
  }
  const h = kind === 'pine' ? randInt(6, 9) : randInt(4, 6);
  world.fill(x, y, z, x, y + h - 1, z, B.LOG);
  if (kind === 'pine') {
    for (let k = 0; k < h - 1; k++) { const r = k < 2 ? 1 : Math.max(1, Math.floor((h - k) / 2.5)); if (k % 2 === 0) world.fill(x - r, y + 2 + k, z - r, x + r, y + 2 + k, z + r, B.LEAVES); }
    world.fill(x, y + h, z, x, y + h + 1, z, B.LEAVES);
  } else {
    const r = randInt(2, 3);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const dd = dx * dx + dz * dz + dy * dy * 2;
      if (dd <= r * r + 1 && (dd < r * r - 1 || hash2(x + dx + dy * 31, z + dz) < 0.6)) world.set(x + dx, y + h - 1 + dy, z + dz, B.LEAVES);
    }
    world.set(x, y + h - 1, z, B.LOG);
  }
}

function genTrees() {
  const W = world.W, D = world.D;
  for (let x = 4; x < W - 4; x += 2) for (let z = 4; z < D - 4; z += 2) {
    const dc = Math.max(Math.abs(x - CENTER), Math.abs(z - CENTER));
    if (dc < 128) continue;
    if (Math.abs(x - 256) < 7 || Math.abs(z - 256) < 7) continue; // roads
    if (inReserved(x, z)) continue;
    const y = hm[x + z * W];
    if (y <= WATER_Y + 1 || y > 44) continue;
    if (world.get(x, y - 1, z) !== B.GRASS && world.get(x, y - 1, z) !== B.MOSS) continue;
    const n = fbm(x * 0.02 + 5, z * 0.02 + 5, 3);
    const density = dc < 150 ? 0.02 : (n - 0.45) * 0.9;
    if (hash2(x + 999, z) < density) {
      tree(x + randInt(0, 1), z + randInt(0, 1), y, y > 30 || n > 0.7 ? 'pine' : 'oak');
    } else if (hash2(x + 555, z) < 0.03) world.set(x, y, z, B.FLOWERS);
  }
}

const reserved = [];
function reserve(x0, z0, x1, z1) { reserved.push([x0 - 2, z0 - 2, x1 + 2, z1 + 2]); }
function inReserved(x, z) { for (const r of reserved) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return true; return false; }

// ---------------- outside: farms, hamlet, mill, camp ----------------
function genFarms() {
  R.fields = [];
  const fx0 = 66, fz0 = 176;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
    const x0 = fx0 + i * 30, z0 = fz0 + j * 34, x1 = x0 + 24, z1 = z0 + 16;
    if (z1 > 250 && z0 < 262) continue;
    reserve(x0, z0, x1, z1);
    const y = avgGround(x0, z0, x1, z1);
    flatten(x0, z0, x1, z1, y, 0);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      world.set(x, y - 1, z, (z - z0) % 3 === 2 ? B.DIRT : B.SOIL);
      if ((z - z0) % 3 !== 2 && hash2(x, z) < 0.92) world.set(x, y, z, B.WHEAT);
    }
    for (let x = x0 - 1; x <= x1 + 1; x += 2) { world.set(x, y, z0 - 1, B.LOG); world.set(x, y, z1 + 1, B.LOG); }
    for (let z = z0 - 1; z <= z1 + 1; z += 2) { world.set(x0 - 1, y, z, B.LOG); world.set(x1 + 1, y, z, B.LOG); }
    R.fields.push({ x0, z0, x1, z1, y, jobs: ['farmer', 'farmer', 'farmer'] });
  }
  // farmhouses & barns along the west road
  const houses = [[70, 262, 'farmhouse', 'thatch'], [96, 262, 'barn', 'rustic'], [70, 240, 'farmhouse', 'thatch'], [98, 240, 'farmhouse', 'rustic'], [124, 176, 'farmhouse', 'thatch'], [124, 330, 'barn', 'rustic']];
  for (const [x, z, type, style] of houses) {
    const x1 = x + (type === 'barn' ? 12 : 8), z1 = z + (type === 'barn' ? 9 : 7);
    reserve(x, z, x1, z1);
    const y = avgGround(x, z, x1, z1);
    buildStructure({ x0: x, z0: z, x1, z1, type, style, y0: y, doorSide: z < 256 ? 'S' : 'N', doorW: type === 'barn' ? 2 : 1, name: type === 'barn' ? 'Hay Barn' : `${pick(['Wexley', 'Harrow', 'Thatcher', 'Underhill'])} Farm` });
    R.buildings[R.buildings.length - 1].district = 'Westfields';
  }
  // windmill
  const mx = 84, mz = 300;
  reserve(mx - 4, mz - 4, mx + 4, mz + 4);
  const my = avgGround(mx - 3, mz - 3, mx + 3, mz + 3);
  flatten(mx - 3, mz - 3, mx + 3, mz + 3, my, 1);
  world.fill(mx - 3, my - 1, mz - 3, mx + 3, my + 11, mz + 3, B.COBBLE);
  world.fill(mx - 2, my, mz - 2, mx + 2, my + 10, mz + 2, B.AIR);
  world.fill(mx - 2, my + 5, mz - 2, mx + 2, my + 5, mz + 2, B.PLANK);
  for (let k = 0; k < 4; k++) world.fill(mx - 3 + k, my + 12 + k, mz - 3 + k, mx + 3 - k, my + 12 + k, mz + 3 - k, B.THATCH);
  world.fill(mx, my, mz + 3, mx, my + 1, mz + 3, B.AIR);
  world.fill(mx - 1, my + 8, mz - 4, mx + 1, my + 8, mz - 4, B.LOG);
  world.fill(mx - 8, my + 8, mz - 5, mx + 8, my + 8, mz - 5, B.PLANK); world.fill(mx, my, mz - 5, mx, my + 16, mz - 5, B.PLANK);
  world.fill(mx - 8, my + 7, mz - 5, mx - 2, my + 9, mz - 5, B.PLASTER); world.fill(mx + 2, my + 7, mz - 5, mx + 8, my + 9, mz - 5, B.PLASTER);
  world.fill(mx - 1, my + 10, mz - 5, mx + 1, my + 16, mz - 5, B.PLASTER); world.fill(mx - 1, my, mz - 5, mx + 1, my + 6, mz - 5, B.PLASTER);
  world.set(mx - 1, my, mz - 1, B.HAY); world.set(mx + 1, my, mz - 1, B.BARREL); world.set(mx + 1, my, mz + 1, B.TABLE);
  const mill = addBuilding({ name: 'Windmill', type: 'mill', desc: DESC.mill, x0: mx - 3, z0: mz - 3, x1: mx + 3, z1: mz + 3, y0: my, y1: my + 16, door: { x: mx, z: mz + 3, dx: 0, dz: 1 }, inside: { x: mx, z: mz + 2 }, outside: { x: mx, z: mz + 4 }, jobs: ['miller'], floors: 1, floorH: 10, stairs: [] });
  mill.workSpots.push({ x: mx, y: my, z: mz - 1 }); mill.district = 'Westfields';
  R.millAxis = { x: mx, y: my + 8, z: mz - 5 };
}

function genHamlet() {
  const cx = 256, cz = 80;
  const spots = [[cx - 26, cz - 10], [cx - 14, cz + 6], [cx + 12, cz - 12], [cx + 22, cz + 4], [cx - 30, cz + 16], [cx + 14, cz + 18], [cx - 12, cz - 22]];
  for (const [x, z] of spots) {
    const w = randInt(6, 8), d = randInt(6, 8);
    reserve(x, z, x + w, z + d);
    const y = avgGround(x, z, x + w, z + d);
    const b = buildStructure({ x0: x, z0: z, x1: x + w, z1: z + d, type: 'cottage', style: pick(['thatch', 'rustic', 'thatch']), y0: y, doorSide: x < cx ? 'E' : 'W' });
    b.name = `${pick(['Ashdown', 'Greymere', 'Redfern', 'Hollowell'])} Cottage`; b.district = 'Northmoor Hamlet';
  }
  reserve(cx + 30, cz - 30, cx + 44, cz - 12);
  const y = avgGround(cx + 30, cz - 30, cx + 44, cz - 12);
  flatten(cx + 30, cz - 30, cx + 44, cz - 12, y, 1);
  const ch = buildChurchAt(cx + 32, cz - 28, cx + 42, cz - 14, y);
  ch.district = 'Northmoor Hamlet';
  // hamlet well & road spur
  for (let x = cx - 30; x <= cx + 30; x++) { const hy = hm[x + (cz) * world.W]; world.set(x, hy - 1, cz, B.GRAVEL); }
  const wy = hm[cx + 4 + (cz - 2) * world.W];
  world.fill(cx + 3, wy, cz - 3, cx + 5, wy, cz - 1, B.COBBLE); world.set(cx + 4, wy, cz - 2, B.WATER);
}

function buildChurchAt(x0, z0, x1, z1, y) {
  // small chapel outside the city at arbitrary ground height
  const saved = hm;
  const h = 6, mx = Math.floor((x0 + x1) / 2);
  world.fill(x0, y - 1, z0, x1, y - 1, z1, B.COBBLE);
  world.walls(x0, y, z0, x1, y + h - 1, z1, B.COBBLE);
  for (let z = z0 + 2; z <= z1 - 2; z += 3) { world.fill(x0, y + 2, z, x0, y + 3, z, B.GLASS); world.fill(x1, y + 2, z, x1, y + 3, z, B.GLASS); }
  world.fill(mx, y, z1, mx, y + 2, z1, B.AIR);
  pitchedRoof(x0, z0, x1, z1, y + h, B.ROOF_SLATE, B.COBBLE, 'x');
  for (let z = z0 + 4; z <= z1 - 2; z += 2) { world.fill(x0 + 2, y, z, mx - 1, y, z, B.PEW); world.fill(mx + 1, y, z, x1 - 2, y, z, B.PEW); }
  world.set(mx, y, z0 + 1, B.ALTAR); world.fill(mx, y + 1, z0, mx, y + 3, z0, B.GOLD);
  const b = addBuilding({ name: 'Hamlet Chapel', type: 'chapel', desc: DESC.chapel, x0, z0, x1, z1, y0: y, y1: y + h + 6, door: { x: mx, z: z1, dx: 0, dz: 1 }, inside: { x: mx, z: z1 - 1 }, outside: { x: mx, z: z1 + 1 }, jobs: ['priest'], shelter: true, floors: 1, floorH: h, stairs: [] });
  b.workSpots.push({ x: mx, y, z: z0 + 2 });
  return b;
}

function genEnemyCamp() {
  const cx = 452, cz = 256;
  reserve(cx - 30, cz - 40, cx + 30, cz + 40);
  const y = avgGround(cx - 26, cz - 36, cx + 26, cz + 36);
  flatten(cx - 28, cz - 38, cx + 28, cz + 38, y, 2);
  world.fill(cx - 28, y - 1, cz - 38, cx + 28, y - 1, cz + 38, B.MUD);
  for (let x = cx - 28; x <= cx + 28; x++) for (let z = cz - 38; z <= cz + 38; z++) if (hash2(x, z) < 0.35) world.set(x, y - 1, z, B.DIRT);
  // tents
  const tents = [];
  for (let i = -2; i <= 2; i++) for (let j = -3; j <= 3; j++) {
    if (Math.abs(j) <= 0 && Math.abs(i) <= 0) continue;
    const tx = cx + i * 11 + randInt(-1, 1), tz = cz + j * 10 + randInt(-1, 1);
    if (Math.abs(tz - 256) < 5 && tx < cx) continue; // road
    const mat = (i + j) % 2 === 0 ? B.TENT_RED : B.TENT_BLACK;
    for (let k = 0; k < 3; k++) world.walls(tx - 3 + k, y + k, tz - 3 + k, tx + 3 - k, y + k, tz + 3 - k, mat);
    world.fill(tx, y + 3, tz, tx, y + 3, tz, mat);
    world.fill(tx, y, tz + 3, tx, y + 1, tz + 3, B.AIR);
    world.set(tx - 1, y, tz - 1, B.BED); world.set(tx + 1, y, tz - 1, B.CHEST);
    tents.push({ x: tx, y, z: tz });
  }
  // campfires
  for (const [ox, oz] of [[0, 0], [-16, -20], [16, 20], [16, -20]]) { world.fill(cx + ox - 1, y - 1, cz + oz - 1, cx + ox + 1, y - 1, cz + oz + 1, B.COBBLE); world.set(cx + ox, y, cz + oz, B.FIRE); world.set(cx + ox - 2, y, cz + oz, B.LOG); world.set(cx + ox + 2, y, cz + oz, B.LOG); }
  // palisade
  for (let x = cx - 28; x <= cx + 28; x += 1) { if (Math.abs(x - cx) % 2 === 0) { world.fill(x, y, cz - 38, x, y + 2, cz - 38, B.LOG); world.fill(x, y, cz + 38, x, y + 2, cz + 38, B.LOG); } }
  for (let z = cz - 38; z <= cz + 38; z += 1) { if (Math.abs(z - cz) % 2 === 0 && Math.abs(z - 256) > 4) { world.fill(cx - 28, y, z, cx - 28, y + 2, z, B.LOG); world.fill(cx + 28, y, z, cx + 28, y + 2, z, B.LOG); } }
  // warlord's tent
  const wx = cx + 18, wz = cz;
  for (let k = 0; k < 5; k++) world.walls(wx - 5 + k, y + k, wz - 5 + k, wx + 5 - k, y + k, wz + 5 - k, B.TENT_BLACK);
  world.fill(wx - 5, y, wz, wx - 5, y + 2, wz, B.AIR);
  world.set(wx, y, wz, B.GOLD); world.set(wx, y + 1, wz, B.CARPET); world.fill(wx - 2, y, wz - 2, wx - 2, y + 1, wz - 2, B.BANNER);
  R.camp = { x: cx, y, z: cz, tents, trebuchetSpots: [[cx - 20, cz - 30], [cx - 20, cz + 30], [cx - 8, cz - 22], [cx - 8, cz + 22], [cx + 6, cz - 12], [cx + 6, cz + 12]].map(([x, z]) => ({ x, y, z })) };
  R.enemySpawn = { x: cx, y, z: cz };
  addBuilding({ name: "Warlord Vargath's Camp", type: 'camp', desc: 'The invading host of the Iron Reach. They are waiting for the signal.', x0: cx - 28, z0: cz - 38, x1: cx + 28, z1: cz + 38, y0: y, y1: y + 6, door: { x: cx - 28, z: 256, dx: -1, dz: 0 }, inside: { x: cx - 27, z: 256 }, outside: { x: cx - 30, z: 256 }, jobs: [], floors: 1, floorH: 4, stairs: [] }).district = 'Iron Reach Camp';
}

function genMountainRuins() {
  // a ruined watchtower in the northern mountains and a dragon roost
  const rx = 256, rz = 28;
  const y = hm[rx + rz * world.W];
  world.fill(rx - 3, y - 1, rz - 3, rx + 3, y + 8, rz + 3, B.STONE);
  world.fill(rx - 2, y, rz - 2, rx + 2, y + 8, rz + 2, B.AIR);
  for (let i = 0; i < 30; i++) { const x = rx + randInt(-3, 3), zz = rz + randInt(-3, 3); world.fill(x, y + randInt(3, 8), zz, x, y + 8, zz, B.AIR); }
  R.roost = { x: 256, y: y + 30, z: 30 };
}

export function generate(w) {
  world = w;
  R = { buildings: [], ballistas: [], fields: [], patrol: [], gates: {}, wells: [], PY };
  genTerrain();
  genRoads();
  // city footprint reserved from trees
  reserve(WX0 - 8, WX0 - 8, WX1 + 8, WX1 + 8);
  genWalls();
  genKeep();
  genStreets();
  genLots();
  genFarms();
  genHamlet();
  genEnemyCamp();
  genMountainRuins();
  genTrees();
  for (const b of R.buildings) if (!b.district) b.district = (b.cx >= WX0 && b.cx <= WX1 && b.cz >= WX0 && b.cz <= WX1) ? districtOf(b.cx, b.cz) : 'Outer Lands';
  R.hm = hm;
  R.districtOf = (x, z) => {
    if (x >= 196 && x <= 316 && z >= 144 && z <= 234) return 'Royal Keep';
    if (x >= 239 && x <= 273 && z >= 239 && z <= 273) return 'Market Square';
    if (x >= WX0 && x <= WX1 && z >= WX0 && z <= WX1) return districtOf(x, z);
    if (x > 420 && Math.abs(z - 256) < 45) return 'Iron Reach Camp';
    if (x < 136 && z > 170 && z < 340) return 'Westfields';
    if (z < 120 && Math.abs(x - 256) < 50) return 'Northmoor Hamlet';
    if (Math.abs(z - riverZ(x)) < 14) return 'River Wyrm';
    return 'Outer Lands';
  };
  return R;
}
