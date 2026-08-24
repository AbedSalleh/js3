// Maps are plain text. Legend lives in src/core/terrain.js:
//   . plain   F forest   H hill   M mountain   X fort   ~ water   # wall
//
// A river splits the field with only a northern and a southern crossing —
// two chokepoints, so positioning actually matters.
export const chapter1 = {
  name: 'Chapter 1 — The Ford',
  objective: 'Rout the enemy',

  rows: [
    'MMM###....FFF.',
    'MM#..X....FFX.',
    'M#....~~......',
    '......~~~.....',
    '.FF...~~..HH..',
    '.FF....~..HHH.',
    '.......~......',
    '..HH...~~.....',
    '..H....~~..FF.',
    '....X.....FF..',
    '..........FFF.',
  ],

  units: [
    // Player
    { name: 'Rhea',    cls: 'lord',      team: 'player', x: 2,  y: 9  },
    { name: 'Bertram', cls: 'knight',    team: 'player', x: 1,  y: 9  },
    { name: 'Cass',    cls: 'mercenary', team: 'player', x: 3,  y: 10 },
    { name: 'Wren',    cls: 'archer',    team: 'player', x: 1,  y: 10 },
    { name: 'Odile',   cls: 'mage',      team: 'player', x: 2,  y: 10 },

    // Enemy
    { name: 'Brigand',  cls: 'brigand', team: 'enemy', x: 11, y: 1  },
    { name: 'Soldier',  cls: 'soldier', team: 'enemy', x: 10, y: 2  },
    { name: 'Soldier',  cls: 'soldier', team: 'enemy', x: 12, y: 3  },
    { name: 'Brigand',  cls: 'brigand', team: 'enemy', x: 10, y: 4  },
    { name: 'Archer',   cls: 'archer',  team: 'enemy', x: 12, y: 5  },
    // The boss holds the fort. High defence means chip damage barely dents him
    // and the mage has to do the work — which is the point of bringing a mage.
    { name: 'Garrow',   cls: 'knight',  team: 'enemy', x: 12, y: 1,
      statBonus: { hp: 6, str: 1, def: -2 }, weapon: 'ironLance', stationary: true },
  ],
};
