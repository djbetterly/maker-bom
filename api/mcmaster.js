// api/mcmaster.js — McMaster part lookup with mTLS certificate auth
const https = require("https");

const BASE = "api.mcmaster.com";

function request(options, body, pfx, passphrase) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { ...options, host: BASE, pfx, passphrase, rejectUnauthorized: true },
      res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { partNumber } = req.body;
  if (!partNumber) return res.status(400).json({ error: "Missing partNumber" });

  // Strip any whitespace/newlines from the base64 cert env var
  const certBase64 = (process.env.MCMASTER_CERT || "").replace(/\s+/g, "");
  if (!certBase64) return res.status(500).json({ error: "MCMASTER_CERT env var not set" });

  let pfx;
  try {
    pfx = Buffer.from(certBase64, "base64");
  } catch (e) {
    return res.status(500).json({ error: "Failed to decode cert: " + e.message });
  }

  const passphrase = process.env.MCMASTER_CERT_PASSWORD;

  let token = null;

  try {
    // 1. Login
    const loginRes = await request(
      { path: "/v1/login", method: "POST", headers: { "Content-Type": "application/json" } },
      { UserName: process.env.MCMASTER_USERNAME, Password: process.env.MCMASTER_PASSWORD },
      pfx, passphrase
    );
    if (loginRes.status !== 200) {
      return res.status(401).json({ error: "McMaster login failed", detail: loginRes.body });
    }
    token = loginRes.body.AuthToken;

    // 2. Subscribe to product
    const subRes = await request(
      { path: "/v1/products", method: "PUT", headers: authHeaders(token) },
      { URL: `https://mcmaster.com/${partNumber}` },
      pfx, passphrase
    );
    if (subRes.status !== 200 && subRes.status !== 201) {
      await logout(pfx, passphrase, token);
      return res.status(400).json({ error: "Part not found or invalid", detail: subRes.body });
    }
    const productData = subRes.body;

    // 3. Get current price
    const priceRes = await request(
      { path: `/v1/products/${partNumber}/price`, method: "GET", headers: authHeaders(token) },
      null, pfx, passphrase
    );
    const prices = priceRes.status === 200 ? priceRes.body : [];

    // 4. Logout
    await logout(pfx, passphrase, token);

    // 5. Shape response
    const name = [productData.FamilyDescription, productData.DetailDescription]
      .filter(Boolean).join(" — ");

    const priceTiers = (prices || [])
      .sort((a, b) => a.MinimumQuantity - b.MinimumQuantity)
      .map(p => ({ qty: p.MinimumQuantity, price: p.Amount, unit: p.UnitOfMeasure }));

    return res.status(200).json({
      partNumber:  productData.PartNumber,
      name,
      status:      productData.ProductStatus,
      priceTiers,
      unitPrice:   priceTiers[0]?.price ?? null,
      url:         `https://www.mcmaster.com/${partNumber}/`,
    });

  } catch (err) {
    if (token) await logout(pfx, passphrase, token).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}

async function logout(pfx, passphrase, token) {
  return request(
    { path: "/v1/logout", method: "POST", headers: authHeaders(token) },
    null, pfx, passphrase
  ).catch(() => {});
}
