// api/mcmaster.js — McMaster part lookup with mTLS certificate auth
const https = require("https");

const BASE = "api.mcmaster.com";

// Make an HTTPS request with the mTLS cert attached
function request(options, body) {
  return new Promise((resolve, reject) => {
    const pfx    = Buffer.from(process.env.MCMASTER_CERT, "base64");
    const passphrase = process.env.MCMASTER_CERT_PASSWORD;

    const req = https.request({ ...options, host: BASE, pfx, passphrase }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
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

  let token = null;

  try {
    // 1. Login
    const loginRes = await request(
      { path: "/v1/login", method: "POST", headers: { "Content-Type": "application/json" } },
      { UserName: process.env.MCMASTER_USERNAME, Password: process.env.MCMASTER_PASSWORD }
    );
    if (loginRes.status !== 200) {
      return res.status(401).json({ error: "McMaster login failed", detail: loginRes.body });
    }
    token = loginRes.body.AuthToken;

    // 2. Subscribe to product (required before fetching info)
    const subRes = await request(
      { path: "/v1/products", method: "PUT", headers: authHeaders(token) },
      { URL: `https://mcmaster.com/${partNumber}` }
    );
    if (subRes.status !== 200 && subRes.status !== 201) {
      return res.status(400).json({ error: "Part not found or invalid", detail: subRes.body });
    }
    const productData = subRes.body;

    // 3. Get current price
    const priceRes = await request(
      { path: `/v1/products/${partNumber}/price`, method: "GET", headers: authHeaders(token) },
      null
    );
    const prices = priceRes.status === 200 ? priceRes.body : [];

    // 4. Logout to clean up token
    await request(
      { path: "/v1/logout", method: "POST", headers: authHeaders(token) },
      null
    ).catch(() => {});

    // 5. Shape the response for the app
    const name = [productData.FamilyDescription, productData.DetailDescription]
      .filter(Boolean).join(" — ");

    // Price tiers sorted by minimum quantity
    const priceTiers = (prices || [])
      .sort((a, b) => a.MinimumQuantity - b.MinimumQuantity)
      .map(p => ({ qty: p.MinimumQuantity, price: p.Amount, unit: p.UnitOfMeasure }));

    const unitPrice = priceTiers[0]?.price ?? null;

    return res.status(200).json({
      partNumber:  productData.PartNumber,
      name,
      status:      productData.ProductStatus,
      priceTiers,
      unitPrice,
      url:         `https://www.mcmaster.com/${partNumber}/`,
    });

  } catch (err) {
    // Always try to logout if we have a token
    if (token) {
      await request(
        { path: "/v1/logout", method: "POST", headers: authHeaders(token) },
        null
      ).catch(() => {});
    }
    return res.status(500).json({ error: err.message });
  }
}
