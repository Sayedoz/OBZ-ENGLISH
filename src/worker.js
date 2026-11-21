// English Geniuses – Cloudflare Worker.
// Serves the app (public/index.html) and an API that keeps EVERYTHING in a D1 database:
// classes, students, PINs, lessons and all student progress. Any device can use the site with no setup.
//
//   GET  /api/health                      -> { ok, mode:"server", hasRoster, updated }
//   GET  /api/public                      -> class lists for the login screens (names, no PINs)
//   POST /api/login          {sid,pin}     -> { token }                 (student)
//   POST /api/teacher/login  {pin}         -> { token, roster }         (teacher)
//   POST /api/teacher/setup  {roster}      -> { token }                 (first upload only, when the server is empty)
//   GET  /api/roster   (teacher)           -> full roster
//   PUT  /api/roster   (teacher) {roster}  -> { ok, updated }
//   GET  /api/doc?p=progress/<sid>  (any login)          -> { exists, j, u }
//   PUT  /api/doc?p=progress/<sid>  (teacher, or that student) -> { ok, u }
//   DELETE /api/doc?p=progress/<sid> (teacher)           -> { ok }
//   GET  /api/list?c=progress&since=<ms> (any login)     -> { docs:[{id,j,u}], now, limit }
// Bindings (wrangler.jsonc): D1 database "DB", static files "ASSETS". No secrets to set:
// the token-signing secret is created once and kept in the database.

const LIMIT = 500;
const MAX_DOC = 900000;          // characters per progress document
const MAX_ROSTER = 4000000;      // characters for the whole class list
const TOKEN_DAYS = { t: 30, s: 180 };
const MAX_FAILS = 6, FAIL_WINDOW = 10 * 60 * 1000;
let ready = false;

const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64u = (s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
const sha256 = async (t) => hex(await crypto.subtle.digest("SHA-256", enc.encode(t)));

async function setup(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, col TEXT NOT NULL, j TEXT NOT NULL, u INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS docs_col_u ON docs (col, u)"),
    db.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS fails (k TEXT PRIMARY KEY, n INTEGER NOT NULL, t INTEGER NOT NULL)"),
  ]);
  ready = true;
}
async function metaGet(db, k) { const r = await db.prepare("SELECT v FROM meta WHERE k = ?").bind(k).first(); return r ? r.v : null; }
async function metaSet(db, k, v) { await db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run(); }

async function secret(db) {
  let s = await metaGet(db, "secret");
  if (!s) {
    s = hex(crypto.getRandomValues(new Uint8Array(32)));
    await db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('secret', ?)").bind(s).run();
    s = await metaGet(db, "secret");
  }
  return s;
}
async function sign(db, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(await secret(db)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)))));
}
async function makeToken(db, p) {
  const body = b64u(JSON.stringify({ ...p, exp: Date.now() + TOKEN_DAYS[p.r] * 864e5 }));
  return body + "." + (await sign(db, body));
}
async function readToken(db, req) {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [body, sig] = t.split(".");
  if (!body || !sig || (await sign(db, body)) !== sig) return null;
  try { const p = JSON.parse(unb64u(body)); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}

async function getRoster(db) { const v = await metaGet(db, "roster"); try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function validRoster(r) {
  return r && typeof r === "object" && Array.isArray(r.classes) && r.classes.every((c) =>
    c && typeof c.id === "string" && typeof c.name === "string" && Array.isArray(c.students) &&
    c.students.every((s) => s && typeof s.id === "string" && typeof s.name === "string"));
}
function publicRoster(r) {
  if (!r) return { pub: true, classes: [], updated: 0 };
  return {
    pub: true, updated: r.updated || 0,
    classes: r.classes.map((c) => ({ ...c, students: c.students.map(({ pw, ...s }) => s) })),
    lessons: r.lessons || [], vocab: r.vocab || {}, certTeacher: r.certTeacher || null, sig: r.sig || null,
  };
}
async function tooMany(db, k) {
  const r = await db.prepare("SELECT n, t FROM fails WHERE k = ?").bind(k).first();
  return !!(r && r.n >= MAX_FAILS && Date.now() - r.t < FAIL_WINDOW);
}
async function failed(db, k) {
  const r = await db.prepare("SELECT n, t FROM fails WHERE k = ?").bind(k).first();
  const n = r && Date.now() - r.t < FAIL_WINDOW ? r.n + 1 : 1;
  await db.prepare("INSERT INTO fails (k, n, t) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, t = excluded.t").bind(k, n, Date.now()).run();
}
async function cleared(db, k) { await db.prepare("DELETE FROM fails WHERE k = ?").bind(k).run(); }
async function body(req, max) {
  const t = await req.text();
  if (t.length > max) throw Object.assign(new Error("too big"), { status: 413 });
  try { return JSON.parse(t); } catch (e) { throw Object.assign(new Error("bad json"), { status: 400 }); }
}

async function api(request, env) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const M = request.method;
  if (!env.DB) return json({ error: "No D1 database is bound as DB" }, 500);
  const db = env.DB;
  await setup(db);

  if (route === "health") {
    const r = await getRoster(db);
    return json({ ok: true, mode: "server", hasRoster: !!(r && r.classes && r.classes.length), updated: r ? r.updated || 0 : 0 });
  }
  if (route === "public" && M === "GET") return json(publicRoster(await getRoster(db)));

  if (route === "login" && M === "POST") {
    const b = await body(request, 2000);
    const sid = String(b.sid || ""), pin = String(b.pin || "");
    if (await tooMany(db, "s:" + sid)) return json({ error: "too many tries" }, 429);
    const r = await getRoster(db);
    let st = null;
    for (const c of (r && r.classes) || []) { st = c.students.find((s) => s.id === sid) || null; if (st) break; }
    if (!st || String(st.pw) !== pin) { await failed(db, "s:" + sid); return json({ error: "wrong pin" }, 401); }
    await cleared(db, "s:" + sid);
    return json({ token: await makeToken(db, { r: "s", sid }) });
  }

  if (route === "teacher/login" && M === "POST") {
    const b = await body(request, 2000);
    if (await tooMany(db, "t")) return json({ error: "too many tries" }, 429);
    const r = await getRoster(db);
    if (!r) return json({ error: "no roster", needSetup: true }, 409);
    const ok = r.pinHash ? (await sha256((r.salt || "") + "|" + String(b.pin || ""))) === r.pinHash : false;
    if (!ok) { await failed(db, "t"); return json({ error: "wrong pin" }, 401); }
    await cleared(db, "t");
    return json({ token: await makeToken(db, { r: "t" }), roster: r });
  }

  if (route === "teacher/setup" && M === "POST") {
    const b = await body(request, MAX_ROSTER);
    if (await getRoster(db)) return json({ error: "already set up" }, 409);
    const r = b.roster;
    if (!validRoster(r) || !r.pinHash) return json({ error: "bad roster" }, 400);
    r.updated = r.updated || Date.now();
    await metaSet(db, "roster", JSON.stringify(r));
    return json({ token: await makeToken(db, { r: "t" }), updated: r.updated });
  }

  const who = await readToken(db, request);
  if (!who) return json({ error: "login needed" }, 401);
  const teacher = who.r === "t";

  if (route === "roster") {
    if (!teacher) return json({ error: "teacher only" }, 403);
    if (M === "GET") return json(await getRoster(db) || { classes: [] });
    if (M === "PUT") {
      const b = await body(request, MAX_ROSTER);
      const r = b.roster;
      if (!validRoster(r)) return json({ error: "bad roster" }, 400);
      const cur = await getRoster(db);
      if (cur && !r.pinHash) { r.pinHash = cur.pinHash; r.salt = cur.salt; }
      r.updated = Math.max(Date.now(), (cur && cur.updated || 0) + 1);
      await metaSet(db, "roster", JSON.stringify(r));
      return json({ ok: true, updated: r.updated });
    }
    return json({ error: "method" }, 405);
  }

  if (route === "doc") {
    const p = url.searchParams.get("p") || "";
    const m = p.match(/^progress\/([A-Za-z0-9._~:@+-]{1,64})$/);
    if (!m) return json({ error: "bad path" }, 400);
    if (M === "GET") {
      const r = await db.prepare("SELECT j, u FROM docs WHERE path = ?").bind(p).first();
      return json(r ? { exists: true, j: r.j, u: r.u } : { exists: false });
    }
    if (M === "PUT") {
      if (!teacher && who.sid !== m[1]) return json({ error: "not your record" }, 403);
      const j = await request.text();
      if (j.length > MAX_DOC) return json({ error: "too big" }, 413);
      try { JSON.parse(j); } catch (e) { return json({ error: "bad json" }, 400); }
      const u = Date.now();
      await db.prepare("INSERT INTO docs (path, col, j, u) VALUES (?, 'progress', ?, ?) ON CONFLICT(path) DO UPDATE SET j = excluded.j, u = excluded.u")
        .bind(p, j, u).run();
      return json({ ok: true, u });
    }
    if (M === "DELETE") {
      if (!teacher) return json({ error: "teacher only" }, 403);
      await db.prepare("DELETE FROM docs WHERE path = ?").bind(p).run();
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (route === "list" && M === "GET") {
    if ((url.searchParams.get("c") || "") !== "progress") return json({ error: "bad collection" }, 400);
    const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
    const rs = await db.prepare("SELECT path, j, u FROM docs WHERE col = 'progress' AND u >= ? ORDER BY u LIMIT ?").bind(since, LIMIT).all();
    return json({ docs: (rs.results || []).map((r) => ({ id: r.path.split("/")[1], j: r.j, u: r.u })), now: Date.now(), limit: LIMIT });
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      try { return await api(request, env); }
      catch (e) { return json({ error: e.status ? e.message : "server", detail: e.status ? undefined : String(e && e.message || e) }, e.status || 500); }
    }
    return env.ASSETS.fetch(request);
  },
};
