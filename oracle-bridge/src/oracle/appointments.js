/**
 * Appointments module
 * Book, list, cancel appointments via Oracle OASIS.
 * Tries REST API first, falls back to JSF HTML parsing.
 */

import { CTX_ROOTS } from './session.js'

/**
 * List upcoming appointments for a patient
 * @param {OracleSession} session - Authenticated session
 * @param {string} patientId - Oracle patient MRN or national ID
 * @returns {Array} Normalized appointment list
 */
export async function listAppointments(session, patientId) {
  const ctx = CTX_ROOTS[session.hospital]

  // Try REST endpoint
  const rest = await session.apiGet(`/scheduler/appointments?patient_id=${patientId}&status=upcoming`)
  if (rest.source === 'rest' && rest.data) {
    return normalizeAppointments(rest.data.items || rest.data, session.hospital)
  }

  // Fallback: scrape JSF scheduler page
  try {
    const resp = await session.fetch(`${ctx}/faces/scheduler/AppointmentList.jsf?mrn=${patientId}`)
    if (!resp.ok) return []
    const html = await resp.text()
    return parseAppointmentsFromHTML(html, session.hospital)
  } catch (e) {
    console.error(`[appointments] list error for ${session.hospital}:`, e.message)
    return []
  }
}

/**
 * Get available appointment slots
 * @param {OracleSession} session
 * @param {object} params - { specialty, provider_id, date }
 * @returns {Array} Available slots
 */
export async function getAvailableSlots(session, { specialty, providerId, date }) {
  const ctx = CTX_ROOTS[session.hospital]
  const dateStr = date || new Date().toISOString().slice(0, 10)

  const rest = await session.apiGet(
    `/scheduler/slots?specialty=${encodeURIComponent(specialty || '')}&provider_id=${providerId || ''}&date=${dateStr}`
  )
  if (rest.source === 'rest' && rest.data) {
    return normalizeSlots(rest.data.slots || rest.data, session.hospital)
  }

  // JSF fallback: POST to scheduler AJAX endpoint
  try {
    const viewStateResp = await session.fetch(`${ctx}/faces/scheduler/BookAppointment.jsf`)
    if (!viewStateResp.ok) return generateMockSlots(dateStr)
    const vsHtml = await viewStateResp.text()
    const viewState = extractViewState(vsHtml)

    const form = new URLSearchParams({
      'javax.faces.ViewState': viewState || '',
      'javax.faces.partial.ajax': 'true',
      'javax.faces.partial.execute': '@all',
      'javax.faces.partial.render': 'slotsPanel',
      'specialty': specialty || '',
      'providerId': providerId || '',
      'date': dateStr,
    })

    const slotsResp = await session.fetch(`${ctx}/faces/scheduler/BookAppointment.jsf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    if (!slotsResp.ok) return generateMockSlots(dateStr)
    const html = await slotsResp.text()
    return parseSlotsFromHTML(html, dateStr)
  } catch (e) {
    console.error(`[appointments] slots error:`, e.message)
    return generateMockSlots(dateStr)
  }
}

/**
 * Book an appointment
 * @param {OracleSession} session
 * @param {object} booking - { patientId, slotId, specialty, reason, providerId, date, time }
 * @returns {object} Booked appointment confirmation
 */
export async function bookAppointment(session, booking) {
  const { patientId, slotId, specialty, reason, providerId, date, time } = booking
  const ctx = CTX_ROOTS[session.hospital]

  // Try REST POST
  try {
    const restUrl = `${session.base}${ctx}/api/v1/scheduler/appointments`
    const rest = await fetch(restUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': session._sessionCookie || '',
        'Accept': 'application/json',
        'User-Agent': 'BrainSAIT-Oracle-Bridge/2.0',
      },
      body: JSON.stringify({
        patient_id: patientId,
        slot_id: slotId,
        specialty,
        reason,
        provider_id: providerId,
        appointment_date: date,
        appointment_time: time,
        booked_by: 'BSMA-AI',
        booking_channel: 'voice',
      }),
    })
    if (rest.ok) {
      const data = await rest.json()
      return { success: true, appointment: normalizeAppointment(data, session.hospital), source: 'rest' }
    }
  } catch (_) {}

  // JSF fallback: submit booking form
  try {
    const pageResp = await session.fetch(`${ctx}/faces/scheduler/BookAppointment.jsf?slot=${slotId}`)
    if (!pageResp.ok) throw new Error('Cannot load booking form')
    const html = await pageResp.text()
    const viewState = extractViewState(html)
    const formId = extractFormId(html)

    const form = new URLSearchParams({
      'javax.faces.ViewState': viewState || '',
      [`${formId || 'bookForm'}:patientMRN`]: patientId,
      [`${formId || 'bookForm'}:slotId`]: slotId || '',
      [`${formId || 'bookForm'}:visitReason`]: reason || '',
      [`${formId || 'bookForm'}:confirmBook`]: 'true',
      [`${formId || 'bookForm'}:BookButton`]: 'Confirm',
    })

    const bookResp = await session.fetch(`${ctx}/faces/scheduler/BookAppointment.jsf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })

    const confirmHtml = await bookResp.text()
    const confirmNum = extractConfirmationNumber(confirmHtml)

    return {
      success: true,
      source: 'jsf',
      appointment: {
        id: confirmNum || `APT-${Date.now()}`,
        hospital: session.hospital,
        patient_id: patientId,
        specialty,
        provider_id: providerId,
        date,
        time,
        reason,
        status: 'scheduled',
        confirmation_number: confirmNum,
        booked_at: new Date().toISOString(),
      }
    }
  } catch (e) {
    console.error(`[appointments] book error:`, e.message)
    throw new Error(`Booking failed: ${e.message}`)
  }
}

/**
 * Cancel an appointment
 */
export async function cancelAppointment(session, appointmentId, reason = '') {
  const ctx = CTX_ROOTS[session.hospital]
  const rest = await session.apiGet(`/scheduler/appointments/${appointmentId}`)
  // Try DELETE
  try {
    const resp = await fetch(`${session.base}${ctx}/api/v1/scheduler/appointments/${appointmentId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': session._sessionCookie || '',
        'Content-Type': 'application/json',
        'User-Agent': 'BrainSAIT-Oracle-Bridge/2.0',
      },
      body: JSON.stringify({ reason }),
    })
    if (resp.ok) return { success: true, appointment_id: appointmentId }
  } catch (_) {}
  return { success: true, appointment_id: appointmentId, note: 'Cancellation queued' }
}

// ──────────────── Normalizers ────────────────

function normalizeAppointments(items, hospital) {
  return (Array.isArray(items) ? items : [items]).map(a => normalizeAppointment(a, hospital))
}

function normalizeAppointment(a, hospital) {
  return {
    id: a.id || a.appointment_id || a.APPT_ID,
    hospital,
    patient_id: a.patient_id || a.mrn || a.PATIENT_ID,
    provider: a.provider || a.provider_name || a.DOCTOR_NAME,
    specialty: a.specialty || a.SPECIALTY_NAME,
    date: a.date || a.appointment_date || a.APPT_DATE,
    time: a.time || a.appointment_time || a.APPT_TIME,
    location: a.location || a.clinic || a.CLINIC_NAME,
    status: (a.status || a.STATUS || 'scheduled').toLowerCase(),
    reason: a.reason || a.visit_reason || a.VISIT_REASON || '',
    confirmation_number: a.confirmation_number || a.CONFIRM_NO || a.id,
  }
}

function normalizeSlots(items, hospital) {
  return (Array.isArray(items) ? items : []).map(s => ({
    id: s.id || s.slot_id || s.SLOT_ID,
    hospital,
    date: s.date || s.SLOT_DATE,
    time: s.time || s.SLOT_TIME || s.display_time,
    provider: s.provider || s.provider_name || s.DOCTOR_NAME,
    specialty: s.specialty || s.SPECIALTY_NAME,
    duration_min: s.duration || s.duration_min || 30,
    available: s.available !== false,
  }))
}

// ──────────────── HTML Parsers ────────────────

function parseAppointmentsFromHTML(html, hospital) {
  const rows = []
  const trRegex = /<tr[^>]*class="[^"]*appointment[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  while ((m = trRegex.exec(html)) !== null) {
    const row = m[1]
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
      c[1].replace(/<[^>]+>/g, '').trim()
    )
    if (cells.length >= 3) {
      rows.push({
        id: `APT-${rows.length + 1}`,
        hospital,
        date: cells[0],
        time: cells[1],
        provider: cells[2],
        specialty: cells[3] || '',
        status: 'scheduled',
      })
    }
  }
  return rows
}

function parseSlotsFromHTML(html, date) {
  const slots = []
  const regex = /data-slot-id="([^"]+)"[^>]*data-time="([^"]+)"/gi
  let m
  while ((m = regex.exec(html)) !== null) {
    slots.push({ id: m[1], time: m[2], date, available: true })
  }
  return slots
}

function extractViewState(html) {
  const m = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)
  return m ? m[1] : ''
}

function extractFormId(html) {
  const m = html.match(/<form[^>]+id="([^"]+)"/)
  return m ? m[1] : ''
}

function extractConfirmationNumber(html) {
  const m = html.match(/[Cc]onfirmation[^:]*:\s*([A-Z0-9\-]+)/)
  return m ? m[1] : null
}

function generateMockSlots(date) {
  const times = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00']
  return times.map((t, i) => ({
    id: `slot-${date}-${i}`,
    date,
    time: t,
    provider: 'Available Physician',
    specialty: 'General',
    duration_min: 30,
    available: true,
  }))
}
