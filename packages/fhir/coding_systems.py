# packages/fhir-coding/coding_systems.py
# MEDICAL: Multi-system FHIR coding — SNOMED CT, RxNorm, LOINC, ICD-10, CPT
# BILINGUAL: Arabic/English display with FHIR translation extensions
# Source: Anthropic FHIR Developer Agent Skill + BrainSAIT Saudi layer

CODING_SYSTEMS: dict[str, str] = {
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

    # Vital Signs
    "ucum": "http://unitsofmeasure.org",

    # Allergy
    "ndfrt": "http://hl7.org/fhir/ndfrt",

    # ─── Saudi NPHIES Systems ───
    "nphies_diagnosis": "http://nphies.sa/terminology/CodeSystem/diag-type",
    "nphies_procedure": "http://nphies.sa/terminology/CodeSystem/procedure-type",
    "nphies_drug": "http://nphies.sa/terminology/CodeSystem/medication-codes",
    "nphies_dental": "http://nphies.sa/terminology/CodeSystem/dental-procedure",
    "nphies_vision": "http://nphies.sa/terminology/CodeSystem/vision-codes",
    "nphies_claim_type": "http://nphies.sa/terminology/CodeSystem/claim-type",
    "nphies_coverage_type": "http://nphies.sa/terminology/coverage-type",
    "nphies_practice_code": "http://nphies.sa/terminology/CodeSystem/practice-codes",
    "nphies_nationality": "http://nphies.sa/terminology/CodeSystem/ksa-nationality",
    "nphies_marital": "http://nphies.sa/terminology/CodeSystem/marital-status",
}

# ─── SNOMED CT — Common Clinical Conditions (Arabic/English) ───
SNOMED_ARABIC: dict[str, dict[str, str]] = {
    "73211009": {"en": "Diabetes mellitus", "ar": "داء السكري"},
    "44054006": {"en": "Type 2 diabetes mellitus", "ar": "داء السكري من النوع الثاني"},
    "46635009": {"en": "Type 1 diabetes mellitus", "ar": "داء السكري من النوع الأول"},
    "38341003": {"en": "Hypertensive disorder", "ar": "اضطراب ارتفاع ضغط الدم"},
    "59621000": {"en": "Essential hypertension", "ar": "ارتفاع ضغط الدم الأساسي"},
    "195967001": {"en": "Asthma", "ar": "الربو"},
    "22298006": {"en": "Myocardial infarction", "ar": "احتشاء عضلة القلب"},
    "84114007": {"en": "Heart failure", "ar": "فشل القلب"},
    "13645005": {"en": "Chronic obstructive pulmonary disease", "ar": "مرض الانسداد الرئوي المزمن"},
    "73430006": {"en": "Sleep disorder", "ar": "اضطراب النوم"},
    "90560007": {"en": "Gout", "ar": "النقرس"},
    "69896004": {"en": "Rheumatoid arthritis", "ar": "التهاب المفاصل الروماتويدي"},
    "363346000": {"en": "Malignant neoplastic disease", "ar": "ورم خبيث"},
    "40055000": {"en": "Chronic kidney disease", "ar": "مرض الكلى المزمن"},
    "235856003": {"en": "Liver disease", "ar": "مرض الكبد"},
    "399068003": {"en": "Prostate cancer", "ar": "سرطان البروستاتا"},
    "254837009": {"en": "Breast cancer", "ar": "سرطان الثدي"},
    "25064002": {"en": "Headache", "ar": "صداع"},
    "57676002": {"en": "Joint pain", "ar": "ألم المفاصل"},
    "21522001": {"en": "Abdominal pain", "ar": "ألم البطن"},
    "267036007": {"en": "Dyspnea", "ar": "ضيق التنفس"},
    "22253000": {"en": "Pain", "ar": "ألم"},
    "386661006": {"en": "Fever", "ar": "حمى"},
}

# ─── RxNorm — Common Saudi Medications (Arabic/English) ───
RXNORM_ARABIC: dict[str, dict[str, str]] = {
    "860975": {"en": "Metformin 500 MG Oral Tablet", "ar": "ميتفورمين 500 مجم أقراص"},
    "860974": {"en": "Metformin 850 MG Oral Tablet", "ar": "ميتفورمين 850 مجم أقراص"},
    "197361": {"en": "Amlodipine 5 MG Oral Tablet", "ar": "أملوديبين 5 مجم أقراص"},
    "197362": {"en": "Amlodipine 10 MG Oral Tablet", "ar": "أملوديبين 10 مجم أقراص"},
    "311702": {"en": "Atorvastatin 10 MG Oral Tablet", "ar": "أتورفاستاتين 10 مجم أقراص"},
    "617310": {"en": "Atorvastatin 40 MG Oral Tablet", "ar": "أتورفاستاتين 40 مجم أقراص"},
    "308460": {"en": "Lisinopril 10 MG Oral Tablet", "ar": "ليزينوبريل 10 مجم أقراص"},
    "197380": {"en": "Omeprazole 20 MG Oral Capsule", "ar": "أوميبرازول 20 مجم كبسولات"},
    "308964": {"en": "Pantoprazole 40 MG Oral Tablet", "ar": "بانتوبرازول 40 مجم أقراص"},
    "209459": {"en": "Amoxicillin 500 MG Oral Capsule", "ar": "أموكسيسيلين 500 مجم كبسولات"},
    "141962": {"en": "Paracetamol 500 MG Oral Tablet", "ar": "باراسيتامول 500 مجم أقراص"},
    "5640": {"en": "Ibuprofen 400 MG Oral Tablet", "ar": "إيبوبروفين 400 مجم أقراص"},
    "1049502": {"en": "Insulin Glargine 100 Units/mL", "ar": "إنسولين جلارجين 100 وحدة/مل"},
    "1157346": {"en": "Sitagliptin 100 MG Oral Tablet", "ar": "سيتاجليبتين 100 مجم أقراص"},
}

# ─── LOINC — Common Lab and Vital Codes ───
LOINC_ARABIC: dict[str, dict[str, str]] = {
    "2339-0": {"en": "Glucose [Mass/volume] in Blood", "ar": "جلوكوز الدم", "unit": "mg/dL"},
    "4548-4": {"en": "Hemoglobin A1c/Hemoglobin.total in Blood", "ar": "الهيموجلوبين السكري", "unit": "%"},
    "2160-0": {"en": "Creatinine [Mass/volume] in Serum", "ar": "الكرياتينين في المصل", "unit": "mg/dL"},
    "2093-3": {"en": "Cholesterol [Mass/volume] in Serum", "ar": "الكوليسترول الكلي", "unit": "mg/dL"},
    "2085-9": {"en": "HDL Cholesterol", "ar": "الكوليسترول الجيد HDL", "unit": "mg/dL"},
    "13457-7": {"en": "LDL Cholesterol", "ar": "الكوليسترول الضار LDL", "unit": "mg/dL"},
    "6690-2": {"en": "WBC [#/volume] in Blood", "ar": "كريات الدم البيضاء", "unit": "10^3/uL"},
    "718-7": {"en": "Hemoglobin [Mass/volume] in Blood", "ar": "الهيموجلوبين", "unit": "g/dL"},
    "777-3": {"en": "Platelets [#/volume] in Blood", "ar": "الصفائح الدموية", "unit": "10^3/uL"},
    "2951-2": {"en": "Sodium [Moles/volume] in Serum", "ar": "الصوديوم في المصل", "unit": "mEq/L"},
    "2823-3": {"en": "Potassium [Moles/volume] in Serum", "ar": "البوتاسيوم في المصل", "unit": "mEq/L"},
    "17861-6": {"en": "Calcium [Mass/volume] in Serum", "ar": "الكالسيوم في المصل", "unit": "mg/dL"},
    "1920-8": {"en": "Aspartate aminotransferase [Enzymatic activity/volume] in Serum", "ar": "إنزيم AST", "unit": "U/L"},
    "1742-6": {"en": "Alanine aminotransferase [Enzymatic activity/volume] in Serum", "ar": "إنزيم ALT", "unit": "U/L"},
    "1975-2": {"en": "Bilirubin.total [Mass/volume] in Serum", "ar": "البيليروبين الكلي", "unit": "mg/dL"},
    "2857-1": {"en": "PSA [Mass/volume] in Serum", "ar": "مستضد البروستاتا النوعي", "unit": "ng/mL"},
    # Vital Signs
    "8867-4": {"en": "Heart rate", "ar": "معدل ضربات القلب", "unit": "/min"},
    "9279-1": {"en": "Respiratory rate", "ar": "معدل التنفس", "unit": "/min"},
    "8310-5": {"en": "Body temperature", "ar": "درجة حرارة الجسم", "unit": "Cel"},
    "8302-2": {"en": "Body height", "ar": "الطول", "unit": "cm"},
    "29463-7": {"en": "Body weight", "ar": "الوزن", "unit": "kg"},
    "39156-5": {"en": "Body mass index (BMI)", "ar": "مؤشر كتلة الجسم", "unit": "kg/m2"},
    "55284-4": {"en": "Blood pressure systolic and diastolic", "ar": "ضغط الدم", "unit": "mm[Hg]"},
    "8480-6": {"en": "Systolic blood pressure", "ar": "ضغط الدم الانقباضي", "unit": "mm[Hg]"},
    "8462-4": {"en": "Diastolic blood pressure", "ar": "ضغط الدم الانبساطي", "unit": "mm[Hg]"},
    "2708-6": {"en": "Oxygen saturation", "ar": "تشبع الأكسجين", "unit": "%"},
}


def build_coding(
    system_key: str,
    code: str,
    display_en: str,
    display_ar: str = None
) -> dict:
    """
    Build a FHIR Coding element with optional Arabic translation extension.
    Pattern from Anthropic FHIR Developer Agent Skill.

    Args:
        system_key: Key from CODING_SYSTEMS dict (e.g., "loinc", "snomed")
        code: The code value
        display_en: English display name
        display_ar: Arabic display name (optional, adds FHIR translation extension)

    Returns:
        FHIR Coding object
    """
    coding: dict = {
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


def build_codeable_concept(
    system_key: str,
    code: str,
    display_en: str,
    display_ar: str = None,
    text: str = None
) -> dict:
    """
    Build a FHIR CodeableConcept with optional bilingual text.

    Args:
        system_key: Coding system key
        code: Code value
        display_en: English display
        display_ar: Arabic display (optional)
        text: Free text (defaults to display_en)

    Returns:
        FHIR CodeableConcept
    """
    return {
        "coding": [build_coding(system_key, code, display_en, display_ar)],
        "text": text or display_en,
    }


def get_snomed_bilingual(snomed_code: str) -> dict | None:
    """Look up a SNOMED code and return bilingual CodeableConcept."""
    term = SNOMED_ARABIC.get(snomed_code)
    if not term:
        return None
    return build_codeable_concept(
        "snomed", snomed_code,
        term["en"], term["ar"],
        text=term["ar"]  # Arabic as primary text for Saudi context
    )


def get_rxnorm_bilingual(rxnorm_code: str) -> dict | None:
    """Look up an RxNorm code and return bilingual CodeableConcept."""
    med = RXNORM_ARABIC.get(rxnorm_code)
    if not med:
        return None
    return build_codeable_concept(
        "rxnorm", rxnorm_code,
        med["en"], med["ar"],
        text=med["ar"]
    )


def get_loinc_bilingual(loinc_code: str) -> dict | None:
    """Look up a LOINC code and return bilingual CodeableConcept + unit."""
    lab = LOINC_ARABIC.get(loinc_code)
    if not lab:
        return None
    concept = build_codeable_concept(
        "loinc", loinc_code,
        lab["en"], lab["ar"],
        text=lab["ar"]
    )
    concept["_unit"] = lab.get("unit", "")  # Convenience field
    return concept


def build_observation_value(
    loinc_code: str,
    value: float,
    custom_unit: str = None
) -> dict:
    """
    Build a FHIR Observation valueQuantity using LOINC + UCUM units.

    Args:
        loinc_code: LOINC code for the observation
        value: Numeric value
        custom_unit: Override unit (defaults to LOINC table unit)

    Returns:
        FHIR valueQuantity element
    """
    lab = LOINC_ARABIC.get(loinc_code, {})
    unit = custom_unit or lab.get("unit", "")
    return {
        "value": value,
        "unit": unit,
        "system": CODING_SYSTEMS["ucum"],
        "code": unit,
    }
