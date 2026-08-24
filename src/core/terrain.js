// Terrain definitions. `cost` is movement points to ENTER the tile;
// Infinity means impassable to foot units.
export const TERRAIN = {
  plain:    { name: 'Plain',    cost: 1,        defense: 0, avoid: 0,  color: 0x6f9e5a, height: 0.00 },
  forest:   { name: 'Forest',   cost: 2,        defense: 1, avoid: 20, color: 0x2f6b3d, height: 0.18 },
  hill:     { name: 'Hill',     cost: 2,        defense: 1, avoid: 10, color: 0x937a4e, height: 0.34 },
  mountain: { name: 'Mountain', cost: 3,        defense: 2, avoid: 30, color: 0x6f655a, height: 0.62 },
  // Defence here stacks on top of the occupant's own, so +3 on a boss with
  // knight-grade armour made him mathematically immune. +2 is plenty.
  fort:     { name: 'Fort',     cost: 1,        defense: 2, avoid: 15, color: 0xa2968a, height: 0.12 },
  water:    { name: 'Water',    cost: Infinity, defense: 0, avoid: 0,  color: 0x3a6d9e, height: -0.16 },
  wall:     { name: 'Wall',     cost: Infinity, defense: 0, avoid: 0,  color: 0x4c4a52, height: 0.85 },
};

// Single-character legend used by the ASCII maps in src/data/.
export const LEGEND = {
  '.': 'plain',
  'F': 'forest',
  'H': 'hill',
  'M': 'mountain',
  '#': 'wall',
  '~': 'water',
  'X': 'fort',
};
