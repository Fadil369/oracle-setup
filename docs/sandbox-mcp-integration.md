# Cloudflare Sandbox-Container MCP Integration

This guide explains how the [Cloudflare sandbox-container MCP server](https://github.com/cloudflare/mcp-server-cloudflare/tree/main/apps/sandbox-container) is integrated into the oracle-setup repository to improve code quality.

## What is the Sandbox-Container MCP Server?

It is a remote [Model Context Protocol](https://modelcontextprotocol.io) server hosted at `https://containers.mcp.cloudflare.com`. It exposes an ephemeral, sandboxed Node/Python execution environment through MCP tools:

| Tool | Description |
|------|-------------|
| `container_initialize` | Start / reset a container (~10 min lifetime) |
| `container_ping` | Check container connectivity |
| `container_file_write` | Write a file into the container |
| `container_file_read` | Read a file from the container |
| `container_files_list` | List files in the work directory |
| `container_file_delete` | Delete a file or directory |
| `container_exec` | Run an arbitrary shell command |

The key benefit: **every run starts from a clean, identical environment** — no stale `node_modules`, no local secrets, no host OS drift.

---

## Setup

### 1. Connect Your AI Client (Cursor / Claude Desktop)

The MCP server config is already checked in at `.cursor/mcp.json`. Restart Cursor after pulling, or add the equivalent to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cloudflare-sandbox": {
      "command": "npx",
      "args": ["mcp-remote", "https://containers.mcp.cloudflare.com/mcp"]
    }
  }
}
```

On first launch, a browser window will open for Cloudflare OAuth. After authenticating, the MCP tools (`container_initialize`, `container_exec`, etc.) become available to the LLM.

### 2. Install mcp-remote (one-time)

`npx` fetches `mcp-remote` automatically. To pre-install globally:

```bash
npm install -g mcp-remote
```

---

## Usage

### CLI Scripts

Run quality checks locally inside the remote sandbox without touching your local `node_modules`:

```bash
# Run all checks (lint + test + audit) in the sandbox
npm run sandbox:quality

# Lint only
npm run sandbox:lint

# Tests only
npm run sandbox:test

# Dependency audit only
npm run sandbox:audit

# Analyse a NPHIES claim file (JSON or CSV)
npm run sandbox:fhir -- dry_run_bat4295.json
npm run sandbox:fhir -- _APPEAL_INDEX.csv

# Validate a single source file (syntax check)
node scripts/sandbox-quality.mjs --file src/index.js
```

### LLM-Driven Code Review Loop

When your AI client is connected to the MCP server, it can perform a full fix-and-verify cycle:

1. Read a source file (`src/index.js`, `infra-v3/portals-worker/src/index.js`, etc.)
2. Upload it with `container_file_write`
3. Run `container_exec npm run lint` and `container_exec npm test`
4. Observe failures
5. Propose a fix and re-run — all before touching your working tree

**Example prompt for Cursor/Claude:**
> "Use the cloudflare-sandbox MCP tools to lint `src/index.js`, fix any issues you find, and verify the fix passes `npm run lint` in the container before showing me the patch."

### FHIR / NPHIES Claim Analysis

Upload claim files and analyse them safely without network access to production services:

```
# Prompt for LLM:
"Upload dry_run_bat4295.json to the container and use Python to:
 1. Count entries by FHIR resourceType
 2. Show the distribution of claim status values
 3. Identify any entries missing required `subject` references"
```

---

## CI / CD Integration

The **Sandbox Quality Gate** workflow (`.github/workflows/sandbox-quality.yml`) runs automatically on every pull request that touches source files:

```
Pull Request opened / updated
        │
        ▼
┌─────────────────────────────┐
│  isolated-quality job       │
│  Node 20 Alpine container   │
│  ─────────────────────────  │
│  npm ci                     │
│  npm run lint               │
│  npm test                   │
│  npm audit --omit=dev       │
└─────────────────────────────┘
        │
        ▼  (posts summary comment to PR)
```

The `isolated-quality` job uses a **Docker container executor** in GitHub Actions, ensuring a pristine environment identical to the sandbox-container principle.

### Optional: Full MCP Sandbox in CI

Enable the `mcp-sandbox` job by:

1. Generating a Cloudflare API token with container access
2. Adding it as a repository secret: `CLOUDFLARE_MCP_TOKEN`
3. Setting the repository variable `ENABLE_MCP_SANDBOX` to `true`

This will run `scripts/sandbox-quality.mjs` against the live `containers.mcp.cloudflare.com` server from within CI.

---

## Security Notes

- The sandbox container has **no access** to this repository's secrets or Cloudflare credentials.
- Claim files (`*.csv`, `*.json`) uploaded to the container are ephemeral — they are destroyed when the container expires (~10 min) or is reset with `container_initialize`.
- Do **not** upload files that contain real patient identifiers (PHI) to the public MCP server. Use synthetic or anonymised test data only.
- The `.cursor/mcp.json` file contains no secrets — authentication is handled by mcp-remote's OAuth flow at runtime.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `npx mcp-remote` opens browser on every run | Run `npx mcp-remote https://containers.mcp.cloudflare.com/mcp` once to cache the OAuth token |
| `MCP error -32601: Method not found` | Container may have expired; the script calls `container_initialize` automatically |
| `container_exec` returns empty output | Container needs re-initialization; re-run `npm run sandbox:quality` |
| CI `mcp-sandbox` job skipped | Set the `ENABLE_MCP_SANDBOX` repo variable to `true` and add `CLOUDFLARE_MCP_TOKEN` secret |
