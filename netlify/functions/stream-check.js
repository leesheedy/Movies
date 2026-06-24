// Serverless availability probe for the movie/TV embed providers.
// The providers (111movies, vidlove, zstream, vidfast, videasy) send no CORS, so
// the browser can't check them itself. This relays a lightweight GET to each
// and reports which ones currently respond for the given title.
//
//   /api/stream-check?type=movie&id=550
//   /api/stream-check?type=tv&id=1399&season=1&episode=1
//
// Returns { providerId: true|false }. Providers that time out or error are
// OMITTED (unknown) rather than reported false, so a slow host isn't wrongly
// greyed out. Playback never depends on this — it only annotates the chips.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Mirror of STREAM_PROVIDERS in public/app.js (only the enabled ones).
function providerUrls({ type, id, season, episode }) {
  const isMovie = type !== "tv";
  return [
    {
      id: "111movies",
      url: isMovie
        ? `https://111movies.net/movie/${id}`
        : `https://111movies.net/tv/${id}/${season}/${episode}`,
      ref: "https://111movies.net/",
    },
    {
      id: "vidlove",
      url: isMovie
        ? `https://player.vidlove.cc/embed/movie/${id}`
        : `https://player.vidlove.cc/embed/tv/${id}/${season}/${episode}`,
      ref: "https://vidlove.cc/",
    },
    {
      id: "zstream",
      url: isMovie
        ? `https://zstream.mov/embed/movie/${id}`
        : `https://zstream.mov/embed/tv/${id}/${season}/${episode}`,
      ref: "https://zstream.mov/",
    },
    {
      id: "vidfast",
      url: isMovie
        ? `https://vidfast.pro/movie/${id}`
        : `https://vidfast.pro/tv/${id}/${season}/${episode}`,
      ref: "https://vidfast.pro/",
    },
    {
      id: "videasy",
      url: isMovie
        ? `https://player.videasy.to/movie/${id}`
        : `https://player.videasy.to/tv/${id}/${season}/${episode}`,
      ref: "https://player.videasy.to/",
    },
  ];
}

async function probe({ url, ref }) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Referer: ref, Accept: "text/html,*/*" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    // 404/410 → genuinely not there. 2xx/3xx → reachable.
    if (res.status === 404 || res.status === 410) return false;
    if (res.status >= 200 && res.status < 400) {
      const body = await res.text();
      const lower = body.slice(0, 4000).toLowerCase();
      if (/not\s*found|no\s*sources|404|nothing here/.test(lower) && body.length < 2000) {
        return false;
      }
      return true;
    }
    return null; // 5xx etc → unknown
  } catch {
    return null; // timeout / network → unknown
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  const q = event.queryStringParameters || {};
  const id = q.id;
  if (!id) {
    return {
      statusCode: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "missing id" }),
    };
  }

  const targets = providerUrls({
    type: q.type || "movie",
    id,
    season: q.season || 1,
    episode: q.episode || 1,
  });

  const results = await Promise.all(targets.map((t) => probe(t)));
  const out = {};
  targets.forEach((t, i) => {
    if (results[i] !== null) out[t.id] = results[i];
  });

  return {
    statusCode: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
    body: JSON.stringify(out),
  };
};
