import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Thickness every tile has below its terrain height, so the map reads as a slab. */
export const TILE_BASE = 0.5;

export function tileTop(grid, x, y) {
  return TILE_BASE + grid.terrainAt(x, y).height;
}

/** Grid coords -> world coords, with the map centred on the origin. */
export function toWorld(grid, x, y) {
  return { x: x - (grid.width - 1) / 2, z: y - (grid.height - 1) / 2 };
}

/**
 * A 3-band gradient ramp. Feeding this to MeshToonMaterial is what turns
 * ordinary lighting into hard cel-shaded steps — it's the single biggest
 * lever on the art style, and it costs four bytes.
 */
export function makeToonRamp(steps = 3) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round((i / (steps - 1)) * 255);
  const ramp = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

export function createScene(canvas, grid) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141c);

  // Frame the whole map instead of hard-coding a position: a narrow field of
  // view from further back keeps the board readable, where a wide one up close
  // foreshortens the far rows into nothing.
  const FOV = 38;
  const ELEVATION = THREE.MathUtils.degToRad(52);

  scene.fog = new THREE.Fog(0x10141c, 1, 2);   // real values set by frameCamera

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);

  // The eight corners of the board's bounding volume.
  const halfW = grid.width / 2;
  const halfD = grid.height / 2;
  const topY = TILE_BASE + 0.9;
  const corners = [];
  for (const cx of [-halfW, halfW])
    for (const cy of [-0.2, topY])
      for (const cz of [-halfD, halfD])
        corners.push(new THREE.Vector3(cx, cy, cz));

  /**
   * Pull back until the whole board fits on screen.
   *
   * Solved numerically rather than with a closed form: a tilted perspective
   * camera puts the near edge of the map far closer than its centre, so the
   * projected size doesn't follow from the map's dimensions. Projecting the
   * real corners and rescaling converges in a handful of passes and stays
   * correct for any map shape or aspect ratio.
   */
  function frameCamera() {
    const MARGIN = 0.9;    // fraction of the viewport the board should occupy
    let distance = Math.max(grid.width, grid.height);

    for (let pass = 0; pass < 12; pass++) {
      camera.position.set(0, Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * distance);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld(true);

      let extent = 0;
      for (const corner of corners) {
        const ndc = corner.clone().project(camera);
        extent = Math.max(extent, Math.abs(ndc.x), Math.abs(ndc.y));
      }
      if (Math.abs(extent - MARGIN) < 0.005) break;
      distance *= extent / MARGIN;
    }

    controls.minDistance = distance * 0.35;
    controls.maxDistance = distance * 2.0;
    scene.fog.near = distance * 0.9;
    scene.fog.far = distance * 3.0;
    controls.update();
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.45;   // never drop below the horizon
  controls.mouseButtons = {                  // left click is for the game
    LEFT: null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.update();

  // Key light, angled so terrain height casts readable shadows across tiles.
  const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
  key.position.set(6, 12, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const span = Math.max(grid.width, grid.height) * 0.75;
  Object.assign(key.shadow.camera, {
    left: -span, right: span, top: span, bottom: -span, near: 1, far: 40,
  });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0015;
  scene.add(key);

  // Cool fill from the opposite side keeps shadowed faces from going flat black.
  const fill = new THREE.DirectionalLight(0x6f8fd0, 0.7);
  fill.position.set(-7, 6, -5);
  scene.add(fill);

  scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x2a2f3a, 0.55));

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  return { renderer, scene, camera, controls, resize, frameCamera };
}
