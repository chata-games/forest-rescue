export function loadSprites(paths) {
  const images = {};
  const promises = Object.entries(paths).map(([key, src]) => new Promise((resolve) => {
    const img = new Image();
    images[key] = { img, ready: false, failed: false, src };
    img.onload = () => { images[key].ready = true; resolve(); };
    img.onerror = () => { images[key].failed = true; resolve(); };
    img.src = src;
  }));
  return { images, ready: Promise.all(promises) };
}

export function drawSprite(ctx, asset, x, y, w, h, alpha = 1) {
  if (!asset?.ready) return false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(asset.img, x, y, w, h);
  ctx.globalAlpha = 1;
  return true;
}

export function drawAtlasSprite(ctx, atlas, frame, x, y, w, h, alpha = 1) {
  if (!atlas?.ready || !frame) return false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(
    atlas.img,
    frame.x, frame.y, frame.w, frame.h,
    x, y, w, h,
  );
  ctx.globalAlpha = 1;
  return true;
}

export async function loadUnitsAtlas() {
  const res = await fetch("assets/atlases/units.json");
  if (!res.ok) return null;
  const meta = await res.json();
  const { images, ready } = loadSprites({ atlas: `assets/${meta.image}` });
  await ready;
  if (!images.atlas.ready) return null;
  return { img: images.atlas.img, ready: true, frames: meta.frames };
}

export function loadCatalogSprites(catalog, predicate) {
  const paths = {};
  for (const asset of catalog.assets || []) {
    if (predicate && !predicate(asset)) continue;
    paths[asset.id] = `assets/${asset.file}`;
  }
  return loadSprites(paths);
}

export function catalogAsset(catalog, id) {
  return (catalog?.assets || []).find((a) => a.id === id) || null;
}
