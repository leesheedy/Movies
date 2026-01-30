exports.handler = async () => {
  const envPayload = {
    VITE_TMDB_KEY: process.env.VITE_TMDB_KEY || "",
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: `window.__ENV__ = ${JSON.stringify(envPayload)};`,
  };
};
