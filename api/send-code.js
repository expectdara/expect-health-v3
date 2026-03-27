// Vercel serverless function — sends a 6-digit email verification code via Resend
// Accepts POST with { email, purpose }
// purpose: "signup" | "login" | "reset"
// No PHI is logged — only purpose and success/failure

export const config = { maxDuration: 10 };

// In-memory code store (resets on cold start — acceptable for serverless)
// Key: email_purpose, Value: { code, expires, attempts }
const codeStore = new Map();
const MAX_ATTEMPTS = 5;
const CODE_TTL = 10 * 60 * 1000; // 10 minutes

// Rate limiter — 6 codes per 15 min per IP
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  let entry = rateMap.get(ip);
  if (!entry || now - entry.start > 900000) {
    entry = { start: now, count: 0 };
    rateMap.set(ip, entry);
  }
  entry.count++;
  if (rateMap.size > 500) {
    for (const [k, v] of rateMap) {
      if (now - v.start > 900000) rateMap.delete(k);
    }
  }
  return entry.count <= 6;
}

function generateCode() {
  const arr = new Uint32Array(1);
  require("crypto").getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
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
  if (!checkRate(ip)) return res.status(429).json({ error: "Too many requests. Please wait a few minutes." });

  const { email, purpose, action } = req.body || {};

  // VERIFY action — check a code without sending a new one
  if (action === "verify") {
    if (!email || !purpose) return res.status(400).json({ error: "Missing email or purpose" });
    const key = `${email.trim().toLowerCase()}_${purpose}`;
    const entry = codeStore.get(key);
    if (!entry || Date.now() > entry.expires) {
      codeStore.delete(key);
      return res.status(400).json({ error: "Code expired or not found. Please request a new code." });
    }
    if (entry.attempts >= MAX_ATTEMPTS) {
      codeStore.delete(key);
      return res.status(400).json({ error: "Too many attempts. Please request a new code." });
    }
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Missing code" });
    entry.attempts++;
    if (code === entry.code) {
      codeStore.delete(key);
      return res.status(200).json({ ok: true, verified: true });
    }
    return res.status(400).json({ error: "Incorrect code. Please try again.", attemptsLeft: MAX_ATTEMPTS - entry.attempts });
  }

  // SEND action (default) — generate and email a code
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email required" });
  }
  if (!["signup", "login", "reset"].includes(purpose)) {
    return res.status(400).json({ error: "Invalid purpose" });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: "Email service not configured" });
  }

  const em = email.trim().toLowerCase();
  const code = generateCode();
  const key = `${em}_${purpose}`;

  // Store code
  codeStore.set(key, { code, expires: Date.now() + CODE_TTL, attempts: 0 });

  // Cleanup expired entries
  if (codeStore.size > 500) {
    const now = Date.now();
    for (const [k, v] of codeStore) {
      if (now > v.expires) codeStore.delete(k);
    }
  }

  const purposeText = {
    signup: "Complete your Expect Health registration",
    login: "Sign in to your Expect Health account",
    reset: "Reset your Expect Health password"
  }[purpose];

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Expect Health <notifications@expect.care>",
      to: [em],
      subject: `${code} — Your Expect Health verification code`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
<tr><td style="background:linear-gradient(135deg,#4C2C84 0%,#C91A6E 50%,#E879A8 100%);padding:32px 20px;text-align:center">
<span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:8px">E X P E C T</span>
</td></tr>
<tr><td style="padding:40px;text-align:center">
<p style="margin:0 0 8px;font-size:14px;color:#6B7280">${purposeText}</p>
<p style="margin:0 0 24px;font-size:14px;color:#6B7280">Your verification code is:</p>
<div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1F2937;padding:20px 0;background:#F9FAFB;border-radius:12px;margin:0 40px">${code}</div>
<p style="margin:24px 0 0;font-size:13px;color:#9CA3AF">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
</td></tr>
<tr><td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #F3F4F6">
<p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center">Do not reply to this email. This inbox is not monitored.</p>
</td></tr>
</table>
<p style="margin:24px 0 0;font-size:11px;color:#9CA3AF;text-align:center">&copy; 2026 Expect. All rights reserved.</p>
</td></tr>
</table>
</body></html>`
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Send code error:", e.code || "UNKNOWN");
    return res.status(502).json({ error: "Failed to send verification email. Please try again." });
  }
}
