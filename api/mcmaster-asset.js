// api/mcmaster-asset.js — Proxy for McMaster images, CAD, and datasheets
// These require mTLS auth so they can't be linked directly
const https = require("https");
const forge = require("node-forge");

const BASE = "api.mcmaster.com";

function extractCertAndKey(pfxBuffer, passphrase) {
  const p12Der = forge.util.createBuffer(pfxBuffer.toString("binary"));
  const p12    = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12Der), false, passphrase);
  let certPem = null, keyPem = null;
  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.type === forge.pki.oids.certBag)
        certPem = forge.pki.certificateToPem(safeBag.cert);
      else if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag)
        keyPem = forge.pki.privateKeyToPem(safeBag.key);
    }
  }
  if (!certPem || !keyPem) throw new Error("Could not extract cert/key");
  return { certPem, keyPem };
}

function rawRequest(options, certPem, keyPem) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { ...options, host: BASE, cert: certPem, key: keyPem, rejectUnauthorized: false },
      res => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function jsonRequest(options, body, certPem, keyPem) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { ...options, host: BASE, cert: certPem, key: keyPem, rejectUnauthorized: false },
      res => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Guess content type from path
function guessContentType(path) {
  const p = path.toLowerCase();
  if (p.endsWith(".png"))  return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".gif"))  return "image/gif";
  if (p.endsWith(".pdf"))  return "application/pdf";
  if (p.endsWith(".dwg"))  return "application/acad";
  if (p.endsWith(".step") || p.endsWith(".stp")) return "application/step";
  if (p.endsWith(".igs") || p.endsWith(".iges")) return "application/iges";
  return "application/octet-stream";
}

function guessFilename(path) {
  return path.split("/").pop().split("?")[0] || "mcmaster-file";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const assetPath = req.query.path;
  if (!assetPath) return res.status(400).json({ error: "Missing path" });

  // Only allow McMaster asset paths
  if (!assetPath.startsWith("/v1/images/") &&
      !assetPath.startsWith("/v1/cad/") &&
      !assetPath.startsWith("/v1/datasheets/")) {
    return res.status(400).json({ error: "Invalid asset path" });
  }

  let certPem, keyPem;
  try {
    const certBase64 = (process.env.MCMASTER_CERT || "").replace(/\s+/g, "");
    ({ certPem, keyPem } = extractCertAndKey(Buffer.from(certBase64, "base64"), process.env.MCMASTER_CERT_PASSWORD));
  } catch (e) {
    return res.status(500).json({ error: "Cert error: " + e.message });
  }

  let token = null;
  try {
    // Login
    const loginRes = await jsonRequest(
      { path: "/v1/login", method: "POST", headers: { "Content-Type": "application/json" } },
      { UserName: process.env.MCMASTER_USERNAME, Password: process.env.MCMASTER_PASSWORD },
      certPem, keyPem
    );
    if (loginRes.status !== 200)
      return res.status(401).json({ error: "Login failed" });
    token = loginRes.body.AuthToken;

    // Fetch asset
    const assetRes = await rawRequest(
      { path: assetPath, method: "GET", headers: { "Authorization": `Bearer ${token}` } },
      certPem, keyPem
    );

    // Logout (fire and forget)
    jsonRequest(
      { path: "/v1/logout", method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` } },
      null, certPem, keyPem
    ).catch(() => {});

    if (assetRes.status !== 200)
      return res.status(assetRes.status).json({ error: "Asset fetch failed" });

    const ct       = assetRes.headers["content-type"] || guessContentType(assetPath);
    const filename = guessFilename(assetPath);
    const isInline = ct.startsWith("image/");

    res.setHeader("Content-Type", ct);
    res.setHeader("Content-Disposition", `${isInline ? "inline" : "attachment"}; filename="${filename}"`);
    res.setHeader("Cache-Control", "public, max-age=86400"); // cache 24h
    return res.status(200).send(assetRes.body);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
