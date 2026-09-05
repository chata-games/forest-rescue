import catalogData from '../assets/catalog.json';

export const catalog = catalogData;
const files = import.meta.glob('../assets/{sprites,materials,landmarks,decorations}/**/*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

/** Vite emits each catalog image with a URL relative to the deployed app. */
export function assetUrl(id: string): string {
  const asset = catalog.assets.find((entry) => entry.id === id);
  const url = asset && files[`../assets/${asset.file}`];
  if (!url) throw new Error(`Missing game art: ${id}`);
  return url;
}

export function defenderIcon(id: string): string {
  const assetId = `${id}-idle`;
  return catalog.assets.some((asset) => asset.id === assetId)
    ? `<img class="defender-art" src="${assetUrl(assetId)}" alt="" />` : '';
}
