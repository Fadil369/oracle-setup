# ============================================================
# COMPLIANCELINC — BrainSAIT Invisible Infrastructure Guide
# Tunnel + DNS + Worker setup for all 6 branches
# ============================================================

## PART 1 — Zero Trust Dashboard
## URL: https://one.dash.cloudflare.com → Networks → Tunnels
## Tunnel: 2cffb7bf-983e-4835-acc1-3a417a27018f → Configure → Public Hostname

### Required Public Hostname rules (add/fix each one):

| Subdomain        | Domain      | Type  | URL              | No TLS Verify | HTTP2 |
|------------------|-------------|-------|------------------|---------------|-------|
| oracle-riyadh    | brainsait.org | HTTPS | 128.1.1.185      | ✓ ON          | OFF   |
| oracle-madinah   | brainsait.org | HTTP  | 172.25.11.26     | —             | OFF   |
| oracle-unaizah   | brainsait.org | HTTP  | 10.0.100.105     | —             | OFF   |
| oracle-khamis    | brainsait.org | HTTP  | 172.30.0.77      | —             | OFF   |  ← NEW
| oracle-jizan     | brainsait.org | HTTP  | 172.17.4.84      | —             | OFF   |
| oracle-abha      | brainsait.org | HTTP  | 172.19.1.1       | —             | OFF   |
| oracle           | brainsait.org | HTTP  | 172.30.0.77      | —             | OFF   |  ← alias for Khamis

### For oracle-riyadh and portals — Additional settings:
- oracle-riyadh: Origin Server Name = 128.1.1.185  (fixes TLS SNI)
- brainsait.org: DO NOT add as tunnel rule — it's a Worker

### Khamis fix:
  Old: oracle.brainsait.org → 172.30.0.77  (generic name, confusing)
  New: oracle-khamis.brainsait.org → 172.30.0.77  (named correctly)
  Keep oracle.brainsait.org as backward-compat alias pointing to same backend.

---

## PART 2 — Deploy portals Worker
## From your MacBook terminal:

  cd infra-v3/portals-worker
  npx wrangler kv namespace create "PORTAL_HEALTH"
  # → copy the ID into wrangler.toml replacing REPLACE_AFTER_CREATE
  npx wrangler deploy

  # Test immediately:
  curl https://brainsait.org/api/health
  curl https://brainsait.org/api/branches

---

## PART 3 — Correct login URLs per branch

  Branch   URL to bookmark / use in scanner
  ──────────────────────────────────────────────────────────────
  Riyadh   https://oracle-riyadh.brainsait.org/prod/faces/Home
  Madinah  https://oracle-madinah.brainsait.org/Oasis/faces/Login.jsf   ← /Oasis/
  Unaizah  https://oracle-unaizah.brainsait.org/prod/faces/Login.jsf
  Khamis   https://oracle-khamis.brainsait.org/prod/faces/Login.jsf     ← new subdomain
  Jizan    https://oracle-jizan.brainsait.org/prod/faces/Login.jsf
  Abha     https://oracle-abha.brainsait.org/Oasis/faces/Home           ← /Oasis/

---

## PART 4 — Invisible Infrastructure Principles

  The setup you have already follows these principles.
  Here is what makes it "invisible" and how to maintain it:

  1. NO EXPOSED IP ADDRESSES
     All backends (172.x, 10.x, 128.1.x) are private LAN IPs.
     They are NEVER accessible directly from the internet.
     Cloudflare Tunnel is the only ingress — zero open ports.

  2. NO WINDOWS ADMIN REQUIRED
     Tunnel config is remote (Zero Trust dashboard).
     Workers deploy from MacBook via wrangler.
     No local config changes needed on hospital machines.

  3. CLOUDFLARE AS THE ONLY PUBLIC FACE
     Every URL is *.brainsait.org — Cloudflare proxied.
     Real backend IPs never appear in DNS, HTTP headers, or logs.
     Cloudflare strips all origin headers before returning to client.

  4. ADD CLOUDFLARE ACCESS (recommended next step)
     Protect oracle-* routes with Cloudflare Access:
     one.dash.cloudflare.com → Access → Applications → Add
     Policy: email OTP (one-time pin to your email — no passwords)
     This means: even if someone knows the URL, they can't reach Oracle
     without getting a one-time code to dr.mf.12298@gmail.com

     Add Access policy for ALL oracle-* subdomains:
     Application name: Oracle Hospital Portals
     Subdomain: *.brainsait.org
     Policy: Allow — Email ends in @brainsait.com OR specific emails

  5. TUNNEL CONNECTOR REDUNDANCY
     You already have 2 connectors (INMARCMREJ1 + INMARCMREJ3).
     Cloudflare load-balances between them automatically.
     If one machine goes down, all routes stay up.
     Confirm in: Zero Trust → Tunnels → 2cffb7bf → Connectors tab.

  6. CRON HEALTH MONITORING
     portals Worker now probes all 6 branches every 5 minutes.
     Results stored in KV → dashboard always shows live status.
     You can add alerting:
       wrangler tail brainsait-portals | grep "offline"

  7. ORACLE-CLAIM-SCANNER INTEGRATION
     oracle-claim-scanner.brainsait.workers.dev uses:
       GET https://brainsait.org/api/branches
     to discover all branch URLs dynamically.
     No hardcoded URLs in the scanner Worker.

---

## PART 5 — Token rotation (security)

  The service install token from the tunnel log was exposed.
  Rotate it: Zero Trust → Tunnels → 2cffb7bf → Configure → Connectors
  → Rotate token. Running connections are NOT affected.
