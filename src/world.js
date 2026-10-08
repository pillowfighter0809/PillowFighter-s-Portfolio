import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const materials = new Map();

function material(color, roughness = 0.88) {
  const key = `${color}-${roughness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(key);
}

function block(parent, color, x, y, z, w, h, d, opts = {}) {
  const mesh = new THREE.Mesh(UNIT_BOX, typeof color === 'object' ? color : material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = true;
  if (opts.rotation) mesh.rotation.set(...opts.rotation);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, color, x, y, z, radius, height, sides = 8, topRadius = radius) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, radius, height, sides), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function seededRandom(seed = 821) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function instances(parent, color, placements, { castShadow = true } = {}) {
  if (!placements.length) return null;
  const mesh = new THREE.InstancedMesh(UNIT_BOX, material(color), placements.length);
  const transform = new THREE.Object3D();
  placements.forEach((p, index) => {
    transform.position.set(p[0], p[1], p[2]);
    transform.scale.set(p[3], p[4], p[5]);
    transform.rotation.set(0, p[6] || 0, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function combineStaticMeshes(root, directChildrenOnly = false) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map();
  const collect = mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.material.isMeshStandardMaterial) return;
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(mesh);
  };
  if (directChildrenOnly) root.children.forEach(collect);
  else root.traverse(collect);
  for (const [mat, meshes] of batches) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)));
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach(item => item.dispose());
    if (!geometry) continue;
    const combined = new THREE.Mesh(geometry, mat);
    combined.castShadow = meshes.some(mesh => mesh.castShadow);
    combined.receiveShadow = true;
    meshes.forEach(mesh => mesh.removeFromParent());
    root.add(combined);
  }
}

function makeFlag(parent, color, x, y, z, scale = 1, outward = 1) {
  const flag = new THREE.Group();
  flag.position.set(x, y, z);
  parent.add(flag);
  cylinder(flag, '#d4b17a', 0, 0, 0, 0.055 * scale, 2.25 * scale, 6);
  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.14 * scale), material('#ffe29b', 0.4));
  finial.position.y = 1.22 * scale;
  flag.add(finial);
  const flagMesh = block(flag, color, 0.48 * scale * outward, 0.53 * scale, 0, 0.97 * scale, 0.72 * scale, 0.065 * scale);
  block(flagMesh, '#f9dc8f', 0.28 * outward, 0, -0.54, 0.13, 0.58, 0.08, { shadow: false });
  return flag;
}

export function createHealthBar(parent, width = 1.8, y = 2.5, color = '#7ee8ca') {
  const holder = new THREE.Group();
  holder.position.y = y;
  parent.add(holder);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.09, 0.14), new THREE.MeshBasicMaterial({ color: '#163b44', transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  holder.add(back);
  const geometry = new THREE.PlaneGeometry(width, 0.072);
  geometry.translate(width / 2, 0, 0);
  const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  fill.position.set(-width / 2, 0, 0.012);
  holder.add(fill);
  parent.userData.healthBar = fill;
  parent.userData.healthBarRoot = holder;
  parent.userData.healthBarWidth = width;
  return holder;
}

function towerMesh(entity) {
  const root = new THREE.Group();
  const king = entity.kind === 'king';
  const blue = entity.team !== 'red';
  const team = blue ? '#349ecc' : '#e97566';
  const trim = blue ? '#176c99' : '#ad4951';
  const stone = '#f0e5c9';
  const shade = '#d3ccae';
  const gold = '#f5cb70';
  const width = king ? 4.7 : 3.35;
  const bodyTop = king ? 4.7 : 3.1;
  root.position.set(entity.x || 0, 0, entity.z || 0);
  root.userData.entityId = entity.id;

  block(root, '#aaa486', 0, 0.14, 0, width + 1.1, 0.28, width + 1.1);
  block(root, stone, 0, 0.43, 0, width + 0.7, 0.3, width + 0.7);
  block(root, shade, 0, 0.72, 0, width + 0.18, 0.3, width + 0.18);
  block(root, stone, 0, (bodyTop + 0.8) / 2, 0, width, bodyTop - 0.8, width);
  block(root, shade, 0, 1.17, 0, width + 0.08, 0.15, width + 0.08);
  block(root, shade, 0, bodyTop - 0.2, 0, width + 0.2, 0.18, width + 0.2);
  block(root, '#f6edd9', 0, bodyTop + 0.05, 0, width + 0.65, 0.36, width + 0.65);
  block(root, trim, 0, bodyTop + 0.32, 0, width + 0.8, 0.22, width + 0.8);
  block(root, team, 0, bodyTop + 0.64, 0, width + 0.6, 0.45, width + 0.6);
  block(root, '#665949', 0, bodyTop + 0.875, 0, width - 0.2, 0.03, width - 0.2);

  // The battlements are separate chunky teeth so the silhouette reads from above.
  const teeth = [];
  const edge = (width + 0.2) / 2;
  for (let i = -1; i <= 1; i++) {
    for (const side of [-1, 1]) {
      teeth.push([i * width / 2.5, bodyTop + 1.02, side * edge, 0.73, 0.72, 0.72]);
      if (i === 0) teeth.push([side * edge, bodyTop + 1.02, 0, 0.73, 0.72, 0.72]);
    }
  }
  instances(root, team, teeth);
  const cornerPlacements = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    cornerPlacements.push([x * (width / 2 - 0.07), bodyTop / 2 + 0.45, z * (width / 2 - 0.07), 0.33, bodyTop - 0.75, 0.33]);
  }
  instances(root, '#e2d7ba', cornerPlacements);

  // A recessed door, golden hinges, and a team banner on the front and rear.
  for (const side of [-1, 1]) {
    block(root, '#5a6059', 0, 1.66, side * (width / 2 + 0.014), 0.8, 1.5, 0.055);
    block(root, '#966e47', 0, 1.5, side * (width / 2 + 0.05), 0.61, 1.17, 0.055);
    block(root, '#dec08a', 0, 1.37, side * (width / 2 + 0.095), 0.7, 0.075, 0.055);
    const banner = block(root, team, 0, bodyTop - 0.39, side * (width / 2 + 0.055), king ? 1.4 : 0.95, king ? 1.4 : 0.9, 0.07);
    block(banner, gold, 0, 0.13, side * 0.65, 0.48, 0.2, 0.25);
    block(banner, gold, -0.17, 0.3, side * 0.65, 0.13, 0.2, 0.25);
    block(banner, gold, 0.17, 0.3, side * 0.65, 0.13, 0.2, 0.25);
    block(banner, gold, 0, 0.36, side * 0.65, 0.12, 0.25, 0.25);
  }

  if (king) {
    block(root, '#f8e9be', 0, bodyTop + 1.1, 0, 1.85, 0.6, 1.85);
    block(root, gold, 0, bodyTop + 1.56, 0, 2.1, 0.32, 2.1);
    const crownPoints = [];
    for (const x of [-0.82, 0, 0.82]) for (const z of [-0.82, 0.82]) crownPoints.push([x, bodyTop + 2.03, z, 0.43, x === 0 ? 0.93 : 0.67, 0.43]);
    crownPoints.push([-0.82, bodyTop + 2.03, 0, 0.43, 0.93, 0.43], [0.82, bodyTop + 2.03, 0, 0.43, 0.93, 0.43]);
    instances(root, gold, crownPoints);
    block(root, team, 0, bodyTop + 1.64, 1.073, 0.35, 0.27, 0.045);
    makeFlag(root, team, -edge, bodyTop + 2.35, -edge, 1.22, -1);
  } else {
    const cannon = new THREE.Group();
    cannon.position.set(0, bodyTop + 1.12, 0);
    cannon.rotation.y = blue ? Math.PI : 0;
    root.add(cannon);
    block(cannon, '#e0b476', 0, -0.04, 0, 1.1, 0.32, 1.05);
    const barrel = cylinder(cannon, '#465b61', 0, 0.32, 0.23, 0.31, 1.15, 8);
    barrel.rotation.x = Math.PI / 2 - 0.2;
    const muzzle = cylinder(cannon, '#273e44', 0, 0.44, 0.8, 0.33, 0.13, 8);
    muzzle.rotation.x = Math.PI / 2 - 0.2;
    makeFlag(root, team, -edge + 0.25, bodyTop + 1.75, -edge + 0.15, 0.9, -1);
  }
  combineStaticMeshes(root);
  createHealthBar(root, king ? 2.6 : 2.1, king ? 8.7 : 6.6, blue ? '#a5efd4' : '#ffb498');
  return root;
}

function characterMesh(entity = {}) {
  const root = new THREE.Group();
  const kind = entity.kind || 'knight';
  const giant = kind === 'giant';
  const archer = kind === 'archer';
  const blue = entity.team !== 'red';
  const team = blue ? '#3ea4d4' : '#e67869';
  const dark = blue ? '#205b89' : '#a54b50';
  const skin = giant ? '#e9b084' : '#f5c89a';
  const group = new THREE.Group();
  root.add(group);
  root.position.set(entity.x || 0, entity.y || 0, entity.z || 0);
  root.userData.body = group;
  const legSize = giant ? 0.4 : 0.23;
  const torsoWidth = giant ? 1.15 : 0.68;
  const legHeight = giant ? 0.7 : 0.64;
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * (giant ? 0.29 : 0.19), legHeight, 0);
    group.add(leg);
    block(leg, giant ? '#765948' : dark, 0, -legHeight / 2, 0, legSize, legHeight, legSize);
    block(leg, '#524f47', 0, -legHeight + 0.12, -0.08, legSize + 0.07, 0.23, legSize + 0.15);
    root.userData[side === -1 ? 'leftLeg' : 'rightLeg'] = leg;
  }
  block(group, giant ? '#d99970' : archer ? '#62af86' : team, 0, legHeight + 0.34, 0, torsoWidth, 0.77, giant ? 0.64 : 0.4);
  block(group, '#805c42', 0, legHeight + 0.13, 0, torsoWidth + 0.06, 0.13, giant ? 0.69 : 0.45);
  block(group, '#f6d180', 0, legHeight + 0.13, -0.25, 0.17, 0.17, 0.07);
  if (!giant) {
    block(group, dark, 0, legHeight + 0.36, 0.24, 0.65, 0.78, 0.075);
    block(group, '#f5ce7c', 0, legHeight + 0.5, -0.225, 0.16, 0.2, 0.06);
  } else {
    block(group, '#755244', -0.33, legHeight + 0.39, -0.325, 0.2, 0.78, 0.06, { rotation: [0, 0, -0.25] });
    block(group, '#755244', 0.33, legHeight + 0.39, -0.325, 0.2, 0.78, 0.06, { rotation: [0, 0, 0.25] });
  }

  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * (giant ? 0.78 : 0.48), legHeight + 0.59, 0);
    group.add(arm);
    block(arm, skin, 0, -0.29, 0, giant ? 0.43 : 0.24, giant ? 0.76 : 0.61, giant ? 0.43 : 0.26);
    block(arm, giant ? '#9e674a' : archer ? '#4b9275' : '#e4decb', 0, -0.055, 0, giant ? 0.52 : 0.34, 0.29, giant ? 0.5 : 0.37);
    root.userData[side === -1 ? 'leftArm' : 'rightArm'] = arm;
  }
  const headY = legHeight + (giant ? 1.15 : 1.03);
  block(group, skin, 0, headY, -0.015, giant ? 0.76 : 0.51, giant ? 0.68 : 0.52, giant ? 0.62 : 0.49);
  block(group, '#353e42', -0.13, headY + 0.05, giant ? -0.335 : -0.265, 0.065, 0.066, 0.026);
  block(group, '#353e42', 0.13, headY + 0.05, giant ? -0.335 : -0.265, 0.065, 0.066, 0.026);
  if (giant) {
    block(group, '#b86937', 0, headY + 0.35, 0.05, 0.8, 0.19, 0.66);
    block(group, '#b86937', 0, headY - 0.22, -0.3, 0.65, 0.23, 0.18);
    block(group, '#f5d2a0', 0, headY - 0.075, -0.35, 0.15, 0.1, 0.08);
    block(group, team, 0, headY + 0.31, -0.3, 0.8, 0.15, 0.07);
    root.scale.setScalar(1.42);
  } else if (archer) {
    block(group, '#3c8a6e', 0, headY + 0.31, 0.035, 0.65, 0.2, 0.65);
    block(group, '#3c8a6e', -0.3, headY + 0.015, 0.04, 0.13, 0.55, 0.6);
    block(group, '#3c8a6e', 0.3, headY + 0.015, 0.04, 0.13, 0.55, 0.6);
    block(group, '#436d59', 0, headY + 0.09, 0.3, 0.65, 0.6, 0.16);
    block(group, '#dab678', 0, headY + 0.11, -0.29, 0.52, 0.1, 0.055);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.037, 5, 12, Math.PI), material('#b98348'));
    bow.rotation.set(0, Math.PI / 2, -Math.PI / 2);
    bow.position.set(-0.12, -0.2, -0.35);
    root.userData.leftArm.add(bow);
    block(root.userData.leftArm, '#f1dcaf', -0.12, -0.2, -0.34, 0.028, 0.72, 0.025);
    block(group, '#805d42', 0.27, legHeight + 0.56, 0.32, 0.22, 0.65, 0.24, { rotation: [0.15, 0, -0.2] });
  } else {
    block(group, '#c4d0cc', 0, headY + 0.29, 0, 0.63, 0.22, 0.61);
    block(group, '#c4d0cc', -0.27, headY + 0.015, 0.05, 0.13, 0.44, 0.53);
    block(group, '#c4d0cc', 0.27, headY + 0.015, 0.05, 0.13, 0.44, 0.53);
    block(group, '#c4d0cc', 0, headY + 0.03, 0.27, 0.6, 0.44, 0.1);
    block(group, team, 0, headY + 0.51, 0.035, 0.16, 0.28, 0.51);
    block(group, '#8ea5aa', 0, headY + 0.15, -0.3, 0.62, 0.09, 0.08);
    const shield = new THREE.Group();
    shield.position.set(-0.12, -0.28, -0.16);
    root.userData.leftArm.add(shield);
    block(shield, '#f1d18d', 0, 0, 0, 0.61, 0.79, 0.13);
    block(shield, team, 0, 0.015, -0.075, 0.48, 0.64, 0.035);
    block(shield, '#f1d18d', 0, 0.06, -0.1, 0.12, 0.31, 0.03);
    block(shield, '#f1d18d', 0, 0.1, -0.1, 0.3, 0.1, 0.03);
    const sword = new THREE.Group();
    sword.position.set(0, -0.43, -0.3);
    sword.rotation.x = -0.6;
    root.userData.rightArm.add(sword);
    block(sword, '#a6bec6', 0, 0.38, 0, 0.12, 0.92, 0.065);
    block(sword, '#e8f4eb', -0.043, 0.38, -0.039, 0.035, 0.9, 0.016);
    block(sword, '#f0c579', 0, -0.045, 0, 0.36, 0.08, 0.12);
    block(sword, '#865f49', 0, -0.2, 0, 0.1, 0.23, 0.1);
  }
  // Keep moving joints separate while batching each limb and the torso details.
  group.children.filter(child => child.isGroup).forEach(limb => combineStaticMeshes(limb));
  combineStaticMeshes(group, true);
  createHealthBar(root, giant ? 1.45 : 1.1, giant ? 2.85 : 2.4, blue ? '#8be6cb' : '#ffa18f');
  return root;
}

export function animateUnit(mesh, entity, time, moving = true) {
  const data = mesh.userData;
  const phase = typeof entity.id === 'number' ? entity.id * 0.4 : 0;
  const stride = moving ? Math.sin(time * (entity.kind === 'giant' ? 5.5 : 10) + phase) * 0.55 : 0;
  if (data.leftLeg) data.leftLeg.rotation.x = stride;
  if (data.rightLeg) data.rightLeg.rotation.x = -stride;
  if (data.leftArm) data.leftArm.rotation.set(-stride * 0.5, 0, 0);
  if (data.rightArm) {
    data.rightArm.rotation.set(stride * 0.6, 0, 0);
    data.rightArm.position.z = 0;
  }
  if (data.body) {
    data.body.position.y = moving ? Math.abs(stride) * 0.055 : 0;
    data.body.rotation.set(0, 0, 0);
  }
  const remaining = (data.attackUntil || 0) - time;
  if (remaining > 0 && data.rightArm && data.leftArm) {
    const progress = THREE.MathUtils.clamp(1 - remaining / 0.38, 0, 1);
    const impact = Math.sin(Math.PI * Math.min(1, progress / 0.62));
    const settle = 1 - THREE.MathUtils.smoothstep(progress, 0.62, 1);
    if (entity.kind === 'giant') {
      data.rightArm.rotation.set(impact * 1.95, -impact * 0.22, -impact * 0.12);
      data.leftArm.rotation.x = impact * 0.7;
      if (data.body) {
        data.body.rotation.x = -impact * 0.14;
        data.body.rotation.y = -impact * 0.16;
        data.body.position.y -= impact * 0.08;
      }
    } else if (entity.kind === 'archer') {
      data.leftArm.rotation.x = 1.48 * settle;
      data.rightArm.rotation.x = (1.1 - Math.sin(progress * Math.PI) * 0.5) * settle;
      data.rightArm.rotation.y = -0.35 * settle;
      data.rightArm.position.z = Math.sin(progress * Math.PI) * 0.16;
      if (data.body) data.body.rotation.y = 0.12 * settle;
    } else {
      const swing = progress < 0.23
        ? THREE.MathUtils.lerp(-1.8, -2.25, progress / 0.23)
        : THREE.MathUtils.lerp(-2.25, 1.1, Math.min(1, (progress - 0.23) / 0.4));
      data.rightArm.rotation.set(swing * settle, -impact * 0.3, -impact * 0.24);
      data.leftArm.rotation.x = impact * 0.55;
      if (data.body) data.body.rotation.y = Math.sin(progress * Math.PI * 2) * 0.18 * settle;
    }
  }
}

export function createWorld(canvasContainer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bedfdd');
  scene.fog = new THREE.Fog('#bedfdd', 88, 190);
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 320);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvasContainer.clientWidth || window.innerWidth, canvasContainer.clientHeight || window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  canvasContainer.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Crownbound 3D battle arena');

  const ambient = new THREE.HemisphereLight('#e8f5ee', '#9b9a78', 2.1);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff1d0', 3.2);
  sun.position.set(-32, 52, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -43;
  sun.shadow.camera.right = 43;
  sun.shadow.camera.top = 49;
  sun.shadow.camera.bottom = -49;
  sun.shadow.camera.far = 140;
  sun.shadow.normalBias = 0.05;
  sun.shadow.bias = -0.00008;
  sun.shadow.radius = 3;
  scene.add(sun);

  const terrain = new THREE.Group();
  scene.add(terrain);
  const random = seededRandom(89);
  const arenaColliders = [];
  const effects = [];
  const healthBars = [];
  const clouds = [];
  const waterSparkles = [];

  // A thick, cutaway floating island gives the arena a tactile board-game silhouette.
  block(terrain, '#877b61', 0, -2.6, 0, 46.6, 3.2, 64.6);
  block(terrain, '#a7966a', 0, -1.45, 0, 47.4, 1.5, 65.4);
  for (const side of [-1, 1]) {
    block(terrain, '#a7966a', 0, -0.98, side * 17.725, 47.4, 1.5, 30.15);
    block(terrain, '#d8d0a3', 0, -0.38, side * 17.775, 48.1, 0.48, 30.35);
    block(terrain, '#5b9b61', 0, -0.18, side * 17.85, 47.8, 0.3, 30.3);
  }
  const topTiles = [[], [], [], []];
  for (let x = -23; x < 24; x += 2) {
    for (let z = -32; z < 33; z += 2) {
      if (Math.abs(z) < 3) continue;
      const variant = (Math.round(x / 2) + Math.round(z / 2)) % 2 === 0 ? 0 : 1;
      const index = random() < 0.08 ? 2 + Math.floor(random() * 2) : variant;
      topTiles[index].push([x, -0.035, z, 2, 0.12, 2]);
    }
  }
  ['#83b96b', '#7fb368', '#88bc70', '#79ae66'].forEach((color, i) => instances(terrain, color, topTiles[i], { castShadow: false }));

  const bricks = [];
  const darkerBricks = [];
  for (const side of [-1, 1]) {
    for (let z = -31.5; z <= 31.5; z += 2.5) {
      (random() > 0.25 ? bricks : darkerBricks).push([side * 24.04, -0.46, z, 0.55, 0.7, 2.35]);
      darkerBricks.push([side * 23.33, -2.1, z + 0.8, 0.32, 0.62, 2.1]);
    }
    for (let x = -22.5; x <= 22.5; x += 2.5) {
      (random() > 0.25 ? bricks : darkerBricks).push([x, -0.46, side * 32.75, 2.35, 0.7, 0.55]);
      darkerBricks.push([x + 0.8, -2.1, side * 32.3, 2.1, 0.62, 0.3]);
    }
  }
  instances(terrain, '#d1c899', bricks);
  instances(terrain, '#b7ac80', darkerBricks);
  const underside = [];
  for (let i = 0; i < 34; i++) {
    const x = (random() - 0.5) * 42;
    const z = (random() - 0.5) * 59;
    underside.push([x, -4 - random() * 1.6, z, 3 + random() * 6, 1.5 + random() * 3.5, 3 + random() * 6, random() * 0.2]);
  }
  instances(terrain, '#817965', underside);

  const pathTiles = [];
  const pathEdges = [];
  const pathTile = (x, z, w = 1.46, d = 1.46) => {
    pathTiles.push([x, 0.055, z, w, 0.1, d]);
    if (random() > 0.72) pathEdges.push([x - w * 0.33, 0.112, z, 0.055, 0.01, d * 0.8]);
  };
  for (const side of [-1, 1]) {
    for (const lane of [-1, 1]) {
      for (let d = 4.8; d < 27; d += 1.58) {
        const x = lane * (10 + Math.min(3, (d - 4.8) * 0.4));
        pathTile(x - 0.79, d * side);
        pathTile(x + 0.79, d * side);
      }
    }
    for (let x = -12.6; x < 13; x += 1.58) {
      pathTile(x, 25.6 * side);
      pathTile(x, 27.18 * side);
    }
    for (let x = -2.1; x <= 2.1; x += 1.4) for (let z = 20.8; z <= 29.3; z += 1.4) pathTile(x, z * side, 1.32, 1.32);
  }
  instances(terrain, '#d6cb9c', pathTiles, { castShadow: false });
  instances(terrain, '#bfb58b', pathEdges, { castShadow: false });

  // The river has two shallow banks, lively highlights, and timber bridges.
  block(terrain, '#92cccb', 0, -0.49, 0, 49, 0.06, 5.9, { shadow: false });
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#55bfc5', roughness: 0.24, metalness: 0.16, transparent: true, opacity: 0.88 });
  const river = block(terrain, waterMaterial, 0, -0.31, 0, 49.2, 0.12, 5.5, { shadow: false });
  for (const z of [-2.9, 2.9]) block(terrain, '#dece9a', 0, -0.13, z, 48, 0.34, 0.48);
  const foam = new THREE.MeshBasicMaterial({ color: '#dcffff', transparent: true, opacity: 0.46 });
  for (let i = 0; i < 25; i++) {
    const sparkle = block(terrain, foam, random() * 46 - 23, -0.235, random() * 4.6 - 2.3, 0.35 + random() * 1.5, 0.015, 0.035 + random() * 0.07, { shadow: false });
    sparkle.userData.seed = random() * 6;
    waterSparkles.push(sparkle);
  }
  for (const x of [-10, 10]) {
    const planks = [];
    for (let z = -3.6; z <= 3.6; z += 0.6) planks.push([x, 0.105, z, 5.3, 0.26, 0.54]);
    instances(terrain, '#c49a60', planks);
    for (const side of [-1, 1]) {
      block(terrain, '#826c48', x + side * 2.47, -0.15, 0, 0.23, 0.5, 7.7);
      for (const z of [-3.8, 3.8]) {
        block(terrain, '#e1d9b8', x + side * 2.67, 0.45, z, 0.7, 1.1, 0.75);
        block(terrain, '#f2e8c9', x + side * 2.67, 1.05, z, 0.85, 0.18, 0.9);
        arenaColliders.push({ minX: x + side * 2.67 - 0.36, maxX: x + side * 2.67 + 0.36, minZ: z - 0.38, maxZ: z + 0.38, height: 1.15 });
      }
    }
  }

  const grass = [[], []];
  const flowers = [[], [], []];
  for (let i = 0; i < 210; i++) {
    const x = random() * 44 - 22;
    const z = random() * 61 - 30.5;
    if (Math.abs(z) < 4 || (Math.abs(x) > 8 && Math.abs(x) < 15) || (Math.abs(z) > 23 && Math.abs(x) < 16)) continue;
    grass[i % 2].push([x, 0.15, z, 0.075, 0.26 + random() * 0.19, 0.075, random()]);
    if (random() < 0.35) flowers[i % 3].push([x + 0.16, 0.27, z + 0.1, 0.18, 0.16, 0.16, random()]);
  }
  instances(terrain, '#4b945a', grass[0]);
  instances(terrain, '#a3c67b', grass[1]);
  ['#f5e3a2', '#eee6ca', '#e7b8ac'].forEach((color, i) => instances(terrain, color, flowers[i]));

  function tree(x, z, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    terrain.add(group);
    block(group, '#8d714c', 0, 1, 0, 0.52, 2.2, 0.52);
    block(group, '#74a965', 0, 2.83, 0, 2.8, 2.6, 2.7);
    block(group, '#81b86d', -0.57, 3.94, 0.12, 2.1, 1.1, 2.15);
    block(group, '#599659', 1.04, 2.5, 0.4, 1.15, 1.6, 1.6);
    block(group, '#95c377', -0.7, 3.13, 1, 1.7, 1.48, 1.1);
    arenaColliders.push({ minX: x - 0.3 * scale, maxX: x + 0.3 * scale, minZ: z - 0.3 * scale, maxZ: z + 0.3 * scale, height: 2.2 * scale });
  }
  for (const [x, z, scale] of [[-21,-26,1.15],[-21,-17,0.85],[-21,-8,1.0],[-21,10,0.86],[-21,22,1.2],[21,-25,1.1],[21,-14,0.78],[21,12,0.96],[21,26,1.12],[-5,-30,0.65],[8,31,0.74]]) tree(x, z, scale);

  const rocks = [];
  const paleRocks = [];
  for (let i = 0; i < 25; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (20 + random() * 2.5);
    const z = random() * 58 - 29;
    if (Math.abs(z) < 5) continue;
    const w = 0.6 + random() * 0.75;
    const h = 0.35 + random() * 0.7;
    const d = 0.6 + random() * 0.7;
    rocks.push([x, h / 2, z, w, h, d, random() * 0.2]);
    paleRocks.push([x - 0.05, h + 0.06, z, w * 0.85, 0.13, d * 0.85, 0]);
    arenaColliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h + 0.15 });
  }
  instances(terrain, '#96a593', rocks);
  instances(terrain, '#b5c0a6', paleRocks);

  // Symmetrical team standards frame both ends without obscuring the play field.
  for (const side of [-1, 1]) {
    const color = side > 0 ? '#3195c3' : '#df756a';
    for (const x of [-17.8, 17.8]) {
      block(terrain, '#cac39e', x, 0.32, side * 29.2, 1.05, 0.64, 1.05);
      makeFlag(terrain, color, x, 2.55, side * 29.2, 1.6, x < 0 ? 1 : -1);
    }
  }

  combineStaticMeshes(terrain);

  // Distant islands and square clouds make the sky feel inhabited.
  function floatingIsland(x, y, z, size) {
    const island = new THREE.Group();
    island.position.set(x, y, z);
    scene.add(island);
    block(island, '#91b4a0', 0, -size * 0.17, 0, size, size * 0.32, size * 0.8);
    block(island, '#9fc49d', 0, 0, 0, size * 1.04, 0.5, size * 0.86);
    block(island, '#83a899', size * 0.1, -size * 0.46, 0, size * 0.61, size * 0.32, size * 0.51);
    block(island, '#759d93', size * 0.14, -size * 0.68, -size * 0.07, size * 0.34, size * 0.23, size * 0.31);
    block(island, '#86ad91', -size * 0.16, size * 0.18, 0, size * 0.27, size * 0.35, size * 0.3);
    block(island, '#a0c0a1', -size * 0.17, size * 0.4, 0, size * 0.36, size * 0.22, size * 0.38);
  }
  floatingIsland(-66, 7, -56, 14);
  floatingIsland(67, 3, -68, 18);
  floatingIsland(22, 15, -114, 15);
  floatingIsland(-78, -5, 46, 11);
  floatingIsland(86, -13, 39, 11);

  const cloudMat = new THREE.MeshStandardMaterial({ color: '#f5f4e4', roughness: 1, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    const angle = i / 14 * Math.PI * 2;
    cloud.position.set(Math.cos(angle) * (79 + random() * 30), 15 + random() * 27, Math.sin(angle) * (82 + random() * 23));
    const s = 4 + random() * 6;
    block(cloud, cloudMat, 0, 0, 0, s * 2.1, s * 0.37, s * 0.7, { shadow: false });
    block(cloud, cloudMat, -s * 0.3, s * 0.28, 0, s, s * 0.38, s * 0.6, { shadow: false });
    block(cloud, cloudMat, s * 0.5, s * 0.16, s * 0.12, s * 0.6, s * 0.22, s * 0.65, { shadow: false });
    combineStaticMeshes(cloud);
    cloud.userData.startX = cloud.position.x;
    cloud.userData.phase = random() * 6;
    scene.add(cloud);
    clouds.push(cloud);
  }

  const effectGeometries = {
    particle: new THREE.BoxGeometry(0.18, 0.18, 0.18),
    ring: new THREE.RingGeometry(0.84, 1, 32),
    flame: new THREE.IcosahedronGeometry(1, 0),
  };

  function spawnFireball(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0.13, z);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ff7347', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ffe6a1', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    const fireMat = new THREE.MeshBasicMaterial({ color: '#ffaf50', transparent: true, opacity: 0.96, depthWrite: false });
    const smokeMat = new THREE.MeshStandardMaterial({ color: '#9d8c82', transparent: true, opacity: 0, roughness: 1, depthWrite: false });
    const ring = new THREE.Mesh(effectGeometries.ring, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const innerRing = new THREE.Mesh(effectGeometries.ring, glowMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.025;
    group.add(innerRing);
    const flameCount = 14;
    const smokeCount = 9;
    const sparkCount = 18;
    const flames = new THREE.InstancedMesh(effectGeometries.flame, fireMat, flameCount);
    const smoke = new THREE.InstancedMesh(UNIT_BOX, smokeMat, smokeCount);
    const sparks = new THREE.InstancedMesh(effectGeometries.particle, glowMat, sparkCount);
    flames.frustumCulled = smoke.frustumCulled = sparks.frustumCulled = false;
    group.add(flames, smoke, sparks);
    const seeds = Array.from({ length: sparkCount }, (_, i) => ({
      angle: i / sparkCount * Math.PI * 2,
      spread: 0.7 + random() * 3.7,
      height: 0.7 + random() * 1.4,
      size: 0.48 + random() * 0.48,
    }));
    const transform = new THREE.Object3D();
    scene.add(group);
    const effect = {
      group, life: 1.4, age: 0, materials: [ringMat, glowMat, fireMat, smokeMat],
      update() {
        const age = effect.age;
        const progress = age / effect.life;
        const expansion = Math.min(1, age / 0.3);
        ring.scale.setScalar(0.45 + expansion * 4.55);
        innerRing.scale.setScalar(0.25 + Math.min(1, age / 0.34) * 4.45);
        ringMat.opacity = 0.85 * Math.max(0, 1 - age / 0.65);
        glowMat.opacity = 0.98 * Math.max(0, 1 - age / 0.8);
        fireMat.opacity = 0.94 * Math.max(0, 1 - age / 0.82);
        smokeMat.opacity = Math.min(0.62, age * 2.4) * (1 - progress);
        for (let i = 0; i < flameCount; i++) {
          const seed = seeds[i];
          const spread = seed.spread * expansion;
          transform.position.set(Math.cos(seed.angle) * spread, 0.35 + age * seed.height * 2.2, Math.sin(seed.angle) * spread);
          transform.rotation.set(age * 2 + i, i * 0.5, age + i * 0.4);
          const scale = seed.size * (0.7 + Math.sin(Math.min(1, age / 0.8) * Math.PI) * 0.7);
          transform.scale.set(scale, scale * 1.4, scale);
          transform.updateMatrix();
          flames.setMatrixAt(i, transform.matrix);
        }
        for (let i = 0; i < smokeCount; i++) {
          const seed = seeds[i + 2];
          const spread = seed.spread * 0.52 * expansion;
          transform.position.set(Math.cos(seed.angle) * spread + age * 0.3, 0.5 + age * (1.3 + seed.height), Math.sin(seed.angle) * spread);
          transform.rotation.set(i * 0.12, i * 0.55 + age * 0.18, i * 0.15);
          transform.scale.setScalar(seed.size * (0.65 + age * 1.4));
          transform.updateMatrix();
          smoke.setMatrixAt(i, transform.matrix);
        }
        for (let i = 0; i < sparkCount; i++) {
          const seed = seeds[i];
          const spread = age * (5 + seed.spread * 2);
          transform.position.set(Math.cos(seed.angle) * spread, Math.max(0.1, 0.2 + age * (3.2 + seed.height * 2) - age * age * 4), Math.sin(seed.angle) * spread);
          transform.rotation.set(age * 5 + i, age * 3, i);
          transform.scale.setScalar(1.8 * (1 - progress));
          transform.updateMatrix();
          sparks.setMatrixAt(i, transform.matrix);
        }
        flames.instanceMatrix.needsUpdate = true;
        smoke.instanceMatrix.needsUpdate = true;
        sparks.instanceMatrix.needsUpdate = true;
      },
    };
    effect.update();
    effects.push(effect);
  }

  function spawnEffect(type, x, z, color) {
    if (type === 'fireball') {
      spawnFireball(x, z);
      return;
    }
    const shade = color || (type === 'fireball' || type === 'explosion' ? '#ffb25f' : type === 'spawn' ? '#9bfff2' : '#fff0b1');
    const life = type === 'spawn' ? 0.7 : type === 'fireball' || type === 'explosion' ? 0.65 : 0.35;
    const count = type === 'fireball' || type === 'explosion' ? 22 : type === 'spawn' ? 14 : 7;
    const group = new THREE.Group();
    group.position.set(x, 0.1, z);
    const particles = [];
    const mat = new THREE.MeshBasicMaterial({ color: shade, transparent: true, opacity: 0.95 });
    for (let i = 0; i < count; i++) {
      const particle = new THREE.Mesh(effectGeometries.particle, mat);
      const angle = i / count * Math.PI * 2;
      particle.userData.velocity = new THREE.Vector3(Math.cos(angle) * (1 + random() * 2), 1.5 + random() * 3, Math.sin(angle) * (1 + random() * 2));
      particle.rotation.set(random(), random(), random());
      group.add(particle);
      particles.push(particle);
    }
    const ring = new THREE.Mesh(effectGeometries.ring, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);
    scene.add(group);
    effects.push({ group, particles, ring, mat, life, age: 0 });
  }

  function createRubble(entity) {
    const root = new THREE.Group();
    root.position.set(entity.x || 0, 0, entity.z || 0);
    root.userData.isRubble = true;
    const king = entity.kind === 'king';
    const width = king ? 5.1 : 3.75;
    const team = entity.team === 'red' ? '#e97566' : '#349ecc';
    const debrisRandom = seededRandom(Math.round((entity.x + 30) * 61 + (entity.z + 40) * 37));
    block(root, '#aaa486', 0, 0.07, 0, width, 0.14, width);
    block(root, '#c8bda1', 0, 0.15, 0, width * 0.87, 0.1, width * 0.87);
    const stones = [[], [], []];
    for (let i = 0; i < (king ? 28 : 20); i++) {
      const angle = debrisRandom() * Math.PI * 2;
      const radius = Math.sqrt(debrisRandom()) * width * 0.7;
      const w = 0.32 + debrisRandom() * 0.62;
      const h = 0.2 + debrisRandom() * 0.47;
      const d = 0.32 + debrisRandom() * 0.55;
      stones[i % 3].push([Math.cos(angle) * radius, h / 2 + 0.1, Math.sin(angle) * radius, w, h, d, debrisRandom() * Math.PI]);
    }
    instances(root, '#e6dbc1', stones[0]);
    instances(root, '#beb697', stones[1]);
    instances(root, team, stones[2]);
    const fallenFlag = new THREE.Group();
    fallenFlag.position.set(-width * 0.2, 0.4, width * 0.17);
    fallenFlag.rotation.set(0.08, 0.65, Math.PI / 2 - 0.11);
    root.add(fallenFlag);
    cylinder(fallenFlag, '#d4b17a', 0, 0, 0, 0.055, 2.2, 6);
    block(fallenFlag, team, 0.45, 0.6, 0, 0.9, 0.65, 0.07);
    if (king) block(root, '#f5cb70', width * 0.3, 0.35, -0.4, 0.5, 0.5, 0.55, { rotation: [0.2, 0.4, 0.12] });
    combineStaticMeshes(root);
    return root;
  }

  function createTower(entity) {
    const mesh = towerMesh(entity);
    healthBars.push(mesh.userData.healthBarRoot);
    return mesh;
  }

  function createUnit(entity) {
    const mesh = characterMesh(entity);
    healthBars.push(mesh.userData.healthBarRoot);
    return mesh;
  }

  function createPlayer() {
    const mesh = characterMesh({ kind: 'knight', team: 'blue' });
    mesh.userData.healthBarRoot.visible = false;
    return mesh;
  }

  function setMenuView(time = 0) {
    const drift = Math.sin(time * 0.07) * 1.5;
    camera.position.set(43 + drift, 43, 57 - drift);
    camera.lookAt(-9, 0.8, 0);
  }

  function update(dt, time) {
    for (let i = healthBars.length - 1; i >= 0; i--) {
      const bar = healthBars[i];
      if (!bar.parent || !bar.parent.parent) {
        // Newly created models may not be added until the caller's next step.
        // Once attached, a detached bar belongs to a removed unit or tower.
        if (bar.userData.wasAttached) healthBars.splice(i, 1);
        continue;
      }
      bar.userData.wasAttached = true;
      bar.quaternion.copy(camera.quaternion);
      // Counteract the unit's heading so bars always face the viewer.
      const worldQuaternion = new THREE.Quaternion();
      bar.parent.getWorldQuaternion(worldQuaternion);
      bar.quaternion.premultiply(worldQuaternion.invert());
    }
    clouds.forEach(cloud => { cloud.position.x = cloud.userData.startX + Math.sin(time * 0.018 + cloud.userData.phase) * 3; });
    waterSparkles.forEach((sparkle, i) => {
      sparkle.position.x += dt * 0.15;
      if (sparkle.position.x > 24) sparkle.position.x = -24;
      sparkle.scale.x = (0.4 + Math.sin(time * 1.7 + sparkle.userData.seed) * 0.25) * (i % 3 + 1);
    });
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.age += dt;
      if (effect.age >= effect.life) {
        scene.remove(effect.group);
        effect.group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
        (effect.materials || [effect.mat]).forEach(mat => mat.dispose());
        effects.splice(i, 1);
        continue;
      }
      if (effect.update) {
        effect.update();
        continue;
      }
      const progress = effect.age / effect.life;
      effect.mat.opacity = 1 - progress;
      effect.ring.scale.setScalar(0.15 + progress * 2.5);
      for (const particle of effect.particles) {
        particle.position.addScaledVector(particle.userData.velocity, dt);
        particle.userData.velocity.y -= dt * 6;
        particle.rotation.x += dt * 3;
        particle.scale.setScalar(1 - progress * 0.7);
      }
    }
  }

  function resize() {
    const width = canvasContainer.clientWidth || window.innerWidth;
    const height = canvasContainer.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function dispose() {
    const geometries = new Set();
    const mats = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(mat => mats.add(mat));
    });
    geometries.forEach(geometry => geometry.dispose());
    mats.forEach(mat => mat.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  setMenuView(0);
  return { scene, camera, renderer, arenaColliders, update, resize, dispose, createUnit, createTower, createRubble, createPlayer, spawnEffect, setMenuView, animateUnit };
}
