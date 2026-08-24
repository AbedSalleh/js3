import { manhattan } from './Grid.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isMagic = (unit) => unit.weapon.kind === 'tome';

/** Roll twice and average — Fire Emblem's "2RN" curve. Kind above 50%, cruel below. */
function trueHit(displayed) {
  const roll = (Math.random() * 100 + Math.random() * 100) / 2;
  return roll < displayed;
}

function avoidOf(unit, grid) {
  return unit.spd * 2 + unit.lck + grid.terrainAt(unit.x, unit.y).avoid;
}

function defenseOf(target, attacker, grid) {
  const stat = isMagic(attacker) ? target.res : target.def;
  return stat + grid.terrainAt(target.x, target.y).defense;
}

/**
 * What one side would do to the other in a single strike.
 * Pure numbers — this is what the pre-attack forecast panel shows.
 */
export function forecastStrike(attacker, defender, grid) {
  const damage = Math.max(0, attacker.atk - defenseOf(defender, attacker, grid));
  const hit = clamp(attacker.hitRate - avoidOf(defender, grid), 0, 100);
  const crit = clamp(attacker.critRate - defender.lck, 0, 100);
  return { damage, hit, crit };
}

/**
 * Full both-sides forecast for the confirmation panel: does the defender
 * get to counter, does either side double?
 */
export function forecastBattle(attacker, defender, grid) {
  const distance = manhattan(attacker, defender);
  const attack = forecastStrike(attacker, defender, grid);
  const canCounter = defender.canReach(distance);
  const counter = canCounter ? forecastStrike(defender, attacker, grid) : null;

  return {
    distance,
    attack: { ...attack, doubles: attacker.attackSpeed >= defender.attackSpeed + 4 },
    counter: counter && { ...counter, doubles: defender.attackSpeed >= attacker.attackSpeed + 4 },
  };
}

/**
 * Resolve a full combat exchange and return an ordered list of events.
 *
 * Nothing here knows about three.js. The map renderer plays these back as
 * floating numbers; a later battle-scene renderer can play the exact same
 * list as animations without the math changing at all.
 */
export function resolveBattle(attacker, defender, grid) {
  const plan = forecastBattle(attacker, defender, grid);
  const events = [];

  // Attacker, then counter, then whoever doubles gets a follow-up.
  const order = [{ from: attacker, to: defender }];
  if (plan.counter) order.push({ from: defender, to: attacker });
  if (plan.attack.doubles) order.push({ from: attacker, to: defender });
  else if (plan.counter?.doubles) order.push({ from: defender, to: attacker });

  for (const { from, to } of order) {
    if (!from.alive || !to.alive) break;

    const strike = forecastStrike(from, to, grid);
    if (!trueHit(strike.hit)) {
      events.push({ type: 'miss', from, to });
      continue;
    }

    const crit = trueHit(strike.crit);
    const damage = crit ? strike.damage * 3 : strike.damage;
    to.takeDamage(damage);
    events.push({ type: 'hit', from, to, damage, crit });

    if (!to.alive) events.push({ type: 'defeat', unit: to });
  }

  return events;
}
