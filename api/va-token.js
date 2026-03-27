// Vercel serverless function — exchanges OAuth 2.0 authorization code for access token
// via VA Lighthouse Clinical Health API token endpoint (PKCE flow)
// Accepts POST with { code, code_verifier, redirect_uri }

export const config = { maxDuration: 15 };

const VA_CLIENT_ID = (process.env.VA_CLIENT_ID || "").trim();
const VA_TOKEN_URL = (process.env.VA_TOKEN_URL || "https://sandbox-api.va.gov/oauth2/clinical-health/v1/token").trim();

// Rate limiter — 10 token exchanges per 5 min per IP
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  let entry = rateMap.get(ip);
  if (!entry || now - entry.start > 300000) { entry = { start: now, count: 0 }; rateMap.set(ip, entry); }
  entry.count++;
  if (rateMap.size > 500) { for (const [k, v] of rateMap) { if (now - v.start > 300000) rateMap.delete(k); } }
  return entry.count <= 10;
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

  if (!VA_CLIENT_ID) return res.status(500).json({ error: "VA integration not configured" });

  const { code, code_verifier, redirect_uri } = req.body || {};
  if (!code || !code_verifier || !redirect_uri) {
    return res.status(400).json({ error: "Missing required fields: code, code_verifier, redirect_uri" });
  }

  try {
    const tokenRes = await fetch(VA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier,
        redirect_uri,
        client_id: VA_CLIENT_ID,
      }).toString(),
    });

    if (tokenRes.status === 429) {
      const retryAfter = tokenRes.headers.get("Retry-After") || "60";
      return res.status(429).json({ error: "rate_limited", retryAfter: parseInt(retryAfter, 10) });
    }

    if (!tokenRes.ok) {
      // Log status only — no PHI
      console.error("VA token exchange failed:", tokenRes.status);
      const status = tokenRes.status;
      if (status === 401 || status === 400) {
        return res.status(401).json({ error: "invalid_grant", detail: "Authorization code is invalid or expired" });
      }
      return res.status(502).json({ error: "va_token_error", detail: `VA returned ${status}` });
    }

    const data = await tokenRes.json();

    // Return only the fields the client needs
    return res.status(200).json({
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      scope: data.scope,
      patient: data.patient, // VA ICN (internal control number)
    });
  } catch (e) {
    console.error("VA token exchange error:", e.code || "UNKNOWN");
    return res.status(502).json({ error: "va_unavailable", detail: "Could not reach VA authentication service" });
  }
}
