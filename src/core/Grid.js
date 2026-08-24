import { TERRAIN, LEGEND } from './terrain.js';

export const key = (x, y) => `${x},${y}`;

/**
 * The battlefield. Pure data — knows about terrain and coordinates,
 * knows nothing about units or rendering.
 */
export class Grid {
  constructor(rows) {
    this.height = rows.length;
    this.width = rows[0].length;
    this.tiles = [];

    for (let y = 0; y < this.height; y++) {
      if (rows[y].length !== this.width)
        throw new Error(`Map row ${y} is ${rows[y].length} wide, expected ${this.width}`);
      for (let x = 0; x < this.width; x++) {
        const ch = rows[y][x];
        const type = LEGEND[ch];
        if (!type) throw new Error(`Unknown map character "${ch}" at ${x},${y}`);
        this.tiles.push(type);
      }
    }
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  terrainAt(x, y) {
    return TERRAIN[this.tiles[y * this.width + x]];
  }

  /** Orthogonal neighbours, clipped to the map. */
  neighbours(x, y) {
    const out = [];
    if (x > 0) out.push([x - 1, y]);
    if (x < this.width - 1) out.push([x + 1, y]);
    if (y > 0) out.push([x, y - 1]);
    if (y < this.height - 1) out.push([x, y + 1]);
    return out;
  }
}

export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
