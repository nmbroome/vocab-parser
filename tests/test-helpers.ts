/**
 * test-helpers.ts
 *
 * Shared fixtures and helpers for parser tests.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { parseSpec, ParseResult } from "../src/parser";

// ─────────────────────────────────────────────────────────────
// Real spec — loaded once, reused across test files
// ─────────────────────────────────────────────────────────────

let _cachedDoc: Record<string, any> | null = null;
let _cachedResult: ParseResult | null = null;

/**
 * Load the real Cassandra OpenAPI spec from disk.
 * Looks in the project root first, then falls back to
 * the output directory.
 */
export function loadSpecDoc(): Record<string, any> {
  if (_cachedDoc) return _cachedDoc;

  const candidates = [
    path.resolve(__dirname, "../cassandra-openapi.yaml"),
    path.resolve(__dirname, "../../cassandra-openapi.yaml"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      _cachedDoc = yaml.load(raw) as Record<string, any>;
      return _cachedDoc;
    }
  }

  throw new Error(
    `Cannot find cassandra-openapi.yaml. Looked in:\n${candidates.join("\n")}`
  );
}

/**
 * Parse the real spec and cache the result.
 */
export function parseRealSpec(): ParseResult {
  if (_cachedResult) return _cachedResult;
  const doc = loadSpecDoc();
  _cachedResult = parseSpec(doc);
  return _cachedResult;
}

// ─────────────────────────────────────────────────────────────
// Minimal spec fixtures for unit tests
// ─────────────────────────────────────────────────────────────

/**
 * Build a minimal valid OpenAPI doc with the given schemas and paths.
 */
export function buildSpec(opts: {
  schemas?: Record<string, any>;
  paths?: Record<string, any>;
}): Record<string, any> {
  return {
    openapi: "3.1.0",
    info: { title: "Test Spec", version: "0.0.1" },
    paths: opts.paths || {},
    components: {
      schemas: opts.schemas || {},
    },
  };
}

/**
 * Build a minimal entity schema with x-events and properties.
 */
export function buildEntitySchema(opts: {
  entity?: string;
  retention?: string;
  controlRefs?: string[];
  events?: Array<{ name: string; trigger?: string; condition?: string; description?: string }>;
  properties?: Record<string, any>;
  required?: string[];
}): Record<string, any> {
  return {
    type: "object",
    ...(opts.entity && { "x-entity": opts.entity }),
    ...(opts.retention && { "x-retention": opts.retention }),
    ...(opts.controlRefs && { "x-control-refs": opts.controlRefs }),
    ...(opts.events && {
      "x-events": opts.events.map((e) => ({
        name: e.name,
        trigger: e.trigger || "on_create",
        ...(e.condition && { condition: e.condition }),
        ...(e.description && { description: e.description }),
      })),
    }),
    required: opts.required || [],
    properties: opts.properties || {},
  };
}
