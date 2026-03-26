# Portals Production Audit (portals.elfadil.com) — 2026-03-26

This report summarizes the production audit for the Cloudflare Worker–backed control tower at `https://portals.elfadil.com`. Live probing from this environment was blocked by DNS resolution (evidence below), so black-box results are limited to configuration and code-path review.

## Acceptance mapping
- [ ] Full inventory of UI actions with corresponding API endpoints — inventory derived from source; live verification blocked by DNS.
- [ ] List of broken links, errors, and UI defects with repro steps — not testable due to DNS block.
- [x] Verification of Worker routes, KV, cron, and service bindings — confirmed in `infra-v3/portals-worker/wrangler.toml`.
- [x] Prioritized list of missing features and fixes — see gaps section.
- [x] AI enhancement plan (short-term & long-term) — see AI roadmap.
- [ ] Audit report with live evidence — attached logs show DNS refusal; no live UI screenshots possible.

## Evidence: production reachability
DNS resolution for the production hostname is blocked in this environment, preventing live crawling and API replay:

```
$ dig @1.1.1.1 portals.elfadil.com
;; ->>HEADER<<- opcode: QUERY, status: REFUSED, id: 6
;; ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 0

$ curl -i https://portals.elfadil.com
curl: (6) Could not resolve host: portals.elfadil.com
```

## Worker configuration verification
- Route: `portals.elfadil.com/*` served by Worker `brainsait-portals` (`infra-v3/portals-worker/wrangler.toml`).
- KV: `PORTAL_KV` bound with namespace id `079016c359c348e180724cdd76f29129`.
- Cron: `*/5 * * * *` scheduled handler writes `health:latest` and `control-tower:latest` snapshots when KV is present.
- Service binding: `SCANNER_SERVICE` targets `oracle-claim-scanner`; fallback URL `SCANNER_URL` defaults to `https://oracle-scanner.elfadil.com`.
- Related worker: `oracle-claim-scanner` routes `oracle-scanner.elfadil.com/*` with KV namespaces `SESSIONS` and `RESULTS` (`wrangler.toml`).

## UI actions and API wiring (from source)
- Initial page load `/`: server builds snapshot by probing all branch Oracle portals, external MOH portals, and calling `control-tower/claims` on the scanner worker (service binding first, `SCANNER_URL` fallback); rendered snapshot is inlined into HTML.
- Auto-refresh + “Refresh live data” button: `GET /api/control-tower` (JSON); client handles non-2xx with an inline error banner and retries on the next interval.
- Footer quick links: `GET /api/branches`, `GET /api/health`, `GET /api/control-tower` (no auth).
- Health drill-down: `GET /api/health/:branch` per branch.
- Runbook navigation: `GET /api/runbooks`, `GET /api/runbooks/:id`, and HTML `GET /runbooks/:id`.
- Hospital cards: external links to `https://{subdomain}{loginPath}` for each branch (opens in new tab).
- Filters/search: client-side only (no API calls).

## Issues, risks, and gaps (prioritized)
1) Public API surface lacks auth: all `/api/*` endpoints (including control-tower health) are unauthenticated; sensitive operational data is exposed if the route is public.  
2) Live validation blocked: DNS refusal prevented verification of working routes, JS console state, and API responses; retest in a network-allowed environment is required.  
3) External links unvalidated: branch portal links could be stale; need live check for 404/SSL/SNI issues (esp. Riyadh TLS and new Khamis alias).  
4) No client-side offline state for initial load: if server-side snapshot build fails, the HTML will still render but without explicit degraded messaging beyond missing data; consider an inline banner when snapshot meta indicates errors.  
5) Scanner dependency: `control-tower/claims` call times out after 8s; if both service binding and URL fail, UI silently falls back to placeholder metrics—operators may not realize scanner is down.

## AI enhancement plan
- **MVP (2–4 weeks)**:  
  - Inline GPT-style summary of current snapshot (top outages, degraded services, critical actions) sourced from `/api/control-tower`.  
  - Anomaly alerts on latency trends and claim rejection spikes using simple z-score thresholds persisted in KV.  
  - Natural-language quick answers (“Which hospitals are degraded?”) backed by existing JSON snapshot.
- **v2 (6–10 weeks)**:  
  - Predictive scoring for tunnel/portal downtime using historical KV snapshots and scanner failure metrics.  
  - Recommendation engine that pairs rejection codes with remediation playbooks and drafts operator messages.  
  - Cross-service correlation (portal latency ↔ scanner errors ↔ payer response times) to auto-prioritize the action queue.

## Next steps to complete the audit (blocked until network is allowed)
- Re-run a full black-box crawl of `https://portals.elfadil.com` with console/network capture, confirm every button/link, and map live responses.  
- Verify `/api/*` should be protected; if yes, add an auth guard (API key/Access) and retry all calls.  
- Validate branch portal links (HTTPS/TLS SNI, redirects, status codes) and update `BRANCHES` if needed.  
- Capture screenshots of dashboard states (healthy, degraded, offline) and attach to this report.
