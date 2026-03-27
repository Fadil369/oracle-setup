# Deployment Guide

## Local Oracle developer stack

```bash
npm ci
npm run configure
npm run oracle:dev
npm run oracle:status
```

This starts Oracle Free from `docker/docker-compose.yml` with persisted storage in `.data/oracle`.

## Control-plane deployment orchestration

The portals worker exposes `GET/POST /api/deploy/oracle`.

- `plan`: return deployment steps and required secrets.
- `validate`: return readiness and missing secret information.
- `trigger`: POST the deployment request to `DEPLOY_WEBHOOK_URL`.

## Infrastructure-as-code

```bash
cd infrastructure/terraform
terraform init
terraform validate
```

The Terraform module models the Oracle developer stack with Docker resources so the local environment can be reproducible.

## CI validation

`.github/workflows/deploy.yml` validates:

- CLI wiring
- Docker compose configuration
- Terraform formatting and validation
- Oracle Free container health