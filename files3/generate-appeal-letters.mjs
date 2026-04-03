/**
 * COMPLIANCELINC — BrainSAIT
 * Generate bilingual (Arabic/English) NPHIES appeal letters for BAT-2026-NB-00004295-OT.
 * Groups rejections by patient+bundle and produces per-code template letter.
 *
 * Usage:
 *   node generate-appeal-letters.mjs --payload nphies_normalized_bat4295.json --output-dir ./appeal-letters
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const PAYER_ADDRESS = `Al Rajhi Co. for Cooperative Insurance
Medical Claims Center
P.O Box 67791, Riyadh 11517, KSA
Phone: +966 1 2399904 | Fax: +966 1 2339815`;

const PROVIDER = "Hayat National Hospital - Riyadh";
const BATCH_ID = "BAT-2026-NB-00004295-OT";
const TODAY    = new Date().toLocaleDateString("en-SA", { year:"numeric", month:"long", day:"numeric" });
const TODAY_AR = new Date().toLocaleDateString("ar-SA", { year:"numeric", month:"long", day:"numeric" });

// ─── Letter templates per rejection code ─────────────────────────────────────

function letterBE14(patient, bundle) {
  const services = bundle.rejections.filter(r => r.reason === "BE-1-4")
    .map(r => `• ${r.code} — ${r.name}`).join("\n");
  const servicesAR = bundle.rejections.filter(r => r.reason === "BE-1-4")
    .map(r => `• ${r.code} — ${r.name}`).join("\n");

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMAL CLAIM APPEAL — PREAUTHORIZATION (BE-1-4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date: ${TODAY}
To: ${PAYER_ADDRESS}
From: ${PROVIDER}

RE: Batch ${BATCH_ID} | Bundle ID: ${bundle.bundleId}
Patient: ${patient.name} | National ID: ${patient.nationalId}
Service Date: ${bundle.serviceDate}
Rejection Code: BE-1-4 — Preauthorization required and was not obtained

Dear Claims Department,

We respectfully appeal the rejection of the following services under rejection code BE-1-4:

${services}

GROUNDS FOR APPEAL:

1. CLINICAL URGENCY: The treating physician determined that the above services were
   medically necessary and clinically urgent at the time of service. Delaying care to
   obtain prior authorization would have compromised patient safety and outcomes.

2. CLINICAL JUSTIFICATION: The services are directly indicated by the patient's
   confirmed diagnosis and are consistent with the applicable Saudi clinical practice
   guidelines. Supporting clinical documentation is attached herewith.

3. RETROACTIVE AUTHORIZATION REQUEST: We respectfully request retroactive prior
   authorization for the listed services, supported by the attached clinical evidence,
   physician notes, and treatment records.

ATTACHED DOCUMENTS:
   □ Physician clinical notes with diagnosis
   □ Medical report / referral letter
   □ Original hospital invoice
   □ Prior authorization request form (retroactive)
   ${bundle.specialNote ? `□ ${bundle.specialNote}` : ""}

We request that this appeal be reviewed within the 15-day NPHIES communication window.

Sincerely,
Medical Claims Department
${PROVIDER}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
اعتراض رسمي على المطالبة — الموافقة المسبقة (BE-1-4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

التاريخ: ${TODAY_AR}
إلى: شركة الراجحي للتأمين التعاوني — مركز المطالبات الطبية
من: ${PROVIDER}

الموضوع: الدُفعة ${BATCH_ID} | رقم الحزمة: ${bundle.bundleId}
المريض/ة: ${patient.name} | الهوية الوطنية: ${patient.nationalId}
تاريخ الخدمة: ${bundle.serviceDate}
رمز الرفض: BE-1-4 — الموافقة المسبقة مطلوبة ولم يتم الحصول عليها

السادة الكرام،

نتقدم بهذا الاعتراض الرسمي على رفض الخدمات التالية:

${servicesAR}

أسباب الاعتراض:

1. الحالة الإسعافية والإلحاح الطبي: قدّر الطبيب المعالج أن الخدمات أعلاه ضرورية طبياً
   وعاجلة في وقت تقديمها، وكان تأجيل العلاج لانتظار الموافقة المسبقة سيُعرّض سلامة
   المريض للخطر.

2. المبرر السريري: الخدمات مطابقة للتشخيص المؤكد للمريض ومتوافقة مع الإرشادات الإكلينيكية
   السعودية المعتمدة. الوثائق الداعمة مرفقة.

3. طلب ترخيص بأثر رجعي: نطلب الموافقة المسبقة بصورة رجعية مع تقديم الأدلة السريرية
   وملاحظات الطبيب وسجلات العلاج.

المستندات المرفقة:
   □ ملاحظات الطبيب السريرية مع التشخيص
   □ التقرير الطبي / خطاب الإحالة
   □ الفاتورة الأصلية
   □ نموذج طلب الموافقة المسبقة (بأثر رجعي)
   ${bundle.specialNote ? `□ ${bundle.specialNote}` : ""}

نأمل مراجعة هذا الاعتراض خلال المهلة القانونية البالغة 15 يوماً عبر خيار التواصل في نظام نفيس.

مع التقدير،
قسم المطالبات الطبية — ${PROVIDER}
`;
}

function letterMN11(patient, bundle) {
  const services = bundle.rejections.filter(r => r.reason === "MN-1-1")
    .map(r => `• ${r.code} — ${r.name}`).join("\n");
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMAL CLAIM APPEAL — MEDICAL NECESSITY (MN-1-1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date: ${TODAY}
Batch: ${BATCH_ID} | Bundle: ${bundle.bundleId}
Patient: ${patient.name} | National ID: ${patient.nationalId}
Service Date: ${bundle.serviceDate}
Rejection Code: MN-1-1 — Service not clinically justified based on clinical practice guideline

Dear Claims Department,

We appeal the following services rejected under MN-1-1:

${services}

CLINICAL JUSTIFICATION:

The above services were ordered and performed in full compliance with evidence-based
clinical practice guidelines (CPG) applicable to the patient's documented diagnosis.
Specifically:

• The patient's confirmed diagnosis necessitates the listed investigations/procedures
  as per the relevant Saudi CPG / SCFHS clinical guideline (reference attached).
• The treating physician documented the clinical rationale in the patient's medical
  record at the time of ordering.
• The services are NOT routine screening — they are directly diagnostic or therapeutic
  for the patient's active condition.

ATTACHED DOCUMENTS:
   □ Saudi CPG / SCFHS guideline reference (with highlighted applicable section)
   □ Physician clinical notes with active diagnosis
   □ Supporting lab / investigation results
   □ Original hospital invoice
   ${bundle.specialNote ? `□ ${bundle.specialNote}` : ""}

We respectfully request reversal of the MN-1-1 rejection upon review of the attached
clinical evidence.

Sincerely,
Medical Claims Department — ${PROVIDER}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
اعتراض رسمي — الضرورة الطبية (MN-1-1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

تاريخ: ${TODAY_AR} | الدُفعة: ${BATCH_ID} | الحزمة: ${bundle.bundleId}
المريض/ة: ${patient.name} | الهوية: ${patient.nationalId}
تاريخ الخدمة: ${bundle.serviceDate}

نعترض على رفض الخدمات أعلاه بموجب رمز MN-1-1. الخدمات المذكورة طُلبت ونُفِّذت وفقاً
للإرشادات الإكلينيكية المعتمدة (CPG) المرتبطة بتشخيص المريض الموثق. الطبيب المعالج وثّق
المبرر السريري في الملف الطبي للمريض عند طلب الخدمة.

المستندات المرفقة: دليل CPG السعودي، ملاحظات الطبيب، نتائج الفحوصات، الفاتورة الأصلية.

مع التقدير، قسم المطالبات الطبية — ${PROVIDER}
`;
}

function letterCV13(patient, bundle) {
  const services = bundle.rejections.filter(r => r.reason === "CV-1-3")
    .map(r => `• ${r.code} — ${r.name}`).join("\n");
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMAL CLAIM APPEAL — DIAGNOSIS NOT COVERED (CV-1-3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date: ${TODAY}
Batch: ${BATCH_ID} | Bundle: ${bundle.bundleId}
Patient: ${patient.name} | National ID: ${patient.nationalId}
Service Date: ${bundle.serviceDate}
Rejection Code: CV-1-3 — Diagnosis is not covered

Dear Claims Department,

We appeal the rejection of the following services under CV-1-3:

${services}

GROUNDS FOR APPEAL:

Option A — COVERED DIAGNOSIS:
   The patient's diagnosis IS covered under the current policy schedule.
   We have attached the policy benefits schedule with the relevant coverage
   section highlighted, along with the ICD-10 code documentation.

Option B — DIAGNOSIS RECODE:
   We acknowledge a possible ICD-10 coding discrepancy. We are resubmitting
   with the corrected diagnosis code that accurately reflects the patient's
   condition and falls within covered benefits.
   CORRECTED ICD-10: [To be filled by clinical coding team]

Option C — MEDICAL EXCEPTION:
   If the diagnosis falls outside standard coverage, we request a medical
   exception based on clinical necessity. Supporting documentation attached.

ATTACHED DOCUMENTS:
   □ Policy schedule / benefits booklet (relevant section highlighted)
   □ Clinical notes with ICD-10 diagnosis code
   □ Medical necessity statement
   □ Original hospital invoice
   ${bundle.specialNote ? `□ Note: ${bundle.specialNote}` : ""}

Sincerely, Medical Claims Department — ${PROVIDER}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
اعتراض رسمي — التشخيص غير مشمول (CV-1-3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

تاريخ: ${TODAY_AR} | الدُفعة: ${BATCH_ID} | الحزمة: ${bundle.bundleId}
المريض/ة: ${patient.name} | الهوية: ${patient.nationalId}

نعترض على رفض الخدمات أعلاه. التشخيص المقدم مشمول بالوثيقة التأمينية، أو أننا نُعيد
التقديم بكود ICD-10 المصحح الذي يعكس الحالة الفعلية للمريض بدقة. الوثائق الداعمة مرفقة.

مع التقدير، قسم المطالبات الطبية — ${PROVIDER}
`;
}

function letterBE13(patient, bundle) {
  const services = bundle.rejections.filter(r => r.reason === "BE-1-3")
    .map(r => `• ${r.code} — ${r.name}`).join("\n");
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  BLOCKER — RECODE REQUIRED BEFORE SUBMISSION
SERVICE CODE CORRECTION — 96092-ERR (BE-1-3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date: ${TODAY}
Batch: ${BATCH_ID} | Bundle: ${bundle.bundleId}
Patient: ${patient.name} | National ID: ${patient.nationalId}
Service Date: ${bundle.serviceDate}
Rejection Code: BE-1-3 — Submission not compliant with contractual agreement

SERVICES REQUIRING CORRECTION:
${services}

⚠️  ACTION REQUIRED — INTERNAL USE:
    Code 96092-ERR = UNKNOWN SERVICE in NPHIES.
    This CANNOT be resubmitted as-is.

STEPS TO RESOLVE:
1. Retrieve original invoice from Oracle portal for this patient/date.
2. Identify the actual service performed (review nursing notes + physician orders).
3. Map to the correct NPHIES service code from the contract schedule.
4. Verify the correct code is in the Al Rajhi Takaful contracted service list.
5. Update the claim in NPHIES with corrected service code.
6. Then generate appeal letter with correct code.

CORRECTED SERVICE CODE: [To be filled after Oracle retrieval]
CORRECTED SERVICE NAME: [To be filled after Oracle retrieval]

Once recoded, appeal under BE-1-3 with:
   □ Provider-payer contract service schedule
   □ Corrected service code mapping document
   □ Original invoice and clinical notes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
إجراء مطلوب — تصحيح الكود (BE-1-3 / 96092-ERR)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

الكود 96092-ERR يعني "خدمة غير معروفة" في نظام نفيس — لا يمكن إعادة التقديم به.
يجب استرجاع الفاتورة الأصلية من البوابة، تحديد الخدمة الفعلية، وتعيين كود نفيس صحيح
من جدول الخدمات المتعاقد عليها مع الراجحي. ثم يُعاد التقديم مع المستندات الداعمة.

ملاحظة داخلية: ${bundle.specialNote || "مراجعة الفاتورة الأصلية مطلوبة"}
`;
}

function letterSE16(patient, bundle) {
  const services = bundle.rejections.filter(r => r.reason === "SE-1-6")
    .map(r => `• ${r.code} — ${r.name}`).join("\n");
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMAL CLAIM APPEAL — MISSING INVESTIGATION (SE-1-6)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date: ${TODAY}
Batch: ${BATCH_ID} | Bundle: ${bundle.bundleId}
Patient: ${patient.name} | National ID: ${patient.nationalId}
Service Date: ${bundle.serviceDate}
Rejection Code: SE-1-6 — Investigation result is inadequate or missing

Rejected Services:
${services}

Dear Claims Department,

We appeal the SE-1-6 rejection. The investigation results were available at the time
of service and are now formally attached to this appeal.

ATTACHED DOCUMENTS:
   □ Investigation result / lab report (signed and stamped)
   □ Radiology / imaging file — DICOM or high-resolution JPEG
   □ Dental X-ray (panoramic) — embedded as attachment per NPHIES dental guidelines
   □ Clinical examination notes
   □ Original hospital invoice

We confirm that all results were reviewed by the treating specialist and are integral
to the clinical management decision.

Sincerely, Medical Claims Department — ${PROVIDER}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
اعتراض رسمي — نتائج الفحص مفقودة أو غير كافية (SE-1-6)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

نعترض على هذا الرفض ونؤكد أن نتائج الفحوصات كانت متاحة وقت تقديم الخدمة.
نرفق مع هذا الاعتراض: نتيجة الفحص الموقعة والمختومة، صور الأشعة (DICOM/JPEG)،
وملاحظات الفحص السريري.

${bundle.specialNote || ""}
`;
}

function letterAD14(patient, bundle) {
  const services = bundle.rejections.filter(r => r.reason === "AD-1-4")
    .map(r => `• ${r.code} — ${r.name}`).join("\n");
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMAL CLAIM APPEAL — DIAGNOSIS INCONSISTENCY (AD-1-4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date: ${TODAY}
Batch: ${BATCH_ID} | Bundle: ${bundle.bundleId}
Patient: ${patient.name} | National ID: ${patient.nationalId}
Service Date: ${bundle.serviceDate}
Rejection Code: AD-1-4 — Diagnosis is inconsistent with service/procedure

Rejected Services:
${services}

Dear Claims Department,

We appeal the AD-1-4 rejection. The diagnosis submitted is directly consistent with
the procedure/service performed. The clinical linkage is as follows:

DIAGNOSIS-TO-PROCEDURE LINKAGE:
   ICD-10 Code Submitted: [To be confirmed from Oracle records]
   Service Performed: As listed above
   Clinical Rationale: The treating physician ordered the listed service/procedure
   based on the active diagnosis. The ICD-10 code accurately describes the primary
   condition requiring this investigation or treatment.

If a coding discrepancy exists, we are resubmitting with the corrected ICD-10 code
that precisely maps to the performed service (see attached recode documentation).

ATTACHED DOCUMENTS:
   □ Diagnosis-to-procedure linkage report
   □ Clinical notes with diagnosis context
   □ Corrected ICD-10 mapping (if applicable)
   □ Original hospital invoice

${bundle.specialNote || ""}

Sincerely, Medical Claims Department — ${PROVIDER}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
اعتراض رسمي — عدم توافق التشخيص مع الخدمة (AD-1-4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

التشخيص المقدم متوافق مباشرة مع الخدمة المقدمة. نرفق ربط التشخيص بالإجراء، وملاحظات
الطبيب، وكود ICD-10 المصحح إن اقتضى الأمر.
`;
}

// ─── Main generator ───────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const payloadIdx = args.indexOf("--payload");
const outDirIdx  = args.indexOf("--output-dir");

const payloadFile = payloadIdx >= 0 ? args[payloadIdx + 1] : "nphies_normalized_bat4295.json";
const outDir      = outDirIdx  >= 0 ? args[outDirIdx  + 1] : "./appeal-letters";

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let payload;
try {
  payload = JSON.parse(readFileSync(payloadFile, "utf8"));
} catch {
  console.error(`❌  Cannot read payload: ${payloadFile}`);
  console.error(`    Run normalize-bat4295-payload.mjs first.`);
  process.exit(1);
}

const { submissions } = payload;
let count = 0;

for (const s of submissions) {
  const codes = s.rejectionCodes;
  const letterParts = [];

  if (codes.includes("BE-1-3")) letterParts.push(letterBE13(s, s));
  if (codes.includes("BE-1-4")) letterParts.push(letterBE14(s, s));
  if (codes.includes("MN-1-1")) letterParts.push(letterMN11(s, s));
  if (codes.includes("CV-1-3")) letterParts.push(letterCV13(s, s));
  if (codes.includes("SE-1-6")) letterParts.push(letterSE16(s, s));
  if (codes.includes("AD-1-4")) letterParts.push(letterAD14(s, s));

  if (!letterParts.length) continue;

  const safeBundle = s.bundleId.substring(0, 8);
  const safeName   = s.patientName.replace(/[^a-zA-Z\u0600-\u06FF]/g, "_").substring(0, 30);
  const fileName   = `${s.seq.toString().padStart(3,"0")}_${safeName}_${safeBundle}.txt`;

  const header = `
╔══════════════════════════════════════════════════════╗
║  COMPLIANCELINC — BrainSAIT                         ║
║  NPHIES Appeal Package                               ║
║  Batch: ${BATCH_ID}       ║
╚══════════════════════════════════════════════════════╝

Sequence  : ${s.seq}
Patient   : ${s.patientName}
National ID: ${s.nationalId}
Bundle ID : ${s.bundleId}
Date      : ${s.serviceDate}
Priority  : ${s.priority}
Codes     : ${s.rejectionCodes.join(", ")}
${s.specialNote ? `NOTE      : ${s.specialNote}` : ""}
${"─".repeat(56)}
`;

  const fullLetter = header + letterParts.join("\n\n" + "─".repeat(56) + "\n\n");
  writeFileSync(join(outDir, fileName), fullLetter);
  count++;
}

// ─── Index file ───────────────────────────────────────────────────────────────
const index = submissions.map(s => ({
  seq:        s.seq,
  priority:   s.priority,
  patient:    s.patientName,
  nationalId: s.nationalId,
  bundle:     s.bundleId,
  date:       s.serviceDate,
  codes:      s.rejectionCodes.join("+"),
  items:      s.rejections.length,
  attachmentsRequired: s.requiredCount,
  letterFile: `${s.seq.toString().padStart(3,"0")}_${s.patientName.replace(/[^a-zA-Z\u0600-\u06FF]/g,"_").substring(0,30)}_${s.bundleId.substring(0,8)}.txt`,
  blocker:    s.requiresRecode,
  note:       s.specialNote || "",
}));

writeFileSync(join(outDir, "_APPEAL_INDEX.json"), JSON.stringify(index, null, 2));
writeFileSync(join(outDir, "_APPEAL_INDEX.csv"),
  ["seq,priority,patient,nationalId,bundleId,date,codes,items,attachments,blocker,note",
   ...index.map(r => [r.seq,r.priority,`"${r.patient}"`,r.nationalId,r.bundle,r.date,r.codes,r.items,r.attachmentsRequired,r.blocker,`"${r.note}"`].join(","))
  ].join("\n")
);

console.log(`\n✅  Generated ${count} appeal letters → ${outDir}/`);
console.log(`📋  Index: ${outDir}/_APPEAL_INDEX.csv`);
console.log(`\n🚫  BLOCKERS (need recode first):`);
index.filter(r => r.blocker).forEach(r =>
  console.log(`    [${r.seq}] ${r.patient} | ${r.bundle.substring(0,8)} | ${r.date}`)
);
console.log(`\n🔴  CRITICAL/HIGH priority:`);
index.filter(r => ["CRITICAL","HIGH"].includes(r.priority)).forEach(r =>
  console.log(`    [${r.seq}] ${r.priority} | ${r.patient} | ${r.codes}`)
);
