# 🏥 COMPLIANCELINC — BrainSAIT Healthcare Control Tower

<div align="center">

```
  ██████╗ ██████╗  █████╗ ██╗███╗   ██╗███████╗ █████╗ ██╗████████╗
  ██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║██╔════╝██╔══██╗██║╚══██╔══╝
  ██████╔╝██████╔╝███████║██║██╔██╗ ██║███████╗███████║██║   ██║
  ██╔══██╗██╔══██╗██╔══██║██║██║╚██╗██║╚════██║██╔══██║██║   ██║
  ██████╔╝██║  ██║██║  ██║██║██║ ╚████║███████║██║  ██║██║   ██║
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝   ╚═╝
```

**AI-Powered Healthcare Claims Intelligence for Saudi Arabia**

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![NPHIES](https://img.shields.io/badge/NPHIES-Integrated-00a651)](https://nphies.sa)
[![FHIR R4](https://img.shields.io/badge/FHIR-R4-e8734a)](https://hl7.org/fhir/R4/)
[![Node.js Compat](https://img.shields.io/badge/Node.js-Compat-339933?logo=node.js&logoColor=white)](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](./LICENSE)

*Connecting 6 hospital branches · Processing insurance claims · Protecting patient revenue in real-time*

</div>

---

## 🌐 Live Services

| Service | URL | Purpose |
|---------|-----|---------|
| **Control Tower** | [portals.elfadil.com](https://portals.elfadil.com) | Leadership dashboard + API gateway |
| **Claim Scanner** | [oracle-scanner.elfadil.com](https://oracle-scanner.elfadil.com) | Oracle Oasis+ browser automation |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLIANCELINC Platform                          │
│                    ───────────────────────                          │
│                                                                     │
│  Layer 4 ─ Control Tower Dashboard (portals.elfadil.com)           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  BrainSAIT Portals Worker (brainsait-portals)                │  │
│  │  • Real-time hospital health probes (every 5 min)            │  │
│  │  • Claims snapshot + action queue                            │  │
│  │  • Runbook automation (8 operational runbooks)               │  │
│  └───────────────────────┬──────────────────────────────────────┘  │
│                          │ Service Binding                          │
│  Layer 3 ─ Intelligence  ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Oracle Claim Scanner (oracle-claim-scanner)                 │  │
│  │  • Puppeteer Browser Rendering on Cloudflare                 │  │
│  │  • Multi-hospital Oracle Oasis+ automation                   │  │
│  │  • KV session + result caching (8h / 24h TTL)               │  │
│  └───────────────────────┬──────────────────────────────────────┘  │
│                          │ Cloudflare Zero Trust Tunnel             │
│  Layer 2 ─ Integration   ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  FHIR Adapter · SBS Bridge · NPHIES Gateway                 │  │
│  │  Tunnel 2cffb7bf-983e-4835-acc1-3a417a27018f                │  │
│  └───────────────────────┬──────────────────────────────────────┘  │
│                          │ Private LAN                              │
│  Layer 1 ─ Hospital ERP  ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Oracle Oasis+ (6 branches) · No open ports · Zero Trust    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🏥 Hospital Branch Registry

| Branch | Subdomain | Region | Login Path | TLS | Probe |
|--------|-----------|--------|-----------|-----|-------|
| **الرياض** Riyadh | `oracle-riyadh.elfadil.com` | Riyadh | `/prod/faces/Home` | ✅ HTTPS | 8s |
| **المدينة** Madinah | `oracle-madinah.elfadil.com` | Madinah | `/Oasis/faces/Login.jsf` | — | 8s |
| **عنيزة** Unaizah | `oracle-unaizah.elfadil.com` | Qassim | `/prod/faces/Login.jsf` | — | 8s |
| **خميس** Khamis Mushait | `oracle-khamis.elfadil.com` | Asir | `/prod/faces/Login.jsf` | — | 8s |
| **جازان** Jizan | `oracle-jizan.elfadil.com` | Jizan | `/prod/faces/Login.jsf` | — | 12s |
| **أبها** Abha | `oracle-abha.elfadil.com` | Asir | `/Oasis/faces/Home` | — | 8s |

> **Note:** Jizan uses a 12-second probe timeout to avoid false-offline readings on this slower WAN path.

---

## 🛰️ API Reference

### Control Tower — `portals.elfadil.com`

#### Public Endpoints (no authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Interactive control tower dashboard (HTML) |
| `GET` | `/health` | Liveness probe — returns `200 OK` |
| `GET` | `/api/health` | JSON health status of all 6 branches |
| `GET` | `/api/health/:branch` | JSON health status of one branch |
| `GET` | `/api/branches` | Branch registry (URL + config, no credentials) |
| `GET` | `/api/runbooks` | Operational runbook index |
| `GET` | `/api/runbooks/:id` | Runbook detail (steps + escalation) |
| `GET` | `/runbooks/:id` | Operator-facing runbook HTML page |
| `OPTIONS` | `/*` | CORS preflight |

#### Protected Endpoints (require `X-API-Key` header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/control-tower` | Combined snapshot: hospitals + services + claims |
| `GET/POST` | `/api/scan/:branch` | Proxy to oracle-claim-scanner Worker |

---

### Claim Scanner — `oracle-scanner.elfadil.com`

#### Public Endpoints (no authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Worker liveness probe |
| `GET` | `/control-tower/claims` | Latest claims data for dashboard |

#### Protected Endpoints (require `Authorization: Bearer <key>` or `?key=`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/hospitals` | List all configured hospital connections |
| `POST` | `/scan` | Trigger a claim scan on a single hospital |
| `POST` | `/scan-batch` | Trigger a batch scan (multiple claims) |
| `GET` | `/results/:id` | Retrieve cached scan result from KV |
| `DELETE` | `/results/:id` | Delete a scan result from KV |
| `GET` | `/sessions` | List active browser sessions |

---

## ⚙️ Worker Configurations

### `oracle-claim-scanner` (Root `wrangler.toml`)

```toml
name             = "oracle-claim-scanner"
main             = "src/index.js"
compatibility_date  = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[[routes]]
pattern   = "oracle-scanner.elfadil.com/*"
zone_name = "elfadil.com"

[browser]               # Puppeteer Browser Rendering binding
binding = "BROWSER"

[[kv_namespaces]]       # Session cookie store (8h TTL)
binding = "SESSIONS"

[[kv_namespaces]]       # Scan results store (24h TTL)
binding = "RESULTS"
```

### `brainsait-portals` (`infra-v3/portals-worker/wrangler.toml`)

```toml
name = "brainsait-portals"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[routes]]
pattern   = "portals.elfadil.com/*"
zone_name = "elfadil.com"

[[kv_namespaces]]        # Health cache KV
binding = "PORTAL_KV"

[triggers]
crons = ["*/5 * * * *"]  # Health probe every 5 minutes

[[services]]             # Service binding to scanner Worker
binding  = "SCANNER_SERVICE"
service  = "oracle-claim-scanner"
```

---

## 🚀 Deployment

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) v4.x
- Cloudflare account with Browser Rendering enabled
- Access to `elfadil.com` DNS zone

### 1 — Oracle Claim Scanner

```bash
# Set secrets (run once per environment)
wrangler secret put API_KEY
wrangler secret put ORACLE_USER          # shared fallback
wrangler secret put ORACLE_PASS          # shared fallback
wrangler secret put ORACLE_USER_RIYADH   # per-hospital override
wrangler secret put ORACLE_PASS_RIYADH

# Create KV namespaces (first time only)
wrangler kv namespace create "ORACLE_SESSIONS"
wrangler kv namespace create "ORACLE_RESULTS"
# Update the KV IDs in wrangler.toml with the returned values

# Deploy
wrangler deploy

# Verify
curl https://oracle-scanner.elfadil.com/health
```

### 2 — BrainSAIT Portals

```bash
cd infra-v3/portals-worker

# Set secrets
wrangler secret put API_KEY

# Create KV namespace (first time only)
wrangler kv namespace create "PORTAL_HEALTH"
# Update the KV ID in wrangler.toml

# Deploy
wrangler deploy

# Verify
curl https://portals.elfadil.com/health
curl https://portals.elfadil.com/api/health
curl https://portals.elfadil.com/api/branches
```

### 3 — Per-Hospital Credentials (optional)

Per-hospital credentials override the shared fallback `ORACLE_USER` / `ORACLE_PASS`:

```bash
# Suffix is the hospital ID in UPPERCASE
wrangler secret put ORACLE_USER_MADINAH
wrangler secret put ORACLE_PASS_MADINAH
wrangler secret put ORACLE_USER_UNAIZAH
wrangler secret put ORACLE_PASS_UNAIZAH
wrangler secret put ORACLE_USER_KHAMIS
wrangler secret put ORACLE_PASS_KHAMIS
wrangler secret put ORACLE_USER_JIZAN
wrangler secret put ORACLE_PASS_JIZAN
wrangler secret put ORACLE_USER_ABHA
wrangler secret put ORACLE_PASS_ABHA
```

---

## 🛡️ Security

| Layer | Control | Status |
|-------|---------|--------|
| **Network** | All hospital backends are private LAN IPs — zero open ports | ✅ |
| **Ingress** | Cloudflare Zero Trust Tunnel is the only ingress path | ✅ |
| **DNS** | Real IPs never appear in DNS or HTTP headers | ✅ |
| **API** | Bearer token / query-param key on all non-public endpoints | ✅ |
| **CORS** | `OPTIONS` preflight returns explicit allow-list headers | ✅ |
| **Secrets** | All credentials stored as Wrangler secrets — never in source | ✅ |
| **TLS** | Cloudflare terminates TLS; oracle-riyadh uses `No TLS Verify` + origin SNI | ✅ |
| **Sessions** | Browser sessions stored in KV with 8-hour TTL | ✅ |

### Recommended Next Steps

- **Cloudflare Access**: Protect `oracle-*.elfadil.com` with Zero Trust SSO (email OTP)
- **Rate Limiting**: Add Cloudflare Rate Limiting rules on public scanner endpoints
- **Logpush**: Enable Cloudflare Logpush → SIEM to capture Worker errors and offline alerts
- **Tunnel Token Rotation**: Rotate the Zero Trust tunnel install token periodically

---

## 📊 Operational Runbooks

| Runbook ID | Title | Owner |
|------------|-------|-------|
| `hospital-connectivity` | Restore hospital portal connectivity | Infrastructure Agent |
| `hospital-latency` | Reduce hospital portal latency | Infrastructure Agent |
| `external-service-availability` | Handle external healthcare service outage | Integration Gateway |
| `external-service-latency` | Monitor degraded external service | Integration Gateway |
| `nphies-availability` | Stabilize NPHIES availability | Claims Agent |
| `claims-recode-96092` | Clear 96092-ERR blocker claims | Claims Coding |
| `claims-deadline-submission` | Move ready claims before appeal deadline | Revenue Recovery |
| `claims-prior-auth` | Work the prior authorization appeal queue | Claims Agent |
| `scanner-http-404` | Repair Oracle scan batch HTTP 404 failures | Integration Gateway |

Access runbooks via the dashboard at `portals.elfadil.com/runbooks/:id` or via the JSON API at `/api/runbooks/:id`.

---

## 🤖 AI Agent Blueprint

| Agent | Mission |
|-------|---------|
| **Clinical Agent** | Summarize records and flag abnormal patterns across encounters and labs |
| **Claims Agent** | Watch NPHIES throughput, detect coding errors, surface delayed claims |
| **Infrastructure Agent** | Monitor tunnel health, latency, and service availability |
| **Compliance Agent** | Enforce FHIR, NPHIES, and Saudi healthcare policy alignment |

---

## 📦 Repository Layout

```
oracle-setup/
├── src/
│   └── index.js                  # oracle-claim-scanner Worker (Puppeteer)
├── infra-v3/
│   └── portals-worker/
│       ├── src/index.js          # brainsait-portals Worker (Control Tower)
│       ├── wrangler.toml         # Portals Worker config
│       └── SETUP_GUIDE.md        # Zero Trust + tunnel setup guide
├── packages/
│   └── fhir/                     # FHIR R4 bundle builder + validator (Python)
├── fhir-integration/
│   └── index.mjs                 # FHIR integration entry point
├── sbs-integration/              # SBS catalogue + SNOMED map
├── uhh-integration/              # TypeScript FHIR client (UHH)
├── tests/
│   └── complete-interface-test.mjs  # End-to-end interface test suite (160 tests)
├── wrangler.toml                 # Scanner Worker config
└── README.md                     # This file
```

---

## 🧪 Testing

```bash
# Run the full interface test suite (160 tests across 8 interfaces)
node tests/complete-interface-test.mjs

# Run a dry-run scan for a specific batch
node dry-run-nphies-checklist.mjs

# Tail live Worker logs
wrangler tail oracle-claim-scanner
wrangler tail brainsait-portals
```

### Test Coverage

| Interface | Tests | Description |
|-----------|-------|-------------|
| 1 — Patient → BSMA | ~18 | Patient registration and eligibility |
| 2 — Provider → GIVC | ~20 | Provider claim submission |
| 3 — Provider → Oracle Oasis+ | ~15 | Oracle ERP integration |
| 4 — Payer → SBS | ~25 | SBS catalogue mapping |
| 5 — Payer → Oracle Worker | ~15 | Scanner Worker e2e |
| 6 — Payer → NPHIES | ~25 | NPHIES gateway |
| 7 — Payer → Etimad | ~20 | Etimad payment flow |
| Cross-Interface — Pipeline | ~22 | End-to-end claim pipeline |
| **Total** | **160** | All passing ✅ |

---

## 🔗 External Integrations

| System | URL | Provider |
|--------|-----|---------|
| **MOH Claims Portal** | `moh-claims.elfadil.com` | GlobeMed Saudi Arabia |
| **MOH Approval Portal** | `moh-approval.elfadil.com` | Ministry of Health |
| **NPHIES** | `nphies.sa` | National Health Insurance Exchange |

---

<div align="center">

Built with ❤️ by **BrainSAIT** · Powered by **Cloudflare Workers** · Compliant with **NPHIES** & **FHIR R4**

*Hayat National Hospital Network — Kingdom of Saudi Arabia 🇸🇦*

</div>
