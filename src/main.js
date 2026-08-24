import * as THREE from 'three';
import './style.css';

import { chapter1 } from './data/chapter1.js';
import { GameState } from './core/GameState.js';
import { createScene, toWorld, tileTop } from './render/scene.js';
import { TileRenderer } from './render/TileRenderer.js';
import { UnitRenderer } from './render/UnitRenderer.js';
import { Highlights } from './render/Highlights.js';
import { Animator } from './render/Animator.js';
import { Hud } from './ui/hud.js';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');

// --- scene graph ------------------------------------------------------------

// GameState builds the Grid from the chapter, so make it first and borrow its
// grid for the renderers rather than parsing the map twice.
const bootstrap = new GameState(chapter1, null);
const grid = bootstrap.grid;

const { renderer, scene, camera, controls, resize, frameCamera } = createScene(canvas, grid);
controls.listenToKeyEvents(window);       // arrow keys pan

// Establish the aspect ratio first, then frame the board to it. Framing runs
// once so a later window resize doesn't yank the camera out of the player's
// chosen zoom.
resize();
frameCamera();

const tiles = new TileRenderer(scene, grid);
const units = new UnitRenderer(scene, grid);
const highlights = new Highlights(scene, grid);
const animator = new Animator(units, camera, overlay);

const state = bootstrap;
state.animator = animator;
units.spawn(state.units);

// A ring that follows the mouse, so the cursor reads as being on the board.
const cursor = new THREE.Mesh(
  new THREE.TorusGeometry(0.42, 0.03, 6, 24),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }),
);
cursor.rotation.x = -Math.PI / 2;
cursor.visible = false;
scene.add(cursor);

// --- input ------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;

function tileUnderPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(tiles.mesh, false)[0];
  return hit ? tiles.fromInstanceId(hit.instanceId) : null;
}

canvas.addEventListener('pointermove', (event) => {
  hovered = tileUnderPointer(event);

  if (hovered) {
    const { x: wx, z: wz } = toWorld(grid, hovered.x, hovered.y);
    cursor.position.set(wx, tileTop(grid, hovered.x, hovered.y) + 0.05, wz);
    cursor.visible = true;
  } else {
    cursor.visible = false;
  }

  const unit = hovered ? state.unitAt(hovered.x, hovered.y) : null;
  hud.setHover(unit, hovered);
  hud.setForecastTarget(
    state.mode === 'targeting' && unit && state.targets.includes(unit) ? unit : null,
  );
});

canvas.addEventListener('pointerleave', () => {
  hovered = null;
  cursor.visible = false;
  hud.setHover(null, null);
});

// Distinguish a click from a camera drag: only the former is a game input.
let pressed = null;

canvas.addEventListener('pointerdown', (event) => {
  pressed = { button: event.button, x: event.clientX, y: event.clientY };
});

canvas.addEventListener('pointerup', (event) => {
  if (!pressed || pressed.button !== event.button) { pressed = null; return; }
  const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
  pressed = null;
  if (moved > 5) return;   // that was a drag

  if (event.button === 0) {
    const tile = tileUnderPointer(event);
    if (tile) state.clickTile(tile.x, tile.y);
  } else if (event.button === 2) {
    state.cancel();
  }
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') state.cancel();
});

// --- hud --------------------------------------------------------------------

const hud = new Hud(state, {
  onAction(action) {
    if (action === 'attack') state.beginTargeting();
    else if (action === 'wait') state.wait();
    else state.cancel();
  },
  onEndTurn() {
    // Ending early spends every unit that hasn't acted.
    for (const unit of state.living('player')) unit.hasMoved = true;
    state.endPlayerPhase();
  },
  onRestart() {
    window.location.reload();
  },
});

// --- loop -------------------------------------------------------------------

let highlightsDirty = true;
state.subscribe(() => { highlightsDirty = true; });

const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);   // clamp after a tab switch
  elapsed += dt;

  animator.update(dt);
  units.refresh(state, elapsed);

  if (highlightsDirty) {
    highlights.update(state);
    highlightsDirty = false;
  }

  controls.update();
  resize();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Debug handle: inspect or drive the game from the devtools console, and
// what the browser smoke test drives.
window.__game = { THREE, state, grid, camera, canvas, units, tiles, animator, hud };

state.write(`— Player phase, turn 1 —`);
state.emit();
requestAnimationFrame(frame);
