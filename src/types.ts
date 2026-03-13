import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Zod Schemas — Parser Output
// ─────────────────────────────────────────────────────────────

export const MetaSchema = z.object({
  spec_title: z.string(),
  spec_version: z.string(),
  parser_version: z.string(),
  parsed_at: z.string(),
});

export const EntitySchema = z.object({
  name: z.string(),
  schema_name: z.string(),
  field_count: z.number(),
  computed_field_count: z.number(),
  state_machine_field: z.string().nullable(),
  events: z.array(z.string()),
  control_refs: z.array(z.string()),
  retention: z.string().nullable(),
});

export const ComputedSchema = z.object({
  source: z.string().optional(),
  description: z.string().optional(),
  formula: z.string().optional(),
});

export const FreshnessSchema = z.object({
  max_age: z.string(),
  description: z.string().optional(),
});

export const FieldSchema = z.object({
  path: z.string(),
  field: z.string(),
  entity: z.string(),
  type: z.string(),
  required: z.boolean(),
  nullable: z.boolean(),
  description: z.string(),
  enum_values: z.array(z.string()).nullable(),
  pii: z.boolean(),
  is_computed: z.boolean(),
  computed: ComputedSchema.nullable(),
  plugin: z.string().nullable(),
  freshness: FreshnessSchema.nullable(),
  is_state_machine: z.boolean(),
  bound_controls: z.array(z.string()),
});

export const EventSchema = z.object({
  name: z.string(),
  source_entity: z.string(),
  trigger_type: z.string(),
  description: z.string(),
  condition: z.string().nullable(),
  from_state: z.string().nullable(),
  to_state: z.string().nullable(),
  emitted_by_endpoints: z.array(z.string()),
  bound_controls: z.array(z.string()),
});

export const TransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  event: z.string(),
});

export const StateMachineSchema = z.object({
  path: z.string(),
  states: z.array(z.string()),
  transitions: z.array(TransitionSchema),
});

export const EndpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  summary: z.string(),
  control_refs: z.array(z.string()),
  audit_events: z.array(z.string()),
  request_schema: z.string().nullable(),
  response_schema: z.string().nullable(),
});

export const PluginSchema = z.object({
  name: z.string(),
  resolves_fields: z.array(z.string()),
  bound_controls: z.array(z.string()),
});

export const StatsSchema = z.object({
  entities: z.number(),
  fields: z.number(),
  computed_fields: z.number(),
  events: z.number(),
  endpoints: z.number(),
  state_machines: z.number(),
  plugins: z.number(),
});

export const VocabularySchema = z.object({
  meta: MetaSchema,
  stats: StatsSchema,
  entities: z.array(EntitySchema),
  fields: z.array(FieldSchema),
  events: z.array(EventSchema),
  endpoints: z.array(EndpointSchema),
  state_machines: z.array(StateMachineSchema),
  plugins: z.array(PluginSchema),
});

export type Vocabulary = z.infer<typeof VocabularySchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Field = z.infer<typeof FieldSchema>;
export type VocabEvent = z.infer<typeof EventSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type StateMachine = z.infer<typeof StateMachineSchema>;
export type Plugin = z.infer<typeof PluginSchema>;

// ─────────────────────────────────────────────────────────────
// Zod Schemas — UI Format
// ─────────────────────────────────────────────────────────────

export const UIFieldSchema = z.object({
  type: z.string(),
  category: z.string(),
  entity: z.string(),
  computed: z.boolean(),
  pii: z.boolean(),
  enum_values: z.array(z.string()).nullable(),
  plugin: z.string().nullable(),
  description: z.string(),
  required: z.boolean(),
  nullable: z.boolean(),
  freshness: FreshnessSchema.nullable().optional(),
  is_state_machine: z.boolean().optional(),
  bound_controls: z.array(z.string()).optional(),
});

export const UIEventSchema = z.object({
  description: z.string(),
  category: z.string(),
  trigger_type: z.string(),
  source_entity: z.string(),
  condition: z.string().nullable().optional(),
  from_state: z.string().nullable().optional(),
  to_state: z.string().nullable().optional(),
  bound_controls: z.array(z.string()).optional(),
});

export const UIVocabularySchema = z.object({
  fields: z.record(z.string(), UIFieldSchema),
  events: z.record(z.string(), UIEventSchema),
  categories: z.array(z.string()),
  entities: z.array(z.string()),
});

export type UIVocabulary = z.infer<typeof UIVocabularySchema>;
export type UIField = z.infer<typeof UIFieldSchema>;
export type UIEvent = z.infer<typeof UIEventSchema>;

// ─────────────────────────────────────────────────────────────
// Search Index
// ─────────────────────────────────────────────────────────────

export interface SearchEntry {
  id: string;
  type: "field" | "event";
  category: string;
  label: string;
  description: string;
}
