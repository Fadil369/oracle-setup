#!/usr/bin/env bash
# BRAINSAIT: Basma AI Secretary - Unified Deployment Script

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_NAME="${DB_NAME:-basma_production}"
R2_BUCKET="${R2_BUCKET:-basma-storage}"
KV_NAMESPACES=("CACHE" "SESSIONS" "RATE_LIMIT")

SKIP_INFRA="${SKIP_INFRA:-0}"
SKIP_WORKERS="${SKIP_WORKERS:-0}"
SKIP_SMOKE="${SKIP_SMOKE:-0}"
SMOKE_SCRIPT="$ROOT_DIR/scripts/smoke-test.sh"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1"
    exit 1
  }
}

run_step() {
  local title="$1"
  shift
  echo "==> $title"
  "$@"
}

require_cmd npx

echo "Starting Basma deployment"
echo "Root: $ROOT_DIR"
echo "Database: $DB_NAME"
echo "R2 bucket: $R2_BUCKET"

if [[ "$SKIP_INFRA" != "1" ]]; then
  run_step "Create D1 database (idempotent)" npx wrangler d1 create "$DB_NAME" || true
  run_step "Apply base schema" npx wrangler d1 execute "$DB_NAME" --file="$ROOT_DIR/infrastructure/schema.sql" --yes
  run_step "Apply CRM memory migration" npx wrangler d1 execute "$DB_NAME" --file="$ROOT_DIR/infrastructure/migrations/0001_basma_crm_memory.sql" --yes
  run_step "Create R2 bucket (idempotent)" npx wrangler r2 bucket create "$R2_BUCKET" || true

  echo "==> Create KV namespaces (idempotent)"
  for kv in "${KV_NAMESPACES[@]}"; do
    npx wrangler kv:namespace create "$kv" || true
  done
else
  echo "Skipping infrastructure provisioning (SKIP_INFRA=1)"
fi

echo "Secrets checklist"
echo "Required secrets: ANTHROPIC_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, WHATSAPP_BUSINESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, JWT_SECRET, ENCRYPTION_KEY"
echo "Optional: N8N_WEBHOOK_URL (var), N8N_WEBHOOK_TOKEN (secret)"

if [[ "$SKIP_WORKERS" != "1" ]]; then
  run_step "Deploy API worker" bash -c "cd '$ROOT_DIR/apps/workers/api' && npx wrangler deploy"
  run_step "Deploy Voice worker" bash -c "cd '$ROOT_DIR/apps/workers/voice' && npx wrangler deploy"
  run_step "Deploy Widget worker" bash -c "cd '$ROOT_DIR/apps/workers/widget' && npx wrangler deploy"
else
  echo "Skipping workers deployment (SKIP_WORKERS=1)"
fi

if [[ "$SKIP_SMOKE" != "1" ]]; then
  if [[ -f "$SMOKE_SCRIPT" ]]; then
    chmod +x "$SMOKE_SCRIPT"
    run_step "Run smoke tests" "$SMOKE_SCRIPT"
  else
    echo "Smoke test script not found at $SMOKE_SCRIPT"
    exit 1
  fi
else
  echo "Skipping smoke tests (SKIP_SMOKE=1)"
fi

echo "Deployment workflow completed"
echo "Dashboard: https://bsma.brainsait.org"
echo "API: https://basma-api.brainsait.org"
echo "Voice: https://basma-voice.brainsait.org"
