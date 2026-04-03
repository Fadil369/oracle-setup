/**
 * Labs module — retrieve lab results from Oracle OASIS
 */
import { CTX_ROOTS } from './session.js'

/**
 * Get lab results for a patient
 * @param {OracleSession} session
 * @param {string} patientId
 * @param {object} opts - { from, to, limit, testCode }
 * @returns {Array} Lab results
 */
export async function getLabResults(session, patientId, opts = {}) {
  const { from, to, limit = 20, testCode } = opts
  const ctx = CTX_ROOTS[session.hospital]

  // Try REST
  const params = new URLSearchParams({
    patient_id: patientId,
    ...(from && { from_date: from }),
    ...(to && { to_date: to }),
    ...(testCode && { test_code: testCode }),
    limit: String(limit),
  })
  const rest = await session.apiGet(`/laboratory/results?${params}`)
  if (rest.source === 'rest' && rest.data) {
    return normalizeLabs(rest.data.results || rest.data, session.hospital)
  }

  // JSF fallback
  try {
    const resp = await session.fetch(
      `${ctx}/faces/laboratory/LabResults.jsf?mrn=${patientId}&limit=${limit}`
    )
    if (!resp.ok) return []
    const html = await resp.text()
    return parseLabsFromHTML(html, session.hospital)
  } catch (e) {
    console.error(`[labs] error for ${session.hospital}:`, e.message)
    return []
  }
}

/**
 * Get a single lab result detail
 */
export async function getLabDetail(session, labId) {
  const ctx = CTX_ROOTS[session.hospital]
  const rest = await session.apiGet(`/laboratory/results/${labId}`)
  if (rest.source === 'rest' && rest.data) {
    return normalizeLabItem(rest.data, session.hospital)
  }

  try {
    const resp = await session.fetch(`${ctx}/faces/laboratory/LabResultDetail.jsf?id=${labId}`)
    if (!resp.ok) return null
    const html = await resp.text()
    return parseLabDetailFromHTML(html, labId, session.hospital)
  } catch (e) {
    return null
  }
}

// ──────────────── Normalizers ────────────────

function normalizeLabs(items, hospital) {
  return (Array.isArray(items) ? items : []).map(l => normalizeLabItem(l, hospital))
}

function normalizeLabItem(l, hospital) {
  return {
    id: l.id || l.result_id || l.LAB_ID,
    hospital,
    patient_id: l.patient_id || l.mrn || l.PATIENT_ID,
    test_name: l.test_name || l.TEST_NAME || l.description,
    test_code: l.test_code || l.TEST_CODE,
    result_value: l.result || l.value || l.RESULT_VALUE,
    unit: l.unit || l.UNIT,
    reference_range: l.reference_range || l.REF_RANGE || `${l.low || ''}–${l.high || ''}`,
    status: (l.status || l.STATUS || 'final').toLowerCase(),
    flag: l.flag || l.ABNORMAL_FLAG || (l.is_abnormal ? 'ABNORMAL' : 'NORMAL'),
    collected_date: l.collected_date || l.collection_date || l.COLL_DATE,
    reported_date: l.reported_date || l.result_date || l.REPT_DATE,
    ordered_by: l.ordered_by || l.ORDERING_PHYSICIAN,
    department: l.department || l.LAB_DEPT,
  }
}

// ──────────────── HTML Parsers ────────────────

function parseLabsFromHTML(html, hospital) {
  const results = []
  const rowRegex = /<tr[^>]*class="[^"]*result[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  while ((m = rowRegex.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
      c[1].replace(/<[^>]+>/g, '').trim()
    )
    if (cells.length >= 3) {
      results.push({
        id: `LAB-${results.length + 1}`,
        hospital,
        test_name: cells[0] || 'Unknown',
        result_value: cells[1] || '',
        unit: cells[2] || '',
        reference_range: cells[3] || '',
        status: 'final',
        flag: 'NORMAL',
        reported_date: cells[4] || '',
      })
    }
  }
  return results
}

function parseLabDetailFromHTML(html, labId, hospital) {
  const titleMatch = html.match(/<h[123][^>]*>([^<]+)<\/h[123]>/)
  return {
    id: labId,
    hospital,
    test_name: titleMatch ? titleMatch[1].trim() : 'Lab Result',
    html_available: true,
  }
}
