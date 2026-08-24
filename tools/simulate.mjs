/**
 * Headless chapter simulator — no browser, no three.js, no dependencies.
 *
 *   node tools/simulate.mjs            play 25 games, report the outcomes
 *   node tools/simulate.mjs 100        play 100
 *   node tools/simulate.mjs --matrix   print the damage tables instead
 *
 * This works because GameState takes its animator by injection: hand it stubs
 * that resolve instantly and the whole game runs at full speed with nothing
 * rendered. Use it to answer "is this chapter actually winnable, and how
 * often" before hand-testing it in the browser.
 */
import { GameState } from '../src/core/GameState.js';
import { chapter1 } from '../src/data/chapter1.js';
import { computeDistanceField } from '../src/core/pathfinding.js';
import { forecastBattle } from '../src/core/combat.js';
import { Unit } from '../src/core/units.js';

const CHAPTER = chapter1;

const stubs = {
  moveUnit: async () => {}, playCombat: async () => {},
  snapUnit: () => {}, pause: async () => {},
};

/** A copy of `unit` standing at (x, y), keeping its prototype stat getters. */
const standingAt = (unit, x, y) =>
  Object.assign(Object.create(Unit.prototype), unit, { x, y });

function expectedExchange(attacker, defender, grid) {
  const plan = forecastBattle(attacker, defender, grid);
  const deal = (plan.attack.damage * plan.attack.hit / 100) * (plan.attack.doubles ? 2 : 1);
  const take = plan.counter
    ? (plan.counter.damage * plan.counter.hit / 100) * (plan.counter.doubles ? 2 : 1)
    : 0;
  return { deal, take };
}

/**
 * A cautious stand-in for a competent player: take favourable trades, hold the
 * line otherwise, and keep the lord out of the boss fight. Losing to *this* is
 * a sign the chapter is too hard, not that the player was careless.
 */
async function playChapter() {
  const state = new GameState(CHAPTER, stubs);

  for (let guard = 0; !state.outcome && guard < 80; guard++) {
    for (const unit of state.living('player')) {
      if (unit.hasMoved || state.outcome || state.phase !== 'player') continue;
      state.select(unit);

      const reach = state.reach;
      const foes = state.living('enemy');
      if (foes.length === 0) break;

      let best = null;
      for (const k of reach.stoppable) {
        const [x, y] = k.split(',').map(Number);
        for (const victim of foes) {
          const distance = Math.abs(x - victim.x) + Math.abs(y - victim.y);
          if (!unit.canReach(distance)) continue;

          const { deal, take } = expectedExchange(standingAt(unit, x, y), victim, state.grid);
          if (take >= unit.hp * 0.55) continue;
          if (unit.cls === 'lord' && take > 0 && unit.hp < 15) continue;

          const score = (deal >= victim.hp ? 60 : 0) + deal * 2 - take * 1.6;
          if (score > 0 && (!best || score > best.score)) best = { score, x, y, victim };
        }
      }

      if (best) {
        await state.clickTile(best.x, best.y);
        if (state.mode === 'action' && state.targets.includes(best.victim)) {
          state.beginTargeting();
          await state.clickTile(best.victim.x, best.victim.y);
        } else if (state.mode === 'action') {
          await state.wait();
        }
      } else if (foes.every((f) => f.stationary) && unit.cls !== 'lord') {
        // Only stationary enemies remain: they will not come to us, so close in.
        const field = computeDistanceField(state.grid, foes[0], state.units, unit.team);
        let step = null;
        for (const k of reach.stoppable) {
          const d = field.get(k);
          if (d === undefined) continue;
          if (!step || d < step.d) {
            const [x, y] = k.split(',').map(Number);
            step = { d, x, y };
          }
        }
        if (step) await state.clickTile(step.x, step.y);

        if (state.mode === 'action') {
          const safe = state.targets.find(
            (v) => expectedExchange(unit, v, state.grid).take < unit.hp * 0.5,
          );
          if (safe) {
            state.beginTargeting();
            await state.clickTile(safe.x, safe.y);
          } else {
            await state.wait();
          }
        }
      } else {
        await state.wait();
      }
    }

    if (state.outcome) break;
    if (state.phase === 'player') {
      for (const u of state.living('player')) u.hasMoved = true;
      await state.endPlayerPhase();
    }
    await new Promise((resolve) => setImmediate(resolve));
  }

  return {
    outcome: state.outcome ?? 'stalled',
    turn: state.turn,
    survivors: state.living('player').length,
  };
}

function printMatrix() {
  const state = new GameState(CHAPTER, stubs);
  const players = state.living('player');
  const enemies = state.living('enemy');

  const table = (rows, cols, label) => {
    console.log(`\n${label} (expected damage per exchange, terrain included)`);
    console.log([''.padEnd(11), ...cols.map((c) => c.name.slice(0, 8).padEnd(9))].join(''));
    for (const r of rows) {
      const cells = cols.map((c) => {
        const plan = forecastBattle(r, c, state.grid);
        const total = plan.attack.damage * (plan.attack.doubles ? 2 : 1);
        return `${total}${plan.attack.doubles ? ' (x2)' : ''}`.padEnd(9);
      });
      console.log(r.name.slice(0, 10).padEnd(11) + cells.join(''));
    }
  };

  table(players, enemies, 'PLAYER -> ENEMY');
  table(enemies, players, 'ENEMY -> PLAYER');

  console.log('\nHP');
  for (const u of [...players, ...enemies]) {
    console.log(`  ${u.name.padEnd(10)} ${String(u.hp).padStart(3)}  ${u.className}`);
  }
}

// ---- entry point ------------------------------------------------------------

if (process.argv.includes('--matrix')) {
  printMatrix();
} else {
  const count = Number(process.argv[2]) || 25;
  const results = [];
  for (let i = 0; i < count; i++) results.push(await playChapter());

  const wins = results.filter((r) => r.outcome === 'victory');
  const losses = results.filter((r) => r.outcome === 'defeat');
  const stalls = results.filter((r) => r.outcome === 'stalled');

  console.log(`${CHAPTER.name} — ${count} simulated runs`);
  console.log(`  victory ${wins.length}   defeat ${losses.length}   stalled ${stalls.length}`);

  if (wins.length) {
    const turns = wins.map((w) => w.turn);
    const survivors = wins.map((w) => w.survivors);
    const avg = (xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
    console.log(`  turns to win: ${Math.min(...turns)}-${Math.max(...turns)} (avg ${avg(turns)})`);
    console.log(`  survivors:    avg ${avg(survivors)} of 5`);
  }
}
