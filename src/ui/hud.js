const $ = (id) => document.getElementById(id);

/**
 * The whole interface is plain DOM layered over the canvas. For a genre this
 * menu-heavy that's a real advantage — flexbox and transitions do work that
 * would otherwise be hand-rolled sprite layout inside the 3D scene.
 */
export class Hud {
  constructor(state, { onAction, onEndTurn, onRestart }) {
    this.state = state;
    this.hoverUnit = null;
    this.hoverTile = null;
    this.forecastTarget = null;

    $('objective').textContent = `${state.chapter.name} — ${state.chapter.objective}`;

    $('end-turn').addEventListener('click', onEndTurn);
    $('restart').addEventListener('click', onRestart);
    $('action-menu').addEventListener('click', (e) => {
      const action = e.target.dataset?.action;
      if (action) onAction(action);
    });

    state.subscribe(() => this.render());
    this.render();
  }

  setHover(unit, tile) {
    this.hoverUnit = unit;
    this.hoverTile = tile;
    this.render();
  }

  setForecastTarget(unit) {
    this.forecastTarget = unit;
    this.render();
  }

  render() {
    const state = this.state;

    const phase = $('phase');
    phase.textContent = state.phase === 'player' ? 'Player Phase' : 'Enemy Phase';
    phase.className = `phase is-${state.phase}`;
    $('turn').textContent = `Turn ${state.turn}`;

    const idle = state.phase === 'player' && (state.mode === 'idle' || state.mode === 'selected');
    $('end-turn').disabled = !idle;

    this.renderUnitPanel();
    this.renderTerrainPanel();
    this.renderActionMenu();
    this.renderForecast();
    this.renderLog();
    this.renderResult();
  }

  renderUnitPanel() {
    // Prefer whatever the cursor is over; fall back to the active selection.
    const unit = this.hoverUnit ?? this.state.selected;
    const panel = $('unit-panel');
    if (!unit || !unit.alive) { panel.hidden = true; return; }
    panel.hidden = false;

    $('unit-name').textContent = unit.name;
    $('unit-class').textContent = unit.className;

    const ratio = unit.hp / unit.maxHp;
    const fill = $('unit-hp-fill');
    fill.style.width = `${ratio * 100}%`;
    fill.className = ratio <= 0.25 ? 'is-critical' : ratio <= 0.6 ? 'is-hurt' : '';
    $('unit-hp-text').textContent = `HP ${unit.hp} / ${unit.maxHp}`;

    $('unit-stats').innerHTML = [
      ['Atk', unit.atk], ['Def', unit.def],
      ['Skl', unit.skl], ['Res', unit.res],
      ['Spd', unit.spd], ['Lck', unit.lck],
      ['Mov', unit.mov], ['Avo', unit.avoid],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    const { min, max } = unit.weapon.range;
    const range = min === max ? `range ${min}` : `range ${min}–${max}`;
    $('unit-weapon').textContent = `${unit.weapon.name} · Mt ${unit.weapon.might} · ${range}`;
  }

  renderTerrainPanel() {
    const panel = $('terrain-panel');
    if (!this.hoverTile) { panel.hidden = true; return; }

    const { x, y } = this.hoverTile;
    const terrain = this.state.grid.terrainAt(x, y);
    panel.hidden = false;
    $('terrain-name').textContent = terrain.name;

    const parts = [`(${x}, ${y})`];
    if (Number.isFinite(terrain.cost)) parts.push(`move ${terrain.cost}`);
    else parts.push('impassable');
    if (terrain.defense) parts.push(`def +${terrain.defense}`);
    if (terrain.avoid) parts.push(`avo +${terrain.avoid}`);
    $('terrain-detail').textContent = parts.join(' · ');
  }

  renderActionMenu() {
    const state = this.state;
    const menu = $('action-menu');
    const open = state.mode === 'action' && state.moveOrigin !== null;
    menu.hidden = !open;
    if (!open) return;

    menu.querySelector('[data-action="attack"]').disabled = state.targets.length === 0;
  }

  renderForecast() {
    const state = this.state;
    const panel = $('forecast');
    const target = this.forecastTarget;

    if (state.mode !== 'targeting' || !target || !state.selected) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;

    const plan = state.forecast(state.selected, target);
    const you = state.selected;
    const counter = plan.counter;

    const row = (label, lhs, rhs) =>
      `<div class="forecast__row"><span>${lhs}</span>` +
      `<span class="forecast__label">${label}</span><span>${rhs}</span></div>`;

    panel.innerHTML =
      `<div class="forecast__row forecast__names">` +
      `<span class="lhs">${you.name}</span><span class="forecast__label">vs</span>` +
      `<span class="rhs">${target.name}</span></div>` +
      row('HP', you.hp, target.hp) +
      row('DMG', plan.attack.damage, counter ? counter.damage : '—') +
      row('HIT', `${plan.attack.hit}%`, counter ? `${counter.hit}%` : '—') +
      row('CRT', `${plan.attack.crit}%`, counter ? `${counter.crit}%` : '—') +
      (plan.attack.doubles ? `<div class="forecast__double">${you.name} strikes twice</div>` : '') +
      (counter?.doubles ? `<div class="forecast__double">${target.name} strikes twice</div>` : '') +
      (!counter ? `<div class="forecast__double">No counterattack</div>` : '');
  }

  renderLog() {
    $('log').innerHTML = this.state.log.slice(-9).map((line) => `<div>${line}</div>`).join('');
  }

  renderResult() {
    const box = $('result');
    if (!this.state.outcome) { box.hidden = true; return; }
    box.hidden = false;
    box.className = `result is-${this.state.outcome}`;
    $('result-title').textContent = this.state.outcome === 'victory' ? 'Victory' : 'Defeat';
    $('result-note').textContent = this.state.outcome === 'victory'
      ? `Cleared in ${this.state.turn} turns.`
      : 'Your commander has fallen.';
  }
}
