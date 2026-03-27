# Architecture Report

## System Overview

Primary platform is Cloudflare Worker based with a browser-automation worker (`oracle-claim-scanner`) and an orchestration/dashboard worker (`brainsait-portals`).

Detected stack:

- Frontend: Server-rendered static HTML/CSS/JS in Worker responses.
- Backend: Cloudflare Workers (JavaScript, nodejs_compat) with service bindings.
- Auth: API key on non-public endpoints (`Authorization: Bearer`, `X-API-Key`, query key fallback).
- Hosting: Cloudflare edge + route bindings for `portals.elfadil.com` and `oracle-scanner.elfadil.com`.
- Integrations: Oracle Oasis+ branch systems, MOH claims, MOH approval, NPHIES, FHIR/SBS pipelines.

## Component Diagram

```mermaid
flowchart TD
  U[Operations User] --> P[portals.elfadil.com\nbrainsait-portals Worker]
  P --> S[oracle-scanner.elfadil.com\noracle-claim-scanner Worker]
  P --> R[Runbooks and Control Tower APIs]
  S --> O1[Oracle Oasis Riyadh]
  S --> O2[Oracle Oasis Madinah]
  S --> O3[Oracle Oasis Unaizah]
  S --> O4[Oracle Oasis Khamis]
  S --> O5[Oracle Oasis Jizan]
  S --> O6[Oracle Oasis Abha]
  P --> E1[MOH Claims]
  P --> E2[MOH Approval]
  P --> E3[NPHIES]
```

## Data Flow Diagram

```mermaid
sequenceDiagram
  participant Ops as Operator Browser
  participant Portals as Portals Worker
  participant Scanner as Scanner Worker
  participant Oracle as Oracle Branch Portals
  participant Ext as External Services

  Ops->>Portals: GET / and periodic refresh
  Portals->>Portals: Build control tower snapshot
  Portals->>Scanner: GET /control-tower/claims
  Scanner->>Oracle: Session + claim scan calls
  Oracle-->>Scanner: Claim artifacts/status
  Scanner-->>Portals: Claims summary JSON
  Portals->>Ext: Health probes (MOH/NPHIES)
  Ext-->>Portals: Availability + latency
  Portals-->>Ops: Render dashboard + actions
```

## Service Dependency Graph

```mermaid
graph LR
  Portals --> Scanner
  Portals --> CloudflareKV[(PORTAL_KV)]
  Scanner --> SessionsKV[(SESSIONS)]
  Scanner --> ResultsKV[(RESULTS)]
  Scanner --> Browser[Cloudflare Browser Rendering]
  Scanner --> OracleBackends[Oracle Branch Backends]
  Portals --> External[MOH and NPHIES]
```

## Container Architecture Map

Runtime discovery in this workspace:

- `docker ps`: no running containers.
- `docker compose config`: no compose file detected in current state.
- Docker daemon available with `overlay2`, cgroup v2, limits enabled.

Production blueprint is provided in `docker-compose.production.yml` with:

- `gateway` (Caddy reverse proxy)
- `portals-api`
- `scanner-api`
- `otel-collector`
- `prometheus`
- `loki`
- `grafana`

## MCP Integration Map

Observed MCP-related evidence:

- Platform references “MCP services” in operational narrative and scripts.
- No runtime MCP containers discovered in current Docker runtime.
- Integration points are currently edge/API-driven (Worker routes and runbooks), not local containerized MCP endpoints.

Recommended MCP production pattern:

- Put MCP services behind internal network only.
- Enforce service-to-service mTLS/API keys.
- Route all external access through API gateway with authn/authz.
