# Crownbound

A single-player 3D tower-battle prototype with an original voxel arena, procedural characters, and synthesised sound. Lead your army from the ground, cross the bridges, and destroy the rival king tower. The earlier SEO research portfolio remains in `research/`.

## Run

Requires Node.js 20.19+ or 22.12+ and a browser with WebGL2.

```sh
npm ci
npm run dev
```

Open the Vite server in your browser and click **Enter the arena**. Allow pointer lock to look freely with the mouse. If pointer lock is unavailable, drag over the arena to look around. Touch devices have movement, jump, attack, and deploy controls plus drag-to-look.

In the cloud workspace, if the default npm cache is unwritable, use `npm ci --cache /tmp/crownbound-npm-cache`.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Mouse / touch drag | Look |
| Space | Jump |
| Shift | Sprint |
| Left mouse button | Sword attack; hold to keep swinging |
| 1–4 / tap a card | Select a troop or spell |
| E / right mouse button | Deploy at the ground reticle |
| V | Switch first-person / third-person view |
| Escape | Pause and release the mouse |
| H | Help |
| M | Toggle sound |

## Battle rules

- Matches last three minutes. Destroy the red king tower for immediate victory. At timeout, tower crowns break ties first, then remaining tower health.
- Elixir starts at seven, replenishes automatically, and caps at ten. Regeneration speeds up during the final minute.
- **Bladeguard (3):** a sturdy melee fighter.
- **Twin Rangers (3):** two ranged units. Keep them behind a tank.
- **Stone Giant (5):** a slow, tough unit that focuses towers.
- **Fireball (4):** area damage that can be cast across the river.
- Troops must be deployed on your side of the river. They navigate the bridges and fight automatically; you can roam anywhere inside the arena.
- Your sword damages enemies and towers. Towers and enemy troops can damage you. At zero health, you respawn after four seconds while your army keeps fighting.
- After six seconds without taking damage, your health gradually recovers. Retreat behind your troops when you need a breather.
- The field map shows towers, troops, and your position. Watch for wave alerts and build a push in the opposite lane.
- The river slows movement. Jump onto low obstacles and use bridges for faster crossings.
- Pausing or switching away from the browser pauses the battle.

## Build and validation

```sh
npm test          # deterministic battle simulation tests
npm run build    # creates dist/
npm run preview  # serves the production build
npm run build:standalone # creates a self-contained standalone/index.html
```

The simulation tests cover deployment costs, elixir regeneration, fireball damage, sword range and cooldown, bridge pathfinding, respawns, king-tower victory, and timeout scoring. Browser smoke checks were also performed for the rendered arena and interactive controls.

To play without a development server, build the standalone version and open `standalone/index.html` directly in your browser. This single file includes the game, graphics, fonts, and sound generation, so it also works offline.

The game uses Three.js and Vite. Fonts, artwork, sound generation, and all game assets are bundled or generated locally; no API keys or backend are required. This prototype supports solo battles against scripted enemy waves. Multiplayer, Minecraft-style block editing, and persistent progression are outside its current scope.

## Source map

- `src/main.js` — input, player physics, camera, sound, interface, and scene integration.
- `src/battle.js` — renderer-independent battle simulation.
- `src/world.js` — procedural arena, characters, effects, and rendering.
- `src/style.css` and `index.html` — game interface.
- `src/battle.test.js` — combat and pathfinding regression checks.
