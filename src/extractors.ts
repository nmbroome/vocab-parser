/**
 * extractors.ts
 *
 * Functions that extract entities, fields, events, and plugins
 * from resolved OpenAPI schemas.
 */

import type { Entity, Field, VocabEvent, Plugin } from "./types";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Convert PascalCase to snake_case */
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/** Suffixes that indicate wrapper schemas, not domain entities */
const WRAPPER_SUFFIXES = ["List", "Create", "Update", "Request", "Resolve"];
const EXCLUDED_NAMES = ["Error"];

// ─────────────────────────────────────────────────────────────
// isEntitySchema
// ─────────────────────────────────────────────────────────────

/**
 * Determine if a schema represents a domain entity.
 * Entity schemas either have x-entity or x-events, and
 * are not List/Create/Update/Error wrappers.
 */
export function isEntitySchema(
  name: string,
  schema: Record<string, any>
): boolean {
  if (EXCLUDED_NAMES.includes(name)) return false;
  for (const suffix of WRAPPER_SUFFIXES) {
    if (name.endsWith(suffix)) return false;
  }

  return !!(schema["x-entity"] || schema["x-events"]);
}

// ─────────────────────────────────────────────────────────────
// extractEntity
// ─────────────────────────────────────────────────────────────

/**
 * Extract entity-level metadata from a schema.
 */
export function extractEntity(
  schemaName: string,
  schema: Record<string, any>
): Entity {
  const properties = schema.properties || {};
  const propKeys = Object.keys(properties);

  // Count computed fields
  let computedCount = 0;
  for (const prop of Object.values(properties) as any[]) {
    if (prop["x-computed"]) computedCount++;
  }

  // Find state machine field
  let stateMachineField: string | null = null;
  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    if (prop["x-state-machine"]) {
      stateMachineField = key;
      break;
    }
  }

  // Collect event names
  const events: string[] = [];
  if (schema["x-events"] && Array.isArray(schema["x-events"])) {
    for (const ev of schema["x-events"]) {
      events.push(ev.name);
    }
  }

  return {
    name: schema["x-entity"] || toSnakeCase(schemaName),
    schema_name: schemaName,
    field_count: propKeys.length,
    computed_field_count: computedCount,
    state_machine_field: stateMachineField,
    events,
    control_refs: schema["x-control-refs"] || [],
    retention: schema["x-retention"] || null,
  };
}

// ─────────────────────────────────────────────────────────────
// extractFields
// ─────────────────────────────────────────────────────────────

/**
 * Extract field metadata from an entity schema's properties.
 * Recurses into inline nested objects. Skips $ref properties.
 */
export function extractFields(
  schemaName: string,
  schema: Record<string, any>,
  controlRefs?: string[],
  prefix?: string
): Field[] {
  const fields: Field[] = [];
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  const controls = controlRefs || schema["x-control-refs"] || [];

  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    // Skip $ref properties — they are handled as separate entities
    if (prop.$ref) continue;

    const fieldName = prefix ? `${prefix}.${key}` : key;
    const path = `${schemaName}.${fieldName}`;

    // Determine type
    let type = prop.type || "object";
    if (type === "array" && prop.items) {
      const itemType = prop.items.type || "object";
      type = `array<${itemType}>`;
    }

    // Extract enum values (from property or array items)
    let enumValues: string[] | null = null;
    if (prop.enum) {
      enumValues = prop.enum;
    } else if (prop.items?.enum) {
      enumValues = prop.items.enum;
    }

    // Extract computed metadata
    const xComputed = prop["x-computed"];
    let isComputed = false;
    let computed: { source?: string; description?: string; formula?: string } | null = null;
    if (xComputed) {
      isComputed = true;
      computed = {
        ...(xComputed.source && { source: xComputed.source }),
        ...(xComputed.description && { description: xComputed.description }),
        ...(xComputed.formula && { formula: xComputed.formula }),
      };
    }

    // Extract plugin (from top-level or nested inside x-computed)
    let plugin: string | null = prop["x-plugin"] || null;
    if (!plugin && xComputed && xComputed["x-plugin"]) {
      plugin = xComputed["x-plugin"];
    }

    // Extract freshness
    let freshness: { max_age: string; description?: string } | null = null;
    if (prop["x-freshness"]) {
      freshness = {
        max_age: prop["x-freshness"].max_age,
        ...(prop["x-freshness"].description && {
          description: prop["x-freshness"].description,
        }),
      };
    }

    fields.push({
      path,
      field: fieldName,
      entity: schemaName,
      type,
      required: required.has(key),
      nullable: prop.nullable || false,
      description: prop.description || "",
      enum_values: enumValues,
      pii: prop["x-pii"] || false,
      is_computed: isComputed,
      computed,
      plugin,
      freshness,
      is_state_machine: !!prop["x-state-machine"],
      bound_controls: controls,
    });

    // Recurse into inline nested objects
    if (prop.type === "object" && prop.properties && !prop.$ref) {
      const nested = extractFields(schemaName, prop, controls, fieldName);
      fields.push(...nested);
    }
  }

  return fields;
}

// ─────────────────────────────────────────────────────────────
// extractDomainEvents
// ─────────────────────────────────────────────────────────────

/**
 * Extract domain events from x-events on an entity schema.
 */
export function extractDomainEvents(
  schemaName: string,
  schema: Record<string, any>
): VocabEvent[] {
  const xEvents = schema["x-events"];
  if (!xEvents || !Array.isArray(xEvents)) return [];

  return xEvents.map((ev: any) => ({
    name: ev.name,
    source_entity: schemaName,
    trigger_type: ev.trigger || "on_create",
    description: ev.description || "",
    condition: ev.condition || null,
    from_state: null,
    to_state: null,
    emitted_by_endpoints: [],
    bound_controls: schema["x-control-refs"] || [],
  }));
}

// ─────────────────────────────────────────────────────────────
// extractTransitionEvents
// ─────────────────────────────────────────────────────────────

/**
 * Extract state machine transition events from properties
 * that have x-state-machine.
 */
export function extractTransitionEvents(
  schemaName: string,
  schema: Record<string, any>
): {
  events: VocabEvent[];
  stateMachine: {
    path: string;
    states: string[];
    transitions: { from: string; to: string; event: string }[];
  } | null;
} {
  const properties = schema.properties || {};
  const events: VocabEvent[] = [];
  let stateMachine: {
    path: string;
    states: string[];
    transitions: { from: string; to: string; event: string }[];
  } | null = null;

  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    const sm = prop["x-state-machine"];
    if (!sm) continue;

    const path = `${schemaName}.${key}`;
    const states = prop.enum || [];
    const transitions = (sm.transitions || []).map((t: any) => ({
      from: t.from,
      to: t.to,
      event: t.event,
    }));

    stateMachine = { path, states, transitions };

    for (const t of transitions) {
      events.push({
        name: t.event,
        source_entity: schemaName,
        trigger_type: "state_transition",
        description: `Transition from ${t.from} to ${t.to}`,
        condition: null,
        from_state: t.from,
        to_state: t.to,
        emitted_by_endpoints: [],
        bound_controls: schema["x-control-refs"] || [],
      });
    }
  }

  return { events, stateMachine };
}

// ─────────────────────────────────────────────────────────────
// extractAuditEvents
// ─────────────────────────────────────────────────────────────

/**
 * Extract audit events from x-audit-events on a path operation.
 */
export function extractAuditEvents(
  method: string,
  path: string,
  operation: Record<string, any>
): VocabEvent[] {
  const auditEvents = operation["x-audit-events"];
  if (!auditEvents || !Array.isArray(auditEvents)) return [];

  const endpoint = `${method.toUpperCase()} ${path}`;
  const controls = operation["x-control-refs"] || [];

  return auditEvents.map((name: string) => ({
    name,
    source_entity: "",
    trigger_type: "audit",
    description: `Audit event emitted by ${endpoint}`,
    condition: null,
    from_state: null,
    to_state: null,
    emitted_by_endpoints: [endpoint],
    bound_controls: controls,
  }));
}

// ─────────────────────────────────────────────────────────────
// extractPlugins
// ─────────────────────────────────────────────────────────────

/**
 * Group fields by their plugin name to produce Plugin entries.
 */
export function extractPlugins(fields: Field[]): Plugin[] {
  const pluginMap = new Map<
    string,
    { fields: string[]; controls: Set<string> }
  >();

  for (const field of fields) {
    if (!field.plugin) continue;

    if (!pluginMap.has(field.plugin)) {
      pluginMap.set(field.plugin, { fields: [], controls: new Set() });
    }
    const entry = pluginMap.get(field.plugin)!;
    entry.fields.push(field.path);
    for (const c of field.bound_controls) {
      entry.controls.add(c);
    }
  }

  return Array.from(pluginMap.entries()).map(([name, data]) => ({
    name,
    resolves_fields: data.fields,
    bound_controls: [...data.controls],
  }));
}
