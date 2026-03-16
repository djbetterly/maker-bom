// api/data.js — Vercel serverless function for Redis sync using REDIS_URL
import Redis from "ioredis";

let client;
function getClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      tls: process.env.REDIS_URL?.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
    });
  }
  return client;
}

const KEYS = ["maker_bom_projects", "maker_bom_settings", "maker_bom_filaments", "maker_bom_catalog"];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const redis = getClient();

  if (req.method === "GET") {
    try {
      const [projects, settings, filaments, catalog] = await Promise.all(
        KEYS.map(k => redis.get(k))
      );
      return res.status(200).json({
        projects:  projects  ? JSON.parse(projects)  : null,
        settings:  settings  ? JSON.parse(settings)  : null,
        filaments: filaments ? JSON.parse(filaments) : null,
        catalog:   catalog   ? JSON.parse(catalog)   : null,
      });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === "POST") {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: "Missing key or value" });
      await redis.set(key, JSON.stringify(value));
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
