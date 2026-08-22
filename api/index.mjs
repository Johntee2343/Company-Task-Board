import pg from "pg";
import worker from "../worker/index.js";

const { Pool } = pg;

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 4 })
  : null;

function placeholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function translate(sql, params) {
  let text = sql.trim();
  const pragma = text.match(/^PRAGMA\s+table_info\(([^)]+)\)$/i);
  if (pragma) {
    return {
      text: "select column_name as name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
      values: [pragma[1].replace(/["'`]/g, "")],
    };
  }

  text = text.replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO");
  if (/^INSERT INTO/i.test(text) && !/ON CONFLICT/i.test(text)) {
    if (/task_statuses/i.test(text) || /task_tags/i.test(text)) text += " ON CONFLICT DO NOTHING";
  }

  text = text
    .replace(/datetime\(s\.expires_at\)>datetime\('now'\)/g, "s.expires_at::timestamptz > now()")
    .replace(
      /datetime\(COALESCE\(t\.completed_at,t\.updated_at\)\)>=datetime\('now','-7 days'\)/g,
      "COALESCE(t.completed_at,t.updated_at)::timestamptz >= now() - interval '7 days'",
    )
    .replace(/ORDER BY datetime\(t\.created_at\) DESC/g, "ORDER BY t.created_at::timestamptz DESC");

  return { text: placeholders(text), values: params };
}

class PgStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }
  bind(...params) {
    this.params = params;
    return this;
  }
  async all() {
    const result = await this.db.query(this.sql, this.params);
    return { results: result.rows };
  }
  async first() {
    const result = await this.db.query(this.sql, this.params);
    return result.rows[0] || null;
  }
  async run() {
    const result = await this.db.query(this.sql, this.params);
    return { success: true, meta: { changes: result.rowCount } };
  }
}

class PgD1 {
  constructor(pool) {
    this.pool = pool;
  }
  prepare(sql) {
    return new PgStatement(this, sql);
  }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
  async query(sql, params = []) {
    const { text, values } = translate(sql, params);
    return this.pool.query(text, values);
  }
}

function requestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function incomingHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value != null) headers.set(key, String(value));
  }
  return headers;
}

export default async function handler(req, res) {
  if (!pool) {
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Missing SUPABASE_DATABASE_URL.");
    return;
  }

  const host = req.headers.host || "localhost";
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const url = new URL(req.url || "/", `${protocol}://${host}`);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await requestBody(req);
  const request = new Request(url, {
    method: req.method,
    headers: incomingHeaders(req),
    body,
  });

  const response = await worker.fetch(request, { DB: new PgD1(pool) });
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
