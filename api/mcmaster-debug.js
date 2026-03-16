// api/mcmaster-debug.js — temporary debug endpoint, delete after fixing
export default async function handler(req, res) {
  const raw = process.env.MCMASTER_CERT || "";
  const cleaned = raw.replace(/\s+/g, "");
  
  let bufLen = 0;
  let firstBytes = "";
  let lastBytes = "";
  let bufErr = null;

  try {
    const buf = Buffer.from(cleaned, "base64");
    bufLen = buf.length;
    firstBytes = buf.slice(0, 4).toString("hex"); // PFX should start with 3082 or 0200
    lastBytes  = buf.slice(-4).toString("hex");
  } catch(e) {
    bufErr = e.message;
  }

  return res.status(200).json({
    rawLength:     raw.length,
    cleanedLength: cleaned.length,
    hasNewlines:   raw.includes("\n"),
    hasSpaces:     raw.includes(" "),
    bufferBytes:   bufLen,
    firstHex:      firstBytes, // valid PFX starts with 3082
    lastHex:       lastBytes,
    bufferError:   bufErr,
    userSet:       !!process.env.MCMASTER_USERNAME,
    passSet:       !!process.env.MCMASTER_CERT_PASSWORD,
  });
}
