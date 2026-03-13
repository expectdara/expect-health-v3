import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient(process.env.CONVEX_URL);

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
  // Prune stale entries periodically
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

export default async function handler(req, res) {
  const allowed = process.env.CORS_ORIGIN || "https://expecthealth.com";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Rate limiting
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (!checkRate(ip)) return res.status(429).json({ error: "Too many requests" });

  const { fn, args } = req.body;
  if (!fn || !ALLOWED.has(fn)) return res.status(400).json({ error: "Invalid function" });

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
