import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ============================================================
   Constants & tiny helpers
   ============================================================ */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const FULL_ACCEPT = '.stl,.obj,.ply,.glb,.gltf,.3mf,.fbx,.dae,.dxf,.dwg,.dwf,.step,.stp,.iges,.igs';
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_DXF_SEGMENTS = 450000;
const UNIT_FACTORS = { mm: 1, cm: 10, in: 25.4 };
const DXF_UNIT_SCALE = {
  0: 1,
  1: 25.4,       // inches
  2: 304.8,      // feet
  3: 1609344,    // miles
  4: 1,          // millimeters
  5: 10,         // centimeters
  6: 1000,       // meters
  7: 1000000,    // kilometers
  8: 0.0000254,  // microinches
  9: 0.0254,     // mils
  10: 914.4,     // yards
};

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isSmallScreen = () => window.matchMedia('(max-width: 900px)').matches;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showFatal(message) {
  const overlay = el('div', 'fatal-overlay', message);
  $('viewport').appendChild(overlay);
}

/* ============================================================
   State & presets
   ============================================================ */

const state = {
  activePreset: 'pendant',
  designScale: 1,
  interacting: false,
  showBulb: true,
  wireframe: false,
  showGrid: true,
  shadows: true,
  autoRotate: false,
  showDesign: true,
  imports: [],
  importOptions: {
    autoFit: true,
    targetSize: 140,
    units: 'auto',
    layFlat: true,
  },
};

const PRESETS = {
  pendant: {
    name: 'Pendant',
    icon: '◒',
    desc: 'Ribbed pendant',
    sliders: { height: 180, rBot: 75, rTop: 55, bulge: 20, ribs: 28, ribDepth: 4.5, twist: 120, vFreq: 2, vAmp: 4, wall: 1.6, spokes: 4 },
    selects: { printMode: 'shell', socketPreset: '41' },
    checks: { closeBottom: false, closeTop: false },
  },
  dome: {
    name: 'Dome',
    icon: '⌒',
    desc: 'Wide dome',
    sliders: { height: 120, rBot: 92, rTop: 34, bulge: 14, ribs: 36, ribDepth: 2.6, twist: 0, vFreq: 1.5, vAmp: 0, wall: 1.6, spokes: 4 },
    selects: { printMode: 'shell', socketPreset: '41' },
    checks: { closeBottom: false, closeTop: false },
  },
  cone: {
    name: 'Cone',
    icon: '△',
    desc: 'Slim cone',
    sliders: { height: 220, rBot: 78, rTop: 28, bulge: -6, ribs: 0, ribDepth: 0, twist: 0, vFreq: 1, vAmp: 0, wall: 1.6, spokes: 4 },
    selects: { printMode: 'shell', socketPreset: '29' },
    checks: { closeBottom: false, closeTop: false },
  },
  pleated: {
    name: 'Pleated',
    icon: '⁂',
    desc: 'Fine pleats',
    sliders: { height: 150, rBot: 72, rTop: 60, bulge: 10, ribs: 64, ribDepth: 5.5, twist: 0, vFreq: 1, vAmp: 0, wall: 1.2, spokes: 6 },
    selects: { printMode: 'shell', socketPreset: '41' },
    checks: { closeBottom: false, closeTop: false },
  },
  vase: {
    name: 'Vase',
    icon: '◍',
    desc: 'Spiral vase',
    sliders: { height: 240, rBot: 46, rTop: 34, bulge: 26, ribs: 26, ribDepth: 3, twist: 220, vFreq: 3, vAmp: 3, wall: 1.2, spokes: 4 },
    selects: { printMode: 'vase', socketPreset: '0' },
    checks: { closeBottom: true, closeTop: false },
  },
  planter: {
    name: 'Planter',
    icon: '⌾',
    desc: 'Open cup',
    sliders: { height: 140, rBot: 52, rTop: 68, bulge: -2, ribs: 0, ribDepth: 0, twist: 0, vFreq: 1, vAmp: 0, wall: 2, spokes: 4 },
    selects: { printMode: 'shell', socketPreset: '0' },
    checks: { closeBottom: true, closeTop: false },
  },
};

const LABELS = {
  height: (v) => `${Math.round(v)} mm`,
  rBot: (v) => `${Math.round(v)} mm`,
  rTop: (v) => `${Math.round(v)} mm`,
  bulge: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} mm`,
  scale: (v) => `${Math.round(v)}%`,
  ribs: (v) => `${Math.round(v)}`,
  ribDepth: (v) => `${v.toFixed(1)} mm`,
  twist: (v) => `${Math.round(v)}°`,
  vFreq: (v) => v.toFixed(1),
  vAmp: (v) => `${v.toFixed(1)} mm`,
  wall: (v) => `${v.toFixed(1)} mm`,
  spokes: (v) => `${Math.round(v)}`,
  importSize: (v) => `${Math.round(v)} mm`,
};

const DESIGN_SLIDERS = ['height', 'rBot', 'rTop', 'bulge', 'ribs', 'ribDepth', 'twist', 'vFreq', 'vAmp', 'wall', 'spokes'];

/* ============================================================
   Renderer, scene, camera
   ============================================================ */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
} catch (error) {
  showFatal('WebGL could not start. Enable hardware acceleration or use a recent version of Chrome, Edge, Firefox, or Safari.');
  throw error;
}

const canvasHost = $('canvasHost');
const viewportEl = $('viewport');

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(1, 1, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', 'Interactive 3D viewport');
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 9000);
camera.position.set(250, 200, 390);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.9;
controls.zoomSpeed = 0.95;
controls.panSpeed = 0.9;
controls.screenSpacePanning = true;
controls.minDistance = 10;
controls.maxDistance = 6000;
controls.maxPolarAngle = Math.PI * 0.496;
controls.autoRotateSpeed = 0.9;
controls.target.set(0, 90, 0);

/* Environment + lights */

try {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTarget = pmrem.fromScene(room, 0.04);
  scene.environment = envTarget.texture;
  if (typeof room.dispose === 'function') room.dispose();
  pmrem.dispose();
} catch (error) {
  console.warn('Environment lighting unavailable:', error);
}

const hemiLight = new THREE.HemisphereLight(0xc5d8ff, 0x17130d, 0.7);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfff3df, 2.0);
keyLight.position.set(260, 360, 200);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(isSmallScreen() ? 1024 : 2048, isSmallScreen() ? 1024 : 2048);
keyLight.shadow.camera.near = 10;
keyLight.shadow.camera.far = 2200;
keyLight.shadow.camera.left = -700;
keyLight.shadow.camera.right = 700;
keyLight.shadow.camera.top = 700;
keyLight.shadow.camera.bottom = -700;
keyLight.shadow.camera.updateProjectionMatrix();
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.6;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8fb7ff, 0.55);
fillLight.position.set(-280, 150, -180);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffb066, 0.32);
rimLight.position.set(40, 130, -320);
scene.add(rimLight);

/* Ground shadow catcher + grid */

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(5000, 5000),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.34 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.06;
ground.receiveShadow = true;
ground.userData.noExport = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(360, 36, 0x59657a, 0x2a303b);
gridHelper.position.y = -0.02;
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.62;
gridHelper.material.depthWrite = false;
gridHelper.userData.noExport = true;
scene.add(gridHelper);

/* ============================================================
   Materials & design object
   ============================================================ */

const shadeMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff4e2,
  roughness: 0.48,
  metalness: 0.0,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.94,
  depthWrite: true,
  emissive: 0xffa64d,
  emissiveIntensity: 0.055,
});

const fitterMaterial = new THREE.MeshStandardMaterial({
  color: 0x343b46,
  roughness: 0.36,
  metalness: 0.82,
});

const bulbMaterial = new THREE.MeshBasicMaterial({
  color: 0xffd38a,
  toneMapped: false,
});

const bulbGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xffae4d,
  transparent: true,
  opacity: 0.16,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const designRoot = new THREE.Group();
const designScaleGroup = new THREE.Group();
designRoot.add(designScaleGroup);
scene.add(designRoot);

const shadeMesh = new THREE.Mesh(new THREE.BufferGeometry(), shadeMaterial);
shadeMesh.castShadow = true;
shadeMesh.receiveShadow = true;
designScaleGroup.add(shadeMesh);

const fitterGroup = new THREE.Group();
designScaleGroup.add(fitterGroup);

const bulbGroup = new THREE.Group();
const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(10.5, 24, 18), bulbMaterial);
const bulbGlow = new THREE.Mesh(new THREE.SphereGeometry(17, 24, 18), bulbGlowMaterial);
bulbMesh.userData.noExport = true;
bulbGlow.userData.noExport = true;
const bulbLight = new THREE.PointLight(0xffb15c, 980, 600, 2);
bulbGroup.add(bulbMesh, bulbGlow, bulbLight);
designScaleGroup.add(bulbGroup);

const designItem = {
  id: 'design',
  kind: 'design',
  name: 'Design',
  root: designRoot,
  scaleGroup: designScaleGroup,
  visible: true,
  userScale: 1,
};

const sceneItems = [designItem];

let lastParams = null;
let lastGeometryKey = '';
let designTriangles = 0;

/* ============================================================
   Parametric geometry
   ============================================================ */

function profileRadius(v, p) {
  return p.rBot + (p.rTop - p.rBot) * v + p.bulge * Math.sin(Math.PI * v);
}

function shadedRadius(v, theta, p) {
  let r = profileRadius(v, p) + p.vAmp * Math.sin(TAU * p.vFreq * v);
  if (p.ribs > 0 && p.ribDepth !== 0) {
    const ang = theta + p.twistRad * v;
    r += p.ribDepth * (0.5 + 0.5 * Math.cos(p.ribs * ang));
  }
  return Math.max(1.5, r);
}

function resolutionFor(p) {
  const small = isSmallScreen();
  const baseU = p.ribs > 0 ? 96 + p.ribs * 4 : 160;
  const baseV = 84 + p.height * 0.22;
  const dragQuality = state.interacting ? 0.58 : 1;
  const deviceQuality = small ? 0.74 : 1;
  return {
    segU: Math.round(clamp(baseU * dragQuality * deviceQuality, 48, 384)),
    segV: Math.round(clamp(baseV * dragQuality * deviceQuality, 28, 140)),
  };
}

function buildShadeGeometry(p) {
  const { segU, segV } = resolutionFor(p);
  const positions = [];
  const indices = [];
  const isVase = p.printMode === 'vase';

  const vStartIn = isVase ? 1 : (p.closeBottom ? clamp(p.wall / Math.max(p.height, 1), 0.004, 0.35) : 0);
  const vEndIn = isVase ? 1 : (p.closeTop ? clamp(1 - p.wall / Math.max(p.height, 1), 0.65, 0.996) : 1);

  function pointAt(v, theta, offset) {
    const ang = theta + p.twistRad * v;
    const r = Math.max(1.2, shadedRadius(v, theta, p) - offset);
    return [Math.cos(ang) * r, v * p.height, Math.sin(ang) * r];
  }

  function addRing(v, offset) {
    const base = positions.length / 3;
    for (let i = 0; i < segU; i++) {
      const [x, y, z] = pointAt(v, (i / segU) * TAU, offset);
      positions.push(x, y, z);
    }
    return base;
  }

  function addGrid(vAt, offset) {
    const base = positions.length / 3;
    for (let j = 0; j <= segV; j++) {
      const v = vAt(j / segV);
      for (let i = 0; i < segU; i++) {
        const [x, y, z] = pointAt(v, (i / segU) * TAU, offset);
        positions.push(x, y, z);
      }
    }
    return base;
  }

  function addGridIndices(base, flip) {
    for (let j = 0; j < segV; j++) {
      for (let i = 0; i < segU; i++) {
        const a = base + j * segU + i;
        const b = base + j * segU + ((i + 1) % segU);
        const c = base + (j + 1) * segU + ((i + 1) % segU);
        const d = base + (j + 1) * segU + i;
        if (flip) indices.push(a, b, d, b, c, d);
        else indices.push(a, d, b, b, d, c);
      }
    }
  }

  function addFan(v, offset, facingUp) {
    const base = addRing(v, offset);
    const center = positions.length / 3;
    positions.push(0, v * p.height, 0);
    for (let i = 0; i < segU; i++) {
      const a = base + i;
      const b = base + ((i + 1) % segU);
      if (facingUp) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }

  function addAnnulus(v, innerOffset, facingUp) {
    const outerBase = addRing(v, 0);
    const innerBase = addRing(v, innerOffset);
    for (let i = 0; i < segU; i++) {
      const a = outerBase + i;
      const b = outerBase + ((i + 1) % segU);
      const c = innerBase + i;
      const d = innerBase + ((i + 1) % segU);
      if (facingUp) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }

  // Outer wall
  const outerBase = addGrid((t) => t, 0);
  addGridIndices(outerBase, false);

  // Inner wall
  if (!isVase) {
    const innerBase = addGrid((t) => vStartIn + (vEndIn - vStartIn) * t, p.wall);
    addGridIndices(innerBase, true);
  }

  // Caps and rims
  if (isVase) {
    if (p.closeBottom) addFan(0, 0, false);
    if (p.closeTop) addFan(1, 0, true);
  } else {
    if (p.closeBottom) {
      addFan(0, 0, false);
      addFan(vStartIn, p.wall, true);
    } else {
      addAnnulus(0, p.wall, false);
    }
    if (p.closeTop) {
      addFan(1, 0, true);
      addFan(vEndIn, p.wall, false);
    } else {
      addAnnulus(1, p.wall, true);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function clearGroup(group) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    group.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
}

function rebuildFitter(p) {
  clearGroup(fitterGroup);

  if (p.socketId <= 0 || p.printMode === 'vase') {
    fitterGroup.visible = false;
    return;
  }
  fitterGroup.visible = true;

  const ringInner = p.socketId / 2;
  const ringOuter = ringInner + 4;
  let rimR = Infinity;
  for (let i = 0; i < 72; i++) {
    rimR = Math.min(rimR, shadedRadius(1, (i / 72) * TAU, p) - p.wall);
  }
  rimR = Math.max(ringInner + 1, rimR);

  const thickness = 1.8;
  const y = Math.max(thickness, p.height - thickness);

  const shape = new THREE.Shape();
  shape.absarc(0, 0, ringOuter, 0, TAU, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, ringInner, 0, TAU, true);
  shape.holes.push(hole);

  const ringGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 64,
    steps: 1,
  });
  ringGeometry.rotateX(-Math.PI / 2);
  ringGeometry.translate(0, y, 0);

  const ringMesh = new THREE.Mesh(ringGeometry, fitterMaterial);
  ringMesh.castShadow = true;
  ringMesh.receiveShadow = true;
  fitterGroup.add(ringMesh);

  const spokeLength = rimR - ringOuter;
  if (spokeLength > 3) {
    const spokeWidth = clamp(ringInner * 0.08, 2.2, 3.6);
    for (let i = 0; i < p.spokes; i++) {
      const angle = (i / p.spokes) * TAU + Math.PI / p.spokes;
      const spokeGeometry = new THREE.BoxGeometry(spokeLength, thickness, spokeWidth);
      const mid = ringOuter + spokeLength / 2;
      const matrix = new THREE.Matrix4().makeRotationY(angle);
      matrix.setPosition(Math.cos(angle) * mid, y + thickness / 2, -Math.sin(angle) * mid);
      spokeGeometry.applyMatrix4(matrix);

      const spokeMesh = new THREE.Mesh(spokeGeometry, fitterMaterial);
      spokeMesh.castShadow = true;
      spokeMesh.receiveShadow = true;
      fitterGroup.add(spokeMesh);
    }
  }
}

/* ============================================================
   Design state updates
   ============================================================ */

function readParams() {
  const n = (id) => parseFloat($(id).value);
  const twist = n('twist');
  return {
    height: n('height'),
    rBot: n('rBot'),
    rTop: n('rTop'),
    bulge: n('bulge'),
    ribs: Math.round(n('ribs')),
    ribDepth: n('ribDepth'),
    twist,
    twistRad: twist * DEG,
    vFreq: n('vFreq'),
    vAmp: n('vAmp'),
    wall: n('wall'),
    spokes: Math.round(n('spokes')),
    socketId: parseFloat($('socketPreset').value),
    printMode: $('printMode').value,
    closeBottom: $('closeBottom').checked,
    closeTop: $('closeTop').checked,
  };
}

function updateShadeAppearance() {
  shadeMaterial.wireframe = state.wireframe;
  shadeMaterial.emissiveIntensity = state.showBulb ? 0.055 : 0;
}

function applyBulbLighting(p) {
  // World units are millimeters, so point-light falloff must be scaled by the
  // model size as well as the user scale to keep the warm glow consistent.
  const scale = Math.max(0.2, state.designScale);
  const height = Math.max(p.height, 40);
  bulbLight.intensity = state.showBulb ? 0.22 * height * height * scale * scale : 0;
  bulbLight.distance = Math.max(300, height * 3) * scale;
}

function applyDesignScale() {
  designScaleGroup.scale.setScalar(state.designScale);
  if (lastParams) applyBulbLighting(lastParams);
}

function updateBulb(p) {
  bulbGroup.position.y = p.height * 0.46;
  bulbGroup.visible = state.showBulb;
  applyBulbLighting(p);
  shadeMaterial.emissiveIntensity = state.showBulb ? 0.055 : 0;
}

function updateStats(p) {
  const preset = state.activePreset ? PRESETS[state.activePreset] : null;
  $('statsTitle').textContent = `${preset ? preset.name : 'Custom design'} · ${Math.round(state.designScale * 100)}%`;

  let meta = `${designTriangles.toLocaleString()} tris`;
  try {
    shadeMesh.geometry.computeBoundingBox();
    const bb = shadeMesh.geometry.boundingBox;
    if (bb && !bb.isEmpty()) {
      const size = bb.getSize(new THREE.Vector3());
      const s = state.designScale;
      meta = `${Math.round(size.y * s)} × ${Math.round(size.x * s)} × ${Math.round(size.z * s)} mm · ${meta}`;
    }
  } catch (error) {
    /* geometry not ready yet */
  }
  $('statsMeta').textContent = meta;

  const mode = p.printMode === 'vase' ? 'Vase surface' : 'Hollow shell';
  const fitter = p.printMode !== 'vase' && p.socketId > 0 ? `${p.socketId} mm fitter` : 'no fitter';
  $('exportMeta').textContent = `${mode} · ${fitter} · mm`;
}

function rebuildDesign(force = false) {
  const p = readParams();
  lastParams = p;

  const res = resolutionFor(p);
  const key = JSON.stringify({
    height: p.height,
    rBot: p.rBot,
    rTop: p.rTop,
    bulge: p.bulge,
    ribs: p.ribs,
    ribDepth: p.ribDepth,
    twistRad: p.twistRad,
    vFreq: p.vFreq,
    vAmp: p.vAmp,
    wall: p.wall,
    socketId: p.socketId,
    printMode: p.printMode,
    closeBottom: p.closeBottom,
    closeTop: p.closeTop,
    spokes: p.spokes,
    segU: res.segU,
    segV: res.segV,
  });

  if (force || key !== lastGeometryKey) {
    lastGeometryKey = key;
    const geometry = buildShadeGeometry(p);
    shadeMesh.geometry.dispose();
    shadeMesh.geometry = geometry;
    designTriangles = geometry.index
      ? Math.floor(geometry.index.count / 3)
      : Math.floor(geometry.attributes.position.count / 3);
    rebuildFitter(p);
  }

  applyDesignScale();
  updateShadeAppearance();
  updateBulb(p);
  updateStats(p);
  scheduleLayout();
}

let rebuildQueued = false;
let rebuildForce = false;

function scheduleRebuild(force = false) {
  rebuildForce = rebuildForce || force;
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    const shouldForce = rebuildForce;
    rebuildForce = false;
    rebuildDesign(shouldForce);
  });
}

/* ============================================================
   Layout and camera
   ============================================================ */

let layoutQueued = false;

function scheduleLayout() {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    layoutItems();
  });
}

function layoutItems() {
  const visible = sceneItems.filter((item) => item.root.visible);
  if (!visible.length) return;

  const gap = 34;
  const measurements = visible.map((item) => {
    item.root.position.set(0, 0, 0);
    item.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(item.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return {
      item,
      width: Math.max(size.x, 0.01),
      centerX: Number.isFinite(center.x) ? center.x : 0,
    };
  });

  const totalWidth = measurements.reduce((sum, m) => sum + m.width, 0) + gap * (measurements.length - 1);
  let cursor = -totalWidth / 2;

  for (const m of measurements) {
    m.item.root.position.x = cursor + m.width / 2 - m.centerX;
    cursor += m.width + gap;
  }

  for (const item of sceneItems) {
    if (!item.root.visible) item.root.position.set(0, 0, 0);
  }
}

let cameraTween = null;

function computeVisibleBox() {
  const box = new THREE.Box3();
  let hasContent = false;

  for (const item of sceneItems) {
    if (!item.root.visible) continue;
    item.root.updateWorldMatrix(true, true);
    const itemBox = new THREE.Box3().setFromObject(item.root);
    if (!itemBox.isEmpty()) {
      box.union(itemBox);
      hasContent = true;
    }
  }

  return hasContent ? box : null;
}

function frameBox(box, animate = true, direction = null) {
  if (!box || box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.5);

  const vFov = camera.fov * DEG;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.01));
  const fov = Math.min(vFov, hFov);
  const distance = (radius / Math.sin(fov / 2)) * 1.12;

  let dir;
  if (direction) {
    dir = direction.clone();
  } else {
    dir = new THREE.Vector3().subVectors(camera.position, controls.target);
  }
  if (dir.lengthSq() < 1e-8) dir.set(0.55, 0.4, 0.75);
  dir.normalize();

  const toPosition = center.clone().add(dir.multiplyScalar(distance));
  toPosition.y = Math.max(toPosition.y, 4);

  controls.minDistance = Math.max(radius * 0.07, 2);
  controls.maxDistance = Math.max(radius * 20, 5000);

  if (!animate || reducedMotion()) {
    camera.position.copy(toPosition);
    controls.target.copy(center);
    controls.update();
    cameraTween = null;
    return;
  }

  cameraTween = {
    fromPosition: camera.position.clone(),
    toPosition,
    fromTarget: controls.target.clone(),
    toTarget: center.clone(),
    t: 0,
    duration: 0.5,
  };
}

function updateCameraTween(dt) {
  if (!cameraTween) return;
  cameraTween.t += dt / cameraTween.duration;
  const t = Math.min(1, cameraTween.t);
  const eased = 1 - Math.pow(1 - t, 3);

  camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
  controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);

  if (t >= 1) cameraTween = null;
}

function fitView(animate = true) {
  const box = computeVisibleBox();
  if (box) frameBox(box, animate);
}

function focusItem(item, animate = true) {
  if (!item || !item.root || !item.root.visible) return;
  item.root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(item.root);
  if (!box.isEmpty()) frameBox(box, animate);
}

function resetView() {
  const box = computeVisibleBox();
  if (box) {
    frameBox(box, true, new THREE.Vector3(0.55, 0.38, 0.74));
  } else {
    camera.position.set(250, 200, 390);
    controls.target.set(0, 90, 0);
    controls.update();
  }
  setAutoRotate(false);
}

/* ============================================================
   UI: sliders, presets, tabs
   ============================================================ */

function updateRangeFill(input) {
  if (!input) return;
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max !== safeMin ? max : 100;
  const percent = ((value - safeMin) / (safeMax - safeMin)) * 100;
  input.style.setProperty('--fill', `${clamp(percent, 0, 100)}%`);
}

function updateSliderUI(input) {
  if (!input) return;
  updateRangeFill(input);
  const output = $(`v-${input.id}`);
  const format = LABELS[input.id];
  if (output && format) output.textContent = format(parseFloat(input.value));
}

function markCustom() {
  if (state.activePreset === null) return;
  state.activePreset = null;
  syncPresetCards();
}

const presetButtons = new Map();

function renderPresets() {
  const grid = $('presetGrid');
  const fragment = document.createDocumentFragment();

  for (const [key, preset] of Object.entries(PRESETS)) {
    const button = el('button', 'preset-card');
    button.type = 'button';
    button.dataset.preset = key;
    button.setAttribute('aria-pressed', 'false');

    button.append(
      el('span', 'preset-icon', preset.icon),
      el('span', 'preset-name', preset.name),
      el('span', 'preset-desc', preset.desc)
    );

    button.addEventListener('click', () => applyPreset(key));

    presetButtons.set(key, button);
    fragment.appendChild(button);
  }

  grid.appendChild(fragment);
}

function syncPresetCards() {
  for (const [key, button] of presetButtons) {
    const active = state.activePreset === key;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function syncShellOptions() {
  const p = readParams();
  const isVase = p.printMode === 'vase';
  $('shellOptions').hidden = isVase;

  if (isVase) {
    $('modeHint').textContent = 'Vase mode exports a single-wall surface. Enable “Close bottom” for a printable base.';
  } else if (p.socketId > 0) {
    $('modeHint').textContent = `Hollow shell with a ${p.socketId} mm socket fitter. Export is a watertight wall.`;
  } else {
    $('modeHint').textContent = 'Hollow shell with an open top. Export is a watertight wall.';
  }
}

function applyPreset(key, silent = false) {
  const preset = PRESETS[key];
  if (!preset) return;

  state.activePreset = key;

  for (const [id, value] of Object.entries(preset.sliders)) {
    const input = $(id);
    if (!input) continue;
    input.value = String(value);
    updateSliderUI(input);
  }

  for (const [id, value] of Object.entries(preset.selects)) {
    const input = $(id);
    if (input) input.value = value;
  }

  for (const [id, value] of Object.entries(preset.checks)) {
    const input = $(id);
    if (input) input.checked = value;
  }

  state.designScale = 1;
  $('scale').value = '100';
  updateSliderUI($('scale'));

  syncPresetCards();
  syncShellOptions();
  rebuildDesign(true);

  requestAnimationFrame(() => focusItem(designItem, true));

  if (!silent) toast(`${preset.name} preset loaded`);
}

function initTabs() {
  $$('.tab').forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
  });

  $$('.tab').forEach((button) => {
    button.tabIndex = button.classList.contains('is-active') ? 0 : -1;
  });
}

function setTab(name) {
  $$('.tab').forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });

  $$('.tab-panel').forEach((panel) => {
    panel.hidden = panel.id !== `panel-${name}`;
  });
}

function initDesignControls() {
  for (const id of [...DESIGN_SLIDERS, 'scale']) {
    const input = $(id);
    if (!input) continue;
    updateSliderUI(input);

    input.addEventListener('input', () => {
      updateSliderUI(input);

      if (id === 'scale') {
        state.designScale = clamp(parseFloat(input.value) / 100, 0.05, 10);
        applyDesignScale();
        if (lastParams) updateStats(lastParams);
        scheduleLayout();
      } else {
        markCustom();
        scheduleRebuild(false);
      }
    });

    input.addEventListener('change', () => {
      state.interacting = false;
      if (id !== 'scale') scheduleRebuild(true);
    });

    if (id !== 'scale') {
      input.addEventListener('pointerdown', () => {
        state.interacting = true;
      });
    }
  }

  for (const id of ['printMode', 'socketPreset']) {
    const input = $(id);
    if (!input) continue;
    input.addEventListener('change', () => {
      markCustom();
      syncShellOptions();
      scheduleRebuild(true);
    });
  }

  for (const id of ['closeBottom', 'closeTop']) {
    const input = $(id);
    if (!input) continue;
    input.addEventListener('change', () => {
      markCustom();
      scheduleRebuild(true);
    });
  }

  window.addEventListener('pointerup', () => {
    if (!state.interacting) return;
    state.interacting = false;
    scheduleRebuild(true);
  });

  window.addEventListener('keyup', (event) => {
    if (state.interacting && event.target instanceof HTMLInputElement && event.target.type === 'range') {
      state.interacting = false;
      scheduleRebuild(true);
    }
  });
}

/* ============================================================
   UI: view toggles
   ============================================================ */

function setGrid(value) {
  state.showGrid = Boolean(value);
  gridHelper.visible = state.showGrid;
  const checkbox = $('gridToggle');
  if (checkbox) checkbox.checked = state.showGrid;
  const button = $('tbGrid');
  if (button) {
    button.classList.toggle('is-active', state.showGrid);
    button.setAttribute('aria-pressed', String(state.showGrid));
  }
}

function setAutoRotate(value) {
  state.autoRotate = Boolean(value);
  controls.autoRotate = state.autoRotate;
  const checkbox = $('autoRotateToggle');
  if (checkbox) checkbox.checked = state.autoRotate;
  const button = $('tbRotate');
  if (button) {
    button.classList.toggle('is-active', state.autoRotate);
    button.setAttribute('aria-pressed', String(state.autoRotate));
  }
}

function setShadows(value) {
  state.shadows = Boolean(value);
  renderer.shadowMap.enabled = state.shadows;
  keyLight.castShadow = state.shadows;

  scene.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material) material.needsUpdate = true;
    }
  });

  const checkbox = $('shadowToggle');
  if (checkbox) checkbox.checked = state.shadows;
}

function setWireframe(value) {
  state.wireframe = Boolean(value);
  updateShadeAppearance();
  const checkbox = $('wireframeToggle');
  if (checkbox) checkbox.checked = state.wireframe;
}

function setBulb(value) {
  state.showBulb = Boolean(value);
  if (lastParams) updateBulb(lastParams);
  const checkbox = $('bulbToggle');
  if (checkbox) checkbox.checked = state.showBulb;
}

function initViewControls() {
  $('showDesign').addEventListener('change', (event) => {
    state.showDesign = event.target.checked;
    designItem.visible = state.showDesign;
    designRoot.visible = state.showDesign;
    scheduleLayout();
    if (state.showDesign) requestAnimationFrame(() => focusItem(designItem, true));
  });

  $('bulbToggle').addEventListener('change', (event) => setBulb(event.target.checked));
  $('wireframeToggle').addEventListener('change', (event) => setWireframe(event.target.checked));
  $('gridToggle').addEventListener('change', (event) => setGrid(event.target.checked));
  $('shadowToggle').addEventListener('change', (event) => setShadows(event.target.checked));
  $('autoRotateToggle').addEventListener('change', (event) => setAutoRotate(event.target.checked));

  $('fitBtn').addEventListener('click', () => fitView(true));
  $('resetViewBtn').addEventListener('click', resetView);
  $('fullscreenBtn').addEventListener('click', toggleFullscreen);
  $('resetAllBtn').addEventListener('click', resetAll);

  $('tbFit').addEventListener('click', () => fitView(true));
  $('tbGrid').addEventListener('click', () => setGrid(!state.showGrid));
  $('tbRotate').addEventListener('click', () => setAutoRotate(!state.autoRotate));
  $('tbFull').addEventListener('click', toggleFullscreen);
}

function resetAll() {
  state.designScale = 1;
  state.showDesign = true;
  designItem.visible = true;
  designRoot.visible = true;
  $('showDesign').checked = true;

  setBulb(true);
  setWireframe(false);
  setGrid(true);
  setShadows(true);
  setAutoRotate(false);

  applyPreset('pendant', true);
  fitView(true);
  toast('Settings reset');
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    toast('Fullscreen is not available in this browser.', 'error');
  }
}

/* ============================================================
   UI: sidebar, dialogs, toasts, loading
   ============================================================ */

function openSidebar() {
  $('sidebar').classList.add('open');
  const backdrop = $('backdrop');
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('show'));
  $('menuBtn').setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  const sidebar = $('sidebar');
  sidebar.classList.remove('open');

  const backdrop = $('backdrop');
  backdrop.classList.remove('show');
  $('menuBtn').setAttribute('aria-expanded', 'false');

  window.setTimeout(() => {
    if (!sidebar.classList.contains('open')) backdrop.hidden = true;
  }, 240);
}

function initSidebar() {
  $('menuBtn').addEventListener('click', () => {
    if ($('sidebar').classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  $('closeSidebar').addEventListener('click', closeSidebar);
  $('backdrop').addEventListener('click', closeSidebar);

  window.addEventListener('resize', () => {
    if (!isSmallScreen() && $('sidebar').classList.contains('open')) closeSidebar();
    resize();
  });

  window.addEventListener('orientationchange', () => {
    window.setTimeout(resize, 160);
  });
}

function toast(message, type = 'info', duration = 3400) {
  const container = $('toasts');
  const node = el('div', `toast ${type}`, message);
  container.appendChild(node);

  while (container.children.length > 4) {
    container.removeChild(container.firstElementChild);
  }

  requestAnimationFrame(() => node.classList.add('show'));

  window.setTimeout(() => {
    node.classList.remove('show');
    window.setTimeout(() => node.remove(), 280);
  }, duration);
}

let loadingCount = 0;

function showLoading(text) {
  loadingCount += 1;
  $('loadingText').textContent = text;
  $('loading').classList.add('show');
  $('loading').setAttribute('aria-hidden', 'false');
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) {
    $('loading').classList.remove('show');
    $('loading').setAttribute('aria-hidden', 'true');
  }
}

let pendingFileAccept = FULL_ACCEPT;

function showInfoDialog(title, paragraphs, code = '', options = {}) {
  const dialog = $('infoDialog');
  $('dialogTitle').textContent = title;

  const body = $('dialogBody');
  body.replaceChildren();

  for (const paragraph of paragraphs || []) {
    body.appendChild(el('p', '', paragraph));
  }

  if (code) {
    const pre = document.createElement('pre');
    pre.textContent = code;
    body.appendChild(pre);
  }

  pendingFileAccept = options.accept || FULL_ACCEPT;
  $('dialogChooseFile').hidden = options.chooseFile === false;

  if (dialog.open) dialog.close();
  dialog.showModal();
}

function initDialogs() {
  $('dialogChooseFile').addEventListener('click', () => {
    $('infoDialog').close();
    $('fileInput').accept = pendingFileAccept;
    $('fileInput').click();
    window.setTimeout(() => {
      $('fileInput').accept = FULL_ACCEPT;
    }, 0);
  });

  $('formatHelpBtn').addEventListener('click', showFormatGuide);
  $('dwgHelpBtn').addEventListener('click', showDwgGuide);
}

/* ============================================================
   Camera resize & render loop
   ============================================================ */

function resize() {
  const width = canvasHost.clientWidth;
  const height = canvasHost.clientHeight;
  if (!width || !height) return;

  const ratio = Math.min(window.devicePixelRatio || 1, isSmallScreen() ? 1.75 : 2);
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvasHost);

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
}

const clock = new THREE.Clock();

function animateFrame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateCameraTween(dt);
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animateFrame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    renderer.setAnimationLoop(null);
  } else {
    clock.getDelta();
    renderer.setAnimationLoop(animateFrame);
  }
});

controls.addEventListener('start', () => {
  cameraTween = null;
});

/* ============================================================
   Import pipeline
   ============================================================ */

class ImportDialogError extends Error {
  constructor(title, paragraphs, code = '', options = {}) {
    super(title);
    this.name = 'ImportDialogError';
    this.title = title;
    this.paragraphs = paragraphs;
    this.code = code;
    this.options = options;
  }
}

const IMPORT_COLORS = [0x9fc3ff, 0xc3b5ff, 0x8fe0c8, 0xffc48a, 0xff9fb6, 0xa8d8ff];
let importColorIndex = 0;
let nextImportId = 1;

function nextImportColor() {
  const color = IMPORT_COLORS[importColorIndex % IMPORT_COLORS.length];
  importColorIndex += 1;
  return color;
}

function makeImportMaterial(vertexColors = false) {
  return new THREE.MeshStandardMaterial({
    color: vertexColors ? 0xffffff : nextImportColor(),
    vertexColors,
    roughness: 0.48,
    metalness: 0.1,
  });
}

function prepareLoadedObject(object) {
  const removable = [];

  object.traverse((child) => {
    if (child.isLight || child.isCamera) {
      removable.push(child);
      return;
    }
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material && 'envMapIntensity' in material) material.envMapIntensity = 0.85;
      }
    }
    if (child.isLine || child.isLineSegments || child.isPoints) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });

  // Imported scenes should not override the studio lighting.
  for (const child of removable) {
    if (child.parent) child.parent.remove(child);
  }
}

async function importSTL(file) {
  const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
  const buffer = await file.arrayBuffer();
  const geometry = new STLLoader().parse(buffer);

  if (!geometry || !geometry.attributes.position || geometry.attributes.position.count === 0) {
    throw new Error('No triangles were found in this STL.');
  }
  if (!geometry.attributes.normal) geometry.computeVertexNormals();

  return {
    object: new THREE.Mesh(geometry, makeImportMaterial(false)),
    ext: 'stl',
    unitScale: 1,
  };
}

async function importOBJ(file) {
  const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
  const group = new OBJLoader().parse(await file.text());

  const material = makeImportMaterial(false);
  let meshCount = 0;

  group.traverse((child) => {
    if (!child.isMesh) return;
    meshCount += 1;
    child.material = material;
    if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
  });

  if (!meshCount) throw new Error('No meshes were found in this OBJ.');

  return { object: group, ext: 'obj', unitScale: 1 };
}

async function importPLY(file) {
  const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
  const geometry = new PLYLoader().parse(await file.arrayBuffer());

  if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
    throw new Error('No vertices were found in this PLY.');
  }
  if (!geometry.attributes.normal) geometry.computeVertexNormals();

  const hasVertexColors = Boolean(geometry.attributes.color);
  return {
    object: new THREE.Mesh(geometry, makeImportMaterial(hasVertexColors)),
    ext: 'ply',
    unitScale: 1,
  };
}

async function importGLTF(file, ext) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const data = ext === 'gltf' ? await file.text() : await file.arrayBuffer();

  let gltf;
  try {
    gltf = await new Promise((resolve, reject) => {
      try {
        loader.parse(data, '', resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    if (ext === 'gltf') {
      throw new ImportDialogError(
        'This .gltf could not be loaded',
        [
          'A .gltf file that references external .bin or texture files cannot resolve those files from a file picker.',
          'Export a single-file .glb instead, or embed the buffers and textures as data URIs inside the .gltf.',
        ]
      );
    }
    throw error;
  }

  const object = gltf.scene || (gltf.scenes && gltf.scenes[0]);
  if (!object) throw new Error('This glTF contains no scene.');

  return { object, ext, unitScale: 1000 };
}

async function import3MF(file) {
  const { ThreeMFLoader } = await import('three/addons/loaders/3MFLoader.js');
  const group = new ThreeMFLoader().parse(await file.arrayBuffer());

  if (!group || !group.children.length) throw new Error('No geometry was found in this 3MF.');

  return { object: group, ext: '3mf', unitScale: 1 };
}

async function importFBX(file) {
  const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
  const object = new FBXLoader().parse(await file.arrayBuffer(), '');

  if (!object) throw new Error('No geometry was found in this FBX.');

  return { object, ext: 'fbx', unitScale: 1 };
}

async function importDAE(file) {
  const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
  const result = new ColladaLoader().parse(await file.text(), '');

  if (!result || !result.scene) throw new Error('No scene was found in this DAE.');

  return { object: result.scene, ext: 'dae', unitScale: 1 };
}

/* STEP / IGES through the optional OpenCascade WASM kernel */

let occtPromise = null;

async function getOcct() {
  if (!occtPromise) {
    const bases = [
      'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/',
      'https://unpkg.com/occt-import-js@0.0.23/dist/',
      'https://cdn.jsdelivr.net/npm/occt-import-js/dist/',
    ];

    occtPromise = (async () => {
      let lastError = null;

      for (const base of bases) {
        try {
          const module = await import(/* @vite-ignore */ `${base}occt-import-js.js`);
          const factory = module.default || module;
          if (typeof factory !== 'function') throw new Error('Unexpected OCCT module shape.');
          return await factory({ locateFile: (path) => base + path });
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError || new Error('The OCCT kernel is unavailable.');
    })().catch((error) => {
      occtPromise = null;
      throw error;
    });
  }

  return occtPromise;
}

async function importOCCT(file, ext) {
  let occt;
  try {
    occt = await getOcct();
  } catch (error) {
    throw new ImportDialogError(
      'STEP / IGES kernel could not load',
      [
        'The OpenCascade WASM kernel is downloaded on first use and could not be reached. Check your connection and try again.',
        'Offline or blocked CDN? Export the part as STL, OBJ, or GLB from your CAD tool and import that instead.',
      ]
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  let result;

  try {
    result = (ext === 'step' || ext === 'stp')
      ? occt.ReadStepFile(buffer, null)
      : occt.ReadIgesFile(buffer, null);
  } catch (error) {
    throw new Error('The CAD kernel could not parse this file.');
  }

  if (!result || !result.meshes || !result.meshes.length) {
    throw new Error('No solids were found in this CAD file.');
  }

  const group = new THREE.Group();

  for (const meshData of result.meshes) {
    const attributes = meshData.attributes || {};
    if (!attributes.position || !attributes.position.array) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(attributes.position.array, 3));

    if (attributes.normal && attributes.normal.array) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(attributes.normal.array, 3));
    } else {
      geometry.computeVertexNormals();
    }

    if (meshData.index && meshData.index.array) {
      geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.index.array, 1));
    }

    let color = new THREE.Color(0xa9c1dd);
    if (Array.isArray(meshData.color) && meshData.color.length >= 3) {
      color = new THREE.Color().setRGB(meshData.color[0], meshData.color[1], meshData.color[2], THREE.SRGBColorSpace);
    }

    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.12 });
    group.add(new THREE.Mesh(geometry, material));
  }

  if (!group.children.length) throw new Error('No drawable solids were found in this CAD file.');

  return { object: group, ext, unitScale: 1 };
}

/* ============================================================
   DXF reader (LINE, polylines, arcs, circles, ellipses,
   splines, faces, and block INSERT expansion)
   ============================================================ */

function groupRecords(tags) {
  const records = [];
  let record = null;

  for (const tag of tags) {
    if (tag.code === 0) {
      if (record) records.push(record);
      record = { type: tag.value.trim().toUpperCase(), tags: [] };
    } else if (record) {
      record.tags.push(tag);
    }
  }

  if (record) records.push(record);
  return records;
}

function tagValue(record, code, fallback = '') {
  for (const tag of record.tags) {
    if (tag.code === code) return tag.value;
  }
  return fallback;
}

function tagNumber(record, code, fallback = 0) {
  const value = parseFloat(tagValue(record, code, ''));
  return Number.isFinite(value) ? value : fallback;
}

function composeTransform(parent, local) {
  return {
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    e: parent.a * local.e + parent.c * local.f + parent.e,
    f: parent.b * local.e + parent.d * local.f + parent.f,
  };
}

function pushTransformed(x, y, transform, out) {
  out.push(
    transform.a * x + transform.c * y + transform.e,
    transform.b * x + transform.d * y + transform.f,
    0
  );
}

function addSegment(x1, y1, x2, y2, transform, out) {
  if (![x1, y1, x2, y2].every(Number.isFinite)) return;
  pushTransformed(x1, y1, transform, out);
  pushTransformed(x2, y2, transform, out);
}

function addPolyline(vertices, closed, transform, out) {
  const clean = vertices.filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
  if (clean.length < 2) return;

  for (let i = 0; i < clean.length - 1; i++) {
    addSegment(clean[i].x, clean[i].y, clean[i + 1].x, clean[i + 1].y, transform, out);
  }
  if (closed) {
    const first = clean[0];
    const last = clean[clean.length - 1];
    addSegment(last.x, last.y, first.x, first.y, transform, out);
  }
}

function addArc(cx, cy, radius, startDegrees, endDegrees, transform, out) {
  if (!Number.isFinite(cx + cy + radius) || radius <= 0) return;

  let start = startDegrees * DEG;
  let end = endDegrees * DEG;
  if (end <= start) end += TAU;

  const span = end - start;
  const steps = Math.max(6, Math.ceil(Math.abs(span) / (TAU / 64)));

  let previousX = cx + radius * Math.cos(start);
  let previousY = cy + radius * Math.sin(start);

  for (let i = 1; i <= steps; i++) {
    const angle = start + span * (i / steps);
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    addSegment(previousX, previousY, x, y, transform, out);
    previousX = x;
    previousY = y;
  }
}

function addEllipse(cx, cy, mx, my, ratio, start, end, transform, out) {
  const major = Math.hypot(mx, my);
  if (!Number.isFinite(major) || major <= 0) return;

  const ux = mx / major;
  const uy = my / major;
  const vx = -uy * ratio;
  const vy = ux * ratio;

  let a0 = start;
  let a1 = end;
  if (a1 <= a0) a1 += TAU;

  const span = a1 - a0;
  const steps = Math.max(8, Math.ceil(Math.abs(span) / (TAU / 72)));

  let previousX = 0;
  let previousY = 0;

  for (let i = 0; i <= steps; i++) {
    const t = a0 + span * (i / steps);
    const x = cx + ux * major * Math.cos(t) + vx * major * Math.sin(t);
    const y = cy + uy * major * Math.cos(t) + vy * major * Math.sin(t);
    if (i > 0) addSegment(previousX, previousY, x, y, transform, out);
    previousX = x;
    previousY = y;
  }
}

function addSpline(points, closed, transform, out) {
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (clean.length < 2) return;

  if (clean.length === 2) {
    addSegment(clean[0].x, clean[0].y, clean[1].x, clean[1].y, transform, out);
    return;
  }

  const curve = new THREE.CatmullRomCurve3(
    clean.map((p) => new THREE.Vector3(p.x, p.y, 0)),
    closed,
    'centripetal'
  );

  const samples = Math.min(1500, Math.max(32, clean.length * 12));
  const sampled = curve.getPoints(samples);

  for (let i = 0; i < sampled.length - 1; i++) {
    addSegment(sampled[i].x, sampled[i].y, sampled[i + 1].x, sampled[i + 1].y, transform, out);
  }
}

function collectSegments(records, blocks, transform, depth, out) {
  for (let i = 0; i < records.length; i++) {
    if (out.length / 6 >= MAX_DXF_SEGMENTS) return;
    const record = records[i];

    switch (record.type) {
      case 'LINE': {
        addSegment(
          tagNumber(record, 10),
          tagNumber(record, 20),
          tagNumber(record, 11),
          tagNumber(record, 21),
          transform,
          out
        );
        break;
      }

      case 'LWPOLYLINE': {
        const vertices = [];
        let current = null;

        for (const tag of record.tags) {
          if (tag.code === 10) {
            if (current) vertices.push(current);
            current = { x: parseFloat(tag.value), y: 0 };
          } else if (tag.code === 20 && current) {
            current.y = parseFloat(tag.value);
          }
        }
        if (current) vertices.push(current);

        const closed = (parseInt(tagValue(record, 70, '0'), 10) & 1) !== 0;
        addPolyline(vertices, closed, transform, out);
        break;
      }

      case 'POLYLINE': {
        const vertices = [];
        let j = i + 1;

        while (j < records.length && records[j].type === 'VERTEX') {
          vertices.push({
            x: tagNumber(records[j], 10),
            y: tagNumber(records[j], 20),
          });
          j += 1;
        }
        if (j < records.length && records[j].type === 'SEQEND') j += 1;
        i = j - 1;

        const closed = (parseInt(tagValue(record, 70, '0'), 10) & 1) !== 0;
        addPolyline(vertices, closed, transform, out);
        break;
      }

      case 'CIRCLE':
        addArc(
          tagNumber(record, 10),
          tagNumber(record, 20),
          tagNumber(record, 40),
          0,
          360,
          transform,
          out
        );
        break;

      case 'ARC':
        addArc(
          tagNumber(record, 10),
          tagNumber(record, 20),
          tagNumber(record, 40),
          tagNumber(record, 50, 0),
          tagNumber(record, 51, 360),
          transform,
          out
        );
        break;

      case 'ELLIPSE':
        addEllipse(
          tagNumber(record, 10),
          tagNumber(record, 20),
          tagNumber(record, 11),
          tagNumber(record, 21),
          tagNumber(record, 40, 1),
          tagNumber(record, 41, 0),
          tagNumber(record, 42, TAU),
          transform,
          out
        );
        break;

      case 'SPLINE': {
        const points = [];
        let current = null;

        for (const tag of record.tags) {
          if (tag.code === 10) {
            if (current) points.push(current);
            current = { x: parseFloat(tag.value), y: 0 };
          } else if (tag.code === 20 && current) {
            current.y = parseFloat(tag.value);
          }
        }
        if (current) points.push(current);

        const closed = (parseInt(tagValue(record, 70, '0'), 10) & 1) !== 0;
        addSpline(points, closed, transform, out);
        break;
      }

      case '3DFACE':
      case 'SOLID':
      case 'TRACE': {
        const corners = [
          [tagNumber(record, 10), tagNumber(record, 20)],
          [tagNumber(record, 11), tagNumber(record, 21)],
          [tagNumber(record, 12), tagNumber(record, 22)],
          [tagNumber(record, 13), tagNumber(record, 23)],
        ];

        if (corners[3][0] === corners[2][0] && corners[3][1] === corners[2][1]) {
          corners.pop();
        }

        for (let k = 0; k < corners.length; k++) {
          const a = corners[k];
          const b = corners[(k + 1) % corners.length];
          addSegment(a[0], a[1], b[0], b[1], transform, out);
        }
        break;
      }

      case 'INSERT': {
        if (depth >= 8) break;

        const name = tagValue(record, 2, '');
        const block = blocks.get(name);
        if (!block) break;

        const ix = tagNumber(record, 10, 0);
        const iy = tagNumber(record, 20, 0);
        const sx = tagNumber(record, 41, 1) || 1;
        const sy = tagNumber(record, 42, 1) || 1;
        const rotation = tagNumber(record, 50, 0) * DEG;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        const a = sx * cos;
        const b = sx * sin;
        const c = -sy * sin;
        const d = sy * cos;

        const local = {
          a,
          b,
          c,
          d,
          e: ix - (a * block.baseX + c * block.baseY),
          f: iy - (b * block.baseX + d * block.baseY),
        };

        collectSegments(block.entities, blocks, composeTransform(transform, local), depth + 1, out);
        break;
      }

      default:
        break;
    }
  }
}

function parseDXF(text) {
  const rawLines = text.split(/\r\n|\r|\n/);
  const tags = [];

  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    const code = parseInt(rawLines[i].trim(), 10);
    if (Number.isNaN(code)) {
      i -= 1;
      continue;
    }
    tags.push({ code, value: rawLines[i + 1] ?? '' });
  }

  let unitScale = 1;
  for (let i = 0; i < tags.length - 1; i++) {
    if (tags[i].code === 9 && tags[i].value.trim() === '$INSUNITS') {
      for (let j = i + 1; j < Math.min(i + 6, tags.length); j++) {
        if (tags[j].code === 70) {
          unitScale = DXF_UNIT_SCALE[parseInt(tags[j].value, 10)] ?? 1;
          break;
        }
      }
      break;
    }
  }

  const sections = new Map();
  let currentSection = null;

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];

    if (tag.code !== 0) {
      if (currentSection) sections.get(currentSection).push(tag);
      continue;
    }

    const value = tag.value.trim().toUpperCase();

    if (value === 'SECTION') {
      let name = 'UNKNOWN';
      for (let j = i + 1; j < Math.min(i + 3, tags.length); j++) {
        if (tags[j].code === 2) {
          name = tags[j].value.trim().toUpperCase();
          break;
        }
      }
      currentSection = name;
      if (!sections.has(name)) sections.set(name, []);
    } else if (value === 'ENDSEC') {
      currentSection = null;
    } else if (currentSection) {
      sections.get(currentSection).push(tag);
    }
  }

  const blockRecords = groupRecords(sections.get('BLOCKS') || []);
  const blocks = new Map();

  for (let i = 0; i < blockRecords.length; i++) {
    const record = blockRecords[i];
    if (record.type !== 'BLOCK') continue;

    const name = tagValue(record, 2, '');
    const baseX = tagNumber(record, 10, 0);
    const baseY = tagNumber(record, 20, 0);
    const entities = [];

    i += 1;
    while (i < blockRecords.length && blockRecords[i].type !== 'ENDBLK') {
      entities.push(blockRecords[i]);
      i += 1;
    }

    if (name) blocks.set(name, { baseX, baseY, entities });
  }

  const entityRecords = groupRecords(sections.get('ENTITIES') || []);
  const segments = [];
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  collectSegments(entityRecords, blocks, identity, 0, segments);

  return { segments, unitScale };
}

async function importDXF(file) {
  const text = await file.text();
  const parsed = parseDXF(text);

  if (!parsed.segments.length) {
    throw new Error('No drawable entities were found in this DXF. Text, dimensions, hatches, and unsupported blocks are skipped.');
  }

  if (parsed.segments.length / 6 >= MAX_DXF_SEGMENTS) {
    toast('Very large drawing — it was simplified for smooth interaction.', 'info', 4600);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(parsed.segments, 3));
  geometry.computeBoundingBox();

  const material = new THREE.LineBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.userData.noExport = true;

  if (state.importOptions.layFlat) lines.rotation.x = -Math.PI / 2;

  return {
    object: lines,
    ext: 'dxf',
    unitScale: parsed.unitScale,
    isDrawing: true,
  };
}

/* ============================================================
   Import dispatching, fitting, layout, list
   ============================================================ */

function showDwgGuide() {
  showInfoDialog(
    'Convert DWG / DWF → DXF',
    [
      'DWG is a proprietary binary CAD format. Browsers cannot safely parse it, so this studio reads DXF (the open exchange format) directly.',
      'Convert the file once with any of the options below, then drop the resulting .dxf into the studio.',
    ],
    [
      '# LibreDWG command line',
      'dwg2dxf "your-part.dwg" -o "your-part.dxf"',
      '',
      '# AutoCAD / BricsCAD / DraftSight',
      'File  →  Save As  →  DXF (R2013 ASCII)',
      '',
      '# ODA File Converter (free GUI)',
      'https://www.opendesign.com/guestfiles/oda_file_converter',
    ].join('\n'),
    { accept: '.dxf' }
  );
}

function showFormatGuide() {
  showInfoDialog(
    'Supported formats',
    [
      'Mesh & scene formats load directly in the browser: STL (binary or ASCII), OBJ, PLY, GLB, single-file GLTF, 3MF, FBX, and DAE.',
      'DXF line drawings load directly, including LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, ELLIPSE, SPLINE, 3DFACE, SOLID, and block INSERT references.',
      'STEP, STP, IGES, and IGS are read by an optional OpenCascade WASM kernel that downloads on first use.',
      'DWG and DWF need a one-time conversion to DXF. OBJ material libraries (.mtl) and external DAE/FBX textures are not loaded from a browser file picker.',
    ],
    ''
  );
}

async function importFile(file) {
  if (!file || !file.size) throw new Error('The file is empty.');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('This file is larger than 200 MB. Export a lighter mesh first.');
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();

  switch (ext) {
    case 'stl': return importSTL(file);
    case 'obj': return importOBJ(file);
    case 'ply': return importPLY(file);
    case 'glb':
    case 'gltf': return importGLTF(file, ext);
    case '3mf': return import3MF(file);
    case 'fbx': return importFBX(file);
    case 'dae': return importDAE(file);
    case 'dxf': return importDXF(file);
    case 'step':
    case 'stp':
    case 'iges':
    case 'igs': return importOCCT(file, ext);
    case 'dwg':
    case 'dwf':
      throw new ImportDialogError(
        'DWG / DWF needs a one-time conversion',
        [
          'DWG is a proprietary binary CAD format. Browsers cannot safely parse it, so this studio reads the open DXF format directly.',
          'Convert the file once using the commands below, then drop the resulting .dxf here.',
        ],
        [
          '# LibreDWG command line',
          'dwg2dxf "your-part.dwg" -o "your-part.dxf"',
          '',
          '# AutoCAD / BricsCAD / DraftSight',
          'File  →  Save As  →  DXF (R2013 ASCII)',
          '',
          '# ODA File Converter (free GUI)',
          'https://www.opendesign.com/guestfiles/oda_file_converter',
        ].join('\n'),
        { accept: '.dxf' }
      );
    default:
      throw new ImportDialogError(
        'Unsupported format',
        [
          'Use STL, OBJ, PLY, GLB, GLTF, 3MF, FBX, DAE, DXF, STEP, or IGES. Convert DWG/DWF to DXF first.',
          'Open “Format guide & DWG conversion” in the Import panel for details.',
        ]
      );
  }
}

function measureRawMaxDimension(content) {
  content.scale.set(1, 1, 1);
  content.position.set(0, 0, 0);
  content.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(content);
  if (box.isEmpty()) return 0;

  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  return Number.isFinite(max) ? max : 0;
}

function currentUnitFactor(item) {
  const choice = state.importOptions.units;
  if (choice === 'auto') return item.autoUnitScale || 1;
  return UNIT_FACTORS[choice] ?? 1;
}

function applyItemFit(item) {
  const options = state.importOptions;
  const raw = item.rawMaxDim > 1e-9 ? item.rawMaxDim : 1;

  let scale;
  if (options.autoFit) {
    scale = options.targetSize / raw;
  } else {
    scale = currentUnitFactor(item);
  }

  item.content.scale.setScalar(scale);
  item.content.position.set(0, 0, 0);
  item.content.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(item.content);
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  item.content.position.set(-center.x, -box.min.y, -center.z);
  item.content.updateMatrixWorld(true);
}

function addImportedItem(result, file) {
  const content = new THREE.Group();
  content.add(result.object);

  const rawMaxDim = measureRawMaxDimension(content);
  if (!Number.isFinite(rawMaxDim) || rawMaxDim <= 0) {
    throw new Error('The file contains no measurable geometry.');
  }

  const scaleGroup = new THREE.Group();
  scaleGroup.add(content);

  const root = new THREE.Group();
  root.add(scaleGroup);

  const item = {
    id: nextImportId,
    kind: 'import',
    name: file.name,
    ext: result.ext,
    root,
    scaleGroup,
    content,
    object: result.object,
    isDrawing: Boolean(result.isDrawing),
    userScale: 1,
    visible: true,
    rawMaxDim,
    autoUnitScale: result.unitScale || 1,
  };
  nextImportId += 1;

  prepareLoadedObject(result.object);
  applyItemFit(item);

  scene.add(root);
  sceneItems.push(item);
  state.imports.push(item);

  renderImportList();
  layoutItems();
  requestAnimationFrame(() => fitView(true));

  return item;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (!child.material) return;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const key of Object.keys(material)) {
        const value = material[key];
        if (value && value.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

function removeImportItem(item) {
  const listIndex = state.imports.indexOf(item);
  if (listIndex >= 0) state.imports.splice(listIndex, 1);

  const sceneIndex = sceneItems.indexOf(item);
  if (sceneIndex >= 0) sceneItems.splice(sceneIndex, 1);

  scene.remove(item.root);
  disposeObject(item.root);

  renderImportList();
  scheduleLayout();
  toast(`Removed ${item.name}`);
}

function findImportById(id) {
  return state.imports.find((item) => String(item.id) === String(id));
}

function renderImportList() {
  const list = $('importList');
  $('importCount').textContent = String(state.imports.length);

  list.replaceChildren();

  if (!state.imports.length) {
    list.appendChild(
      el('div', 'empty-state', 'No imported parts yet. Drop a mesh or CAD file above to add one.')
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of state.imports) {
    const card = el('div', `import-item${item.visible ? '' : ' is-hidden'}`);
    card.dataset.id = String(item.id);

    const top = el('div', 'import-top');
    const badge = el('span', 'type-badge', (item.ext || 'file').toUpperCase().slice(0, 4));

    const name = el('span', 'import-name', item.name);
    name.title = item.name;

    const actions = el('div', 'import-actions');

    const visibility = el('button', `icon-btn${item.visible ? ' is-active' : ''}`, item.visible ? '◉' : '○');
    visibility.type = 'button';
    visibility.dataset.role = 'visibility';
    visibility.title = item.visible ? 'Hide part' : 'Show part';
    visibility.setAttribute('aria-label', visibility.title);

    const focus = el('button', 'icon-btn', '◎');
    focus.type = 'button';
    focus.dataset.role = 'focus';
    focus.title = 'Frame part';
    focus.setAttribute('aria-label', `Frame ${item.name}`);

    const remove = el('button', 'icon-btn danger', '✕');
    remove.type = 'button';
    remove.dataset.role = 'remove';
    remove.title = 'Remove part';
    remove.setAttribute('aria-label', `Remove ${item.name}`);

    actions.append(visibility, focus, remove);
    top.append(badge, name, actions);

    const scaleBox = el('div', 'import-scale');
    const header = el('div', 'control-header');
    const label = el('span', '', 'Part scale');
    const value = el('output', '', `${Math.round(item.userScale * 100)}%`);
    value.dataset.role = 'scaleVal';
    header.append(label, value);

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '10';
    range.max = '400';
    range.step = '1';
    range.value = String(Math.round(item.userScale * 100));
    range.dataset.role = 'scale';
    range.setAttribute('aria-label', `Scale ${item.name}`);
    updateRangeFill(range);

    scaleBox.append(header, range);
    card.append(top, scaleBox);
    fragment.appendChild(card);
  }

  list.appendChild(fragment);
}

function initImportControls() {
  $('dropzone').addEventListener('click', () => $('fileInput').click());

  $('fileInput').addEventListener('change', async () => {
    const files = Array.from($('fileInput').files || []);
    $('fileInput').value = '';
    $('fileInput').accept = FULL_ACCEPT;
    if (files.length) await handleFiles(files);
  });

  $('importList').addEventListener('input', (event) => {
    const range = event.target.closest('[data-role="scale"]');
    if (!range) return;

    const card = range.closest('.import-item');
    const item = findImportById(card?.dataset.id);
    if (!item) return;

    const percent = clamp(Number(range.value), 10, 400);
    item.userScale = percent / 100;
    item.scaleGroup.scale.setScalar(item.userScale);

    updateRangeFill(range);
    const output = card.querySelector('[data-role="scaleVal"]');
    if (output) output.textContent = `${percent}%`;

    scheduleLayout();
  });

  $('importList').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-role]');
    if (!button) return;

    const card = button.closest('.import-item');
    const item = findImportById(card?.dataset.id);
    if (!item) return;

    if (button.dataset.role === 'visibility') {
      item.visible = !item.visible;
      item.root.visible = item.visible;
      renderImportList();
      scheduleLayout();
    } else if (button.dataset.role === 'focus') {
      focusItem(item, true);
    } else if (button.dataset.role === 'remove') {
      removeImportItem(item);
    }
  });

  $('autoFit').addEventListener('change', (event) => {
    state.importOptions.autoFit = event.target.checked;
    syncImportControls();
    refitAllImports();
  });

  $('importSize').addEventListener('input', () => {
    updateSliderUI($('importSize'));
    state.importOptions.targetSize = parseFloat($('importSize').value);
    refitAllImportsDebounced();
  });

  $('importUnits').addEventListener('change', (event) => {
    state.importOptions.units = event.target.value;
    refitAllImports();
  });

  $('layFlat').addEventListener('change', (event) => {
    state.importOptions.layFlat = event.target.checked;

    for (const item of state.imports) {
      if (!item.isDrawing) continue;
      item.object.rotation.x = state.importOptions.layFlat ? -Math.PI / 2 : 0;
      applyItemFit(item);
    }

    scheduleLayout();
  });

  updateSliderUI($('importSize'));
  syncImportControls();
  renderImportList();
}

function syncImportControls() {
  const autoFit = $('autoFit').checked;
  $('importUnits').disabled = autoFit;
  $('importSize').disabled = !autoFit;
}

let refitQueued = false;

function refitAllImportsDebounced() {
  if (refitQueued) return;
  refitQueued = true;
  requestAnimationFrame(() => {
    refitQueued = false;
    refitAllImports();
  });
}

function refitAllImports() {
  for (const item of state.imports) applyItemFit(item);
  scheduleLayout();
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  if (isSmallScreen()) closeSidebar();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name = file.name || 'file';

    showLoading(`Loading ${name}${files.length > 1 ? ` (${i + 1}/${files.length})` : ''}…`);

    try {
      const result = await importFile(file);
      addImportedItem(result, file);
      toast(`Added ${name}`, 'success');
    } catch (error) {
      console.error(error);
      if (error instanceof ImportDialogError) {
        showInfoDialog(error.title, error.paragraphs, error.code, error.options);
      } else {
        toast(`${name}: ${error?.message || 'could not be read'}`, 'error', 5400);
      }
    } finally {
      hideLoading();
    }
  }
}

/* ============================================================
   Drag & drop (whole window)
   ============================================================ */

function dataTransferHasFiles(event) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

function initDragAndDrop() {
  let dragDepth = 0;
  const overlay = $('dropOverlay');

  window.addEventListener('dragenter', (event) => {
    if (!dataTransferHasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    overlay.classList.add('show');
  });

  window.addEventListener('dragover', (event) => {
    if (!dataTransferHasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('dragleave', (event) => {
    if (!dataTransferHasFiles(event) && !dragDepth) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) overlay.classList.remove('show');
  });

  window.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    overlay.classList.remove('show');

    const files = event.dataTransfer?.files;
    if (files && files.length) handleFiles(files);
  });
}

/* ============================================================
   Binary STL export
   ============================================================ */

function collectExportMeshes() {
  const meshes = [];

  for (const item of sceneItems) {
    if (!item.root.visible) continue;
    item.root.updateWorldMatrix(true, true);

    item.root.traverse((object) => {
      if (object.isMesh && !object.userData.noExport && object.geometry && object.geometry.attributes.position) {
        meshes.push(object);
      }
    });
  }

  return meshes;
}

function buildBinarySTL(meshes, triangleCount) {
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);

  const header = 'Mijo 3D binary STL';
  for (let i = 0; i < Math.min(header.length, 79); i++) {
    view.setUint8(i, header.charCodeAt(i));
  }
  view.setUint32(80, triangleCount, true);

  let offset = 84;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const matrix = mesh.matrixWorld;

    for (let i = 0; i + 2 < count; i += 3) {
      const i0 = index ? index.getX(i) : i;
      const i1 = index ? index.getX(i + 1) : i + 1;
      const i2 = index ? index.getX(i + 2) : i + 2;

      a.fromBufferAttribute(position, i0).applyMatrix4(matrix);
      b.fromBufferAttribute(position, i1).applyMatrix4(matrix);
      c.fromBufferAttribute(position, i2).applyMatrix4(matrix);

      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac);

      if (normal.lengthSq() > 1e-14) normal.normalize();
      else normal.set(0, 0, 0);

      view.setFloat32(offset, normal.x, true);
      offset += 4;
      view.setFloat32(offset, normal.y, true);
      offset += 4;
      view.setFloat32(offset, normal.z, true);
      offset += 4;

      for (const vertex of [a, b, c]) {
        view.setFloat32(offset, vertex.x, true);
        offset += 4;
        view.setFloat32(offset, vertex.y, true);
        offset += 4;
        view.setFloat32(offset, vertex.z, true);
        offset += 4;
      }

      view.setUint16(offset, 0, true);
      offset += 2;
    }
  }

  return buffer;
}

function timestampSlug() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

async function exportSTL() {
  const meshes = collectExportMeshes();

  if (!meshes.length) {
    toast('Nothing to export — add a mesh or enable the design.', 'error', 4400);
    return;
  }

  let triangleCount = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    triangleCount += Math.floor(count / 3);
  }

  if (!triangleCount) {
    toast('No triangles to export.', 'error');
    return;
  }

  if (triangleCount > 4000000) {
    toast('This scene is over 4 million triangles — too dense for browser export.', 'error', 5200);
    return;
  }

  showLoading('Building binary STL…');
  await new Promise((resolve) => window.setTimeout(resolve, 32));

  try {
    const buffer = buildBinarySTL(meshes, triangleCount);
    const blob = new Blob([buffer], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    const presetName = state.activePreset ? PRESETS[state.activePreset].name.toLowerCase() : 'custom';
    link.href = url;
    link.download = `mijo3d-${presetName}-${timestampSlug()}.stl`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 4000);

    const megabytes = (buffer.byteLength / (1024 * 1024)).toFixed(1);
    toast(`Exported ${triangleCount.toLocaleString()} triangles · ${megabytes} MB`, 'success', 4600);
  } catch (error) {
    console.error(error);
    toast(`Export failed: ${error?.message || 'unknown error'}`, 'error', 5200);
  } finally {
    hideLoading();
  }
}

/* ============================================================
   Keyboard shortcuts
   ============================================================ */

function initKeyboard() {
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const isField = target instanceof HTMLElement &&
      (target.matches('input, select, textarea') || target.isContentEditable);
    if (isField || event.ctrlKey || event.metaKey || event.altKey) return;
    if ($('infoDialog').open) return;

    const key = event.key.toLowerCase();

    if (key === 'f') {
      event.preventDefault();
      fitView(true);
    } else if (key === 'g') {
      event.preventDefault();
      setGrid(!state.showGrid);
    } else if (key === 'r') {
      event.preventDefault();
      resetView();
    } else if (key === 'w') {
      event.preventDefault();
      setWireframe(!state.wireframe);
    } else if (event.key === '?') {
      event.preventDefault();
      showFormatGuide();
    }
  });
}

/* ============================================================
   Boot
   ============================================================ */

function init() {
  renderPresets();
  initTabs();
  initDesignControls();
  initViewControls();
  initImportControls();
  initSidebar();
  initDialogs();
  initDragAndDrop();
  initKeyboard();

  resize();

  $('exportBtn').addEventListener('click', exportSTL);

  applyPreset('pendant', true);
  setGrid(true);
  setShadows(true);
  setAutoRotate(false);
  setBulb(true);
  setWireframe(false);

  requestAnimationFrame(() => {
    resize();
    const box = computeVisibleBox();
    if (box) frameBox(box, false, new THREE.Vector3(0.55, 0.38, 0.74));
  });
}

init();
