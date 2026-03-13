// Lazy client — dynamic import avoids module-load crash on Vercel
let _client;
async function getClient() {
  if (!_client) {
    const { ConvexHttpClient } = await import("convex/browser");
    _client = new ConvexHttpClient(process.env.CONVEX_URL);
  }
  return _client;
}

// In-memory rate limiter (resets on cold start, sufficient for serverless)
const rateMap = new Map();
const RATE_WINDOW = 60_000; // 1 minute
const RATE_LIMIT = 60; // max requests per window per IP

function checkRate(ip) {
  const now = Date.now();
  let entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    entry = { start: now, count: 0 };
    rateMap.set(ip, entry);
  }
  entry.count++;
  if (rateMap.size > 1000) {
    for (const [k, v] of rateMap) {
      if (now - v.start > RATE_WINDOW) rateMap.delete(k);
    }
  }
  return entry.count <= RATE_LIMIT;
}

const QUERIES = new Set([
  "functions:getSessionByToken",
  "functions:getPatientByUserId",
  "functions:getPatientByEmail",
  "functions:listPatients",
  "functions:listPatientsByStatus",
  "functions:listAuditEvents",
  "functions:listOutcomeRecords",
  "functions:listDemoPatients",
]);

const ALLOWED = new Set([
  ...QUERIES,
  "functions:createSession",
  "functions:deleteSession",
  "functions:upsertPatient",
  "functions:updatePatientPlan",
  "functions:updatePatientWeek8",
  "functions:insertAuditEvent",
  "functions:insertOutcomeRecord",
  "functions:completeOutcomeRecord",
  "functions:seedDemoPatient",
]);

// PT/OAIP-only functions — require valid session token
const AUTH_REQUIRED = new Set([
  "functions:listPatients",
  "functions:listPatientsByStatus",
  "functions:updatePatientPlan",
  "functions:updatePatientWeek8",
  "functions:listAuditEvents",
  "functions:listOutcomeRecords",
  "functions:listDemoPatients",
  "functions:completeOutcomeRecord",
  "functions:seedDemoPatient",
]);

// Access codes for session creation (server-side verification)
const ACCESS_CODES = {
  pt_user: process.env.PT_ACCESS_CODE || "expect2026pt",
  oaip_user: process.env.OAIP_ACCESS_CODE || "expect2026oaip",
};

export default async function handler(req, res) {
  const allowed = process.env.CORS_ORIGIN || "https://expecthealth.com";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Rate limiting
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (!checkRate(ip)) return res.status(429).json({ error: "Too many requests" });

  if (!process.env.CONVEX_URL) return res.status(503).json({ error: "Database not configured" });

  let { fn, args } = req.body;
  if (!fn || !ALLOWED.has(fn)) return res.status(400).json({ error: "Invalid function" });

  const client = await getClient();

  // Auth check for PT/OAIP-only functions
  if (AUTH_REQUIRED.has(fn)) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    try {
      const session = await client.query("functions:getSessionByToken", { sessionToken: token });
      if (!session || session.expiresAt < Date.now()) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
    } catch (e) {
      return res.status(401).json({ error: "Authentication failed" });
    }
  }

  // deleteSession: only allow deleting sessions that exist (self-deletion)
  if (fn === "functions:deleteSession") {
    if (!args?.sessionToken) return res.status(400).json({ error: "Missing session token" });
  }

  // Server-side access code verification for session creation
  if (fn === "functions:createSession") {
    const code = args?.accessCode;
    const userId = args?.userId;
    if (!code || !userId || ACCESS_CODES[userId] !== code) {
      return res.status(403).json({ error: "Invalid access code" });
    }
    // Strip accessCode before passing to Convex
    const { accessCode: _, ...cleanArgs } = args;
    args = cleanArgs;
  }

  try {
    const result = QUERIES.has(fn)
      ? await client.query(fn, args || {})
      : await client.mutation(fn, args || {});
    res.status(200).json({ ok: true, result });
  } catch (e) {
    console.error("Convex proxy error:", e.message);
    res.status(502).json({ error: e.message || "Database unavailable" });
  }
}
