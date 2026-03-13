/**
 * ref-resolver.ts
 *
 * Resolves $ref pointers, flattens allOf compositions,
 * and handles circular references.
 */

/**
 * Resolve a JSON Pointer ($ref) within a document.
 * Only supports local references (starting with #/).
 */
export function resolvePointer(doc: Record<string, any>, ref: string): any {
  if (!ref.startsWith("#/")) {
    throw new Error(`Cannot resolve external $ref: ${ref}`);
  }

  const segments = ref.slice(2).split("/");
  let current: any = doc;

  for (const seg of segments) {
    if (current == null || typeof current !== "object") {
      throw new Error(`$ref path not found: ${ref}`);
    }
    current = current[seg];
  }

  if (current === undefined) {
    throw new Error(`$ref path not found: ${ref}`);
  }

  return current;
}

/**
 * Recursively resolve all $ref pointers in a node.
 * Tracks the current resolution stack to detect circular refs
 * while allowing the same $ref to be resolved in different branches.
 */
export function deepResolve(
  doc: Record<string, any>,
  node: any,
  resolving: Set<string> = new Set()
): any {
  if (node == null || typeof node !== "object") {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item) => deepResolve(doc, item, resolving));
  }

  // Handle $ref
  if (node.$ref && typeof node.$ref === "string") {
    if (resolving.has(node.$ref)) {
      // Circular reference — return the node as-is to prevent infinite loop
      return { ...node };
    }
    resolving.add(node.$ref);
    const resolved = resolvePointer(doc, node.$ref);
    const result = deepResolve(doc, resolved, resolving);
    resolving.delete(node.$ref);
    return result;
  }

  // Recurse into object properties
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] = deepResolve(doc, value, resolving);
  }
  return result;
}

/**
 * Flatten allOf compositions into a single merged schema.
 * Merges properties, required arrays, and x- extensions.
 */
export function flattenComposition(schema: any): any {
  if (schema == null) return {};

  if (!schema.allOf) {
    return schema;
  }

  const merged: Record<string, any> = {};
  const mergedProperties: Record<string, any> = {};
  const mergedRequired: string[] = [];

  for (const member of schema.allOf) {
    // Copy x- extensions and other top-level keys
    for (const [key, value] of Object.entries(member)) {
      if (key === "properties" || key === "required") continue;
      if (key === "allOf") continue;
      merged[key] = value;
    }

    // Merge properties
    if (member.properties) {
      Object.assign(mergedProperties, member.properties);
    }

    // Merge required arrays
    if (member.required && Array.isArray(member.required)) {
      mergedRequired.push(...member.required);
    }
  }

  merged.properties = mergedProperties;
  if (mergedRequired.length > 0) {
    merged.required = [...new Set(mergedRequired)];
  }

  return merged;
}

/**
 * Extract the schema name from a $ref path.
 * e.g., "#/components/schemas/LendingProduct" → "LendingProduct"
 */
export function refToSchemaName(ref: string): string {
  const segments = ref.split("/");
  return segments[segments.length - 1];
}
