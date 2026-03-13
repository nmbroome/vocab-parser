import {
  isEntitySchema,
  extractEntity,
  extractFields,
  extractDomainEvents,
  extractTransitionEvents,
  extractAuditEvents,
  extractPlugins,
} from "../src/extractors";
import { buildEntitySchema } from "./test-helpers";

describe("extractors", () => {
  // ── isEntitySchema ──────────────────────────────────────

  describe("isEntitySchema", () => {
    it("identifies schemas with x-entity", () => {
      expect(isEntitySchema("Foo", { "x-entity": "foo" })).toBe(true);
    });

    it("identifies schemas with x-events", () => {
      expect(
        isEntitySchema("Foo", { "x-events": [{ name: "foo.created" }] })
      ).toBe(true);
    });

    it("rejects List wrappers", () => {
      expect(isEntitySchema("FooList", { properties: {} })).toBe(false);
    });

    it("rejects Create/Update schemas", () => {
      expect(isEntitySchema("FooCreate", { properties: {} })).toBe(false);
      expect(isEntitySchema("FooUpdate", { properties: {} })).toBe(false);
    });

    it("rejects Error schema", () => {
      expect(isEntitySchema("Error", { type: "object" })).toBe(false);
    });

    it("rejects Request/Resolve schemas", () => {
      expect(isEntitySchema("OFACScreeningRequest", {})).toBe(false);
      expect(isEntitySchema("ExceptionResolve", {})).toBe(false);
    });
  });

  // ── extractEntity ───────────────────────────────────────

  describe("extractEntity", () => {
    it("extracts entity name from x-entity", () => {
      const schema = buildEntitySchema({
        entity: "application",
        controlRefs: ["FL-03"],
        properties: { id: { type: "string" }, name: { type: "string" } },
      });
      const entity = extractEntity("Application", schema);
      expect(entity.name).toBe("application");
      expect(entity.schema_name).toBe("Application");
      expect(entity.field_count).toBe(2);
      expect(entity.control_refs).toContain("FL-03");
    });

    it("falls back to snake_case of schema name when no x-entity", () => {
      const schema = buildEntitySchema({
        events: [{ name: "foo.created" }],
        properties: { id: { type: "string" } },
      });
      const entity = extractEntity("CreditReport", schema);
      expect(entity.name).toBe("credit_report");
    });

    it("counts computed fields", () => {
      const schema = buildEntitySchema({
        entity: "test",
        properties: {
          id: { type: "string" },
          derived: { type: "number", "x-computed": { source: "id", formula: "len(id)" } },
          also_derived: { type: "boolean", "x-computed": { source: "id" } },
        },
      });
      const entity = extractEntity("Test", schema);
      expect(entity.computed_field_count).toBe(2);
    });

    it("detects state machine fields", () => {
      const schema = buildEntitySchema({
        entity: "order",
        properties: {
          status: {
            type: "string",
            enum: ["open", "closed"],
            "x-state-machine": {
              transitions: [{ from: "open", to: "closed", event: "order.closed" }],
            },
          },
        },
      });
      const entity = extractEntity("Order", schema);
      expect(entity.state_machine_field).toBe("status");
    });

    it("collects event names", () => {
      const schema = buildEntitySchema({
        entity: "widget",
        events: [
          { name: "widget.created" },
          { name: "widget.updated" },
        ],
        properties: {},
      });
      const entity = extractEntity("Widget", schema);
      expect(entity.events).toEqual(["widget.created", "widget.updated"]);
    });
  });

  // ── extractFields ───────────────────────────────────────

  describe("extractFields", () => {
    it("extracts basic field metadata", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        required: ["id", "name"],
        properties: {
          id: { type: "string", description: "Unique ID" },
          name: { type: "string" },
          count: { type: "integer", nullable: true },
        },
      });

      const fields = extractFields("Thing", schema);
      const idField = fields.find((f) => f.field === "id")!;
      expect(idField.path).toBe("Thing.id");
      expect(idField.entity).toBe("Thing");
      expect(idField.type).toBe("string");
      expect(idField.required).toBe(true);
      expect(idField.description).toBe("Unique ID");

      const countField = fields.find((f) => f.field === "count")!;
      expect(countField.nullable).toBe(true);
      expect(countField.required).toBe(false);
    });

    it("extracts enum values", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          status: { type: "string", enum: ["active", "inactive"] },
        },
      });
      const fields = extractFields("Thing", schema);
      expect(fields[0].enum_values).toEqual(["active", "inactive"]);
    });

    it("extracts array types with item enums", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          tags: {
            type: "array",
            items: { type: "string", enum: ["a", "b", "c"] },
          },
        },
      });
      const fields = extractFields("Thing", schema);
      expect(fields[0].type).toBe("array<string>");
      expect(fields[0].enum_values).toEqual(["a", "b", "c"]);
    });

    it("extracts x-pii flag", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          ssn: { type: "string", "x-pii": true },
          name: { type: "string" },
        },
      });
      const fields = extractFields("Thing", schema);
      expect(fields.find((f) => f.field === "ssn")!.pii).toBe(true);
      expect(fields.find((f) => f.field === "name")!.pii).toBe(false);
    });

    it("extracts x-computed metadata", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          ratio: {
            type: "number",
            "x-computed": {
              source: "[a, b]",
              description: "A divided by B",
              formula: "a / b",
            },
          },
        },
      });
      const fields = extractFields("Thing", schema);
      const ratio = fields[0];
      expect(ratio.is_computed).toBe(true);
      expect(ratio.computed!.formula).toBe("a / b");
      expect(ratio.computed!.source).toBe("[a, b]");
    });

    it("extracts x-plugin from top-level", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          result: { type: "boolean", "x-plugin": "my_plugin" },
        },
      });
      const fields = extractFields("Thing", schema);
      expect(fields[0].plugin).toBe("my_plugin");
    });

    it("extracts x-plugin nested inside x-computed", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          flag: {
            type: "boolean",
            "x-computed": {
              source: "[a, b]",
              description: "Derived flag",
              "x-plugin": "checker",
            },
          },
        },
      });
      const fields = extractFields("Thing", schema);
      expect(fields[0].plugin).toBe("checker");
    });

    it("extracts x-freshness constraints", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          age_days: {
            type: "integer",
            "x-freshness": { max_age: "180d", description: "Must be fresh" },
          },
        },
      });
      const fields = extractFields("Thing", schema);
      expect(fields[0].freshness).toEqual({
        max_age: "180d",
        description: "Must be fresh",
      });
    });

    it("detects state machine fields", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          status: {
            type: "string",
            enum: ["a", "b"],
            "x-state-machine": { transitions: [] },
          },
        },
      });
      const fields = extractFields("Thing", schema);
      expect(fields[0].is_state_machine).toBe(true);
    });

    it("inherits control refs from parent entity", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        controlRefs: ["FL-01", "FL-02"],
        properties: {
          name: { type: "string" },
        },
      });
      const fields = extractFields("Thing", schema, ["FL-01", "FL-02"]);
      expect(fields[0].bound_controls).toContain("FL-01");
    });

    it("recurses into inline nested objects", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          nested: {
            type: "object",
            properties: {
              inner_a: { type: "string" },
              inner_b: { type: "integer" },
            },
          },
        },
      });
      const fields = extractFields("Thing", schema);
      // Should have: nested, nested.inner_a, nested.inner_b
      const paths = fields.map((f) => f.path);
      expect(paths).toContain("Thing.nested");
      expect(paths).toContain("Thing.nested.inner_a");
      expect(paths).toContain("Thing.nested.inner_b");
    });

    it("skips $ref properties (handled as separate entities)", () => {
      const schema = buildEntitySchema({
        entity: "thing",
        properties: {
          id: { type: "string" },
          related: { $ref: "#/components/schemas/Other" },
        },
      });
      const fields = extractFields("Thing", schema);
      expect(fields.map((f) => f.field)).not.toContain("related");
    });
  });

  // ── extractDomainEvents ─────────────────────────────────

  describe("extractDomainEvents", () => {
    it("extracts events from x-events", () => {
      const schema = buildEntitySchema({
        events: [
          { name: "app.created", trigger: "on_create", description: "App created" },
          { name: "app.updated", trigger: "on_update", condition: "status == 'active'" },
        ],
      });
      const events = extractDomainEvents("App", schema);
      expect(events).toHaveLength(2);
      expect(events[0].name).toBe("app.created");
      expect(events[0].source_entity).toBe("App");
      expect(events[0].trigger_type).toBe("on_create");
      expect(events[1].condition).toBe("status == 'active'");
    });

    it("returns empty array when no x-events", () => {
      expect(extractDomainEvents("Foo", { type: "object" })).toHaveLength(0);
    });
  });

  // ── extractTransitionEvents ─────────────────────────────

  describe("extractTransitionEvents", () => {
    it("extracts state machine transitions as events", () => {
      const schema = buildEntitySchema({
        properties: {
          status: {
            type: "string",
            enum: ["open", "closed", "archived"],
            "x-state-machine": {
              transitions: [
                { from: "open", to: "closed", event: "order.closed" },
                { from: "closed", to: "archived", event: "order.archived" },
              ],
            },
          },
        },
      });

      const { events, stateMachine } = extractTransitionEvents("Order", schema);

      expect(events).toHaveLength(2);
      expect(events[0].name).toBe("order.closed");
      expect(events[0].trigger_type).toBe("state_transition");
      expect(events[0].from_state).toBe("open");
      expect(events[0].to_state).toBe("closed");

      expect(stateMachine).not.toBeNull();
      expect(stateMachine!.path).toBe("Order.status");
      expect(stateMachine!.states).toEqual(["open", "closed", "archived"]);
      expect(stateMachine!.transitions).toHaveLength(2);
    });

    it("returns null state machine when no x-state-machine field", () => {
      const schema = buildEntitySchema({
        properties: { name: { type: "string" } },
      });
      const { events, stateMachine } = extractTransitionEvents("Foo", schema);
      expect(events).toHaveLength(0);
      expect(stateMachine).toBeNull();
    });
  });

  // ── extractAuditEvents ──────────────────────────────────

  describe("extractAuditEvents", () => {
    it("extracts audit events from x-audit-events", () => {
      const operation = {
        "x-audit-events": ["thing.logged", "thing.approved"],
        "x-control-refs": ["FL-01"],
      };
      const events = extractAuditEvents("post", "/things", operation);
      expect(events).toHaveLength(2);
      expect(events[0].name).toBe("thing.logged");
      expect(events[0].trigger_type).toBe("audit");
      expect(events[0].emitted_by_endpoints).toContain("POST /things");
      expect(events[0].bound_controls).toContain("FL-01");
    });

    it("returns empty array when no x-audit-events", () => {
      expect(extractAuditEvents("get", "/things", {})).toHaveLength(0);
    });
  });

  // ── extractPlugins ──────────────────────────────────────

  describe("extractPlugins", () => {
    it("groups fields by plugin name", () => {
      const fields = [
        { path: "A.x", plugin: "screener", bound_controls: ["FL-11"] },
        { path: "B.y", plugin: "screener", bound_controls: ["FL-11", "FL-03"] },
        { path: "C.z", plugin: "calculator", bound_controls: ["FL-10"] },
        { path: "D.w", plugin: null, bound_controls: [] },
      ] as any;

      const plugins = extractPlugins(fields);
      expect(plugins).toHaveLength(2);

      const screener = plugins.find((p) => p.name === "screener")!;
      expect(screener.resolves_fields).toEqual(["A.x", "B.y"]);
      expect(screener.bound_controls).toEqual(
        expect.arrayContaining(["FL-11", "FL-03"])
      );

      const calc = plugins.find((p) => p.name === "calculator")!;
      expect(calc.resolves_fields).toEqual(["C.z"]);
    });

    it("returns empty array when no plugins", () => {
      const fields = [{ path: "A.x", plugin: null }] as any;
      expect(extractPlugins(fields)).toHaveLength(0);
    });
  });
});
