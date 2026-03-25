"""
BrainSAIT FHIR Package
======================
HL7 FHIR R4 + Saudi NPHIES integration modules.

Based on the Anthropic FHIR Developer Agent Skill (claude.com/resources/tutorials/fhir-developer).
Enhanced with SBS V3.1 and BrainSAIT bilingual (AR/EN) layers.

Modules:
    cardinality_validator  - FHIR R4 cardinality enforcement + NPHIES extension checks
    coding_systems         - SNOMED CT, RxNorm, LOINC, ICD-10, CPT + Saudi NPHIES systems
    bundle_builder         - Transaction, Message, and Collection bundle scaffolding
    sbs_fhir_bridge        - SBS V3 ↔ FHIR coding system bridge
"""

from .cardinality_validator import validate_cardinality, validate_bundle_entries, get_cardinality_help
from .coding_systems import build_coding, CODING_SYSTEMS, SNOMED_ARABIC, RXNORM_ARABIC, LOINC_ARABIC
from .bundle_builder import (
    build_transaction_bundle,
    build_message_bundle,
    build_collection_bundle,
    build_nphies_message_header,
    build_eligibility_message,
)
from .sbs_fhir_bridge import SBSFHIRBridge

__all__ = [
    # Cardinality
    "validate_cardinality",
    "validate_bundle_entries",
    "get_cardinality_help",
    # Coding
    "build_coding",
    "CODING_SYSTEMS",
    "SNOMED_ARABIC",
    "RXNORM_ARABIC",
    "LOINC_ARABIC",
    # Bundle
    "build_transaction_bundle",
    "build_message_bundle",
    "build_collection_bundle",
    "build_nphies_message_header",
    "build_eligibility_message",
    # SBS Bridge
    "SBSFHIRBridge",
]
