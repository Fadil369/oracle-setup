# Security Audit

## Risk Assessment

### Critical

- Hardcoded API key fallback in `trigger-batch.mjs` (fixed).
- Public dashboard payload exposes internal origin IP addresses and branch topology through rendered JSON snapshots.

### High

- Fail-open auth posture when `API_KEY` is unset in workers (fixed to fail-closed unless `ALLOW_UNAUTHENTICATED` explicitly enabled).
- Protected endpoints still allow query-string API key usage; this can leak in logs/referrers.
- CORS is permissive for preflight in scanner and portal workers.
- Repository includes sensitive healthcare claim datasets with patient identifiers.

### Medium

- No mandatory CI security gates before merge.
- No enforced secret scanning pipeline.
- No standardized runtime security headers policy document.

### Low

- Inconsistent docs between authorization modes (`Bearer`, `X-API-Key`, `api_key`).

## Remediation Implemented

- Removed hardcoded API key fallback in `trigger-batch.mjs`.
- Enforced fail-closed API auth in both workers when `API_KEY` is absent.
- Added CI pipeline with lint, tests, dependency audit, and Trivy scan.
- Added production `.env.production.example` and expanded `.gitignore` secret patterns.

## Remediation Backlog (Next)

1. Replace query param API keys with signed short-lived tokens.
2. Redact internal backend metadata from public JSON snapshots.
3. Add Cloudflare Access policy for control-tower API and admin surfaces.
4. Implement WAF + rate limiting for scanner endpoints.
5. Add data-classification policy and encrypted artifact storage for claim files.
6. Add SBOM generation and dependency pinning checks.

## Severity Tracking Table

| ID | Finding | Severity | Status |
| --- | --- | --- | --- |
| SEC-001 | Hardcoded API key fallback | Critical | Fixed |
| SEC-002 | Public exposure of internal backend details | Critical | Open |
| SEC-003 | Auth fail-open if API key missing | High | Fixed |
| SEC-004 | Query param API key accepted | High | Open |
| SEC-005 | No security CI gates | Medium | Fixed |
| SEC-006 | Sensitive data files in repo | High | Open |
