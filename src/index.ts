/**
 * Public API exports for @cassandra/vocabulary-parser
 */

export { parseSpec } from "./parser";
export type { ParseResult } from "./parser";

export { translateToUI, generateSearchIndex } from "./ui-translator";

export {
  resolvePointer,
  deepResolve,
  flattenComposition,
  refToSchemaName,
} from "./ref-resolver";

export {
  isEntitySchema,
  extractEntity,
  extractFields,
  extractDomainEvents,
  extractTransitionEvents,
  extractAuditEvents,
  extractPlugins,
} from "./extractors";

export type {
  Vocabulary,
  Entity,
  Field,
  VocabEvent,
  Endpoint,
  StateMachine,
  Plugin,
  UIVocabulary,
  UIField,
  UIEvent,
  SearchEntry,
} from "./types";

export { VocabularySchema, UIVocabularySchema } from "./types";
