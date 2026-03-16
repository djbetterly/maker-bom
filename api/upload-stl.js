// api/upload-stl.js — Upload STL/3D files to Vercel Blob
import { put } from "@vercel/blob";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-filename");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const filename = req.headers["x-filename"] || "model.stl";

  try {
    // Stream the body directly to Vercel Blob
    const blob = await put(`stl-files/${filename}`, req, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return res.status(200).json({ url: blob.url, filename });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
