#!/usr/bin/env node
import Ajv from "ajv";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { readJson, ROOT } from "./shared.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ajv = new Ajv({ allErrors: true });

function loadSchema(name) {
  return JSON.parse(readFileSync(join(ROOT, "schemas", name), "utf8"));
}

const intentSchema = loadSchema("level-intent.schema.json");
const compiledSchema = loadSchema("compiled-level.schema.json");
const validateIntent = ajv.compile(intentSchema);
const validateCompiled = ajv.compile(compiledSchema);

const args = process.argv.slice(2);

function expandPaths(inputs) {
  const out = [];
  for (const input of inputs) {
    const p = resolve(input);
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p).filter((name) => name.endsWith(".json"))) {
        out.push(join(p, f));
      }
      continue;
    }
    out.push(p);
  }
  return out;
}

const paths = args.length
  ? expandPaths(args)
  : [
    ...readdirSync(join(ROOT, "levels/intents")).filter((f) => f.endsWith(".json")).map((f) => join(ROOT, "levels/intents", f)),
    ...readdirSync(join(ROOT, "levels/compiled")).filter((f) => f.endsWith(".json") && !f.includes(".simulation")).map((f) => join(ROOT, "levels/compiled", f)),
  ];

let failed = false;
for (const p of paths) {
  const data = readJson(p);
  const isIntent = p.includes("/intents/");
  const validator = isIntent ? validateIntent : validateCompiled;
  const valid = validator(data);
  const label = isIntent ? "intent" : "compiled";
  if (valid) {
    console.log(`OK [${label}] ${p}`);
  } else {
    failed = true;
    console.error(`FAIL [${label}] ${p}`);
    console.error(validator.errors);
  }
}

process.exit(failed ? 1 : 0);
