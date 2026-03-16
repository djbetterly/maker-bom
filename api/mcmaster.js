// api/mcmaster.js — McMaster part lookup with mTLS certificate auth
const https  = require("https");
const forge  = require("node-forge");

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
  if (!certPem || !keyPem) throw new Error("Could not extract cert/key from PFX");
  return { certPem, keyPem };
}

function request(options, body, certPem, keyPem) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { ...options, host: BASE, cert: certPem, key: keyPem, rejectUnauthorized: false },
      res => {
        const chunks = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const ct  = res.headers["content-type"] || "";
          if (ct.includes("application/json")) {
            try { resolve({ status: res.statusCode, body: JSON.parse(buf.toString()), binary: false }); }
            catch { resolve({ status: res.statusCode, body: buf.toString(), binary: false }); }
          } else {
            resolve({ status: res.statusCode, body: buf, binary: true, contentType: ct });
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function authHeaders(token) {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
}

async function logout(certPem, keyPem, token) {
  return request({ path: "/v1/logout", method: "POST", headers: authHeaders(token) }, null, certPem, keyPem).catch(() => {});
}

function getPfxAndKey() {
  const certBase64 = (process.env.MCMASTER_CERT || "").replace(/\s+/g, "");
  if (!certBase64) throw new Error("MCMASTER_CERT not set");
  const pfxBuffer = Buffer.from(certBase64, "base64");
  return extractCertAndKey(pfxBuffer, process.env.MCMASTER_CERT_PASSWORD);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { partNumber } = req.body;
  if (!partNumber) return res.status(400).json({ error: "Missing partNumber" });

  let certPem, keyPem;
  try { ({ certPem, keyPem } = getPfxAndKey()); }
  catch (e) { return res.status(500).json({ error: "Cert error: " + e.message }); }

  let token = null;
  try {
    // 1. Login
    const loginRes = await request(
      { path: "/v1/login", method: "POST", headers: { "Content-Type": "application/json" } },
      { UserName: process.env.MCMASTER_USERNAME, Password: process.env.MCMASTER_PASSWORD },
      certPem, keyPem
    );
    if (loginRes.status !== 200)
      return res.status(401).json({ error: "McMaster login failed", detail: loginRes.body });
    token = loginRes.body.AuthToken;

    // 2. Subscribe / get product info
    const subRes = await request(
      { path: "/v1/products", method: "PUT", headers: authHeaders(token) },
      { URL: `https://mcmaster.com/${partNumber}` },
      certPem, keyPem
    );
    if (subRes.status !== 200 && subRes.status !== 201) {
      await logout(certPem, keyPem, token);
      return res.status(400).json({ error: "Part not found or invalid", detail: subRes.body });
    }
    const productData = subRes.body;

    // 3. Get price
    const priceRes = await request(
      { path: `/v1/products/${partNumber}/price`, method: "GET", headers: authHeaders(token) },
      null, certPem, keyPem
    );
    const prices = priceRes.status === 200 ? priceRes.body : [];

    // 4. Logout
    await logout(certPem, keyPem, token);

    // 5. Parse links
    const links = productData.Links || [];
    const getLink = key => links.find(l => l.Key === key)?.Value ?? null;

    const cadLinks = links
      .filter(l => ["2-D DWG", "3-D STEP", "3-D IGES", "3-D Parasolid"].includes(l.Key))
      .map(l => ({ label: l.Key, path: l.Value }));

    const datasheetLinks = links
      .filter(l => l.Key === "Datasheet" || l.Key?.toLowerCase().includes("datasheet"))
      .map(l => ({ label: l.Key, path: l.Value }));

    const imagePath = getLink("Image");

    const name = [productData.FamilyDescription, productData.DetailDescription].filter(Boolean).join(" — ");
    const priceTiers = (prices || [])
      .sort((a, b) => a.MinimumQuantity - b.MinimumQuantity)
      .map(p => ({ qty: p.MinimumQuantity, price: p.Amount, unit: p.UnitOfMeasure }));

    return res.status(200).json({
      partNumber: productData.PartNumber,
      name,
      status:     productData.ProductStatus,
      priceTiers,
      unitPrice:  priceTiers[0]?.price ?? null,
      url:        `https://www.mcmaster.com/${partNumber}/`,
      imagePath,
      cadLinks,
      datasheetLinks,
    });

  } catch (err) {
    if (token) await logout(certPem, keyPem, token).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
