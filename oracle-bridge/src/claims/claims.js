/**
 * Claims module — submit and check insurance claims
 * Integrates with:
 *   1. Oracle OASIS internal claims (SBS/NPHIES)
 *   2. GlobeMed e-claims portal (moh-claims.elfadil.com)
 *   3. MOH approval portal (moh-approval.elfadil.com)
 */
import { CTX_ROOTS } from '../oracle/session.js'

const GLOBEMED_BASE = 'https://moh-claims.elfadil.com'
const MOH_APPROVAL_BASE = 'https://moh-approval.elfadil.com'

/**
 * Get patient claims from Oracle OASIS
 */
export async function getPatientClaims(session, patientId, opts = {}) {
  const { status, from, to, limit = 20 } = opts
  const ctx = CTX_ROOTS[session.hospital]

  const params = new URLSearchParams({
    patient_id: patientId,
    ...(status && { status }),
    ...(from && { from_date: from }),
    ...(to && { to_date: to }),
    limit: String(limit),
  })

  const rest = await session.apiGet(`/claims?${params}`)
  if (rest.source === 'rest' && rest.data) {
    return normalizeClaims(rest.data.claims || rest.data, session.hospital)
  }

  try {
    const resp = await session.fetch(
      `${ctx}/faces/claims/PatientClaims.jsf?mrn=${patientId}&status=${status || ''}`
    )
    if (!resp.ok) return []
    const html = await resp.text()
    return parseClaimsFromHTML(html, session.hospital)
  } catch (e) {
    console.error(`[claims] get error:`, e.message)
    return []
  }
}

/**
 * Submit a claim to NPHIES via Oracle OASIS
 */
export async function submitClaim(session, claimData) {
  const {
    patientId, encounterId, serviceDate, serviceCodes, diagnosisCodes,
    payerId, insuranceNumber, totalAmount, priority = 'normal'
  } = claimData
  const ctx = CTX_ROOTS[session.hospital]

  // Try NPHIES REST API
  try {
    const resp = await fetch(`${session.base}${ctx}/api/v1/claims/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': session._sessionCookie || '',
        'User-Agent': 'BrainSAIT-Oracle-Bridge/2.0',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        patient_id: patientId,
        encounter_id: encounterId,
        service_date: serviceDate,
        service_codes: serviceCodes,
        diagnosis_codes: diagnosisCodes,
        payer_id: payerId,
        insurance_number: insuranceNumber,
        total_amount: totalAmount,
        priority,
        submitted_by: 'BSMA-AI',
        channel: 'api',
      }),
    })
    if (resp.ok) {
      const data = await resp.json()
      return {
        success: true,
        source: 'oracle_rest',
        claim_id: data.claim_id || data.id,
        claim_number: data.claim_number || data.CLAIM_NO,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      }
    }
  } catch (_) {}

  // JSF fallback
  try {
    const pageResp = await session.fetch(`${ctx}/faces/claims/SubmitClaim.jsf`)
    const html = await pageResp.text()
    const viewState = extractViewState(html)
    const formId = extractFormId(html)

    const form = new URLSearchParams({
      'javax.faces.ViewState': viewState || '',
      [`${formId || 'claimForm'}:patientMRN`]: patientId,
      [`${formId || 'claimForm'}:encounterId`]: encounterId || '',
      [`${formId || 'claimForm'}:serviceDate`]: serviceDate || '',
      [`${formId || 'claimForm'}:diagnosisCodes`]: (diagnosisCodes || []).join(','),
      [`${formId || 'claimForm'}:serviceCodes`]: (serviceCodes || []).join(','),
      [`${formId || 'claimForm'}:payerId`]: payerId || '',
      [`${formId || 'claimForm'}:totalAmount`]: totalAmount || '',
      [`${formId || 'claimForm'}:SubmitButton`]: 'Submit',
    })

    const submitResp = await session.fetch(`${ctx}/faces/claims/SubmitClaim.jsf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })

    const confirmHtml = await submitResp.text()
    const claimNo = extractClaimNumber(confirmHtml)

    return {
      success: true,
      source: 'oracle_jsf',
      claim_id: claimNo || `CLM-${Date.now()}`,
      claim_number: claimNo,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }
  } catch (e) {
    throw new Error(`Claim submission failed: ${e.message}`)
  }
}

/**
 * Submit claim via GlobeMed e-claims portal
 */
export async function submitGlobemedClaim(claimData, credentials) {
  const { username, password } = credentials || {}
  if (!username || !password) {
    throw new Error('GlobeMed credentials required')
  }

  // Login to GlobeMed
  const loginResp = await fetch(`${GLOBEMED_BASE}/login.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, lang: 'english' }).toString(),
    redirect: 'manual',
  })

  const cookie = loginResp.headers.get('set-cookie') || ''

  // Submit claim
  const submitResp = await fetch(`${GLOBEMED_BASE}/api/claims/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
    },
    body: JSON.stringify(claimData),
  })

  if (submitResp.ok) {
    const data = await submitResp.json()
    return { success: true, source: 'globemed', ...data }
  }

  return { success: false, source: 'globemed', status: submitResp.status }
}

/**
 * Check claim status
 */
export async function getClaimStatus(session, claimId) {
  const ctx = CTX_ROOTS[session.hospital]
  const rest = await session.apiGet(`/claims/${claimId}`)
  if (rest.source === 'rest' && rest.data) {
    return normalizeClaim(rest.data, session.hospital)
  }
  return { id: claimId, hospital: session.hospital, status: 'unknown' }
}

// ──────────────── Normalizers ────────────────

function normalizeClaims(items, hospital) {
  return (Array.isArray(items) ? items : []).map(c => normalizeClaim(c, hospital))
}

function normalizeClaim(c, hospital) {
  return {
    id: c.id || c.claim_id || c.CLAIM_ID,
    hospital,
    patient_id: c.patient_id || c.mrn || c.PATIENT_ID,
    claim_number: c.claim_number || c.CLAIM_NO,
    payer: c.payer || c.payer_name || c.PAYER_NAME,
    total_amount: c.total_amount || c.TOTAL_AMOUNT,
    approved_amount: c.approved_amount || c.APPROVED_AMOUNT,
    status: (c.status || c.STATUS || 'pending').toLowerCase(),
    submission_date: c.submission_date || c.SUBMIT_DATE,
    service_date: c.service_date || c.SERVICE_DATE,
    rejection_reason: c.rejection_reason || c.REJECT_REASON || null,
    claim_type: c.claim_type || c.CLAIM_TYPE || 'medical',
  }
}

// ──────────────── HTML Parsers ────────────────

function parseClaimsFromHTML(html, hospital) {
  const claims = []
  const rowRegex = /<tr[^>]*class="[^"]*claim[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  while ((m = rowRegex.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
      c[1].replace(/<[^>]+>/g, '').trim()
    )
    if (cells.length >= 3) {
      claims.push({
        id: `CLM-${claims.length + 1}`,
        hospital,
        claim_number: cells[0] || '',
        status: cells[1] || 'pending',
        total_amount: cells[2] || '',
        submission_date: cells[3] || '',
      })
    }
  }
  return claims
}

function extractViewState(html) {
  const m = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)
  return m ? m[1] : ''
}

function extractFormId(html) {
  const m = html.match(/<form[^>]+id="([^"]+)"/)
  return m ? m[1] : ''
}

function extractClaimNumber(html) {
  const m = html.match(/[Cc]laim\s+(?:[Nn]umber|[Nn]o)[^:]*:\s*([A-Z0-9\-]+)/)
  return m ? m[1] : null
}
