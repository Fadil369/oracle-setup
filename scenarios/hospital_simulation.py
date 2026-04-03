"""
BrainSAIT Hospital Simulation
Digital twin hospital environment for training and validating LINC agents.

Pipeline:
  patient_symptoms → nurse_triage → doctor_reasoning →
  lab_analysis → consultant_opinion → risk_analysis

Endpoint: POST /simulate_hospital_case
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from packages.fhir import build_message_bundle, build_nphies_message_header, validate_bundle_entries

logger = logging.getLogger("scenarios.hospital_simulation")


# ── Simulated Modules ────────────────────────────────────────────────────

class VirtualPatient:
    """Generates simulated patient presentations."""

    TEMPLATES = [
        {
            "id": "cardiac-chest-pain",
            "chief_complaint": "Chest pain radiating to left arm",
            "vitals": {"hr": 110, "bp": "160/95", "spo2": 95, "temp": 37.2, "rr": 22},
            "history": "55-year-old male, diabetic, smoker, family history of CAD",
            "symptoms": ["chest_pain", "diaphoresis", "dyspnea", "nausea"],
            "duration": "2 hours",
            "severity": "high",
        },
        {
            "id": "respiratory-infection",
            "chief_complaint": "Fever and productive cough for 5 days",
            "vitals": {"hr": 95, "bp": "130/85", "spo2": 92, "temp": 39.1, "rr": 26},
            "history": "68-year-old female, COPD, on home oxygen",
            "symptoms": ["fever", "cough", "dyspnea", "fatigue", "purulent_sputum"],
            "duration": "5 days",
            "severity": "medium",
        },
        {
            "id": "diabetic-emergency",
            "chief_complaint": "Altered consciousness, found by family",
            "vitals": {"hr": 120, "bp": "90/60", "spo2": 97, "temp": 36.8, "rr": 32},
            "history": "42-year-old male, Type 1 DM, non-compliant with insulin",
            "symptoms": ["altered_consciousness", "kussmaul_breathing", "dehydration", "abdominal_pain"],
            "duration": "12 hours progressive",
            "severity": "critical",
        },
        {
            "id": "oncology-followup",
            "chief_complaint": "Post-chemotherapy fatigue and low-grade fever",
            "vitals": {"hr": 88, "bp": "110/70", "spo2": 98, "temp": 38.0, "rr": 18},
            "history": "35-year-old female, breast cancer stage IIB, cycle 4 of AC-T",
            "symptoms": ["fatigue", "low_grade_fever", "neutropenia_risk", "nausea"],
            "duration": "3 days post-chemo",
            "severity": "high",
        },
    ]

    @classmethod
    def generate(cls, scenario_id: Optional[str] = None) -> Dict[str, Any]:
        if scenario_id:
            for t in cls.TEMPLATES:
                if t["id"] == scenario_id:
                    return {**t, "generated_at": datetime.now(timezone.utc).isoformat()}

        import random
        template = random.choice(cls.TEMPLATES)
        return {**template, "generated_at": datetime.now(timezone.utc).isoformat()}


class VirtualDoctor:
    """Simulates physician clinical reasoning."""

    @staticmethod
    def assess(patient: Dict[str, Any], triage_result: Dict[str, Any]) -> Dict[str, Any]:
        symptoms = patient.get("symptoms", [])
        vitals = patient.get("vitals", {})

        differentials = []
        if "chest_pain" in symptoms:
            differentials = ["Acute MI", "Unstable Angina", "Aortic Dissection", "PE"]
        elif "fever" in symptoms and "cough" in symptoms:
            differentials = ["Community-Acquired Pneumonia", "COPD Exacerbation", "COVID-19", "TB"]
        elif "altered_consciousness" in symptoms:
            differentials = ["DKA", "Hypoglycemia", "Stroke", "Sepsis"]
        elif "neutropenia_risk" in symptoms:
            differentials = ["Febrile Neutropenia", "Chemotherapy Side Effects", "Infection"]
        else:
            differentials = ["Requires further evaluation"]

        return {
            "agent": "VirtualDoctor",
            "differentials": differentials,
            "primary_suspicion": differentials[0] if differentials else "Unknown",
            "orders": _generate_orders(symptoms),
            "reasoning": f"Based on {len(symptoms)} symptoms and vital signs assessment",
            "urgency": triage_result.get("esi_level", 3),
        }


class VirtualLab:
    """Simulates laboratory results."""

    @staticmethod
    def process_orders(orders: List[str], patient: Dict[str, Any]) -> Dict[str, Any]:
        results = {}
        symptoms = patient.get("symptoms", [])

        if "cbc" in orders:
            results["cbc"] = {
                "wbc": 14.2 if "fever" in symptoms else 7.5,
                "hgb": 11.2,
                "plt": 180,
                "neutrophils": 88 if "neutropenia_risk" in symptoms else 65,
            }

        if "bmp" in orders or "cmp" in orders:
            results["metabolic"] = {
                "glucose": 450 if "altered_consciousness" in symptoms else 110,
                "sodium": 132 if "dehydration" in symptoms else 140,
                "potassium": 5.8 if "altered_consciousness" in symptoms else 4.2,
                "creatinine": 1.4,
                "bun": 28,
            }

        if "cardiac_enzymes" in orders or "troponin" in orders:
            results["cardiac"] = {
                "troponin_i": 2.4 if "chest_pain" in symptoms else 0.01,
                "ck_mb": 45 if "chest_pain" in symptoms else 5,
                "bnp": 850 if "dyspnea" in symptoms else 50,
            }

        if "abg" in orders:
            results["abg"] = {
                "ph": 7.18 if "kussmaul_breathing" in symptoms else 7.38,
                "pco2": 22 if "kussmaul_breathing" in symptoms else 40,
                "po2": 85,
                "hco3": 8 if "kussmaul_breathing" in symptoms else 24,
            }

        if "chest_xray" in orders:
            results["imaging"] = {
                "chest_xray": "Bilateral infiltrates" if "cough" in symptoms else "Normal cardiac silhouette",
            }

        return {
            "agent": "VirtualLab",
            "results": results,
            "turnaround_time_minutes": 45,
            "critical_values": [
                k for k, v in results.items()
                if isinstance(v, dict) and any(
                    _is_critical(sv) for sv in v.values() if isinstance(sv, (int, float))
                )
            ],
        }


class VirtualInsurance:
    """Simulates insurance eligibility and pre-authorization."""

    @staticmethod
    def check_eligibility(patient_id: str, service_code: str) -> Dict[str, Any]:
        return {
            "agent": "VirtualInsurance",
            "patient_id": patient_id,
            "eligible": True,
            "payer": "Al Rajhi Takaful (Simulated)",
            "policy_status": "Active",
            "pre_auth_required": service_code in ["99285", "99291", "71046"],
            "copay_percent": 20,
            "nphies_status": "validated",
        }


class VirtualPharmacy:
    """Simulates pharmacy dispensing."""

    @staticmethod
    def process_orders(medications: List[str]) -> Dict[str, Any]:
        return {
            "agent": "VirtualPharmacy",
            "medications_dispensed": medications,
            "interactions_checked": True,
            "allergy_check": "clear",
            "dispensing_time_minutes": 15,
        }


class VirtualRadiology:
    """Simulates radiology reading."""

    @staticmethod
    def read_study(study_type: str, patient: Dict[str, Any]) -> Dict[str, Any]:
        findings = "Normal study"
        symptoms = patient.get("symptoms", [])

        if study_type == "chest_xray":
            if "cough" in symptoms:
                findings = "Right lower lobe consolidation consistent with pneumonia"
            elif "chest_pain" in symptoms:
                findings = "Mild cardiomegaly, no acute pulmonary process"

        elif study_type == "ct_chest":
            if "dyspnea" in symptoms:
                findings = "Bilateral ground-glass opacities, possible infectious vs inflammatory etiology"

        elif study_type == "ecg":
            if "chest_pain" in symptoms:
                findings = "ST elevation in leads II, III, aVF - concerning for inferior STEMI"

        return {
            "agent": "VirtualRadiology",
            "study_type": study_type,
            "findings": findings,
            "priority": "STAT" if patient.get("severity") == "critical" else "Routine",
            "radiologist": "Dr. AI (Simulated)",
        }


# ── Simulation Pipeline ─────────────────────────────────────────────────

class HospitalSimulation:
    """
    Full hospital simulation pipeline.
    Runs patient through triage → doctor → lab → consultant → risk analysis.
    """

    async def run(
        self,
        scenario_id: Optional[str] = None,
        custom_patient: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Execute a full simulation run with iterative patient-doctor loops."""
        started = datetime.now(timezone.utc)

        # 1. Generate or use patient
        patient = custom_patient or VirtualPatient.generate(scenario_id)
        max_cycles = int(patient.get("loop_cycles", 3))

        loop_trace: List[Dict[str, Any]] = []
        triage: Dict[str, Any] = {}
        doctor: Dict[str, Any] = {}
        lab: Dict[str, Any] = {}
        risk: Dict[str, Any] = {}
        treatment: Dict[str, Any] = {}
        radiology: Optional[Dict[str, Any]] = None

        for cycle in range(1, max_cycles + 1):
            triage = self._nurse_triage(patient)
            doctor = VirtualDoctor.assess(patient, triage)
            lab = VirtualLab.process_orders(doctor.get("orders", []), patient)

            imaging_orders = [
                o for o in doctor.get("orders", [])
                if o in ["chest_xray", "ct_chest", "ecg"]
            ]
            if imaging_orders:
                radiology = VirtualRadiology.read_study(imaging_orders[0], patient)

            risk = self._risk_analysis(patient, triage, doctor, lab)
            treatment = self._generate_treatment_plan(doctor, lab, risk)

            loop_trace.append(
                {
                    "cycle": cycle,
                    "triage": triage,
                    "doctor": doctor,
                    "lab": lab,
                    "risk": risk,
                    "treatment": treatment,
                    "radiology": radiology,
                }
            )

            if risk.get("risk_level") != "critical":
                break

            patient = self._apply_intervention_effects(patient, treatment)

        # 6. Insurance check
        insurance = VirtualInsurance.check_eligibility(
            patient.get("id", "SIM-001"), "99285"
        )

        # 8. Build simulated NPHIES/FHIR worker outputs.
        fhir_bundle = self._build_fhir_claim_bundle(patient, doctor, insurance)
        validation_reports = validate_bundle_entries(fhir_bundle)
        worker_results = self._build_validation_worker_output(validation_reports)

        completed = datetime.now(timezone.utc)

        return {
            "simulation_id": f"sim-{started.strftime('%Y%m%d%H%M%S')}",
            "scenario": patient.get("id", "custom"),
            "status": "completed",
            "duration_ms": (completed - started).total_seconds() * 1000,
            "loops_executed": len(loop_trace),
            "pipeline": {
                "patient_presentation": patient,
                "nurse_triage": triage,
                "doctor_assessment": doctor,
                "lab_results": lab,
                "radiology": radiology,
                "insurance": insurance,
                "risk_analysis": risk,
                "loop_trace": loop_trace,
                "validation_workers": worker_results,
            },
            "outcome": {
                "diagnosis": doctor.get("primary_suspicion"),
                "differentials": doctor.get("differentials", []),
                "treatment_plan": treatment,
                "risk_alerts": risk.get("alerts", []),
                "evidence_sources": risk.get("evidence", []),
                "fhir_nphies_ready": worker_results.get("safe_to_submit", False),
                "validation_errors": worker_results.get("errors", []),
            },
            "meta": {
                "platform": "BrainSAIT eCarePlus",
                "environment": "simulation",
                "agents_involved": 6,
                "started_at": started.isoformat(),
                "completed_at": completed.isoformat(),
            },
        }

    def _apply_intervention_effects(
        self, patient: Dict[str, Any], treatment: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Apply simplified intervention effects between simulation loops."""
        updated = {**patient}
        vitals = {**patient.get("vitals", {})}

        if vitals.get("hr", 80) > 90:
            vitals["hr"] = max(80, vitals["hr"] - 8)
        if vitals.get("spo2", 96) < 96:
            vitals["spo2"] = min(99, vitals["spo2"] + 2)
        if vitals.get("temp", 37.0) > 38.0:
            vitals["temp"] = max(37.2, round(vitals["temp"] - 0.4, 1))

        updated["vitals"] = vitals
        updated["severity"] = "high" if patient.get("severity") == "critical" else "medium"
        updated["intervention_note"] = (
            f"Applied {len(treatment.get('medications', []))} medication orders"
        )
        return updated

    def _build_fhir_claim_bundle(
        self,
        patient: Dict[str, Any],
        doctor: Dict[str, Any],
        insurance: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Create a minimal message bundle consumable by FHIR/NPHIES validators."""
        patient_id = patient.get("id", "SIM-001")
        claim_id = f"CLM-{patient_id}"

        patient_resource = {
            "resourceType": "Patient",
            "id": patient_id,
            "identifier": [{"system": "http://nphies.sa/identifier/iqama", "value": "2538864592"}],
            "name": [{"text": "Simulated Patient"}],
            "gender": "male",
            "birthDate": "1970-01-01",
            "extension": [
                {
                    "url": "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-nationality",
                    "valueCodeableConcept": {
                        "coding": [
                            {
                                "system": "http://nphies.sa/terminology/CodeSystem/ksa-nationality",
                                "code": "SA",
                            }
                        ]
                    },
                },
                {
                    "url": "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-occupation",
                    "valueCodeableConcept": {
                        "coding": [
                            {
                                "system": "http://nphies.sa/terminology/CodeSystem/occupation",
                                "code": "employee",
                            }
                        ]
                    },
                },
            ],
        }

        claim_resource = {
            "resourceType": "Claim",
            "id": claim_id,
            "status": "active",
            "type": {"coding": [{"system": "http://nphies.sa/terminology/CodeSystem/claim-type", "code": "institutional"}]},
            "use": "claim",
            "patient": {"reference": f"Patient/{patient_id}"},
            "created": datetime.now(timezone.utc).date().isoformat(),
            "insurer": {"reference": "Organization/PAYER-001"},
            "provider": {"reference": "Organization/PROVIDER-001"},
            "priority": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/processpriority", "code": "normal"}]},
            "insurance": [{"sequence": 1, "focal": True, "coverage": {"reference": "Coverage/COV-001"}}],
            "item": [{"sequence": 1, "productOrService": {"coding": [{"system": "http://nphies.sa/terminology/CodeSystem/sbs", "code": "B00113"}]}}],
            "extension": [
                {
                    "url": "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-episode",
                    "valueString": "simulated-episode",
                },
                {
                    "url": "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-patientShare",
                    "valueMoney": {"value": 20, "currency": "SAR"},
                },
            ],
        }

        header = build_nphies_message_header(
            event_code="claim-request",
            sender_org_id="PROVIDER-001",
            receiver_org_id="PAYER-001",
            focus_references=[f"Claim/{claim_id}"],
        )
        return build_message_bundle(header, [patient_resource, claim_resource])

    def _build_validation_worker_output(
        self, validation_reports: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Return worker-friendly FHIR/NPHIES validation output."""
        errors: List[str] = []
        warnings: List[str] = []

        for report in validation_reports:
            for missing in report.get("missing_required", []):
                errors.append(f"{report.get('resource_type')}: missing {missing}")
            for violation in report.get("cardinality_violations", []):
                errors.append(f"{report.get('resource_type')}: {violation}")
            warnings.extend(report.get("nphies_warnings", []))

        return {
            "safe_to_submit": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "entry_reports": validation_reports,
            "workers": {
                "fhir_validator": "completed",
                "nphies_rule_engine": "completed",
            },
        }

    def _nurse_triage(self, patient: Dict[str, Any]) -> Dict[str, Any]:
        """Simulate nurse triage assessment."""
        vitals = patient.get("vitals", {})
        severity = patient.get("severity", "medium")

        esi_map = {"critical": 1, "high": 2, "medium": 3, "low": 4}
        esi_level = esi_map.get(severity, 3)

        alerts = []
        if vitals.get("spo2", 100) < 94:
            alerts.append("Low SpO2 - oxygen required")
        if vitals.get("hr", 70) > 100:
            alerts.append("Tachycardia")
        if vitals.get("temp", 37) > 38.5:
            alerts.append("Febrile")
        if vitals.get("bp", "120/80").startswith("1") and int(vitals.get("bp", "120/80").split("/")[0]) > 150:
            alerts.append("Hypertension")

        return {
            "agent": "NurseTriage",
            "esi_level": esi_level,
            "vitals_assessed": vitals,
            "alerts": alerts,
            "recommended_area": "Resuscitation" if esi_level <= 2 else "Acute Care",
            "immediate_actions": _immediate_nursing_actions(severity, alerts),
        }

    def _risk_analysis(
        self,
        patient: Dict[str, Any],
        triage: Dict[str, Any],
        doctor: Dict[str, Any],
        lab: Dict[str, Any],
    ) -> Dict[str, Any]:
        """AI risk analysis across all data points."""
        alerts = []
        evidence = []

        # Check critical vitals
        vitals = patient.get("vitals", {})
        if vitals.get("spo2", 100) < 92:
            alerts.append({"level": "critical", "message": "Severe hypoxia - immediate intervention required"})
        if vitals.get("hr", 70) > 120:
            alerts.append({"level": "high", "message": "Significant tachycardia"})

        # Check critical labs
        lab_results = lab.get("results", {})
        if "cardiac" in lab_results:
            troponin = lab_results["cardiac"].get("troponin_i", 0)
            if troponin > 0.04:
                alerts.append({"level": "critical", "message": f"Elevated troponin ({troponin}) - ACS protocol"})
                evidence.append("ACC/AHA Guidelines for STEMI Management, 2023")

        if "metabolic" in lab_results:
            glucose = lab_results["metabolic"].get("glucose", 100)
            if glucose > 300:
                alerts.append({"level": "critical", "message": f"Hyperglycemia ({glucose}) - DKA protocol"})
                evidence.append("ADA Standards of Care in Diabetes, 2024")

        if "abg" in lab_results:
            ph = lab_results["abg"].get("ph", 7.4)
            if ph < 7.25:
                alerts.append({"level": "critical", "message": f"Severe acidosis (pH {ph})"})

        # Check critical lab values
        for result_type, results in lab_results.items():
            if isinstance(results, dict) and lab_results.get("critical_values"):
                if result_type in lab.get("critical_values", []):
                    alerts.append({"level": "high", "message": f"Critical values in {result_type}"})

        evidence.extend([
            "Saudi MOH Emergency Department Guidelines",
            "WHO Clinical Decision Support Framework",
        ])

        return {
            "agent": "AIRiskAnalyst",
            "risk_score": len(alerts) * 25,  # Simplified scoring
            "risk_level": "critical" if any(a["level"] == "critical" for a in alerts) else "moderate",
            "alerts": alerts,
            "evidence": evidence,
            "recommendation": "Immediate specialist intervention" if alerts else "Standard care pathway",
        }

    def _generate_treatment_plan(
        self,
        doctor: Dict[str, Any],
        lab: Dict[str, Any],
        risk: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate treatment plan based on collective analysis."""
        primary = doctor.get("primary_suspicion", "Unknown")

        medications = []
        procedures = []
        monitoring = []

        if "MI" in primary or "Angina" in primary or "STEMI" in primary:
            medications = ["Aspirin 325mg", "Clopidogrel 600mg", "Heparin drip", "Morphine PRN"]
            procedures = ["ECG monitoring", "Cardiac catheterization consult"]
            monitoring = ["Continuous telemetry", "Serial troponins q6h", "Repeat ECG in 30min"]

        elif "Pneumonia" in primary:
            medications = ["Ceftriaxone 2g IV", "Azithromycin 500mg IV", "O2 therapy"]
            procedures = ["Sputum culture", "Blood cultures x2"]
            monitoring = ["SpO2 continuous", "Repeat CXR in 48h", "CBC in 24h"]

        elif "DKA" in primary:
            medications = ["Insulin drip 0.1u/kg/hr", "NS bolus 1L", "Potassium replacement"]
            procedures = ["Central line placement", "Continuous glucose monitoring"]
            monitoring = ["BMP q2h", "ABG q4h", "I&O hourly", "Gap closure monitoring"]

        elif "Neutropenia" in primary:
            medications = ["Piperacillin-Tazobactam 4.5g IV q6h", "Filgrastim 5mcg/kg", "Acetaminophen PRN"]
            procedures = ["Blood cultures x2", "Urine culture"]
            monitoring = ["ANC daily", "Temperature q4h", "CRP daily"]

        return {
            "primary_diagnosis": primary,
            "medications": medications,
            "procedures": procedures,
            "monitoring": monitoring,
            "disposition": "ICU" if risk.get("risk_level") == "critical" else "Ward admission",
            "follow_up": "24 hours reassessment",
        }


# ── Helpers ──────────────────────────────────────────────────────────────

def _generate_orders(symptoms: List[str]) -> List[str]:
    """Generate lab/imaging orders based on symptoms."""
    orders = ["cbc", "bmp"]

    if "chest_pain" in symptoms:
        orders.extend(["cardiac_enzymes", "troponin", "ecg", "chest_xray"])
    if "fever" in symptoms or "cough" in symptoms:
        orders.extend(["chest_xray", "blood_culture", "procalcitonin"])
    if "altered_consciousness" in symptoms or "kussmaul_breathing" in symptoms:
        orders.extend(["abg", "cmp", "urinalysis", "serum_ketones"])
    if "neutropenia_risk" in symptoms:
        orders.extend(["blood_culture", "cmp", "procalcitonin"])
    if "dyspnea" in symptoms:
        orders.append("abg")

    return list(set(orders))


def _immediate_nursing_actions(severity: str, alerts: List[str]) -> List[str]:
    actions = []
    if severity in ("critical", "high"):
        actions.append("Establish IV access")
        actions.append("Apply continuous monitoring")
    if "Low SpO2" in " ".join(alerts):
        actions.append("Apply supplemental oxygen")
    if "Tachycardia" in " ".join(alerts):
        actions.append("12-lead ECG")
    if "Febrile" in " ".join(alerts):
        actions.append("Blood cultures before antibiotics")
    return actions or ["Standard assessment protocol"]


def _is_critical(value) -> bool:
    """Check if a lab value is critically abnormal (simplified)."""
    if isinstance(value, (int, float)):
        return value > 300 or value < 0.5  # Very simplified
    return False
