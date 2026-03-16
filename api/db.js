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

// Password hashing — PBKDF2 with 600k iterations via Web Crypto API
// NIST SP 800-132 compliant; 600k iterations per OWASP 2023 recommendation for SHA-256
const PBKDF2_ITERATIONS = 600_000;
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, keyMaterial, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("");
}

// QUERIES — read-only Convex functions (called via client.query)
// NOTE: getPtUserByEmail is NOT exposed to clients — used server-side only for PT login
const QUERIES = new Set([
  "functions:getSessionByToken",
  "functions:getPatientByUserId",
  "functions:getPatientByEmail",
  "functions:listPatients",
  "functions:listPatientsByStatus",
  "functions:listAuditEvents",
  "functions:listOutcomeRecords",
  "functions:listDemoPatients",
  "functions:listPtUsers",
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
  "functions:createPtUser",
]);

// Functions requiring a valid session token
const AUTH_REQUIRED = new Set([
  "functions:getPatientByUserId",
  "functions:getPatientByEmail",
  "functions:listPatients",
  "functions:listPatientsByStatus",
  "functions:updatePatientPlan",
  "functions:updatePatientWeek8",
  "functions:listAuditEvents",
  "functions:listOutcomeRecords",
  "functions:listDemoPatients",
  "functions:completeOutcomeRecord",
  "functions:seedDemoPatient",
  "functions:listPtUsers",
  "functions:upsertPatient",
  "functions:insertAuditEvent",
  "functions:insertOutcomeRecord",
]);

// Role-based access — which userId prefixes can call which functions
const PT_ONLY = new Set([
  "functions:listPatients",
  "functions:listPatientsByStatus",
  "functions:updatePatientPlan",
  "functions:updatePatientWeek8",
  "functions:insertOutcomeRecord",
  "functions:completeOutcomeRecord",
  "functions:seedDemoPatient",
  "functions:listPtUsers",
]);
const OAIP_ONLY = new Set([
  "functions:listAuditEvents",
  "functions:listOutcomeRecords",
  "functions:listDemoPatients",
]);
const PATIENT_SELF = new Set([
  "functions:getPatientByUserId",
  "functions:getPatientByEmail",
  "functions:upsertPatient",
  "functions:insertAuditEvent",
]);

// OAIP shared access code — fail closed if env var not set
const OAIP_CODE = process.env.OAIP_ACCESS_CODE;
if (!OAIP_CODE) console.warn("[SECURITY] OAIP_ACCESS_CODE env var not set — OAIP login will be rejected");

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

  // Payload validation
  if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "Missing request body" });
  const bodyStr = JSON.stringify(req.body);
  if (bodyStr.length > 500_000) return res.status(413).json({ error: "Payload too large" });

  let { fn, args } = req.body;
  if (!fn || !ALLOWED.has(fn)) return res.status(400).json({ error: "Invalid function" });

  const client = await getClient();

  // Auth check + role-based authorization
  let authenticatedSession = null;
  if (AUTH_REQUIRED.has(fn)) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    try {
      const session = await client.query("functions:getSessionByToken", { sessionToken: token });
      if (!session || session.expiresAt < Date.now()) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      authenticatedSession = session;
    } catch (e) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    // Role-based authorization
    const uid = authenticatedSession.userId || "";
    const isPT = uid.startsWith("pt_");
    const isOAIP = uid === "oaip_user";
    const isPatient = uid.startsWith("usr_");

    if (PT_ONLY.has(fn) && !isPT) {
      return res.status(403).json({ error: "PT access required" });
    }
    if (OAIP_ONLY.has(fn) && !isOAIP && !isPT) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    if (PATIENT_SELF.has(fn) && isPatient) {
      // Patients can only access their own records
      if (fn === "functions:getPatientByUserId" && args?.userId !== uid) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (fn === "functions:getPatientByEmail" && args?.email !== authenticatedSession.email) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (fn === "functions:upsertPatient" && args?.userId !== uid) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (fn === "functions:insertAuditEvent") {
        // Enforce userId matches session — reject if missing or mismatched
        if (!args?.userId || args.userId !== uid) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
    }
  }

  // deleteSession: require sessionToken arg
  if (fn === "functions:deleteSession") {
    if (!args?.sessionToken) return res.status(400).json({ error: "Missing session token" });
  }

  // Session creation — PT uses email+password, OAIP uses shared access code
  if (fn === "functions:createSession") {
    const { accessCode, email, password, ...sessionArgs } = args;

    if (sessionArgs.userId === "oaip_user") {
      // OAIP: shared access code — fail closed if env var not configured
      if (!OAIP_CODE || !accessCode || accessCode !== OAIP_CODE) {
        return res.status(403).json({ error: "Invalid access code" });
      }
    } else if (email && password) {
      // PT: individual email + password login
      try {
        const ptUser = await client.query("functions:getPtUserByEmail", { email: email.toLowerCase().trim() });
        if (!ptUser || !ptUser.active) {
          return res.status(403).json({ error: "Invalid email or password" });
        }
        const hash = await hashPassword(password, ptUser.salt);
        if (hash !== ptUser.passwordHash) {
          return res.status(403).json({ error: "Invalid email or password" });
        }
        // Set session identity to individual PT
        sessionArgs.userId = "pt_" + ptUser.email;
        sessionArgs.email = ptUser.email;
        sessionArgs.ptName = ptUser.name;
      } catch (e) {
        return res.status(403).json({ error: "Invalid email or password" });
      }
    } else {
      return res.status(403).json({ error: "Invalid credentials" });
    }

    args = sessionArgs;
  }

  // createPtUser: require SEED_SECRET for admin seeding
  if (fn === "functions:createPtUser") {
    const seedSecret = process.env.SEED_SECRET;
    if (!seedSecret || args?.seedSecret !== seedSecret) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const salt = generateSalt();
    const passwordHash = await hashPassword(args.password, salt);
    args = {
      email: args.email.toLowerCase().trim(),
      name: args.name,
      passwordHash,
      salt,
      role: args.role || "pt",
      active: true,
      createdAt: new Date().toISOString(),
    };
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
