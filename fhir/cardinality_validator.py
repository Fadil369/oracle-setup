# packages/fhir-validator/cardinality_validator.py
# MEDICAL: FHIR R4 cardinality enforcement
# Source: Anthropic FHIR Developer Agent Skill patterns
# BrainSAIT COMPLIANCELINC + CLINICALLINC

from typing import Any

REQUIRED_FIELDS: dict[str, list[str]] = {
    "Patient": ["identifier", "name", "gender", "birthDate"],
    "Claim": [
        "status", "type", "use", "patient", "created",
        "insurer", "provider", "priority", "insurance", "item"
    ],
    "Coverage": ["status", "beneficiary", "payor"],
    "CoverageEligibilityRequest": [
        "status", "purpose", "patient", "created",
        "provider", "insurer", "insurance"
    ],
    "Observation": ["status", "code", "subject"],
    "Condition": ["clinicalStatus", "code", "subject"],
    "MedicationRequest": ["status", "intent", "medication", "subject"],
    "Encounter": ["status", "class", "subject"],
    "Organization": ["identifier", "active", "name"],
    "Practitioner": ["identifier", "name"],
    "DiagnosticReport": ["status", "code", "subject"],
    "Procedure": ["status", "code", "subject"],
    "ClaimResponse": ["status", "type", "use", "patient", "created", "insurer", "request", "outcome"],
}

OPTIONAL_BUT_RECOMMENDED: dict[str, list[str]] = {
    "Patient": ["telecom", "address", "communication", "extension"],
    "Claim": ["diagnosis", "careTeam", "supportingInfo", "prescription"],
    "Observation": ["value[x]", "interpretation", "referenceRange"],
}

NPHIES_REQUIRED_EXTENSIONS: dict[str, list[str]] = {
    "Patient": [
        "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-nationality",
        "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-occupation",
    ],
    "Claim": [
        "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-episode",
        "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-patientShare",
    ],
    "Organization": [
        "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-organization-type",
    ],
}

CARDINALITY_RULES: dict[str, dict[str, str]] = {
    "Patient": {
        "identifier": "1..*",    # At least one required
        "name": "1..*",
        "gender": "1..1",
        "birthDate": "0..1",     # Required by NPHIES profile
        "telecom": "0..*",
        "address": "0..*",
        "extension": "0..*",
    },
    "Claim": {
        "identifier": "1..*",
        "status": "1..1",
        "type": "1..1",
        "use": "1..1",
        "patient": "1..1",
        "created": "1..1",
        "insurer": "1..1",
        "provider": "1..1",
        "priority": "1..1",
        "insurance": "1..*",
        "item": "1..*",
        "diagnosis": "0..*",
        "careTeam": "0..*",
        "supportingInfo": "0..*",
        "total": "0..1",
    },
}


def validate_cardinality(resource_type: str, resource: dict) -> dict:
    """
    Validate FHIR resource against cardinality rules.
    Enhanced by Anthropic FHIR Developer Agent Skill.

    Args:
        resource_type: FHIR resource type (e.g., "Patient", "Claim")
        resource: The FHIR resource as a dict

    Returns:
        {
            "valid": bool,
            "missing_required": list[str],
            "nphies_warnings": list[str],
            "recommendations": list[str],
            "cardinality_violations": list[str],
            "resource_type": str,
        }
    """
    required = REQUIRED_FIELDS.get(resource_type, [])
    recommended = OPTIONAL_BUT_RECOMMENDED.get(resource_type, [])
    missing_required = [f for f in required if f not in resource]
    recommendations = [
        f for f in recommended
        if f not in resource and not f.endswith("[x]")
    ]
    cardinality_violations = []

    # Check NPHIES-required extensions
    nphies_ext = NPHIES_REQUIRED_EXTENSIONS.get(resource_type, [])
    nphies_warnings = []
    if nphies_ext:
        existing_urls = [
            e.get("url", "") for e in resource.get("extension", [])
        ]
        for ext_url in nphies_ext:
            if ext_url not in existing_urls:
                nphies_warnings.append(f"NPHIES extension missing: {ext_url}")

    # Check cardinality rules (basic min/max)
    rules = CARDINALITY_RULES.get(resource_type, {})
    for field, cardinality in rules.items():
        if field not in resource:
            continue
        value = resource[field]
        min_card, max_card = cardinality.split("..")
        min_count = int(min_card)

        if isinstance(value, list):
            if len(value) < min_count:
                cardinality_violations.append(
                    f"{field}: min cardinality {min_card} not met (found {len(value)})"
                )
            if max_card != "*" and len(value) > int(max_card):
                cardinality_violations.append(
                    f"{field}: max cardinality {max_card} exceeded (found {len(value)})"
                )

    return {
        "valid": len(missing_required) == 0 and len(cardinality_violations) == 0,
        "missing_required": missing_required,
        "nphies_warnings": nphies_warnings,
        "recommendations": recommendations,
        "cardinality_violations": cardinality_violations,
        "resource_type": resource_type,
    }


def validate_bundle_entries(bundle: dict) -> list[dict]:
    """
    Validate all resources in a FHIR Bundle.

    Args:
        bundle: FHIR Bundle resource

    Returns:
        List of validation reports per entry
    """
    reports = []
    for i, entry in enumerate(bundle.get("entry", [])):
        resource = entry.get("resource", {})
        resource_type = resource.get("resourceType", "Unknown")
        report = validate_cardinality(resource_type, resource)
        report["entry_index"] = i
        report["entry_url"] = entry.get("fullUrl", f"entry[{i}]")
        reports.append(report)
    return reports


def get_cardinality_help(resource_type: str, field: str) -> str:
    """Get human-readable cardinality help for a field."""
    rules = CARDINALITY_RULES.get(resource_type, {})
    cardinality = rules.get(field, "0..*")
    min_c, max_c = cardinality.split("..")

    if min_c == "1" and max_c == "1":
        return f"{field}: Required exactly once (1..1)"
    elif min_c == "1" and max_c == "*":
        return f"{field}: Required, can repeat (1..*)"
    elif min_c == "0" and max_c == "1":
        return f"{field}: Optional, at most once (0..1)"
    else:
        return f"{field}: Optional, can repeat (0..*)"
