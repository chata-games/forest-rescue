import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { test } from "node:test";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "../..");
const assetsRoot = join(ROOT, "assets");
const catalog = JSON.parse(readFileSync(join(assetsRoot, "catalog.json"), "utf8"));

test("every catalog asset has a unique, bundled PNG path", () => {
  const ids = catalog.assets.map((asset) => asset.id);
  assert.equal(new Set(ids).size, ids.length, "catalog asset ids must be unique");

  for (const asset of catalog.assets) {
    assert.match(asset.file, /^(sprites|materials|decorations)\/[^/]+(?:\/[^/]+)*\.png$/,
      `${asset.id} must use a path covered by app/art.ts`);
    const file = normalize(join(assetsRoot, asset.file));
    assert.equal(relative(assetsRoot, file).startsWith(".."), false, `${asset.id} escapes assets/`);
    assert.equal(existsSync(file), true, `${asset.id} points to missing ${asset.file}`);
  }
});

test("all authored defender and enemy sprites resolve through the catalog", () => {
  const ids = new Set(catalog.assets.map((asset) => asset.id));
  const content = readFileSync(join(ROOT, "app/domain/content.ts"), "utf8");
  const spriteIds = [...content.matchAll(/sprite:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  assert.ok(spriteIds.length > 0, "content must define renderable sprites");
  for (const spriteId of spriteIds) assert.equal(ids.has(spriteId), true, `${spriteId} is absent from catalog`);
});

test("every enemy type used by compiled waves has catalog art", () => {
  const ids = new Set(catalog.assets.map((asset) => asset.id));
  const compiledRoot = join(ROOT, "levels/compiled");
  const enemyTypes = new Set();
  for (const name of readdirSync(compiledRoot)) {
    if (!name.endsWith(".json") || name.endsWith(".simulation.json")) continue;
    const level = JSON.parse(readFileSync(join(compiledRoot, name), "utf8"));
    for (const wave of level.waves ?? []) for (const enemy of wave.enemies ?? []) enemyTypes.add(enemy.type);
  }
  for (const type of enemyTypes) assert.equal(ids.has(`${type}-idle`), true, `${type} wave has no catalog sprite`);
});
