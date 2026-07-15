#!/usr/bin/env node
import Ajv from "ajv";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { readJson, ROOT } from "./shared.mjs";
import { loadCatalogs, validateAll } from "./rules.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ajv = new Ajv({ allErrors: true });

function loadSchema(name) {
  return JSON.parse(readFileSync(join(ROOT, "schemas", name), "utf8"));
}

const intentSchema = loadSchema("level-intent.schema.json");
const compiledSchema = loadSchema("compiled-level.schema.json");
const campaignSchema = loadSchema("campaign.schema.json");
const validateIntent = ajv.compile(intentSchema);
const validateCompiled = ajv.compile(compiledSchema);
const validateCampaign = ajv.compile(campaignSchema);

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

function schemaCheck(p, data) {
  // Campaign manifest is validated as part of the corpus checks below.
  if (p.endsWith("campaign.json")) return { ok: true };
  const isIntent = p.includes("/intents/");
  const validator = isIntent ? validateIntent : validateCompiled;
  const label = isIntent ? "intent" : "compiled";
  const valid = validator(data);
  if (valid) {
    console.log(`OK [${label}] ${p}`);
    return { ok: true };
  }
  console.error(`FAIL [${label}] ${p}`);
  console.error(JSON.stringify(validator.errors));
  return { ok: false };
}

let failed = false;

// Default mode (no file args): validate the whole corpus, the campaign manifest,
// and the full set of semantic authoring rules. This is the gate CI runs.
if (!args.length) {
  const intentDir = join(ROOT, "levels/intents");
  const compiledDir = join(ROOT, "levels/compiled");
  const manifestPath = join(ROOT, "levels/campaign.json");

  // Load each file once; the same parsed documents feed both the schema and
  // semantic checks below.
  const intents = readdirSync(intentDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const intent = readJson(join(intentDir, f));
      return { id: intent.id, intent, source: join(intentDir, f) };
    });
  const compiled = readdirSync(compiledDir)
    .filter((f) => f.endsWith(".json") && !f.includes(".simulation"))
    .map((f) => {
      const level = readJson(join(compiledDir, f));
      return { id: level.id, level, source: join(compiledDir, f) };
    });

  for (const { source, intent } of intents) {
    if (!schemaCheck(source, intent).ok) failed = true;
  }
  for (const { source, level } of compiled) {
    if (!schemaCheck(source, level).ok) failed = true;
  }

  const manifest = readJson(manifestPath);
  if (validateCampaign(manifest)) {
    console.log(`OK [campaign] ${manifestPath}`);
  } else {
    failed = true;
    console.error(`FAIL [campaign] ${manifestPath}`);
    console.error(JSON.stringify(validateCampaign.errors));
  }

  const catalogs = loadCatalogs();
  const semanticErrors = validateAll({ intents, compiled, manifest, catalogs });
  if (semanticErrors.length) {
    failed = true;
    console.error(`FAIL [rules] ${semanticErrors.length} authoring-contract violation(s):`);
    for (const err of semanticErrors) {
      console.error(`  - [${err.code}] ${err.source || ""} ${err.message}`);
    }
  } else {
    console.log("OK [rules] authoring contract satisfied");
  }
} else {
  // Targeted mode: schema-check only the supplied files/directories.
  for (const p of expandPaths(args)) {
    if (!schemaCheck(p, readJson(p)).ok) failed = true;
  }
}

process.exit(failed ? 1 : 0);
