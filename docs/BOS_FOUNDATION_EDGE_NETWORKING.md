# BOS Foundation and Edge Networking

This document defines Project 1 delivery for the BrainSAIT Cognitive Backbone.

## Scope

- Unified edge router for brainsait.org path-based routing.
- Zone security hardening baseline for healthcare compliance.
- Global DNS placeholder records and multi-service health mesh.

## Task 1.1 Unified Edge Router Deployment

Worker package:

- infra-v3/edge-router/src/index.js
- infra-v3/edge-router/wrangler.toml

Routing behavior:

- /givc -> [https://givc.brainsait.org](https://givc.brainsait.org)
- /sbs -> [https://sbs.brainsait.org](https://sbs.brainsait.org)
- /api -> [https://api.brainsait.org](https://api.brainsait.org)
- /mcp -> [https://mcp.brainsait.org](https://mcp.brainsait.org)
- /oasis -> [https://oasis.brainsait.org](https://oasis.brainsait.org)
- /basma -> [https://basma.brainsait.org](https://basma.brainsait.org)

Dynamic routing can be adjusted without code changes through ROUTE_MAP_JSON in wrangler vars.

Deploy command:

- npx wrangler deploy --config infra-v3/edge-router/wrangler.toml

## Task 1.2 Zone Security Hardening

Automation script:

- scripts/cloudflare-bos-bootstrap.mjs

What it applies:

- SSL mode = strict.
- Bot Fight Mode = on.
- WAF managed rules baseline (Cloudflare managed ruleset entrypoint).
- Cloudflare Access application setup for /admin and /portal paths when account and allowlist vars are provided.

Required environment variables:

- CF_API_TOKEN

Optional environment variables:

- CF_ZONE_ID
- CF_ZONE_NAME (defaults to brainsait.org)
- CF_ACCOUNT_ID (needed for Access app creation)
- CF_ACCESS_ALLOW_EMAILS (comma-separated allowlist used by Access policies)

Run hardening:

- node scripts/cloudflare-bos-bootstrap.mjs

## Task 1.3 Global DNS and Health Mesh

DNS placeholders:

- Script creates or updates AAAA placeholder records with content 100:: for:
  - givc, sbs, api, mcp, oasis, basma, portal, admin, www

Health orchestration endpoint:

- GET /health on the edge router probes 7 services by default:
  - givc, sbs, api, mcp, oasis, basma, portal
- Returns aggregate summary and per-service latency/status.
- Response is 200 when all services are online, otherwise 503 for degraded/outage signaling.
- Targets can be customized via HEALTH_TARGETS_JSON in wrangler vars.

## Validation Checklist

- Deploy edge router and confirm brainsait.org route is attached.
- Verify path forwarding for /givc, /sbs, /api, /mcp, /oasis, /basma.
- Confirm /health returns aggregated service status.
- Run Cloudflare bootstrap script with production API token.
- Verify SSL strict, WAF managed rules, bot fight mode, and Access policies in dashboard.
- Verify AAAA placeholders exist for all required subdomains.
