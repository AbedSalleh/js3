import * as THREE from 'three';
import { toWorld, tileTop } from './scene.js';

const MOVE   = 0x4d8fe8;
const THREAT = 0xe05a4a;
const TARGET = 0xffc23d;

/**
 * The blue movement / red threat overlay. One InstancedMesh sized to the whole
 * map; tiles that shouldn't show are scaled to zero rather than removed, so
 * repainting every frame stays free.
 */
export class Highlights {
  constructor(scene, grid) {
    this.grid = grid;
    this.capacity = grid.width * grid.height;

    const geometry = new THREE.PlaneGeometry(0.9, 0.9);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    this.matrix = new THREE.Matrix4();
    this.color = new THREE.Color();
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    this.clear();
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, this.hidden);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.used = 0;
  }

  place(x, y, hex) {
    if (this.used >= this.capacity) return;
    const { x: wx, z: wz } = toWorld(this.grid, x, y);
    this.matrix.setPosition(wx, tileTop(this.grid, x, y) + 0.03, wz);
    this.mesh.setMatrixAt(this.used, this.matrix);
    this.mesh.setColorAt(this.used, this.color.setHex(hex));
    this.used++;
  }

  /** Repaint from the current game state. */
  update(state) {
    this.clear();
    const show = state.mode === 'selected' || state.mode === 'action' || state.mode === 'targeting';
    if (!show || !state.reach) {
      this.flush();
      return;
    }

    if (state.mode === 'targeting') {
      for (const target of state.targets) this.place(target.x, target.y, TARGET);
    } else {
      for (const k of state.threat ?? []) {
        const [x, y] = k.split(',').map(Number);
        this.place(x, y, THREAT);
      }
      if (state.mode === 'selected') {
        for (const k of state.reach.stoppable) {
          const [x, y] = k.split(',').map(Number);
          this.place(x, y, MOVE);
        }
      }
    }

    this.flush();
  }

  flush() {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
