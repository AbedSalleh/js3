import * as THREE from 'three';
import { TILE_BASE, toWorld, tileTop, makeToonRamp } from './scene.js';

/**
 * The whole battlefield as one InstancedMesh — one draw call regardless of
 * map size, and raycasting gives back an instanceId we map straight to a tile.
 */
export class TileRenderer {
  constructor(scene, grid) {
    this.grid = grid;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);   // origin at the tile's base, so scale.y grows upward

    const material = new THREE.MeshToonMaterial({ gradientMap: makeToonRamp() });

    this.mesh = new THREE.InstancedMesh(geometry, material, grid.width * grid.height);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const terrain = grid.terrainAt(x, y);
        const { x: wx, z: wz } = toWorld(grid, x, y);
        const height = TILE_BASE + terrain.height;

        // 0.97 leaves a hairline gap so the grid stays legible without drawing lines.
        matrix.compose(
          new THREE.Vector3(wx, 0, wz),
          new THREE.Quaternion(),
          new THREE.Vector3(0.97, height, 0.97),
        );
        this.mesh.setMatrixAt(this.index(x, y), matrix);
        this.mesh.setColorAt(this.index(x, y), color.setHex(terrain.color));
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);

    // Water sits below the slab top; a translucent sheet sells it as a surface.
    this.addWaterSheet(scene, grid);
  }

  index(x, y) { return y * this.grid.width + x; }

  fromInstanceId(id) {
    return { x: id % this.grid.width, y: Math.floor(id / this.grid.width) };
  }

  addWaterSheet(scene, grid) {
    const tiles = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++)
        if (grid.terrainAt(x, y).name === 'Water') tiles.push([x, y]);

    if (tiles.length === 0) return;

    const geometry = new THREE.PlaneGeometry(0.97, 0.97);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshToonMaterial({
      color: 0x63a6d8,
      transparent: true,
      opacity: 0.55,
      gradientMap: makeToonRamp(),
    });

    const sheet = new THREE.InstancedMesh(geometry, material, tiles.length);
    const matrix = new THREE.Matrix4();
    tiles.forEach(([x, y], i) => {
      const { x: wx, z: wz } = toWorld(grid, x, y);
      matrix.setPosition(wx, tileTop(grid, x, y) + 0.07, wz);
      sheet.setMatrixAt(i, matrix);
    });
    sheet.instanceMatrix.needsUpdate = true;
    scene.add(sheet);
    this.water = sheet;
  }
}
