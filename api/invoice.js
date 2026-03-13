// api/invoice.js — Extract McMaster line items from a PDF invoice using Claude

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { pdfBase64 } = req.body;
  if (!pdfBase64) return res.status(400).json({ error: "Missing pdfBase64" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              {
                type: "text",
                text: `Extract all line items from this McMaster-Carr invoice.

Return ONLY a JSON array — no preamble, no markdown, no backticks. Each object must have exactly these fields:
- "name": product description (concise, e.g. "M3x8 Socket Head Cap Screw")
- "partNumber": McMaster part number (e.g. "91292A113")
- "pkgQty": quantity per package as a number (e.g. 100)
- "pkgPrice": price paid for that package as a number (e.g. 8.74)
- "unitCost": pkgPrice divided by pkgQty, rounded to 4 decimal places
- "notes": any additional spec info from the description (material, finish, size details), or empty string

If a field is not determinable, use null for numbers and "" for strings.
Only include actual product line items — skip shipping, tax, totals, and header rows.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Claude API error: ${err}` });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === "text")?.text ?? "";

    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, "").trim();
    const parts = JSON.parse(clean);

    return res.status(200).json({ parts });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
