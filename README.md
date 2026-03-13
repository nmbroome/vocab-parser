# Cassandra Vocabulary Parser

Extracts compliance vocabulary from an OpenAPI spec into structured JSON that the Control Builder UI consumes. The spec uses `x-` extensions to carry compliance metadata (events, computed fields, state machines, PII flags, retention, plugins), making it the single source of truth for both API documentation and control vocabulary.

## Quick Start

```bash
# Install dependencies
npm install

# Parse the spec
npx ts-node src/cli.ts fair-lending-openapi.yaml --out-dir ./output

# Run tests
npm test
```

## Setup

**Prerequisites:** Node.js 18+ and npm.

```bash
# Clone / copy the parser directory
cd vocabulary-parser

# Install all dependencies (runtime + dev)
npm install

# Verify everything works
npm test
```

The project depends on:

| Package | Purpose |
|---------|---------|
| `js-yaml` | Parse YAML OpenAPI specs |
| `zod` | Runtime validation of parser output |
| `typescript` | Type checking |
| `ts-node` | Run TypeScript directly (CLI + tests) |
| `jest` / `ts-jest` | Test runner |

## Usage

### CLI

```bash
# Full parse — writes vocabulary.json, ui-vocabulary.json, search-index.json, stats.txt
npx ts-node src/cli.ts <path-to-openapi.yaml> --out-dir ./output

# Validate only — parse and check for errors without writing files
npx ts-node src/cli.ts <path-to-openapi.yaml> --validate-only
```

The CLI exits with code 1 if there are parse errors (not warnings).

### Programmatic

```typescript
import { parseSpec, translateToUI, generateSearchIndex } from '@cassandra/vocabulary-parser';
import * as yaml from 'js-yaml';
import * as fs from 'fs';

// 1. Load and parse
const doc = yaml.load(fs.readFileSync('fair-lending-openapi.yaml', 'utf-8'));
const { vocabulary, warnings, errors } = parseSpec(doc);

// 2. Check health
if (errors.length > 0) {
  console.error('Parse errors:', errors);
  process.exit(1);
}

// 3. Translate to UI format for the Control Builder
const uiVocab = translateToUI(vocabulary);

// 4. Generate search index for autocomplete
const searchIndex = generateSearchIndex(vocabulary);

// 5. Use in your app
console.log(uiVocab.fields['application.status']);
// → { type: 'string', category: 'application', computed: false, ... }

console.log(uiVocab.events['decision.denied']);
// → { description: '...', category: 'application', trigger_type: 'on_create', ... }
```

### Build (optional — for publishing as a package)

```bash
npm run build    # Compiles to dist/
```

## Output Files

The parser produces four files:

| File | Size | Purpose | Consumer |
|------|------|---------|----------|
| `vocabulary.json` | ~196 KB | Full parser output — arrays with rich metadata per field, event, endpoint | Compiler, traceability engine, vocabulary diff tool |
| `ui-vocabulary.json` | ~93 KB | Control Builder format — fields/events keyed by ID, grouped by category | Control Builder Vocabulary Browser |
| `search-index.json` | ~58 KB | Flat array with `{ id, type, category, label, description }` | Typeahead / autocomplete in the editor |
| `stats.txt` | ~10 KB | Human-readable inventory | Engineers reviewing extraction results |

### vocabulary.json shape

```jsonc
{
  "meta": { "spec_title": "...", "spec_version": "...", "parsed_at": "...", "parser_version": "..." },
  "stats": { "entities": 15, "fields": 243, "computed_fields": 21, "events": 75, ... },
  "entities": [ { "name": "application", "schema_name": "Application", "retention": "25mo", ... } ],
  "fields": [ { "path": "Application.status", "type": "string", "is_computed": false, ... } ],
  "events": [ { "name": "decision.denied", "trigger_type": "on_create", "source_entity": "Decision", ... } ],
  "endpoints": [ { "method": "POST", "path": "/lending/applications", "control_refs": ["FL-02", ...], ... } ],
  "state_machines": [ { "path": "Application.status", "states": [...], "transitions": [...] } ],
  "plugins": [ { "name": "ofac_screener", "resolves_fields": ["Decision.ofac_cleared"], ... } ]
}
```

### ui-vocabulary.json shape

```jsonc
{
  "fields": {
    "application.status": { "type": "string", "category": "application", "computed": false, "pii": false, "enum_values": [...] },
    "credit.fico_score": { "type": "integer", "category": "credit", ... },
    "underwriting.dti_ratio": { "type": "number", "category": "underwriting", "computed": true, ... }
  },
  "events": {
    "application.created": { "description": "...", "category": "application", "trigger_type": "on_create", "source_entity": "application" },
    "decision.denied": { ... }
  },
  "categories": ["adverse_action", "application", "credit", ...],
  "entities": ["adverse_action", "application", "credit", ...]
}
```

## Architecture

```
                     OpenAPI Spec (YAML)
                           │
                     ┌─────┴─────┐
                     │  js-yaml   │
                     └─────┬─────┘
                           │ parsed JS object
                     ┌─────┴──────────┐
                     │  ref-resolver   │  Resolve $ref, flatten allOf
                     └─────┬──────────┘
                           │ fully dereferenced doc
        ┌──────────────────┼──────────────────┐
        │                  │                  │
  ┌─────┴─────┐    ┌──────┴──────┐    ┌──────┴──────┐
  │ extractors │    │ extractors  │    │ extractors  │
  │ (entities, │    │ (endpoints, │    │ (events,    │
  │  fields)   │    │  params)    │    │  machines)  │
  └─────┬─────┘    └──────┬──────┘    └──────┬──────┘
        │                 │                   │
        └────────────┬────┴───────────────────┘
                     │
               ┌─────┴─────┐
               │   parser   │  Deduplicate, cross-reference,
               │            │  validate, assemble
               └─────┬─────┘
                     │ Vocabulary (Zod-validated)
            ┌────────┼────────┐
            │        │        │
    vocabulary.json  │   search-index.json
                     │
              ┌──────┴───────┐
              │ ui-translator │  Rekey by ID, group by category
              └──────┬───────┘
                     │
             ui-vocabulary.json
```

### Parser Phases

The parser runs 10 phases in sequence:

1. **Resolve refs** — Dereference all `$ref` pointers via `ref-resolver.ts`
2. **Extract endpoints** — Walk `paths`, collect methods, params, request/response schemas, `x-audit-events`, `x-control-refs`; build a schema→endpoint map
3. **Extract entities** — Identify entity schemas (via `x-entity` or `x-events`), skip List/Create/Update/Error wrappers
4. **Extract fields** — Walk entity properties, recurse into inline nested objects, capture `x-computed`, `x-plugin`, `x-pii`, `x-freshness`, `x-state-machine`
5. **Extract domain events** — Pull from `x-events` on entity schemas
6. **Extract transition events** — Pull from `x-state-machine.transitions` on status fields
7. **Deduplicate events** — Merge events that appear in multiple places (e.g., `credit.report.pulled` is both a domain event on CreditReport and an audit event on the pullCreditReport endpoint); prefer domain metadata over audit
8. **Cross-reference** — Link events↔endpoints, propagate control refs from endpoints to events
9. **Extract plugins** — Scan fields for `x-plugin`, group by plugin name
10. **Validate** — Run the assembled vocabulary through `VocabularySchema` (Zod); collect warnings for computed fields without formulas

### x- Extension Reference

| Extension | Applies To | What It Does |
|-----------|-----------|--------------|
| `x-entity` | schema | Names this schema as a domain entity (e.g., `x-entity: application`) |
| `x-events` | schema | Declares domain events the entity emits |
| `x-computed` | property | Marks a derived field with `source`, `description`, `formula` |
| `x-plugin` | property or inside `x-computed` | Names the plugin that resolves this field at runtime |
| `x-pii` | property or schema | Flags personally identifiable information |
| `x-retention` | schema | Minimum retention period (`25mo`, `7y`, `life_of_loan_plus_3y`) |
| `x-freshness` | property | Maximum data age (`max_age: 180d`) |
| `x-state-machine` | property (enum) | Declares valid state transitions and their events |
| `x-control-refs` | schema, path operation | Lists control IDs that reference this vocabulary |
| `x-audit-events` | path operation | Lists audit trail events the endpoint emits |

## Tests

### Running

```bash
# All tests
npm test

# Verbose output (shows every test name)
npm run test:verbose

# Single file
npx jest tests/parser.test.ts

# Watch mode (re-runs on file changes)
npx jest --watch
```

### Test Structure

```
tests/
├── test-helpers.ts          Shared fixtures, spec loader, minimal schema builders
├── ref-resolver.test.ts     Unit tests for $ref resolution and allOf flattening
├── extractors.test.ts       Unit tests for each extraction function
├── parser.test.ts           Integration tests against the real spec
└── ui-translator.test.ts    Tests for the Control Builder UI format
```

**287 tests** across 4 suites:

| Suite | Tests | What It Validates |
|-------|-------|-------------------|
| `ref-resolver` | 13 | $ref pointer resolution, circular ref handling, allOf merge, extension preservation |
| `extractors` | 31 | Entity detection, field metadata (PII, computed, plugin, freshness, state machine, enums, nesting), event extraction, plugin grouping |
| `parser` | 190 | **Completeness against real spec:** all 15 entities, 50+ critical fields, every trigger/audit event from FL-01–FL-14, all 5 state machines with correct state/transition counts, all 33+ endpoints with correct control refs, plugin coverage, retention rules, event deduplication |
| `ui-translator` | 53 | Zod schema validation, dot-notation keys, category mapping, enum preservation, search index shape |

### What the Tests Guarantee

The integration tests in `parser.test.ts` are the contract between the spec and the Control Builder. They check:

- **Every FL control (FL-01 through FL-14)** is referenced by at least one entity or endpoint
- **Every trigger event** from the control definitions exists in the vocabulary
- **Every audit log event** from the control definitions exists in the vocabulary
- **Every critical field** that controls reference is extractable
- **Computed fields** have correct formulas and plugin assignments
- **State machines** have the right number of states and transitions
- **Retention periods** match regulatory requirements
- **Events are deduplicated** — no duplicates, domain metadata preferred over audit
- **Nested fields** (ATR 8-factors, neutral_factors, exception metrics) are recursed into

If you modify the OpenAPI spec, these tests will tell you exactly what broke.

### Adding Tests for New Controls

When you add a new control category (e.g., BSA, Collections), extend the tests:

```typescript
// In parser.test.ts, add to CONTROL_TRIGGER_EVENTS:
const CONTROL_TRIGGER_EVENTS = [
  // ... existing FL events ...
  // BA-05: OFAC Screening
  "payment.pre.screen",
  "ofac.screen.at.onboard",
  // ...
];

// Add to CRITICAL_FIELDS:
const CRITICAL_FIELDS = [
  // ... existing FL fields ...
  // BA-05
  "OFACScreening.match_score",
  "OFACScreening.match_result",
  // ...
];

// Add entity completeness:
const EXPECTED_ENTITIES = [
  // ... existing ...
  "ofac_screening",
  "payment",
  // ...
];
```

## Adding to the Spec

When a lawyer needs a new field or event that doesn't exist:

1. Engineer adds the field/event to the OpenAPI spec with appropriate `x-` extensions
2. Run `npx ts-node src/cli.ts openapi.yaml --validate-only` to check for errors
3. Run `npm test` — new vocabulary should appear; existing tests should still pass
4. Add new tests for the new control's fields and events
5. Run full parse to regenerate output files
6. Control Builder picks up the new vocabulary automatically
