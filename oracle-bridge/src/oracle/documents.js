/**
 * Documents module — retrieve patient documents from Oracle OASIS
 * Covers: discharge summaries, clinical notes, prescriptions, consent forms, referrals
 */
import { CTX_ROOTS } from './session.js'

/**
 * Get patient documents list
 */
export async function getDocuments(session, patientId, opts = {}) {
  const { docType, from, to, limit = 20 } = opts
  const ctx = CTX_ROOTS[session.hospital]

  const params = new URLSearchParams({
    patient_id: patientId,
    ...(docType && { doc_type: docType }),
    ...(from && { from_date: from }),
    ...(to && { to_date: to }),
    limit: String(limit),
  })

  const rest = await session.apiGet(`/documents?${params}`)
  if (rest.source === 'rest' && rest.data) {
    return normalizeDocs(rest.data.documents || rest.data, session.hospital)
  }

  try {
    const resp = await session.fetch(
      `${ctx}/faces/documents/PatientDocuments.jsf?mrn=${patientId}&type=${docType || ''}`
    )
    if (!resp.ok) return []
    const html = await resp.text()
    return parseDocsFromHTML(html, session.hospital)
  } catch (e) {
    console.error(`[documents] error:`, e.message)
    return []
  }
}

/**
 * Get a document's download URL (signed or direct)
 */
export async function getDocumentDownload(session, docId) {
  const ctx = CTX_ROOTS[session.hospital]

  const rest = await session.apiGet(`/documents/${docId}/download`)
  if (rest.source === 'rest' && rest.data) {
    return { url: rest.data.url || rest.data.download_url, source: 'rest' }
  }

  // Construct a direct JSF download link using session cookie
  const url = `${session.base}${ctx}/faces/documents/DownloadDocument.jsf?id=${docId}`
  return { url, source: 'jsf', cookie_required: true }
}

// ──────────────── Normalizers ────────────────

function normalizeDocs(items, hospital) {
  return (Array.isArray(items) ? items : []).map(d => normalizeDoc(d, hospital))
}

function normalizeDoc(d, hospital) {
  return {
    id: d.id || d.doc_id || d.DOCUMENT_ID,
    hospital,
    patient_id: d.patient_id || d.mrn || d.PATIENT_ID,
    title: d.title || d.document_name || d.DOC_TITLE || 'Document',
    type: (d.type || d.doc_type || d.DOC_TYPE || 'clinical_note').toLowerCase(),
    description: d.description || d.DOC_DESC || '',
    created_date: d.created_date || d.date || d.CREATED_DATE,
    author: d.author || d.created_by || d.PHYSICIAN_NAME,
    department: d.department || d.DEPT_NAME,
    format: (d.format || d.file_type || d.FORMAT || 'pdf').toLowerCase(),
    size_bytes: d.size_bytes || d.SIZE_BYTES || null,
    status: (d.status || 'final').toLowerCase(),
    is_signed: d.is_signed !== false,
  }
}

// ──────────────── HTML Parsers ────────────────

function parseDocsFromHTML(html, hospital) {
  const docs = []
  const rowRegex = /<tr[^>]*class="[^"]*doc[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/
  let m
  while ((m = rowRegex.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
      c[1].replace(/<[^>]+>/g, '').trim()
    )
    const linkMatch = linkRegex.exec(m[1])
    if (cells.length >= 2) {
      docs.push({
        id: linkMatch ? linkMatch[1].split('id=')[1] : `DOC-${docs.length + 1}`,
        hospital,
        title: cells[0] || linkMatch?.[2] || 'Document',
        type: cells[1] || 'clinical_note',
        created_date: cells[2] || '',
        author: cells[3] || '',
        format: 'pdf',
        status: 'final',
        is_signed: true,
      })
    }
  }
  return docs
}
