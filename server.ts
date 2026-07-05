import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import config from "./zosite.json";
import { Hono } from "hono";

type Mode = "development" | "production";
const app = new Hono();
const mode: Mode = process.env.NODE_ENV === "production" ? "production" : "development";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function supabaseGet(path: string) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  return res.json();
}

async function supabasePost(path: string, body: unknown) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...supabaseHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function supabasePatch(path: string, body: unknown) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...supabaseHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function supabaseDelete(path: string) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: supabaseHeaders(),
  });
  return res.ok;
}

// GET /api/garapan?page=1&limit=20&flags=testnet,fcfs
app.get("/api/garapan", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const flags = c.req.query("flags") || "";
  const offset = (page - 1) * limit;

  let url = `/garapan?select=*&order=posted_at.desc&limit=${limit}&offset=${offset}`;
  if (flags) {
    const flagList = flags.split(",");
    const filters = flagList.map((f) => `flags.cs.{${f}}`).join(",");
    url += `&or=(${filters})`;
  }

  const items = await supabaseGet(url);
  const countUrl = `/garapan?select=id`;
  const all = await supabaseGet(countUrl);
  return c.json({ items, total: all.length });
});

// POST /api/garapan/track — bookmarked by a user
app.post("/api/garapan/track", async (c) => {
  const { user_id, garapan_id } = await c.req.json();
  const data = await supabasePost("/tracked", { user_id, garapan_id, status: "todo" });
  return c.json(data);
});

// GET /api/garapan/tracked/:user_id
app.get("/api/garapan/tracked/:user_id", async (c) => {
  const user_id = c.req.param("user_id");
  const data = await supabaseGet(
    `/tracked?select=*,garapan:garapan_id(*)&user_id=eq.${user_id}&order=created_at.desc`
  );
  return c.json(data);
});

// PATCH /api/garapan/tracked/:id
app.patch("/api/garapan/tracked/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const data = await supabasePatch(`/tracked?id=eq.${id}`, body);
  return c.json(data);
});

// DELETE /api/garapan/tracked/:id
app.delete("/api/garapan/tracked/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await supabaseDelete(`/tracked?id=eq.${id}`);
  return c.json({ ok });
});

// GET /api/stats
app.get("/api/stats", async (c) => {
  const items = await supabaseGet("/garapan?select=flags");
  const stats: Record<string, number> = {};
  for (const item of items as { flags: string[] }[]) {
    for (const f of item.flags || []) {
      stats[f] = (stats[f] || 0) + 1;
    }
  }
  return c.json(stats);
});

if (mode === "production") {
  configureProduction(app);
} else {
  await configureDevelopment(app);
}

const port = process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : mode === "production"
    ? (config.publish?.published_port ?? config.local_port)
    : config.local_port;

export default { fetch: app.fetch, port, idleTimeout: 255 };

function configureProduction(app: Hono) {
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 302));
  app.use(async (c, next) => {
    if (c.req.method !== "GET") return next();
    const path = c.req.path;
    if (path.startsWith("/api/") || path.startsWith("/assets/")) return next();
    const file = Bun.file(`./dist${path}`);
    if (await file.exists()) {
      const stat = await file.stat();
      if (stat && !stat.isDirectory()) return new Response(file);
    }
    return serveStatic({ path: "./dist/index.html" })(c, next);
  });
}

async function configureDevelopment(app: Hono): Promise<ViteDevServer> {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    if (c.req.path === "/favicon.ico") return c.redirect("/favicon.svg", 302);
    const url = c.req.path;
    try {
      if (url === "/" || url === "/index.html") {
        let template = await Bun.file("./index.html").text();
        template = await vite.transformIndexHtml(url, template);
        return c.html(template, { headers: { "Cache-Control": "no-store, must-revalidate" } });
      }
      const publicFile = Bun.file(`./public${url}`);
      if (await publicFile.exists()) {
        const stat = await publicFile.stat();
        if (stat && !stat.isDirectory())
          return new Response(publicFile, { headers: { "Cache-Control": "no-store, must-revalidate" } });
      }
      let result;
      try { result = await vite.transformRequest(url); } catch { result = null; }
      if (result) {
        return new Response(result.code, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store, must-revalidate" } });
      }
      let template = await Bun.file("./index.html").text();
      template = await vite.transformIndexHtml("/", template);
      return c.html(template, { headers: { "Cache-Control": "no-store, must-revalidate" } });
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error(error);
      return c.text("Internal Server Error", 500);
    }
  });
  return vite;
}
