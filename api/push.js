import webpush from "web-push";

// Lazy Convex client (same pattern as db.js)
let _client;
async function getClient() {
  if (!_client) {
    const { ConvexHttpClient } = await import("convex/browser");
    _client = new ConvexHttpClient(process.env.CONVEX_URL);
  }
  return _client;
}

export default async function handler(req, res) {
  // Only allow POST (from Vercel cron or authorized caller)
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Verify cron secret to prevent unauthorized triggering
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL || "mailto:dara@expecthealth.com";

  if (!vapidPublic || !vapidPrivate) {
    return res.status(503).json({ error: "Push not configured" });
  }
  if (!process.env.CONVEX_URL) {
    return res.status(503).json({ error: "Database not configured" });
  }

  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

  const client = await getClient();
  let subscriptions;
  try {
    subscriptions = await client.query("functions:listActivePushSubscriptions", {});
  } catch (e) {
    return res.status(502).json({ error: "Failed to fetch subscriptions" });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, message: "No active subscriptions" });
  }

  const payload = JSON.stringify({
    title: "Expect Health",
    body: "Did you do your exercises today? Tap to log your progress.",
    url: "/",
  });

  let sent = 0;
  let failed = 0;
  const expired = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (e) {
      failed++;
      // 410 Gone or 404 = subscription expired, clean it up
      if (e.statusCode === 410 || e.statusCode === 404) {
        expired.push(sub.userId);
      }
    }
  }

  // Clean up expired subscriptions
  for (const userId of expired) {
    try {
      await client.mutation("functions:deletePushSubscription", { userId });
    } catch (e) {
      // best-effort cleanup
    }
  }

  res.status(200).json({ ok: true, sent, failed, expired: expired.length });
}
