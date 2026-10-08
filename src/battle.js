/**
 * Deterministic, renderer-independent arena combat. All distances are world units.
 * Blue advances toward -Z; the river occupies |z| < 2.5 with bridges at x = ±10.
 *
 * onEvent receives:
 * spawn: {entity}; hit: {id,x,z,amount,team};
 * attack / towerAttack: {id,kind,team,targetId,targetX,targetZ};
 * wave: {wave,lane:'left'|'right'};
 * projectile: {from:{x,z},to:{x,z},team,kind:'arrow'|'tower'};
 * death: {id,entityType,x,z,team,attackerTeam}; fireball: {x,z,radius,team};
 * respawn: {x,z}; end: {result}; playerHit: {amount,hp,x,z}; playerDeath: {x,z}.
 * Array and entity references returned by getState() are live. HP belongs here.
 */

export const CARD_DEFS = Object.freeze({
  knight: Object.freeze({ id: 'knight', name: 'Knight', cost: 3, description: 'A brave melee fighter', count: 1 }),
  archer: Object.freeze({ id: 'archer', name: 'Archers', cost: 3, description: 'Two ranged companions', count: 2 }),
  giant: Object.freeze({ id: 'giant', name: 'Giant', cost: 5, description: 'A tower-crushing tank', count: 1 }),
  fireball: Object.freeze({ id: 'fireball', name: 'Fireball', cost: 4, description: 'Explosive area damage', radius: 5 }),
});

const UNIT_STATS = {
  knight: { hp: 190, damage: 25, speed: 3.05, range: 1.65, interval: 0.85, radius: 0.65 },
  archer: { hp: 85, damage: 18, speed: 2.65, range: 7.8, interval: 1.05, radius: 0.5 },
  giant: { hp: 520, damage: 56, speed: 1.7, range: 2.1, interval: 1.35, radius: 1.05 },
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Battle {
  constructor({ onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.reset();
  }

  reset() {
    this.units = [];
    this.towers = [];
    this.elixir = 7;
    this.elapsed = 0;
    this.timeRemaining = 180;
    this.playerHp = 100;
    this.playerMaxHp = 100;
    this.playerDead = false;
    this.lastPlayerDamageAt = -Infinity;
    this.respawnIn = 0;
    this.result = null;
    this.blueCrowns = 0;
    this.redCrowns = 0;
    this.kills = 0;
    this.attackCooldown = 0;
    this.nextWave = 8;
    this.wave = 0;
    this.nextId = 1;
    this.player = { id: 'player', type: 'player', team: 'blue', x: 0, z: 21, radius: 0.55 };
    for (const team of ['blue', 'red']) {
      const side = team === 'blue' ? 1 : -1;
      for (const [kind, x, z, hp] of [['king', 0, 25, 1500], ['princess', -13, 17, 850], ['princess', 13, 17, 850]]) {
        this.towers.push({
          id: `${team}-${kind}-${x}`, type: 'tower', kind, team, x, z: z * side,
          hp, maxHp: hp, dead: false, radius: kind === 'king' ? 2.25 : 1.8,
          cooldown: 0.3, range: kind === 'king' ? 12 : 11.3,
        });
      }
    }
    return this.getState();
  }

  getState() {
    return {
      units: this.units, towers: this.towers, elixir: this.elixir,
      elapsed: this.elapsed, timeRemaining: this.timeRemaining,
      playerHp: this.playerHp, playerMaxHp: this.playerMaxHp,
      playerDead: this.playerDead, respawnIn: this.respawnIn,
      result: this.result, blueCrowns: this.blueCrowns, redCrowns: this.redCrowns,
      kills: this.kills, attackCooldown: this.attackCooldown,
    };
  }

  summon(cardId, x, z) {
    const card = CARD_DEFS[cardId];
    if (!card) return { ok: false, reason: 'Unknown card' };
    if (this.result) return { ok: false, reason: 'The battle has ended' };
    if (this.playerDead) return { ok: false, reason: 'Respawning…' };
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, reason: 'Aim at the arena' };
    if (this.elixir + 1e-9 < card.cost) return { ok: false, reason: 'Not enough elixir' };
    if (cardId !== 'fireball' && z < 3) return { ok: false, reason: 'Deploy troops on your side of the river' };
    x = clamp(x, -20.5, 20.5);
    z = clamp(z, -28, 28);
    this.elixir = Math.max(0, this.elixir - card.cost);
    if (cardId === 'fireball') {
      this.onEvent({ type: 'fireball', x, z, radius: card.radius, team: 'blue' });
      for (const target of [...this.units, ...this.towers]) {
        if (target.team === 'red' && !target.dead && distance(target, { x, z }) <= card.radius + target.radius * 0.3) {
          this._damage(target, target.type === 'tower' ? 150 : 175, 'blue');
        }
      }
      return { ok: true, x, z };
    }
    const spawned = [];
    for (let i = 0; i < card.count; i++) {
      const offset = card.count === 1 ? 0 : (i - 0.5) * 1.35;
      spawned.push(this._spawn(cardId, 'blue', clamp(x + offset, -21, 21), z));
    }
    return { ok: true, units: spawned, x, z };
  }

  /** Sword cleave. Direction is normalized internally, and a cooldown prevents click spam. */
  attack(x, z, directionX, directionZ) {
    if (this.result || this.playerDead || this.attackCooldown > 0) return { ok: false, reason: 'Not ready' };
    if (![x, z, directionX, directionZ].every(Number.isFinite)) return { ok: false, reason: 'Invalid aim' };
    const length = Math.hypot(directionX, directionZ);
    if (length < 0.001) return { ok: false, reason: 'Invalid aim' };
    this.attackCooldown = 0.44;
    directionX /= length;
    directionZ /= length;
    let hits = 0;
    for (const target of [...this.units, ...this.towers]) {
      if (target.dead || target.team !== 'red') continue;
      const dx = target.x - x;
      const dz = target.z - z;
      const dist = Math.hypot(dx, dz);
      const reach = 3.6 + target.radius;
      if (dist <= reach && (dist < 1 || (dx * directionX + dz * directionZ) / dist > 0.25)) {
        this._damage(target, target.type === 'tower' ? 32 : 44, 'blue');
        hits++;
        if (target.type === 'unit' && !target.dead) {
          target.x = clamp(target.x + directionX * 0.4, -21, 21);
          target.z = clamp(target.z + directionZ * 0.4, -29, 29);
          this._constrainRiver(target);
        }
      }
    }
    return { ok: true, hits };
  }

  damagePlayer(amount) {
    if (this.playerDead || this.result || !Number.isFinite(amount) || amount <= 0) return;
    this.lastPlayerDamageAt = this.elapsed;
    this.playerHp = Math.max(0, this.playerHp - amount);
    this.onEvent({ type: 'playerHit', amount, hp: this.playerHp, x: this.player.x, z: this.player.z });
    if (this.playerHp === 0) {
      this.playerDead = true;
      this.respawnIn = 4;
      this.onEvent({ type: 'playerDeath', x: this.player.x, z: this.player.z });
    }
  }

  update(dt, player = this.player) {
    if (this.result || !Number.isFinite(dt) || dt <= 0) return this.getState();
    if (Number.isFinite(player.x) && Number.isFinite(player.z)) {
      this.player.x = player.x;
      this.player.z = player.z;
    }
    // Bound tab-resume deltas, then integrate combat in small, stable steps.
    let remaining = Math.min(dt, 0.25);
    while (remaining > 1e-8 && !this.result) {
      const step = Math.min(remaining, 0.05);
      this._step(step);
      remaining -= step;
    }
    return this.getState();
  }

  _step(dt) {
    this.elapsed += dt;
    this.timeRemaining = Math.max(0, 180 - this.elapsed);
    this.elixir = Math.min(10, this.elixir + dt * (this.timeRemaining <= 60 ? 0.85 : 0.52));
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.playerDead) {
      this.respawnIn = Math.max(0, this.respawnIn - dt);
      if (this.respawnIn < 1e-7) {
        this.playerDead = false;
        this.respawnIn = 0;
        this.playerHp = this.playerMaxHp;
        this.player.x = 0;
        this.player.z = 21;
        this.onEvent({ type: 'respawn', x: 0, z: 21 });
      }
    }
    if (this.elapsed >= this.nextWave) {
      this._enemyWave();
      this.nextWave = this.elapsed + Math.max(7, 12 - this.elapsed / 45);
    }
    for (const tower of this.towers) {
      if (!tower.dead) this._updateTower(tower, dt);
      if (this.result) return;
    }
    for (const unit of this.units) {
      if (!unit.dead) this._updateUnit(unit, dt);
      if (this.result) return;
    }
    // Retreating gives the hero a chance to recover, while fresh hits interrupt it.
    if (!this.playerDead && this.playerHp < this.playerMaxHp) {
      const recoveryTime = Math.min(dt, Math.max(0, this.elapsed - this.lastPlayerDamageAt - 6));
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + recoveryTime * 4);
    }
    // Retain deaths briefly so renderers can animate, then release them.
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].dead && this.elapsed - this.units[i].diedAt >= 1.2) this.units.splice(i, 1);
    }
    if (this.timeRemaining <= 1e-7) this._timeUp();
  }

  _spawn(kind, team, x, z) {
    const stats = UNIT_STATS[kind];
    const entity = {
      id: `unit-${this.nextId++}`, type: 'unit', kind, cardId: kind, team, x, z,
      hp: stats.hp, maxHp: stats.hp, dead: false, radius: stats.radius,
      speed: stats.speed, damage: stats.damage, range: stats.range,
      interval: stats.interval, cooldown: 0.25, targetId: null,
    };
    this.units.push(entity);
    this.onEvent({ type: 'spawn', entity });
    return entity;
  }

  _enemyWave() {
    this.wave++;
    // Alternate lanes, then reinforce the weakest enemy-facing lane.
    const lanes = this.towers.filter(tower => tower.team === 'blue' && tower.kind === 'princess' && !tower.dead);
    let x = this.wave % 2 ? -11 : 11;
    if (this.wave % 4 === 0 && lanes.length) x = [...lanes].sort((a, b) => a.hp - b.hp)[0].x;
    const kind = this.wave % 3 === 0 ? 'giant' : this.wave % 2 === 0 ? 'archer' : 'knight';
    this._spawn(kind, 'red', x, -23);
    if (kind === 'archer') this._spawn('archer', 'red', x + (x < 0 ? 1.6 : -1.6), -24);
    if (this.elapsed > 60 && kind === 'giant') this._spawn('archer', 'red', x, -26);
    if (this.elapsed > 120) this._spawn('knight', 'red', -x, -24);
    this.onEvent({ type: 'wave', wave: this.wave, lane: x < 0 ? 'left' : 'right' });
  }

  _updateTower(tower, dt) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) return;
    const candidates = this.units.filter(unit => !unit.dead && unit.team !== tower.team && distance(unit, tower) <= tower.range);
    if (tower.team === 'red' && !this.playerDead && distance(this.player, tower) <= tower.range) candidates.push(this.player);
    // Keep the same target until it dies/leaves, allowing a giant to tank for the hero.
    const target = candidates.find(entity => entity.id === tower.targetId)
      || candidates.sort((a, b) => distance(a, tower) - distance(b, tower))[0];
    if (!target) return;
    tower.targetId = target.id;
    tower.cooldown = tower.kind === 'king' ? 0.85 : 1.0;
    this.onEvent({ type: 'towerAttack', id: tower.id, kind: tower.kind, team: tower.team, targetId: target.id, targetX: target.x, targetZ: target.z });
    this.onEvent({ type: 'projectile', from: { x: tower.x, z: tower.z }, to: { x: target.x, z: target.z }, team: tower.team, kind: 'tower' });
    this._damage(target, target.type === 'player' ? 10 : 23, tower.team);
  }

  _updateUnit(unit, dt) {
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    const enemyTowers = this.towers.filter(tower => !tower.dead && tower.team !== unit.team);
    let target;
    if (unit.kind !== 'giant') {
      const nearby = this.units.filter(other => !other.dead && other.team !== unit.team && distance(other, unit) < 10);
      if (unit.team === 'red' && !this.playerDead && distance(this.player, unit) < 9) nearby.push(this.player);
      target = nearby.sort((a, b) => distance(a, unit) - distance(b, unit))[0];
    }
    if (!target) {
      const princesses = enemyTowers.filter(tower => tower.kind === 'princess');
      // Lane towers protect the king unless this lane has already fallen.
      const laneTower = princesses.find(tower => Math.sign(tower.x) === Math.sign(unit.x || 1));
      target = laneTower || enemyTowers.find(tower => tower.kind === 'king') || princesses[0];
    }
    if (!target) return;
    unit.targetId = target.id;
    const gap = distance(unit, target);
    const reach = unit.range + (target.radius || 0.5);
    if (gap <= reach) {
      if (unit.cooldown <= 0) {
        unit.cooldown = unit.interval;
        this.onEvent({ type: 'attack', id: unit.id, kind: unit.kind, team: unit.team, targetId: target.id, targetX: target.x, targetZ: target.z });
        if (unit.kind === 'archer') {
          this.onEvent({ type: 'projectile', from: { x: unit.x, z: unit.z }, to: { x: target.x, z: target.z }, team: unit.team, kind: 'arrow' });
        }
        this._damage(target, target.type === 'player' ? unit.damage * 0.48 : unit.damage, unit.team);
      }
      return;
    }
    const waypoint = this._waypoint(unit, target);
    const dx = waypoint.x - unit.x;
    const dz = waypoint.z - unit.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.001) {
      const movement = Math.min(length, unit.speed * dt);
      unit.x += dx / length * movement;
      unit.z += dz / length * movement;
    }
    // Mild separation preserves squads without pushing troops off bridges.
    for (const other of this.units) {
      if (other === unit || other.dead || other.team !== unit.team) continue;
      const dxOther = unit.x - other.x;
      const dzOther = unit.z - other.z;
      const d = Math.hypot(dxOther, dzOther);
      const desired = (unit.radius + other.radius) * 0.7;
      if (d < desired && d > 0.01) {
        const force = Math.min((desired - d) * dt * 2, 0.04);
        unit.x += dxOther / d * force;
        unit.z += dzOther / d * force;
      }
    }
    unit.x = clamp(unit.x, -21, 21);
    unit.z = clamp(unit.z, -28.5, 28.5);
    this._constrainRiver(unit);
  }

  _waypoint(unit, target) {
    const bridge = Math.abs(unit.x + 10) + Math.abs(target.x + 10) < Math.abs(unit.x - 10) + Math.abs(target.x - 10) ? -10 : 10;
    if (Math.abs(unit.z) < 2.8) return { x: bridge, z: (Math.sign(target.z) || 1) * 4.1 };
    if (unit.z * target.z < 0) {
      if (Math.abs(unit.x - bridge) > 1.1) return { x: bridge, z: Math.sign(unit.z) * 4.1 };
      return { x: bridge, z: Math.sign(target.z) * 4.1 };
    }
    return target;
  }

  _constrainRiver(unit) {
    if (Math.abs(unit.z) < 2.5) {
      const bridge = unit.x < 0 ? -10 : 10;
      unit.x = clamp(unit.x, bridge - 1.65, bridge + 1.65);
    }
  }

  _damage(target, amount, attackingTeam) {
    if (this.result) return;
    if (target.type === 'player') {
      this.damagePlayer(amount);
      return;
    }
    if (target.dead) return;
    target.hp = Math.max(0, target.hp - amount);
    this.onEvent({ type: 'hit', id: target.id, x: target.x, z: target.z, amount, team: target.team, attackingTeam });
    if (target.hp > 0) return;
    target.dead = true;
    target.diedAt = this.elapsed;
    this.onEvent({ type: 'death', id: target.id, entityType: target.type, x: target.x, z: target.z, team: target.team, attackerTeam: attackingTeam });
    if (target.type === 'unit' && target.team === 'red') this.kills++;
    if (target.type === 'tower') {
      if (target.team === 'red') this.blueCrowns++;
      else this.redCrowns++;
      if (target.kind === 'king') {
        if (target.team === 'red') this.blueCrowns = 3;
        else this.redCrowns = 3;
        this._finish(target.team === 'red' ? 'victory' : 'defeat');
      }
    }
  }

  _timeUp() {
    if (this.blueCrowns !== this.redCrowns) {
      this._finish(this.blueCrowns > this.redCrowns ? 'victory' : 'defeat');
      return;
    }
    const health = team => this.towers.filter(t => t.team === team).reduce((sum, tower) => sum + tower.hp, 0);
    const difference = health('blue') - health('red');
    this._finish(Math.abs(difference) < 0.001 ? 'draw' : difference > 0 ? 'victory' : 'defeat');
  }

  _finish(result) {
    if (this.result) return;
    this.result = result;
    this.onEvent({ type: 'end', result });
  }
}
