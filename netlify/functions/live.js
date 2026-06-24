// Serverless proxy for Live TV data that has no CORS headers of its own
// (ntv.cx). The browser can't fetch these directly from the static site, so we
// relay them here and add Access-Control-Allow-Origin.
//
//   /api/live?resource=channels  → ntv.cx channel directory (~1800 channels)
//   /api/live?resource=matches   → ntv.cx live match listings
//
// Sports matches come straight from streamed.pk in the browser (it already
// sends CORS: *), so they don't need this proxy.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const UPSTREAMS = {
  channels: "https://ntv.cx/api/get-channels",
  matches: "https://ntv.cx/api/get-matches",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const resource = (event.queryStringParameters || {}).resource || "channels";
  const upstream = UPSTREAMS[resource];
  if (!upstream) {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "unknown resource" }),
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(upstream, {
      headers: { "User-Agent": UA, Referer: "https://ntv.cx/", Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.text();
    return {
      statusCode: res.ok ? 200 : 502,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        // Channel list is large and fairly static — let the CDN cache it.
        "Cache-Control": resource === "channels" ? "public, max-age=600" : "public, max-age=60",
      },
      body,
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(error && error.message || error) }),
    };
  }
};
