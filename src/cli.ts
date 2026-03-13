/**
 * cli.ts
 *
 * CLI entry point for the vocabulary parser.
 *
 * Usage:
 *   ts-node src/cli.ts <path-to-openapi.yaml> [--out-dir ./output] [--validate-only]
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { parseSpec } from "./parser";
import { translateToUI, generateSearchIndex } from "./ui-translator";

function main() {
  const args = process.argv.slice(2);

  // Find the spec file (first positional arg)
  const specPath = args.find((a) => !a.startsWith("--"));
  if (!specPath) {
    console.error("Usage: ts-node src/cli.ts <spec.yaml> [--out-dir dir] [--validate-only]");
    process.exit(1);
  }

  const validateOnly = args.includes("--validate-only");
  const outDirIndex = args.indexOf("--out-dir");
  const outDir = outDirIndex >= 0 ? args[outDirIndex + 1] : "./output";

  // Load spec
  const raw = fs.readFileSync(path.resolve(specPath), "utf-8");
  const doc = yaml.load(raw) as Record<string, any>;

  // Parse
  const { vocabulary, warnings, errors } = parseSpec(doc);

  // Report
  console.log(`Parsed: ${vocabulary.stats.entities} entities, ${vocabulary.stats.fields} fields, ${vocabulary.stats.events} events, ${vocabulary.stats.endpoints} endpoints`);

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.error(`  ✗ ${e}`);
    }
    process.exit(1);
  }

  if (validateOnly) {
    console.log("\nValidation passed.");
    return;
  }

  // Write output files
  fs.mkdirSync(path.resolve(outDir), { recursive: true });

  const vocabJson = JSON.stringify(vocabulary, null, 2);
  fs.writeFileSync(path.resolve(outDir, "vocabulary.json"), vocabJson);

  const uiVocab = translateToUI(vocabulary);
  const uiJson = JSON.stringify(uiVocab, null, 2);
  fs.writeFileSync(path.resolve(outDir, "ui-vocabulary.json"), uiJson);

  const searchIndex = generateSearchIndex(vocabulary);
  const searchJson = JSON.stringify(searchIndex, null, 2);
  fs.writeFileSync(path.resolve(outDir, "search-index.json"), searchJson);

  // Stats report
  const stats = [
    `Vocabulary Parser Report`,
    `========================`,
    `Spec: ${vocabulary.meta.spec_title} v${vocabulary.meta.spec_version}`,
    `Parsed at: ${vocabulary.meta.parsed_at}`,
    ``,
    `Entities:        ${vocabulary.stats.entities}`,
    `Fields:          ${vocabulary.stats.fields}`,
    `Computed fields: ${vocabulary.stats.computed_fields}`,
    `Events:          ${vocabulary.stats.events}`,
    `Endpoints:       ${vocabulary.stats.endpoints}`,
    `State machines:  ${vocabulary.stats.state_machines}`,
    `Plugins:         ${vocabulary.stats.plugins}`,
    ``,
    `Entities:`,
    ...vocabulary.entities.map(
      (e) =>
        `  ${e.name} (${e.schema_name}) — ${e.field_count} fields, ${e.events.length} events, retention: ${e.retention || "none"}`
    ),
    ``,
    `State Machines:`,
    ...vocabulary.state_machines.map(
      (sm) =>
        `  ${sm.path} — ${sm.states.length} states, ${sm.transitions.length} transitions`
    ),
    ``,
    `Plugins:`,
    ...vocabulary.plugins.map(
      (p) => `  ${p.name} — resolves: ${p.resolves_fields.join(", ")}`
    ),
  ].join("\n");

  fs.writeFileSync(path.resolve(outDir, "stats.txt"), stats);

  console.log(`\nOutput written to ${outDir}/`);
  console.log(`  vocabulary.json     (${(vocabJson.length / 1024).toFixed(0)} KB)`);
  console.log(`  ui-vocabulary.json  (${(uiJson.length / 1024).toFixed(0)} KB)`);
  console.log(`  search-index.json   (${(searchJson.length / 1024).toFixed(0)} KB)`);
  console.log(`  stats.txt`);
}

main();
