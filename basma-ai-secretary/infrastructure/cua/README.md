# Cua Sandbox Cluster and Telegram Command Center

This package provisions agent desktops with VNC/browser access, exposes them through Cloudflare Tunnel, and enables Telegram command routing for desktop operations.

## Included Components

- `docker-compose.cluster.yml`: Cua desktop services + Cloudflared sidecar.
- `cloudflared/config.yml`: Public hostname mappings for VNC/browser endpoints.
- `templates/*.desktop.json`: Workstation templates for Medical Coding and Research Intelligence.

## Workstation Templates

- Medical Coding Desktop:
  - EHR portal
  - NPHIES portal
  - ICD-10 browser
- Research Intelligence Desktop:
  - PubMed
  - Semantic Scholar
  - PDF analyzer

## Start the Cluster

```bash
cd basma-ai-secretary/infrastructure/cua
mkdir -p profiles/medical-coding profiles/research-intelligence
export CUA_VNC_PASSWORD='replace-with-strong-password'
export CLOUDFLARE_TUNNEL_TOKEN='replace-with-cloudflare-tunnel-token'
docker compose -f docker-compose.cluster.yml up -d
```

## Cloudflare Tunnel Hostnames

Update DNS records and tunnel routes for:

- `medical-coding-desktop.brainsait.org`
- `research-desktop.brainsait.org`
- `medical-coding-browser.brainsait.org`
- `research-browser.brainsait.org`

## Telegram Command Center

The API worker now supports:

- `/dev list`
- `/dev view <desktop-id>`
- `/dev screenshot <desktop-id>`
- `/server status`
- `/server desktops`
- `/ai agents`
- `/ai ask <prompt>`

### Required API Worker Variables

Set in `apps/workers/api/wrangler.toml` or secrets:

- `BASMA_DESKTOP_API_BASE`
- `BASMA_DESKTOP_API_TOKEN` (secret)
- `BASMA_SERVER_STATUS_URL`
- `BASMA_AI_ROUTER_URL`
- `BASMA_AI_ROUTER_TOKEN` (secret)
- `TELEGRAM_BOT_TOKEN` (secret)

## Suggested Desktop API Contract

The Telegram router expects these desktop API endpoints:

- `GET /api/v1/desktops`
- `GET /api/v1/desktops/:id`
- `POST /api/v1/desktops/:id/screenshot`
- `GET /health`

Response fields used:

- list: `desktops[]` or `instances[]`
- desktop view: `vnc_url` or `browser_url`
- screenshot: `screenshot_url`
- health: `running_instances`, `available_templates`
