# Oracle OASIS Plus — Navigation Map for BSMA Integration

**Date:** 2026-04-03  
**System:** Oracle OASIS Plus (JSF/ADF) — Hayath Hospital Group  
**Integration Layer:** oracle-bridge Worker v2.0  
**Credentials:** U36113 / U36113 (shared across all 6 hospitals)

---

## Hospital Registry

| ID | Hospital | Base URL | Context Root | Login Path | Status |
|---|----------|----------|-------------|------------|--------|
| riyadh | الرياض — Riyadh General | https://oracle-riyadh.elfadil.com | /prod | /prod/faces/Login.jsf | 🔴 Backend down (128.1.1.185) |
| madinah | المدينة — Madinah Medical | https://oracle-madinah.elfadil.com | /Oasis | /Oasis/faces/Login.jsf | 🟡 Tunnel active, port TBD |
| unaizah | عنيزة — Unaizah Hospital | https://oracle-unaizah.elfadil.com | /prod | /prod/faces/Login.jsf | 🟡 Tunnel active, port TBD |
| khamis | خميس — Khamis Mushait | https://oracle-khamis.elfadil.com | /prod | /prod/faces/Login.jsf | 🟡 Tunnel active, port TBD |
| jizan | جيزان — Jizan General | https://oracle-jizan.elfadil.com | /prod | /prod/faces/Login.jsf | 🟡 Tunnel active, 502 on :80 |
| abha | أبها — Abha General | https://oracle-abha.elfadil.com | /Oasis | /Oasis/faces/Login.jsf | 🟡 Tunnel active, port TBD |

---

## Oracle OASIS Navigation Tree

Based on standard Oracle OASIS Plus (Healthcare ERP) structure:

### Main Menu Structure
```
Home (Dashboard)
├── 👤 Patient Administration
│   ├── Patient Registration
│   ├── Patient Search
│   ├── MRN Management
│   └── Patient Demographics
│
├── 📅 Appointments & Scheduling
│   ├── Appointment Book
│   ├── Available Slots
│   ├── Provider Schedule
│   ├── Walk-in Registration
│   └── Appointment Reports
│
├── 🧪 Laboratory
│   ├── Lab Orders
│   ├── Lab Results
│   ├── Lab Reports
│   ├── Sample Tracking
│   └── Lab Worklist
│
├── 📷 Radiology
│   ├── Radiology Orders
│   ├── Radiology Reports
│   ├── Image Viewer (PACS)
│   ├── Modality Worklist
│   └── Radiology Reports
│
├── 📋 Clinical Documentation
│   ├── Discharge Summaries
│   ├── Clinical Notes
│   ├── Prescriptions
│   ├── Referrals
│   └── Consent Forms
│
├── 💰 Billing & Claims
│   ├── Patient Billing
│   ├── Insurance Claims
│   ├── Claim Submission (NPHIES)
│   ├── Claim Status
│   ├── Payment Collection
│   └── Financial Reports
│
├── 💊 Pharmacy
│   ├── Medication Orders
│   ├── Drug Dispensing
│   ├── Inventory
│   └── Pharmacy Reports
│
├── 🏥 Inpatient
│   ├── Admissions
│   ├── Ward Management
│   ├── Bed Management
│   └── Discharge Processing
│
├── 🚪 Outpatient
│   ├── OPD Registration
│   ├── OPD Visits
│   └── OPD Reports
│
├── 📊 Reports & Analytics
│   ├── Clinical Reports
│   ├── Financial Reports
│   ├── Operational Reports
│   └── Custom Reports
│
└── ⚙️ Administration
    ├── User Management
    ├── System Configuration
    └── Audit Logs
```

---

## Known Page URLs (JSF/ADF)

### Login & Authentication
```
GET  /prod/faces/Login.jsf          → Login page (riyadh/unaizah/khamis/jizan)
GET  /Oasis/faces/Login.jsf         → Login page (madinah/abha)
POST → Submit credentials with ViewState
```

### Patient Search
```
GET  /prod/faces/patient/PatientSearch.jsf?mrn={mrn}
GET  /prod/faces/patient/PatientRegistration.jsf
GET  /prod/faces/patient/PatientDemographics.jsf?mrn={mrn}
```

### Appointments
```
GET  /prod/faces/scheduler/AppointmentBook.jsf
GET  /prod/faces/scheduler/BookAppointment.jsf?specialty={code}&date={yyyy-MM-dd}
GET  /prod/faces/scheduler/ProviderSchedule.jsf?providerId={id}
POST → Book with ViewState + form fields
```

### Laboratory
```
GET  /prod/faces/laboratory/LabResults.jsf?mrn={mrn}
GET  /prod/faces/laboratory/LabResultDetail.jsf?id={labId}
GET  /prod/faces/laboratory/LabOrders.jsf?mrn={mrn}
GET  /prod/faces/laboratory/LabWorklist.jsf
```

### Radiology
```
GET  /prod/faces/radiology/RadiologyReports.jsf?mrn={mrn}
GET  /prod/faces/radiology/RadiologyReport.jsf?id={studyId}
GET  /prod/faces/radiology/RadiologyOrders.jsf?mrn={mrn}
```

### Documents
```
GET  /prod/faces/documents/PatientDocuments.jsf?mrn={mrn}
GET  /prod/faces/documents/DownloadDocument.jsf?id={docId}
GET  /prod/faces/documents/DischargeSummary.jsf?mrn={mrn}
GET  /prod/faces/documents/Prescriptions.jsf?mrn={mrn}
```

### Claims & Billing
```
GET  /prod/faces/claims/PatientClaims.jsf?mrn={mrn}
GET  /prod/faces/claims/SubmitClaim.jsf
GET  /prod/faces/claims/ClaimStatus.jsf?claimNo={claimNo}
GET  /prod/faces/claims/NPHIESSubmit.jsf
POST → Submit claim with ViewState + form fields
```

---

## Oracle ADF/JSF Form Submission Pattern

### Standard Login Flow
```
1. GET /prod/faces/Login.jsf
   → Extract: javax.faces.ViewState, form ID, cookies

2. POST /prod/faces/Login.jsf
   Headers:
     Content-Type: application/x-www-form-urlencoded
     Cookie: <from step 1>
     Referer: <login URL>
   
   Body:
     javax.faces.ViewState=<extracted>
     <formId>:userName=U36113
     <formId>:password=U36113
     <formId>:LoginButton=Login
     javax.faces.partial.ajax=false

3. Response: 302 redirect → Home page with JSESSIONID cookie
```

### Standard Data Page Flow
```
1. GET /prod/faces/{module}/{Page}.jsf?mrn={mrn}
   → Extract: ViewState, form ID, cookies

2. POST (for search/filter)
   Body:
     javax.faces.ViewState=<extracted>
     <formId>:mrnInput={mrn}
     <formId>:searchButton=Search
     javax.faces.partial.ajax=true
     javax.faces.partial.execute=@all
     javax.faces.partial.render={resultPanelId}

3. Response: Partial HTML update or full page with data table
```

---

## REST API Endpoints (If Available)

Oracle OASIS Plus may expose REST APIs at:
```
GET  /prod/api/v1/patient/search?mrn={mrn}
GET  /prod/api/v1/patient/{mrn}/appointments
GET  /prod/api/v1/scheduler/slots?specialty={code}&date={date}
GET  /prod/api/v1/laboratory/results?mrn={mrn}
GET  /prod/api/v1/radiology/reports?mrn={mrn}
GET  /prod/api/v1/documents?mrn={mrn}
GET  /prod/api/v1/claims?mrn={mrn}
POST /prod/api/v1/claims/submit
```

**Note:** These are speculative — the oracle-bridge tries REST first, falls back to JSF scraping.

---

## BSMA Voice Tool → Oracle Bridge Mapping

| BSMA Voice Tool | Oracle Bridge Endpoint | Oracle OASIS Page |
|---|---|---|
| `search_patient` | `GET /patient/search?hospital=...&national_id=...` | Patient Search page |
| `list_appointments` | `GET /appointments?patient_id=...&hospital=...` | Appointment Book |
| `get_available_slots` | `GET /appointments/slots?specialty=...&date=...&hospital=...` | Book Appointment |
| `book_appointment` | `POST /appointments` | Book Appointment → Confirm |
| `cancel_appointment` | `DELETE /appointments/{id}` | Appointment Book → Cancel |
| `get_lab_results` | `GET /labs?patient_id=...&hospital=...` | Lab Results page |
| `get_radiology_reports` | `GET /radiology?patient_id=...&hospital=...` | Radiology Reports page |
| `get_patient_documents` | `GET /documents?patient_id=...&hospital=...` | Patient Documents |
| `get_patient_claims` | `GET /claims?patient_id=...&hospital=...` | Patient Claims |
| `submit_claim` | `POST /claims/submit` | Submit Claim → NPHIES |
| `get_claim_status` | `GET /claims/{id}/status` | Claim Status |

---

## Known Oracle Server IPs

| Hospital | Backend IP | Access Method | Status |
|---|---|---|---|
| Riyadh | 128.1.1.185 | Direct (noTLSVerify) | 🔴 Down/Unreachable |
| Madinah | 172.25.11.26 | Tailscale via RDS-JAZ | 🟡 Port 80 may be wrong |
| Unaizah | 10.0.100.105 | Tailscale via srv791040 | 🟡 Needs subnet approval |
| Khamis | 172.30.0.77 | Tailscale via srv791040 | 🟡 Needs subnet approval |
| Jizan | 172.17.4.84 | Direct LAN from RDS-JAZ | 🟡 Port 80 refused, try 8080/7001 |
| Abha | 172.19.1.1 | Tailscale via srv791040 | 🟡 Port 80 may be wrong |

### Common Oracle Ports to Try
```
80    — Standard HTTP (default, may be wrong)
443   — HTTPS
8080  — Oracle HTTP Server alternate
7001  — WebLogic Admin Server
7002  — WebLogic Admin Server (SSL)
4443  — Oracle Application Server SSL
9090  — Oracle Application Server
```

---

## Tailscale Subnet Requirements

For oracle-bridge to reach all hospitals via tunnel:

```bash
# On srv791040-1 (100.115.225.12) — already advertising:
172.17.0.0/16  ✅ (jizan)
172.19.0.0/16  ✅ (abha)

# Need to add:
172.25.0.0/16  ❌ (madinah)
172.30.0.0/16  ❌ (khamis)
10.0.0.0/8     ❌ (unaizah)

# Fix command:
sudo tailscale up \
  --advertise-routes=172.17.0.0/16,172.18.0.0/16,172.19.0.0/16,\
172.20.0.0/16,172.21.0.0/16,172.22.0.0/16,\
172.25.0.0/16,172.30.0.0/16,10.0.0.0/8 \
  --accept-routes

# Then approve at: login.tailscale.com/admin → srv791040-1 → Edit route settings
```

---

## Oracle Bridge API Reference

### Base URL
```
https://oracle-bridge.elfadil.com
https://oracle-bridge.brainsait-fadil.workers.dev
```

### Required Headers
```
X-Hospital: riyadh|madinah|unaizah|khamis|jizan|abha
X-API-Key: brainsait-oracle-bridge-2024
```

### Endpoints

#### Health
```
GET /health
→ {"ok":true,"service":"oracle-bridge","version":"2.0.0","ts":...}
```

#### Hospitals
```
GET /hospitals
→ {"hospitals":[{"id":"riyadh","base":"https://oracle-riyadh.elfadil.com","status":"active"},...]}
```

#### Patient Search
```
GET /patient/search?hospital={id}&national_id={id}&mrn={mrn}&name={name}
→ {"patients":[...]}
```

#### Appointments
```
GET  /appointments?hospital={id}&patient_id={mrn}
GET  /appointments/slots?hospital={id}&specialty={code}&date={yyyy-MM-dd}
POST /appointments
     {"hospital":"riyadh","patient_id":"...","specialty":"Cardiology","date":"...","time":"...","reason":"..."}
DELETE /appointments/{appointmentId}
     {"hospital":"riyadh","reason":"Patient requested"}
```

#### Labs
```
GET /labs?hospital={id}&patient_id={mrn}&from={date}&to={date}&limit=20
GET /labs/{labId}?hospital={id}
```

#### Radiology
```
GET /radiology?hospital={id}&patient_id={mrn}&modality=CT&from={date}&to={date}
GET /radiology/{studyId}?hospital={id}
```

#### Documents
```
GET /documents?hospital={id}&patient_id={mrn}&doc_type=discharge_summary
GET /documents/{docId}/download?hospital={id}
```

#### Claims
```
GET  /claims?hospital={id}&patient_id={mrn}&status=pending
POST /claims/submit
     {"hospital":"riyadh","patient_id":"...","service_date":"...","service_codes":["99213"],"diagnosis_codes":["J06.9"],"total_amount":500}
GET  /claims/{claimId}/status?hospital={id}
POST /claims/globemed
     {"hospital":"riyadh","claim_data":{...}}
```

---

## Next Actions

1. **Port Discovery** — Find correct Oracle ports for jizan/abha/madinah
2. **Tailscale Subnets** — Approve 3 missing subnets on srv791040-1
3. **Riyadh Backend** — Check if 128.1.1.185 is back online
4. **Login Test** — Once a hospital is reachable, test full login flow
5. **Navigation Refinement** — Update paths based on actual page structure from screenshots
