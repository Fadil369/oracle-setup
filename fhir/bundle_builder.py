# packages/fhir-bundle/bundle_builder.py
# MEDICAL: FHIR Bundle construction — transaction, message, collection types
# Pattern: Anthropic FHIR Developer Agent Skill — Bundle scaffolding
# BrainSAIT NPHIES integration layer
import uuid
from datetime import datetime, timezone


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_uuid() -> str:
    return str(uuid.uuid4())


# ─── Transaction Bundle ───

def build_transaction_bundle(resources: list[dict]) -> dict:
    """
    Build a FHIR Transaction Bundle for batch NPHIES submission.

    Args:
        resources: List of dicts:
            {
                "resource": {...FHIR resource...},
                "method": "POST" | "PUT",
                "url": "ResourceType" | "ResourceType/id"
            }

    Returns:
        FHIR Bundle of type "transaction"
    """
    return {
        "resourceType": "Bundle",
        "id": _new_uuid(),
        "meta": {
            "lastUpdated": _now_iso(),
            "profile": [
                "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/bundle"
            ]
        },
        "type": "transaction",
        "timestamp": _now_iso(),
        "entry": [
            {
                "fullUrl": f"urn:uuid:{_new_uuid()}",
                "resource": r["resource"],
                "request": {
                    "method": r.get("method", "POST"),
                    "url": r.get("url", r["resource"].get("resourceType", "")),
                }
            }
            for r in resources
        ]
    }


# ─── Message Bundle (NPHIES) ───

def build_message_bundle(
    message_header: dict,
    focus_resources: list[dict]
) -> dict:
    """
    Build a FHIR Message Bundle for NPHIES messaging.
    Required for Eligibility, Prior Auth, and Claims via NPHIES.

    Args:
        message_header: FHIR MessageHeader resource
        focus_resources: List of focused FHIR resources

    Returns:
        FHIR Bundle of type "message"
    """
    return {
        "resourceType": "Bundle",
        "id": _new_uuid(),
        "meta": {
            "lastUpdated": _now_iso(),
            "profile": [
                "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/bundle"
            ]
        },
        "type": "message",
        "timestamp": _now_iso(),
        "entry": [
            {
                "fullUrl": f"urn:uuid:{message_header.get('id', _new_uuid())}",
                "resource": message_header,
            },
            *[
                {
                    "fullUrl": f"urn:uuid:{r.get('id', _new_uuid())}",
                    "resource": r,
                }
                for r in focus_resources
            ]
        ]
    }


# ─── Collection Bundle ───

def build_collection_bundle(resources: list[dict]) -> dict:
    """
    Build a FHIR Collection Bundle (read-only, no transactions).

    Args:
        resources: List of FHIR resources

    Returns:
        FHIR Bundle of type "collection"
    """
    return {
        "resourceType": "Bundle",
        "id": _new_uuid(),
        "meta": {"lastUpdated": _now_iso()},
        "type": "collection",
        "timestamp": _now_iso(),
        "entry": [
            {
                "fullUrl": f"urn:uuid:{r.get('id', _new_uuid())}",
                "resource": r,
            }
            for r in resources
        ]
    }


# ─── MessageHeader Builder ───

def build_nphies_message_header(
    event_code: str,
    sender_org_id: str,
    receiver_org_id: str,
    focus_references: list[str]
) -> dict:
    """
    Build a NPHIES-compliant FHIR MessageHeader.

    Args:
        event_code: NPHIES event code (e.g., "eligibility-request",
                    "priorauth-request", "claim-request")
        sender_org_id: Sending Organization NPHIES ID
        receiver_org_id: Receiving Organization (Payer) NPHIES ID
        focus_references: List of resource references (e.g., ["CoverageEligibilityRequest/123"])

    Returns:
        FHIR MessageHeader resource
    """
    NPHIES_EVENTS = {
        "eligibility-request": "http://nphies.sa/terminology/CodeSystem/ksa-message-events#eligibility-request",
        "priorauth-request": "http://nphies.sa/terminology/CodeSystem/ksa-message-events#priorauth-request",
        "claim-request": "http://nphies.sa/terminology/CodeSystem/ksa-message-events#claim-request",
        "claim-poll": "http://nphies.sa/terminology/CodeSystem/ksa-message-events#claim-poll",
        "cancel-request": "http://nphies.sa/terminology/CodeSystem/ksa-message-events#cancel-request",
    }

    event_uri = NPHIES_EVENTS.get(event_code, event_code)

    return {
        "resourceType": "MessageHeader",
        "id": _new_uuid(),
        "meta": {
            "profile": [
                "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/message-header"
            ]
        },
        "eventCoding": {
            "system": "http://nphies.sa/terminology/CodeSystem/ksa-message-events",
            "code": event_code,
        },
        "destination": [{
            "endpoint": f"http://nphies.sa/fhir/R4",
            "receiver": {
                "reference": f"Organization/{receiver_org_id}"
            }
        }],
        "sender": {
            "reference": f"Organization/{sender_org_id}"
        },
        "source": {
            "endpoint": "http://brainsait.io/fhir",
            "software": "BrainSAIT COMPLIANCELINC",
            "version": "2.0.0",
        },
        "focus": [
            {"reference": ref} for ref in focus_references
        ]
    }


# ─── Complete Eligibility Bundle ───

def build_eligibility_message(
    patient_resource: dict,
    coverage_resource: dict,
    eligibility_request: dict,
    provider_org_id: str,
    payer_org_id: str,
) -> dict:
    """
    Build a complete NPHIES eligibility check message bundle.

    Args:
        patient_resource: FHIR Patient resource
        coverage_resource: FHIR Coverage resource
        eligibility_request: FHIR CoverageEligibilityRequest resource
        provider_org_id: Provider NPHIES Organization ID
        payer_org_id: Payer NPHIES Organization ID

    Returns:
        Complete FHIR Message Bundle ready for NPHIES submission
    """
    req_id = eligibility_request.get("id", _new_uuid())

    header = build_nphies_message_header(
        event_code="eligibility-request",
        sender_org_id=provider_org_id,
        receiver_org_id=payer_org_id,
        focus_references=[f"CoverageEligibilityRequest/{req_id}"]
    )

    return build_message_bundle(
        message_header=header,
        focus_resources=[
            patient_resource,
            coverage_resource,
            eligibility_request,
        ]
    )
