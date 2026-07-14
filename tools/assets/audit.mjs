#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(join(ROOT, "assets/catalog.json"), "utf8"));

let missing = 0;
for (const a of catalog.assets) {
  const path = join(ROOT, "assets", a.file);
  const prompt = join(ROOT, "assets", a.promptFile);
  if (!existsSync(path)) {
    console.log(`MISSING file: ${a.id} -> ${a.file}`);
    missing++;
  }
  if (!existsSync(prompt)) {
    console.log(`MISSING prompt: ${a.id} -> ${a.promptFile}`);
    missing++;
  }
}
console.log(missing ? `${missing} issues` : "catalog audit OK");
process.exit(missing ? 1 : 0);
