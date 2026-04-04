#!/usr/bin/env node
/**
 * sandbox-quality.mjs
 *
 * Runs quality checks (lint, test, audit) for this repo using the Cloudflare
 * sandbox-container MCP server (https://containers.mcp.cloudflare.com).
 *
 * The script communicates with the MCP server via JSON-RPC over stdio using
 * `mcp-remote`. It uploads the source files that matter, installs dependencies
 * inside the ephemeral container, then runs each check in isolation so results
 * are never polluted by local state.
 *
 * Prerequisites:
 *   npx mcp-remote --version   (installs automatically on first run)
 *   Cloudflare account auth via `npx mcp-remote https://containers.mcp.cloudflare.com/mcp`
 *
 * Usage:
 *   node scripts/sandbox-quality.mjs [--check lint|test|audit|all] [--file <path>]
 *
 * Options:
 *   --check  Which quality check to run (default: all)
 *   --file   Upload a specific file for analysis instead of default source set
 *   --fhir   Upload & analyse a FHIR/NPHIES claim file (JSON/CSV) with Python
 *   --help   Show this message
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(`
Usage: node scripts/sandbox-quality.mjs [options]

Options:
  --check <lint|test|audit|all>  Quality check(s) to run (default: all)
  --file  <path>                 Upload a single file for isolated analysis
  --fhir  <path>                 Analyse a FHIR/NPHIES claim JSON or CSV file
  --help                         Show this message

Environment:
  MCP_SANDBOX_URL   Override the MCP server URL
                    (default: https://containers.mcp.cloudflare.com/mcp)

Examples:
  # Run all quality checks in the sandbox
  node scripts/sandbox-quality.mjs

  # Lint only
  node scripts/sandbox-quality.mjs --check lint

  # Analyse a specific claim file
  node scripts/sandbox-quality.mjs --fhir dry_run_bat4295.json

  # Upload and validate a single worker source file
  node scripts/sandbox-quality.mjs --file src/index.js
`);
  process.exit(0);
}

const MCP_URL =
  process.env.MCP_SANDBOX_URL || "https://containers.mcp.cloudflare.com/mcp";

const check = flags.check || "all";
const fhirFile = flags.fhir ? resolve(ROOT, flags.fhir) : null;
const singleFile = flags.file ? resolve(ROOT, flags.file) : null;

// ─── MCP JSON-RPC client (stdio transport via mcp-remote) ────────────────────

/**
 * Spawns `npx mcp-remote <url>` and wraps it in a simple promise-based
 * JSON-RPC 2.0 client for MCP tool calls.
 */
function createMCPClient(serverUrl) {
  const proc = spawn("npx", ["--yes", "mcp-remote", serverUrl], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  let buffer = "";
  let idCounter = 1;
  const pending = new Map();

  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // not JSON — ignore
      }
    }
  });

  proc.on("error", (err) => {
    console.error("[sandbox] Failed to spawn mcp-remote:", err.message);
    console.error(
      "[sandbox] Ensure npx is available or install mcp-remote globally: npm i -g mcp-remote"
    );
    process.exit(1);
  });

  async function call(toolName, params = {}) {
    const id = idCounter++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const request = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: toolName, arguments: params },
      });
      proc.stdin.write(request + "\n");
    });
  }

  function close() {
    proc.stdin.end();
  }

  return { call, close };
}

// ─── File collection helpers ──────────────────────────────────────────────────

const SOURCE_PATHS = [
  "src/index.js",
  "package.json",
  "package-lock.json",
  ".eslintrc.cjs",
  "eslint.config.mjs",
];

const TEST_PATHS = ["tests/complete-interface-test.mjs"];

const WORKER_PATHS = [
  "infra-v3/portals-worker/src/index.js",
  "infra-v3/edge-router/src/index.js",
];

function readFileSafe(absPath) {
  if (!existsSync(absPath)) return null;
  return readFileSync(absPath, "utf8");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[sandbox] Connecting to MCP server: ${MCP_URL}`);
  const client = createMCPClient(MCP_URL);

  try {
    // 1. Initialize (or reuse) the container
    console.log("[sandbox] Initializing container…");
    await client.call("container_initialize");
    console.log("[sandbox] Container ready.");

    // ── Single-file mode ──────────────────────────────────────────────────────
    if (singleFile) {
      const content = readFileSafe(singleFile);
      if (!content) {
        console.error(`[sandbox] File not found: ${singleFile}`);
        process.exit(1);
      }
      const remotePath = relative(ROOT, singleFile);
      console.log(`[sandbox] Uploading ${remotePath}…`);
      await client.call("container_file_write", { path: remotePath, content });

      console.log(`[sandbox] Running basic syntax check on ${remotePath}…`);
      const result = await client.call("container_exec", {
        command: `node --check ${remotePath}`,
      });
      printResult("Syntax check", result);
      return;
    }

    // ── FHIR / NPHIES analysis mode ──────────────────────────────────────────
    if (fhirFile) {
      const content = readFileSafe(fhirFile);
      if (!content) {
        console.error(`[sandbox] FHIR file not found: ${fhirFile}`);
        process.exit(1);
      }
      const remoteName = relative(ROOT, fhirFile);
      console.log(`[sandbox] Uploading claim file ${remoteName}…`);
      await client.call("container_file_write", { path: remoteName, content });

      console.log("[sandbox] Installing Python dependencies…");
      await client.call("container_exec", {
        command: "pip install --quiet fhir.resources pandas 2>&1 | tail -5",
      });

      const ext = fhirFile.split(".").pop().toLowerCase();
      let analyzeCmd;
      if (ext === "json") {
        analyzeCmd = `python3 - <<'PY'
import json, sys
with open('${remoteName}') as f:
    bundle = json.load(f)
rt = bundle.get('resourceType', 'unknown')
entries = len(bundle.get('entry', []))
print(f"resourceType : {rt}")
print(f"entry count  : {entries}")
types = [e['resource']['resourceType'] for e in bundle.get('entry', []) if 'resource' in e]
from collections import Counter
for rt, n in Counter(types).most_common():
    print(f"  {rt}: {n}")
PY`;
      } else {
        // CSV
        analyzeCmd = `python3 - <<'PY'
import csv, collections, sys
with open('${remoteName}', newline='') as f:
    rows = list(csv.DictReader(f))
print(f"Rows: {len(rows)}")
if rows:
    print(f"Columns: {list(rows[0].keys())}")
    status_col = next((c for c in rows[0] if 'status' in c.lower()), None)
    if status_col:
        from collections import Counter
        print(f"\\n{status_col} distribution:")
        for v, n in Counter(r[status_col] for r in rows).most_common():
            print(f"  {v}: {n}")
PY`;
      }

      const result = await client.call("container_exec", { command: analyzeCmd });
      printResult("FHIR/NPHIES claim analysis", result);
      return;
    }

    // ── Standard quality checks ──────────────────────────────────────────────
    const runLint = check === "all" || check === "lint";
    const runTest = check === "all" || check === "test";
    const runAudit = check === "all" || check === "audit";

    // Upload source files
    const filesToUpload = [
      ...SOURCE_PATHS,
      ...(runTest ? TEST_PATHS : []),
      ...(runLint ? WORKER_PATHS : []),
    ];

    console.log("[sandbox] Uploading source files…");
    for (const rel of filesToUpload) {
      const abs = resolve(ROOT, rel);
      const content = readFileSafe(abs);
      if (!content) continue;
      process.stdout.write(`  → ${rel}\n`);
      await client.call("container_file_write", { path: rel, content });
    }

    // Install deps
    console.log("[sandbox] Installing dependencies (npm ci)…");
    const installResult = await client.call("container_exec", {
      command: "npm ci --prefer-offline 2>&1 | tail -10",
    });
    printResult("npm ci", installResult);

    // Lint
    if (runLint) {
      console.log("[sandbox] Running ESLint…");
      const lintResult = await client.call("container_exec", {
        command: "npm run lint 2>&1",
      });
      printResult("ESLint", lintResult);
    }

    // Test
    if (runTest) {
      console.log("[sandbox] Running tests…");
      const testResult = await client.call("container_exec", {
        command: "npm test 2>&1",
      });
      printResult("Tests", testResult);
    }

    // Audit
    if (runAudit) {
      console.log("[sandbox] Running dependency audit…");
      const auditResult = await client.call("container_exec", {
        command: "npm audit --omit=dev 2>&1",
      });
      printResult("npm audit", auditResult);
    }

    console.log("\n[sandbox] All checks complete.");
  } finally {
    client.close();
  }
}

function printResult(label, result) {
  // MCP tool results have a `content` array of {type, text} objects
  const text =
    Array.isArray(result?.content)
      ? result.content.map((c) => c.text || "").join("")
      : JSON.stringify(result, null, 2);

  const lines = text.split("\n");
  const preview = lines.length > 40 ? lines.slice(-40).join("\n") : text;
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}`);
  console.log(preview || "(no output)");
}

main().catch((err) => {
  console.error("[sandbox] Fatal:", err.message);
  process.exit(1);
});
