// Might is deliberately a large share of total attack: it keeps damage
// meaningful against armoured targets, where a low-might weapon rounds to
// chip damage and combat stops being a decision.
export const WEAPONS = {
  ironSword:  { name: 'Iron Sword',  might: 6, hit: 90, crit: 0,  range: { min: 1, max: 1 }, kind: 'sword' },
  steelSword: { name: 'Steel Sword', might: 9, hit: 80, crit: 0,  range: { min: 1, max: 1 }, kind: 'sword' },
  ironLance:  { name: 'Iron Lance',  might: 7, hit: 85, crit: 0,  range: { min: 1, max: 1 }, kind: 'lance' },
  ironAxe:    { name: 'Iron Axe',    might: 8, hit: 75, crit: 0,  range: { min: 1, max: 1 }, kind: 'axe'   },
  ironBow:    { name: 'Iron Bow',    might: 6, hit: 85, crit: 0,  range: { min: 2, max: 2 }, kind: 'bow'   },
  fire:       { name: 'Fire',        might: 6, hit: 90, crit: 0,  range: { min: 1, max: 2 }, kind: 'tome'  },
};

// Base stat lines per class. Individual units tweak these on top.
export const CLASSES = {
  // Player units are tuned to survive 4-5 enemy strikes and to need 2-3 of
  // their own per kill. Enemy strikes that land in 2 hits make a first
  // chapter feel like a coin flip rather than a puzzle.
  lord:       { name: 'Lord',       mov: 5, hp: 23, str: 6, skl: 7, spd: 7, lck: 7, def: 6, res: 3, weapon: 'ironSword', color: 0x4a7fd4 },
  knight:     { name: 'Knight',     mov: 4, hp: 24, str: 7, skl: 4, spd: 3, lck: 2, def: 9, res: 1, weapon: 'ironLance', color: 0x3f5f9e },
  mercenary:  { name: 'Mercenary',  mov: 5, hp: 21, str: 7, skl: 8, spd: 8, lck: 4, def: 5, res: 1, weapon: 'ironSword', color: 0x5aa0c8 },
  archer:     { name: 'Archer',     mov: 5, hp: 19, str: 6, skl: 7, spd: 6, lck: 3, def: 4, res: 2, weapon: 'ironBow',   color: 0x6fb56f },
  mage:       { name: 'Mage',       mov: 5, hp: 18, str: 6, skl: 6, spd: 6, lck: 4, def: 3, res: 7, weapon: 'fire',      color: 0x9b6fc8 },
  brigand:    { name: 'Brigand',    mov: 5, hp: 20, str: 5, skl: 3, spd: 4, lck: 1, def: 3, res: 0, weapon: 'ironAxe',   color: 0xc2603f },
  soldier:    { name: 'Soldier',    mov: 4, hp: 18, str: 4, skl: 4, spd: 4, lck: 1, def: 4, res: 1, weapon: 'ironLance', color: 0xb04a4a },
};

let nextId = 1;

export class Unit {
  constructor({ name, cls, team, x, y, weapon, statBonus = {}, stationary = false }) {
    const base = CLASSES[cls];
    if (!base) throw new Error(`Unknown class "${cls}"`);

    this.id = nextId++;
    this.name = name;
    this.cls = cls;
    this.className = base.name;
    this.team = team;                 // 'player' | 'enemy'
    this.x = x;
    this.y = y;

    for (const stat of ['hp', 'str', 'skl', 'spd', 'lck', 'def', 'res', 'mov']) {
      this[stat] = base[stat] + (statBonus[stat] ?? 0);
    }
    this.maxHp = this.hp;
    this.weapon = WEAPONS[weapon ?? base.weapon];
    this.color = base.color;

    // Bosses hold their throne rather than chasing — they strike anything that
    // steps into weapon range, but never leave the tile.
    this.stationary = stationary;

    this.hasMoved = false;    // spent this turn
    this.alive = true;
  }

  get atk() { return this.str + this.weapon.might; }
  get attackSpeed() { return this.spd; }

  /** Displayed accuracy before the defender's avoid is subtracted. */
  get hitRate() { return this.weapon.hit + this.skl * 2 + Math.floor(this.lck / 2); }

  /** Dodge, excluding terrain — terrain is added at the point of combat. */
  get avoid() { return this.spd * 2 + this.lck; }
  get critRate() { return this.weapon.crit + Math.floor(this.skl / 2); }

  canReach(distance) {
    const { min, max } = this.weapon.range;
    return distance >= min && distance <= max;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.alive = false;
  }
}
