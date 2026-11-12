export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
    };
    const u = new URL(req.url);

    if (u.pathname.startsWith("/api/")) {
      if (req.method === "OPTIONS") return new Response(null, { headers: cors });
      const r = await fetch("https://fantasy.premierleague.com" + u.pathname + u.search, {
        headers: { "User-Agent": "Mozilla/5.0 (fpl-liga-dashboard)" },
        cf: { cacheTtl: 120, cacheEverything: true },
      });
      const h = new Headers(r.headers);
      for (const [k, v] of Object.entries(cors)) h.set(k, v);
      h.set("Cache-Control", "public, max-age=120");
      return new Response(r.body, { status: r.status, headers: h });
    }

    return env.ASSETS.fetch(req);
  },
};
