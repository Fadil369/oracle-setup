#!/usr/bin/env bash
set -euo pipefail

# Deploy the portals worker by default in CI/build contexts.
# Set WORKER_TARGET=scanner to deploy the claim-scanner worker.
# Set WORKER_TARGET=local-dev to launch the Oracle developer stack.
TARGET="${WORKER_TARGET:-portals}"

case "$TARGET" in
	scanner)
		npx wrangler deploy --config wrangler.scanner.toml
		;;
	portals)
		npx wrangler deploy --config wrangler.toml
		;;
	local-dev)
		node scripts/brainsait-oracle.mjs deploy --target local-dev
		;;
	platform)
		docker compose -f docker-compose.production.yml up -d
		;;
	*)
		echo "Unknown WORKER_TARGET: $TARGET" >&2
		exit 1
		;;
esac
