#!/usr/bin/env node
/**
 * COMPLIANCELINC — oracle-claim-scanner one-command setup
 * Run from your MacBook: node setup.mjs
 *
 * Does everything:
 *   1. Creates KV namespaces (ORACLE_SESSIONS, ORACLE_RESULTS)
 *   2. Patches wrangler.toml with real KV IDs
 *   3. Prompts for Oracle credentials → sets as Worker secrets
 *   4. Deploys the Worker
 *   5. Tests the /status endpoint
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: opts.silent ? "pipe" : "inherit", ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
}

console.log(`
╔══════════════════════════════════════════════════════╗
║  COMPLIANCELINC — Oracle Claim Scanner Setup         ║
║  Cloudflare Worker with Browser Rendering            ║
╚══════════════════════════════════════════════════════╝
`);

// ── 1. Check wrangler is installed ───────────────────────────────────────────
try {
  runCapture("wrangler --version");
  console.log("✓  wrangler found");
} catch {
  console.log("Installing wrangler...");
  run("npm install -g wrangler");
}

// ── 2. Check login ────────────────────────────────────────────────────────────
console.log("\n  Checking Cloudflare auth...");
try {
  const whoami = runCapture("wrangler whoami 2>&1");
  if (whoami.includes("Not logged in")) {
    console.log("  Logging in to Cloudflare...");
    run("wrangler login");
  } else {
    console.log("✓  Already authenticated");
  }
} catch {
  run("wrangler login");
}

// ── 3. Install npm deps ───────────────────────────────────────────────────────
console.log("\n  Installing dependencies...");
run("npm install");

// ── 4. Create KV namespaces ───────────────────────────────────────────────────
console.log("\n  Creating KV namespaces...");

function createKV(name) {
  try {
    const out = runCapture(`wrangler kv namespace create "${name}" 2>&1`);
    const match = out.match(/id\s*=\s*"([a-f0-9]{32})"/);
    if (match) {
      console.log(`✓  ${name}: ${match[1]}`);
      return match[1];
    }
  } catch (e) {
    // Already exists — try to get the ID
    try {
      const list = runCapture(`wrangler kv namespace list 2>&1`);
      const parsed = JSON.parse(list.match(/\[.*\]/s)?.[0] || "[]");
      const ns = parsed.find(n => n.title === name || n.title.includes(name));
      if (ns) {
        console.log(`✓  ${name} already exists: ${ns.id}`);
        return ns.id;
      }
    } catch {}
  }
  console.warn(`  ⚠  Could not create/find KV namespace "${name}". Set manually in wrangler.toml.`);
  return null;
}

const sessionsId = createKV("ORACLE_SESSIONS");
const resultsId  = createKV("ORACLE_RESULTS");

// ── 5. Patch wrangler.toml with real KV IDs ───────────────────────────────────
if (sessionsId && resultsId) {
  let config = readFileSync("wrangler.toml", "utf8");
  config = config
    .replace(/id\s*=\s*"REPLACE_WITH_KV_ID_AFTER_wrangler_kv_create"\s*# Create.*SESSIONS/,
             `id = "${sessionsId}"`)
    .replace(/id\s*=\s*"REPLACE_WITH_KV_ID_AFTER_wrangler_kv_create"\s*# Create.*RESULTS/,
             `id = "${resultsId}"`);
  writeFileSync("wrangler.toml", config);
  console.log("✓  wrangler.toml updated with KV IDs");
}

// ── 6. Set Oracle credentials as secrets ─────────────────────────────────────
console.log("\n  Setting Oracle credentials as Worker secrets...");
console.log("  (These are stored encrypted in Cloudflare — never in wrangler.toml)\n");

const oracleUser = await ask("  Oracle username (e.g. rcmrejection3): ");
const oraclePass = await ask("  Oracle password: ");
rl.close();

// Write to tmp files and pipe to wrangler secret put
const { spawnSync: spawn } = await import("child_process");

function setSecret(name, value) {
  const res = spawnSync("wrangler", ["secret", "put", name], {
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (res.status === 0) console.log(`✓  Secret ${name} set`);
  else console.warn(`  ⚠  Failed to set ${name}`);
}

setSecret("ORACLE_USER", oracleUser);
setSecret("ORACLE_PASS", oraclePass);

// ── 7. Deploy ─────────────────────────────────────────────────────────────────
console.log("\n  Deploying Worker...");
run("wrangler deploy");

// ── 8. Test /status ───────────────────────────────────────────────────────────
console.log("\n  Testing deployed Worker...");
await new Promise(r => setTimeout(r, 3000)); // Give CF time to propagate

try {
  const res = await fetch("https://oracle-claim-scanner.brainsait.workers.dev/status");
  const data = await res.json();
  console.log("\n✅  Worker is live:");
  console.log(`   URL      : https://oracle-claim-scanner.brainsait.workers.dev`);
  console.log(`   Status   : ${data.status}`);
  console.log(`   Oracle   : ${data.oracle_url}`);
  console.log(`   Session  : ${data.session}`);
} catch (e) {
  console.log("  ⚠  Could not reach worker yet. Try manually:");
  console.log("     curl https://oracle-claim-scanner.brainsait.workers.dev/status");
}

// ── 9. Print usage ────────────────────────────────────────────────────────────
console.log(`
─── Ready — Usage ─────────────────────────────────────────────

Scan a single claim:
  curl -X POST https://oracle-claim-scanner.brainsait.workers.dev/scan \\
    -H "Content-Type: application/json" \\
    -d '{"nationalId":"2022893586","bundleId":"480e919e-7743-4107-845e-9db81b192b7a","serviceDate":"2026-02-23","patientName":"HAYAT DARWISH A"}'

Scan full batch (from normalized payload):
  node trigger-batch.mjs

Check status:
  curl https://oracle-claim-scanner.brainsait.workers.dev/status

Clear session (force re-login):
  curl -X DELETE https://oracle-claim-scanner.brainsait.workers.dev/session

─── No Windows machine needed from here ───────────────────────
`);
