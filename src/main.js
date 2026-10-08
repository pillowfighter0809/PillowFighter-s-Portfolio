import * as THREE from 'three';
import './style.css';
import { createWorld } from './world.js';
import { Battle, CARD_DEFS } from './battle.js';

const $ = (id) => document.getElementById(id);
const show = (id, visible) => $(id)?.classList.toggle('hidden', !visible);
const text = (id, value) => { if ($(id)) $(id).textContent = value; };
const clamp = THREE.MathUtils.clamp;
const touchDevice = matchMedia('(pointer: coarse)').matches;
let mode = 'menu';
let selected = 'knight';
let thirdPerson = false;
let soundEnabled = true;
let audioContext;
let toastTimeout;
let swing = 0;
let bob = 0;
let lastHitSound = 0;
let heldAttack = false;
let dragging = false;
let helpFromPause = false;
let combatLabelTimeout;
let finalMinute = false;
let troopsDeployed = 0;
const rubble = [];
const keys = new Set();
const touchKeys = new Set();
const player = { x: 0, z: 21, y: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: -0.06, grounded: true };

const world = createWorld($('world'));
const { scene, camera, renderer } = world;
camera.rotation.order = 'YXZ';
const meshes = new Map();
const projectiles = [];
const previewUnits = [];
let battle = new Battle({ onEvent: onBattleEvent });
const playerMesh = world.createPlayer();
scene.add(playerMesh);
playerMesh.visible = false;

// A small, actual 3D sword and hand follow the first-person camera.
const hand = new THREE.Group();
const handMaterial = new THREE.MeshStandardMaterial({ color: 0xeab990, roughness: 0.8, depthTest: false });
const steelMaterial = new THREE.MeshStandardMaterial({ color: 0xdcecf2, metalness: 0.45, roughness: 0.3, depthTest: false });
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x214951, roughness: 0.7, depthTest: false });
const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xfacb62, metalness: 0.3, roughness: 0.4, depthTest: false });
function handBox(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.renderOrder = 100;
  hand.add(mesh);
}
handBox(0.17, 0.2, 0.19, handMaterial, 0, -0.12, 0);
handBox(0.12, 0.14, 0.18, darkMaterial, 0, -0.27, 0);
handBox(0.065, 0.26, 0.065, darkMaterial, 0, 0.02, 0);
handBox(0.3, 0.065, 0.095, goldMaterial, 0, 0.14, 0);
handBox(0.09, 0.58, 0.045, steelMaterial, 0, 0.46, 0);
handBox(0.055, 0.09, 0.042, steelMaterial, 0, 0.79, 0);
hand.position.set(0.43, -0.44, -0.69);
camera.add(hand);
scene.add(camera);

const deploymentRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1.02, 40),
  new THREE.MeshBasicMaterial({ color: 0x9cf6cb, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
);
deploymentRing.rotation.x = -Math.PI / 2;
deploymentRing.visible = false;
scene.add(deploymentRing);
const aim = new THREE.Vector3();
const direction = new THREE.Vector3();
const cameraOrigin = new THREE.Vector3();
const cameraDestination = new THREE.Vector3();

function toast(message) {
  text('toast', message);
  show('toast', true);
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => show('toast', false), 2800);
}

function combatLabel(message) {
  text('combat-label', message);
  show('combat-label', true);
  clearTimeout(combatLabelTimeout);
  combatLabelTimeout = setTimeout(() => show('combat-label', false), 1500);
}

function hitmarker() {
  const marker = $('hitmarker');
  if (!marker) return;
  marker.classList.remove('active');
  requestAnimationFrame(() => marker.classList.add('active'));
}

function initAudio() {
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch { soundEnabled = false; }
}

function tone(frequency, duration = 0.1, type = 'sine', volume = 0.055, endFrequency = frequency) {
  if (!audioContext || !soundEnabled || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), audioContext.currentTime + duration);
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
  oscillator.onended = () => { gain.disconnect(); oscillator.disconnect(); };
}

function onBattleEvent(event) {
  const now = performance.now();
  if (event.type === 'attack') {
    const mesh = meshes.get(event.id);
    if (mesh) mesh.userData.attackUntil = now / 1000 + 0.38;
  }
  if (event.type === 'wave') {
    toast(`Rival reinforcements · ${event.lane === 'left' ? 'Left' : 'Right'} bridge`);
  }
  if (event.type === 'playerHit') {
    $('damage-flash')?.classList.remove('flash');
    requestAnimationFrame(() => $('damage-flash')?.classList.add('flash'));
    tone(90, 0.12, 'triangle', 0.055, 40);
  }
  if (event.type === 'playerDeath') {
    deploymentRing.visible = false;
    playerMesh.visible = false;
    tone(180, 0.5, 'triangle', 0.06, 50);
  }
  if (event.type === 'hit') {
    world.spawnEffect('hit', event.x ?? player.x, event.z ?? player.z, event.team === 'red' ? 0xffa095 : 0x9be8df);
    if (event.id === 'player') {
      $('damage-flash')?.classList.remove('flash');
      requestAnimationFrame(() => $('damage-flash')?.classList.add('flash'));
    }
    if (now - lastHitSound > 95) { tone(135, 0.08, 'triangle', 0.025, 55); lastHitSound = now; }
  }
  if (event.type === 'death') {
    world.spawnEffect('death', event.x, event.z, event.team === 'blue' ? 0x54dacf : 0xfa8b7a);
    if (event.entityType === 'tower') {
      toast(event.team === 'red' ? 'Enemy tower down. Keep pushing!' : 'Our tower has fallen. Defend the crown!');
      tone(95, 0.55, 'sawtooth', 0.025, 30);
      const tower = battle.towers.find((entity) => entity.id === event.id);
      if (tower && world.createRubble) {
        const remains = world.createRubble(tower);
        scene.add(remains);
        rubble.push(remains);
      }
      if (event.team === 'red') combatLabel('+1 CROWN');
    }
  }
  if (event.type === 'fireball') {
    world.spawnEffect('fireball', event.x, event.z, 0xffae43);
    tone(180, 0.6, 'sawtooth', 0.055, 25);
  }
  if (event.type === 'projectile') {
    const material = new THREE.MeshBasicMaterial({ color: event.team === 'blue' ? 0xb5ffff : 0xffba77 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(event.kind === 'tower' ? 0.13 : 0.075, 6, 4), material);
    const from = new THREE.Vector3(event.from.x, event.kind === 'tower' ? 4.1 : 1.35, event.from.z);
    const to = new THREE.Vector3(event.to.x, 1.05, event.to.z);
    mesh.position.copy(from);
    scene.add(mesh);
    projectiles.push({ mesh, from, to, age: 0, duration: clamp(from.distanceTo(to) / 26, 0.12, 0.55) });
  }
  if (event.type === 'respawn') {
    Object.assign(player, { x: event.x, z: event.z, y: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: -0.06, grounded: true });
    toast('Back in the fight. Your troops are still pushing.');
    tone(440, 0.35, 'sine', 0.04, 880);
  }
  if (event.type === 'end') finish(event.result);
}

function syncEntities(time, dt) {
  const entities = [...battle.towers, ...battle.units];
  const liveIds = new Set();
  for (const entity of entities) {
    if (entity.dead || entity.hp <= 0) continue;
    liveIds.add(entity.id);
    let mesh = meshes.get(entity.id);
    if (!mesh) {
      mesh = entity.type === 'tower' ? world.createTower(entity) : world.createUnit(entity);
      mesh.position.set(entity.x, 0, entity.z);
      meshes.set(entity.id, mesh);
      scene.add(mesh);
    }
    const dx = entity.x - mesh.position.x;
    const dz = entity.z - mesh.position.z;
    const moving = Math.hypot(dx, dz) > 0.001;
    mesh.position.x = entity.x;
    mesh.position.z = entity.z;
    if (entity.type === 'unit') {
      if (moving) mesh.rotation.y = Math.atan2(-dx, -dz);
      else {
        const target = entity.targetId === 'player' ? player : entities.find((candidate) => candidate.id === entity.targetId);
        if (target) mesh.rotation.y = Math.atan2(entity.x - target.x, entity.z - target.z);
        else if (mesh.rotation.y === 0 && entity.team === 'red') mesh.rotation.y = Math.PI;
      }
      world.animateUnit?.(mesh, entity, time, moving);
      mesh.position.y = Math.max(0, groundAt(entity.x, entity.z));
    }
    if (mesh.userData.healthBar) mesh.userData.healthBar.scale.x = Math.max(0.001, entity.hp / entity.maxHp);
    if (mesh.userData.healthBarRoot) {
      mesh.userData.healthBarRoot.quaternion.copy(mesh.quaternion).invert().multiply(camera.quaternion);
    }
  }
  for (const [id, mesh] of meshes) {
    if (!liveIds.has(id)) { scene.remove(mesh); meshes.delete(id); }
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.age += dt;
    const t = Math.min(1, p.age / p.duration);
    p.mesh.position.lerpVectors(p.from, p.to, t);
    p.mesh.position.y += Math.sin(t * Math.PI) * 0.5;
    if (t === 1) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      projectiles.splice(i, 1);
    }
  }
}

function setMode(next) {
  mode = next;
  document.body.classList.toggle('playing', next === 'playing');
  document.body.classList.toggle('menu', next === 'menu');
  document.body.classList.toggle('paused', next === 'paused');
  document.body.classList.toggle('finished', next === 'result');
  show('menu', next === 'menu');
  show('pause-overlay', next === 'paused');
  show('result-overlay', next === 'result');
  deploymentRing.visible = next === 'playing';
  hand.visible = next === 'playing' && !thirdPerson;
  playerMesh.visible = next !== 'menu' && thirdPerson;
  if (next !== 'playing') { keys.clear(); touchKeys.clear(); heldAttack = false; dragging = false; }
}

function lockPointer() {
  if (touchDevice) return;
  try {
    const result = renderer.domElement.requestPointerLock?.();
    result?.catch(() => toast('Click and drag to look around. WASD to move.'));
  } catch { toast('Click and drag to look around. WASD to move.'); }
}

function startGame() {
  initAudio();
  for (const mesh of meshes.values()) scene.remove(mesh);
  meshes.clear();
  for (const mesh of previewUnits) mesh.visible = false;
  for (const p of projectiles) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
  projectiles.length = 0;
  for (const remains of rubble) scene.remove(remains);
  rubble.length = 0;
  troopsDeployed = 0;
  finalMinute = false;
  battle.reset();
  Object.assign(player, { x: 0, z: 21, y: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: -0.06, grounded: true });
  swing = 0;
  show('help-overlay', false);
  show('respawn-overlay', false);
  show('combat-label', false);
  selectCard('knight', false);
  setMode('playing');
  lockPointer();
  toast('Cross the bridges. Destroy the red king tower to win.');
  updateUI();
  tone(330, 0.16, 'triangle', 0.06, 660);
}

function pauseGame() {
  if (mode !== 'playing') return;
  setMode('paused');
  if (document.pointerLockElement) document.exitPointerLock();
}

function returnToMenu() {
  setMode('menu');
  if (document.pointerLockElement) document.exitPointerLock();
  for (const mesh of meshes.values()) scene.remove(mesh);
  meshes.clear();
  for (const remains of rubble) scene.remove(remains);
  rubble.length = 0;
  for (const mesh of previewUnits) mesh.visible = true;
  battle.reset();
  camera.fov = 48;
  camera.updateProjectionMatrix();
  show('help-overlay', false);
  show('respawn-overlay', false);
  show('combat-label', false);
  text('deployment-hint', 'Select a card to plan your push');
  updateUI();
}

function resumeGame() {
  show('help-overlay', false);
  setMode('playing');
  lockPointer();
  initAudio();
}

function finish(result) {
  setMode('result');
  if (document.pointerLockElement) document.exitPointerLock();
  show('respawn-overlay', false);
  text('result-title', result === 'victory' ? 'The crown is yours.' : result === 'draw' ? 'An even match.' : 'A kingdom worth another try.');
  text('result-detail', result === 'victory' ? 'You led the charge and conquered the arena.' : result === 'draw' ? 'Both kingdoms held their ground. Settle it in a rematch.' : 'Regroup, build your elixir, and send a giant ahead of your rangers.');
  text('result-stats', `${troopsDeployed} troops summoned · ${battle.getState().kills} enemies defeated`);
  text('result-score', `${battle.getState().blueCrowns} — ${battle.getState().redCrowns}`);
  tone(result === 'victory' ? 440 : 180, 0.7, 'triangle', 0.07, result === 'victory' ? 880 : 90);
  updateUI();
}

function selectCard(id, withSound = true) {
  if (!CARD_DEFS[id]) return;
  selected = id;
  document.querySelectorAll('[data-card]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.card === id);
    button.setAttribute('aria-pressed', String(button.dataset.card === id));
  });
  const names = { knight: 'Bladeguard', archer: 'Twin Rangers', giant: 'Stone Giant', fireball: 'Fireball' };
  text('selected-name', names[id]);
  if (withSound) tone(460, 0.05, 'sine', 0.03, 600);
}

function getAimPoint() {
  camera.getWorldDirection(direction);
  const groundDistance = direction.y < -0.06 ? -camera.position.y / direction.y : 9;
  const distance = clamp(groundDistance, 3, selected === 'fireball' ? 44 : 18);
  aim.copy(camera.position).addScaledVector(direction, distance);
  // For a level gaze, put the reticle on the ground ahead rather than in the sky.
  aim.y = 0.08;
  aim.x = clamp(aim.x, -20.5, 20.5);
  aim.z = clamp(aim.z, -28, 28);
  return aim;
}

function deploy() {
  if (mode !== 'playing' || battle.getState().playerDead) return;
  const target = getAimPoint();
  const response = battle.summon(selected, target.x, target.z);
  if (!response.ok) {
    toast(response.reason || 'Deploy troops on your side of the river.');
    tone(100, 0.08, 'triangle', 0.03, 75);
    return;
  }
  if (selected !== 'fireball') {
    world.spawnEffect('spawn', target.x, target.z, 0x8cf6d2);
    tone(290, 0.2, 'triangle', 0.055, 640);
    troopsDeployed += response.units?.length ?? 1;
    combatLabel(selected === 'archer' ? 'TWIN RANGERS DEPLOYED' : selected === 'giant' ? 'STONE GIANT DEPLOYED' : 'BLADEGUARD DEPLOYED');
  }
  const cardButton = document.querySelector(`[data-card="${selected}"]`);
  cardButton?.classList.remove('pulse');
  requestAnimationFrame(() => cardButton?.classList.add('pulse'));
  updateUI();
}

function strike() {
  if (mode !== 'playing' || battle.getState().playerDead) return;
  const response = battle.attack(player.x, player.z, -Math.sin(player.yaw), -Math.cos(player.yaw));
  if (response.ok) {
    swing = 1;
    tone(170, 0.11, 'triangle', 0.045, 55);
    if (response.hits > 0) hitmarker();
  }
}

function colliders() {
  return [
    ...world.arenaColliders,
    ...battle.towers.filter((t) => !t.dead && t.hp > 0).map((t) => {
      const r = t.kind === 'king' ? 2.4 : 1.75;
      return { minX: t.x - r, maxX: t.x + r, minZ: t.z - r, maxZ: t.z + r, height: t.kind === 'king' ? 7 : 5 };
    }),
  ];
}

function groundAt(x, z) {
  if (Math.abs(z) < 3.9 && Math.abs(Math.abs(x) - 10) < 2.5) return 0.235;
  if (Math.abs(z) < 2.6) return -0.65;
  return 0;
}

function overlaps(x, z, c, radius = 0.38) {
  return x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ;
}

function cameraObstruction(origin, destination, obstacles) {
  let closest = 1;
  for (const obstacle of obstacles) {
    const bounds = [[obstacle.minX - 0.25, obstacle.maxX + 0.25], [-0.4, obstacle.height + 0.4], [obstacle.minZ - 0.25, obstacle.maxZ + 0.25]];
    let entry = 0;
    let exit = 1;
    for (const [index, axis] of ['x', 'y', 'z'].entries()) {
      const delta = destination[axis] - origin[axis];
      if (Math.abs(delta) < 0.00001) {
        if (origin[axis] < bounds[index][0] || origin[axis] > bounds[index][1]) { exit = -1; break; }
      } else {
        const a = (bounds[index][0] - origin[axis]) / delta;
        const b = (bounds[index][1] - origin[axis]) / delta;
        entry = Math.max(entry, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (entry <= exit && entry < closest) closest = Math.max(0.1, entry - 0.04);
  }
  return closest;
}

function updatePlayer(dt, time) {
  const state = battle.getState();
  if (state.playerDead) {
    heldAttack = false;
    show('respawn-overlay', true);
    text('respawn-count', Math.ceil(state.respawnIn));
    hand.visible = false;
    return;
  }
  show('respawn-overlay', false);
  hand.visible = !thirdPerson;
  const down = (key) => keys.has(key) || touchKeys.has(key);
  let forward = Number(down('KeyW') || down('ArrowUp')) - Number(down('KeyS') || down('ArrowDown'));
  let side = Number(down('KeyD') || down('ArrowRight')) - Number(down('KeyA') || down('ArrowLeft'));
  const length = Math.hypot(forward, side);
  if (length > 1) { forward /= length; side /= length; }
  const inWater = groundAt(player.x, player.z) < 0 && player.y < 0.1;
  const sprinting = down('ShiftLeft') || down('ShiftRight');
  const speed = inWater ? 3.3 : sprinting ? 8.5 : 5.5;
  const desiredX = (-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * side) * speed;
  const desiredZ = (-Math.cos(player.yaw) * forward - Math.sin(player.yaw) * side) * speed;
  const drag = 1 - Math.exp(-(player.grounded ? 18 : 5) * dt);
  player.vx = THREE.MathUtils.lerp(player.vx, desiredX, drag);
  player.vz = THREE.MathUtils.lerp(player.vz, desiredZ, drag);
  if (down('Space') && player.grounded) {
    player.vy = 8.5;
    player.grounded = false;
    tone(190, 0.08, 'sine', 0.018, 260);
  }
  const obstacles = colliders();
  let nx = clamp(player.x + player.vx * dt, -21.4, 21.4);
  let nz = clamp(player.z + player.vz * dt, -29.3, 29.3);
  for (const c of obstacles) {
    if (player.y >= c.height - 0.04) continue;
    if (overlaps(nx, player.z, c)) {
      if (player.x <= c.minX) nx = c.minX - 0.38;
      else if (player.x >= c.maxX) nx = c.maxX + 0.38;
      else nx = player.x;
      player.vx = 0;
    }
    if (overlaps(nx, nz, c)) {
      if (player.z <= c.minZ) nz = c.minZ - 0.38;
      else if (player.z >= c.maxZ) nz = c.maxZ + 0.38;
      else nz = player.z;
      player.vz = 0;
    }
  }
  player.x = nx;
  player.z = nz;
  let ground = groundAt(nx, nz);
  for (const c of obstacles) {
    if (player.y >= c.height - 0.05 && overlaps(nx, nz, c, 0.24)) ground = Math.max(ground, c.height);
  }
  player.vy -= 25 * dt;
  player.y += player.vy * dt;
  if (player.y <= ground) { player.y = ground; player.vy = 0; player.grounded = true; }
  else player.grounded = false;
  const moving = Math.hypot(player.vx, player.vz);
  bob += dt * (sprinting ? 13 : 10) * Math.min(1, moving / 3);
  const stepBob = player.grounded ? Math.sin(bob) * 0.038 * Math.min(1, moving / 3) : 0;
  if (thirdPerson) {
    cameraOrigin.set(player.x, player.y + 1.6, player.z);
    cameraDestination.set(player.x + Math.sin(player.yaw) * 6.5, player.y + 4.2 - player.pitch * 3, player.z + Math.cos(player.yaw) * 6.5);
    camera.position.lerpVectors(cameraOrigin, cameraDestination, cameraObstruction(cameraOrigin, cameraDestination, obstacles));
    camera.lookAt(player.x - Math.sin(player.yaw) * 3, player.y + 1.3 + player.pitch * 3, player.z - Math.cos(player.yaw) * 3);
    playerMesh.visible = true;
    playerMesh.position.set(player.x, player.y, player.z);
    playerMesh.rotation.y = player.yaw;
    world.animateUnit?.(playerMesh, { kind: 'knight', team: 'blue' }, time, moving > 0.3);
  } else {
    camera.position.set(player.x, player.y + 1.68 + stepBob, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    playerMesh.visible = false;
  }
  const targetFov = sprinting && moving > 2 ? 83 : 76;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-8 * dt));
  camera.updateProjectionMatrix();
  swing = Math.max(0, swing - dt * 3.8);
  hand.rotation.set(-Math.sin(swing * Math.PI) * 0.8, Math.sin(swing * Math.PI) * 0.5, -0.18 + Math.sin(swing * Math.PI) * 1.1);
  hand.position.set(0.43 - Math.sin(swing * Math.PI) * 0.25, -0.44 + stepBob * 0.7, -0.69);
  if (heldAttack) strike();
  getAimPoint();
  deploymentRing.position.copy(aim);
  deploymentRing.position.y = groundAt(aim.x, aim.z) + 0.06;
  const valid = selected === 'fireball' || aim.z >= 3;
  deploymentRing.material.color.setHex(valid ? selected === 'fireball' ? 0xffae43 : 0x8effc5 : 0xff776c);
  const scale = selected === 'fireball' ? 2.6 : 1;
  deploymentRing.scale.setScalar(scale * (1 + Math.sin(time * 3) * 0.03));
  deploymentRing.visible = true;
  text('deployment-hint', selected === 'fireball' ? 'E · Cast at the reticle' : valid ? 'E · Deploy here' : 'Deploy on your side of the river');
}

function updateUI() {
  const state = battle.getState();
  if (state.timeRemaining <= 60 && !finalMinute && mode === 'playing') {
    finalMinute = true;
    toast('Final minute · Elixir recharges faster!');
    tone(550, 0.3, 'triangle', 0.04, 820);
  }
  text('match-time', `${Math.floor(Math.max(0, state.timeRemaining) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, state.timeRemaining) % 60).toString().padStart(2, '0')}`);
  text('blue-score', state.blueCrowns);
  text('red-score', state.redCrowns);
  text('health-value', Math.ceil(state.playerHp));
  if ($('health-fill')) $('health-fill').style.width = `${state.playerHp}%`;
  text('elixir-value', Math.floor(state.elixir));
  if ($('elixir-fill')) $('elixir-fill').style.width = `${state.elixir * 10}%`;
  document.querySelectorAll('[data-card]').forEach((button) => {
    const cost = CARD_DEFS[button.dataset.card]?.cost ?? 0;
    button.classList.toggle('unaffordable', state.elixir < cost);
    button.setAttribute('aria-label', `${button.dataset.card}, ${cost} elixir${state.elixir < cost ? ', not enough elixir' : ''}`);
  });
  $('match-time')?.classList.toggle('urgent', state.timeRemaining < 30);
  drawMinimap(state);
}

function drawMinimap(state) {
  const map = $('minimap');
  if (!map || mode === 'menu' || innerWidth <= 760) return;
  const ctx = map.getContext('2d');
  const w = map.width;
  const h = map.height;
  const x = (value) => (value + 23) / 46 * w;
  const z = (value) => (value + 31) / 62 * h;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#3d6252';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#658775';
  for (const lane of [-13, 13]) ctx.fillRect(x(lane - 1.5), 8, 10, h - 16);
  ctx.fillStyle = '#75c1c8';
  ctx.fillRect(0, z(-2.6), w, z(2.6) - z(-2.6));
  ctx.fillStyle = '#dfc592';
  for (const lane of [-10, 10]) ctx.fillRect(x(lane - 2.5), z(-3.6), x(2.5) - x(-2.5), z(3.6) - z(-3.6));
  for (const tower of state.towers) {
    const size = tower.kind === 'king' ? 11 : 8;
    ctx.fillStyle = tower.dead ? '#7b7b65' : tower.team === 'blue' ? '#93e4db' : '#ff9b85';
    ctx.fillRect(x(tower.x) - size / 2, z(tower.z) - size / 2, size, size);
    if (!tower.dead) {
      ctx.strokeStyle = '#192f31';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x(tower.x) - size / 2, z(tower.z) - size / 2, size, size);
      ctx.fillStyle = '#16332a';
      ctx.fillRect(x(tower.x) - 6, z(tower.z) - size / 2 - 5, 12, 2);
      ctx.fillStyle = '#dfefb0';
      ctx.fillRect(x(tower.x) - 6, z(tower.z) - size / 2 - 5, 12 * tower.hp / tower.maxHp, 2);
    }
  }
  for (const unit of state.units) {
    if (unit.dead) continue;
    ctx.fillStyle = unit.team === 'blue' ? '#b0f8e0' : '#ff987e';
    ctx.beginPath();
    ctx.arc(x(unit.x), z(unit.z), unit.kind === 'giant' ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!state.playerDead) {
    ctx.save();
    ctx.translate(x(player.x), z(player.z));
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fillStyle = '#fff4b3';
    ctx.strokeStyle = '#213b38';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

$('play-button')?.addEventListener('click', startGame);
$('resume-button')?.addEventListener('click', resumeGame);
$('restart-button')?.addEventListener('click', startGame);
$('play-again')?.addEventListener('click', startGame);
$('menu-button')?.addEventListener('click', returnToMenu);
document.querySelector('.brand')?.addEventListener('click', (event) => { event.preventDefault(); returnToMenu(); });
$('pause-button')?.addEventListener('click', () => mode === 'paused' ? resumeGame() : pauseGame());
$('sound-button')?.addEventListener('click', () => {
  initAudio();
  soundEnabled = !soundEnabled;
  $('sound-button').classList.toggle('muted', !soundEnabled);
  $('sound-button').setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Enable sound');
  $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  toast(soundEnabled ? 'Sound on' : 'Sound muted');
});

function openHelp() {
  helpFromPause = mode === 'playing' || mode === 'paused';
  if (mode === 'playing') pauseGame();
  show('pause-overlay', false);
  show('help-overlay', true);
}
$('help-button')?.addEventListener('click', openHelp);
$('menu-help')?.addEventListener('click', openHelp);
$('close-help')?.addEventListener('click', () => {
  show('help-overlay', false);
  if (helpFromPause) show('pause-overlay', true);
});
document.querySelectorAll('[data-card]').forEach((button) => button.addEventListener('click', () => selectCard(button.dataset.card)));

document.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.code === 'Escape') {
    if (!$('help-overlay')?.classList.contains('hidden')) { show('help-overlay', false); show('pause-overlay', mode === 'paused'); }
    else if (mode === 'playing') pauseGame();
    return;
  }
  if (mode !== 'playing') return;
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code.startsWith('Digit')) selectCard(['knight', 'archer', 'giant', 'fireball'][Number(event.code.slice(-1)) - 1]);
  if (event.code === 'KeyE') deploy();
  if (event.code === 'KeyV') {
    thirdPerson = !thirdPerson;
    hand.visible = !thirdPerson;
    toast(thirdPerson ? 'Third-person view' : 'First-person view');
  }
  if (event.code === 'KeyH') openHelp();
  if (event.code === 'KeyM') $('sound-button')?.click();
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && mode === 'playing' && !touchDevice) pauseGame();
});
window.addEventListener('blur', () => { if (mode === 'playing') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') pauseGame(); });
document.addEventListener('mousemove', (event) => {
  if (mode !== 'playing' || (!document.pointerLockElement && !dragging)) return;
  player.yaw -= event.movementX * 0.0025;
  player.pitch = clamp(player.pitch - event.movementY * 0.0025, -1.38, 1.38);
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
renderer.domElement.addEventListener('mousedown', (event) => {
  if (mode !== 'playing') return;
  initAudio();
  if (event.button === 0) { heldAttack = true; dragging = true; strike(); }
  if (event.button === 2) deploy();
});
document.addEventListener('mouseup', () => { heldAttack = false; dragging = false; });

// Touch movement buttons and drag-to-look make the same arena usable on tablets.
for (const button of document.querySelectorAll('[data-touch]')) {
  const aliases = { forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space' };
  const action = aliases[button.dataset.touch] || button.dataset.touch;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (action === 'attack') { heldAttack = true; strike(); }
    else if (action === 'deploy') deploy();
    else touchKeys.add(action);
  });
  const release = () => { touchKeys.delete(action); if (action === 'attack') heldAttack = false; };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
}
let lastTouch = null;
renderer.domElement.addEventListener('touchstart', (event) => {
  if (mode !== 'playing') return;
  lastTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
renderer.domElement.addEventListener('touchmove', (event) => {
  if (mode !== 'playing' || !lastTouch) return;
  const t = event.touches[0];
  player.yaw -= (t.clientX - lastTouch.x) * 0.005;
  player.pitch = clamp(player.pitch - (t.clientY - lastTouch.y) * 0.005, -1.38, 1.38);
  lastTouch = { x: t.clientX, y: t.clientY };
  event.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener('touchend', () => { lastTouch = null; });

for (const entity of [
  { kind: 'knight', team: 'blue', x: 8.8, z: 5.8 },
  { kind: 'knight', team: 'blue', x: 11.2, z: 7.4 },
  { kind: 'archer', team: 'blue', x: -9.7, z: 10.7 },
  { kind: 'giant', team: 'blue', x: -10, z: 4.8 },
  { kind: 'knight', team: 'red', x: 9.5, z: -7 },
  { kind: 'archer', team: 'red', x: -11, z: -6.5 },
]) {
  const mesh = world.createUnit({ ...entity, type: 'unit', hp: 100, maxHp: 100 });
  mesh.position.set(entity.x, 0, entity.z);
  mesh.rotation.y = entity.team === 'red' ? Math.PI : 0;
  mesh.userData.previewEntity = entity;
  if (mesh.userData.healthBarRoot) mesh.userData.healthBarRoot.visible = false;
  scene.add(mesh);
  previewUnits.push(mesh);
}

let lastTime = performance.now();
let uiTimer = 0;
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  const time = now / 1000;
  world.update(dt, time);
  if (mode === 'playing') {
    // Fixed-size physics steps preserve jump height and collision at any frame rate.
    let remaining = dt;
    while (remaining > 0.00001 && mode === 'playing') {
      const step = Math.min(remaining, 1 / 60);
      updatePlayer(step, time);
      battle.update(step, { x: player.x, z: player.z, alive: !battle.getState().playerDead });
      remaining -= step;
    }
  } else if (mode === 'menu') {
    world.setMenuView(time);
    for (const mesh of previewUnits) world.animateUnit?.(mesh, mesh.userData.previewEntity, time, false);
  }
  syncEntities(time, dt);
  uiTimer += dt;
  if (uiTimer > 0.1) { updateUI(); uiTimer = 0; }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => world.resize());
setMode('menu');
world.setMenuView(0);
syncEntities(0, 0);
selectCard('knight', false);
updateUI();
show('loading', false);
requestAnimationFrame(frame);

// Readable development hooks allow real browser smoke checks of movement and combat.
if (import.meta.env.DEV) {
  window.__CROWNBOUND__ = {
    get mode() { return mode; },
    get player() { return { ...player }; },
    get state() { return battle.getState(); },
    get battle() { return battle; },
    get cameraMode() { return thirdPerson ? 'third-person' : 'first-person'; },
    get selected() { return selected; },
    renderer,
  };
}
