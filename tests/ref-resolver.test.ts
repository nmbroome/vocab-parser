import {
  resolvePointer,
  deepResolve,
  flattenComposition,
  refToSchemaName,
} from "../src/ref-resolver";

describe("ref-resolver", () => {
  describe("resolvePointer", () => {
    const doc = {
      components: {
        schemas: {
          Foo: { type: "object", properties: { bar: { type: "string" } } },
          Nested: { deep: { value: 42 } },
        },
        parameters: {
          PageId: { name: "page_id", in: "path" },
        },
      },
    };

    it("resolves a direct schema reference", () => {
      const result = resolvePointer(doc, "#/components/schemas/Foo");
      expect(result.type).toBe("object");
      expect(result.properties.bar.type).toBe("string");
    });

    it("resolves a deeply nested path", () => {
      expect(resolvePointer(doc, "#/components/schemas/Nested/deep/value")).toBe(42);
    });

    it("throws on external $ref", () => {
      expect(() => resolvePointer(doc, "./other.yaml#/Foo")).toThrow("external");
    });

    it("throws on missing path", () => {
      expect(() =>
        resolvePointer(doc, "#/components/schemas/Missing")
      ).toThrow("not found");
    });
  });

  describe("deepResolve", () => {
    it("resolves $ref inside a property", () => {
      const doc = {
        components: {
          schemas: {
            Addr: { type: "object", properties: { city: { type: "string" } } },
            Person: {
              type: "object",
              properties: {
                name: { type: "string" },
                address: { $ref: "#/components/schemas/Addr" },
              },
            },
          },
        },
      };
      const resolved = deepResolve(doc, doc.components.schemas.Person);
      expect(resolved.properties.address.properties.city.type).toBe("string");
    });

    it("resolves $ref inside arrays", () => {
      const doc = {
        components: { schemas: { Item: { type: "string" } } },
        items: [{ $ref: "#/components/schemas/Item" }, { type: "integer" }],
      };
      const resolved = deepResolve(doc, doc.items);
      expect(resolved[0]).toEqual({ type: "string" });
      expect(resolved[1]).toEqual({ type: "integer" });
    });

    it("handles circular references without infinite loop", () => {
      const doc = {
        components: {
          schemas: {
            Node: {
              type: "object",
              properties: { child: { $ref: "#/components/schemas/Node" } },
            },
          },
        },
      };
      const resolved = deepResolve(doc, doc.components.schemas.Node);
      expect(resolved.type).toBe("object");
    });

    it("preserves x- extensions through resolution", () => {
      const doc = { components: { schemas: {} } };
      const node = { type: "string", "x-pii": true, "x-retention": "7y" };
      const resolved = deepResolve(doc, node);
      expect(resolved["x-pii"]).toBe(true);
      expect(resolved["x-retention"]).toBe("7y");
    });
  });

  describe("flattenComposition", () => {
    it("merges allOf schemas into a single property map", () => {
      const schema = {
        allOf: [
          { type: "object", required: ["a"], properties: { a: { type: "string" } } },
          { required: ["b"], properties: { b: { type: "integer" } } },
        ],
      };
      const flat = flattenComposition(schema);
      expect(flat.properties.a).toBeDefined();
      expect(flat.properties.b).toBeDefined();
      expect(flat.required).toEqual(expect.arrayContaining(["a", "b"]));
    });

    it("preserves x- extensions from allOf members", () => {
      const flat = flattenComposition({
        allOf: [
          { "x-entity": "widget", properties: {} },
          { "x-retention": "7y", properties: {} },
        ],
      });
      expect(flat["x-entity"]).toBe("widget");
      expect(flat["x-retention"]).toBe("7y");
    });

    it("returns the schema as-is when no allOf", () => {
      const schema = { type: "object", properties: { x: { type: "string" } } };
      expect(flattenComposition(schema)).toEqual(schema);
    });

    it("handles null/undefined gracefully", () => {
      expect(flattenComposition(null as any)).toEqual({});
      expect(flattenComposition(undefined as any)).toEqual({});
    });
  });

  describe("refToSchemaName", () => {
    it("extracts the final segment from a $ref path", () => {
      expect(refToSchemaName("#/components/schemas/LendingProduct")).toBe("LendingProduct");
    });
  });
});
