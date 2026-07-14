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
