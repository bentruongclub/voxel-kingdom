# Aldermere — Voxel Kingdom

A medieval voxel kingdom under siege, playable in the browser. No install, no build step: one HTML file, a handful of ES modules, and Three.js from a CDN.

**Play it:** https://bentruongclub.github.io/voxel-kingdom/

The whole world is generated in your browser when the page loads, so the first 10–30 seconds are spent raising mountains and laying streets. Nearby chunks appear first; the rest of the map streams in behind you.

## What's inside

- **A 512 × 512 × 64 voxel world** — a walled city with a royal keep, four districts, farmland, a river and bridge, an outlying hamlet, forests, mountains, and an enemy camp.
- **Interiors in every building** — ~150 hollow, furnished buildings, each with a job in the city: smithy, bakery, tavern, temple, barracks, granary, market stalls, guardhouses, homes. Hover a building to see its name, purpose, and who lives or works there.
- **NPCs with jobs and schedules** — around 220 named citizens who move between home, work, market, and tavern through the day. When the alarm sounds, civilians run indoors, guards rally to the walls, and militia arm themselves.
- **Soldiers operating siege engines** — crews lead moving targets with tower ballistas; enemy trebuchets are hauled into range and hurl boulders that crater walls and roofs. Raiders batter the gates and pour in when they fall.
- **A fully destructible kingdom** — every block can be smashed, blasted, or burned. Fire spreads through thatch, wood, and hay.
- **A fire-breathing dragon** — Scorrath the Ashen wakes a couple of minutes in, strafes districts with lines of flame, retreats to its mountain roost when wounded, heals, and returns.

## Controls

| Key | Action |
| --- | --- |
| Click / Esc | take / release mouse control |
| W A S D, Shift, Space | move, sprint, jump |
| F | toggle flight (Space / C to go up / down) |
| Left mouse | warhammer — smash blocks and foes |
| Right mouse | fireball |
| Q / X | place stone / set fire |
| I | start the invasion now |
| G | summon or call off the dragon |
| T | skip 3 hours |
| H | hide the help panel |

## Run locally

Any static file server works, for example:

```bash
python3 -m http.server 8000
```

then open http://localhost:8000/. Opening `index.html` directly from disk will not work because browsers block ES modules over `file://`.

## Layout

```
index.html        page, styles, HUD
src/main.js       setup and game loop
src/world.js      voxel storage, chunk meshing with ambient occlusion, rendering
src/worldgen.js   terrain, city, buildings, interiors, farms, enemy camp
src/npc.js        citizens, guards, raiders: jobs, schedules, pathing, combat
src/siege.js      ballistas, trebuchets, projectiles, explosions
src/dragon.js     dragon model, flight, fire breath
src/fire.js       fire spread
src/particles.js  debris, smoke, flame particles
src/humanoids.js  instanced character renderer
src/player.js     first-person controls and collision
src/ui.js         HUD, minimap, event log
src/blocks.js     block types and properties
src/util.js       noise, random, names
```

Built with [Three.js](https://threejs.org/). No other dependencies.
