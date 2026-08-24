import { Grid, key, manhattan } from './Grid.js';
import { Unit } from './units.js';
import { computeReachable, reconstructPath, computeThreat, computeDistanceField } from './pathfinding.js';
import { resolveBattle, forecastBattle } from './combat.js';

/**
 * Turn flow and rules. Rendering is injected as an `animator` so this class
 * can be driven headlessly in tests:
 *
 *   animator.moveUnit(unit, path) -> Promise
 *   animator.playCombat(attacker, defender, events) -> Promise
 *
 * Pass an animator whose methods resolve immediately and the whole game
 * plays out with no three.js involved at all.
 */
export class GameState {
  constructor(chapter, animator) {
    this.chapter = chapter;
    this.grid = new Grid(chapter.rows);
    this.units = chapter.units.map((spec) => new Unit(spec));
    this.animator = animator;

    this.turn = 1;
    this.phase = 'player';        // 'player' | 'enemy'
    this.mode = 'idle';           // idle | selected | action | targeting | busy | gameover
    this.selected = null;
    this.reach = null;            // { costs, cameFrom, stoppable }
    this.threat = null;           // Set of "x,y" this unit could strike
    this.targets = [];            // units attackable from the current tile
    this.moveOrigin = null;       // for undo
    this.log = [];
    this.outcome = null;          // 'victory' | 'defeat'

    this.listeners = new Set();
  }

  // ---- events -------------------------------------------------------------

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  write(message) {
    this.log.push(message);
    if (this.log.length > 60) this.log.shift();
  }

  // ---- queries ------------------------------------------------------------

  unitAt(x, y) {
    return this.units.find((u) => u.alive && u.x === x && u.y === y) ?? null;
  }

  living(team) {
    return this.units.filter((u) => u.alive && u.team === team);
  }

  /** Enemies of `unit` that are in weapon range from the tile it stands on. */
  targetsFrom(unit) {
    return this.units.filter(
      (u) => u.alive && u.team !== unit.team && unit.canReach(manhattan(unit, u)),
    );
  }

  forecast(attacker, defender) {
    return forecastBattle(attacker, defender, this.grid);
  }

  // ---- player input -------------------------------------------------------

  /** Left click on a map tile. The interpretation depends on the mode. */
  async clickTile(x, y) {
    if (this.mode === 'busy' || this.mode === 'gameover' || this.phase !== 'player') return;
    const occupant = this.unitAt(x, y);

    if (this.mode === 'idle') {
      if (occupant?.team === 'player' && !occupant.hasMoved) this.select(occupant);
      else if (occupant) this.inspect(occupant);
      return;
    }

    if (this.mode === 'selected') {
      const target = key(x, y);
      if (!this.reach.stoppable.has(target)) {
        // Clicking away deselects; clicking another ready unit switches to it.
        if (occupant?.team === 'player' && !occupant.hasMoved) this.select(occupant);
        else this.deselect();
        return;
      }
      await this.moveSelected(x, y);
      return;
    }

    if (this.mode === 'targeting') {
      const victim = this.targets.find((u) => u.x === x && u.y === y);
      if (victim) await this.attack(this.selected, victim);
      else this.openActionMenu();   // clicked a non-target: back to the menu
    }
  }

  select(unit) {
    this.selected = unit;
    this.moveOrigin = { x: unit.x, y: unit.y };
    this.reach = computeReachable(this.grid, unit, this.units);
    this.threat = computeThreat(this.grid, unit, this.reach.stoppable);
    this.mode = 'selected';
    this.emit();
  }

  /** Show an enemy's threat range without selecting it. */
  inspect(unit) {
    this.selected = unit;
    this.moveOrigin = null;
    this.reach = computeReachable(this.grid, unit, this.units);
    this.threat = computeThreat(this.grid, unit, this.reach.stoppable);
    this.mode = 'selected';
    this.emit();
  }

  deselect() {
    this.selected = null;
    this.reach = null;
    this.threat = null;
    this.targets = [];
    this.moveOrigin = null;
    this.mode = 'idle';
    this.emit();
  }

  async moveSelected(x, y) {
    const unit = this.selected;
    if (!this.moveOrigin) { this.deselect(); return; }   // inspecting, not commanding

    const path = reconstructPath(this.reach.cameFrom, key(unit.x, unit.y), key(x, y));
    if (path === null) return;

    this.mode = 'busy';
    this.emit();

    await this.animator.moveUnit(unit, path);
    unit.x = x;
    unit.y = y;

    this.openActionMenu();
  }

  openActionMenu() {
    this.targets = this.targetsFrom(this.selected);
    this.mode = 'action';
    this.emit();
  }

  beginTargeting() {
    if (this.targets.length === 0) return;
    this.mode = 'targeting';
    this.emit();
  }

  /** Right click / Escape: step back one level. */
  cancel() {
    if (this.mode === 'targeting') { this.openActionMenu(); return; }

    if (this.mode === 'action' && this.moveOrigin) {
      this.selected.x = this.moveOrigin.x;      // undo the move
      this.selected.y = this.moveOrigin.y;
      this.animator.snapUnit(this.selected);
      this.select(this.selected);
      return;
    }

    if (this.mode === 'selected') this.deselect();
  }

  async wait() {
    if (!this.selected) return;
    this.selected.hasMoved = true;
    this.write(`${this.selected.name} holds position.`);
    this.deselect();
    await this.checkEndOfPhase();
  }

  async attack(attacker, defender) {
    this.mode = 'busy';
    this.emit();

    const events = resolveBattle(attacker, defender, this.grid);
    for (const e of events) {
      if (e.type === 'miss') this.write(`${e.from.name} misses ${e.to.name}.`);
      else if (e.type === 'hit') this.write(`${e.from.name} hits ${e.to.name} for ${e.damage}${e.crit ? ' — critical!' : ''}.`);
      else if (e.type === 'defeat') this.write(`${e.unit.name} is defeated.`);
    }

    await this.animator.playCombat(attacker, defender, events);

    attacker.hasMoved = true;
    this.deselect();

    if (this.checkVictory()) return;
    await this.checkEndOfPhase();
  }

  // ---- phases -------------------------------------------------------------

  checkVictory() {
    if (this.living('enemy').length === 0) {
      this.outcome = 'victory';
      this.mode = 'gameover';
      this.write('All enemies routed. Victory!');
      this.emit();
      return true;
    }
    const lord = this.units.find((u) => u.cls === 'lord');
    if (!lord?.alive || this.living('player').length === 0) {
      this.outcome = 'defeat';
      this.mode = 'gameover';
      this.write(lord && !lord.alive ? 'Rhea has fallen. Defeat.' : 'Your army is gone. Defeat.');
      this.emit();
      return true;
    }
    return false;
  }

  checkEndOfPhase() {
    if (this.living('player').every((u) => u.hasMoved)) return this.endPlayerPhase();
    return Promise.resolve();
  }

  /**
   * Returns the promise for the whole enemy phase, so a caller (or a headless
   * test) can await a complete turn instead of guessing when it has finished.
   */
  endPlayerPhase() {
    if (this.mode === 'gameover') return Promise.resolve();
    this.deselect();
    this.phase = 'enemy';
    this.write(`— Enemy phase —`);
    this.emit();
    return this.runEnemyPhase();
  }

  /**
   * Deliberately simple AI: if anything is attackable this turn, take the
   * best trade; otherwise advance toward the closest player unit.
   */
  async runEnemyPhase() {
    this.mode = 'busy';
    this.emit();

    for (const enemy of this.living('enemy')) {
      if (this.mode === 'gameover') break;
      await this.animator.pause(180);

      // A stationary boss evaluates only the tile it already stands on, so it
      // still counterattacks and still strikes anyone who walks into range.
      const reach = enemy.stationary
        ? { costs: new Map([[key(enemy.x, enemy.y), 0]]), cameFrom: new Map(),
            stoppable: new Set([key(enemy.x, enemy.y)]) }
        : computeReachable(this.grid, enemy, this.units);

      const players = this.living('player');
      if (players.length === 0) break;

      // Every (tile, victim) pair this unit could act on.
      let best = null;
      for (const k of reach.stoppable) {
        const [tx, ty] = k.split(',').map(Number);
        for (const victim of players) {
          const dist = Math.abs(tx - victim.x) + Math.abs(ty - victim.y);
          if (!enemy.canReach(dist)) continue;

          // A stand-in for "this enemy, but standing at tx,ty". Built on the
          // Unit prototype so the stat getters (atk, hitRate, ...) survive —
          // a plain {...enemy} spread would drop them and score everything 0.
          const from = Object.assign(Object.create(Unit.prototype), enemy, { x: tx, y: ty });
          const plan = forecastBattle(from, victim, this.grid);
          // Expected damage, with a bonus for a likely kill and a penalty
          // for the counter-damage we would eat.
          const expected = (plan.attack.damage * plan.attack.hit) / 100
            * (plan.attack.doubles ? 2 : 1);
          const risk = plan.counter ? (plan.counter.damage * plan.counter.hit) / 100 : 0;
          const lethal = expected >= victim.hp ? 100 : 0;
          const score = lethal + expected * 2 - risk + reach.costs.get(k) * -0.01;

          if (!best || score > best.score) best = { score, tx, ty, victim };
        }
      }

      if (best) {
        const path = reconstructPath(reach.cameFrom, key(enemy.x, enemy.y), key(best.tx, best.ty));
        if (path?.length) await this.animator.moveUnit(enemy, path);
        enemy.x = best.tx;
        enemy.y = best.ty;

        const events = resolveBattle(enemy, best.victim, this.grid);
        for (const e of events) {
          if (e.type === 'miss') this.write(`${e.from.name} misses ${e.to.name}.`);
          else if (e.type === 'hit') this.write(`${e.from.name} hits ${e.to.name} for ${e.damage}${e.crit ? ' — critical!' : ''}.`);
          else if (e.type === 'defeat') this.write(`${e.unit.name} is defeated.`);
        }
        await this.animator.playCombat(enemy, best.victim, events);
        if (this.checkVictory()) return;
      } else if (!enemy.stationary) {
        await this.advanceToward(enemy, reach);
      }
    }

    this.beginPlayerPhase();
  }

  /** No target in reach — walk as far along the path to the nearest foe as we can. */
  async advanceToward(enemy, reach) {
    const players = this.living('player');
    if (players.length === 0) return;

    // Pick the target by true path cost, not straight-line distance, then
    // follow that unit's own distance field. Both steps matter on a map with
    // chokepoints: the closest foe as the crow flies may be across a river.
    let nearest = null;
    for (const p of players) {
      const field = computeDistanceField(this.grid, p, this.units, enemy.team);
      const d = field.get(key(enemy.x, enemy.y));
      if (d !== undefined && (!nearest || d < nearest.d)) nearest = { p, d, field };
    }
    if (!nearest) return;

    let best = null;
    for (const k of reach.stoppable) {
      const d = nearest.field.get(k);
      if (d === undefined) continue;
      if (!best || d < best.d) {
        const [tx, ty] = k.split(',').map(Number);
        best = { d, tx, ty };
      }
    }
    if (!best || (best.tx === enemy.x && best.ty === enemy.y)) return;

    const path = reconstructPath(reach.cameFrom, key(enemy.x, enemy.y), key(best.tx, best.ty));
    if (path?.length) await this.animator.moveUnit(enemy, path);
    enemy.x = best.tx;
    enemy.y = best.ty;
  }

  beginPlayerPhase() {
    if (this.mode === 'gameover') return;
    this.turn++;
    this.phase = 'player';
    this.mode = 'idle';
    for (const u of this.units) u.hasMoved = false;
    this.write(`— Player phase, turn ${this.turn} —`);
    this.emit();
  }
}
