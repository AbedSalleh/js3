const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * Everything GameState awaits. Tweens are stepped from the main render loop
 * via update(dt) rather than each running its own rAF, so the whole game
 * pauses cleanly and nothing drifts out of sync.
 */
export class Animator {
  constructor(units, camera, overlay) {
    this.units = units;         // UnitRenderer
    this.camera = camera;
    this.overlay = overlay;     // DOM element for floating combat text
    this.active = new Set();
    this.floaters = [];
    this.speed = 1;
  }

  update(dt) {
    const step = dt * this.speed;
    for (const task of [...this.active]) {
      task.elapsed += step;
      const t = Math.min(1, task.elapsed / task.duration);
      task.onUpdate(task.ease(t));
      if (t >= 1) {
        this.active.delete(task);
        task.resolve();
      }
    }
    this.updateFloaters(dt);
  }

  tween(duration, onUpdate, ease = easeInOut) {
    if (duration <= 0) { onUpdate(1); return Promise.resolve(); }
    return new Promise((resolve) => {
      this.active.add({ duration, onUpdate, ease, elapsed: 0, resolve });
    });
  }

  pause(ms) {
    return this.tween(ms / 1000, () => {});
  }

  snapUnit(unit) {
    this.units.snap(unit);
  }

  /** Walk a unit tile by tile along `path` (a list of [x, y]). */
  async moveUnit(unit, path) {
    const group = this.units.get(unit);
    if (!group) return;

    let from = { x: unit.x, y: unit.y };
    for (const [tx, ty] of path) {
      this.units.face(unit, tx, ty);
      const start = this.units.anchor(from.x, from.y);
      const end = this.units.anchor(tx, ty);

      await this.tween(0.13, (t) => {
        group.position.lerpVectors(start, end, t);
        group.position.y += Math.sin(t * Math.PI) * 0.09;   // a small hop per tile
      }, (t) => t);

      from = { x: tx, y: ty };
    }
    group.position.copy(this.units.anchor(from.x, from.y));
  }

  /**
   * Play back the event list produced by resolveBattle.
   *
   * This is the seam where a real Fire Emblem battle scene would slot in:
   * swap this body for "cut to a battle stage, play the attack clip, fire the
   * hit frame on the animation event" and every other file stays untouched.
   */
  async playCombat(attacker, defender, events) {
    this.units.face(attacker, defender.x, defender.y);
    this.units.face(defender, attacker.x, attacker.y);
    await this.pause(120);

    for (const event of events) {
      if (event.type === 'defeat') {
        await this.playDefeat(event.unit);
        continue;
      }

      const group = this.units.get(event.from);
      const home = this.units.anchor(event.from.x, event.from.y);
      const toward = this.units.anchor(event.to.x, event.to.y);
      const lunge = home.clone().lerp(toward, 0.34);

      // Out fast, back slow — the shape that reads as a strike.
      await this.tween(0.11, (t) => group.position.lerpVectors(home, lunge, t), easeOut);

      if (event.type === 'miss') this.float(event.to, 'MISS', 'miss');
      else this.float(event.to, event.crit ? `${event.damage}!` : `${event.damage}`,
        event.crit ? 'crit' : 'damage');

      this.shake(event.to, event.type === 'hit' ? (event.crit ? 0.16 : 0.09) : 0);
      await this.tween(0.17, (t) => group.position.lerpVectors(lunge, home, t));
      await this.pause(event.crit ? 260 : 150);
    }

    await this.pause(140);
  }

  async playDefeat(unit) {
    const group = this.units.get(unit);
    if (!group) return;
    group.userData.dying = true;          // keeps UnitRenderer from hiding it early

    const start = group.position.clone();
    await this.tween(0.42, (t) => {
      group.scale.setScalar(1 - t);
      group.position.y = start.y + t * 0.35;
    }, easeOut);

    group.userData.dying = false;
    group.userData.dead = true;
    group.visible = false;
    group.scale.setScalar(1);
  }

  shake(unit, amount) {
    if (!amount) return;
    const group = this.units.get(unit);
    if (!group) return;
    const home = group.position.clone();
    this.tween(0.22, (t) => {
      const decay = (1 - t) * amount;
      group.position.x = home.x + Math.sin(t * 46) * decay;
      group.position.z = home.z + Math.cos(t * 38) * decay;
      if (t === 1) group.position.copy(home);
    }, (t) => t);
  }

  // ---- floating combat text (plain HTML, projected onto the 3D scene) ------

  float(unit, text, kind) {
    const el = document.createElement('div');
    el.className = `floater floater--${kind}`;
    el.textContent = text;
    this.overlay.appendChild(el);

    const anchor = this.units.anchor(unit.x, unit.y).clone();
    anchor.y += 0.9;
    const floater = { el, anchor, life: 0, duration: 0.95 };
    this.floaters.push(floater);

    // Place it now rather than waiting for the next update tick: an unpositioned
    // absolute element sits at the overlay's top-left, so the number would flash
    // in the corner of the screen for a frame before snapping onto the unit.
    this.placeFloater(floater, 0);
  }

  placeFloater(floater, t) {
    const projected = floater.anchor.clone();
    projected.y += t * 0.7;
    projected.project(this.camera);

    const rect = this.overlay.getBoundingClientRect();
    floater.el.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
    floater.el.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
    floater.el.style.opacity = String(1 - t ** 3);
  }

  updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const floater = this.floaters[i];
      floater.life += dt;

      const t = floater.life / floater.duration;
      if (t >= 1) {
        floater.el.remove();
        this.floaters.splice(i, 1);
        continue;
      }
      this.placeFloater(floater, t);
    }
  }
}
