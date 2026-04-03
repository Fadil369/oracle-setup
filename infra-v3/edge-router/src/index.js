const DEFAULT_ROUTE_TABLE = {
  "/givc": "https://givc.brainsait.org",
  "/sbs": "https://sbs.brainsait.org",
  "/api": "https://api.brainsait.org",
  "/mcp": "https://mcp.brainsait.org",
  "/oasis": "https://oasis.brainsait.org",
  "/basma": "https://basma.brainsait.org",
};

const DEFAULT_HEALTH_TARGETS = [
  { id: "givc", url: "https://givc.brainsait.org/health" },
  { id: "sbs", url: "https://sbs.brainsait.org/health" },
  { id: "api", url: "https://api.brainsait.org/health" },
  { id: "mcp", url: "https://mcp.brainsait.org/health" },
  { id: "oasis", url: "https://oasis.brainsait.org/health" },
  { id: "basma", url: "https://basma.brainsait.org/health" },
  { id: "portal", url: "https://portal.brainsait.org/health" },
];

const ALLOWED_ORIGINS = [
  "https://brainsait.org",
  "https://www.brainsait.org",
  "https://portal.brainsait.org",
  "https://portals.brainsait.org",
  "https://bsma.brainsait.org",
  "https://basma.brainsait.org",
  "https://elfadil.com",
  "https://www.elfadil.com",
];

function resolveCorsOrigin(request) {
  const origin = request.headers.get("origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

const SEC_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "cross-origin-opener-policy": "same-origin",
};

function jsonResponse(payload, status = 200, extraHeaders = {}, request = null) {
  const origin = request ? resolveCorsOrigin(request) : ALLOWED_ORIGINS[0];
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-api-key",
      ...SEC_HEADERS,
      ...extraHeaders,
    },
  });
}

function parseRouteTable(env) {
  if (!env.ROUTE_MAP_JSON) {
    return DEFAULT_ROUTE_TABLE;
  }

  try {
    const parsed = JSON.parse(env.ROUTE_MAP_JSON);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_ROUTE_TABLE;
    }

    const normalized = {};
    for (const [prefix, origin] of Object.entries(parsed)) {
      if (typeof prefix !== "string" || typeof origin !== "string") {
        continue;
      }
      const cleanPrefix = normalizePrefix(prefix);
      const cleanOrigin = origin.replace(/\/$/, "");
      if (!cleanPrefix || !cleanOrigin.startsWith("https://")) {
        continue;
      }
      normalized[cleanPrefix] = cleanOrigin;
    }

    return Object.keys(normalized).length > 0 ? normalized : DEFAULT_ROUTE_TABLE;
  } catch {
    return DEFAULT_ROUTE_TABLE;
  }
}

function parseHealthTargets(env) {
  if (!env.HEALTH_TARGETS_JSON) {
    return DEFAULT_HEALTH_TARGETS;
  }

  try {
    const parsed = JSON.parse(env.HEALTH_TARGETS_JSON);
    if (!Array.isArray(parsed)) {
      return DEFAULT_HEALTH_TARGETS;
    }

    const normalized = parsed
      .map((item) => ({
        id: String(item?.id || "").trim(),
        url: String(item?.url || "").trim(),
      }))
      .filter((item) => item.id && item.url.startsWith("https://"));

    return normalized.length > 0 ? normalized : DEFAULT_HEALTH_TARGETS;
  } catch {
    return DEFAULT_HEALTH_TARGETS;
  }
}

function normalizePrefix(prefix) {
  if (!prefix) {
    return "";
  }
  let result = prefix.trim();
  if (!result.startsWith("/")) {
    result = `/${result}`;
  }
  if (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  return result;
}

function matchPrefix(pathname, routeTable) {
  const prefixes = Object.keys(routeTable).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return prefix;
    }
  }
  return null;
}

function buildUpstreamUrl(requestUrl, matchedPrefix, upstreamOrigin) {
  const incomingPath = requestUrl.pathname;
  const remainingPath = incomingPath.slice(matchedPrefix.length) || "/";

  const upstreamUrl = new URL(upstreamOrigin);
  const basePath = upstreamUrl.pathname === "/" ? "" : upstreamUrl.pathname.replace(/\/$/, "");
  upstreamUrl.pathname = `${basePath}${remainingPath}`;
  upstreamUrl.search = requestUrl.search;
  return upstreamUrl;
}

async function probeTarget(target, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetch(target.url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "brainsait-edge-router/1.0",
        accept: "application/json,text/plain,*/*",
      },
    });

    clearTimeout(timeout);
    return {
      id: target.id,
      url: target.url,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      id: target.id,
      url: target.url,
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "probe_failed",
    };
  }
}

async function handleHealth(env, request) {
  const timeoutMs = Number.parseInt(env.HEALTH_TIMEOUT_MS || "3500", 10);
  const targets = parseHealthTargets(env);
  const results = await Promise.all(targets.map((target) => probeTarget(target, timeoutMs)));

  const online = results.filter((entry) => entry.ok).length;
  const offline = results.length - online;

  const payload = {
    service: "brainsait-edge-router",
    domain: "brainsait.org",
    generatedAt: new Date().toISOString(),
    summary: {
      totalServices: results.length,
      online,
      offline,
      status: offline === 0 ? "healthy" : online === 0 ? "outage" : "degraded",
    },
    services: results,
  };

  const status = offline === 0 ? 200 : 503;
  return jsonResponse(payload, status, {}, request);
}

function cloneRequest(request, url) {
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "follow",
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const origin = resolveCorsOrigin(request);
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": "content-type,authorization,x-api-key",
          "access-control-max-age": "86400",
          ...SEC_HEADERS,
        },
      });
    }

    if (url.pathname === "/health") {
      return handleHealth(env, request);
    }

    const routeTable = parseRouteTable(env);
    const matchedPrefix = matchPrefix(url.pathname, routeTable);

    if (!matchedPrefix) {
      return jsonResponse(
        {
          error: "route_not_found",
          message: "No route mapping found for this path.",
          availablePrefixes: Object.keys(routeTable),
        },
        404,
        {},
        request,
      );
    }

    const upstreamOrigin = routeTable[matchedPrefix];
    const upstreamUrl = buildUpstreamUrl(url, matchedPrefix, upstreamOrigin);

    const proxiedRequest = cloneRequest(request, upstreamUrl.toString());
    const upstreamResponse = await fetch(proxiedRequest, {
      cf: {
        cacheEverything: false,
      },
    });

    const response = new Response(upstreamResponse.body, upstreamResponse);
    // Apply security headers to all proxied responses
    for (const [key, value] of Object.entries(SEC_HEADERS)) {
      response.headers.set(key, value);
    }
    const origin = resolveCorsOrigin(request);
    response.headers.set("access-control-allow-origin", origin);
    response.headers.set("x-brainsait-router", "brainsait-edge-router");
    response.headers.set("x-brainsait-route-prefix", matchedPrefix);
    response.headers.set("x-brainsait-upstream", upstreamOrigin);
    return response;
  },
};
