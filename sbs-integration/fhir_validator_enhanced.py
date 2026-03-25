"""
SBS nphies-bridge — Enhanced FHIR Validator
============================================
Merges BrainSAIT FHIRValidator (existing nphies-bridge/fhir_validator.py)
with the Anthropic FHIR Developer Agent Skill cardinality + coding modules.

Drop-in replacement for nphies-bridge/fhir_validator.py that:
  1. Keeps full backward compatibility (FHIRValidator, ValidationResult, ValidationSeverity)
  2. Adds full NPHIES cardinality rule enforcement from cardinality_validator.py
  3. Adds SNOMED CT / RxNorm / LOINC coding awareness from coding_systems.py
  4. Adds SBS V3 ↔ FHIR bridge lookups via sbs_fhir_bridge.py
  5. Adds validate_bundle_entries() for batch pre-flight checks

Usage (non-breaking):
    from fhir_validator_enhanced import FHIRValidator, ValidationResult, ValidationSeverity

Deployment:
    cp sbs-integration/fhir_validator_enhanced.py \\
       /path/to/sbs/nphies-bridge/fhir_validator.py
"""

from __future__ import annotations

import json
import logging
import re
import sys
import os
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

# ── Make the packages/fhir modules importable ───────────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_FHIR_PKG = os.path.join(_THIS_DIR, "..", "packages", "fhir")
if _FHIR_PKG not in sys.path:
    sys.path.insert(0, os.path.join(_THIS_DIR, ".."))

try:
    from packages.fhir.cardinality_validator import (
        REQUIRED_FIELDS,
        OPTIONAL_BUT_RECOMMENDED,
        NPHIES_REQUIRED_EXTENSIONS,
        CARDINALITY_RULES,
        validate_cardinality as _skill_validate_cardinality,
        validate_bundle_entries as skill_validate_bundle_entries,
        get_cardinality_help,
    )
    from packages.fhir.coding_systems import (
        CODING_SYSTEMS,
        SNOMED_ARABIC,
        RXNORM_ARABIC,
        LOINC_ARABIC,
        build_coding,
    )
    from packages.fhir.sbs_fhir_bridge import SBSFHIRBridge

    _SKILL_AVAILABLE = True
except ImportError:
    _SKILL_AVAILABLE = False

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# SECTION 1 — Enums & base classes (unchanged from original)
# ═══════════════════════════════════════════════════════════════════

class ValidationSeverity(Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationResult:
    """Result of FHIR validation — backward-compatible with original implementation."""

    def __init__(self, resource_type: str, resource_id: str | None = None):
        self.resource_type = resource_type
        self.resource_id = resource_id
        self.errors: List[Dict[str, Any]] = []
        self.warnings: List[Dict[str, Any]] = []
        self.info: List[Dict[str, Any]] = []
        self.is_valid = True
        # Enhanced fields from FHIR skill
        self.nphies_warnings: List[str] = []
        self.recommendations: List[str] = []
        self.cardinality_violations: List[str] = []

    def add_issue(
        self,
        severity: ValidationSeverity,
        code: str,
        description: str,
        path: str | None = None,
        details: Dict[str, Any] | None = None,
    ) -> None:
        issue = {
            "code": code,
            "description": description,
            "path": path,
            "details": details or {},
        }
        if severity == ValidationSeverity.ERROR:
            self.errors.append(issue)
            self.is_valid = False
        elif severity == ValidationSeverity.WARNING:
            self.warnings.append(issue)
        else:
            self.info.append(issue)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "is_valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "info": self.info,
            "nphies_warnings": self.nphies_warnings,
            "recommendations": self.recommendations,
            "cardinality_violations": self.cardinality_violations,
            "summary": {
                "error_count": len(self.errors),
                "warning_count": len(self.warnings),
                "info_count": len(self.info),
                "nphies_warning_count": len(self.nphies_warnings),
            },
        }

    def __str__(self) -> str:
        status = "✓ VALID" if self.is_valid else "✗ INVALID"
        return (
            f"{status} {self.resource_type} ({self.resource_id or 'unknown'}) "
            f"— {len(self.errors)} errors, {len(self.warnings)} warnings"
        )


# ═══════════════════════════════════════════════════════════════════
# SECTION 2 — Enhanced FHIRValidator
# ═══════════════════════════════════════════════════════════════════

class FHIRValidator:
    """
    Validates FHIR resources against NPHIES specifications.
    Enhanced with Anthropic FHIR Developer Agent Skill cardinality rules.
    Backward-compatible with original nphies-bridge FHIRValidator.
    """

    # ── NPHIES coding systems (original + skill additions) ──────
    SAUDI_CODING_SYSTEMS: Dict[str, str] = {
        "national_id": "http://nphies.sa/identifier/nationalid",
        "chi_license": "http://nphies.sa/identifier/chi-license",
        "payer_id": "http://nphies.sa/identifier/payer",
        "sbs_codes": "http://nphies.sa/codesystem/sbs",
        "coverage_class": "http://nphies.sa/codesystem/coverage-class",
        "organization_type": "http://nphies.sa/codesystem/organization-type",
        "diagnosis_type": "http://nphies.sa/codesystem/diagnosis-type",
        "claim_type": "http://nphies.sa/codesystem/claim-type",
        # Extended by FHIR skill
        "snomed": "http://snomed.info/sct",
        "loinc": "http://loinc.org",
        "rxnorm": "http://www.nlm.nih.gov/research/umls/rxnorm",
        "icd10": "http://hl7.org/fhir/sid/icd-10",
        "ucum": "http://unitsofmeasure.org",
    }

    # ── NPHIES profile extensions (original) ────────────────────
    NPHIES_REQUIRED_EXTENSIONS: Dict[str, List[str]] = {
        "Patient": [
            "http://nphies.sa/extension/patient/national-id",
            "http://nphies.sa/extension/patient/insurance-number",
        ],
        "Coverage": [
            "http://nphies.sa/extension/coverage/policy-type",
            "http://nphies.sa/extension/coverage/benefit-period",
        ],
        "Claim": [
            "http://nphies.sa/extension/claim/facility-code",
            "http://nphies.sa/extension/claim/chi-license",
        ],
    }

    # ── Required fields (skill-enhanced) ────────────────────────
    REQUIRED_FIELDS: Dict[str, List[str]] = (
        REQUIRED_FIELDS if _SKILL_AVAILABLE
        else {
            "Patient": ["identifier", "name", "gender", "birthDate"],
            "Coverage": ["status", "beneficiary", "payor", "class"],
            "Organization": ["identifier", "name", "type"],
            "Claim": [
                "status", "type", "use", "patient", "created",
                "insurer", "provider", "insurance", "item", "total",
            ],
        }
    )

    def __init__(self, fhir_version: str = "R4") -> None:
        self.fhir_version = fhir_version
        self._sbs_bridge: SBSFHIRBridge | None = (
            SBSFHIRBridge() if _SKILL_AVAILABLE else None
        )
        self.validators = {
            "Patient": self.validate_patient,
            "Coverage": self.validate_coverage,
            "Organization": self.validate_organization,
            "Claim": self.validate_claim,
            "Bundle": self.validate_bundle,
            # Extended resource types
            "CoverageEligibilityRequest": self._validate_generic,
            "Observation": self._validate_generic,
            "Condition": self._validate_generic,
            "MedicationRequest": self._validate_generic,
            "Encounter": self._validate_generic,
            "Practitioner": self._validate_generic,
            "DiagnosticReport": self._validate_generic,
            "Procedure": self._validate_generic,
            "ClaimResponse": self._validate_generic,
        }

    # ── Main entry point ────────────────────────────────────────

    def validate_resource(self, resource: Dict[str, Any]) -> ValidationResult:
        resource_type = resource.get("resourceType")
        resource_id = resource.get("id")

        if not resource_type:
            result = ValidationResult("Unknown", resource_id)
            result.add_issue(
                ValidationSeverity.ERROR,
                "MISSING_RESOURCE_TYPE",
                "FHIR resource must have a resourceType field",
            )
            return result

        result = ValidationResult(resource_type, resource_id)

        # Run type-specific validator
        if resource_type in self.validators:
            self.validators[resource_type](resource, result)
        else:
            result.add_issue(
                ValidationSeverity.WARNING,
                "UNSUPPORTED_RESOURCE_TYPE",
                f"No specific validator for resource type: {resource_type}",
            )

        # Run general FHIR validation
        self._validate_general_fhir(resource, result)

        # ── Anthropic FHIR Skill cardinality layer ───────────────
        if _SKILL_AVAILABLE:
            self._apply_skill_cardinality(resource_type, resource, result)

        return result

    # ── Cardinality enforcement (new, from FHIR skill) ──────────

    def _apply_skill_cardinality(
        self,
        resource_type: str,
        resource: Dict[str, Any],
        result: ValidationResult,
    ) -> None:
        """Overlay skill-based cardinality + NPHIES extension checks."""
        report = _skill_validate_cardinality(resource_type, resource)

        for missing_field in report.get("missing_required", []):
            # Avoid duplicate errors already raised by type-specific validators
            existing_codes = {e["code"] for e in result.errors}
            if f"MISSING_{missing_field.upper()}" not in existing_codes:
                result.add_issue(
                    ValidationSeverity.ERROR,
                    f"CARDINALITY_{missing_field.upper()}",
                    f"Required field '{missing_field}' is missing (FHIR R4 cardinality)",
                    path=f"{resource_type}.{missing_field}",
                )

        for violation in report.get("cardinality_violations", []):
            result.add_issue(
                ValidationSeverity.ERROR,
                "CARDINALITY_VIOLATION",
                violation,
            )
            result.cardinality_violations.append(violation)

        result.nphies_warnings.extend(report.get("nphies_warnings", []))
        for warn in report.get("nphies_warnings", []):
            result.add_issue(
                ValidationSeverity.WARNING,
                "NPHIES_EXTENSION_MISSING",
                warn,
            )

        result.recommendations.extend(report.get("recommendations", []))
        for rec in report.get("recommendations", []):
            result.add_issue(
                ValidationSeverity.INFO,
                "RECOMMENDATION",
                f"Recommended field: {rec}",
            )

    # ── General FHIR validation ──────────────────────────────────

    def _validate_general_fhir(
        self, resource: Dict[str, Any], result: ValidationResult
    ) -> None:
        """General FHIR R4 validation rules."""
        # id format
        resource_id = resource.get("id")
        if resource_id and not re.match(r"^[A-Za-z0-9\-\.]{1,64}$", str(resource_id)):
            result.add_issue(
                ValidationSeverity.WARNING,
                "INVALID_ID_FORMAT",
                f"Resource id '{resource_id}' may not conform to FHIR id datatype",
                path="id",
            )
        # meta.profile
        meta = resource.get("meta", {})
        if not meta.get("profile"):
            result.add_issue(
                ValidationSeverity.INFO,
                "MISSING_PROFILE",
                "Resource has no meta.profile — NPHIES submissions should include a profile URL",
                path="meta.profile",
            )

    # Alias for backward compatibility
    def validate_general_fhir(
        self, resource: Dict[str, Any], result: ValidationResult
    ) -> None:
        self._validate_general_fhir(resource, result)

    # ── Resource-specific validators ────────────────────────────

    def validate_patient(
        self, resource: Dict[str, Any], result: ValidationResult
    ) -> None:
        self._check_required_fields("Patient", resource, result)
        # National ID identifier
        identifiers = resource.get("identifier", [])
        has_national_id = any(
            i.get("system") == self.SAUDI_CODING_SYSTEMS["national_id"]
            or i.get("type", {}).get("text", "").lower() in ("national id", "iqama")
            for i in identifiers
        )
        if not has_national_id:
            result.add_issue(
                ValidationSeverity.WARNING,
                "MISSING_NATIONAL_ID",
                "Patient should have a Saudi National ID or Iqama identifier",
                path="Patient.identifier",
            )

    def validate_coverage(
        self, resource: Dict[str, Any], result: ValidationResult
    ) -> None:
        self._check_required_fields("Coverage", resource, result)
        # NPHIES period
        period = resource.get("period") or resource.get("subscriberPeriod")
        if not period:
            result.add_issue(
                ValidationSeverity.WARNING,
                "MISSING_COVERAGE_PERIOD",
                "Coverage should include a valid period for NPHIES submissions",
                path="Coverage.period",
            )

    def validate_organization(
        self, resource: Dict[str, Any], result: ValidationResult
    ) -> None:
        self._check_required_fields("Organization", resource, result)
        # CHI license
        identifiers = resource.get("identifier", [])
        has_chi = any(
            i.get("system") == self.SAUDI_CODING_SYSTEMS["chi_license"]
            for i in identifiers
        )
        if not has_chi:
            result.add_issue(
                ValidationSeverity.WARNING,
                "MISSING_CHI_LICENSE",
                "Organization should include a CHI license identifier",
                path="Organization.identifier",
            )

    def validate_claim(
        self, resource: Dict[str, Any], result: ValidationResult
    ) -> None:
        self._check_required_fields("Claim", resource, result)

        # SBS code validation on items
        items = resource.get("item", [])
        for i, item in enumerate(items):
            pos = resource.get("productOrService") or item.get("productOrService", {})
            for coding in pos.get("coding", []):
                if coding.get("system") == self.SAUDI_CODING_SYSTEMS["sbs_codes"]:
                    sbs_id = coding.get("code")
                    if sbs_id and self._sbs_bridge:
                        entry = self._sbs_bridge.lookup(sbs_id)
                        if not entry:
                            result.add_issue(
                                ValidationSeverity.WARNING,
                                "UNKNOWN_SBS_CODE",
                                f"SBS code '{sbs_id}' not found in V3.1 catalogue",
                                path=f"Claim.item[{i}].productOrService.coding",
                                details={"sbs_id": sbs_id},
                            )
                        elif self._sbs_bridge.requires_prior_auth(sbs_id):
                            result.add_issue(
                                ValidationSeverity.INFO,
                                "PRIOR_AUTH_REQUIRED",
                                f"SBS code '{sbs_id}' requires prior authorization",
                                path=f"Claim.item[{i}]",
                                details={"sbs_id": sbs_id},
                            )

    def validate_bundle(
        self, resource: Dict[str, Any], result: ValidationResult
    ) -> None:
        if "entry" not in resource:
            result.add_issue(
                ValidationSeverity.WARNING,
                "EMPTY_BUNDLE",
                "Bundle has no entries",
                path="Bundle.entry",
            )
            return

        bundle_type = resource.get("type")
        if bundle_type not in ("transaction", "message", "collection", "batch"):
            result.add_issue(
                ValidationSeverity.WARNING,
                "BUNDLE_TYPE",
                f"Unexpected bundle type: {bundle_type}",
                path="Bundle.type",
            )

        # Recursively validate each entry resource
        for i, entry in enumerate(resource.get("entry", [])):
            sub = entry.get("resource", {})
            if sub:
                sub_result = self.validate_resource(sub)
                if not sub_result.is_valid:
                    result.add_issue(
                        ValidationSeverity.ERROR,
                        "BUNDLE_ENTRY_INVALID",
                        f"Bundle entry[{i}] ({sub.get('resourceType', '?')}) failed validation: "
                        f"{len(sub_result.errors)} error(s)",
                        path=f"Bundle.entry[{i}].resource",
                        details={"entry_errors": sub_result.errors},
                    )
                    result.is_valid = False

    def _validate_generic(
        self, resource: Dict[str, Any], result: ValidationResult
    ) -> None:
        """Generic validator — uses cardinality rules from the skill."""
        resource_type = resource.get("resourceType", "")
        self._check_required_fields(resource_type, resource, result)

    def _check_required_fields(
        self,
        resource_type: str,
        resource: Dict[str, Any],
        result: ValidationResult,
    ) -> None:
        required = self.REQUIRED_FIELDS.get(resource_type, [])
        for field in required:
            if field not in resource:
                result.add_issue(
                    ValidationSeverity.ERROR,
                    f"MISSING_{field.upper()}",
                    f"{resource_type}.{field} is required",
                    path=f"{resource_type}.{field}",
                )


# ═══════════════════════════════════════════════════════════════════
# SECTION 3 — Bundle-level validation helper
# ═══════════════════════════════════════════════════════════════════

def validate_bundle_entries(bundle: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Validate all resource entries in a FHIR Bundle.
    Uses both the FHIRValidator and the FHIR skill cardinality layer.

    Returns:
        List of per-entry validation report dicts.
    """
    validator = FHIRValidator()
    reports = []
    for i, entry in enumerate(bundle.get("entry", [])):
        resource = entry.get("resource", {})
        if not resource:
            continue
        result = validator.validate_resource(resource)
        d = result.to_dict()
        d["entry_index"] = i
        d["entry_url"] = entry.get("fullUrl", f"entry[{i}]")
        reports.append(d)
    return reports
