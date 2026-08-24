import * as THREE from 'three';
import { toWorld, tileTop, makeToonRamp } from './scene.js';

const RAMP = makeToonRamp();

/**
 * Placeholder units: a capsule, a head, a weapon silhouette and a team ring.
 *
 * Everything here is deliberately swappable. When real GLTF models arrive,
 * only `buildUnit` changes — the game never asks a unit for anything but its
 * position, so nothing else in the codebase cares what it looks like.
 */
function buildUnit(unit) {
  const group = new THREE.Group();
  const material = new THREE.MeshToonMaterial({ color: unit.color, gradientMap: RAMP });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.3, 4, 12), material);
  body.position.y = 0.34;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), material);
  head.position.y = 0.66;
  head.castShadow = true;
  group.add(head);

  // A crude weapon silhouette — enough to tell classes apart at a glance.
  const steel = new THREE.MeshToonMaterial({ color: 0xd8dde6, gradientMap: RAMP });
  let weapon;
  if (unit.weapon.kind === 'bow') {
    weapon = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 14, Math.PI), steel);
    weapon.rotation.y = Math.PI / 2;
  } else if (unit.weapon.kind === 'tome') {
    weapon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshToonMaterial({
      color: 0xffb454, emissive: 0x8a4a00, gradientMap: RAMP,
    }));
  } else {
    weapon = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.5, 0.045), steel);
  }
  weapon.position.set(0.22, 0.42, 0);
  weapon.castShadow = true;
  group.add(weapon);

  // Inverted-hull outline: same mesh, backfaces only, scaled up slightly.
  // This is the cheapest way to get the hand-drawn edge a toon look needs.
  const outline = new THREE.Mesh(
    body.geometry,
    new THREE.MeshBasicMaterial({ color: 0x0b0e14, side: THREE.BackSide }),
  );
  outline.position.copy(body.position);
  outline.scale.multiplyScalar(1.14);
  group.add(outline);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.035, 6, 20),
    new THREE.MeshBasicMaterial({ color: unit.team === 'player' ? 0x4d8fe8 : 0xe05a4a }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  group.userData = { unit, body, head, weapon, ring, material };
  return group;
}

export class UnitRenderer {
  constructor(scene, grid) {
    this.scene = scene;
    this.grid = grid;
    this.groups = new Map();   // unit.id -> THREE.Group
  }

  spawn(units) {
    for (const unit of units) {
      const group = buildUnit(unit);
      this.groups.get(unit.id)?.removeFromParent();
      this.groups.set(unit.id, group);
      this.scene.add(group);
      this.snap(unit);
    }
  }

  get(unit) { return this.groups.get(unit.id); }

  /** World position of the tile a unit occupies. */
  anchor(x, y) {
    const { x: wx, z: wz } = toWorld(this.grid, x, y);
    return new THREE.Vector3(wx, tileTop(this.grid, x, y), wz);
  }

  snap(unit) {
    this.get(unit)?.position.copy(this.anchor(unit.x, unit.y));
  }

  /** Face the direction of travel, or an opponent. */
  face(unit, tx, ty) {
    const group = this.get(unit);
    if (!group) return;
    const from = this.anchor(unit.x, unit.y);
    const to = this.anchor(tx, ty);
    if (from.equals(to)) return;
    group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  }

  /** Grey out spent units, and bob the selected one so it reads as active. */
  refresh(state, elapsed) {
    for (const [, group] of this.groups) {
      const { unit, material, ring } = group.userData;

      // `unit.alive` flips false the moment damage lands, which is *before*
      // the defeat animation plays. Visibility follows the animator's flags
      // instead, so a dying unit stays on screen long enough to die.
      if (group.userData.dead || (!unit.alive && !group.userData.dying)) {
        group.visible = false;
        continue;
      }
      group.visible = true;

      const spent = unit.team === 'player' && unit.hasMoved;
      material.color.setHex(unit.color);
      if (spent) material.color.multiplyScalar(0.45);

      const selected = state.selected === unit;
      ring.visible = !spent;
      ring.scale.setScalar(selected ? 1.15 + Math.sin(elapsed * 6) * 0.06 : 1);
    }
  }
}
