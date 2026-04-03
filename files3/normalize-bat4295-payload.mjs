/**
 * COMPLIANCELINC — BrainSAIT
 * Normalize BAT-2026-NB-00004295-OT rejection data into oracle-scanner-compatible
 * submissions[] array with explicit attachment requirements per NPHIES rejection code.
 *
 * Fixes the critical blocker from NPHIES_SUBMISSION_AUDIT_2026-02-11:
 *   - patients[].submissions → top-level submissions[] (oracle-scanner.mjs:64-76)
 *   - numeric attachment counts → explicit attachment objects with type + requirement
 *
 * Usage:
 *   node normalize-bat4295-payload.mjs --output nphies_normalized_bat4295.json
 */

import { writeFileSync } from "fs";

const BATCH_ID   = "BAT-2026-NB-00004295-OT";
const PAYER      = "Al Rajhi Takaful";
const PROVIDER   = "Hayat National Hospital - Riyadh";
const PERIOD     = { from: "2026-02-01", to: "2026-02-28" };
const DEADLINE   = "2026-04-06"; // 15 days from settlement 2026-03-22
const ORACLE_URL = "https://128.1.1.185/prod/faces/Home";

// ─── Attachment requirements per NPHIES rejection code ───────────────────────
const ATTACHMENT_MATRIX = {
  "BE-1-4": [
    { type: "PRIOR_AUTH_REQUEST",    label: "Prior Authorization Request Letter",     required: true  },
    { type: "CLINICAL_NOTES",        label: "Treating Physician Clinical Notes",       required: true  },
    { type: "MEDICAL_REPORT",        label: "Medical Report / Referral",               required: true  },
    { type: "INVOICE",               label: "Original Hospital Invoice",               required: true  },
    { type: "DISCHARGE_SUMMARY",     label: "Discharge Summary (if inpatient)",        required: false },
  ],
  "MN-1-1": [
    { type: "CPG_REFERENCE",         label: "Saudi CPG / SCFHS Clinical Guideline",   required: true  },
    { type: "CLINICAL_NOTES",        label: "Physician Clinical Notes with Diagnosis", required: true  },
    { type: "LAB_RESULTS",           label: "Supporting Lab / Investigation Results",  required: true  },
    { type: "INVOICE",               label: "Original Hospital Invoice",               required: true  },
  ],
  "CV-1-3": [
    { type: "POLICY_SCHEDULE",       label: "Insurance Policy Schedule / Benefits",    required: true  },
    { type: "CLINICAL_NOTES",        label: "Clinical Notes with ICD-10 Justification",required: true },
    { type: "MEDICAL_NECESSITY",     label: "Medical Necessity Statement",             required: true  },
    { type: "INVOICE",               label: "Original Hospital Invoice",               required: true  },
  ],
  "BE-1-3": [
    { type: "SERVICE_CODE_MAPPING",  label: "Corrected Service Code Mapping",          required: true  },
    { type: "CONTRACT_SCHEDULE",     label: "Provider-Payer Contract Service Schedule", required: true },
    { type: "INVOICE",               label: "Original Hospital Invoice",               required: true  },
    { type: "CLINICAL_NOTES",        label: "Clinical Notes",                          required: true  },
  ],
  "AD-1-4": [
    { type: "DIAGNOSIS_LINKAGE",     label: "Diagnosis-to-Procedure Linkage Report",  required: true  },
    { type: "CLINICAL_NOTES",        label: "Clinical Notes with Diagnosis Context",   required: true  },
    { type: "INVOICE",               label: "Original Hospital Invoice",               required: true  },
  ],
  "SE-1-6": [
    { type: "INVESTIGATION_RESULT",  label: "Investigation / Lab Result Document",     required: true  },
    { type: "XRAY_IMAGE",            label: "Radiology / Imaging File (DICOM/JPEG)",   required: true  },
    { type: "CLINICAL_NOTES",        label: "Clinical Notes",                          required: true  },
    { type: "INVOICE",               label: "Original Hospital Invoice",               required: true  },
  ],
  "CV-1-9": [
    { type: "FOLLOW_UP_JUSTIFICATION",label: "Clinical Justification for Follow-up",  required: true  },
    { type: "PREVIOUS_VISIT_RECORD", label: "Previous Visit Record (within 14 days)", required: true  },
    { type: "CLINICAL_NOTES",        label: "Clinical Notes",                          required: true  },
    { type: "INVOICE",               label: "Original Hospital Invoice",               required: true  },
  ],
  "AD-3-7": [
    { type: "AGE_JUSTIFICATION",     label: "Age-Appropriate Use Justification",       required: true  },
    { type: "CLINICAL_NOTES",        label: "Clinical Notes with Pediatric Context",   required: true  },
    { type: "INVOICE",               label: "Original Hospital Invoice",               required: true  },
  ],
  "AD-2-4": [
    { type: "DUPLICATE_JUSTIFICATION",label: "Clinical Justification for Same-Day Repeat", required: true },
    { type: "CLINICAL_NOTES",        label: "Clinical Notes",                          required: true  },
    { type: "INVOICE",               label: "Original Hospital Invoice",               required: true  },
  ],
};

// ─── Parsed rejection data from BAT-2026-NB-00004295-OT PDF ─────────────────
const PATIENTS = [
  {
    name: "سوده عبدا ناصر خالد",
    nationalId: "2538864592",
    bundles: [
      {
        bundleId: "8356cfdd-062d-4343-8cb6-00048da8f418",
        serviceDate: "2026-02-25",
        rejections: [
          { code: "B00113", name: "ALANINE AMINOTRANSFERASE (ALT/SGPT)",  reason: "MN-1-1" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "B01391", name: "SERUM URIC ACID",                       reason: "AD-1-4" },
          { code: "B01389", name: "SERUM TOTAL BILIRUBIN (T.BIL)",         reason: "MN-1-1" },
          { code: "B01369", name: "SERUM ALBUMIN",                         reason: "MN-1-1" },
          { code: "B00244", name: "ASPARTATE AMINOTRANSFERASE (AST/SGOT)", reason: "MN-1-1" },
        ],
        specialNote: "Chemotherapy patient — LFT monitoring panel. Attach oncology treatment plan.",
      },
      {
        bundleId: "f5cb6933-d93b-4d98-9cd9-bbfcfceaa8cb",
        serviceDate: "2026-02-14",
        rejections: [
          { code: "N00005",      name: "CONSULTATION FEE (CONSULTANT)",    reason: "BE-1-4" },
          { code: "1401256609",  name: "DACARBAZINE MEDAC",                reason: "BE-1-4" },
          { code: "39-355-07",   name: "DOXORUBICIN 2MG-ML VIAL",          reason: "BE-1-4" },
          { code: "1-202-91",    name: "BLEOCIN 15MG VIAL",                reason: "BE-1-4" },
        ],
        specialNote: "CHEMOTHERAPY — Dacarbazine, Doxorubicin, Bleomycin. URGENT: attach oncology PA + treatment protocol.",
        priority: "CRITICAL",
      },
    ],
  },
  {
    name: "OMAR MAHMOUD DEEB A",
    nationalId: "2337228015",
    bundles: [
      {
        bundleId: "976d0320-625b-4ae0-aede-d7f67859c3dc",
        serviceDate: "2026-02-28",
        rejections: [
          { code: "96092-ERR", name: "UNKNOWN SERVICE", reason: "BE-1-3" },
        ],
        specialNote: "96092-ERR: Service code unknown — MUST recode before resubmission. Check original invoice for actual procedure.",
        priority: "BLOCKER",
      },
      {
        bundleId: "4d2bc937-2b5a-4ace-9167-9668cfac0ec3",
        serviceDate: "2026-02-07",
        rejections: [
          { code: "N00005",   name: "CONSULTATION FEE (CONSULTANT)",       reason: "BE-1-4" },
          { code: "D00015",   name: "ANKLE/FOOT (FOUR VIEWS)",             reason: "BE-1-4" },
          { code: "143225",   name: "SLAB (BELOW OR ABOVE KNEE)",          reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "WARDAH ALI TAWFIQ ALI",
    nationalId: "2217205463",
    bundles: [
      {
        bundleId: "652eed2b-444d-41a7-82e6-8c2882fe1d83",
        serviceDate: "2026-02-07",
        rejections: [
          { code: "B00487", name: "CREATINE (SERUM)",                      reason: "MN-1-1" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
        ],
      },
      {
        bundleId: "ce42b9df-774f-4bc3-b17b-a29bdf78108f",
        serviceDate: "2026-02-08",
        rejections: [
          { code: "33-355-06", name: "EBETAXEL 300MG/50ML",               reason: "BE-1-4" },
        ],
        specialNote: "Chemotherapy — Ebetaxel (Paclitaxel). Attach oncology PA.",
        priority: "HIGH",
      },
    ],
  },
  {
    name: "WASMIAH AYED ALAZMI",
    nationalId: "1078576491",
    bundles: [
      {
        bundleId: "4ec09275-b53e-41b4-8aec-b5b8c6549fba",
        serviceDate: "2026-02-16",
        rejections: [
          { code: "N00006", name: "CONSULTATION FEE (SPECIALIST)",         reason: "MN-1-1" },
        ],
      },
    ],
  },
  {
    name: "ABDULRAHMAN OTMAN ALSHERL",
    nationalId: "1080602053",
    bundles: [
      {
        bundleId: "5701217f-2ec6-4a4d-8c38-19d74f22799c",
        serviceDate: "2026-02-25",
        rejections: [
          { code: "N00004", name: "CONSULTATION FEE (RESIDENT DR)",        reason: "BE-1-4" },
          { code: "142390", name: "PERIPHERAL I.V CANNULATION",            reason: "BE-1-4" },
          { code: "D00251", name: "SACRUM AND COCCYX (TWO VIEWS)",         reason: "BE-1-4" },
          { code: "D00161", name: "LUMBAR SPINE (TWO VIEWS)",              reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "MOHAMMAD DAWOOD MUNIR",
    nationalId: "2125631586",
    bundles: [
      {
        bundleId: "89ae81e4-71c2-4f6e-bd85-30e7704052e7",
        serviceDate: "2026-02-09",
        rejections: [
          { code: "N00024", name: "DENTAL CONSULTATION BY SPECIALIST",     reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "MOHMMED RAOUF RAUF MOHAMMED ALZABI",
    nationalId: "2458510506",
    bundles: [
      {
        bundleId: "0f5ac536-ba9a-414b-a490-e46d5ceb2c18",
        serviceDate: "2026-02-18",
        rejections: [
          { code: "142916", name: "PANORAMA X-RAY (ONE FILM)",             reason: "SE-1-6" },
          { code: "142929", name: "COMPOSITE FILLING (THREE/FOUR SURFACES)",reason: "SE-1-6" },
          { code: "N00024", name: "DENTAL CONSULTATION BY SPECIALIST",     reason: "SE-1-6" },
          { code: "142918", name: "SIMPLE TOOTH EXTRACTION",               reason: "SE-1-6" },
        ],
        specialNote: "SE-1-6: Attach panoramic X-ray image file (JPEG/DICOM) and clinical examination notes.",
      },
    ],
  },
  {
    name: "JANA AMER TAWIL",
    nationalId: "2262246297",
    bundles: [
      {
        bundleId: "c551aad6-d17a-4213-af1f-27d093228ded",
        serviceDate: "2026-02-10",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "B01466", name: "THYROID STIMULATING HORMONE (TSH)",     reason: "CV-1-3" },
        ],
        specialNote: "CV-1-3 on TSH — verify diagnosis coverage; if thyroid condition not covered, recode or attach policy exception.",
      },
    ],
  },
  {
    name: "MALAK SAEED NAJI MUSLEH",
    nationalId: "4683112595",
    bundles: [
      {
        bundleId: "9c155a7d-5874-4c3c-817b-61dbd0b318c1",
        serviceDate: "2026-02-17",
        rejections: [
          { code: "96092-ERR", name: "UNKNOWN SERVICE",                    reason: "BE-1-3" },
        ],
        priority: "BLOCKER",
        specialNote: "96092-ERR — recode before resubmission.",
      },
      {
        bundleId: "3b43cc51-8c05-47f2-a5c6-9e765eeaf310",
        serviceDate: "2026-02-17",
        rejections: [
          { code: "B01747", name: "VAGINAL SWAB CULTURE & SENSITIVITY",    reason: "MN-1-1" },
          { code: "B01740", name: "URINE CULTURE & SENSITIVITY",           reason: "BE-1-4" },
          { code: "B00473", name: "COMPLETE URINE ANALYSIS",               reason: "BE-1-4" },
          { code: "N00006", name: "CONSULTATION FEE (SPECIALIST)",         reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "MOHAMED MOSAD ABDELGAWAD ATIA",
    nationalId: "2453464410",
    bundles: [
      {
        bundleId: "478c8637-d1e4-4e9a-852c-754771e5752f",
        serviceDate: "2026-02-21",
        rejections: [
          { code: "96092-ERR", name: "UNKNOWN SERVICE",                    reason: "BE-1-3" },
          { code: "N00006",    name: "CONSULTATION FEE (SPECIALIST)",      reason: "BE-1-4" },
          { code: "B01375",    name: "SERUM CREATININE",                   reason: "BE-1-4" },
          { code: "B00737",    name: "GLYCOSELATED HEMOGLOBIN (HBA1C)",    reason: "BE-1-4" },
          { code: "B00642",    name: "FASTING BLOOD SUGAR (FBS)",          reason: "BE-1-4" },
          { code: "B00113",    name: "ALANINE AMINOTRANSFERASE (ALT/SGPT)",reason: "BE-1-4" },
        ],
        priority: "BLOCKER",
        specialNote: "96092-ERR in same bundle as diabetic monitoring panel — fix code then submit full bundle.",
      },
    ],
  },
  {
    name: "ALYAA ALY SAYED MOHAMED",
    nationalId: "2539959706",
    bundles: [
      {
        bundleId: "e3a2f296-2890-4301-863b-3ad86eda8355",
        serviceDate: "2026-02-16",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "D00002", name: "4-D ULTRASONOGRAPHY",                   reason: "CV-1-3" },
          { code: "B00731", name: "GLUCOSE TOLERANCE TEST (GTT)",          reason: "BE-1-4" },
          { code: "D00016", name: "ULTRASOUND-ANTENATAL STUDY (FOLLOW-UP)",reason: "BE-1-4" },
        ],
        specialNote: "CV-1-3 on 4D ultrasound — likely maternity/obstetric exclusion. Verify policy antenatal coverage.",
      },
    ],
  },
  {
    name: "AYMAN MOHAMED EISSA SEBTAN",
    nationalId: "2572631386",
    bundles: [
      {
        bundleId: "eff2178b-3caf-439b-80af-bb5488777604",
        serviceDate: "2026-02-16",
        rejections: [
          { code: "1205222017", name: "SINEMET 25-250MG TABLETS",          reason: "BE-1-4" },
          { code: "0109222578", name: "STALEVO 100-25-200MG FILM COATED",  reason: "BE-1-4" },
        ],
        specialNote: "Parkinson's medications (Levodopa combinations) — attach neurology PA.",
        priority: "HIGH",
      },
    ],
  },
  {
    name: "AHMED REDA MOHAMED DAKOUS",
    nationalId: "2482876261",
    bundles: [
      {
        bundleId: "b76ca1b9-81e4-4701-8954-a0b943881a7e",
        serviceDate: "2026-02-21",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "D01171", name: "PELVIS A.P (ONE VIEW)",                 reason: "BE-1-4" },
          { code: "D00163", name: "LUMBAR SPINE (FOUR VIEWS)",             reason: "BE-1-4" },
        ],
      },
      {
        bundleId: "df8a2d79-cba6-4f3b-b187-bd6c8f38f939",
        serviceDate: "2026-02-22",
        rejections: [
          { code: "96092-ERR", name: "UNKNOWN SERVICE",                    reason: "BE-1-3" },
        ],
        priority: "BLOCKER",
        specialNote: "96092-ERR — recode required.",
      },
    ],
  },
  {
    name: "ALLAA SALAH FADL SALEH",
    nationalId: "2030539841",
    bundles: [
      {
        bundleId: "0f4a71b3-fb1b-43c6-8196-45d602b506cf",
        serviceDate: "2026-02-11",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "D00291", name: "TRANSVAGINAL-ULTRASOUND",               reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "SARA YEHIA ALI TALEB",
    nationalId: "2292379555",
    bundles: [
      {
        bundleId: "ef618147-b97a-4073-af9c-40bfa75f04e5",
        serviceDate: "2026-02-18",
        rejections: [
          { code: "B01371", name: "SERUM AMYLASE",                         reason: "MN-1-1" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "B01382", name: "SERUM LIPASE",                          reason: "MN-1-1" },
        ],
        specialNote: "Pancreatic enzymes — attach clinical justification linking to diagnosis (pancreatitis workup?).",
      },
      {
        bundleId: "6e067c99-1029-4dda-8753-8020f7746c5d",
        serviceDate: "2026-02-18",
        rejections: [
          { code: "3001233192", name: "HUMIRA 40MG/0.4ML PREFILLED SYRINGE", reason: "BE-1-4" },
        ],
        specialNote: "Adalimumab (Humira) — biologic, must have specialist PA + diagnosis justification.",
        priority: "CRITICAL",
      },
    ],
  },
  {
    name: "ردينه محمود عمر أبو خطوة",
    nationalId: "2612816138",
    bundles: [
      {
        bundleId: "f34a324c-0ea5-4659-9c6c-ee6f56d5090f",
        serviceDate: "2026-02-16",
        rejections: [
          { code: "D00361", name: "ULTRASOUND-NECK",                       reason: "AD-1-4" },
        ],
        specialNote: "AD-1-4 — neck ultrasound diagnosis mismatch. Align ICD-10 with procedure.",
      },
    ],
  },
  {
    name: "ABOALGASIM ABDALLA MUBASHER MOHAMEDSALIH",
    nationalId: "2362651008",
    bundles: [
      {
        bundleId: "7642e4f9-b6c1-4436-9747-02dae0e156d3",
        serviceDate: "2026-02-11",
        rejections: [
          { code: "B00737", name: "GLYCOSELATED HEMOGLOBIN (HBA1C)",       reason: "MN-1-1" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "REEMA MASRI",
    nationalId: "2119714265",
    bundles: [
      {
        bundleId: "8d1d7c07-019c-4a5d-a423-6786db95aea9",
        serviceDate: "2026-02-17",
        rejections: [
          { code: "96092-ERR", name: "UNKNOWN SERVICE",                    reason: "BE-1-3" },
          { code: "B00737",    name: "GLYCOSELATED HEMOGLOBIN (HBA1C)",    reason: "CV-1-3" },
        ],
        priority: "BLOCKER",
        specialNote: "96092-ERR + CV-1-3 on HbA1c — dual problem: recode unknown + check diabetes coverage.",
      },
    ],
  },
  {
    name: "نور ابراهيم م نجيب م وهدان",
    nationalId: "A31787441",
    bundles: [
      {
        bundleId: "4b116926-f033-4346-abc6-d1adae2682e4",
        serviceDate: "2026-02-05",
        rejections: [
          { code: "0706222149", name: "ZETRON 200MG/5ML POWDER FOR SUSP",  reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "MAJED NADER SHAIKH WANI",
    nationalId: "2100009907",
    bundles: [
      {
        bundleId: "5bdb9161-db66-4095-b929-83f64d570ed2",
        serviceDate: "2026-02-01",
        rejections: [
          { code: "B01375", name: "SERUM CREATININE",                      reason: "BE-1-4" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "D00720", name: "BOTH KIDNEYS & BLADDER",                reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "JAWAD ALAA",
    nationalId: "2443605627",
    bundles: [
      {
        bundleId: "a82c571f-3571-4300-86f5-02e21ed3248d",
        serviceDate: "2026-02-23",
        rejections: [
          { code: "2612211509", name: "AXEPTA",                            reason: "BE-1-4" },
        ],
        specialNote: "Atomoxetine (ADHD medication) — attach psychiatry/neurology PA.",
      },
      {
        bundleId: "09adf6fb-692e-47f7-b565-aed7ffbea1e6",
        serviceDate: "2026-02-07",
        rejections: [
          { code: "2612211509", name: "AXEPTA",                            reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "MOHAMMED MAHMOUD ABDULAZIZ HUSSAIN",
    nationalId: "2120436510",
    bundles: [
      {
        bundleId: "1ea3fcbe-63ed-4d4f-8edd-71ca8dd62921",
        serviceDate: "2026-02-19",
        rejections: [
          { code: "D00084", name: "C.T-SKULL AND FACIAL BONES",            reason: "AD-1-4" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
        ],
        specialNote: "AD-1-4 on CT skull — align facial/cranial diagnosis ICD-10 with imaging procedure.",
      },
    ],
  },
  {
    name: "JEHAD ABDLJANE DABLA",
    nationalId: "2228511180",
    bundles: [
      {
        bundleId: "a7359801-af6e-45c8-be11-c2cec82c1c8f",
        serviceDate: "2026-02-14",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "B02507", name: "VIT. D3 (25 HYDROXYCHOLICALCIFEROL)",   reason: "BE-1-4" },
          { code: "B01508", name: "TRIGLYCERIDES",                         reason: "BE-1-4" },
          { code: "B01391", name: "SERUM URIC ACID",                       reason: "BE-1-4" },
          { code: "B01375", name: "SERUM CREATININE",                      reason: "BE-1-4" },
          { code: "B00975", name: "LOW DENSITY LIPOPROTEIN (LDL)",         reason: "BE-1-4" },
          { code: "B00737", name: "GLYCOSELATED HEMOGLOBIN (HBA1C)",       reason: "BE-1-4" },
          { code: "B00642", name: "FASTING BLOOD SUGAR (FBS)",             reason: "BE-1-4" },
          { code: "B00113", name: "ALANINE AMINOTRANSFERASE (ALT/SGPT)",   reason: "BE-1-4" },
        ],
        specialNote: "Full diabetic monitoring + metabolic panel (9 items). Attach DM management PA + physician notes.",
        priority: "HIGH",
      },
    ],
  },
  {
    name: "BAYAN ALI DAKHEEL ALDAKHEEL",
    nationalId: "1218562476",
    bundles: [
      {
        bundleId: "909bae41-f7b7-47db-86e0-5b456919c4de",
        serviceDate: "2026-02-22",
        rejections: [
          { code: "96092-ERR", name: "UNKNOWN SERVICE",                    reason: "BE-1-3" },
        ],
        priority: "BLOCKER",
      },
    ],
  },
  {
    name: "ABEER MOUSA",
    nationalId: "2064090885",
    bundles: [
      {
        bundleId: "1bb66871-17be-4105-b1f8-5b375b223c72",
        serviceDate: "2026-02-14",
        rejections: [
          { code: "B01563",    name: "VITAMIN B 12",                       reason: "AD-1-4" },
          { code: "2410234384",name: "PRIMA D3 50000 IU SOFTGEL CAPSULE",  reason: "BE-1-4" },
          { code: "B01508",    name: "TRIGLYCERIDES",                      reason: "BE-1-4" },
          { code: "B01391",    name: "SERUM URIC ACID",                    reason: "BE-1-4" },
          { code: "B00975",    name: "LOW DENSITY LIPOPROTEIN (LDL)",      reason: "BE-1-4" },
          { code: "B02507",    name: "VIT. D3 (25 HYDROXYCHOLICALCIFEROL)",reason: "BE-1-4" },
          { code: "B01466",    name: "THYROID STIMULATING HORMONE (TSH)",  reason: "BE-1-4" },
          { code: "B01375",    name: "SERUM CREATININE",                   reason: "BE-1-4" },
          { code: "B00473",    name: "COMPLETE URINE ANALYSIS",            reason: "BE-1-4" },
          { code: "B00115",    name: "ALBUMIN/CREATININ RATIO",            reason: "BE-1-4" },
          { code: "N00005",    name: "CONSULTATION FEE (CONSULTANT)",      reason: "BE-1-4" },
        ],
        specialNote: "11 items — large bundle. AD-1-4 on B12 (align diagnosis). Group all BE-1-4 labs into single PA request.",
        priority: "HIGH",
      },
    ],
  },
  {
    name: "MUNA JIHAD TALEB AGHA",
    nationalId: "2123910156",
    bundles: [
      {
        bundleId: "2f142963-5d44-493d-ba62-ec6647929304",
        serviceDate: "2026-02-20",
        rejections: [
          { code: "B01512", name: "TROPONIN I ADV.",                       reason: "MN-1-1" },
          { code: "N00004", name: "CONSULTATION FEE (RESIDENT DR)",        reason: "BE-1-4" },
          { code: "B00553", name: "D DIMERS/ FDPS",                        reason: "AD-1-4" },
        ],
        specialNote: "Cardiac markers (Troponin, D-Dimer) — MN-1-1 + AD-1-4. Attach chest pain / ACS clinical notes.",
      },
    ],
  },
  {
    name: "DOAA ABDALLA ELMETWALY DAWOUD",
    nationalId: "2541881914",
    bundles: [
      {
        bundleId: "1c462035-b899-44fe-910e-d56966bd7a77",
        serviceDate: "2026-02-13",
        rejections: [
          { code: "N00004", name: "CONSULTATION FEE (RESIDENT DR)",        reason: "CV-1-3" },
          { code: "142390", name: "PERIPHERAL I.V CANNULATION",            reason: "CV-1-3" },
          { code: "B00473", name: "COMPLETE URINE ANALYSIS",               reason: "CV-1-3" },
        ],
        specialNote: "All CV-1-3 — diagnosis not covered. Review and recode ICD-10 or prepare coverage exception.",
      },
    ],
  },
  {
    name: "NOORIA ALINAWAZ MOHAMMADNABI MOHAMMAD",
    nationalId: "2134333935",
    bundles: [
      {
        bundleId: "f6c8baeb-2e0e-4ec8-8949-b5df479c9ad6",
        serviceDate: "2026-02-19",
        rejections: [
          { code: "D00720", name: "BOTH KIDNEYS & BLADDER",                reason: "BE-1-4" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
        ],
      },
      {
        bundleId: "35a60d59-dd47-455c-bd59-432e1a366037",
        serviceDate: "2026-02-25",
        rejections: [
          { code: "B00403", name: "CBC WITHOUT DIFFERENTIAL COUNT",        reason: "BE-1-4" },
          { code: "142807", name: "I.M INJECTION FEE",                     reason: "BE-1-4" },
          { code: "142390", name: "PERIPHERAL I.V CANNULATION",            reason: "BE-1-4" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "B00495", name: "C-RP SENSITIVE",                        reason: "BE-1-4" },
          { code: "B00473", name: "COMPLETE URINE ANALYSIS",               reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "TAHSEENBANU SATTARPASHA MOMIN",
    nationalId: "2331857637",
    bundles: [
      {
        bundleId: "7b7752a4-a1c6-4e16-9af0-380acd3052c9",
        serviceDate: "2026-02-26",
        rejections: [
          { code: "2201233135", name: "BETASERC 24 MG TABLETS",            reason: "BE-1-4" },
          { code: "2902245009", name: "CARPAZIO 300 MG FILM COATED",       reason: "BE-1-4" },
          { code: "0409234102", name: "SEQUIT 25 MG FILM COATED TABLETS",  reason: "BE-1-4" },
          { code: "2307245639", name: "ROXONIN 60MG TABLET",               reason: "BE-1-4" },
          { code: "10-5825-23",  name: "EFEXOR XR 150 MG CAPSULES",        reason: "BE-1-4" },
        ],
        specialNote: "Polypharmacy: vestibular + psych + analgesic. Attach multi-specialty PA.",
        priority: "HIGH",
      },
      {
        bundleId: "a2eeecad-0b4e-4303-8a94-38394da369ed",
        serviceDate: "2026-02-26",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "YAMEN AHMED TAREK ELANANY",
    nationalId: "2541881922",
    bundles: [
      {
        bundleId: "719ff355-fd8e-43b8-9eb9-42ad95e99944",
        serviceDate: "2026-02-03",
        rejections: [
          { code: "1109234167", name: "DOMPY 0.1% ORAL SUSPENSION",        reason: "AD-3-7" },
        ],
        specialNote: "AD-3-7 — age-inappropriate medication. Attach pediatric dosing justification.",
      },
      {
        bundleId: "9dd94049-87d8-4bc7-b05e-2d3cabb695c5",
        serviceDate: "2026-02-03",
        rejections: [
          { code: "B00403", name: "CBC WITHOUT DIFFERENTIAL COUNT",        reason: "BE-1-4" },
          { code: "N00004", name: "CONSULTATION FEE (RESIDENT DR)",        reason: "CV-1-9" },
          { code: "D00076", name: "C.T-BRAIN",                             reason: "CV-1-3" },
        ],
        specialNote: "CV-1-9 on consultation (within 14-day follow-up), CV-1-3 on CT Brain.",
      },
      {
        bundleId: "3435243a-dec1-44fb-af98-b33b44dd63ff",
        serviceDate: "2026-02-03",
        rejections: [
          { code: "B01593", name: "VENOUS BLOOD GASES",                    reason: "CV-1-3" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "CV-1-9" },
        ],
      },
    ],
  },
  {
    name: "LAMYAA GAMAL",
    nationalId: "4434848810",
    bundles: [
      {
        bundleId: "c00cdc57-d882-4ebb-8d60-adc568dfea46",
        serviceDate: "2026-02-10",
        rejections: [
          { code: "96092-ERR", name: "UNKNOWN SERVICE",                    reason: "BE-1-3" },
          { code: "96092-ERR", name: "UNKNOWN SERVICE (2)",                reason: "BE-1-3" },
        ],
        priority: "BLOCKER",
        specialNote: "Two 96092-ERR entries — both service codes must be identified and corrected.",
      },
    ],
  },
  {
    name: "EHAB RASMI TALEB THAWQAN",
    nationalId: "2006371047",
    bundles: [
      {
        bundleId: "0e5fc25c-7852-4e85-970b-7e98ab13a75a",
        serviceDate: "2026-02-15",
        rejections: [
          { code: "2201233135", name: "BETASERC 24 MG TABLETS",            reason: "MN-1-1" },
        ],
        specialNote: "MN-1-1 on Betaserc — attach vestibular/dizziness CPG reference.",
      },
    ],
  },
  {
    name: "HANIN ABDELNASER ABDELKADER ABDELKADER",
    nationalId: "2456135140",
    bundles: [
      {
        bundleId: "da9bbe71-4e7e-4b3a-bee9-ead90b2a8b06",
        serviceDate: "2026-02-14",
        rejections: [
          { code: "D01224",    name: "ULTRASOUND-UTERUS & OVARIES SCAN",   reason: "MN-1-1" },
        ],
      },
      {
        bundleId: "1c6b358a-8d20-4393-921c-05a3d1f8246e",
        serviceDate: "2026-02-14",
        rejections: [
          { code: "36-186-89", name: "SCOPINAL TAB 10MG",                  reason: "AD-3-7" },
        ],
        specialNote: "AD-3-7 on Scopinal — age-inconsistent. Attach justification.",
      },
      {
        bundleId: "eb2f1c67-d348-4953-8ea6-5f98d6fbb4d0",
        serviceDate: "2026-02-12",
        rejections: [
          { code: "N00005",  name: "CONSULTATION FEE (CONSULTANT)",        reason: "BE-1-4" },
          { code: "176041",  name: "NITROUS OXIDE",                        reason: "BE-1-4" },
          { code: "D00055",  name: "CHEST (ONE VIEW)",                     reason: "BE-1-4" },
        ],
      },
      {
        bundleId: "cc472ec4-a0ff-42bf-9776-449f4849150f",
        serviceDate: "2026-02-12",
        rejections: [
          { code: "B00473", name: "COMPLETE URINE ANALYSIS",               reason: "MN-1-1" },
          { code: "N00006", name: "CONSULTATION FEE (SPECIALIST)",         reason: "CV-1-9" },
        ],
        specialNote: "CV-1-9 — within 14-day follow-up. Justify repeat consultation.",
      },
    ],
  },
  {
    name: "HAYAT DARWISH A",
    nationalId: "2022893586",
    bundles: [
      {
        bundleId: "8ec03133-93b7-4241-872a-21bdce650dfb",
        serviceDate: "2026-02-08",
        rejections: [
          { code: "N00006",    name: "CONSULTATION FEE (SPECIALIST)",      reason: "BE-1-4" },
          { code: "B01563",    name: "VITAMIN B 12",                       reason: "BE-1-4" },
          { code: "B02507",    name: "VIT. D3 (25 HYDROXYCHOLICALCIFEROL)",reason: "BE-1-4" },
        ],
      },
      {
        bundleId: "480e919e-7743-4107-845e-9db81b192b7a",
        serviceDate: "2026-02-23",
        rejections: [
          { code: "0701210396", name: "ENTRESTO",                           reason: "BE-1-4" },
          { code: "2805257482", name: "EMPAMAC MET",                        reason: "BE-1-4" },
          { code: "1411211318", name: "TOVAST 20 MG F-C TABLETS",           reason: "BE-1-4" },
          { code: "0912211443", name: "SELECTA 5MG F.C. TABLETS",           reason: "BE-1-4" },
        ],
        specialNote: "Cardiac + diabetes combo: Entresto (sacubitril/valsartan), Empagliflozin+Metformin, Rosuvastatin, Amlodipine. Attach cardiology PA.",
        priority: "CRITICAL",
      },
      {
        bundleId: "572c08a8-74a2-4a60-9973-d4a0726fe6f0",
        serviceDate: "2026-02-08",
        rejections: [
          { code: "0108222392", name: "ISOBIDE",                            reason: "BE-1-4" },
          { code: "0512222980", name: "TRULICITY 1.5 MG PREFILLED PEN",    reason: "BE-1-4" },
        ],
        specialNote: "Dulaglutide (GLP-1 agonist) + Isosorbide. Attach endocrinology/cardiology PA.",
        priority: "HIGH",
      },
    ],
  },
  {
    name: "AHMED GAMAL SALEM ELBASTAWESY",
    nationalId: "2444846279",
    bundles: [
      {
        bundleId: "ea0de768-9190-4b9c-9866-b0fc9af50975",
        serviceDate: "2026-02-23",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "B01508", name: "TRIGLYCERIDES",                         reason: "BE-1-4" },
          { code: "B01391", name: "SERUM URIC ACID",                       reason: "BE-1-4" },
          { code: "B00975", name: "LOW DENSITY LIPOPROTEIN (LDL)",         reason: "BE-1-4" },
          { code: "B00403", name: "CBC WITHOUT DIFFERENTIAL COUNT",        reason: "BE-1-4" },
          { code: "B01527", name: "UREA BREATH TEST",                      reason: "BE-1-4" },
          { code: "B00244", name: "ASPARTATE AMINOTRANSFERASE (AST/SGOT)", reason: "BE-1-4" },
          { code: "B00113", name: "ALANINE AMINOTRANSFERASE (ALT/SGPT)",   reason: "BE-1-4" },
        ],
        specialNote: "GI + metabolic panel including urea breath test (H. pylori). Attach GI specialist PA.",
        priority: "HIGH",
      },
    ],
  },
  {
    name: "ALAA ALBESHTI",
    nationalId: "2193516081",
    bundles: [
      {
        bundleId: "39e0428f-bd1e-49a4-ade1-b75feab82f0d",
        serviceDate: "2026-02-04",
        rejections: [
          { code: "N00006",    name: "CONSULTATION FEE (SPECIALIST)",      reason: "BE-1-4" },
          { code: "D00096",    name: "C.T-PARA NASAL SINUSES-PNS",         reason: "CV-1-3" },
          { code: "2008245785",name: "MENTEX SYRUP",                       reason: "BE-1-4" },
          { code: "1510246046",name: "CORTRIEF NASAL SPRAY",               reason: "BE-1-4" },
          { code: "2610200242",name: "LORINASE-D",                         reason: "BE-1-4" },
        ],
        specialNote: "ENT workup — CV-1-3 on PNS CT. Check if sinusitis/rhinitis is covered diagnosis.",
      },
    ],
  },
  {
    name: "MOHAMMED HATM MOHAMMEDSAEED JUMAH",
    nationalId: "2158888228",
    bundles: [
      {
        bundleId: "6a716e93-40dd-4cfd-b71d-e28277f1af1b",
        serviceDate: "2026-02-23",
        rejections: [
          { code: "96092-ERR",  name: "UNKNOWN SERVICE",                   reason: "BE-1-3" },
          { code: "1707245587", name: "RELAXON FORTE 500MG TAB",           reason: "BE-1-4" },
          { code: "1901233125", name: "ROXONIN TAPE 100MG CUTANEOUS PATCH",reason: "BE-1-4" },
          { code: "142588",     name: "INTRA LESIONAL INJECTION",          reason: "BE-1-4" },
          { code: "N00005",     name: "CONSULTATION FEE (CONSULTANT)",     reason: "BE-1-4" },
        ],
        priority: "BLOCKER",
        specialNote: "96092-ERR + orthopedic bundle. Recode first then submit with musculoskeletal PA.",
      },
      {
        bundleId: "0b51a6fc-3758-420c-be69-5cdadcf2b811",
        serviceDate: "2026-02-25",
        rejections: [
          { code: "B01391", name: "SERUM URIC ACID",                       reason: "CV-1-3" },
        ],
        specialNote: "CV-1-3 on uric acid — verify gout/hyperuricemia coverage.",
      },
    ],
  },
  {
    name: "AMER SAYEED MOHAMMED ABDUL SAYEED",
    nationalId: "2281756102",
    bundles: [
      {
        bundleId: "8fa977df-6d7e-4991-9b3b-adfcf586a44d",
        serviceDate: "2026-02-25",
        rejections: [
          { code: "N00004", name: "CONSULTATION FEE (RESIDENT DR)",        reason: "BE-1-4" },
          { code: "B01375", name: "SERUM CREATININE",                      reason: "CV-1-3" },
          { code: "142808", name: "GLUCOMETER TEST ONE TOUCH",             reason: "CV-1-3" },
          { code: "B01512", name: "TROPONIN I ADV.",                       reason: "CV-1-3" },
          { code: "142390", name: "PERIPHERAL I.V CANNULATION",            reason: "BE-1-4" },
          { code: "141925", name: "ECG",                                   reason: "BE-1-4" },
        ],
        specialNote: "CV-1-3 on cardiac + renal markers — diagnosis not covered. Emergency presentation? Attach ER notes.",
      },
    ],
  },
  {
    name: "OMAR MOHAMMED OMAIR ALSADUN",
    nationalId: "1135623740",
    bundles: [
      {
        bundleId: "c2ed10c7-3779-4718-85e3-a59e1e546324",
        serviceDate: "2026-02-17",
        rejections: [
          { code: "N00024", name: "DENTAL CONSULTATION BY SPECIALIST",     reason: "SE-1-6" },
          { code: "142761", name: "SCALING & POLISHING",                   reason: "SE-1-6" },
          { code: "142916", name: "PANORAMA X-RAY (ONE FILM)",             reason: "SE-1-6" },
        ],
        specialNote: "SE-1-6 dental — attach panoramic X-ray file and clinical dental examination notes.",
      },
    ],
  },
  {
    name: "MUNIF MOHAMMAD SALEM ALRESHIDI",
    nationalId: "1117049815",
    bundles: [
      {
        bundleId: "1e4869af-c241-402a-b148-b4a19c96276e",
        serviceDate: "2026-02-09",
        rejections: [
          { code: "2609222649", name: "MIRTAZA 15 MG FILM-COATED TABLET",  reason: "BE-1-4" },
        ],
        specialNote: "Mirtazapine (antidepressant) — attach psychiatry PA.",
      },
    ],
  },
  {
    name: "OMAR AHMED ABDELSAMIE ATALLAH",
    nationalId: "2516448889",
    bundles: [
      {
        bundleId: "3cf11564-40c4-40fc-84f7-49c4301356d0",
        serviceDate: "2026-02-14",
        rejections: [
          { code: "96092-ERR", name: "UNKNOWN SERVICE",                    reason: "BE-1-3" },
        ],
        priority: "BLOCKER",
      },
    ],
  },
  {
    name: "RANIA MOHAMED ABDELMOETI ELSHENNAWI",
    nationalId: "2598700421",
    bundles: [
      {
        bundleId: "b8be89eb-0681-4cd6-bd82-f6fd352bc054",
        serviceDate: "2026-02-14",
        rejections: [
          { code: "170019", name: "SUCTION CLEARANCE",                     reason: "AD-2-4" },
        ],
        specialNote: "AD-2-4 — duplicate same-day code. Attach justification for repeat suction clearance.",
      },
      {
        bundleId: "7f6bc67f-22a4-4e30-975c-b1c32a7d5c8a",
        serviceDate: "2026-02-14",
        rejections: [
          { code: "1603221850", name: "RYALTRIS",                          reason: "MN-1-1" },
        ],
        specialNote: "Ryaltris nasal spray — attach ENT clinical justification.",
      },
    ],
  },
  {
    name: "ASMA ABDULKARIM H ALSADOON",
    nationalId: "1042574093",
    bundles: [
      {
        bundleId: "de7fd886-e6b2-427c-bea0-d20a51d5944c",
        serviceDate: "2026-02-14",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "KHALID MADHI ALSUBAIE",
    nationalId: "1132655927",
    bundles: [
      {
        bundleId: "4f8ce1c5-3b33-40d1-b4f7-f819c2e062af",
        serviceDate: "2026-02-23",
        rejections: [
          { code: "N00006", name: "CONSULTATION FEE (SPECIALIST)",         reason: "MN-1-1" },
        ],
      },
      {
        bundleId: "4f446eec-8339-4f20-abea-537600a0a270",
        serviceDate: "2026-02-09",
        rejections: [
          { code: "D00123", name: "ANKLE/FOOT (TWO VIEWS)",                reason: "CV-1-3" },
        ],
        specialNote: "CV-1-3 on ankle X-ray — orthopedic diagnosis coverage issue.",
      },
    ],
  },
  {
    name: "UMAR HASAN MOHAMMAD",
    nationalId: "2216961611",
    bundles: [
      {
        bundleId: "459efc79-5f24-46c0-b035-68d7355cc783",
        serviceDate: "2026-02-05",
        rejections: [
          { code: "142584", name: "ELECTROCAUTERY/1-3 LESIONS",            reason: "MN-1-1" },
        ],
        specialNote: "Electrocautery — attach dermatology CPG and lesion description.",
      },
    ],
  },
  {
    name: "MAHMOUD AHMED ABOUZEID HEGAZI",
    nationalId: "2387898816",
    bundles: [
      {
        bundleId: "7d8df785-95b8-4b36-b0c7-ec50f9aa7b25",
        serviceDate: "2026-02-12",
        rejections: [
          { code: "0512211424", name: "TABOCINE 100",                      reason: "MN-1-1" },
        ],
        specialNote: "Tabocine (COPD medication) — attach pulmonology CPG reference.",
      },
    ],
  },
  {
    name: "HATTAN KHALID OTHMAN HASSAN",
    nationalId: "2583501974",
    bundles: [
      {
        bundleId: "f466108c-d010-45ce-912e-38d011efc63e",
        serviceDate: "2026-02-17",
        rejections: [
          { code: "N00004", name: "CONSULTATION FEE (RESIDENT DR)",        reason: "BE-1-4" },
          { code: "B00403", name: "CBC WITHOUT DIFFERENTIAL COUNT",        reason: "BE-1-4" },
          { code: "D00055", name: "CHEST (ONE VIEW)",                      reason: "BE-1-4" },
          { code: "B01593", name: "VENOUS BLOOD GASES",                    reason: "BE-1-4" },
          { code: "142390", name: "PERIPHERAL I.V CANNULATION",            reason: "BE-1-4" },
          { code: "142237", name: "NEBULIZER (STEAM INHALATION)/SESSION",  reason: "BE-1-4" },
        ],
        specialNote: "Respiratory workup — all BE-1-4. Likely ER/urgent presentation. Attach emergency justification.",
        priority: "HIGH",
      },
    ],
  },
  {
    name: "LAYAN MAHMOUD MOHAMED ABDELLATIF",
    nationalId: "2566302853",
    bundles: [
      {
        bundleId: "8067bafe-0655-4466-97f3-2bee427bcd1c",
        serviceDate: "2026-02-26",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
          { code: "B01466", name: "THYROID STIMULATING HORMONE (TSH)",     reason: "CV-1-3" },
          { code: "B01258", name: "RANDOM BLOOD SUGAR (RBS)",              reason: "CV-1-3" },
          { code: "B00403", name: "CBC WITHOUT DIFFERENTIAL COUNT",        reason: "CV-1-3" },
        ],
        specialNote: "CV-1-3 on TSH + blood sugar + CBC — check if metabolic workup is covered.",
      },
      {
        bundleId: "463bc3d2-9bf3-4380-87a6-f859c0d75e2c",
        serviceDate: "2026-02-09",
        rejections: [
          { code: "D00096", name: "C.T-PARA NASAL SINUSES-PNS",            reason: "MN-1-1" },
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "BE-1-4" },
        ],
      },
    ],
  },
  {
    name: "EMAN TAHA GAMALELDIN ELSAYED",
    nationalId: "2616191736",
    bundles: [
      {
        bundleId: "e7233743-28d9-4382-ab84-332fdf9d4204",
        serviceDate: "2026-02-23",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "CV-1-3" },
        ],
        specialNote: "CV-1-3 on consultation alone — verify the diagnosis submitted.",
      },
    ],
  },
  {
    name: "NAHHAL TARIQ IMARAH",
    nationalId: "2122120492",
    bundles: [
      {
        bundleId: "aaf00592-e859-4ccb-b3dd-569f9fd59173",
        serviceDate: "2026-02-22",
        rejections: [
          { code: "N00006", name: "CONSULTATION FEE (SPECIALIST)",         reason: "MN-1-1" },
        ],
      },
    ],
  },
  {
    name: "MOHAMED ABDELMONEM ABDELHADY IBRAHIM",
    nationalId: "2265582367",
    bundles: [
      {
        bundleId: "ca25fc52-b974-487b-a6f0-addb36cc4fb6",
        serviceDate: "2026-02-01",
        rejections: [
          { code: "141925", name: "ECG",                                   reason: "MN-1-1" },
        ],
        specialNote: "MN-1-1 on ECG — attach cardiac clinical indication.",
      },
    ],
  },
  {
    name: "YASEEN ABDULNASSER ABDULQADER ABDULQADER",
    nationalId: "2538571742",
    bundles: [
      {
        bundleId: "0309bf45-12b2-4d0d-b717-8293b0069094",
        serviceDate: "2026-02-18",
        rejections: [
          { code: "N00005", name: "CONSULTATION FEE (CONSULTANT)",         reason: "CV-1-3" },
        ],
        specialNote: "CV-1-3 on consultation — check if diagnosis is a covered condition.",
      },
    ],
  },
  {
    name: "MOHAMED ABDELHAMID IBRAHIM ELMARADNY",
    nationalId: "2557695737",
    bundles: [
      {
        bundleId: "320ab145-2a9c-4954-ae8e-ae48cdf79fe3",
        serviceDate: "2026-02-22",
        rejections: [
          { code: "96092-ERR", name: "UNKNOWN SERVICE",                    reason: "BE-1-3" },
        ],
        priority: "BLOCKER",
      },
    ],
  },
];

// ─── Build normalized submissions[] ──────────────────────────────────────────
function buildSubmissions(patients) {
  const submissions = [];
  let seq = 1;

  for (const pt of patients) {
    for (const bundle of pt.bundles) {
      const codes = [...new Set(bundle.rejections.map(r => r.reason))];
      const allAttachments = [];
      const seenTypes = new Set();

      for (const code of codes) {
        const reqs = ATTACHMENT_MATRIX[code] || [];
        for (const att of reqs) {
          if (!seenTypes.has(att.type)) {
            seenTypes.add(att.type);
            allAttachments.push({ ...att, rejectionCode: code });
          }
        }
      }

      const isPriority = bundle.priority === "CRITICAL" || bundle.priority === "HIGH";
      const isBlocker  = bundle.priority === "BLOCKER";

      submissions.push({
        seq: seq++,
        batchId:      BATCH_ID,
        payer:        PAYER,
        provider:     PROVIDER,
        period:       PERIOD,
        appealDeadline: DEADLINE,

        // Patient
        patientName:  pt.name,
        nationalId:   pt.nationalId,

        // Bundle
        bundleId:     bundle.bundleId,
        serviceDate:  bundle.serviceDate,

        // Rejection detail
        rejections:   bundle.rejections,
        rejectionCodes: codes,
        specialNote:  bundle.specialNote || null,
        priority:     bundle.priority || "NORMAL",

        // Submission gate
        requiresRecode:    isBlocker,
        isPriorityAppeal:  isPriority,

        // Required attachments (explicit objects — fixes audit blocker #2)
        attachments:   allAttachments,
        attachmentCount: allAttachments.length,
        requiredCount: allAttachments.filter(a => a.required).length,

        // Oracle scanner fields
        oracleFound:    null,   // to be filled by oracle-scanner.mjs
        nphiesReady:    false,
        gateStatus:     isBlocker ? "BLOCKER" : "PENDING",
        oracleSearchHint: { nationalId: pt.nationalId, name: pt.name, serviceDate: bundle.serviceDate },
        oracleUrl:      ORACLE_URL,
      });
    }
  }
  return submissions;
}

const submissions = buildSubmissions(PATIENTS);

// ─── Summary stats ────────────────────────────────────────────────────────────
const stats = {
  generatedAt:    new Date().toISOString(),
  batchId:        BATCH_ID,
  appealDeadline: DEADLINE,
  totalSubmissions: submissions.length,
  byPriority: {
    CRITICAL: submissions.filter(s => s.priority === "CRITICAL").length,
    HIGH:     submissions.filter(s => s.priority === "HIGH").length,
    BLOCKER:  submissions.filter(s => s.priority === "BLOCKER").length,
    NORMAL:   submissions.filter(s => s.priority === "NORMAL").length,
  },
  byRejectionCode: {},
  blockerBundleIds: submissions.filter(s => s.requiresRecode).map(s => s.bundleId),
};

for (const s of submissions) {
  for (const code of s.rejectionCodes) {
    stats.byRejectionCode[code] = (stats.byRejectionCode[code] || 0) + 1;
  }
}

const output = { meta: stats, submissions };

const args     = process.argv.slice(2);
const outIdx   = args.indexOf("--output");
const outFile  = outIdx >= 0 ? args[outIdx + 1] : "nphies_normalized_bat4295.json";

writeFileSync(outFile, JSON.stringify(output, null, 2));

console.log(`\n✅  BAT-2026-NB-00004295-OT normalized payload written → ${outFile}`);
console.log(`\n📊  Summary:`);
console.log(`    Total submissions : ${stats.totalSubmissions}`);
console.log(`    CRITICAL          : ${stats.byPriority.CRITICAL}`);
console.log(`    HIGH              : ${stats.byPriority.HIGH}`);
console.log(`    BLOCKER (recode)  : ${stats.byPriority.BLOCKER}`);
console.log(`    NORMAL            : ${stats.byPriority.NORMAL}`);
console.log(`\n🚫  BLOCKER bundles requiring recode before any resubmission:`);
for (const id of stats.blockerBundleIds) console.log(`    ${id}`);
console.log(`\n⚠️  Appeal deadline: ${DEADLINE} (15 days from settlement 2026-03-22)\n`);
