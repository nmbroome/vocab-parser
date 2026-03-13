/**
 * ui-translator.test.ts
 *
 * Tests that the UI-ready vocabulary format is correct for
 * the Control Builder's Vocabulary Browser.
 */

import { parseRealSpec } from "./test-helpers";
import { translateToUI, generateSearchIndex } from "../src/ui-translator";
import { UIVocabularySchema } from "../src/types";
import type { UIVocabulary } from "../src/types";

let uiVocab: UIVocabulary;
let searchIndex: ReturnType<typeof generateSearchIndex>;

beforeAll(() => {
  const { vocabulary } = parseRealSpec();
  uiVocab = translateToUI(vocabulary);
  searchIndex = generateSearchIndex(vocabulary);
});

// ═══════════════════════════════════════════════════════════
// 1. SCHEMA VALIDATION
// ═══════════════════════════════════════════════════════════

describe("UI vocabulary shape", () => {
  it("validates against the UIVocabulary Zod schema", () => {
    const result = UIVocabularySchema.safeParse(uiVocab);
    expect(result.success).toBe(true);
  });

  it("has fields, events, categories, and entities", () => {
    expect(Object.keys(uiVocab.fields).length).toBeGreaterThan(0);
    expect(Object.keys(uiVocab.events).length).toBeGreaterThan(0);
    expect(uiVocab.categories.length).toBeGreaterThan(0);
    expect(uiVocab.entities.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. FIELD TRANSLATION
// ═══════════════════════════════════════════════════════════

describe("field translation", () => {
  it("uses entity.field dot-notation keys", () => {
    const keys = Object.keys(uiVocab.fields);
    // Every key should have at least one dot
    for (const key of keys) {
      expect(key).toMatch(/\./);
    }
  });

  it("translates schema names to snake_case categories", () => {
    // Product → product
    expect(uiVocab.fields["product.type"]).toBeDefined();
    expect(uiVocab.fields["product.type"].category).toBe("product");

    // Application → application
    expect(uiVocab.fields["application.status"]).toBeDefined();
    expect(uiVocab.fields["application.status"].category).toBe("application");

    // Credit → credit
    expect(uiVocab.fields["credit.fico_score"]).toBeDefined();
    expect(uiVocab.fields["credit.fico_score"].category).toBe("credit");
  });

  it("preserves field metadata", () => {
    const fico = uiVocab.fields["credit.fico_score"];
    expect(fico.type).toBe("number");
    expect(fico.entity).toBe("credit");
    expect(fico.pii).toBe(false);
    expect(fico.computed).toBe(false);
  });

  it("marks computed fields", () => {
    expect(uiVocab.fields["atr.dti_ratio"].computed).toBe(true);
    expect(uiVocab.fields["collateral.ltv"].computed).toBe(true);
    expect(uiVocab.fields["loan.ltv_current"].computed).toBe(true);
  });

  it("preserves enum values for dropdown rendering", () => {
    const status = uiVocab.fields["application.status"];
    expect(status.enum_values).toContain("draft");
    expect(status.enum_values).toContain("submitted");
    expect(status.enum_values).toContain("decisioned");
    expect(status.enum_values).toContain("closed");
  });
});

// ═══════════════════════════════════════════════════════════
// 3. EVENT TRANSLATION
// ═══════════════════════════════════════════════════════════

describe("event translation", () => {
  it("events are keyed by name", () => {
    expect(uiVocab.events["application.created"]).toBeDefined();
    expect(uiVocab.events["decision.denied"]).toBeDefined();
    expect(uiVocab.events["pricing.assigned"]).toBeDefined();
  });

  it("events have categories for grouping", () => {
    expect(uiVocab.events["application.created"].category).toBe("application");
    expect(uiVocab.events["pricing.assigned"].category).toBe("pricing");
    expect(uiVocab.events["flra.cycle_start"].category).toBe("fair_lending");
  });

  it("events preserve trigger_type", () => {
    expect(uiVocab.events["application.created"].trigger_type).toBe("on_create");
    expect(uiVocab.events["account.transition.open_to_frozen"].trigger_type).toBe(
      "state_transition"
    );
  });

  it("events have source_entity for the vocabulary browser", () => {
    expect(uiVocab.events["application.created"].source_entity).toBe(
      "application"
    );
    expect(uiVocab.events["valuation.completed"].source_entity).toBe(
      "valuation"
    );
  });
});

// ═══════════════════════════════════════════════════════════
// 4. CATEGORIES
// ═══════════════════════════════════════════════════════════

describe("categories", () => {
  const EXPECTED_CATEGORIES = [
    "product",
    "application",
    "credit",
    "underwriting",
    "valuation",
    "decision",
    "exception",
    "pricing",
    "ofac",
    "prequalification",
    "fair_lending",
    "governance",
    "account",
    "vendor",
    "loan",
    "collections",
    "incident",
    "privacy",
    "risk",
    "policy",
  ];

  it.each(EXPECTED_CATEGORIES)("contains category: %s", (cat) => {
    expect(uiVocab.categories).toContain(cat);
  });

  it("categories are sorted alphabetically", () => {
    const sorted = [...uiVocab.categories].sort();
    expect(uiVocab.categories).toEqual(sorted);
  });

  it("every field belongs to a listed category", () => {
    for (const field of Object.values(uiVocab.fields)) {
      expect(uiVocab.categories).toContain(field.category);
    }
  });

  it("every event belongs to a listed category", () => {
    for (const event of Object.values(uiVocab.events)) {
      expect(uiVocab.categories).toContain(event.category);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 5. SEARCH INDEX
// ═══════════════════════════════════════════════════════════

describe("search index", () => {
  it("contains all fields and events", () => {
    const fieldEntries = searchIndex.filter((e) => e.type === "field");
    const eventEntries = searchIndex.filter((e) => e.type === "event");
    expect(fieldEntries.length).toBeGreaterThan(1000);
    expect(eventEntries.length).toBeGreaterThan(700);
  });

  it("every entry has id, type, category, label, and description", () => {
    for (const entry of searchIndex) {
      expect(entry.id).toBeTruthy();
      expect(entry.type).toMatch(/^(field|event)$/);
      expect(entry.category).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });

  it("field entries use entity.field IDs", () => {
    const field = searchIndex.find(
      (e) => e.type === "field" && e.label === "fico_score"
    )!;
    expect(field).toBeDefined();
    expect(field.id).toBe("credit.fico_score");
    expect(field.category).toBe("credit");
  });

  it("event entries use the event name as ID", () => {
    const event = searchIndex.find(
      (e) => e.type === "event" && e.id === "application.created"
    )!;
    expect(event).toBeDefined();
    expect(event.category).toBe("application");
  });
});
