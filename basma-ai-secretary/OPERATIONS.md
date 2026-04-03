# Basma Operations

## One-command deployment

Run from this directory:

```bash
./deploy.sh
```

## Deployment toggles

- `SKIP_INFRA=1`: skip D1/R2/KV provisioning and migrations.
- `SKIP_WORKERS=1`: skip worker deployment.
- `SKIP_SMOKE=1`: skip smoke tests.
- `DB_NAME=<name>`: override D1 database name.
- `R2_BUCKET=<name>`: override R2 bucket name.

Examples:

```bash
SKIP_INFRA=1 ./deploy.sh
SKIP_SMOKE=1 ./deploy.sh
DB_NAME=basma_staging R2_BUCKET=basma-staging-storage ./deploy.sh
```

## Smoke tests

Public endpoint checks (read-only by default):

```bash
./scripts/smoke-test.sh
```

Optional write-path check (creates one intake lead):

```bash
ALLOW_WRITE_SMOKE=1 ./scripts/smoke-test.sh
```

Optional endpoint overrides:

```bash
BASMA_API_URL=https://basma-api.example.com BASMA_VOICE_URL=https://basma-voice.example.com ./scripts/smoke-test.sh
```

## Secrets checklist

Required secrets for workers:

- `ANTHROPIC_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `WHATSAPP_BUSINESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `JWT_SECRET`
- `ENCRYPTION_KEY`

Optional:

- `N8N_WEBHOOK_URL` (var)
- `N8N_WEBHOOK_TOKEN` (secret)
