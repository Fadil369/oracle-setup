# Security Guide

## Secret handling

Do not commit `.env`. Use `.env.example` for local defaults and inject production values through one of:

- GitHub Actions secrets
- Cloudflare secrets
- Vault or an equivalent secret manager
- Coolify or another deployment control plane

## Portal deployment API

`/api/deploy/oracle` requires the same API key and Cloudflare Access path as the other protected control-plane operations. The worker returns plans directly but only triggers deployments through a configured webhook.

## Oracle developer stack

- Local data is persisted under `.data/oracle` and excluded from git.
- The developer compose file only exposes Oracle ports needed for local development.
- Initialization scripts are mounted read-only from `docker/initdb/`.

## Existing controls retained

- Cloudflare Access and API key enforcement
- Hardened production Docker Compose settings
- Prometheus, Loki, Grafana, and OpenTelemetry for monitoring
- Security workflows for dependency review, Trivy, CodeQL, and Gitleaks