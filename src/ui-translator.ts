/**
 * ui-translator.ts
 *
 * Converts the array-based Vocabulary into keyed formats
 * for the Control Builder's Vocabulary Browser and search.
 */

import type {
  Vocabulary,
  UIVocabulary,
  UIField,
  UIEvent,
  SearchEntry,
} from "./types";

// ─────────────────────────────────────────────────────────────
// Schema name → UI category mapping
// ─────────────────────────────────────────────────────────────

const SCHEMA_TO_CATEGORY: Record<string, string> = {
  LendingProduct: "product",
  Application: "application",
  CreditReport: "credit",
  ATRChecklist: "underwriting",
  Valuation: "valuation",
  Decision: "decision",
  AdverseAction: "adverse_action",
  Exception: "exception",
  CreditPackage: "documentation",
  RateSheet: "pricing",
  ApplicationPricing: "pricing",
  OFACScreeningResult: "ofac",
  Prequalification: "prequalification",
  FLRiskAssessment: "fair_lending",
  LendingPolicy: "governance",
};

/** Map event name prefix → category */
const EVENT_PREFIX_TO_CATEGORY: Record<string, string> = {
  product: "product",
  application: "application",
  credit: "credit",
  atr: "underwriting",
  underwriting: "underwriting",
  valuation: "valuation",
  decision: "application",
  adverse_action: "adverse_action",
  aa: "adverse_action",
  exception: "exception",
  credit_package: "documentation",
  pricing: "pricing",
  ofac: "ofac",
  prequal: "prequalification",
  flra: "fair_lending",
  policy: "governance",
  program: "product",
  user: "governance",
  insider: "application",
  qm: "underwriting",
  collateral: "valuation",
  steering: "prequalification",
};

function getCategoryForSchema(schemaName: string): string {
  return SCHEMA_TO_CATEGORY[schemaName] || schemaName.toLowerCase();
}

function getCategoryForEvent(event: { name: string; source_entity: string }): string {
  // First try mapping from event name prefix (more specific)
  const prefix = event.name.split(".")[0];
  if (EVENT_PREFIX_TO_CATEGORY[prefix]) {
    return EVENT_PREFIX_TO_CATEGORY[prefix];
  }

  // Fall back to source_entity schema mapping
  if (event.source_entity && SCHEMA_TO_CATEGORY[event.source_entity]) {
    return SCHEMA_TO_CATEGORY[event.source_entity];
  }

  return prefix;
}

// ─────────────────────────────────────────────────────────────
// translateToUI
// ─────────────────────────────────────────────────────────────

/**
 * Convert a Vocabulary (array-based) to the keyed UI format
 * used by the Control Builder's Vocabulary Browser.
 */
export function translateToUI(vocab: Vocabulary): UIVocabulary {
  const fields: Record<string, UIField> = {};
  const events: Record<string, UIEvent> = {};
  const categorySet = new Set<string>();
  const entitySet = new Set<string>();

  // Translate fields
  for (const field of vocab.fields) {
    const category = getCategoryForSchema(field.entity);
    // Re-key: "SchemaName.field" → "category.field"
    const uiKey = `${category}.${field.field}`;

    categorySet.add(category);
    entitySet.add(category);

    fields[uiKey] = {
      type: field.type,
      category,
      entity: category,
      computed: field.is_computed,
      pii: field.pii,
      enum_values: field.enum_values,
      plugin: field.plugin,
      description: field.description,
      required: field.required,
      nullable: field.nullable,
      ...(field.freshness && { freshness: field.freshness }),
      ...(field.is_state_machine && { is_state_machine: field.is_state_machine }),
      ...(field.bound_controls.length > 0 && {
        bound_controls: field.bound_controls,
      }),
    };
  }

  // Translate events
  for (const event of vocab.events) {
    const category = getCategoryForEvent(event);
    categorySet.add(category);

    const sourceCategory = event.source_entity
      ? getCategoryForSchema(event.source_entity)
      : category;

    events[event.name] = {
      description: event.description,
      category,
      trigger_type: event.trigger_type,
      source_entity: sourceCategory,
      ...(event.condition && { condition: event.condition }),
      ...(event.from_state && { from_state: event.from_state }),
      ...(event.to_state && { to_state: event.to_state }),
      ...(event.bound_controls.length > 0 && {
        bound_controls: event.bound_controls,
      }),
    };
  }

  const categories = [...categorySet].sort();
  const entities = [...entitySet].sort();

  return { fields, events, categories, entities };
}

// ─────────────────────────────────────────────────────────────
// generateSearchIndex
// ─────────────────────────────────────────────────────────────

/**
 * Generate a flat search index for typeahead/autocomplete.
 */
export function generateSearchIndex(vocab: Vocabulary): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const field of vocab.fields) {
    const category = getCategoryForSchema(field.entity);
    entries.push({
      id: `${category}.${field.field}`,
      type: "field",
      category,
      label: field.field,
      description: field.description || `${field.type} field on ${category}`,
    });
  }

  for (const event of vocab.events) {
    const category = getCategoryForEvent(event);
    entries.push({
      id: event.name,
      type: "event",
      category,
      label: event.name,
      description: event.description || `${event.trigger_type} event`,
    });
  }

  return entries;
}
