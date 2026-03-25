/**
 * UHH FHIR Validation Client
 * ===========================
 * TypeScript integration layer connecting Unified-Health-Hub-1 server
 * to the BrainSAIT FHIR validation stack (SBS-GIVC/sbs nphies-bridge).
 *
 * Provides:
 *  - Pre-submission FHIR cardinality validation
 *  - SBS V3.1 code → FHIR Coding element conversion
 *  - SNOMED CT / LOINC / RxNorm bilingual lookups (AR/EN)
 *  - NPHIES-compliant bundle builder helpers
 */

// ─── Coding System URIs ──────────────────────────────────────────

export const FHIR_SYSTEMS = {
  icd10:       "http://hl7.org/fhir/sid/icd-10",
  icd10cm:     "http://hl7.org/fhir/sid/icd-10-cm",
  snomed:      "http://snomed.info/sct",
  loinc:       "http://loinc.org",
  rxnorm:      "http://www.nlm.nih.gov/research/umls/rxnorm",
  cpt:         "http://www.ama-assn.org/go/cpt",
  ucum:        "http://unitsofmeasure.org",
  // Saudi NPHIES
  sbs:         "http://nphies.sa/terminology/CodeSystem/sbs",
  nphiesDiag:  "http://nphies.sa/terminology/CodeSystem/diag-type",
  nphiesProc:  "http://nphies.sa/terminology/CodeSystem/procedure-type",
  nphiesDrug:  "http://nphies.sa/terminology/CodeSystem/medication-codes",
  nationalId:  "http://nphies.sa/identifier/nationalid",
  chiLicense:  "http://nphies.sa/identifier/chi-license",
} as const;

// ─── Type Definitions ────────────────────────────────────────────

export interface FHIRCoding {
  system: string;
  code: string;
  display: string;
  _display?: {
    extension: Array<{
      url: string;
      extension: Array<{ url: string; valueCode?: string; valueString?: string }>;
    }>;
  };
}

export interface FHIRCodeableConcept {
  coding: FHIRCoding[];
  text?: string;
}

export interface FHIRValidationIssue {
  code: string;
  description: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface FHIRValidationResult {
  resource_type: string;
  resource_id: string | null;
  is_valid: boolean;
  errors: FHIRValidationIssue[];
  warnings: FHIRValidationIssue[];
  info: FHIRValidationIssue[];
  nphies_warnings: string[];
  recommendations: string[];
  cardinality_violations: string[];
  summary: {
    error_count: number;
    warning_count: number;
    info_count: number;
    nphies_warning_count: number;
  };
}

export interface SBSCatalogueEntry {
  sbs_id: string;
  description_en?: string;
  description_ar?: string;
  category_id?: string;
  requires_prior_auth?: boolean;
}

// ─── SBS Catalogue Cache ─────────────────────────────────────────

let _sbsCatalogueCached: Record<string, SBSCatalogueEntry> | null = null;

/**
 * Load SBS catalogue from the server-side JSON file with in-memory caching.
 * Path: server/sbs_catalogue.json (Unified-Health-Hub-1 format)
 */
export function getSBSCatalogue(): Record<string, SBSCatalogueEntry> {
  if (_sbsCatalogueCached) return _sbsCatalogueCached;

  try {
    // In production this is loaded from the DB; here we use the bundled JSON fallback
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const raw = require("./sbs_catalogue.json") as {
      catalogue?: Record<string, SBSCatalogueEntry>;
    };
    _sbsCatalogueCached = raw.catalogue ?? (raw as unknown as Record<string, SBSCatalogueEntry>);
  } catch {
    _sbsCatalogueCached = {};
  }
  return _sbsCatalogueCached!;
}

// ─── Coding Builders ────────────────────────────────────────────

/**
 * Build a bilingual FHIR Coding element with Arabic translation extension.
 */
export function buildCoding(
  system: string,
  code: string,
  displayEn: string,
  displayAr?: string
): FHIRCoding {
  const coding: FHIRCoding = { system, code, display: displayEn };
  if (displayAr) {
    coding._display = {
      extension: [{
        url: "http://hl7.org/fhir/StructureDefinition/translation",
        extension: [
          { url: "lang", valueCode: "ar" },
          { url: "content", valueString: displayAr },
        ],
      }],
    };
  }
  return coding;
}

/**
 * Convert an SBS V3.1 code to a FHIR Coding element.
 */
export function sbsToFhirCoding(sbsId: string): FHIRCoding {
  const entry = getSBSCatalogue()[sbsId];
  return buildCoding(
    FHIR_SYSTEMS.sbs,
    sbsId,
    entry?.description_en ?? sbsId,
    entry?.description_ar
  );
}

/**
 * Build a FHIR CodeableConcept for an ICD-10 diagnosis code.
 */
export function buildIcd10Concept(
  code: string,
  displayEn: string,
  displayAr?: string
): FHIRCodeableConcept {
  return {
    coding: [buildCoding(FHIR_SYSTEMS.icd10, code, displayEn, displayAr)],
    text: displayEn,
  };
}

// ─── Cardinality Validation (client-side fast checks) ───────────

const REQUIRED_FIELDS: Record<string, string[]> = {
  Patient:  ["identifier", "name", "gender", "birthDate"],
  Claim:    ["status", "type", "use", "patient", "created", "insurer", "provider", "priority", "insurance", "item"],
  Coverage: ["status", "beneficiary", "payor"],
  CoverageEligibilityRequest: ["status", "purpose", "patient", "created", "provider", "insurer", "insurance"],
  Observation:       ["status", "code", "subject"],
  Condition:         ["clinicalStatus", "code", "subject"],
  MedicationRequest: ["status", "intent", "medication", "subject"],
};

const NPHIES_REQUIRED_EXTENSIONS: Record<string, string[]> = {
  Patient: [
    "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-nationality",
    "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-occupation",
  ],
  Claim: [
    "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-episode",
    "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-patientShare",
  ],
};

/**
 * Client-side cardinality validation for FHIR resources.
 * Mirrors the Python cardinality_validator.py logic in TypeScript.
 * Use for fast pre-flight checks before calling the SBS nphies-bridge.
 */
export function validateCardinality(
  resourceType: string,
  resource: Record<string, unknown>
): FHIRValidationResult {
  const required = REQUIRED_FIELDS[resourceType] ?? [];
  const missingRequired = required.filter((f) => !(f in resource));

  const nphiesExts = NPHIES_REQUIRED_EXTENSIONS[resourceType] ?? [];
  const nphiesWarnings: string[] = [];
  if (nphiesExts.length) {
    const existingUrls = ((resource.extension as Array<{ url?: string }>) ?? [])
      .map((e) => e.url ?? "");
    for (const extUrl of nphiesExts) {
      if (!existingUrls.includes(extUrl)) {
        nphiesWarnings.push(`NPHIES extension missing: ${extUrl}`);
      }
    }
  }

  const errors: FHIRValidationIssue[] = missingRequired.map((f) => ({
    code: `MISSING_${f.toUpperCase()}`,
    description: `Required field '${f}' is missing`,
    path: `${resourceType}.${f}`,
  }));

  const warnings: FHIRValidationIssue[] = nphiesWarnings.map((msg) => ({
    code: "NPHIES_EXTENSION_MISSING",
    description: msg,
  }));

  return {
    resource_type: resourceType,
    resource_id: (resource.id as string) ?? null,
    is_valid: errors.length === 0,
    errors,
    warnings,
    info: [],
    nphies_warnings: nphiesWarnings,
    recommendations: [],
    cardinality_violations: [],
    summary: {
      error_count: errors.length,
      warning_count: warnings.length,
      info_count: 0,
      nphies_warning_count: nphiesWarnings.length,
    },
  };
}

// ─── Remote SBS nphies-bridge Validator ─────────────────────────

const NPHIES_BRIDGE_URL = process.env.NPHIES_BRIDGE_URL ?? "http://localhost:8003";

/**
 * Validate a FHIR resource by calling the SBS nphies-bridge service.
 * Falls back gracefully to local cardinality check if the service is unavailable.
 */
export async function validateResourceRemote(
  resource: Record<string, unknown>
): Promise<FHIRValidationResult> {
  const resourceType = (resource.resourceType as string) ?? "Unknown";

  try {
    const resp = await fetch(`${NPHIES_BRIDGE_URL}/validate/resource`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resource),
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) throw new Error(`Bridge returned ${resp.status}`);
    return (await resp.json()) as FHIRValidationResult;
  } catch (err) {
    // Graceful degradation: run local cardinality check
    const local = validateCardinality(resourceType, resource);
    local.warnings.push({
      code: "REMOTE_VALIDATION_UNAVAILABLE",
      description: `SBS bridge unreachable, ran local checks only: ${(err as Error).message}`,
    });
    return local;
  }
}

// ─── NPHIES Bundle Builders ──────────────────────────────────────

function newUUID(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Build a FHIR Message Bundle for NPHIES claim submission.
 */
export function buildClaimMessageBundle(
  claimResource: Record<string, unknown>,
  patientResource: Record<string, unknown>,
  coverageResource: Record<string, unknown>,
  providerOrgId: string,
  payerOrgId: string
): Record<string, unknown> {
  const claimId = (claimResource.id as string) ?? newUUID();
  const messageHeader = {
    resourceType: "MessageHeader",
    id: newUUID(),
    meta: {
      profile: ["http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/message-header"],
    },
    eventCoding: {
      system: "http://nphies.sa/terminology/CodeSystem/ksa-message-events",
      code: "claim-request",
    },
    destination: [{
      endpoint: "http://nphies.sa/fhir/R4",
      receiver: { reference: `Organization/${payerOrgId}` },
    }],
    sender: { reference: `Organization/${providerOrgId}` },
    source: {
      endpoint: "http://brainsait.io/fhir",
      software: "BrainSAIT Unified Health Hub",
      version: "1.0.0",
    },
    focus: [{ reference: `Claim/${claimId}` }],
  };

  return {
    resourceType: "Bundle",
    id: newUUID(),
    meta: {
      lastUpdated: nowISO(),
      profile: ["http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/bundle"],
    },
    type: "message",
    timestamp: nowISO(),
    entry: [
      { fullUrl: `urn:uuid:${messageHeader.id}`, resource: messageHeader },
      { fullUrl: `urn:uuid:${patientResource.id ?? newUUID()}`, resource: patientResource },
      { fullUrl: `urn:uuid:${coverageResource.id ?? newUUID()}`, resource: coverageResource },
      { fullUrl: `urn:uuid:${claimId}`, resource: claimResource },
    ],
  };
}

/**
 * Build a FHIR Transaction Bundle for batch resource upserts.
 */
export function buildTransactionBundle(
  resources: Array<{ resource: Record<string, unknown>; method?: string; url?: string }>
): Record<string, unknown> {
  return {
    resourceType: "Bundle",
    id: newUUID(),
    meta: {
      lastUpdated: nowISO(),
      profile: ["http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/bundle"],
    },
    type: "transaction",
    timestamp: nowISO(),
    entry: resources.map(({ resource, method = "POST", url }) => ({
      fullUrl: `urn:uuid:${newUUID()}`,
      resource,
      request: {
        method,
        url: url ?? (resource.resourceType as string) ?? "Resource",
      },
    })),
  };
}
