# BrainSAIT × Anthropic FHIR Developer Agent Skill
## Integration Guide — Claude Code Plugin

> **Source**: https://claude.com/resources/tutorials/how-to-use-the-fhir-developer-agent-skill-with-claude-code
> **Status**: Production-ready for NPHIES + FHIR R4 + Saudi Vision 2030

---

## 1. Installation (Claude Code)

```bash
# In your BrainSAIT project terminal inside Claude Code:
/plugin marketplace add anthropics/healthcare
/plugin install fhir-developer@healthcare
```

The plugin activates immediately. Claude Code will now have:
- HL7 FHIR R4 cardinality awareness (required vs optional fields)
- Coding system intelligence (LOINC, SNOMED CT, RxNorm, ICD-10, CPT)
- RESTful FHIR API pattern generation
- Validation implementation scaffolding
- Auto-suggestion of Saudi NPHIES profile extensions

---

## 2. What the Plugin Adds (vs. Your Existing Skill)

| Capability | brainsait-healthcare-fhir (existing) | + fhir-developer plugin |
|---|---|---|
| FHIR Templates | ✅ Saudi/NPHIES-specific | ✅ Adds generic HL7 R4 base |
| Cardinality Validation | Partial | ✅ Full required/optional enforcement |
| SNOMED CT | ❌ | ✅ Clinical term lookup |
| RxNorm | ❌ | ✅ Medication coding |
| Bundle Generation | Manual | ✅ Auto-scaffolded |
| Validation Code | Manual | ✅ Generated from profiles |
| NPHIES Extensions | ✅ Deep | Combined with base HL7 |

---

## 3. New Patterns Unlocked by the Plugin

### 3a. Cardinality-Aware Resource Builder

The plugin teaches Claude Code to enforce cardinality rules automatically.
Use this pattern in your BrainSAIT services:

```python
# packages/fhir-validator/cardinality_validator.py
# MEDICAL: FHIR cardinality enforcement per Anthropic FHIR skill
from typing import Any
from fhir.resources.patient import Patient
from fhir.resources.claim import Claim
from fhir.resources.coverage import Coverage
from pydantic import ValidationError

REQUIRED_FIELDS = {
    "Patient": ["identifier", "name", "gender", "birthDate"],
    "Claim": ["status", "type", "use", "patient", "created", "insurer", "provider", "priority", "insurance", "item"],
    "Coverage": ["status", "beneficiary", "payor"],
    "CoverageEligibilityRequest": ["status", "purpose", "patient", "created", "provider", "insurer", "insurance"],
    "Observation": ["status", "code", "subject"],
    "Condition": ["clinicalStatus", "code", "subject"],
    "MedicationRequest": ["status", "intent", "medication", "subject"],
}

NPHIES_REQUIRED_EXTENSIONS = {
    "Patient": [
        "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-nationality",
        "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-occupation",
    ],
    "Claim": [
        "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-episode",
        "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-patientShare",
    ],
}

def validate_cardinality(resource_type: str, resource: dict) -> dict:
    """
    Validate FHIR resource against cardinality rules.
    Enhanced by Anthropic FHIR Developer Agent Skill patterns.

    Returns:
        {"valid": bool, "missing": list, "warnings": list}
    """
    required = REQUIRED_FIELDS.get(resource_type, [])
    missing = [f for f in required if f not in resource]
    warnings = []

    # Check NPHIES-required extensions
    nphies_ext = NPHIES_REQUIRED_EXTENSIONS.get(resource_type, [])
    if nphies_ext:
        existing_urls = [
            e.get("url") for e in resource.get("extension", [])
        ]
        for ext_url in nphies_ext:
            if ext_url not in existing_urls:
                warnings.append(f"NPHIES extension missing: {ext_url}")

    return {
        "valid": len(missing) == 0,
        "missing_required": missing,
        "nphies_warnings": warnings,
        "resource_type": resource_type,
    }
```

---

### 3b. SNOMED CT + RxNorm Coding (New via Plugin)

```python
# packages/fhir-coding/coding_systems.py
# MEDICAL: Coding system reference — unlocked by Anthropic FHIR plugin

CODING_SYSTEMS = {
    # Diagnosis
    "icd10": "http://hl7.org/fhir/sid/icd-10",
    "icd10cm": "http://hl7.org/fhir/sid/icd-10-cm",
    "snomed": "http://snomed.info/sct",

    # Procedures
    "cpt": "http://www.ama-assn.org/go/cpt",
    "hcpcs": "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets",

    # Laboratory
    "loinc": "http://loinc.org",

    # Medications
    "rxnorm": "http://www.nlm.nih.gov/research/umls/rxnorm",
    "ndc": "http://hl7.org/fhir/sid/ndc",

    # Saudi NPHIES Systems
    "nphies_diagnosis": "http://nphies.sa/terminology/CodeSystem/diag-type",
    "nphies_procedure": "http://nphies.sa/terminology/CodeSystem/procedure-type",
    "nphies_drug": "http://nphies.sa/terminology/CodeSystem/medication-codes",
    "nphies_dental": "http://nphies.sa/terminology/CodeSystem/dental-procedure",
    "nphies_vision": "http://nphies.sa/terminology/CodeSystem/vision-codes",
}

# SNOMED CT → Arabic clinical term mapping (BrainSAIT extension)
SNOMED_ARABIC = {
    "73211009": {"en": "Diabetes mellitus", "ar": "داء السكري"},
    "38341003": {"en": "Hypertensive disorder", "ar": "اضطراب ارتفاع ضغط الدم"},
    "195967001": {"en": "Asthma", "ar": "الربو"},
    "44054006": {"en": "Diabetes mellitus type 2", "ar": "داء السكري من النوع الثاني"},
    "22298006": {"en": "Myocardial infarction", "ar": "احتشاء عضلة القلب"},
    "13645005": {"en": "Chronic obstructive pulmonary disease", "ar": "مرض الانسداد الرئوي المزمن"},
    "84114007": {"en": "Heart failure", "ar": "فشل القلب"},
    "73430006": {"en": "Sleep disorder", "ar": "اضطراب النوم"},
}

# RxNorm → Arabic medication mapping (BrainSAIT extension)
RXNORM_ARABIC = {
    "860975": {"en": "Metformin 500 MG", "ar": "ميتفورمين 500 مجم"},
    "197361": {"en": "Amlodipine 5 MG", "ar": "أملوديبين 5 مجم"},
    "311702": {"en": "Atorvastatin 10 MG", "ar": "أتورفاستاتين 10 مجم"},
    "308460": {"en": "Lisinopril 10 MG", "ar": "ليزينوبريل 10 مجم"},
    "197380": {"en": "Omeprazole 20 MG", "ar": "أوميبرازول 20 مجم"},
}

def build_coding(system_key: str, code: str, display_en: str, display_ar: str = None) -> dict:
    """
    Build a FHIR Coding element with optional Arabic translation.
    Pattern from Anthropic FHIR Developer Agent Skill.
    """
    coding = {
        "system": CODING_SYSTEMS.get(system_key, system_key),
        "code": code,
        "display": display_en,
    }
    if display_ar:
        coding["_display"] = {
            "extension": [{
                "url": "http://hl7.org/fhir/StructureDefinition/translation",
                "extension": [
                    {"url": "lang", "valueCode": "ar"},
                    {"url": "content", "valueString": display_ar},
                ]
            }]
        }
    return coding
```

---

### 3c. FHIR Bundle Generation (Anthropic Plugin Pattern)

```python
# packages/fhir-bundle/bundle_builder.py
# MEDICAL: FHIR Bundle builder — scaffolded by Anthropic FHIR skill
import uuid
from datetime import datetime, timezone

def build_transaction_bundle(resources: list[dict]) -> dict:
    """
    Build a FHIR Transaction Bundle for batch NPHIES submission.
    Pattern: Anthropic FHIR Developer Agent Skill — Bundle scaffolding.

    Args:
        resources: List of {"resource": {...}, "method": "POST|PUT", "url": "ResourceType"}
    """
    return {
        "resourceType": "Bundle",
        "id": str(uuid.uuid4()),
        "meta": {
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "profile": [
                "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/bundle"
            ]
        },
        "type": "transaction",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entry": [
            {
                "fullUrl": f"urn:uuid:{uuid.uuid4()}",
                "resource": r["resource"],
                "request": {
                    "method": r.get("method", "POST"),
                    "url": r.get("url", r["resource"].get("resourceType", "")),
                }
            }
            for r in resources
        ]
    }

def build_message_bundle(
    message_header: dict,
    focus_resources: list[dict]
) -> dict:
    """
    Build a FHIR Message Bundle for NPHIES messaging.
    Required for Eligibility, Prior Auth, Claims via NPHIES.
    """
    return {
        "resourceType": "Bundle",
        "id": str(uuid.uuid4()),
        "meta": {
            "profile": [
                "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/bundle"
            ]
        },
        "type": "message",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entry": [
            {
                "fullUrl": f"urn:uuid:{message_header.get('id', uuid.uuid4())}",
                "resource": message_header,
            },
            *[
                {
                    "fullUrl": f"urn:uuid:{r.get('id', uuid.uuid4())}",
                    "resource": r,
                }
                for r in focus_resources
            ]
        ]
    }
```

---

### 3d. Validation Implementation (Generated by Plugin)

```python
# packages/fhir-validator/fhir_validator.py
# MEDICAL: Auto-generated validation patterns from Anthropic FHIR plugin
from fhir.resources.R4 import construct_fhir_element
import re

IDENTIFIER_PATTERNS = {
    "national_id": r"^\d{10}$",
    "iqama": r"^[2-9]\d{9}$",
    "border_number": r"^\d{10}$",
    "phone_sa": r"^\+9665\d{8}$",
    "nphies_org_id": r"^\d{10}$",
}

def validate_saudi_identifier(id_type: str, value: str) -> bool:
    """Validate Saudi-specific identifier formats."""
    pattern = IDENTIFIER_PATTERNS.get(id_type)
    if not pattern:
        return True  # Unknown type — pass through
    return bool(re.match(pattern, value))

def validate_fhir_date(date_str: str) -> bool:
    """Validate FHIR date format (YYYY-MM-DD)."""
    try:
        from datetime import date
        date.fromisoformat(date_str)
        return True
    except (ValueError, TypeError):
        return False

def validate_fhir_datetime(dt_str: str) -> bool:
    """Validate FHIR dateTime format."""
    try:
        from datetime import datetime
        datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return True
    except (ValueError, TypeError):
        return False

def validate_icd10_code(code: str) -> bool:
    """Basic ICD-10 code format validation."""
    return bool(re.match(r"^[A-Z]\d{2}(\.\d{1,4})?$", code))

def validate_cpt_code(code: str) -> bool:
    """CPT code format validation."""
    return bool(re.match(r"^\d{5}$", code))

def validate_loinc_code(code: str) -> bool:
    """LOINC code format validation."""
    return bool(re.match(r"^\d{4,5}-\d$", code))

def full_resource_validation(resource: dict) -> dict:
    """
    Run all validations on a FHIR resource.
    Returns a structured validation report.
    """
    from .cardinality_validator import validate_cardinality

    resource_type = resource.get("resourceType", "Unknown")
    report = {
        "resource_type": resource_type,
        "passed": [],
        "failed": [],
        "warnings": [],
    }

    # 1. Cardinality check
    cardinality = validate_cardinality(resource_type, resource)
    if cardinality["valid"]:
        report["passed"].append("cardinality")
    else:
        report["failed"].extend([
            f"Missing required field: {f}" for f in cardinality["missing_required"]
        ])
    report["warnings"].extend(cardinality.get("nphies_warnings", []))

    # 2. Identifier validation
    for ident in resource.get("identifier", []):
        sys = ident.get("system", "")
        val = ident.get("value", "")
        if "nationalid" in sys:
            if not validate_saudi_identifier("national_id", val):
                report["failed"].append(f"Invalid national ID format: {val}")
        elif "iqama" in sys:
            if not validate_saudi_identifier("iqama", val):
                report["failed"].append(f"Invalid Iqama format: {val}")

    # 3. Date validations
    for date_field in ["birthDate", "servicedDate", "created"]:
        if date_field in resource:
            val = resource[date_field]
            if not (validate_fhir_date(val) or validate_fhir_datetime(val)):
                report["failed"].append(f"Invalid date format in {date_field}: {val}")
            else:
                report["passed"].append(f"date:{date_field}")

    report["is_valid"] = len(report["failed"]) == 0
    return report
```

---

## 4. Claude Code Usage Examples (with Plugin Active)

Once installed, you can give these prompts in Claude Code:

```
# Generate a FHIR R4 Patient resource for a Saudi patient
"Create a FHIR R4 Patient resource for Mohamed Al-Qahtani, 
 National ID 1234567890, born 1985-03-15, Riyadh"

# Build a complete NPHIES eligibility request
"Build a CoverageEligibilityRequest bundle for patient P001 
 checking dental coverage with payer Al-Tawuniya"

# Validate a claim bundle
"Validate this Claim resource against NPHIES R4 profile 
 and list any missing required fields"

# Convert HL7 v2 to FHIR
"Convert this HL7 ADT^A01 message to a FHIR Patient + Encounter bundle"
```

---

## 5. BrainSAIT Project Structure Update

Add these new packages to your monorepo:

```
brainsait/
├── packages/
│   ├── fhir-validator/          ← NEW: cardinality + format validation
│   │   ├── cardinality_validator.py
│   │   ├── fhir_validator.py
│   │   └── __init__.py
│   ├── fhir-bundle/             ← NEW: transaction + message bundles
│   │   ├── bundle_builder.py
│   │   └── __init__.py
│   ├── fhir-coding/             ← NEW: SNOMED, RxNorm, LOINC mappings
│   │   ├── coding_systems.py
│   │   └── __init__.py
│   └── fhir-mcp/                ← EXISTING: MCP server (keep as-is)
│       └── brainsait_fhir_mcp.py
```

---

## 6. Environment Variables (add to .env)

```bash
# Anthropic FHIR Skill — Plugin Config
FHIR_PLUGIN_VERSION=fhir-developer@healthcare
FHIR_VALIDATION_LEVEL=strict          # strict | lenient | nphies-only
FHIR_TERMINOLOGY_SERVER=https://tx.fhir.org/r4
SNOMED_API_KEY=your_snomed_api_key    # For live SNOMED lookups
RXNORM_API_KEY=your_rxnorm_api_key    # For RxNorm drug validation
LOINC_API_KEY=your_loinc_api_key      # For LOINC lab validation
```

---

## 7. Quick Reference — Plugin vs. Skill Responsibilities

| Task | Use Plugin (Claude Code) | Use Skill (brainsait-healthcare-fhir) |
|---|---|---|
| Generate a new FHIR resource | ✅ Ask Claude Code | ✅ Copy template |
| Validate cardinality | ✅ Plugin knows rules | ✅ `validate_cardinality()` |
| NPHIES-specific extensions | Partial | ✅ Full Saudi profiles |
| SNOMED CT lookup | ✅ Plugin knows codes | Use `SNOMED_ARABIC` dict |
| RxNorm drug codes | ✅ Plugin knows codes | Use `RXNORM_ARABIC` dict |
| Bundle construction | ✅ Plugin scaffolds | ✅ `bundle_builder.py` |
| MCP tool server | ❌ | ✅ `brainsait_fhir_mcp.py` |
| Arabic clinical terms | ❌ | ✅ BrainSAIT bilingual layer |

---

## References

- [Anthropic Tutorial](https://claude.com/resources/tutorials/how-to-use-the-fhir-developer-agent-skill-with-claude-code)
- [FHIR R4 Spec](https://hl7.org/fhir/R4/)
- [NPHIES Implementation Guide](https://nphies.sa/docs)
- [Saudi FHIR Profiles on Simplifier](https://simplifier.net/NPHIES)
