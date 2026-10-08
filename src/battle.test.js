import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, CARD_DEFS } from './battle.js';

const advance = (battle, seconds, player = { x: 0, z: 21 }) => {
  for (let i = 0; i < Math.round(seconds * 20); i++) battle.update(0.05, player);
};
const quietBattle = () => {
  const battle = new Battle();
  battle.nextWave = Infinity;
  return battle;
};

test('deployment spends elixir, regeneration caps at ten, and archers arrive as a pair', () => {
  const battle = quietBattle();
  assert.equal(CARD_DEFS.archer.cost, 3);
  const result = battle.summon('archer', 4, 10);
  assert.equal(result.ok, true);
  assert.equal(result.units.length, 2);
  assert.equal(battle.elixir, 4);
  advance(battle, 15);
  assert.equal(battle.elixir, 10);
});

test('invalid troop deployment and insufficient elixir leave the battle untouched', () => {
  const battle = quietBattle();
  assert.equal(battle.summon('knight', 0, -5).ok, false);
  assert.equal(battle.summon('knight', NaN, 8).ok, false);
  assert.equal(battle.summon('unknown', 0, 8).ok, false);
  assert.equal(battle.elixir, 7);
  assert.equal(battle.units.length, 0);
  assert.equal(battle.summon('giant', 0, 8).ok, true);
  assert.equal(battle.summon('knight', 0, 8).ok, false);
  assert.equal(battle.elixir, 2);
});

test('fireball damages enemy targets across the river and leaves friendly targets intact', () => {
  const battle = quietBattle();
  const red = battle.towers.find(t => t.team === 'red' && t.x === 13);
  const blue = battle.towers.find(t => t.team === 'blue' && t.x === 13);
  assert.equal(battle.summon('fireball', red.x, red.z).ok, true);
  assert.equal(red.hp, red.maxHp - 150);
  assert.equal(blue.hp, blue.maxHp);
  assert.equal(battle.elixir, 3);
});

test('sword respects facing, distance, and cooldown', () => {
  const battle = quietBattle();
  const tower = battle.towers.find(t => t.team === 'red' && t.x === 13);
  assert.equal(battle.attack(13, -14, 0, 1).hits, 0);
  advance(battle, 0.5);
  assert.equal(battle.attack(13, -14, 0, -1).hits, 1);
  assert.equal(tower.hp, tower.maxHp - 32);
  assert.equal(battle.attack(13, -14, 0, -1).ok, false);
  assert.equal(tower.hp, tower.maxHp - 32);
});

test('destroying the red king ends the battle and freezes further combat', () => {
  const events = [];
  const battle = new Battle({ onEvent: event => events.push(event) });
  const king = battle.towers.find(t => t.team === 'red' && t.kind === 'king');
  king.hp = 30;
  battle.attack(0, -21, 0, -1);
  assert.equal(battle.result, 'victory');
  assert.equal(battle.blueCrowns, 3);
  assert.equal(king.dead, true);
  assert.equal(events.filter(event => event.type === 'end').length, 1);
  const time = battle.timeRemaining;
  battle.update(0.2, { x: 0, z: -21 });
  assert.equal(battle.timeRemaining, time);
  assert.equal(battle.summon('knight', 0, 8).ok, false);
});

test('ground troops use the bridge instead of crossing the open river', () => {
  const battle = quietBattle();
  const unit = battle.summon('giant', 20, 9).units[0];
  for (const tower of battle.towers) tower.range = 0;
  let visitedRiver = false;
  for (let i = 0; i < 600; i++) {
    battle.update(0.05);
    if (Math.abs(unit.z) < 2.5) {
      visitedRiver = true;
      assert.ok(Math.abs(unit.x - 10) <= 2.5, `unit left bridge at ${unit.x}, ${unit.z}`);
    }
  }
  assert.equal(visitedRiver, true);
  assert.ok(unit.z < -3);
});

test('deploying beside the river approaches a bridge without teleporting', () => {
  const battle = quietBattle();
  const unit = battle.summon('knight', 0, 3).units[0];
  battle.update(0.05);
  assert.ok(Math.abs(unit.x) < 0.2);
  assert.ok(unit.z >= 3);
});

test('player death causes a timed full-health respawn without ending the match', () => {
  const events = [];
  const battle = new Battle({ onEvent: event => events.push(event) });
  battle.nextWave = Infinity;
  battle.damagePlayer(200);
  assert.equal(battle.playerHp, 0);
  assert.equal(battle.playerDead, true);
  assert.equal(battle.result, null);
  assert.equal(battle.summon('knight', 0, 8).ok, false);
  advance(battle, 3.9);
  assert.equal(battle.playerDead, true);
  assert.equal(battle.playerHp, 0);
  advance(battle, 0.15);
  assert.equal(battle.playerDead, false);
  assert.equal(battle.playerHp, 100);
  assert.equal(events.filter(event => event.type === 'respawn').length, 1);
});

test('health recovers after six peaceful seconds, incoming damage resets the delay, and recovery caps at full health', () => {
  const battle = quietBattle();
  battle.damagePlayer(40);
  advance(battle, 6);
  assert.ok(Math.abs(battle.playerHp - 60) < 1e-7);
  advance(battle, 1);
  assert.ok(Math.abs(battle.playerHp - 64) < 1e-7);
  battle.damagePlayer(10);
  advance(battle, 5.95);
  assert.ok(Math.abs(battle.playerHp - 54) < 1e-7);
  advance(battle, 0.55);
  assert.ok(Math.abs(battle.playerHp - 56) < 1e-7);
  advance(battle, 20);
  assert.equal(battle.playerHp, battle.playerMaxHp);
});

test('timeout resolves crowns first, then remaining tower health', () => {
  const battle = quietBattle();
  battle.elapsed = 179.95;
  battle.towers.find(t => t.team === 'red').hp -= 20;
  battle.update(0.1);
  assert.equal(battle.result, 'victory');
  const tie = quietBattle();
  tie.elapsed = 179.95;
  tie.update(0.1);
  assert.equal(tie.result, 'draw');
});

test('a real supported push wins a full match and emits combat feedback', () => {
  const events = [];
  const battle = new Battle({ onEvent: event => events.push(event) });
  let successfulDeployments = 0;
  for (let frame = 0; frame < 3600 && !battle.result; frame++) {
    // A giant every twenty seconds, with ranged support halfway between pushes.
    if (frame % 200 === 0) {
      const card = frame % 400 === 0 ? 'giant' : 'archer';
      if (battle.summon(card, -10, 5).ok) successfulDeployments++;
    }
    battle.update(0.05, { x: 0, z: 21 });
  }
  assert.equal(battle.result, 'victory');
  assert.equal(battle.blueCrowns, 3);
  assert.ok(battle.elapsed > 30 && battle.elapsed < 180);
  assert.ok(successfulDeployments >= 4);
  assert.equal(battle.towers.find(t => t.team === 'red' && t.kind === 'king').dead, true);
  for (const kind of ['giant', 'archer', 'knight']) {
    const attack = events.find(event => event.type === 'attack' && event.kind === kind);
    assert.ok(attack, `${kind} should enter combat`);
    assert.ok(attack.id && attack.targetId);
    assert.ok(Number.isFinite(attack.targetX) && Number.isFinite(attack.targetZ));
  }
  assert.ok(events.some(event => event.type === 'towerAttack'));
  assert.deepEqual(events.filter(event => event.type === 'wave').slice(0, 2).map(event => [event.wave, event.lane]), [[1, 'left'], [2, 'right']]);
  assert.ok(events.some(event => event.type === 'death' && event.team === 'red' && event.attackerTeam === 'blue'));
  assert.equal(events.filter(event => event.type === 'end').length, 1);
});

test('an undefended full match naturally ends in defeat', () => {
  const events = [];
  const battle = new Battle({ onEvent: event => events.push(event) });
  for (let frame = 0; frame < 3600 && !battle.result; frame++) {
    battle.update(0.05, { x: 0, z: 21 });
  }
  assert.equal(battle.result, 'defeat');
  assert.equal(battle.redCrowns, 3);
  assert.ok(battle.elapsed > 60 && battle.elapsed < 180);
  assert.ok(events.filter(event => event.type === 'wave').length >= 8);
  assert.equal(battle.towers.find(t => t.team === 'blue' && t.kind === 'king').dead, true);
  assert.ok(events.some(event => event.type === 'death' && event.team === 'blue' && event.attackerTeam === 'red'));
  assert.equal(events.filter(event => event.type === 'end').length, 1);
});
