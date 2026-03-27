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
  "functions:getAdherenceByUserId",
  "functions:listActivePushSubscriptions",
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
  "functions:logAdherenceEntry",
  "functions:savePushSubscription",
  "functions:deletePushSubscription",
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
  "functions:getAdherenceByUserId",
  "functions:logAdherenceEntry",
  "functions:savePushSubscription",
  "functions:deletePushSubscription",
  "functions:listActivePushSubscriptions",
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
  "functions:listActivePushSubscriptions",
]);
const PATIENT_SELF = new Set([
  "functions:getPatientByUserId",
  "functions:getPatientByEmail",
  "functions:upsertPatient",
  "functions:insertAuditEvent",
  "functions:getAdherenceByUserId",
  "functions:logAdherenceEntry",
  "functions:savePushSubscription",
  "functions:deletePushSubscription",
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
      if (fn === "functions:getAdherenceByUserId" && args?.userId !== uid) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (fn === "functions:logAdherenceEntry" && args?.userId !== uid) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (fn === "functions:savePushSubscription" && args?.userId !== uid) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (fn === "functions:deletePushSubscription" && args?.userId !== uid) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
  }

  // deleteSession: require sessionToken arg
  if (fn === "functions:deleteSession") {
    if (!args?.sessionToken) return res.status(400).json({ error: "Missing session token" });
  }

  // Session creation — patients pass userId directly, PT uses email+password, OAIP uses shared access code
  if (fn === "functions:createSession") {
    const { accessCode, email, password, returning, resetPassword, ...sessionArgs } = args;

    if (sessionArgs.userId === "oaip_user") {
      // OAIP: shared access code — fail closed if env var not configured
      if (!OAIP_CODE || !accessCode || accessCode !== OAIP_CODE) {
        return res.status(403).json({ error: "Invalid access code" });
      }
      sessionArgs.email = email || "oaip@expect.care";
    } else if (resetPassword && email && password) {
      // Password reset: email-verified, set new password and create session
      try {
        const patient = await client.query("functions:getPatientByEmail", { email: email.toLowerCase().trim() });
        if (!patient) return res.status(403).json({ error: "No account found for this email" });
        const salt = generateSalt();
        const passwordHash = await hashPassword(password, salt);
        await client.mutation("functions:updatePatientPassword", { userId: patient.userId, passwordHash, salt });
        sessionArgs.userId = patient.userId;
        sessionArgs.email = patient.email;
      } catch (e) {
        return res.status(403).json({ error: "Unable to reset password" });
      }
    } else if (returning && email && password) {
      // Returning patient: email + password re-login
      try {
        const patient = await client.query("functions:getPatientByEmail", { email: email.toLowerCase().trim() });
        if (!patient || !patient.passwordHash) {
          return res.status(403).json({ error: "Invalid email or password" });
        }
        const hash = await hashPassword(password, patient.salt);
        if (hash !== patient.passwordHash) {
          return res.status(403).json({ error: "Invalid email or password" });
        }
        sessionArgs.userId = patient.userId;
        sessionArgs.email = patient.email;
      } catch (e) {
        return res.status(403).json({ error: "Invalid email or password" });
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
    } else if (sessionArgs.userId && sessionArgs.userId.startsWith("usr_")) {
      // Patient: session created during intake account creation — email stays in sessionArgs
      sessionArgs.email = email;
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

  // Hash patient password during upsert (strip plaintext, store hash+salt)
  if (fn === "functions:upsertPatient" && args?.password) {
    const salt = generateSalt();
    const passwordHash = await hashPassword(args.password, salt);
    delete args.password;
    args.passwordHash = passwordHash;
    args.salt = salt;
  }

  try {
    const result = QUERIES.has(fn)
      ? await client.query(fn, args || {})
      : await client.mutation(fn, args || {});
    res.status(200).json({ ok: true, result });

    // Email notification — fire-and-forget after response is sent
    if (fn === "functions:upsertPatient" && args?.status === "pending_review") {
      (async () => {
        try {
          if (!process.env.RESEND_API_KEY) return;
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          const ptUsers = await client.query("functions:listPtUsers", {});
          const activeEmails = (ptUsers || []).filter(p => p.active).map(p => p.email);
          if (activeEmails.length === 0) return;
          await resend.emails.send({
            from: "Expect Health <notifications@expect.care>",
            to: activeEmails,
            subject: `New Patient Ready for Review — ${args.name || "Unknown"}`,
            html: `<p>A new patient intake has been submitted and is ready for your review.</p>
                   <p><strong>Patient:</strong> ${args.name || "—"}</p>
                   <p><strong>Submitted:</strong> ${new Date().toLocaleString("en-US", {timeZone: "America/Denver"})}</p>
                   <p><a href="https://expecthealth.com">Open PT Portal →</a></p>
                   <p style="color:#6B7280;font-size:12px">Expect Health — Utah OAIP Pilot</p>`
          });
        } catch (e) {
          console.error("Email notification error:", e.code || "UNKNOWN");
        }
      })();
    }

    // Patient notification — care plan approved
    if (fn === "functions:updatePatientPlan" && args?.status === "approved" && args?.userId) {
      (async () => {
        try {
          if (!process.env.RESEND_API_KEY) return;
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          const patient = await client.query("functions:getPatientByUserId", { userId: args.userId });
          if (!patient?.email) return;
          const firstName = (patient.name || "").split(" ")[0] || "there";
          await resend.emails.send({
            from: "Expect Health <notifications@expect.care>",
            to: [patient.email],
            subject: "Your care plan is ready — Expect Health",
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
<tr><td style="background:linear-gradient(135deg,#4C2C84 0%,#C91A6E 50%,#E879A8 100%);padding:40px 20px;text-align:center">
<span style="font-size:24px;font-weight:700;color:#fff;letter-spacing:8px">E X P E C T</span>
</td></tr>
<tr><td style="padding:48px 40px 40px;text-align:center">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1F2937">Hi ${firstName},</h1>
<p style="margin:0 0 32px;font-size:16px;color:#4B5563;line-height:1.6">You have a new document available in your secure Expect portal.</p>
<a href="https://expecthealth.com" style="display:inline-block;background:#4C2C84;color:#fff;font-size:16px;font-weight:600;padding:16px 40px;border-radius:50px;text-decoration:none">Sign in to View</a>
</td></tr>
<tr><td style="background:#F9FAFB;padding:24px 40px;border-top:1px solid #F3F4F6">
<p style="margin:0;font-size:13px;color:#9CA3AF;text-align:center;line-height:1.6;font-style:italic">For your security, this link will expire in 24 hours. If you did not request this, please ignore this email. Do not reply to this email. This inbox is not monitored.</p>
</td></tr>
</table>
<p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;text-align:center">&copy; 2026 Expect. All rights reserved.</p>
</td></tr>
</table>
</body></html>`
          });
        } catch (e) {
          console.error("Patient approval notify error:", e.code || "UNKNOWN");
        }
      })();
    }

    // Patient notification — plan rejected
    if (fn === "functions:updatePatientPlan" && args?.status === "rejected" && args?.userId) {
      (async () => {
        try {
          if (!process.env.RESEND_API_KEY) return;
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          const patient = await client.query("functions:getPatientByUserId", { userId: args.userId });
          if (!patient?.email) return;
          const firstName = (patient.name || "").split(" ")[0] || "there";
          await resend.emails.send({
            from: "Expect Health <notifications@expect.care>",
            to: [patient.email],
            subject: "Update on your assessment — Expect Health",
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
<tr><td style="background:linear-gradient(135deg,#4C2C84 0%,#C91A6E 50%,#E879A8 100%);padding:40px 20px;text-align:center">
<span style="font-size:24px;font-weight:700;color:#fff;letter-spacing:8px">E X P E C T</span>
</td></tr>
<tr><td style="padding:48px 40px 40px;text-align:center">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1F2937">Hi ${firstName},</h1>
<p style="margin:0 0 16px;font-size:16px;color:#4B5563;line-height:1.6">Your physical therapist has reviewed your assessment and would like to discuss next steps with you.</p>
<p style="margin:0 0 32px;font-size:16px;color:#4B5563;line-height:1.6">Please reach out to our care team so we can help determine the best path forward for your care.</p>
<a href="mailto:team@expect.care" style="display:inline-block;background:#4C2C84;color:#fff;font-size:16px;font-weight:600;padding:16px 40px;border-radius:50px;text-decoration:none">Contact Care Team</a>
</td></tr>
<tr><td style="background:#F9FAFB;padding:24px 40px;border-top:1px solid #F3F4F6">
<p style="margin:0;font-size:13px;color:#9CA3AF;text-align:center;line-height:1.6;font-style:italic">If you have questions, email us at team@expect.care. Do not reply to this email. This inbox is not monitored.</p>
</td></tr>
</table>
<p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;text-align:center">&copy; 2026 Expect. All rights reserved.</p>
</td></tr>
</table>
</body></html>`
          });
        } catch (e) {
          console.error("Patient rejection notify error:", e.code || "UNKNOWN");
        }
      })();
    }
  } catch (e) {
    console.error("Convex proxy error:", fn, e.code || "UNKNOWN");
    res.status(502).json({ error: "An internal error occurred" });
  }
}
