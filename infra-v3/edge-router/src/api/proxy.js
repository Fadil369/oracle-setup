/**
 * API Proxy module for elfadil.com sub-domain backends.
 * Proxies /api/{service}/* requests to the corresponding {service}.elfadil.com.
 */

const BACKEND_MAP = {
  bsma: "https://bsma.elfadil.com",
  givc: "https://givc.elfadil.com",
  sbs: "https://sbs.elfadil.com",
  gov: "https://gov.elfadil.com",
};

const ALLOWED_METHODS = new Set([
  "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
]);

/**
 * Attempt to match /api/{service}/{rest} and proxy to the elfadil.com backend.
 * Returns a Response if matched, or null if the path does not match.
 */
export async function proxyAPI(request, url, corsOrigin, secHeaders) {
  const match = url.pathname.match(/^\/api\/(bsma|givc|sbs|gov)(\/.*)?$/);
  if (!match) {
    return null;
  }

  const service = match[1];
  const rest = match[2] || "/";
  const backend = BACKEND_MAP[service];

  if (!backend) {
    return null;
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...secHeaders,
      },
    });
  }

  // Build upstream URL
  const upstreamUrl = new URL(backend);
  upstreamUrl.pathname = rest;
  upstreamUrl.search = url.search;

  // Clone request headers, strip host
  const headers = new Headers(request.headers);
  headers.set("host", upstreamUrl.host);
  headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") || "");
  headers.set("x-forwarded-proto", "https");
  headers.set("x-brainsait-service", service);

  const proxyReq = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: "follow",
  });

  try {
    const upstreamRes = await fetch(proxyReq, {
      cf: { cacheEverything: false },
    });

    const response = new Response(upstreamRes.body, upstreamRes);
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    response.headers.set("access-control-allow-origin", corsOrigin);
    response.headers.set("access-control-allow-methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
    response.headers.set("access-control-allow-headers", "content-type,authorization,x-api-key");
    response.headers.set("x-brainsait-proxy", `${service}.elfadil.com`);
    return response;
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "upstream_error",
        service,
        message: err instanceof Error ? err.message : "proxy_failed",
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": corsOrigin,
          ...secHeaders,
        },
      },
    );
  }
}
