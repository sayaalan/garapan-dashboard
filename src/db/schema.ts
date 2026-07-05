import { Database } from "bun:sqlite";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DB_DIR = "/home/workspace/Projects/garapan-dashboard/data";
const DB_PATH = `${DB_DIR}/garapan.db`;

export interface Garapan {
  id: number;
  post_id: number;
  text: string;
  links: string;
  posted_at: string;
  scraped_at: string;
  flags: string;
  telegram_url: string;
}

export interface TrackedGarapan extends Garapan {
  track_id: number;
  notes: string;
  status: "active" | "claimed" | "expired";
  deadline: string | null;
  tracked_at: string;
}

export interface Filter {
  id: number;
  keyword: string;
  category: string;
  active: number;
}

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;
  if (!existsSync(DB_DIR)) {
    Bun.spawnSync(["mkdir", "-p", DB_DIR]);
  }
  db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(d: Database) {
  d.run(`
    CREATE TABLE IF NOT EXISTS garapan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER UNIQUE NOT NULL,
      text TEXT NOT NULL,
      links TEXT DEFAULT '[]',
      posted_at TEXT NOT NULL,
      scraped_at TEXT DEFAULT (datetime('now')),
      flags TEXT DEFAULT '[]',
      telegram_url TEXT DEFAULT ''
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS tracked (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      garapan_id INTEGER NOT NULL REFERENCES garapan(id) ON DELETE CASCADE,
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','claimed','expired')),
      deadline TEXT,
      tracked_at TEXT DEFAULT (datetime('now'))
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT 'custom',
      active INTEGER DEFAULT 1
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS scrape_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      last_post_id INTEGER DEFAULT 0,
      last_check TEXT DEFAULT (datetime('now'))
    )
  `);

  d.run(`
    INSERT OR IGNORE INTO scrape_state (id, last_post_id) VALUES (1, 0)
  `);

  // Default filters if none exist
  const count = (d.query("SELECT COUNT(*) as c FROM filters").get() as any).c;
  if (count === 0) {
    const defaults = [
      ["testnet", "testnet"],
      ["devnet", "testnet"],
      ["test net", "testnet"],
      ["fcfs", "fcfs"],
      ["first come", "fcfs"],
      ["first-come", "fcfs"],
      ["reward", "reward"],
      ["hadiah", "reward"],
      ["allocation", "allocation"],
      ["alokasi", "allocation"],
      ["alloc", "allocation"],
      ["claim", "claim"],
      ["end date", "deadline"],
      ["deadline", "deadline"],
      ["berakhir", "deadline"],
    ];
    const insert = d.prepare("INSERT INTO filters (keyword, category) VALUES (?, ?)");
    for (const [kw, cat] of defaults) {
      insert.run(kw, cat);
    }
  }
}

// --- GARAPAN QUERIES ---

export function insertGarapan(post: {
  post_id: number;
  text: string;
  links: string[];
  posted_at: string;
  flags: string[];
  telegram_url: string;
}) {
  const d = getDb();
  const insert = d.prepare(`
    INSERT OR IGNORE INTO garapan (post_id, text, links, posted_at, flags, telegram_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    post.post_id,
    post.text,
    JSON.stringify(post.links),
    post.posted_at,
    JSON.stringify(post.flags),
    post.telegram_url,
  );
}

export function searchGarapan(params: {
  keyword?: string;
  categories?: string[];
  tracked?: boolean;
  status?: string;
  deadlineBefore?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: string;
}): { items: Garapan[]; total: number } {
  const d = getDb();
  const conditions: string[] = [];
  const args: any[] = [];

  if (params.keyword) {
    conditions.push("g.text LIKE ?");
    args.push(`%${params.keyword}%`);
  }

  if (params.categories && params.categories.length > 0) {
    const catConditions = params.categories.map(() => "EXISTS (SELECT 1 FROM filters f WHERE f.active = 1 AND f.category = ? AND LOWER(g.text) LIKE '%' || f.keyword || '%')");
    conditions.push(`(${catConditions.join(" OR ")})`);
    args.push(...params.categories);
  } else {
    // Default: use active filters
    conditions.push(`EXISTS (SELECT 1 FROM filters f WHERE f.active = 1 AND LOWER(g.text) LIKE '%' || f.keyword || '%')`);
  }

  if (params.tracked !== undefined) {
    conditions.push(params.tracked ? "t.id IS NOT NULL" : "t.id IS NULL");
  }

  if (params.status) {
    conditions.push("t.status = ?");
    args.push(params.status);
  }

  if (params.deadlineBefore) {
    conditions.push("t.deadline <= ? AND t.deadline != ''");
    args.push(params.deadlineBefore);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortBy = params.sortBy || "g.posted_at";
  const sortDir = params.sortDir === "asc" ? "ASC" : "DESC";
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  const countQ = d.query(`SELECT COUNT(*) as c FROM garapan g LEFT JOIN tracked t ON t.garapan_id = g.id ${where}`);
  const { c: total } = countQ.get(...args) as { c: number };

  const query = d.query(`
    SELECT g.*, t.id as track_id, t.notes, t.status as track_status, t.deadline, t.tracked_at
    FROM garapan g
    LEFT JOIN tracked t ON t.garapan_id = g.id
    ${where}
    ORDER BY ${sortBy} ${sortDir}
    LIMIT ? OFFSET ?
  `);

  const rows = query.all(...args, limit, offset) as any[];
  const items = rows.map(mapGarapan);
  return { items, total };
}

function mapGarapan(row: any): Garapan {
  return {
    id: row.id,
    post_id: row.post_id,
    text: row.text,
    links: row.links,
    posted_at: row.posted_at,
    scraped_at: row.scraped_at,
    flags: row.flags,
    telegram_url: row.telegram_url || `https://t.me/AirdropShogun/${row.post_id}`,
  };
}

export function getGarapanById(id: number): Garapan | null {
  const d = getDb();
  const row = d.query("SELECT * FROM garapan WHERE id = ?").get(id) as any;
  return row ? mapGarapan(row) : null;
}

export function getGarapanByPostId(postId: number): Garapan | null {
  const d = getDb();
  const row = d.query("SELECT * FROM garapan WHERE post_id = ?").get(postId) as any;
  return row ? mapGarapan(row) : null;
}

export function getScrapeState(): { last_post_id: number; last_check: string } {
  const d = getDb();
  const row = d.query("SELECT * FROM scrape_state WHERE id = 1").get() as any;
  return { last_post_id: row.last_post_id, last_check: row.last_check };
}

export function updateScrapeState(lastPostId: number) {
  const d = getDb();
  d.run("UPDATE scrape_state SET last_post_id = ?, last_check = datetime('now') WHERE id = 1", [lastPostId]);
}

// --- TRACKED QUERIES ---

export function trackGarapan(garapanId: number, notes: string = "", deadline: string | null = null): number {
  const d = getDb();
  const insert = d.prepare("INSERT INTO tracked (garapan_id, notes, deadline) VALUES (?, ?, ?)");
  insert.run(garapanId, notes, deadline);
  return (d.query("SELECT last_insert_rowid() as id").get() as any).id;
}

export function untrackGarapan(trackId: number) {
  const d = getDb();
  d.run("DELETE FROM tracked WHERE id = ?", [trackId]);
}

export function updateTracked(trackId: number, updates: { status?: string; notes?: string; deadline?: string }) {
  const d = getDb();
  const parts: string[] = [];
  const args: any[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      parts.push(`${k} = ?`);
      args.push(v);
    }
  }
  if (parts.length === 0) return;
  args.push(trackId);
  d.run(`UPDATE tracked SET ${parts.join(", ")} WHERE id = ?`, args);
}

export function getTrackedGarapan(): (Garapan & { track_id: number; notes: string; status: string; deadline: string | null; tracked_at: string })[] {
  const d = getDb();
  const rows = d.query(`
    SELECT g.*, t.id as track_id, t.notes, t.status, t.deadline, t.tracked_at
    FROM garapan g
    JOIN tracked t ON t.garapan_id = g.id
    ORDER BY t.deadline IS NULL ASC, t.deadline ASC, t.tracked_at DESC
  `).all() as any[];
  return rows.map((r: any) => ({
    ...mapGarapan(r),
    track_id: r.track_id,
    notes: r.notes,
    status: r.status,
    deadline: r.deadline,
    tracked_at: r.tracked_at,
  }));
}

export function getEndingSoonGarapan(hours: number = 24) {
  const d = getDb();
  const rows = d.query(`
    SELECT g.*, t.id as track_id, t.notes, t.status, t.deadline, t.tracked_at
    FROM garapan g
    JOIN tracked t ON t.garapan_id = g.id
    WHERE t.status = 'active'
      AND t.deadline IS NOT NULL
      AND t.deadline != ''
      AND datetime(t.deadline) <= datetime('now', ? || ' hours')
      AND datetime(t.deadline) >= datetime('now')
    ORDER BY t.deadline ASC
  `).all(`+${hours}`) as any[];
  return rows.map((r: any) => ({
    ...mapGarapan(r),
    track_id: r.track_id,
    notes: r.notes,
    status: r.status,
    deadline: r.deadline,
    tracked_at: r.tracked_at,
  }));
}

// --- FILTER QUERIES ---

export function getFilters(category?: string): Filter[] {
  const d = getDb();
  if (category) {
    return d.query("SELECT * FROM filters WHERE category = ? ORDER BY category, keyword").all(category) as Filter[];
  }
  return d.query("SELECT * FROM filters ORDER BY category, keyword").all() as Filter[];
}

export function addFilter(keyword: string, category: string = "custom"): number {
  const d = getDb();
  const insert = d.prepare("INSERT OR IGNORE INTO filters (keyword, category) VALUES (?, ?)");
  insert.run(keyword.toLowerCase(), category);
  return (d.query("SELECT last_insert_rowid() as id").get() as any).id;
}

export function removeFilter(id: number) {
  const d = getDb();
  d.run("DELETE FROM filters WHERE id = ? AND category = 'custom'", [id]);
}

export function toggleFilter(id: number) {
  const d = getDb();
  d.run("UPDATE filters SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?", [id]);
}

// --- STATS ---

export function getStats() {
  const d = getDb();
  const total = (d.query("SELECT COUNT(*) as c FROM garapan").get() as any).c;
  const activeFilters = (d.query("SELECT COUNT(*) as c FROM filters WHERE active = 1").get() as any).c;
  const filtered = (d.query("SELECT COUNT(*) as c FROM garapan g WHERE EXISTS (SELECT 1 FROM filters f WHERE f.active = 1 AND LOWER(g.text) LIKE '%' || f.keyword || '%')").get() as any).c;
  const tracked = (d.query("SELECT COUNT(*) as c FROM tracked").get() as any).c;
  const activeTracked = (d.query("SELECT COUNT(*) as c FROM tracked WHERE status = 'active'").get() as any).c;
  const claimed = (d.query("SELECT COUNT(*) as c FROM tracked WHERE status = 'claimed'").get() as any).c;
  const scrapeState = getScrapeState();

  return {
    totalGarapan: total,
    filteredGarapan: filtered,
    activeFilters,
    totalTracked: tracked,
    activeTracked,
    claimed,
    lastPostId: scrapeState.last_post_id,
    lastCheck: scrapeState.last_check,
  };
}
