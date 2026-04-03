/**
 * Radiology module — retrieve radiology reports from Oracle OASIS
 */
import { CTX_ROOTS } from './session.js'

/**
 * Get radiology reports for a patient
 */
export async function getRadiologyReports(session, patientId, opts = {}) {
  const { from, to, limit = 20, modality } = opts
  const ctx = CTX_ROOTS[session.hospital]

  const params = new URLSearchParams({
    patient_id: patientId,
    ...(from && { from_date: from }),
    ...(to && { to_date: to }),
    ...(modality && { modality }),
    limit: String(limit),
  })

  const rest = await session.apiGet(`/radiology/reports?${params}`)
  if (rest.source === 'rest' && rest.data) {
    return normalizeReports(rest.data.reports || rest.data, session.hospital)
  }

  try {
    const resp = await session.fetch(
      `${ctx}/faces/radiology/RadiologyReports.jsf?mrn=${patientId}&limit=${limit}`
    )
    if (!resp.ok) return []
    const html = await resp.text()
    return parseReportsFromHTML(html, session.hospital)
  } catch (e) {
    console.error(`[radiology] error:`, e.message)
    return []
  }
}

/**
 * Get a single radiology report with full text
 */
export async function getRadiologyStudy(session, studyId) {
  const ctx = CTX_ROOTS[session.hospital]
  const rest = await session.apiGet(`/radiology/reports/${studyId}`)
  if (rest.source === 'rest' && rest.data) {
    return normalizeReport(rest.data, session.hospital)
  }
  try {
    const resp = await session.fetch(`${ctx}/faces/radiology/RadiologyReport.jsf?id=${studyId}`)
    if (!resp.ok) return null
    const html = await resp.text()
    return parseReportDetailFromHTML(html, studyId, session.hospital)
  } catch (e) {
    return null
  }
}

// ──────────────── Normalizers ────────────────

function normalizeReports(items, hospital) {
  return (Array.isArray(items) ? items : []).map(r => normalizeReport(r, hospital))
}

function normalizeReport(r, hospital) {
  return {
    id: r.id || r.study_id || r.STUDY_ID,
    hospital,
    patient_id: r.patient_id || r.mrn || r.PATIENT_ID,
    study_type: r.study_type || r.STUDY_TYPE || r.modality,
    modality: (r.modality || r.MODALITY || 'X-Ray').toUpperCase(),
    body_part: r.body_part || r.BODY_PART || r.anatomy,
    description: r.description || r.exam_description || r.EXAM_DESC,
    status: (r.status || r.STATUS || 'final').toLowerCase(),
    report_text: r.report_text || r.findings || r.REPORT_TEXT || '',
    impression: r.impression || r.IMPRESSION || '',
    radiologist: r.radiologist || r.radiologist_name || r.RADIOLOGIST,
    ordered_by: r.ordered_by || r.ORDERING_PHYSICIAN,
    study_date: r.study_date || r.exam_date || r.STUDY_DATE,
    reported_date: r.reported_date || r.REPT_DATE,
    accession_number: r.accession_number || r.ACCESSION_NO,
    has_images: r.has_images !== false,
    images_url: r.images_url || r.IMAGES_URL || null,
  }
}

// ──────────────── HTML Parsers ────────────────

function parseReportsFromHTML(html, hospital) {
  const reports = []
  const rowRegex = /<tr[^>]*class="[^"]*study[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  while ((m = rowRegex.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
      c[1].replace(/<[^>]+>/g, '').trim()
    )
    if (cells.length >= 2) {
      reports.push({
        id: `RAD-${reports.length + 1}`,
        hospital,
        study_date: cells[0] || '',
        study_type: cells[1] || '',
        modality: cells[2] || '',
        body_part: cells[3] || '',
        status: 'final',
        description: cells[4] || '',
        has_images: true,
      })
    }
  }
  return reports
}

function parseReportDetailFromHTML(html, studyId, hospital) {
  const findingsMatch = html.match(/[Ff]indings?[:\s]+([\s\S]*?)(?=[Ii]mpression|$)/m)
  const impressionMatch = html.match(/[Ii]mpression[:\s]+([\s\S]*?)(?=\n\n|<\/|$)/m)
  return {
    id: studyId,
    hospital,
    report_text: findingsMatch ? findingsMatch[1].replace(/<[^>]+>/g, '').trim() : '',
    impression: impressionMatch ? impressionMatch[1].replace(/<[^>]+>/g, '').trim() : '',
    status: 'final',
  }
}
