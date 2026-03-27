// Vercel serverless function — sends encounter note fax via Telnyx Programmable Fax API
// Accepts POST with { to, encounterNote, patientName, physicianName }
// Generates a minimal PDF from the text, uploads to Telnyx Media Storage, then sends fax

export const config = { maxDuration: 25 };

const TELNYX_API_KEY = (process.env.TELNYX_API_KEY || "").trim();
const TELNYX_FAX_FROM = (process.env.TELNYX_FAX_FROM || "+18015003762").trim();
const TELNYX_CONNECTION_ID = (process.env.TELNYX_CONNECTION_ID || "2924437248428475757").trim();

// Rate limiter
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  let entry = rateMap.get(ip);
  if (!entry || now - entry.start > 300000) { entry = { start: now, count: 0 }; rateMap.set(ip, entry); }
  entry.count++;
  if (rateMap.size > 500) { for (const [k, v] of rateMap) { if (now - v.start > 300000) rateMap.delete(k); } }
  return entry.count <= 10; // 10 faxes per 5 min per IP
}

// Generate a minimal valid PDF from plain text
function textToPdf(text) {
  const lines = text.split("\n");
  const pageHeight = 792;
  const pageWidth = 612;
  const margin = 50;
  const lineHeight = 11;
  const maxCharsPerLine = 90;
  const usableHeight = pageHeight - 2 * margin;
  const linesPerPage = Math.floor(usableHeight / lineHeight);

  const wrapped = [];
  for (const line of lines) {
    if (line.length <= maxCharsPerLine) { wrapped.push(line); continue; }
    let remaining = line;
    while (remaining.length > maxCharsPerLine) {
      let breakAt = remaining.lastIndexOf(" ", maxCharsPerLine);
      if (breakAt <= 0) breakAt = maxCharsPerLine;
      wrapped.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) wrapped.push(remaining);
  }

  const pages = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([""]);

  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const finalObjects = [];
  finalObjects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
  finalObjects.push(`2 0 obj\n<< /Type /Pages /Kids [${pages.map((_, i) => (4 + i * 2) + " 0 R").join(" ")}] /Count ${pages.length} >>\nendobj`);
  finalObjects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj`);

  let nextId = 4;
  for (const page of pages) {
    const contentId = nextId;
    const pageId = nextId + 1;
    let stream = "BT\n/F1 9 Tf\n";
    let y = pageHeight - margin;
    for (const line of page) {
      stream += `${margin} ${y} Td\n(${esc(line)}) Tj\n${-margin} ${-y} Td\n`;
      y -= lineHeight;
    }
    stream += "ET";
    finalObjects.push(`${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`);
    finalObjects.push(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj`);
    nextId += 2;
  }

  const totalObjs = 3 + pages.length * 2;
  let pdf = "%PDF-1.4\n";
  const objOffsets = [];
  for (const obj of finalObjects) {
    objOffsets.push(pdf.length);
    pdf += obj + "\n";
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${totalObjs + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of objOffsets) {
    pdf += String(off).padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

export default async function handler(req, res) {
  const allowed = process.env.CORS_ORIGIN || "https://expecthealth.com";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (!checkRate(ip)) return res.status(429).json({ error: "Rate limit exceeded" });

  if (!TELNYX_API_KEY) return res.status(500).json({ error: "Fax service not configured" });

  const { to, encounterNote, patientName, physicianName } = req.body || {};
  if (!to || !encounterNote) return res.status(400).json({ error: "Missing required fields: to, encounterNote" });

  const faxTo = to.replace(/[^\d+]/g, "").replace(/^(\d{10})$/, "+1$1");
  if (!/^\+1\d{10}$/.test(faxTo)) return res.status(400).json({ error: "Invalid fax number format" });

  try {
    const pdfBuffer = textToPdf(encounterNote);

    // Upload to Telnyx Media Storage
    const mediaName = `encounter-note-${Date.now()}.pdf`;
    const boundary = "----TelnyxBoundary" + Date.now();
    const bodyParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="media_name"\r\n\r\n${mediaName}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${mediaName}"\r\nContent-Type: application/pdf\r\n\r\n`,
    ];
    const bodyStart = Buffer.from(bodyParts[0] + bodyParts[1], "utf-8");
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
    const multipartBody = Buffer.concat([bodyStart, pdfBuffer, bodyEnd]);

    const uploadRes = await fetch("https://api.telnyx.com/v2/media", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TELNYX_API_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return res.status(502).json({ error: "Media upload failed", detail: err });
    }

    // Send fax using uploaded media
    const faxRes = await fetch("https://api.telnyx.com/v2/faxes", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: faxTo,
        from: TELNYX_FAX_FROM,
        connection_id: TELNYX_CONNECTION_ID,
        media_name: mediaName,
        quality: "high",
        monochrome: true,
      }),
    });

    const faxData = await faxRes.json();

    if (!faxRes.ok) {
      return res.status(502).json({ error: "Fax send failed", detail: faxData });
    }

    return res.status(200).json({
      success: true,
      faxId: faxData.data?.id,
      status: faxData.data?.status,
      to: faxTo,
      from: TELNYX_FAX_FROM,
    });
  } catch (e) {
    return res.status(500).json({ error: "Fax service error", detail: e.message });
  }
}
