import { key } from './Grid.js';

/** Minimal binary min-heap keyed by numeric priority. */
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }

  push(value, priority) {
    const items = this.items;
    items.push({ value, priority });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].priority <= items[i].priority) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].priority < items[smallest].priority) smallest = l;
        if (r < items.length && items[r].priority < items[smallest].priority) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top.value;
  }
}

/**
 * Dijkstra flood-fill of every tile `unit` can reach this turn.
 *
 * Allies can be walked through but not stopped on; enemies block outright.
 * Returns { costs, cameFrom, stoppable } where `stoppable` is the set of
 * tiles the unit may actually end its move on.
 */
export function computeReachable(grid, unit, units) {
  const blockers = new Map();  // "x,y" -> unit standing there
  for (const u of units) {
    if (u.alive) blockers.set(key(u.x, u.y), u);
  }

  const costs = new Map([[key(unit.x, unit.y), 0]]);
  const cameFrom = new Map();
  const heap = new MinHeap();
  heap.push([unit.x, unit.y], 0);

  while (heap.size > 0) {
    const [x, y] = heap.pop();
    const here = key(x, y);
    const spent = costs.get(here);

    for (const [nx, ny] of grid.neighbours(x, y)) {
      const occupant = blockers.get(key(nx, ny));
      if (occupant && occupant.team !== unit.team) continue;  // enemies block

      const step = grid.terrainAt(nx, ny).cost;
      if (!Number.isFinite(step)) continue;

      const total = spent + step;
      if (total > unit.mov) continue;

      const there = key(nx, ny);
      if (costs.has(there) && costs.get(there) <= total) continue;

      costs.set(there, total);
      cameFrom.set(there, here);
      heap.push([nx, ny], total);
    }
  }

  // You may end your move on your own tile, or any reached tile that is empty.
  const stoppable = new Set();
  for (const k of costs.keys()) {
    const occupant = blockers.get(k);
    if (!occupant || occupant === unit) stoppable.add(k);
  }

  return { costs, cameFrom, stoppable };
}

/** Walk the cameFrom chain back to the unit's origin. Returns [[x,y], ...]. */
export function reconstructPath(cameFrom, fromKey, toKey) {
  if (fromKey === toKey) return [];
  const path = [];
  let cursor = toKey;
  while (cursor !== fromKey) {
    path.push(cursor.split(',').map(Number));
    cursor = cameFrom.get(cursor);
    if (cursor === undefined) return null;  // unreachable
  }
  return path.reverse();
}

/**
 * True path cost from `origin` to every tile on the map, with no movement cap.
 *
 * Straight-line distance is a trap on a map with a river: a unit that just
 * minimises dx+dy walks to the near bank and stops there forever, because
 * every tile it can reach is "further" than where it stands. Following this
 * field instead routes it around to a crossing.
 */
export function computeDistanceField(grid, origin, units, movingTeam) {
  const blocked = new Set();
  for (const u of units) {
    if (u.alive && u.team !== movingTeam) blocked.add(key(u.x, u.y));
  }

  const dist = new Map([[key(origin.x, origin.y), 0]]);
  const heap = new MinHeap();
  heap.push([origin.x, origin.y], 0);

  while (heap.size > 0) {
    const [x, y] = heap.pop();
    const spent = dist.get(key(x, y));

    for (const [nx, ny] of grid.neighbours(x, y)) {
      const there = key(nx, ny);
      if (blocked.has(there)) continue;

      const step = grid.terrainAt(nx, ny).cost;
      if (!Number.isFinite(step)) continue;

      const total = spent + step;
      if (dist.has(there) && dist.get(there) <= total) continue;
      dist.set(there, total);
      heap.push([nx, ny], total);
    }
  }
  return dist;
}

/**
 * Every tile the unit could strike this turn: each stoppable tile expanded
 * by the unit's weapon range. Used for the red threat overlay.
 */
export function computeThreat(grid, unit, stoppable) {
  const threat = new Set();
  const { min, max } = unit.weapon.range;

  for (const k of stoppable) {
    const [sx, sy] = k.split(',').map(Number);
    for (let dx = -max; dx <= max; dx++) {
      for (let dy = -max; dy <= max; dy++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist < min || dist > max) continue;
        const tx = sx + dx, ty = sy + dy;
        if (!grid.inBounds(tx, ty)) continue;
        if (stoppable.has(key(tx, ty))) continue;  // shown as movement instead
        threat.add(key(tx, ty));
      }
    }
  }
  return threat;
}
