/**
 * SBS ↔ FHIR Shared Type Definitions
 * =====================================
 * TypeScript types for the Unified-Health-Hub-1 / BrainSAIT SBS data model
 * aligned to FHIR R4 and NPHIES Saudi profile conventions.
 */

// ─── FHIR Core ───────────────────────────────────────────────────

export interface FHIRReference {
  reference: string;
  display?: string;
}

export interface FHIRMoney {
  value: number;
  currency: "SAR";
}

export interface FHIRPeriod {
  start?: string;
  end?: string;
}

export interface FHIRIdentifier {
  system: string;
  value: string;
  type?: {
    coding: Array<{ system: string; code: string; display?: string }>;
  };
}

export interface FHIRHumanName {
  family: string;
  given: string[];
  text?: string;
  use?: "official" | "usual" | "nickname" | "anonymous" | "old" | "maiden";
}

export interface FHIRAddress {
  use?: "home" | "work" | "temp" | "old" | "billing";
  line?: string[];
  city?: string;
  district?: string;
  country?: string;
}

export interface FHIRExtension {
  url: string;
  valueCode?: string;
  valueString?: string;
  valueBoolean?: boolean;
  valueDecimal?: number;
  valueMoney?: FHIRMoney;
  valueReference?: FHIRReference;
  extension?: FHIRExtension[];
}

// ─── SBS V3.1 ────────────────────────────────────────────────────

/** A single entry from the SBS V3.1 Catalogue */
export interface SBSCode {
  sbs_id: string;
  description_en: string;
  description_ar: string;
  category_id: string;
  category_name_en?: string;
  category_name_ar?: string;
  requires_prior_auth: boolean;
  dental?: boolean;
  price?: number;
}

/** SBS V3.1 catalogue JSON structure (server/sbs_catalogue.json) */
export interface SBSCatalogue {
  version: string;
  source: string;
  generated_at: string;
  total_codes: number;
  catalogue: Record<string, SBSCode>;
}

/** SBS category with both language labels */
export interface SBSCategory {
  id: string;
  name_en: string;
  name_ar: string;
}

/** FHIR Coding element representing an SBS code */
export interface SBSFHIRCoding {
  system: "http://nphies.sa/terminology/CodeSystem/sbs";
  code: string;
  display: string;
  _display?: {
    extension: Array<{
      url: "http://hl7.org/fhir/StructureDefinition/translation";
      extension: Array<
        | { url: "lang"; valueCode: "ar" }
        | { url: "content"; valueString: string }
      >;
    }>;
  };
}

// ─── NPHIES Claim Types ──────────────────────────────────────────

/** Claim item aligned to NPHIES FHIR profile */
export interface NPHIESClaimItem {
  sequence: number;
  productOrService: {
    coding: SBSFHIRCoding[];
  };
  servicedDate?: string;
  quantity?: { value: number };
  unitPrice?: FHIRMoney;
  net?: FHIRMoney;
  modifier?: Array<{ coding: Array<{ system: string; code: string }> }>;
  bodySite?: { coding: Array<{ system: string; code: string }> };
  informationSequence?: number[];
  careTeamSequence?: number[];
  diagnosisSequence?: number[];
}

/** Claim resource for NPHIES submission */
export interface NPHIESClaim {
  resourceType: "Claim";
  id?: string;
  meta?: {
    profile?: string[];
    lastUpdated?: string;
  };
  identifier?: FHIRIdentifier[];
  status: "active" | "cancelled" | "draft" | "entered-in-error";
  type: {
    coding: Array<{ system: string; code: string; display?: string }>;
  };
  subType?: {
    coding: Array<{ system: string; code: string; display?: string }>;
  };
  use: "claim" | "preauthorization" | "predetermination";
  patient: FHIRReference;
  billablePeriod?: FHIRPeriod;
  created: string;
  insurer: FHIRReference;
  provider: FHIRReference;
  priority: {
    coding: Array<{ system: string; code: string }>;
  };
  fundsReserve?: { coding: Array<{ system: string; code: string }> };
  related?: Array<{ claim: FHIRReference; relationship?: { coding: Array<{ code: string }> } }>;
  payee?: {
    type: { coding: Array<{ code: string }> };
    party?: FHIRReference;
  };
  careTeam?: Array<{
    sequence: number;
    provider: FHIRReference;
    role?: { coding: Array<{ system: string; code: string }> };
    qualification?: { coding: Array<{ system: string; code: string }> };
  }>;
  supportingInfo?: Array<{
    sequence: number;
    category: { coding: Array<{ system: string; code: string }> };
    code?: { coding: Array<{ system: string; code: string }> };
    valueString?: string;
    valueQuantity?: { value: number; unit?: string; system?: string; code?: string };
    valueAttachment?: { contentType: string; data: string };
  }>;
  diagnosis?: Array<{
    sequence: number;
    diagnosisCodeableConcept: {
      coding: Array<{ system: string; code: string; display?: string }>;
    };
    type?: Array<{ coding: Array<{ system: string; code: string }> }>;
  }>;
  procedure?: Array<{
    sequence: number;
    procedureCodeableConcept: {
      coding: Array<{ system: string; code: string; display?: string }>;
    };
  }>;
  insurance: Array<{
    sequence: number;
    focal: boolean;
    coverage: FHIRReference;
    preAuthRef?: string[];
  }>;
  accident?: {
    date: string;
    type?: { coding: Array<{ system: string; code: string }> };
  };
  item: NPHIESClaimItem[];
  total: FHIRMoney;
  extension?: FHIRExtension[];
}

// ─── NPHIES Patient Types ────────────────────────────────────────

export interface NPHIESPatient {
  resourceType: "Patient";
  id?: string;
  meta?: { profile?: string[] };
  identifier: FHIRIdentifier[];
  name: FHIRHumanName[];
  telecom?: Array<{ system: string; value: string; use?: string }>;
  gender: "male" | "female" | "other" | "unknown";
  birthDate: string;
  address?: FHIRAddress[];
  extension?: FHIRExtension[];
}

// ─── NPHIES Coverage Types ───────────────────────────────────────

export interface NPHIESCoverage {
  resourceType: "Coverage";
  id?: string;
  meta?: { profile?: string[] };
  identifier?: FHIRIdentifier[];
  status: "active" | "cancelled" | "draft" | "entered-in-error";
  type?: {
    coding: Array<{ system: string; code: string; display?: string }>;
  };
  policyHolder?: FHIRReference;
  subscriber?: FHIRReference;
  subscriberId?: string;
  beneficiary: FHIRReference;
  dependent?: string;
  relationship?: { coding: Array<{ system: string; code: string }> };
  period?: FHIRPeriod;
  payor: FHIRReference[];
  class?: Array<{
    type: { coding: Array<{ system: string; code: string }> };
    value: string;
    name?: string;
  }>;
  network?: string;
  extension?: FHIRExtension[];
}

// ─── DB → FHIR Mappers (UHH schema.ts alignment) ────────────────

/**
 * Maps the UHH DB claim record (from Drizzle schema) to an NPHIESClaim shell.
 * Fill in item-level fields from the caller.
 */
export interface UHHClaimRecord {
  id: number;
  patientId: string;
  coverageId: string;
  providerId: string;
  payerId: string;
  status: string;
  totalAmount: string;
  claimType?: string;
  createdAt: Date;
}

/**
 * Maps the UHH DB prior-auth request to NPHIES pre-auth claim.
 */
export interface UHHPriorAuthRecord {
  id: number;
  patientId: string;
  coverageId: string;
  sbsCodes: string[];        // Array of SBS V3.1 codes
  diagnosisCodes: string[];  // ICD-10 codes
  providerId: string;
  payerId: string;
  status: string;
}
