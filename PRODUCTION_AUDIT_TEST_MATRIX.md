# Portals Production Audit – Test Matrix (Holistic)

**Target:** https://portals.elfadil.com
**Worker:** brainsait-portals
**Date:** March 26, 2026
**Purpose:** Comprehensive black-box testing checklist for live production validation

---

## Test Categories

1. [API Endpoint Testing](#1-api-endpoint-testing)
2. [UI/UX Functional Testing](#2-uiux-functional-testing)
3. [Security Testing](#3-security-testing)
4. [Performance Testing](#4-performance-testing)
5. [Error Handling Testing](#5-error-handling-testing)
6. [Integration Testing](#6-integration-testing)
7. [Browser Compatibility Testing](#7-browser-compatibility-testing)

---

## 1. API Endpoint Testing

### 1.1 Liveness Probe

| Test ID | Endpoint | Method | Expected Status | Expected Response | Pass/Fail | Notes |
|---------|----------|--------|----------------|-------------------|-----------|-------|
| API-01 | `/health` | GET | 200 | Text: "ok" | ⬜ | Basic liveness check |
| API-02 | `/health` | POST | 200 | Text: "ok" | ⬜ | Method not validated (accepts any method) |

**Test Commands:**
```bash
# API-01
curl -i https://portals.elfadil.com/health

# API-02
curl -i -X POST https://portals.elfadil.com/health
```

### 1.2 Control Tower Snapshot

| Test ID | Endpoint | Method | Expected Status | Expected Response | Pass/Fail | Notes |
|---------|----------|--------|----------------|-------------------|-----------|-------|
| API-03 | `/api/control-tower` | GET | 200 | JSON with `timestamp`, `summary`, `hospitals`, `externalServices`, `claims`, `priorityActions` | ⬜ | Main data endpoint |
| API-04 | `/api/control-tower?ts=123` | GET | 200 | Same as API-03 | ⬜ | Cache-busting query param |
| API-05 | `/api/control-tower` | GET | 200 | JSON includes `summary.hospitals.availabilityPct` | ⬜ | Availability calculation |
| API-06 | `/api/control-tower` | GET | 200 | JSON includes `summary.overall.avgLatencyMs` | ⬜ | Latency aggregation |

**Test Commands:**
```bash
# API-03
curl https://portals.elfadil.com/api/control-tower | jq '.timestamp, .summary'

# API-04
curl https://portals.elfadil.com/api/control-tower?ts=$(date +%s) | jq '.meta'

# API-05
curl https://portals.elfadil.com/api/control-tower | jq '.summary.hospitals.availabilityPct'

# API-06
curl https://portals.elfadil.com/api/control-tower | jq '.summary.overall.avgLatencyMs'
```

### 1.3 Health Endpoints

| Test ID | Endpoint | Method | Expected Status | Expected Response | Pass/Fail | Notes |
|---------|----------|--------|----------------|-------------------|-----------|-------|
| API-07 | `/api/health` | GET | 200 | JSON with `summary` and `branches` (all 6 hospitals) | ⬜ | All branches health |
| API-08 | `/api/health/riyadh` | GET | 200 | JSON with `online`, `status`, `latency`, `url` for Riyadh | ⬜ | Single branch probe |
| API-09 | `/api/health/madinah` | GET | 200 | JSON for Madinah | ⬜ | Test Madinah branch |
| API-10 | `/api/health/unaizah` | GET | 200 | JSON for Unaizah | ⬜ | Test Unaizah branch |
| API-11 | `/api/health/khamis` | GET | 200 | JSON for Khamis | ⬜ | Test Khamis branch |
| API-12 | `/api/health/jizan` | GET | 200 | JSON for Jizan | ⬜ | Test Jizan branch (12s timeout) |
| API-13 | `/api/health/abha` | GET | 200 | JSON for Abha | ⬜ | Test Abha branch |
| API-14 | `/api/health/invalid` | GET | 404 | JSON with error | ⬜ | Invalid branch ID |

**Test Commands:**
```bash
# API-07
curl https://portals.elfadil.com/api/health | jq '.summary, .branches | keys'

# API-08 to API-13
for branch in riyadh madinah unaizah khamis jizan abha; do
  echo "Testing $branch..."
  curl https://portals.elfadil.com/api/health/$branch | jq '.online, .latency'
done

# API-14
curl https://portals.elfadil.com/api/health/invalid | jq '.'
```

### 1.4 Branches Configuration

| Test ID | Endpoint | Method | Expected Status | Expected Response | Pass/Fail | Notes |
|---------|----------|--------|----------------|-------------------|-----------|-------|
| API-15 | `/api/branches` | GET | 200 | JSON array with 6 hospitals | ⬜ | Branch config endpoint |
| API-16 | `/api/branches` | GET | 200 | JSON includes `backendHost` field | ⬜ | ⚠️ Security issue: exposes backend IPs |
| API-17 | `/api/branches` | GET | 200 | JSON includes correct subdomain for each branch | ⬜ | Subdomain validation |

**Test Commands:**
```bash
# API-15
curl https://portals.elfadil.com/api/branches | jq 'length'

# API-16 (Security check - should NOT expose backend IPs)
curl https://portals.elfadil.com/api/branches | jq '.[].backendHost'

# API-17
curl https://portals.elfadil.com/api/branches | jq '.[].subdomain'
```

### 1.5 Runbooks

| Test ID | Endpoint | Method | Expected Status | Expected Response | Pass/Fail | Notes |
|---------|----------|--------|----------------|-------------------|-----------|-------|
| API-18 | `/api/runbooks` | GET | 200 | JSON object with 8 runbook IDs | ⬜ | Runbooks index |
| API-19 | `/api/runbooks/hospital-connectivity` | GET | 200 | JSON runbook object | ⬜ | Connectivity runbook |
| API-20 | `/api/runbooks/hospital-latency` | GET | 200 | JSON runbook object | ⬜ | Latency runbook |
| API-21 | `/api/runbooks/claims-recode-96092` | GET | 200 | JSON runbook object | ⬜ | Claims recode runbook |
| API-22 | `/api/runbooks/invalid-runbook` | GET | 404 | JSON error: "Unknown runbook" | ⬜ | Invalid runbook ID |
| API-23 | `/runbooks/hospital-connectivity` | GET | 200 | HTML page with runbook content | ⬜ | HTML runbook page |
| API-24 | `/runbooks/invalid-runbook` | GET | 404 | HTML 404 page | ⬜ | Invalid runbook HTML |

**Test Commands:**
```bash
# API-18
curl https://portals.elfadil.com/api/runbooks | jq 'keys'

# API-19 to API-21
for rb in hospital-connectivity hospital-latency claims-recode-96092; do
  echo "Testing $rb..."
  curl https://portals.elfadil.com/api/runbooks/$rb | jq '.id, .title'
done

# API-22
curl https://portals.elfadil.com/api/runbooks/invalid-runbook | jq '.'

# API-23
curl https://portals.elfadil.com/runbooks/hospital-connectivity | grep "<h1>"

# API-24
curl -i https://portals.elfadil.com/runbooks/invalid-runbook | head -10
```

---

## 2. UI/UX Functional Testing

### 2.1 Dashboard Page Load

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| UI-01 | Main page | Navigate to https://portals.elfadil.com | Page loads with dashboard HTML | ⬜ | Initial page load |
| UI-02 | Dashboard title | Check page title | Shows "BrainSAIT Healthcare Control Tower" | ⬜ | Title verification |
| UI-03 | Summary stats | Check hero section | Shows 4 stat cards (availability, latency, endpoints, actions) | ⬜ | Hero section render |
| UI-04 | Refresh countdown | Wait 5 seconds | Countdown timer decrements | ⬜ | Auto-refresh countdown |
| UI-05 | Initial snapshot | Check browser console | Initial snapshot embedded in `<script>` tag | ⬜ | Server-side render |

**Test Steps:**
```
1. Open https://portals.elfadil.com in Chrome
2. Open DevTools (F12) → Console tab
3. Verify page loads without JavaScript errors
4. Check Network tab for /api/control-tower request (should auto-fire on DOMContentLoaded)
5. Verify countdown timer shows "Next refresh in X seconds"
```

### 2.2 Hospital Search

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| UI-06 | Search box | Type "riyadh" in search box | Only Riyadh hospital card visible | ⬜ | Case-insensitive search |
| UI-07 | Search box | Type "الرياض" (Arabic) | Only Riyadh hospital card visible | ⬜ | Arabic text search |
| UI-08 | Search box | Type "128.1.1.185" (backend IP) | Riyadh hospital card visible | ⬜ | Backend host search |
| UI-09 | Search box | Type "oracle-madinah" (subdomain) | Only Madinah hospital card visible | ⬜ | Subdomain search |
| UI-10 | Search box | Clear search | All 6 hospitals visible again | ⬜ | Search reset |
| UI-11 | Search box | Type "xyz123" (no match) | No hospitals visible, "0 hospitals" count | ⬜ | Empty search result |

**Test Steps:**
```
1. Locate search box with placeholder text (likely "Search hospitals...")
2. Test each search term above
3. Verify visible hospital count updates
4. Check that card filtering is instant (no API call)
```

### 2.3 Filter Pills

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| UI-12 | Filter: All | Click "All" pill | All 6 hospitals visible | ⬜ | Default filter |
| UI-13 | Filter: Stable | Click "Stable" pill | Only hospitals with tone="stable" visible | ⬜ | Stable filter |
| UI-14 | Filter: Watch | Click "Watch" pill | Only hospitals with tone="watch" visible (latency > 5s) | ⬜ | Degraded filter |
| UI-15 | Filter: Critical | Click "Critical" pill | Only hospitals with tone="critical" visible (offline) | ⬜ | Offline filter |
| UI-16 | Filter visual | Check active filter | Active pill has different background color | ⬜ | Visual feedback |
| UI-17 | Filter + search | Set filter "Stable", search "riyadh" | Only Riyadh shown (if stable) | ⬜ | Combined filters |

**Test Steps:**
```
1. Locate 4 filter pills (likely labeled: All, Stable, Watch, Critical)
2. Click each pill and verify hospital list updates
3. Check active pill has visual highlight
4. Combine search + filter to test both work together
```

### 2.4 Refresh Mechanism

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| UI-18 | Refresh button | Click "Refresh live data" button | Button text changes to "Refreshing..." | ⬜ | Loading state |
| UI-19 | Refresh button | Wait for refresh to complete | Button returns to "Refresh live data" | ⬜ | Ready state |
| UI-20 | Refresh button | Check Network tab | New GET /api/control-tower request visible | ⬜ | API call verification |
| UI-21 | Countdown timer | After refresh, check timer | Timer resets to 60 seconds | ⬜ | Countdown reset |
| UI-22 | Auto-refresh | Wait 60 seconds | Automatic refresh triggers (no user action) | ⬜ | Auto-refresh interval |
| UI-23 | Snapshot update | Compare timestamp before/after refresh | Timestamp updates to current time | ⬜ | Data freshness |

**Test Steps:**
```
1. Click refresh button
2. Watch Network tab for /api/control-tower?ts=... request
3. Verify button shows loading state
4. Wait for countdown to reach 0
5. Verify automatic refresh happens
```

### 2.5 Hospital Cards

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| UI-24 | Hospital card | View Riyadh hospital card | Shows: name (EN/AR), region, status, latency, subdomain | ⬜ | Card content |
| UI-25 | Hospital card | Check Riyadh status | Shows "Stable" or "Online" tone chip | ⬜ | Status chip |
| UI-26 | Hospital card | Check latency | Latency displayed in milliseconds (e.g., "287ms") | ⬜ | Latency metric |
| UI-27 | Hospital card | Check HTTP status | Shows HTTP status code (e.g., "200") | ⬜ | HTTP status |
| UI-28 | Portal link | Click "Open Oracle Portal" link on Riyadh card | Opens https://oracle-riyadh.elfadil.com/prod/faces/Home in new tab | ⬜ | Link navigation |
| UI-29 | Offline card | If hospital offline, check card | Shows "Critical" tone, error message, no portal link | ⬜ | Offline state |

**Test Steps:**
```
1. Inspect each of 6 hospital cards
2. Verify all data fields present
3. Click "Open Oracle Portal" link (if online)
4. Verify opens correct Oracle URL in new tab
5. Simulate offline state (if possible) or check codebase for offline rendering
```

### 2.6 External Services Cards

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| UI-30 | MOH Claims card | View moh-claims service card | Shows name (EN/AR), description, provider, status, latency | ⬜ | Service card |
| UI-31 | MOH Approval card | View moh-approval service card | Shows name, description, status | ⬜ | Service card |
| UI-32 | NPHIES card | View NPHIES service card | Shows name, description, status | ⬜ | Service card |
| UI-33 | Service link | Click link on MOH Claims card | Opens https://moh-claims.elfadil.com in new tab | ⬜ | External link |

**Test Steps:**
```
1. Scroll to external services section
2. Verify 3 service cards visible
3. Click link on each service card
4. Verify opens correct external URL
```

### 2.7 Claims Summary Cards

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| UI-34 | Claims total | View "Claims in current batch" card | Shows total claim count (e.g., 73) | ⬜ | Claims count |
| UI-35 | Ready claims | View "Ready for submission" card | Shows ready count (e.g., 63) and % ready | ⬜ | Ready percentage |
| UI-36 | Blocked claims | View "Blocked by recode" card | Shows blocker count (e.g., 10) | ⬜ | Blocker count |
| UI-37 | Critical claims | View "Approval-sensitive claims" card | Shows prior-auth count | ⬜ | Critical claims |
| UI-38 | Payer info | Check batch details | Shows payer name (e.g., "Al Rajhi Takaful") | ⬜ | Batch metadata |
| UI-39 | Deadline | Check days remaining | Shows "X days remaining" to appeal deadline | ⬜ | Deadline countdown |

**Test Steps:**
```
1. Scroll to claims command section
2. Verify 8 stat cards visible (4 claims summary + 4 payment recovery)
3. Check values are numeric and make sense
4. Verify payer/provider info displayed
```

### 2.8 Rejection Reason Cards

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| UI-40 | Rejection cards | View rejection reason section | Shows top 5 rejection codes with counts | ⬜ | Top rejections |
| UI-41 | Rejection code | Check BE-1-4 card | Shows count (e.g., 43) and severity (e.g., "high") | ⬜ | Rejection detail |
| UI-42 | Severity color | Check severity badge | Color-coded: critical=red, high=amber, normal=teal | ⬜ | Visual severity |
| UI-43 | Runbook link | Click runbook link on rejection card | Opens relevant runbook (e.g., /runbooks/claims-recode-96092) | ⬜ | Runbook navigation |

**Test Steps:**
```
1. Scroll to rejection reasons section
2. Verify top 5 rejection codes displayed
3. Check severity badges color-coded
4. Click runbook link and verify opens correct runbook
```

### 2.9 Action Queue Cards

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| UI-44 | Action cards | View action queue section | Shows ranked action cards (#1, #2, etc.) | ⬜ | Action ranking |
| UI-45 | Action severity | Check first action | Shows severity badge (critical/high/medium/info) | ⬜ | Severity badge |
| UI-46 | Action title | Check action title | Shows clear action description (e.g., "Restore Riyadh connectivity") | ⬜ | Action title |
| UI-47 | Action owner | Check action owner | Shows owner (e.g., "Infrastructure Agent") | ⬜ | Owner field |
| UI-48 | Runbook link | Click runbook link on action card | Opens relevant runbook page | ⬜ | Runbook navigation |
| UI-49 | Escalation link | Click escalation link | Opens runbook with #escalation anchor | ⬜ | Anchor navigation |
| UI-50 | All clear | If no actions, check state | Shows "No urgent actions in queue" with info severity | ⬜ | Empty state |

**Test Steps:**
```
1. Scroll to action queue section
2. Verify actions ranked by severity (critical first)
3. Check all metadata fields present (rank, severity, title, owner, target)
4. Click runbook and escalation links
5. Verify anchor navigation works
```

---

## 3. Security Testing

### 3.1 Authentication Testing

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| SEC-01 | /api/control-tower | Request without auth header | ⚠️ Currently: 200 OK. Should: 401 Unauthorized | ⬜ | ❌ No auth required |
| SEC-02 | /api/branches | Request without auth header | ⚠️ Currently: 200 OK. Should: 401 Unauthorized | ⬜ | ❌ No auth required |
| SEC-03 | /api/health | Request without auth header | ⚠️ Currently: 200 OK. Should: 401 Unauthorized | ⬜ | ❌ No auth required |
| SEC-04 | /api/runbooks | Request without auth header | ⚠️ Currently: 200 OK. Should: 401 Unauthorized | ⬜ | ❌ No auth required |
| SEC-05 | /api/control-tower | Request with invalid API key | ⚠️ Currently: 200 OK. Should: 403 Forbidden | ⬜ | ❌ No validation |

**Test Commands:**
```bash
# SEC-01 to SEC-04 (should all return 401 but currently return 200)
curl -i https://portals.elfadil.com/api/control-tower | grep "HTTP"
curl -i https://portals.elfadil.com/api/branches | grep "HTTP"
curl -i https://portals.elfadil.com/api/health | grep "HTTP"
curl -i https://portals.elfadil.com/api/runbooks | grep "HTTP"

# SEC-05 (invalid API key test - currently no validation)
curl -i -H "Authorization: Bearer invalid-key-123" https://portals.elfadil.com/api/health
```

### 3.2 CORS Testing

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| SEC-06 | CORS headers | Check /api/health response | ⚠️ Access-Control-Allow-Origin: * (wide open) | ⬜ | ❌ Security issue |
| SEC-07 | CORS preflight | Send OPTIONS request | Accepts OPTIONS (if implemented) | ⬜ | CORS preflight |
| SEC-08 | Origin header | Request with Origin: https://evil.com | ⚠️ Returns Access-Control-Allow-Origin: * | ⬜ | ❌ Accepts any origin |

**Test Commands:**
```bash
# SEC-06
curl -i https://portals.elfadil.com/api/health | grep "Access-Control-Allow-Origin"

# SEC-07
curl -i -X OPTIONS https://portals.elfadil.com/api/health

# SEC-08
curl -i -H "Origin: https://evil.com" https://portals.elfadil.com/api/health | grep "Access-Control"
```

### 3.3 Data Exposure Testing

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| SEC-09 | Backend IPs | Check /api/branches response | ⚠️ Currently: Exposes IPs (128.1.1.185, 172.x, 10.x). Should: Hidden | ⬜ | ❌ IP exposure |
| SEC-10 | Internal URLs | Check /api/branches response | ⚠️ Currently: Exposes backendHost field. Should: Removed | ⬜ | ❌ Infra exposure |
| SEC-11 | Login paths | Check /api/branches response | Shows loginPath (OK, needed for navigation) | ⬜ | ✅ Acceptable |

**Test Commands:**
```bash
# SEC-09 and SEC-10 (should NOT expose backend IPs)
curl https://portals.elfadil.com/api/branches | jq '.[0].backendHost'
# Expected: field absent or null
# Actual: "https://128.1.1.185" (exposed!)

curl https://portals.elfadil.com/api/branches | jq '.[] | {id, backendHost}'
```

### 3.4 Rate Limiting Testing

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| SEC-12 | Rate limit | Send 100 requests in 10 seconds | ⚠️ Currently: All succeed. Should: Throttled after ~50 | ⬜ | ❌ No rate limit |
| SEC-13 | Burst traffic | Send 1000 concurrent requests | ⚠️ Currently: All succeed. Should: 429 Too Many Requests | ⬜ | ❌ No rate limit |

**Test Commands:**
```bash
# SEC-12 (send 100 requests, all should succeed currently but shouldn't)
for i in {1..100}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://portals.elfadil.com/api/health &
done | sort | uniq -c

# SEC-13 (burst test)
ab -n 1000 -c 100 https://portals.elfadil.com/api/health
# Should see 429 responses after threshold, currently all 200
```

### 3.5 Input Validation Testing

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| SEC-14 | Query params | Send /api/control-tower?ts=<script>alert(1)</script> | ⚠️ Currently: Ignored. Should: Sanitized or rejected | ⬜ | Low risk (not reflected) |
| SEC-15 | URL injection | Send /api/health/../../etc/passwd | Returns 404 or 400 (path traversal blocked) | ⬜ | Path traversal test |

**Test Commands:**
```bash
# SEC-14
curl "https://portals.elfadil.com/api/control-tower?ts=<script>alert(1)</script>" | jq '.timestamp'

# SEC-15
curl -i "https://portals.elfadil.com/api/health/../../etc/passwd" | grep "HTTP"
```

---

## 4. Performance Testing

### 4.1 Response Time Testing

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| PERF-01 | /health | Measure response time | <100ms (P95) | ⬜ | Liveness probe |
| PERF-02 | /api/control-tower | Measure response time | <10s (P95) - includes probes | ⬜ | Full snapshot generation |
| PERF-03 | /api/health | Measure response time | <10s (P95) - includes probes | ⬜ | All branches probe |
| PERF-04 | /api/health/riyadh | Measure response time | <8s (single probe timeout) | ⬜ | Single branch probe |
| PERF-05 | Dashboard HTML | Measure page load time | <2s (First Contentful Paint) | ⬜ | Initial page render |

**Test Commands:**
```bash
# PERF-01
curl -w "@curl-format.txt" -o /dev/null -s https://portals.elfadil.com/health

# PERF-02
time curl -s https://portals.elfadil.com/api/control-tower > /dev/null

# PERF-03
time curl -s https://portals.elfadil.com/api/health > /dev/null

# PERF-04
time curl -s https://portals.elfadil.com/api/health/riyadh > /dev/null

# PERF-05 (use Lighthouse or WebPageTest)
lighthouse https://portals.elfadil.com --only-categories=performance --output=json
```

**curl-format.txt:**
```
time_namelookup:    %{time_namelookup}s\n
time_connect:       %{time_connect}s\n
time_appconnect:    %{time_appconnect}s\n
time_pretransfer:   %{time_pretransfer}s\n
time_starttransfer: %{time_starttransfer}s\n
time_total:         %{time_total}s\n
```

### 4.2 Concurrent Request Testing

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| PERF-06 | Concurrent probes | Send 10 concurrent /api/control-tower requests | All complete in <15s | ⬜ | Worker concurrency |
| PERF-07 | Mixed traffic | Send 50 requests mixed across all endpoints | No 503 errors | ⬜ | Worker stability |

**Test Commands:**
```bash
# PERF-06
time (
  for i in {1..10}; do
    curl -s https://portals.elfadil.com/api/control-tower > /dev/null &
  done
  wait
)

# PERF-07
ab -n 50 -c 10 https://portals.elfadil.com/api/health
```

---

## 5. Error Handling Testing

### 5.1 Network Error Simulation

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| ERR-01 | Offline hospital | If hospital offline, check /api/health | Returns `online: false`, `error: "timeout"` or error message | ⬜ | Offline handling |
| ERR-02 | Dashboard offline state | If hospital offline, check dashboard card | Shows "Critical" tone, error message, no portal link | ⬜ | UI error state |
| ERR-03 | Scanner unavailable | If scanner down, check /api/control-tower | Returns `claims.scanner.liveSystem.available: false` | ⬜ | Scanner fallback |

**Test Steps:**
```
1. Cannot simulate offline hospital in production (risky)
2. Review code for offline rendering logic (already done in audit)
3. Check scanner fallback by temporarily disabling scanner (if allowed)
```

### 5.2 Invalid Input Testing

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| ERR-04 | Invalid branch | GET /api/health/invalid-branch | Returns 404 with JSON error | ⬜ | Invalid branch ID |
| ERR-05 | Invalid runbook | GET /api/runbooks/invalid-runbook | Returns 404 with JSON error: "Unknown runbook" | ⬜ | Invalid runbook ID |
| ERR-06 | Invalid path | GET /api/invalid-endpoint | Returns 200 with dashboard HTML (default route) | ⬜ | Catch-all route |

**Test Commands:**
```bash
# ERR-04
curl -i https://portals.elfadil.com/api/health/invalid-branch | grep "HTTP"
curl https://portals.elfadil.com/api/health/invalid-branch | jq '.'

# ERR-05
curl -i https://portals.elfadil.com/api/runbooks/invalid-runbook | grep "HTTP"
curl https://portals.elfadil.com/api/runbooks/invalid-runbook | jq '.'

# ERR-06
curl -i https://portals.elfadil.com/api/invalid-endpoint | grep "HTTP"
```

### 5.3 Browser Error Handling

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| ERR-07 | JavaScript errors | Check browser console | No unhandled errors on page load | ⬜ | Console clean |
| ERR-08 | Refresh failure | Simulate network offline in DevTools, click refresh | Shows error message in #refreshError strip | ⬜ | Error display |
| ERR-09 | Error recovery | Re-enable network, click refresh | Error clears, data updates successfully | ⬜ | Error recovery |

**Test Steps:**
```
1. Open https://portals.elfadil.com in Chrome
2. Open DevTools (F12) → Console tab
3. Check for no errors on initial load
4. Go to Network tab → Enable "Offline" mode
5. Click "Refresh live data" button
6. Verify error message appears
7. Disable "Offline" mode
8. Click refresh again
9. Verify error clears and data loads
```

---

## 6. Integration Testing

### 6.1 Scanner Service Integration

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| INT-01 | Scanner feed | Check /api/control-tower claims.scanner | Shows `liveSystem.available: true` if scanner up | ⬜ | Scanner integration |
| INT-02 | Scanner metrics | Check claims.scanner.liveSystem | Shows totalScans, failedScans, avgDurationMs | ⬜ | Metrics present |
| INT-03 | Latest batch | Check claims.scanner.latestBatch | Shows errorCount, processed, totalEligible, dominantError | ⬜ | Batch data |
| INT-04 | Watchlist | Check claims.criticalClaims | Shows bundle IDs with liveStatus from scanner | ⬜ | Watchlist integration |
| INT-05 | Scanner fallback | If scanner unavailable, check claims | Falls back to CLAIMS_BASELINE data | ⬜ | Graceful degradation |

**Test Commands:**
```bash
# INT-01 to INT-04
curl https://portals.elfadil.com/api/control-tower | jq '.claims.scanner'

# INT-05 (check if scanner unavailable)
curl https://portals.elfadil.com/api/control-tower | jq '.claims.scanner.liveSystem.available'
# If false, check that .claims.summary still has data (fallback to baseline)
```

### 6.2 Cron Job Integration

| Test ID | Component | Action | Expected Behavior | Pass/Fail | Notes |
|---------|-----------|--------|-------------------|-----------|-------|
| INT-06 | KV storage | Check KV namespace | Contains keys: `health:latest`, `control-tower:latest` | ⬜ | Cron writes to KV |
| INT-07 | Cron frequency | Wait 5 minutes | New snapshot written to KV | ⬜ | Every 5 minutes |
| INT-08 | TTL | Check KV key TTL | Keys have 10-minute expiration | ⬜ | TTL set correctly |

**Test Commands:**
```bash
# INT-06 to INT-08 (requires wrangler CLI access)
wrangler kv:key list --namespace-id=079016c359c348e180724cdd76f29129

wrangler kv:key get "health:latest" --namespace-id=079016c359c348e180724cdd76f29129 | jq '.timestamp'

# Wait 5 minutes and check again
sleep 300
wrangler kv:key get "health:latest" --namespace-id=079016c359c348e180724cdd76f29129 | jq '.timestamp'
# Timestamp should be updated
```

---

## 7. Browser Compatibility Testing

### 7.1 Cross-Browser Testing

| Test ID | Browser | Version | Expected Behavior | Pass/Fail | Notes |
|---------|---------|---------|-------------------|-----------|-------|
| COMPAT-01 | Chrome | Latest (120+) | Full functionality | ⬜ | Primary browser |
| COMPAT-02 | Firefox | Latest (120+) | Full functionality | ⬜ | Mozilla |
| COMPAT-03 | Safari | Latest (17+) | Full functionality | ⬜ | macOS/iOS |
| COMPAT-04 | Edge | Latest (120+) | Full functionality | ⬜ | Chromium-based |
| COMPAT-05 | Mobile Safari | iOS 16+ | Responsive layout, touch-friendly | ⬜ | Mobile |
| COMPAT-06 | Chrome Android | Latest | Responsive layout, touch-friendly | ⬜ | Mobile |

**Test Steps:**
```
1. Open https://portals.elfadil.com in each browser
2. Verify page loads without errors
3. Test search box, filter pills, refresh button
4. Check responsive layout at mobile width (375px)
5. Test touch interactions on mobile
```

### 7.2 Responsive Design Testing

| Test ID | Screen Size | Expected Behavior | Pass/Fail | Notes |
|---------|-------------|-------------------|-----------|-------|
| RESP-01 | Desktop (1920×1080) | Full layout, 3-4 cards per row | ⬜ | Large screen |
| RESP-02 | Laptop (1366×768) | Full layout, 2-3 cards per row | ⬜ | Medium screen |
| RESP-03 | Tablet (768×1024) | Stacked layout, 1-2 cards per row | ⬜ | Tablet |
| RESP-04 | Mobile (375×667) | Single column, no horizontal scroll | ⬜ | Small screen |

**Test Steps:**
```
1. Open https://portals.elfadil.com in Chrome
2. Open DevTools (F12) → Toggle device toolbar (Ctrl+Shift+M)
3. Test each screen size above
4. Verify no horizontal scroll
5. Check all text readable (no overflow)
```

---

## Summary Checklist

### Before Live Testing

- [ ] Backup current wrangler.toml and src/index.js
- [ ] Document current production state (git commit, deployment timestamp)
- [ ] Prepare test environment (curl, jq, browser with DevTools)
- [ ] Coordinate with team (notify before testing starts)

### During Live Testing

- [ ] Complete all API endpoint tests (API-01 to API-24)
- [ ] Complete all UI/UX tests (UI-01 to UI-50)
- [ ] Complete all security tests (SEC-01 to SEC-15)
- [ ] Complete all performance tests (PERF-01 to PERF-07)
- [ ] Complete all error handling tests (ERR-01 to ERR-09)
- [ ] Complete all integration tests (INT-01 to INT-08)
- [ ] Complete all browser compatibility tests (COMPAT-01 to RESP-04)
- [ ] Capture screenshots for each major section
- [ ] Record network traces for performance analysis

### After Live Testing

- [ ] Document all failed tests with reproduction steps
- [ ] Capture browser console logs if errors found
- [ ] Save network HAR files for failed requests
- [ ] Update PRODUCTION_AUDIT_REPORT.md with test results
- [ ] Prioritize fixes based on severity
- [ ] Create GitHub issues for each defect found

---

## Test Results Summary Template

```markdown
## Test Results Summary

**Date:** YYYY-MM-DD
**Tester:** [Name]
**Duration:** [X hours]

### Pass/Fail Summary

| Category | Total Tests | Passed | Failed | Skipped |
|----------|-------------|--------|--------|---------|
| API Endpoints | 24 | X | X | X |
| UI/UX | 50 | X | X | X |
| Security | 15 | X | X | X |
| Performance | 7 | X | X | X |
| Error Handling | 9 | X | X | X |
| Integration | 8 | X | X | X |
| Browser Compat | 10 | X | X | X |
| **TOTAL** | **123** | **X** | **X** | **X** |

### Critical Failures

1. [Test ID] - [Description] - [Severity]
2. [Test ID] - [Description] - [Severity]

### High Priority Failures

1. [Test ID] - [Description] - [Severity]
2. [Test ID] - [Description] - [Severity]

### Medium/Low Failures

1. [Test ID] - [Description] - [Severity]

### Notes

- [Any additional observations]
```

---

**END OF TEST MATRIX**

*Version: 1.0*
*Last Updated: March 26, 2026*
