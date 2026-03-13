/**
 * parser.ts
 *
 * Orchestrator that runs 10 phases to extract a complete
 * vocabulary from a resolved OpenAPI document.
 */

import { deepResolve, flattenComposition, refToSchemaName } from "./ref-resolver";
import {
  isEntitySchema,
  extractEntity,
  extractFields,
  extractDomainEvents,
  extractTransitionEvents,
  extractAuditEvents,
  extractPlugins,
} from "./extractors";
import { VocabularySchema } from "./types";
import type {
  Vocabulary,
  Entity,
  Field,
  VocabEvent,
  Endpoint,
  StateMachine,
  Plugin,
} from "./types";

const PARSER_VERSION = "0.1.0";

export interface ParseResult {
  vocabulary: Vocabulary;
  warnings: string[];
  errors: string[];
}

/**
 * Parse an OpenAPI document into a Vocabulary.
 * The doc should be a parsed JS object (e.g., from js-yaml).
 */
export function parseSpec(doc: Record<string, any>): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // ── Phase 1: Resolve refs ──────────────────────────────────
  const resolved = deepResolve(doc, doc);
  const schemas = resolved.components?.schemas || {};

  // Flatten allOf in all schemas
  const flatSchemas: Record<string, any> = {};
  for (const [name, schema] of Object.entries(schemas) as [string, any][]) {
    flatSchemas[name] = flattenComposition(schema);
  }

  // ── Phase 2: Extract endpoints ─────────────────────────────
  // Use the ORIGINAL doc for schema name extraction ($ref values
  // are gone after deep resolution), but use resolved doc for
  // everything else.
  const endpoints: Endpoint[] = [];
  const paths = resolved.paths || {};
  const originalPaths = doc.paths || {};
  const schemaToEndpoints = new Map<string, string[]>();

  for (const [pathStr, pathItem] of Object.entries(paths) as [string, any][]) {
    const origPathItem = (originalPaths[pathStr] || {}) as Record<string, any>;
    const methods = ["get", "post", "put", "patch", "delete"];
    for (const method of methods) {
      const op = pathItem[method];
      if (!op) continue;
      const origOp = origPathItem[method] || {};

      const controlRefs = op["x-control-refs"] || pathItem["x-control-refs"] || [];
      const auditEventNames = op["x-audit-events"] || [];

      // Extract request schema name from ORIGINAL doc (before $ref resolution)
      let requestSchema: string | null = null;
      const origReqBody = origOp.requestBody;
      if (origReqBody?.content) {
        const jsonContent =
          origReqBody.content["application/json"] || Object.values(origReqBody.content)[0];
        if (jsonContent?.schema?.$ref) {
          requestSchema = refToSchemaName(jsonContent.schema.$ref);
        }
      }

      // Extract response schema name from ORIGINAL doc
      let responseSchema: string | null = null;
      const origResponses = origOp.responses || {};
      const origSuccessResponse =
        origResponses["201"] || origResponses["200"] || origResponses["202"];
      if (origSuccessResponse?.content) {
        const jsonContent =
          origSuccessResponse.content["application/json"] ||
          Object.values(origSuccessResponse.content)[0];
        if (jsonContent?.schema?.$ref) {
          responseSchema = refToSchemaName(jsonContent.schema.$ref);
        }
      }

      const endpointStr = `${method.toUpperCase()} ${pathStr}`;

      // Track which schemas are referenced by endpoints
      if (requestSchema) {
        if (!schemaToEndpoints.has(requestSchema)) {
          schemaToEndpoints.set(requestSchema, []);
        }
        schemaToEndpoints.get(requestSchema)!.push(endpointStr);
      }
      if (responseSchema) {
        if (!schemaToEndpoints.has(responseSchema)) {
          schemaToEndpoints.set(responseSchema, []);
        }
        schemaToEndpoints.get(responseSchema)!.push(endpointStr);
      }

      endpoints.push({
        method: method.toUpperCase(),
        path: pathStr,
        summary: op.summary || "",
        control_refs: controlRefs,
        audit_events: auditEventNames,
        request_schema: requestSchema,
        response_schema: responseSchema,
      });
    }
  }

  // ── Phase 3: Extract entities ──────────────────────────────
  const entities: Entity[] = [];
  const entitySchemaNames: string[] = [];

  for (const [name, schema] of Object.entries(flatSchemas) as [string, any][]) {
    if (isEntitySchema(name, schema)) {
      entities.push(extractEntity(name, schema));
      entitySchemaNames.push(name);
    }
  }

  // ── Phase 4: Extract fields ────────────────────────────────
  const allFields: Field[] = [];
  for (const schemaName of entitySchemaNames) {
    const schema = flatSchemas[schemaName];
    const entity = entities.find((e) => e.schema_name === schemaName)!;
    const fields = extractFields(schemaName, schema, entity.control_refs);
    allFields.push(...fields);
  }

  // ── Phase 5: Extract domain events ─────────────────────────
  const domainEvents: VocabEvent[] = [];
  for (const schemaName of entitySchemaNames) {
    const schema = flatSchemas[schemaName];
    domainEvents.push(...extractDomainEvents(schemaName, schema));
  }

  // ── Phase 6: Extract transition events ─────────────────────
  const stateMachines: StateMachine[] = [];
  const transitionEvents: VocabEvent[] = [];

  for (const schemaName of entitySchemaNames) {
    const schema = flatSchemas[schemaName];
    const { events, stateMachine } = extractTransitionEvents(schemaName, schema);
    transitionEvents.push(...events);
    if (stateMachine) {
      stateMachines.push(stateMachine);
    }
  }

  // ── Phase 7: Extract audit events from endpoints ───────────
  const auditEvents: VocabEvent[] = [];
  for (const [pathStr, pathItem] of Object.entries(paths) as [string, any][]) {
    const methods = ["get", "post", "put", "patch", "delete"];
    for (const method of methods) {
      const op = pathItem[method];
      if (!op) continue;
      auditEvents.push(...extractAuditEvents(method, pathStr, op));
    }
  }

  // ── Phase 8: Deduplicate events ────────────────────────────
  // Merge events that appear in multiple places. Prefer domain
  // metadata over audit metadata.
  const eventMap = new Map<string, VocabEvent>();

  // Domain events first (highest priority)
  for (const ev of domainEvents) {
    eventMap.set(ev.name, { ...ev });
  }

  // Transition events
  for (const ev of transitionEvents) {
    if (!eventMap.has(ev.name)) {
      eventMap.set(ev.name, { ...ev });
    }
  }

  // Audit events — merge endpoints and controls into existing
  for (const ev of auditEvents) {
    if (eventMap.has(ev.name)) {
      const existing = eventMap.get(ev.name)!;
      // Merge emitted_by_endpoints
      for (const ep of ev.emitted_by_endpoints) {
        if (!existing.emitted_by_endpoints.includes(ep)) {
          existing.emitted_by_endpoints.push(ep);
        }
      }
      // Merge bound_controls
      for (const c of ev.bound_controls) {
        if (!existing.bound_controls.includes(c)) {
          existing.bound_controls.push(c);
        }
      }
    } else {
      eventMap.set(ev.name, { ...ev });
    }
  }

  const allEvents = Array.from(eventMap.values());

  // ── Phase 9: Cross-reference ───────────────────────────────
  // Link events ↔ endpoints, propagate control refs
  for (const ep of endpoints) {
    const epStr = `${ep.method} ${ep.path}`;
    for (const auditName of ep.audit_events) {
      const ev = eventMap.get(auditName);
      if (ev && !ev.emitted_by_endpoints.includes(epStr)) {
        ev.emitted_by_endpoints.push(epStr);
      }
      if (ev) {
        for (const c of ep.control_refs) {
          if (!ev.bound_controls.includes(c)) {
            ev.bound_controls.push(c);
          }
        }
      }
    }
  }

  // ── Phase 10: Extract plugins ──────────────────────────────
  const plugins: Plugin[] = extractPlugins(allFields);

  // ── Phase 11: Validate ─────────────────────────────────────
  // Warn about computed fields without formulas
  for (const field of allFields) {
    if (field.is_computed && (!field.computed || !field.computed.formula)) {
      warnings.push(`${field.path} has no formula`);
    }
  }

  const vocabulary: Vocabulary = {
    meta: {
      spec_title: doc.info?.title || "",
      spec_version: doc.info?.version || "",
      parser_version: PARSER_VERSION,
      parsed_at: new Date().toISOString(),
    },
    stats: {
      entities: entities.length,
      fields: allFields.length,
      computed_fields: allFields.filter((f) => f.is_computed).length,
      events: allEvents.length,
      endpoints: endpoints.length,
      state_machines: stateMachines.length,
      plugins: plugins.length,
    },
    entities,
    fields: allFields,
    events: allEvents,
    endpoints,
    state_machines: stateMachines,
    plugins,
  };

  // Validate against Zod schema
  const result = VocabularySchema.safeParse(vocabulary);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`Schema validation: ${issue.path.join(".")} — ${issue.message}`);
    }
  }

  return { vocabulary, warnings, errors };
}
