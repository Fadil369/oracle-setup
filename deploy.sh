#!/usr/bin/env bash
set -euo pipefail

# Deploy the portals worker by default in CI/build contexts.
# Set WORKER_TARGET=scanner to deploy the claim-scanner worker.
TARGET="${WORKER_TARGET:-portals}"

if [[ "$TARGET" == "scanner" ]]; then
	npx wrangler deploy --config wrangler.toml
else
	npx wrangler deploy --config infra-v3/portals-worker/wrangler.toml
fi
