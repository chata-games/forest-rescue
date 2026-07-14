import './style.css';

type VariantKey = 'plate' | 'tiles' | 'hybrid';

type Variant = {
  key: VariantKey;
  label: string;
  summary: string;
  tradeoff: string;
  layers: Array<[string, string]>;
};

const W = 844;
const H = 390;
const SCALE = 2;

const variants: Variant[] = [
  {
    key: 'plate',
    label: 'Painted scene plate',
    summary: 'A single generated battlefield image carries terrain, trail, props, rings, units, effects, and atmosphere. Runtime data is registered invisibly over the painted coordinates.',
    tradeoff: 'Highest immediate cohesion, but every route or ring move becomes an art revision and baked units fight dynamic game state.',
    layers: [
      ['Base', 'One 1536 × 1024 generated scene'],
      ['Trail', 'Baked into the plate; spline registered over it'],
      ['Actors', 'Baked silhouettes plus runtime hit regions'],
      ['Effects', 'Mostly baked lighting'],
    ],
  },
  {
    key: 'tiles',
    label: 'Material tile assembly',
    summary: 'The renderer chooses grass and trail material cells from compiled geometry, then places atlas sprites and code-native effects over the grid.',
    tradeoff: 'Maximum authoring freedom and deterministic geometry, but repetition, seams, and hard trail edges flatten the painterly scene.',
    layers: [
      ['Base', 'Repeated 128 px painterly material cells'],
      ['Trail', 'Geometry-selected trail cells'],
      ['Actors', 'Atlas sprites at data coordinates'],
      ['Effects', 'Programmatic rings, glow, range, and hazard masks'],
    ],
  },
  {
    key: 'hybrid',
    label: 'Masked painterly hybrid',
    summary: 'A generated biome material fills the battlefield while the runtime paints a spline mask for the trail, composes sprites and props, and owns every interactive region.',
    tradeoff: 'Needs a disciplined asset catalog and masking pipeline, but preserves painterly continuity without binding art to one level layout.',
    layers: [
      ['Base', 'Reusable generated biome material'],
      ['Trail', 'Textured spline mask with soft painted shoulders'],
      ['Actors', 'Catalog sprites and decorative stamps'],
      ['Effects', 'Programmatic rings, particles, shadows, and hit regions'],
    ],
  },
];

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Prototype shell is missing ${selector}`);
  return element;
}

function canvasContext(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = element.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  return context;
}

const canvas = requiredElement<HTMLCanvasElement>('canvas');
const stage = requiredElement<HTMLElement>('.device-stage');
const inspectButton = requiredElement<HTMLButtonElement>('.inspect-toggle');
const variantIndex = requiredElement<HTMLElement>('.variant-index');
const variantName = requiredElement<HTMLElement>('.variant-notes h2');
const variantSummary = requiredElement<HTMLElement>('.variant-summary');
const layerList = requiredElement<HTMLElement>('.layer-list');
const tradeoff = requiredElement<HTMLElement>('.tradeoff');
const switcherKey = requiredElement<HTMLElement>('.switcher-key');
const switcherName = requiredElement<HTMLElement>('.switcher-name');
const tapNote = requiredElement<HTMLElement>('.tap-note');
const ctx = canvasContext(canvas);

const assetPaths = {
  plate: new URL('../../docs/tower-defense-concept/art/gameplay-mockup.png', import.meta.url).href,
  grass: new URL('../../assets/source/material-grass.png', import.meta.url).href,
  trail: new URL('../../assets/source/material-path-interior.png', import.meta.url).href,
  units: new URL('../../assets/atlases/units.png', import.meta.url).href,
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load ${src}`));
  image.src = src;
});

const [plateImage, grassImage, trailImage, unitAtlas] = await Promise.all([
  loadImage(assetPaths.plate),
  loadImage(assetPaths.grass),
  loadImage(assetPaths.trail),
  loadImage(assetPaths.units),
]);

const route = new Path2D();
route.moveTo(402, 415);
route.bezierCurveTo(350, 330, 490, 290, 420, 220);
route.bezierCurveTo(355, 150, 500, 138, 560, 103);
route.bezierCurveTo(635, 58, 710, 57, 866, 90);

const rings = [
  { x: 190, y: 235, r: 36 },
  { x: 292, y: 110, r: 34 },
  { x: 586, y: 253, r: 38 },
  { x: 692, y: 150, r: 34 },
];

const units = [
  { frameX: 256, frameY: 128, x: 190, y: 238, w: 72, h: 72 },
  { frameX: 128, frameY: 128, x: 586, y: 256, w: 68, h: 68 },
  { frameX: 384, frameY: 128, x: 445, y: 235, w: 46, h: 54 },
  { frameX: 384, frameY: 128, x: 512, y: 154, w: 43, h: 51 },
  { frameX: 256, frameY: 256, x: 617, y: 92, w: 62, h: 58 },
];

const hazard = { x: 376, y: 164, r: 43 };
let inspect = new URLSearchParams(location.search).get('inspect') === '1';
let activeIndex = Math.max(0, variants.findIndex(({ key }) => key === new URLSearchParams(location.search).get('variant')));
let selectedRing: number | null = null;

function resetCanvas() {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

function drawCover(image: HTMLImageElement, x = 0, y = 0, width = W, height = H, focusY = .5) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sw = image.width;
  let sh = image.height;
  let sx = 0;
  let sy = 0;
  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) * focusY;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function drawPlate() {
  drawCover(plateImage, 0, 0, W, H, 0);
}

function drawTile(image: HTMLImageElement, x: number, y: number, size: number, seed: number) {
  const sample = 420;
  const maxOffset = image.width - sample;
  const sx = (seed * 137) % maxOffset;
  const sy = (seed * 211) % maxOffset;
  ctx.drawImage(image, sx, sy, sample, sample, x, y, size + 1, size + 1);
}

function drawTiles() {
  const cell = 98;
  let seed = 1;
  for (let y = 0; y < H; y += cell) {
    for (let x = 0; x < W; x += cell) {
      drawTile(grassImage, x, y, cell, seed++);
    }
  }

  ctx.save();
  ctx.lineCap = 'square';
  ctx.lineJoin = 'bevel';
  ctx.strokeStyle = 'rgba(48, 29, 14, .7)';
  ctx.lineWidth = 82;
  ctx.stroke(route);
  ctx.lineWidth = 72;
  ctx.strokeStyle = ctx.createPattern(trailImage, 'repeat') ?? '#b58a55';
  ctx.stroke(route);
  ctx.restore();
}

function drawHybrid() {
  drawCover(grassImage);

  const shade = ctx.createRadialGradient(W * .52, H * .46, 20, W * .52, H * .46, W * .62);
  shade.addColorStop(0, 'rgba(5, 41, 31, 0)');
  shade.addColorStop(1, 'rgba(0, 12, 16, .55)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(28, 18, 8, .48)';
  ctx.lineWidth = 112;
  ctx.filter = 'blur(10px)';
  ctx.stroke(route);
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trailPattern = ctx.createPattern(trailImage, 'repeat');
  ctx.strokeStyle = trailPattern ?? '#b58a55';
  ctx.lineWidth = 88;
  ctx.stroke(route);
  ctx.globalAlpha = .24;
  ctx.strokeStyle = '#f7d890';
  ctx.lineWidth = 64;
  ctx.stroke(route);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const magic = ctx.createRadialGradient(hazard.x, hazard.y, 4, hazard.x, hazard.y, hazard.r);
  magic.addColorStop(0, 'rgba(168, 122, 255, .7)');
  magic.addColorStop(1, 'rgba(60, 18, 94, 0)');
  ctx.fillStyle = magic;
  ctx.beginPath();
  ctx.arc(hazard.x, hazard.y, hazard.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRings(active: VariantKey) {
  if (active === 'plate') return;
  for (const ring of rings) {
    ctx.save();
    ctx.translate(ring.x, ring.y);
    ctx.shadowColor = '#52f9db';
    ctx.shadowBlur = active === 'hybrid' ? 15 : 7;
    ctx.strokeStyle = 'rgba(98, 255, 224, .92)';
    ctx.lineWidth = active === 'hybrid' ? 3 : 2;
    ctx.setLineDash(active === 'hybrid' ? [8, 5, 2, 5] : [6, 5]);
    ctx.beginPath();
    ctx.ellipse(0, 0, ring.r, ring.r * .48, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = .16;
    ctx.fillStyle = '#60f7d9';
    ctx.fill();
    ctx.restore();
  }
}

function drawUnits(active: VariantKey) {
  if (active === 'plate') return;
  for (const unit of units) {
    ctx.save();
    ctx.globalAlpha = .38;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(unit.x, unit.y + unit.h * .26, unit.w * .31, unit.h * .12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(unitAtlas, unit.frameX, unit.frameY, 128, 128, unit.x - unit.w / 2, unit.y - unit.h * .72, unit.w, unit.h);
  }
}

function drawParticles(active: VariantKey) {
  if (active !== 'hybrid') return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 16; i += 1) {
    const x = 110 + ((i * 83) % 650);
    const y = 70 + ((i * 47) % 250);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(187, 109, 255, .9)' : 'rgba(73, 235, 218, .7)';
    ctx.beginPath();
    ctx.arc(x, y, i % 3 === 0 ? 1.8 : 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawInspection() {
  if (!inspect) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 9, 13, .56)';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#fff178';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.stroke(route);

  ctx.font = '700 10px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (const [index, ring] of rings.entries()) {
    ctx.strokeStyle = '#55ffe0';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#55ffe0';
    ctx.fillText(`R${index + 1} hit`, ring.x, ring.y - ring.r - 6);
  }

  for (const unit of units) {
    ctx.strokeStyle = '#ff9a55';
    ctx.strokeRect(unit.x - unit.w * .27, unit.y - unit.h * .52, unit.w * .54, unit.h * .58);
  }

  ctx.strokeStyle = '#cf7cff';
  ctx.beginPath();
  ctx.arc(hazard.x, hazard.y, hazard.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e1b3ff';
  ctx.fillText('hazard mask', hazard.x, hazard.y - hazard.r - 6);
  ctx.restore();
}

function updateUrl() {
  const params = new URLSearchParams(location.search);
  params.set('variant', variants[activeIndex]?.key ?? 'plate');
  if (inspect) params.set('inspect', '1');
  else params.delete('inspect');
  history.replaceState({}, '', `${location.pathname}?${params.toString()}`);
}

function render() {
  const variant = variants[activeIndex] ?? variants[0];
  if (!variant) return;

  resetCanvas();
  if (variant.key === 'plate') drawPlate();
  if (variant.key === 'tiles') drawTiles();
  if (variant.key === 'hybrid') drawHybrid();
  drawRings(variant.key);
  drawUnits(variant.key);
  drawParticles(variant.key);
  drawInspection();

  stage.dataset.variant = variant.key;
  stage.dataset.ringFocus = String(variant.key !== 'plate' && selectedRing === 0);
  variantIndex.textContent = `Variant ${activeIndex + 1} of ${variants.length}`;
  variantName.textContent = variant.label;
  variantSummary.textContent = variant.summary;
  tradeoff.textContent = variant.tradeoff;
  layerList.replaceChildren(...variant.layers.map(([term, description]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = description;
    row.append(dt, dd);
    return row;
  }));
  switcherKey.textContent = variant.key;
  switcherName.textContent = variant.label;
  inspectButton.setAttribute('aria-pressed', String(inspect));
  updateUrl();
}

function cycle(delta: number) {
  activeIndex = (activeIndex + delta + variants.length) % variants.length;
  selectedRing = null;
  render();
}

document.querySelector('.previous')?.addEventListener('click', () => cycle(-1));
document.querySelector('.next')?.addEventListener('click', () => cycle(1));
inspectButton.addEventListener('click', () => {
  inspect = !inspect;
  render();
});

canvas.addEventListener('pointerdown', (event) => {
  const box = canvas.getBoundingClientRect();
  const x = ((event.clientX - box.left) / box.width) * W;
  const y = ((event.clientY - box.top) / box.height) * H;
  selectedRing = rings.findIndex((ring) => Math.hypot(x - ring.x, y - ring.y) <= ring.r);
  if (selectedRing < 0) selectedRing = null;
  tapNote.textContent = selectedRing === null ? 'Tap ring' : `R${selectedRing + 1} · hit region`;
  render();
});

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.matches('input, textarea, [contenteditable]')) return;
  if (event.key === 'ArrowLeft') cycle(-1);
  if (event.key === 'ArrowRight') cycle(1);
});

if (import.meta.env.PROD) {
  document.querySelector('.variant-switcher')?.remove();
}

render();
