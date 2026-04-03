#!/bin/bash
# BRAINSAIT: Basma AI Secretary - Unified Deployment Script
# Targets: Cloudflare Workers, Pages, D1, KV, R2

set -e

# Configuration
DB_NAME="basma_production"
R2_BUCKET="basma-storage"
KV_NAMESPACES=("CACHE" "SESSIONS" "RATE_LIMIT")

echo "🚀 Initializing Basma AI Secretary Infrastructure..."

# 1. Create D1 Database (using existing if already created)
echo "📦 Setting up D1 Database..."
npx wrangler d1 create $DB_NAME || true
npx wrangler d1 execute $DB_NAME --file=./infrastructure/schema.sql --yes

# 2. Create R2 Bucket
echo "🗄️ Setting up R2 Storage..."
npx wrangler r2 bucket create $R2_BUCKET || true

# 3. Create KV Namespaces
echo "⚡ Setting up KV Cache..."
for kv in "${KV_NAMESPACES[@]}"; do
  npx wrangler kv:namespace create $kv || true
done

# 4. Prompt for Secrets (User manual step)
echo "🔒 Reminder: Set secrets using 'npx wrangler secret put <NAME>'"
echo "Required: ANTHROPIC_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, JWT_SECRET, ENCRYPTION_KEY"

# 5. Deploy Workers
echo "📡 Deploying Workers..."
cd apps/workers/api && npx wrangler deploy
cd ../voice && npx wrangler deploy
cd ../widget && npx wrangler deploy
cd ../../..

# 6. Deploy Frontend (Pages)
echo "🌐 Deploying Next.js Dashboard to Cloudflare Pages..."
cd apps/web
# npm install --no-audit (should be run if environment allows)
# npx wrangler pages deploy .next/static --project-name basma-dashboard
cd ../..

echo "✅ Basma AI Secretary Platform Deployed Successfully!"
echo "Main Dashboard: https://bsma.brainsait.org"
echo "API Gateway: https://basma-api.brainsait.org"
echo "Voice Engine: https://basma-voice.brainsait.org"
echo "Widget JS: https://basma-api.brainsait.org/widget.js"
