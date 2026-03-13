// api/data.js — Vercel serverless function for Redis sync
// Upstash injects KV_REST_API_URL and KV_REST_API_TOKEN via Vercel marketplace

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kv(method, ...args) {
  const res = await fetch(`${KV_URL}/${[method, ...args].map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  return json.result;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      const [projects, settings, filaments] = await Promise.all([
        kv("GET", "maker_bom_projects"),
        kv("GET", "maker_bom_settings"),
        kv("GET", "maker_bom_filaments"),
      ]);
      return res.status(200).json({
        projects:  projects  ? JSON.parse(projects)  : null,
        settings:  settings  ? JSON.parse(settings)  : null,
        filaments: filaments ? JSON.parse(filaments) : null,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "POST") {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: "Missing key or value" });
      await kv("SET", key, JSON.stringify(value));
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
