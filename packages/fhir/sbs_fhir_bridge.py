"""
SBS V3 ↔ FHIR Coding Bridge
============================
Bridges the SBS-GIVC/sbs Saudi Billing System V3.1 catalogue
with HL7 FHIR R4 coding representation.

Connects:
    - SBS normalizer-service code outputs → FHIR Coding elements
    - FHIR Claim items → SBS catalogue lookup keys
    - SBS SNOMED/ACHI maps → FHIR CodeableConcept with translation extensions

Source SBS catalogue: database/official_sbs/processed/sbs_catalogue.json
Source SBS SNOMED map: database/official_sbs/processed/sbs_snomed_map.json
"""

from __future__ import annotations

import json
import os
import pathlib
from typing import Any

from .coding_systems import build_coding, CODING_SYSTEMS, SNOMED_ARABIC

# ─── SBS Code System URIs ────────────────────────────────────────
SBS_SYSTEM = "http://nphies.sa/terminology/CodeSystem/sbs"
SBS_CATEGORY_SYSTEM = "http://nphies.sa/terminology/CodeSystem/sbs-category"

# SBS V3 category label map (from SBS V3 Implementation PDF)
SBS_CATEGORY_LABELS: dict[str, dict[str, str]] = {
    "01": {"en": "Nervous System", "ar": "الجهاز العصبي"},
    "02": {"en": "Endocrine System", "ar": "الجهاز الصماوي"},
    "03": {"en": "Eye and Orbit", "ar": "العين والمحجر"},
    "04": {"en": "Ear", "ar": "الأذن"},
    "05": {"en": "Nose, Mouth, and Pharynx", "ar": "الأنف والفم والبلعوم"},
    "06": {"en": "Dental Services", "ar": "خدمات الأسنان"},
    "07": {"en": "Respiratory System", "ar": "الجهاز التنفسي"},
    "08": {"en": "Cardiovascular System", "ar": "الجهاز القلبي الوعائي"},
    "09": {"en": "Blood and Lymphatic System", "ar": "الدم والجهاز الليمفاوي"},
    "10": {"en": "Digestive System", "ar": "الجهاز الهضمي"},
    "11": {"en": "Urinary System", "ar": "الجهاز البولي"},
    "12": {"en": "Male Genital System", "ar": "الجهاز التناسلي الذكري"},
    "13": {"en": "Female Genital System", "ar": "الجهاز التناسلي الأنثوي"},
    "14": {"en": "Musculoskeletal System", "ar": "الجهاز العضلي الهيكلي"},
    "15": {"en": "Dermatology", "ar": "الأمراض الجلدية"},
    "16": {"en": "Breast", "ar": "الثدي"},
    "17": {"en": "Radiation Oncology", "ar": "الأورام الإشعاعية"},
    "18": {"en": "Non-Invasive / Cognitive", "ar": "غير الجراحي / المعرفي"},
    "19": {"en": "Imaging", "ar": "التصوير الطبي"},
    "21": {"en": "Laboratory", "ar": "المختبر"},
    "22": {"en": "Pharmacy", "ar": "الصيدلية"},
    "23": {"en": "Obstetrics", "ar": "التوليد"},
    "99": {"en": "Allied Health", "ar": "الخدمات الصحية المساندة"},
}


def _load_sbs_catalogue() -> dict[str, Any]:
    """Load SBS catalogue from the SBS repo processed data."""
    # Try oracle-setup co-located copy first, then fallback paths
    candidate_paths = [
        pathlib.Path(__file__).parent.parent.parent / "sbs-integration" / "sbs_catalogue.json",
        pathlib.Path(os.getenv("SBS_CATALOGUE_PATH", "")),
        pathlib.Path("/tmp/sbs-repo/database/official_sbs/processed/sbs_catalogue.json"),
        pathlib.Path("/tmp/uhh-repo/server/sbs_catalogue.json"),
    ]
    for path in candidate_paths:
        if path and path.exists():
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Support both wrapped {"catalogue": {...}} and flat {sbs_id: {...}} formats
                return data.get("catalogue", data)
    return {}


def _load_sbs_snomed_map() -> dict[str, str]:
    """Load SBS → SNOMED CT mapping from the SBS repo."""
    candidate_paths = [
        pathlib.Path("/tmp/sbs-repo/database/official_sbs/processed/sbs_snomed_map.json"),
        pathlib.Path(__file__).parent.parent.parent / "sbs-integration" / "sbs_snomed_map.json",
    ]
    for path in candidate_paths:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                try:
                    return json.load(f)
                except (json.JSONDecodeError, ValueError):
                    pass  # file truncated or malformed; try next
    return {}


class SBSFHIRBridge:
    """
    Bridges SBS V3.1 billing codes with HL7 FHIR R4 coding structures.

    Usage:
        bridge = SBSFHIRBridge()
        fhir_coding = bridge.sbs_to_fhir_coding("010101")
        claim_item = bridge.build_claim_item(sbs_id="060201", quantity=1, unit_price=150.00)
    """

    def __init__(self) -> None:
        self._catalogue = _load_sbs_catalogue()
        self._snomed_map = _load_sbs_snomed_map()

    @property
    def catalogue(self) -> dict:
        return self._catalogue

    def sbs_to_fhir_coding(self, sbs_id: str) -> dict:
        """
        Convert an SBS V3 code to a FHIR Coding element.

        Args:
            sbs_id: SBS V3 code id (e.g. "010101")

        Returns:
            FHIR Coding dict
        """
        entry = self._catalogue.get(sbs_id, {})
        desc_en = entry.get("description_en") or entry.get("description") or sbs_id
        desc_ar = entry.get("description_ar") or entry.get("nameAr")
        return build_coding(
            system_key="sbs_codes",
            code=sbs_id,
            display_en=desc_en,
            display_ar=desc_ar,
        )

    def sbs_to_codeable_concept(self, sbs_id: str, include_snomed: bool = True) -> dict:
        """
        Build a FHIR CodeableConcept with SBS primary code and optional SNOMED translation.

        Args:
            sbs_id: SBS V3 code id
            include_snomed: Whether to include a SNOMED CT translation coding

        Returns:
            FHIR CodeableConcept dict
        """
        codings = [self.sbs_to_fhir_coding(sbs_id)]

        if include_snomed:
            snomed_code = self._snomed_map.get(sbs_id)
            if snomed_code and snomed_code in SNOMED_ARABIC:
                snomed_info = SNOMED_ARABIC[snomed_code]
                codings.append(
                    build_coding(
                        system_key="snomed",
                        code=snomed_code,
                        display_en=snomed_info["en"],
                        display_ar=snomed_info["ar"],
                    )
                )

        entry = self._catalogue.get(sbs_id, {})
        desc_en = entry.get("description_en") or entry.get("description") or sbs_id
        return {
            "coding": codings,
            "text": desc_en,
        }

    def build_claim_item(
        self,
        sbs_id: str,
        sequence: int = 1,
        quantity: float = 1.0,
        unit_price: float = 0.0,
        service_date: str | None = None,
        icd10_code: str | None = None,
        icd10_display_en: str = "",
        icd10_display_ar: str | None = None,
    ) -> dict:
        """
        Build a FHIR Claim.item entry from an SBS V3 code.

        Args:
            sbs_id: SBS V3 procedure/service code
            sequence: Line item sequence number
            quantity: Quantity of service
            unit_price: Unit price in SAR
            service_date: ISO date string (YYYY-MM-DD)
            icd10_code: ICD-10 diagnosis code for this line item (optional)
            icd10_display_en: ICD-10 English display
            icd10_display_ar: ICD-10 Arabic display

        Returns:
            FHIR Claim.item dict
        """
        item: dict[str, Any] = {
            "sequence": sequence,
            "productOrService": self.sbs_to_codeable_concept(sbs_id),
            "quantity": {
                "value": quantity,
                "system": "http://unitsofmeasure.org",
                "code": "1",
            },
            "unitPrice": {
                "value": unit_price,
                "currency": "SAR",
            },
            "net": {
                "value": round(unit_price * quantity, 2),
                "currency": "SAR",
            },
        }

        if service_date:
            item["servicedDate"] = service_date

        if icd10_code:
            item["diagnosisSequence"] = [sequence]
            item["informationSequence"] = [sequence]
            # Inline ICD-10 code reference for item-level diagnosis
            item["_productOrService_icd10"] = build_coding(
                system_key="icd10",
                code=icd10_code,
                display_en=icd10_display_en,
                display_ar=icd10_display_ar,
            )

        return item

    def get_category_info(self, sbs_id: str) -> dict[str, str]:
        """
        Return the SBS category name (EN/AR) for a given SBS code prefix.

        Args:
            sbs_id: SBS V3 code id

        Returns:
            {"category_id": "08", "en": "Cardiovascular System", "ar": "الجهاز القلبي الوعائي"}
        """
        cat_id = str(sbs_id)[:2].zfill(2)
        info = SBS_CATEGORY_LABELS.get(cat_id, {"en": "Unknown", "ar": "غير معروف"})
        return {"category_id": cat_id, **info}

    def requires_prior_auth(self, sbs_id: str) -> bool:
        """Check if an SBS procedure requires prior authorization."""
        entry = self._catalogue.get(sbs_id, {})
        return bool(entry.get("requires_prior_auth") or entry.get("prior_auth_required"))

    def lookup(self, sbs_id: str) -> dict[str, Any] | None:
        """Raw catalogue lookup."""
        return self._catalogue.get(sbs_id)
