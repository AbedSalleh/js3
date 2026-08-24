# js3 — grid tactics prototype

A browser-playable Fire Emblem–style tactics game built on three.js. Grid
movement with terrain costs, weapon triangle–free but stat-driven combat,
battle forecasts, counterattacks, doubling, and a stationary boss on a fort.

The entire build is **~150 kB gzipped including three.js**, loads instantly,
and runs on any static host with no special headers.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/, deployable anywhere
npm run simulate   # play 25 games headlessly and report the balance
```

**Controls** — left-click a unit, then a highlighted tile to move. Right-click
or Escape cancels (and undoes a move before you commit to an action).
Right-drag rotates, wheel zooms, arrow keys pan.

## The one architectural decision that matters

Game rules and rendering are completely separate, joined by an injected
`animator`:

```js
new GameState(chapter, animator)
// animator.moveUnit(unit, path)                  -> Promise
// animator.playCombat(attacker, defender, events) -> Promise
// animator.snapUnit(unit), animator.pause(ms)
```

`src/core/` imports **nothing** from three.js. Combat resolves to a list of
plain events —

```js
[ { type: 'hit',  from: cass, to: brigand, damage: 9, crit: false },
  { type: 'hit',  from: brigand, to: cass, damage: 8, crit: false },
  { type: 'defeat', unit: brigand } ]
```

— and something else decides what those look like. Today `Animator` plays them
as lunges and floating numbers on the map. A full Fire Emblem battle cutscene
would replace that one method and change nothing else.

That split is also why `npm run simulate` works: pass stubs that resolve
instantly and the whole game runs at full speed with no browser at all.

## Layout

```
src/core/          rules — no rendering, no DOM, independently testable
  Grid.js          terrain lookup, neighbours, coordinates
  pathfinding.js   Dijkstra movement range, path reconstruction, distance fields
  units.js         classes, weapons, stat getters
  combat.js        forecasts and exchange resolution (2RN hit rolls)
  GameState.js     turn flow, player input, enemy AI
src/render/        three.js — instanced tiles, toon materials, tweens
src/ui/hud.js      the interface, as plain DOM over the canvas
src/data/          chapters as ASCII maps
tools/simulate.mjs headless balance harness
```

## Adding a chapter

Maps are text. Copy `src/data/chapter1.js`:

```js
rows: [
  'MMM###....FFF.',   // . plain  F forest  H hill
  'MM#..X....FFX.',   // M mountain  X fort  ~ water  # wall
  ...
],
units: [
  { name: 'Rhea', cls: 'lord', team: 'player', x: 2, y: 9 },
  { name: 'Garrow', cls: 'knight', team: 'enemy', x: 12, y: 1,
    statBonus: { hp: 6, str: 1, def: -2 }, stationary: true },
],
```

Then point `tools/simulate.mjs` at it and run a few hundred games before you
open the browser. Chapter 1 currently lands at roughly 15 wins / 1 loss / 9
inconclusive per 25 runs against a cautious bot — the inconclusive ones are the
bot declining to storm the boss, not a stalemate in the rules.

`node tools/simulate.mjs --matrix` prints the full damage tables, which is
usually enough to spot a problem without playing at all. It is how the boss was
caught being mathematically immune: sitting on a fort stacked +2 defence on top
of knight armour, and four of five units were dealing exactly 1 damage.

## Swapping in real 3D models

Placeholder capsules live in one function — `buildUnit()` in
`src/render/UnitRenderer.js`. Nothing else in the codebase knows or cares what
a unit looks like; the game only ever asks for its grid position.

The practical pipeline:

1. Get a humanoid mesh — [Quaternius](https://quaternius.com) and
   [Kenney](https://kenney.nl) are free and CC0, Synty's POLYGON packs are
   cheap and stylistically coherent.
2. Rig it and pull animations from [Mixamo](https://mixamo.com) (free): sword
   slashes, spear thrusts, casting, hit reactions, deaths.
3. **Rig every class to the same skeleton.** Then one "slash" clip plays on
   every sword user, and content cost becomes *classes + animations* instead of
   *classes × animations*. This is the difference between a weekend and a month.
4. Load with `GLTFLoader`, clone with `SkeletonUtils.clone()` — plain `.clone()`
   silently breaks skinning — and drive with `AnimationMixer`.

Cel shading does more for the look than model quality: `MeshToonMaterial` with
a 3-band gradient ramp, plus the inverted-hull outlines already in
`UnitRenderer`. Chunky low-poly under toon shading reads as *stylized*; the same
meshes under realistic PBR read as *cheap*.

## What's deliberately not here

- **Battle cutscenes.** The event list is ready for them; the scene is not.
- Weapon triangle, inventory, experience, promotion, support conversations.
- Ranged units get no counterattack at range 1 — no melee/ranged distinction
  beyond what weapon range already gives.
- Instanced tiles handle maps far larger than this one, but the enemy AI
  recomputes distance fields per unit per turn and will need caching well
  before that becomes a problem.
