import Stripe from "stripe";

export default async function handler(req, res) {
  const allowed = process.env.CORS_ORIGIN || "https://expecthealth.com";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Methods", "POST"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); return res.status(200).end(); }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.identity.verificationSessions.create({
      type: "document", metadata: { source: "expect-oaip-pilot" }
    });
    res.status(200).json({ clientSecret: session.client_secret });
  } catch (e) {
    console.error("Stripe Identity error:", e.message);
    res.status(502).json({ error: "Stripe Identity unavailable" });
  }
}
