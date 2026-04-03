/**
 * Oracle Bridge Worker v2.0
 * BrainSAIT — BSMA Portal Integration Layer
 *
 * Exposes REST APIs over Oracle OASIS hospital systems so BSMA AI can:
 *   - Book and list appointments
 *   - Retrieve lab results
 *   - Retrieve radiology reports
 *   - Retrieve patient documents
 *   - Submit and track insurance claims
 *
 * All requests must carry: X-Hospital: <id> + X-API-Key: <secret>
 * Credentials per hospital stored as Cloudflare secrets:
 *   ORACLE_CREDS_<HOSPITAL> = JSON { username, password }
 *   ORACLE_BRIDGE_API_KEY   = shared secret for BSMA→Bridge calls
 */

import { OracleSession, HOSPITAL_BASES, CTX_ROOTS } from './oracle/session.js'
import { listAppointments, getAvailableSlots, bookAppointment, cancelAppointment } from './oracle/appointments.js'
import { getLabResults, getLabDetail } from './oracle/labs.js'
import { getRadiologyReports, getRadiologyStudy } from './oracle/radiology.js'
import { getDocuments, getDocumentDownload } from './oracle/documents.js'
import { getPatientClaims, submitClaim, getClaimStatus, submitGlobemedClaim } from './claims/claims.js'

const VALID_HOSPITALS = ['riyadh', 'madinah', 'unaizah', 'khamis', 'jizan', 'abha']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Hospital, X-API-Key, Authorization',
}

// ──────────────────────────────────────────────────────────────
// MAIN FETCH HANDLER
// ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    // Health probe
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'oracle-bridge', version: env.BRIDGE_VERSION || '2.0.0', ts: Date.now() })
    }

    // API key check
    const apiKey = request.headers.get('X-API-Key') || url.searchParams.get('api_key')
    if (env.ORACLE_BRIDGE_API_KEY && apiKey !== env.ORACLE_BRIDGE_API_KEY) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // Route
    try {
      return await route(request, url, env)
    } catch (e) {
      console.error('[oracle-bridge] unhandled error:', e.message, e.stack)
      return json({ error: e.message || 'Internal error' }, 500)
    }
  }
}

// ──────────────────────────────────────────────────────────────
// ROUTER
// ──────────────────────────────────────────────────────────────
async function route(request, url, env) {
  const path = url.pathname
  const method = request.method
  const q = Object.fromEntries(url.searchParams)

  // ── Patient search ──
  if (path === '/patient/search' && method === 'GET') {
    return handlePatientSearch(request, url, env)
  }

  // ── Appointments ──
  if (path === '/appointments' && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const data = await listAppointments(session, q.patient_id)
      return json({ appointments: data, hospital: session.hospital, count: data.length })
    })
  }

  if (path === '/appointments/slots' && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const data = await getAvailableSlots(session, {
        specialty: q.specialty,
        providerId: q.provider_id,
        date: q.date,
      })
      return json({ slots: data, date: q.date, count: data.length })
    })
  }

  if (path === '/appointments' && method === 'POST') {
    return handleWithSession(request, env, async (session) => {
      const body = await request.json()
      const result = await bookAppointment(session, body)
      return json(result, result.success ? 201 : 422)
    })
  }

  if (path.match(/^\/appointments\/[^/]+$/) && method === 'DELETE') {
    return handleWithSession(request, env, async (session) => {
      const apptId = path.split('/')[2]
      const body = await request.json().catch(() => ({}))
      const result = await cancelAppointment(session, apptId, body.reason)
      return json(result)
    })
  }

  // ── Labs ──
  if (path === '/labs' && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const data = await getLabResults(session, q.patient_id, {
        from: q.from, to: q.to, limit: q.limit, testCode: q.test_code,
      })
      return json({ labs: data, count: data.length })
    })
  }

  if (path.match(/^\/labs\/[^/]+$/) && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const data = await getLabDetail(session, path.split('/')[2])
      return data ? json(data) : json({ error: 'Not found' }, 404)
    })
  }

  // ── Radiology ──
  if (path === '/radiology' && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const data = await getRadiologyReports(session, q.patient_id, {
        from: q.from, to: q.to, limit: q.limit, modality: q.modality,
      })
      return json({ reports: data, count: data.length })
    })
  }

  if (path.match(/^\/radiology\/[^/]+$/) && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const data = await getRadiologyStudy(session, path.split('/')[2])
      return data ? json(data) : json({ error: 'Not found' }, 404)
    })
  }

  // ── Documents ──
  if (path === '/documents' && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const data = await getDocuments(session, q.patient_id, {
        docType: q.doc_type, from: q.from, to: q.to, limit: q.limit,
      })
      return json({ documents: data, count: data.length })
    })
  }

  if (path.match(/^\/documents\/[^/]+\/download$/) && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const docId = path.split('/')[2]
      const result = await getDocumentDownload(session, docId)
      return json(result)
    })
  }

  // ── Claims ──
  if (path === '/claims' && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const data = await getPatientClaims(session, q.patient_id, {
        status: q.status, from: q.from, to: q.to, limit: q.limit,
      })
      return json({ claims: data, count: data.length })
    })
  }

  if (path === '/claims/submit' && method === 'POST') {
    return handleWithSession(request, env, async (session) => {
      const body = await request.json()
      const result = await submitClaim(session, body)
      return json(result, result.success ? 201 : 422)
    })
  }

  if (path === '/claims/globemed' && method === 'POST') {
    const body = await request.json()
    const hospital = request.headers.get('X-Hospital') || body.hospital
    const credsStr = env[`ORACLE_CREDS_${hospital?.toUpperCase()}`]
    const creds = credsStr ? JSON.parse(credsStr) : null
    const result = await submitGlobemedClaim(body, creds)
    return json(result)
  }

  if (path.match(/^\/claims\/[^/]+\/status$/) && method === 'GET') {
    return handleWithSession(request, env, async (session) => {
      const claimId = path.split('/')[2]
      const data = await getClaimStatus(session, claimId)
      return json(data)
    })
  }

  // ── Diagnostics ──
  // GET /diagnose         → probe all hospitals (no auth needed)
  // GET /diagnose/:id     → probe one hospital
  if (path === '/diagnose' && method === 'GET') {
    const results = await Promise.all(
      VALID_HOSPITALS.map(h => new OracleSession(env.SESSION_KV, h).diagnose())
    )
    const allOk = results.every(r => r.reachable)
    return json({ ok: allOk, hospitals: results, ts: Date.now() }, allOk ? 200 : 207)
  }

  if (path.match(/^\/diagnose\/[^/]+$/) && method === 'GET') {
    const hospital = path.split('/')[2]
    if (!VALID_HOSPITALS.includes(hospital)) {
      return json({ error: 'Unknown hospital. Valid: ' + VALID_HOSPITALS.join(', ') }, 400)
    }
    const result = await new OracleSession(env.SESSION_KV, hospital).diagnose()
    return json(result, result.reachable ? 200 : 502)
  }

  // ── Hospitals list ──
  if (path === '/hospitals' && method === 'GET') {
    return json({
      hospitals: VALID_HOSPITALS.map(h => ({
        id: h,
        base: `https://oracle-${h}.elfadil.com`,
        status: 'active',
      }))
    })
  }

  return json({ error: 'Not found', path }, 404)
}

// ──────────────────────────────────────────────────────────────
// SESSION MIDDLEWARE
// ──────────────────────────────────────────────────────────────
async function handleWithSession(request, env, handler) {
  const url = new URL(request.url)
  const q = Object.fromEntries(url.searchParams)

  // Resolve hospital from header, query param, or body
  let hospital = request.headers.get('X-Hospital') || q.hospital
  if (!hospital && request.method !== 'GET') {
    try {
      const body = await request.clone().json()
      hospital = body.hospital
    } catch (_) {}
  }

  if (!hospital || !VALID_HOSPITALS.includes(hospital)) {
    return json({ error: 'X-Hospital header required. Valid: ' + VALID_HOSPITALS.join(', ') }, 400)
  }

  // Load credentials from env secret
  const credsEnvKey = `ORACLE_CREDS_${hospital.toUpperCase()}`
  const credsStr = env[credsEnvKey]
  let username, password

  if (credsStr) {
    const creds = JSON.parse(credsStr)
    username = creds.username
    password = creds.password
  } else {
    // Accept credentials in header for direct calls
    const authHeader = request.headers.get('Authorization') || ''
    if (authHeader.startsWith('Basic ')) {
      const decoded = atob(authHeader.slice(6))
      ;[username, password] = decoded.split(':', 2)
    }
  }

  if (!username || !password) {
    return json({
      error: `No credentials for hospital "${hospital}". Set secret ORACLE_CREDS_${hospital.toUpperCase()} or use Basic auth.`
    }, 401)
  }

  const session = new OracleSession(env.SESSION_KV, hospital)
  const cookie = await session.getSession(username, password)

  if (!cookie) {
    return json({ error: `Failed to authenticate with Oracle OASIS for hospital "${hospital}"` }, 502)
  }

  session.setSessionCookie(cookie)

  try {
    return await handler(session)
  } catch (e) {
    // If unauthorized, invalidate session and return error
    if (e.message?.includes('401') || e.message?.includes('403')) {
      await session.invalidateSession(username)
    }
    throw e
  }
}

// ──────────────────────────────────────────────────────────────
// Patient Search (no Oracle session needed — searches by national ID)
// ──────────────────────────────────────────────────────────────
async function handlePatientSearch(request, url, env) {
  const q = Object.fromEntries(url.searchParams)
  const { national_id, mrn, name, hospital } = q

  if (!hospital || !VALID_HOSPITALS.includes(hospital)) {
    return json({ error: 'hospital param required. Valid: ' + VALID_HOSPITALS.join(', ') }, 400)
  }

  const credsStr = env[`ORACLE_CREDS_${hospital.toUpperCase()}`]
  if (!credsStr) return json({ error: 'No credentials configured for this hospital' }, 401)

  const { username, password } = JSON.parse(credsStr)
  const session = new OracleSession(env.SESSION_KV, hospital)
  const cookie = await session.getSession(username, password)
  if (!cookie) return json({ error: `Authentication failed for hospital "${hospital}"` }, 502)
  session.setSessionCookie(cookie)

  const ctx = CTX_ROOTS[hospital]

  // ── Try REST search first ──
  const searchParam = national_id
    ? `national_id=${encodeURIComponent(national_id)}`
    : mrn
    ? `mrn=${encodeURIComponent(mrn)}`
    : `name=${encodeURIComponent(name || '')}`

  const rest = await session.apiGet(`/patient/search?${searchParam}`)
  if (rest.source === 'rest' && rest.data) {
    return json({
      patients: Array.isArray(rest.data) ? rest.data : [rest.data],
      hospital, source: 'rest',
    })
  }

  // ── JSF fallback: scrape patient search page ──
  try {
    const pageResp = await session.fetch(
      `${ctx}/faces/patient/PatientSearch.jsf?${searchParam}`
    )
    if (pageResp.ok) {
      const html = await pageResp.text()
      const patients = parsePatientsFromHTML(html, hospital)
      if (patients.length > 0) {
        return json({ patients, hospital, source: 'jsf' })
      }
    }
  } catch (_) {}

  return json({ patients: [], hospital, searched_by: { national_id, mrn, name }, source: 'not_found' })
}

function parsePatientsFromHTML(html, hospital) {
  const patients = []
  const rowRegex = /<tr[^>]*class="[^"]*patient[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  while ((m = rowRegex.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
      c[1].replace(/<[^>]+>/g, '').trim()
    )
    if (cells.length >= 2) {
      patients.push({
        mrn: cells[0] || '',
        name: cells[1] || '',
        national_id: cells[2] || '',
        dob: cells[3] || '',
        gender: cells[4] || '',
        hospital,
      })
    }
  }
  return patients
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
