export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, PLANK: 5, LOG: 6, LEAVES: 7, WATER: 8, SAND: 9,
  ROOF_RED: 10, ROOF_SLATE: 11, GLASS: 12, CASTLE: 13, PLASTER: 14, BED: 15, TABLE: 16, CHEST: 17,
  ANVIL: 18, OVEN: 19, BARREL: 20, BOOKSHELF: 21, HAY: 22, WHEAT: 23, FIRE: 24, GOLD: 26,
  DARKPLANK: 27, SNOW: 28, GRAVEL: 29, ASH: 30, ALTAR: 31, CARPET: 32, TENT_RED: 34, TENT_BLACK: 35,
  IRON: 36, SOIL: 37, THATCH: 38, BEAM: 39, MUD: 40, PEW: 41, ROOF_GREEN: 42, BANNER: 43, FLOWERS: 44, MOSS: 45,
};

export const COLORS = new Array(64).fill([0.9, 0.2, 0.9]);
const set = (t, hex) => { COLORS[t] = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; };
set(B.GRASS, 0x5f9e3c); set(B.DIRT, 0x7a5333); set(B.STONE, 0x7c7c80); set(B.COBBLE, 0x8a8a86);
set(B.PLANK, 0xb08a54); set(B.LOG, 0x6b4a2b); set(B.LEAVES, 0x3f7d2e); set(B.WATER, 0x2f6fb5); set(B.SAND, 0xd8c98a);
set(B.ROOF_RED, 0xa3402f); set(B.ROOF_SLATE, 0x4d5563); set(B.GLASS, 0xa9d8f0); set(B.CASTLE, 0x9a9689); set(B.PLASTER, 0xe6dcc3);
set(B.BED, 0xb63a4a); set(B.TABLE, 0x8c6535); set(B.CHEST, 0x9a6b2f); set(B.ANVIL, 0x3a3a40); set(B.OVEN, 0x5e5450);
set(B.BARREL, 0x7a5a30); set(B.BOOKSHELF, 0x6d4425); set(B.HAY, 0xd9b84a); set(B.WHEAT, 0xd4b24a); set(B.FIRE, 0xff8a1f);
set(B.GOLD, 0xf0c445); set(B.DARKPLANK, 0x5b3d22); set(B.SNOW, 0xf2f4f8); set(B.GRAVEL, 0x8f8b84); set(B.ASH, 0x3c3a38);
set(B.ALTAR, 0xd9d3c4); set(B.CARPET, 0x8e1f2b); set(B.TENT_RED, 0x9b2f2f); set(B.TENT_BLACK, 0x2a2a2e); set(B.IRON, 0x6f7480);
set(B.SOIL, 0x5a3d26); set(B.THATCH, 0xc7a55a); set(B.BEAM, 0x4f3620); set(B.MUD, 0x6e5a3a); set(B.PEW, 0x7a5228);
set(B.ROOF_GREEN, 0x4b6b3a); set(B.BANNER, 0x2b4a9b); set(B.FLOWERS, 0xd85f9b); set(B.MOSS, 0x4c7a3a);

export const TRANSPARENT = new Uint8Array(64);
TRANSPARENT[B.AIR] = 1; TRANSPARENT[B.GLASS] = 1; TRANSPARENT[B.WATER] = 1; TRANSPARENT[B.FIRE] = 1;

export const NON_SOLID = new Uint8Array(64);
NON_SOLID[B.AIR] = 1; NON_SOLID[B.WATER] = 1; NON_SOLID[B.FIRE] = 1; NON_SOLID[B.WHEAT] = 1; NON_SOLID[B.FLOWERS] = 1;

export const FLAMMABLE = new Uint8Array(64);
for (const t of [B.PLANK, B.LOG, B.LEAVES, B.ROOF_RED, B.ROOF_SLATE, B.ROOF_GREEN, B.PLASTER, B.BED, B.TABLE, B.CHEST, B.BARREL,
  B.BOOKSHELF, B.HAY, B.WHEAT, B.DARKPLANK, B.CARPET, B.TENT_RED, B.TENT_BLACK, B.THATCH, B.BEAM, B.PEW, B.BANNER, B.FLOWERS]) FLAMMABLE[t] = 1;

// blocks that never get destroyed by explosions (bedrock-ish base layer handled separately)
export const HARDNESS = new Float32Array(64).fill(1);
HARDNESS[B.CASTLE] = 2.2; HARDNESS[B.STONE] = 1.8; HARDNESS[B.IRON] = 3; HARDNESS[B.GOLD] = 1.5; HARDNESS[B.COBBLE] = 1.5;
HARDNESS[B.WATER] = 0; HARDNESS[B.FIRE] = 0;

export const isSolid = (t) => !NON_SOLID[t];
