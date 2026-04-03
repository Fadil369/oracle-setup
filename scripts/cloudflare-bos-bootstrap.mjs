#!/usr/bin/env node

/**
 * BOS foundation bootstrap for Cloudflare zone hardening and DNS mesh prep.
 *
 * Required:
 *   CF_API_TOKEN
 *
 * Optional:
 *   CF_ZONE_ID
 *   CF_ZONE_NAME (default: brainsait.org)
 *   CF_ACCOUNT_ID (required for Access application/policy automation)
 *   CF_ACCESS_ALLOW_EMAILS (comma-separated)
 */

const API_BASE = "https://api.cloudflare.com/client/v4";
const token = process.env.CF_API_TOKEN;
const zoneName = process.env.CF_ZONE_NAME || "brainsait.org";
const providedZoneId = process.env.CF_ZONE_ID;
const accountId = process.env.CF_ACCOUNT_ID;

if (!token) {
  console.error("Missing CF_API_TOKEN.");
  process.exit(1);
}

async function cfRequest(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const message = payload?.errors?.map((e) => e.message).join("; ") || response.statusText;
    throw new Error(`Cloudflare API error (${response.status}): ${message}`);
  }

  return payload.result;
}

async function getZoneId() {
  if (providedZoneId) {
    return providedZoneId;
  }
  const zones = await cfRequest(`/zones?name=${encodeURIComponent(zoneName)}&status=active`);
  if (!Array.isArray(zones) || zones.length === 0) {
    throw new Error(`Unable to resolve active zone for ${zoneName}.`);
  }
  return zones[0].id;
}

async function setStrictSsl(zoneId) {
  await cfRequest(`/zones/${zoneId}/settings/ssl`, {
    method: "PATCH",
    body: JSON.stringify({ value: "strict" }),
  });
  console.log("[ok] SSL mode set to strict");
}

async function setBotFightMode(zoneId) {
  await cfRequest(`/zones/${zoneId}/settings/bot_fight_mode`, {
    method: "PATCH",
    body: JSON.stringify({ value: "on" }),
  });
  console.log("[ok] Bot Fight Mode enabled");
}

async function ensureManagedWaf(zoneId) {
  const body = {
    description: "BOS managed firewall baseline",
    rules: [
      {
        action: "execute",
        expression: "true",
        description: "Cloudflare Managed Ruleset",
        enabled: true,
        action_parameters: {
          id: "efb7b8c949ac4650a09736fc376e9aee",
        },
      },
    ],
  };

  await cfRequest(`/zones/${zoneId}/rulesets/phases/http_request_firewall_managed/entrypoint`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  console.log("[ok] WAF managed rules configured");
}

async function upsertAaaaRecords(zoneId) {
  const records = [
    "givc",
    "sbs",
    "api",
    "mcp",
    "oasis",
    "basma",
    "portal",
    "admin",
    "www",
  ];

  for (const host of records) {
    const name = `${host}.${zoneName}`;
    const existing = await cfRequest(
      `/zones/${zoneId}/dns_records?type=AAAA&name=${encodeURIComponent(name)}`,
    );

    const payload = {
      type: "AAAA",
      name,
      content: "100::",
      ttl: 120,
      proxied: false,
      comment: "BOS placeholder AAAA record",
    };

    if (Array.isArray(existing) && existing.length > 0) {
      await cfRequest(`/zones/${zoneId}/dns_records/${existing[0].id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      console.log(`[ok] Updated AAAA placeholder: ${name}`);
    } else {
      await cfRequest(`/zones/${zoneId}/dns_records`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.log(`[ok] Created AAAA placeholder: ${name}`);
    }
  }
}

async function createAccessAppWithPolicy(pathName) {
  if (!accountId) {
    console.warn(`[skip] CF_ACCOUNT_ID missing. Skipping Access app for ${pathName}.`);
    return;
  }

  const allowedEmails = (process.env.CF_ACCESS_ALLOW_EMAILS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    console.warn(
      `[skip] CF_ACCESS_ALLOW_EMAILS is empty. Skipping Access app policy for ${pathName}.`,
    );
    return;
  }

  const appName = `BOS ${pathName.replace("/", "")} Zero Trust`;
  const appResult = await cfRequest(`/accounts/${accountId}/access/apps`, {
    method: "POST",
    body: JSON.stringify({
      name: appName,
      type: "self_hosted",
      domain: `${zoneName}${pathName}*`,
      session_duration: "8h",
      auto_redirect_to_identity: false,
      app_launcher_visible: true,
    }),
  });

  const include = allowedEmails.map((email) => ({ email: { email } }));
  await cfRequest(`/accounts/${accountId}/access/apps/${appResult.id}/policies`, {
    method: "POST",
    body: JSON.stringify({
      name: `${appName} Allowlist`,
      precedence: 1,
      decision: "allow",
      include,
      exclude: [],
      require: [],
    }),
  });

  console.log(`[ok] Access policy provisioned for ${pathName}`);
}

async function main() {
  const zoneId = await getZoneId();
  console.log(`Using zone: ${zoneName} (${zoneId})`);

  await setStrictSsl(zoneId);
  await setBotFightMode(zoneId);
  await ensureManagedWaf(zoneId);
  await upsertAaaaRecords(zoneId);

  await createAccessAppWithPolicy("/admin");
  await createAccessAppWithPolicy("/portal");

  console.log("BOS Cloudflare bootstrap complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
