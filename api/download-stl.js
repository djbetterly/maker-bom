// api/download-stl.js — Proxy downloads for private Vercel Blob STL files
import { head } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  try {
    // Fetch the blob via server-side request (has token access)
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!response.ok) return res.status(response.status).json({ error: "File not found" });

    const filename = url.split("/").pop().split("?")[0];
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const buffer = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
