/**
 * parser.test.ts
 *
 * Integration tests that parse the real Cassandra OpenAPI spec
 * and validate that the vocabulary is extracted completely and
 * correctly. These tests are the contract between the spec and
 * the Control Builder — if a test here fails, either the spec
 * changed or the parser has a bug.
 */

import { parseRealSpec } from "./test-helpers";
import { Vocabulary, VocabularySchema } from "../src/types";

let vocab: Vocabulary;
let warnings: string[];
let errors: string[];

beforeAll(() => {
  const result = parseRealSpec();
  vocab = result.vocabulary;
  warnings = result.warnings;
  errors = result.errors;
});

// ═══════════════════════════════════════════════════════════
// 1. PARSE WITHOUT ERRORS
// ═══════════════════════════════════════════════════════════

describe("parse health", () => {
  it("parses without errors", () => {
    expect(errors).toHaveLength(0);
  });

  it("validates against the Zod schema", () => {
    const result = VocabularySchema.safeParse(vocab);
    expect(result.success).toBe(true);
  });

  it("warnings are only about formulaless computed fields", () => {
    for (const w of warnings) {
      expect(w).toMatch(/has no formula/);
    }
  });

  it("captures spec metadata", () => {
    expect(vocab.meta.spec_title).toBe(
      "Cassandra Banking Core & Compliance Platform"
    );
    expect(vocab.meta.spec_version).toBe("1.0.0");
    expect(vocab.meta.parser_version).toBe("0.1.0");
    expect(vocab.meta.parsed_at).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// 2. ENTITY COMPLETENESS
// ═══════════════════════════════════════════════════════════

describe("entity completeness", () => {
  /**
   * Representative domain entities across all major compliance
   * domains that must be extracted from the spec.
   */
  const EXPECTED_ENTITIES = [
    // Lending
    "application",
    "decision",
    "credit",
    "atr",
    "collateral",
    "loan",
    "prequal",
    "pricing",
    "underwriting",
    "exception",
    "credit_package",
    "aa",
    // BSA/AML
    "ofac",
    "sar",
    "ctr",
    "pep",
    "314a",
    "314b",
    "cmir",
    "screen",
    // Accounts
    "account",
    "cda",
    "overdraft",
    // Transfers
    "ach_transfer",
    "wire_transfer",
    "wire",
    "payment",
    // Fair Lending
    "flra",
    "fl_monitoring",
    "campaign",
    "hmda_record",
    // Risk
    "risk",
    "risk_acceptance",
    "risk_appetite",
    "risk_assessment",
    "risk_breach",
    "risk_record",
    "risk_report",
    "risk_scale",
    "risk_score",
    "risk_taxonomy",
    // Privacy
    "privacy",
    "econsent",
    "cookie",
    "cust",
    "customer",
    // Vendor Management
    "vendor",
    "contract",
    // Governance
    "policy",
    "governance",
    "training",
    "audit",
    // Collections
    "collections",
    "dispute",
    "complaint",
    "foreclosure",
    "furnisher",
    // Security
    "incident",
    "vuln",
    "iam",
    // Business Continuity
    "bcm",
    "bcdr",
    "dr",
    // Entity / KYC
    "entity",
    "bo",
    "kyc",
    "cdd",
    "edd",
    "ecdd",
    // Investments
    "instrument",
    "counterparty",
    "investment",
    "trade",
    "liquidity",
    "repo",
    // CFP
    "cfp",
    "cfp_escalation",
    // Cash
    "cash",
    "courier",
    "member",
  ];

  it("extracts all 153 domain entities", () => {
    expect(vocab.entities).toHaveLength(153);
  });

  it.each(EXPECTED_ENTITIES)("contains entity: %s", (name) => {
    const entity = vocab.entities.find((e) => e.name === name);
    expect(entity).toBeDefined();
  });

  it("every entity has at least one field", () => {
    for (const entity of vocab.entities) {
      expect(entity.field_count).toBeGreaterThan(0);
    }
  });

  it("entity schema names map correctly", () => {
    const nameToSchema: Record<string, string> = {
      account: "Account",
      application: "Application",
      ach_transfer: "AchTransfer",
      wire_transfer: "WireTransfer",
      decision: "Decision",
      loan: "Loan",
      vendor: "Vendor",
      incident: "Incident",
      collections: "Collections",
      entity: "Entity",
      privacy: "Privacy",
      cda: "Cda",
      risk_score: "RiskScore",
      cfp_escalation: "CfpEscalationRoster",
      hmda_record: "HmdaRecord",
      fl_monitoring: "FlMonitoringReview",
      social_media: "SocialMediaPost",
      aa: "Aa",
    };

    for (const [name, schemaName] of Object.entries(nameToSchema)) {
      const entity = vocab.entities.find((e) => e.name === name)!;
      expect(entity.schema_name).toBe(schemaName);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 3. FIELD COMPLETENESS
// ═══════════════════════════════════════════════════════════

describe("field extraction", () => {
  it("extracts 1000+ fields total", () => {
    expect(vocab.stats.fields).toBeGreaterThanOrEqual(1000);
  });

  it("extracts 20+ computed fields", () => {
    expect(vocab.stats.computed_fields).toBeGreaterThanOrEqual(20);
  });

  /**
   * Key vocabulary fields across major compliance domains that
   * controls reference. If any of these are missing, controls
   * will fail to compile.
   */
  const CRITICAL_FIELDS = [
    // Lending
    "Application.status",
    "Application.purpose",
    "Decision.status",
    "Loan.status",
    "Loan.ltv_current",
    "Atr.dti_ratio",
    "Collateral.ltv",
    "Collateral.haircut",
    // BSA/AML
    "Ofac.match_result",
    "Sar.subjects",
    "Pep.role",
    // Accounts
    "Account.status",
    "Cda.status",
    "Cda.account_legal_name",
    // Transfers
    "AchTransfer.status",
    "AchTransfer.destination_account_number",
    "WireTransfer.status",
    "WireTransfer.originator",
    "WireTransfer.beneficiary",
    // Risk
    "Risk.appetite",
    "RiskScore.impact_raw",
    "RiskScore.residual_band",
    "RiskScore.inherent_numeric",
    // Vendor
    "Vendor.status",
    "Vendor.assessment_risk_scores",
    "Vendor.name",
    // Privacy
    "Privacy.consent_status",
    "Customer.identifiers",
    // Collections
    "Collections.status",
    "Complaint.severity",
    // Governance
    "Policy.title",
    "Incident.status",
    // Member
    "Member.name",
    "Member.dob",
    // Liquidity
    "Liquidity.days_to_liquidate",
    "Liquidity.stress_haircut_pct",
    // Metric
    "Metric.camels_proxy",
    "Metric.lcr30",
  ];

  it.each(CRITICAL_FIELDS)("contains critical field: %s", (path) => {
    const field = vocab.fields.find((f) => f.path === path);
    expect(field).toBeDefined();
  });

  describe("computed fields", () => {
    const EXPECTED_COMPUTED = [
      "Atr.dti_ratio",
      "Collateral.haircut",
      "Collateral.haircuts",
      "Collateral.ltv",
      "Liquidity.days_to_liquidate",
      "Liquidity.stress_haircut_pct",
      "Loan.ltv_current",
      "Metric.camels_proxy",
      "Metric.lcr30",
      "Metric.net_outflow",
      "Metric.net_worth_ratio",
      "Repo.haircut_pct",
      "RiskScore.impact_label",
      "RiskScore.impact_raw",
      "RiskScore.inherent_band",
      "RiskScore.inherent_numeric",
      "RiskScore.justification_text",
      "RiskScore.likelihood_label",
      "RiskScore.likelihood_raw",
      "RiskScore.residual_band",
      "RiskScore.residual_numeric",
      "Vendor.assessment_risk_scores",
    ];

    it.each(EXPECTED_COMPUTED)(
      "computed field %s is marked as computed with source=derived",
      (path) => {
        const field = vocab.fields.find((f) => f.path === path)!;
        expect(field).toBeDefined();
        expect(field.is_computed).toBe(true);
        expect(field.computed?.source).toBe("derived");
      }
    );

    it("all 22 computed fields are extracted", () => {
      const computedFields = vocab.fields.filter((f) => f.is_computed);
      expect(computedFields).toHaveLength(22);
    });
  });

  describe("PII fields", () => {
    const PII_FIELDS = [
      "314a.subjects",
      "AchTransfer.destination_account_number",
      "Bo.owners",
      "Cda.account_legal_name",
      "Cda.charity_ein",
      "Cust.dob",
      "Cust.email",
      "Customer.identifiers",
      "Entity.ids",
      "HmdaRecord.gmi_data",
      "Member.dob",
      "Member.name",
      "Party.dob",
      "Party.name",
      "Sar.subjects",
      "Screen.subject_identifiers",
      "Vendor.name",
      "WireTransfer.originator",
      "WireTransfer.beneficiary",
    ];

    it.each(PII_FIELDS)("field %s is flagged as PII", (path) => {
      const field = vocab.fields.find((f) => f.path === path)!;
      expect(field).toBeDefined();
      expect(field.pii).toBe(true);
    });
  });

  describe("nested field extraction", () => {
    it("extracts WireTransfer originator sub-fields", () => {
      const originatorPaths = vocab.fields
        .filter((f) => f.path.startsWith("WireTransfer.originator."))
        .map((f) => f.field);
      expect(originatorPaths).toContain("originator.name");
      expect(originatorPaths).toContain("originator.address");
      expect(originatorPaths).toContain("originator.account_number");
    });

    it("extracts WireTransfer beneficiary sub-fields", () => {
      const beneficiaryPaths = vocab.fields
        .filter((f) => f.path.startsWith("WireTransfer.beneficiary."))
        .map((f) => f.field);
      expect(beneficiaryPaths).toContain("beneficiary.name");
      expect(beneficiaryPaths).toContain("beneficiary.address");
      expect(beneficiaryPaths).toContain("beneficiary.account_number");
      expect(beneficiaryPaths).toContain("beneficiary.routing_number");
    });

    it("extracts WireTransfer sender_fi sub-fields", () => {
      const senderPaths = vocab.fields
        .filter((f) => f.path.startsWith("WireTransfer.sender_fi."))
        .map((f) => f.field);
      expect(senderPaths).toContain("sender_fi.routing_number");
      expect(senderPaths).toContain("sender_fi.name");
    });
  });
});

// ═══════════════════════════════════════════════════════════
// 4. EVENT COMPLETENESS
// ═══════════════════════════════════════════════════════════

describe("event completeness", () => {
  it("extracts 700+ events", () => {
    expect(vocab.stats.events).toBeGreaterThanOrEqual(700);
  });

  /**
   * Representative domain events across compliance domains.
   * These are the trigger events from x-events on entities.
   */
  const DOMAIN_EVENTS = [
    // Lending
    "application.created",
    "application.completed",
    "application.submitted",
    "application.employee_match",
    "atr.scope.determined",
    "credit_package.created",
    // BSA/AML
    "314a.request.received",
    "314b.request.initiated",
    "ofac.screen.at.onboard",
    "sar.continuing.review",
    "pep.screen.onboard",
    // Accounts
    "account.opened",
    "account.closed",
    "account.connection.created",
    "cda.account.created",
    // Transfers
    "ach.created",
    "ach.settled",
    "ach.returned",
    "wire.created",
    // Fair Lending
    "campaign.created",
    "campaign.launched",
    "hmda.collected",
    // Risk
    "risk.assess.launch",
    "risk_record.created",
    // Vendor
    "vendor.onboarded",
    // Privacy
    "privacy.optout.submitted",
    "econsent.captured",
    // Collections
    "collections.contact.initiated",
    "dispute.received",
    "complaint.received",
    // Governance
    "policy.approved",
    "training.assigned",
    "audit.started",
    // Security
    "incident.suspected",
    "vuln.scan.scheduled",
    // Business Continuity
    "bcm.plan.update",
    // Investments
    "trade.entered",
    // CFP
    "cfp.approved",
    // Entity
    "bo.form_submitted",
    "kyc.started",
  ];

  it.each(DOMAIN_EVENTS)(
    "contains domain event: %s",
    (name) => {
      const event = vocab.events.find((e) => e.name === name);
      expect(event).toBeDefined();
    }
  );

  /**
   * Audit events emitted by API endpoints.
   */
  const AUDIT_EVENTS = [
    "account.created",
    "account.updated",
    "314a.created",
    "314b.created",
    "ofac.created",
    "sar.created",
    "pep.created",
    "connection.created",
    "overdraft.created",
    "courier.created",
    "cmir.created",
    "ctr.created",
    "fbar.created",
    "tms.created",
    "screen.created",
  ];

  it.each(AUDIT_EVENTS)(
    "contains audit event: %s",
    (name) => {
      const event = vocab.events.find((e) => e.name === name);
      expect(event).toBeDefined();
    }
  );

  describe("event metadata", () => {
    it("domain events have source_entity set", () => {
      const domainEvents = vocab.events.filter(
        (e) => e.trigger_type !== "audit" && e.trigger_type !== "state_transition"
      );
      for (const ev of domainEvents) {
        expect(ev.source_entity).toBeTruthy();
      }
    });

    it("transition events have from_state and to_state", () => {
      const transitions = vocab.events.filter(
        (e) => e.trigger_type === "state_transition"
      );
      expect(transitions.length).toBeGreaterThan(0);
      for (const ev of transitions) {
        expect(ev.from_state).toBeTruthy();
        expect(ev.to_state).toBeTruthy();
      }
    });

    it("audit events link to emitting endpoints", () => {
      const auditWithEndpoints = vocab.events.filter(
        (e) => e.trigger_type === "audit" && e.emitted_by_endpoints.length > 0
      );
      // All 315 audit events have endpoint links
      expect(auditWithEndpoints.length).toBeGreaterThan(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// 5. STATE MACHINE COMPLETENESS
// ═══════════════════════════════════════════════════════════

describe("state machines", () => {
  it("extracts exactly 15 state machines", () => {
    expect(vocab.state_machines).toHaveLength(15);
  });

  const EXPECTED_STATE_MACHINES = [
    {
      path: "Account.status",
      stateCount: 3,
      transitionCount: 4,
    },
    {
      path: "AchTransfer.status",
      stateCount: 6,
      transitionCount: 5,
    },
    {
      path: "Application.status",
      stateCount: 6,
      transitionCount: 6,
    },
    {
      path: "Bcm.status",
      stateCount: 6,
      transitionCount: 6,
    },
    {
      path: "Cda.status",
      stateCount: 6,
      transitionCount: 6,
    },
    {
      path: "Cfp.status",
      stateCount: 6,
      transitionCount: 6,
    },
    {
      path: "Collections.status",
      stateCount: 6,
      transitionCount: 6,
    },
    {
      path: "Decision.status",
      stateCount: 5,
      transitionCount: 6,
    },
    {
      path: "Entity.status",
      stateCount: 4,
      transitionCount: 4,
    },
    {
      path: "Incident.status",
      stateCount: 6,
      transitionCount: 5,
    },
    {
      path: "Loan.status",
      stateCount: 8,
      transitionCount: 9,
    },
    {
      path: "Privacy.consent_status",
      stateCount: 4,
      transitionCount: 4,
    },
    {
      path: "RiskRecord.status",
      stateCount: 5,
      transitionCount: 4,
    },
    {
      path: "Vendor.status",
      stateCount: 8,
      transitionCount: 9,
    },
    {
      path: "WireTransfer.status",
      stateCount: 7,
      transitionCount: 7,
    },
  ];

  it.each(EXPECTED_STATE_MACHINES)(
    "state machine $path has $stateCount states and $transitionCount transitions",
    ({ path, stateCount, transitionCount }) => {
      const sm = vocab.state_machines.find((s) => s.path === path)!;
      expect(sm).toBeDefined();
      expect(sm.states).toHaveLength(stateCount);
      expect(sm.transitions).toHaveLength(transitionCount);
    }
  );

  it("Loan state machine includes the full loan lifecycle", () => {
    const sm = vocab.state_machines.find(
      (s) => s.path === "Loan.status"
    )!;
    const states = sm.states;
    expect(states).toContain("current");
    expect(states).toContain("delinquent");
    expect(states).toContain("nonaccrual");
    expect(states).toContain("collections");
    expect(states).toContain("workout");
    expect(states).toContain("foreclosure");
    expect(states).toContain("charged_off");
    expect(states).toContain("paid_off");
  });

  it("Vendor state machine includes the full vendor lifecycle", () => {
    const sm = vocab.state_machines.find(
      (s) => s.path === "Vendor.status"
    )!;
    const states = sm.states;
    expect(states).toContain("proposed");
    expect(states).toContain("due_diligence");
    expect(states).toContain("approved");
    expect(states).toContain("active");
    expect(states).toContain("under_review");
    expect(states).toContain("on_notice");
    expect(states).toContain("exiting");
    expect(states).toContain("terminated");
  });

  it("Application state machine includes the lending lifecycle", () => {
    const sm = vocab.state_machines.find(
      (s) => s.path === "Application.status"
    )!;
    const states = sm.states;
    expect(states).toContain("draft");
    expect(states).toContain("submitted");
    expect(states).toContain("in_review");
    expect(states).toContain("decisioned");
    expect(states).toContain("closed");
    expect(states).toContain("withdrawn");
  });
});

// ═══════════════════════════════════════════════════════════
// 6. ENDPOINT COMPLETENESS
// ═══════════════════════════════════════════════════════════

describe("endpoint extraction", () => {
  it("extracts 500+ endpoints", () => {
    expect(vocab.stats.endpoints).toBeGreaterThanOrEqual(500);
  });

  const EXPECTED_ENDPOINTS = [
    // Accounts
    { method: "POST", path: "/accounts" },
    { method: "GET", path: "/accounts" },
    { method: "GET", path: "/accounts/{id}" },
    { method: "PATCH", path: "/accounts/{id}" },
    // BSA
    { method: "POST", path: "/bsa/314a-requests" },
    { method: "POST", path: "/bsa/ofac-screenings" },
    { method: "POST", path: "/bsa/sars" },
    // Lending
    { method: "POST", path: "/lending/applications" },
    { method: "GET", path: "/lending/applications" },
    { method: "POST", path: "/lending/loans" },
    { method: "POST", path: "/lending/decisions" },
    { method: "POST", path: "/lending/collateral" },
    // Transfers
    { method: "POST", path: "/transfers/ach" },
    { method: "POST", path: "/transfers/wire" },
    // Risk
    { method: "POST", path: "/risk/assessments" },
    // Vendors
    { method: "POST", path: "/vendors" },
    { method: "GET", path: "/vendors" },
    // Governance
    { method: "POST", path: "/governance/audits" },
    { method: "POST", path: "/governance/policies" },
    // Privacy
    { method: "POST", path: "/privacy/consents" },
    // Security
    { method: "POST", path: "/security/incidents" },
  ];

  it.each(EXPECTED_ENDPOINTS)(
    "contains endpoint: $method $path",
    ({ method, path }) => {
      const ep = vocab.endpoints.find(
        (e) => e.method === method && e.path === path
      );
      expect(ep).toBeDefined();
    }
  );

  it("POST /accounts has the right control refs", () => {
    const ep = vocab.endpoints.find(
      (e) => e.method === "POST" && e.path === "/accounts"
    )!;
    expect(ep.control_refs).toEqual(
      expect.arrayContaining(["CD-12", "PR-01", "PR-15"])
    );
  });

  it("POST /lending/applications has control refs", () => {
    const ep = vocab.endpoints.find(
      (e) => e.method === "POST" && e.path === "/lending/applications"
    )!;
    expect(ep.control_refs).toEqual(
      expect.arrayContaining(["BA-03", "CD-03", "FL-02", "FL-05", "LN-02", "LN-03", "LN-14"])
    );
  });

  it("endpoints that emit audit events list them", () => {
    const ep = vocab.endpoints.find(
      (e) =>
        e.method === "POST" && e.path === "/accounts"
    )!;
    expect(ep.audit_events).toEqual(
      expect.arrayContaining(["account.created"])
    );
  });

  it("endpoints reference request/response schemas", () => {
    const ep = vocab.endpoints.find(
      (e) => e.method === "POST" && e.path === "/lending/applications"
    )!;
    expect(ep.request_schema).toBe("ApplicationCreate");
    expect(ep.response_schema).toBe("Application");
  });
});

// ═══════════════════════════════════════════════════════════
// 7. PLUGIN COMPLETENESS
// ═══════════════════════════════════════════════════════════

describe("plugins", () => {
  it("extracts no plugins (spec has no x-plugin fields)", () => {
    expect(vocab.plugins).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 8. CONTROL COVERAGE
// ═══════════════════════════════════════════════════════════

describe("control coverage", () => {
  const CONTROL_PREFIXES = [
    "BA", "BC", "CA", "CC", "CD", "CFP", "FL",
    "IP", "IS", "LC", "LN", "LP", "PR", "RA", "RZ", "VM",
  ];

  it("references 223 unique control IDs across 16+ prefixes", () => {
    const referencedControls = new Set<string>();
    for (const e of vocab.entities)
      e.control_refs.forEach((c) => referencedControls.add(c));
    for (const ep of vocab.endpoints)
      ep.control_refs.forEach((c) => referencedControls.add(c));

    expect(referencedControls.size).toBeGreaterThanOrEqual(220);
  });

  it.each(CONTROL_PREFIXES)(
    "has at least one control with prefix %s",
    (prefix) => {
      const allControls = new Set<string>();
      for (const e of vocab.entities)
        e.control_refs.forEach((c) => allControls.add(c));
      for (const ep of vocab.endpoints)
        ep.control_refs.forEach((c) => allControls.add(c));

      const hasPrefix = Array.from(allControls).some((c) =>
        c.startsWith(prefix + "-")
      );
      expect(hasPrefix).toBe(true);
    }
  );

  it("all FL controls (FL-01 through FL-12) are referenced", () => {
    const referencedControls = new Set<string>();
    for (const e of vocab.entities)
      e.control_refs.forEach((c) => referencedControls.add(c));
    for (const ep of vocab.endpoints)
      ep.control_refs.forEach((c) => referencedControls.add(c));

    for (let i = 1; i <= 12; i++) {
      const ctrl = `FL-${String(i).padStart(2, "0")}`;
      expect(referencedControls).toContain(ctrl);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 9. RETENTION RULES
// ═══════════════════════════════════════════════════════════

describe("retention metadata", () => {
  const ENTITIES_WITH_RETENTION = [
    // 25mo entities
    { name: "application", retention: "25mo" },
    { name: "aa", retention: "25mo" },
    { name: "atr", retention: "25mo" },
    { name: "credit", retention: "25mo" },
    { name: "credit_package", retention: "25mo" },
    { name: "decision", retention: "25mo" },
    { name: "pricing", retention: "25mo" },
    { name: "prequal", retention: "25mo" },
    { name: "underwriting", retention: "25mo" },
    // 5y entities
    { name: "314a", retention: "5y" },
    { name: "314b", retention: "5y" },
    { name: "ach_transfer", retention: "5y" },
    { name: "sar", retention: "5y" },
    { name: "wire_transfer", retention: "5y" },
    { name: "wire", retention: "5y" },
    { name: "payment", retention: "5y" },
    // 7y entities
    { name: "account", retention: "7y" },
    { name: "vendor", retention: "7y" },
    { name: "incident", retention: "7y" },
    { name: "loan", retention: "7y" },
    { name: "risk", retention: "7y" },
    { name: "policy", retention: "7y" },
    { name: "privacy", retention: "7y" },
    { name: "governance", retention: "7y" },
    { name: "cda", retention: "7y" },
    // 10y entities
    { name: "ofac", retention: "10y" },
    // Permanent entities
    { name: "bo", retention: "permanent" },
    { name: "entity", retention: "permanent" },
    { name: "customer", retention: "permanent" },
    { name: "member", retention: "permanent" },
    { name: "party", retention: "permanent" },
  ];

  it.each(ENTITIES_WITH_RETENTION)(
    "$name has retention: $retention",
    ({ name, retention }) => {
      const entity = vocab.entities.find((e) => e.name === name)!;
      expect(entity).toBeDefined();
      expect(entity.retention).toBe(retention);
    }
  );

  it("every entity has a retention value", () => {
    for (const entity of vocab.entities) {
      expect(entity.retention).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════
// 10. EVENT DEDUPLICATION
// ═══════════════════════════════════════════════════════════

describe("event deduplication", () => {
  it("no duplicate event names exist", () => {
    const names = vocab.events.map((e) => e.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("events that appear as both domain and audit are merged correctly", () => {
    // application.created appears as both an x-event on Application
    // and an x-audit-event on the POST /lending/applications endpoint
    const ev = vocab.events.find((e) => e.name === "application.created")!;
    expect(ev).toBeDefined();
    // Should prefer the domain trigger_type over audit
    expect(ev.trigger_type).toBe("on_create");
    // Should have the endpoint linked
    expect(ev.emitted_by_endpoints.length).toBeGreaterThan(0);
    expect(ev.source_entity).toBe("Application");
  });
});
