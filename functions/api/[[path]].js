// English Geniuses – online database API (Cloudflare Pages Function + D1).
//   GET    /api/health                  -> { ok, locked }
//   GET    /api/doc?p=progress/<id>     -> { exists, j, u }
//   PUT    /api/doc?p=progress/<id>     body: JSON document   -> { ok, u }
//   DELETE /api/doc?p=progress/<id>     -> { ok }
//   GET    /api/list?c=progress&since=<ms> -> { docs:[{id,j,u}], now, limit }
// Bindings (Cloudflare dashboard → your Pages project → Settings):
//   D1 database binding named  DB
//   Secret                     EG_KEY  (shown in the teacher dashboard → Online & backup)
// Every request except /health must send the header  x-eg-key: <EG_KEY>.

const LIMIT = 500;
const MAX_DOC = 900000; // characters
let ready = false;

const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const okPath = (p) => /^(config|progress)\/[A-Za-z0-9._~:@+-]{1,64}$/.test(p);

async function setup(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, col TEXT NOT NULL, j TEXT NOT NULL, u INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS docs_col_u ON docs (col, u)"),
  ]);
  ready = true;
}

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url);
  const route = (params.path || []).join("/");
  if (!env.DB) return json({ error: "No D1 database is bound as DB" }, 500);
  if (route === "health") return json({ ok: true, locked: !!env.EG_KEY });

  if (!env.EG_KEY || request.headers.get("x-eg-key") !== env.EG_KEY) {
    // Until EG_KEY is set the server is open (first-time setup); afterwards every request must carry it.
    if (env.EG_KEY) return json({ error: "forbidden" }, 403);
  }
  await setup(env.DB);

  if (route === "doc") {
    const p = url.searchParams.get("p") || "";
    if (!okPath(p)) return json({ error: "bad path" }, 400);
    if (request.method === "GET") {
      const r = await env.DB.prepare("SELECT j, u FROM docs WHERE path = ?").bind(p).first();
      return json(r ? { exists: true, j: r.j, u: r.u } : { exists: false });
    }
    if (request.method === "PUT") {
      const j = await request.text();
      if (j.length > MAX_DOC) return json({ error: "too big" }, 413);
      try { JSON.parse(j); } catch (e) { return json({ error: "bad json" }, 400); }
      const u = Date.now();
      await env.DB.prepare(
        "INSERT INTO docs (path, col, j, u) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET j = excluded.j, u = excluded.u"
      ).bind(p, p.split("/")[0], j, u).run();
      return json({ ok: true, u });
    }
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM docs WHERE path = ?").bind(p).run();
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (route === "list" && request.method === "GET") {
    const c = url.searchParams.get("c") || "";
    if (!/^(config|progress)$/.test(c)) return json({ error: "bad collection" }, 400);
    const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
    const rs = await env.DB.prepare("SELECT path, j, u FROM docs WHERE col = ? AND u >= ? ORDER BY u LIMIT ?")
      .bind(c, since, LIMIT).all();
    return json({ docs: (rs.results || []).map((r) => ({ id: r.path.split("/")[1], j: r.j, u: r.u })), now: Date.now(), limit: LIMIT });
  }

  return json({ error: "not found" }, 404);
}
