#!/usr/bin/env node
import Ajv from "ajv";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { readJson, safeParseJson, ROOT } from "./shared.mjs";
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

/** Load JSON, capturing parse failures as actionable `parse` errors. */
function tryReadJson(p, parseErrors) {
  const { ok, data, error } = safeParseJson(readFileSync(p, "utf8"), p);
  if (ok) return { ok: true, data };
  parseErrors.push(error);
  console.error(`FAIL [parse] ${error.message}`);
  return { ok: false, data: null };
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
  // semantic checks below. Parse failures are captured so one bad file reports
  // an actionable error instead of aborting the whole gate.
  const parseErrors = [];
  const intents = readdirSync(intentDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const source = join(intentDir, f);
      const { ok, data } = tryReadJson(source, parseErrors);
      return ok ? { id: data.id, intent: data, source } : null;
    })
    .filter(Boolean);
  const compiled = readdirSync(compiledDir)
    .filter((f) => f.endsWith(".json") && !f.includes(".simulation"))
    .map((f) => {
      const source = join(compiledDir, f);
      const { ok, data } = tryReadJson(source, parseErrors);
      return ok ? { id: data.id, level: data, source } : null;
    })
    .filter(Boolean);
  if (parseErrors.length) failed = true;

  for (const { source, intent } of intents) {
    if (!schemaCheck(source, intent).ok) failed = true;
  }
  for (const { source, level } of compiled) {
    if (!schemaCheck(source, level).ok) failed = true;
  }

  const manifestLoad = tryReadJson(manifestPath, parseErrors);
  if (parseErrors.length) failed = true;
  if (!manifestLoad.ok) {
    failed = true;
  } else {
    const manifest = manifestLoad.data;
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
  }
} else {
  // Targeted mode: schema-check only the supplied files/directories.
  for (const p of expandPaths(args)) {
    if (!schemaCheck(p, readJson(p)).ok) failed = true;
  }
}

process.exit(failed ? 1 : 0);
