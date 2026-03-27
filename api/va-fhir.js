// Vercel serverless function — proxies FHIR R4 requests to VA Lighthouse
// and maps responses to internal PatientProfile format
// Accepts POST with { access_token, patient_id, resources }
// No PHI is logged — only resource types and counts

export const config = { maxDuration: 25 };

const VA_API_BASE = (process.env.VA_API_BASE || "https://sandbox-api.va.gov/services/fhir/v0/r4").trim();

// Rate limiter — 20 FHIR fetches per 5 min per IP
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  let entry = rateMap.get(ip);
  if (!entry || now - entry.start > 300000) { entry = { start: now, count: 0 }; rateMap.set(ip, entry); }
  entry.count++;
  if (rateMap.size > 500) { for (const [k, v] of rateMap) { if (now - v.start > 300000) rateMap.delete(k); } }
  return entry.count <= 20;
}

// ICD-10 codes relevant to our clinical battery — used to flag known conditions
const RELEVANT_ICD10 = new Set([
  "N39.3", "N39.41", "N39.42", "N39.46", "N39.498", // incontinence
  "N81.0", "N81.1", "N81.2", "N81.3", "N81.4", "N81.5", "N81.6", "N81.9", // prolapse
  "G57.91", // pudendal neuralgia
  "N94.1", "N94.81", // dyspareunia, vulvodynia
  "R10.2", "R10.30", "R10.31", "R10.32", "R10.33", // pelvic/abdominal pain
  "K59.00", "K59.01", "K59.02", "K59.09", // constipation
  "N31.9", // neurogenic bladder
  "R35.0", "R35.1", "R35.81", // polyuria, nocturia, frequency
  "R39.14", "R39.15", "R39.16", // hesitancy, straining, splitting
]);

// LOINC codes for observations we care about
const LOINC_BMI = "39156-5";
const LOINC_PHQ2 = "55757-9";

// Map a FHIR Patient resource to internal fields
function mapPatient(resource) {
  const profile = {};
  if (!resource) return profile;

  const name = resource.name?.[0];
  if (name) {
    if (name.given?.[0]) profile.name_first = name.given[0];
    if (name.family) profile.name_last = name.family;
  }

  if (resource.birthDate) profile.dob = resource.birthDate; // YYYY-MM-DD

  if (resource.gender) {
    const genderMap = { male: "Male", female: "Female", other: "Other", unknown: "Other" };
    profile.sex_at_birth = genderMap[resource.gender] || "Other";
  }

  if (resource.telecom) {
    for (const t of resource.telecom) {
      if (t.system === "email" && t.value && !profile.email) profile.email = t.value;
      if (t.system === "phone" && t.value && !profile.phone) profile.phone = t.value;
    }
  }

  return profile;
}

// Map FHIR Condition bundle entries to clinical flags
function mapConditions(entries) {
  const flags = { relevantDx: [], allDxCount: 0 };
  if (!entries?.length) return flags;

  flags.allDxCount = entries.length;
  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource?.code?.coding) continue;
    for (const coding of resource.code.coding) {
      const code = coding.code;
      if (code && RELEVANT_ICD10.has(code)) {
        flags.relevantDx.push({
          code,
          display: coding.display || code,
          status: resource.clinicalStatus?.coding?.[0]?.code || "unknown",
        });
      }
    }
  }
  return flags;
}

// Map FHIR Observation bundle entries to relevant vitals
function mapObservations(entries) {
  const obs = {};
  if (!entries?.length) return obs;

  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource?.code?.coding) continue;
    for (const coding of resource.code.coding) {
      if (coding.code === LOINC_BMI && resource.valueQuantity?.value) {
        obs.bmi = Math.round(resource.valueQuantity.value * 10) / 10;
      }
      if (coding.code === LOINC_PHQ2 && resource.valueQuantity?.value != null) {
        obs.phq2_va = resource.valueQuantity.value;
      }
    }
  }
  return obs;
}

// Map FHIR DocumentReference bundle entries to metadata
function mapDocumentReferences(entries) {
  if (!entries?.length) return [];
  return entries.slice(0, 20).map(entry => {
    const resource = entry.resource;
    return {
      type: resource.type?.coding?.[0]?.display || resource.type?.text || "Document",
      date: resource.date || resource.context?.period?.start || null,
      description: resource.description || null,
      status: resource.status || "unknown",
    };
  });
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

  const { access_token, patient_id, resources } = req.body || {};
  if (!access_token || !patient_id) {
    return res.status(400).json({ error: "Missing required fields: access_token, patient_id" });
  }

  const resourceTypes = Array.isArray(resources) && resources.length > 0
    ? resources.filter(r => ["Patient", "Condition", "Observation", "DocumentReference"].includes(r))
    : ["Patient", "Condition", "Observation", "DocumentReference"];

  const headers = {
    "Authorization": `Bearer ${access_token}`,
    "Accept": "application/fhir+json",
  };

  try {
    const results = {};
    const counts = {};

    // Fetch all requested resources in parallel
    const fetches = resourceTypes.map(async (type) => {
      const url = type === "Patient"
        ? `${VA_API_BASE}/Patient/${patient_id}`
        : `${VA_API_BASE}/${type}?patient=${patient_id}&_count=100`;

      const fhirRes = await fetch(url, { headers });

      if (fhirRes.status === 401 || fhirRes.status === 403) {
        throw { status: 403, type };
      }
      if (fhirRes.status === 429) {
        const retryAfter = fhirRes.headers.get("Retry-After") || "60";
        throw { status: 429, retryAfter: parseInt(retryAfter, 10), type };
      }
      if (!fhirRes.ok) {
        // Log type + status only — no PHI
        console.error(`VA FHIR ${type} fetch failed:`, fhirRes.status);
        return { type, data: null };
      }

      const data = await fhirRes.json();
      return { type, data };
    });

    const fetchResults = await Promise.all(fetches);

    let profile = {};
    let conditions = { relevantDx: [], allDxCount: 0 };
    let observations = {};
    let documents = [];

    for (const { type, data } of fetchResults) {
      if (!data) { counts[type] = 0; continue; }

      if (type === "Patient") {
        profile = mapPatient(data);
        counts.Patient = 1;
      } else if (type === "Condition") {
        const entries = data.entry || [];
        conditions = mapConditions(entries);
        counts.Condition = entries.length;
      } else if (type === "Observation") {
        const entries = data.entry || [];
        observations = mapObservations(entries);
        counts.Observation = entries.length;
      } else if (type === "DocumentReference") {
        const entries = data.entry || [];
        documents = mapDocumentReferences(entries);
        counts.DocumentReference = entries.length;
      }
    }

    return res.status(200).json({
      profile: { ...profile, ...observations },
      conditions,
      documents,
      resource_counts: counts,
    });
  } catch (e) {
    if (e.status === 403) {
      return res.status(403).json({ error: "access_denied", detail: "Token may have expired or insufficient scope" });
    }
    if (e.status === 429) {
      return res.status(429).json({ error: "rate_limited", retryAfter: e.retryAfter });
    }
    console.error("VA FHIR proxy error:", e.code || "UNKNOWN");
    return res.status(502).json({ error: "va_unavailable", detail: "Could not reach VA health records service" });
  }
}
