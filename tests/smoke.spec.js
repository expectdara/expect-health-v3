import { test, expect } from "@playwright/test";

// ─────────────────────────────────────────────
// 1. LANDING PAGE
// ─────────────────────────────────────────────

test.describe("Landing Page", () => {
  test("loads and shows Start My Assessment button", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("button", { hasText: "Start My Assessment" })).toBeVisible();
  });

  test("shows Sign In button", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("button", { hasText: /Sign in/i }).first()).toBeVisible();
  });

  test("shows Expect branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".topnav-logo")).toBeVisible();
  });

  test("has three navigation tabs", async ({ page }) => {
    await page.goto("/");
    const tabs = page.locator(".tt");
    await expect(tabs).toHaveCount(3);
  });

  test("mobile viewport renders correctly", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator("button", { hasText: "Start My Assessment" })).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// 2. CONSENT SCREEN
// ─────────────────────────────────────────────

test.describe("Consent Screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator("button", { hasText: "Start My Assessment" }).click();
  });

  test("shows Informed Consent heading", async ({ page }) => {
    await expect(page.locator("text=Informed Consent")).toBeVisible({ timeout: 5000 });
  });

  test("I Agree button is disabled until all checkboxes checked", async ({ page }) => {
    const agreeBtn = page.locator("button", { hasText: /I Agree/i });
    await expect(agreeBtn).toBeVisible({ timeout: 5000 });
    await expect(agreeBtn).toBeDisabled();
  });

  test("checking all consent items enables I Agree button", async ({ page }) => {
    await page.waitForSelector("text=Informed Consent", { timeout: 5000 });
    // Consent uses custom .ck divs (not native checkboxes)
    const items = page.locator(".ck");
    const count = await items.count();
    expect(count).toBeGreaterThan(5); // Should be ~10 consent items
    for (let i = 0; i < count; i++) {
      await items.nth(i).click();
    }
    await expect(page.locator("button", { hasText: /I Agree/i })).toBeEnabled({ timeout: 3000 });
  });

  test("clicking I Agree advances to identity verification", async ({ page }) => {
    await page.waitForSelector("text=Informed Consent", { timeout: 5000 });
    const items = page.locator(".ck");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await items.nth(i).click();
    }
    await page.locator("button", { hasText: /I Agree/i }).click();
    // Should advance to email verification screen
    await expect(page.locator("input[type='email']").first()).toBeVisible({ timeout: 5000 });
  });

  test("Back button returns to landing page", async ({ page }) => {
    await page.waitForSelector("text=Informed Consent", { timeout: 5000 });
    await page.locator("button", { hasText: /Back/i }).click();
    await expect(page.locator("button", { hasText: "Start My Assessment" })).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────
// 3. IDENTITY VERIFICATION
// ─────────────────────────────────────────────

test.describe("Identity Verification", () => {
  test("shows email input after consent", async ({ page }) => {
    await page.goto("/");
    await page.locator("button", { hasText: "Start My Assessment" }).click();
    await page.waitForSelector("text=Informed Consent", { timeout: 5000 });
    const items = page.locator(".ck");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await items.nth(i).click();
    }
    await page.locator("button", { hasText: /I Agree/i }).click();
    await expect(page.locator("input[type='email']").first()).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────
// 4. PT PORTAL LOGIN
// ─────────────────────────────────────────────

test.describe("PT Portal", () => {
  test("PT tab shows login form", async ({ page }) => {
    await page.goto("/");
    // Use exact text to avoid matching "Patient View"
    await page.locator(".tt", { hasText: "PT Provider View" }).click();
    await expect(page.locator("input[type='password']").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("button.btn.bbl", { hasText: "Sign In" })).toBeVisible();
  });

  test("PT login rejects invalid credentials", async ({ page }) => {
    await page.goto("/");
    await page.locator(".tt", { hasText: "PT Provider View" }).click();
    await page.waitForSelector("input[type='password']", { timeout: 5000 });
    await page.locator("input[type='email']").first().fill("bad@example.com");
    await page.locator("input[type='password']").first().fill("wrongpassword123");
    // Use the specific blue Sign In button in the PT portal
    await page.locator("button.btn.bbl", { hasText: "Sign In" }).click();
    // Should show error
    await page.waitForTimeout(3000);
    const hasError = await page.locator("text=/invalid|not found|error|incorrect|failed|Unable/i").isVisible().catch(() => false);
    expect(hasError).toBeTruthy();
  });
});

// ─────────────────────────────────────────────
// 5. OAIP DASHBOARD
// ─────────────────────────────────────────────

test.describe("OAIP Dashboard", () => {
  test("OAIP tab shows login form", async ({ page }) => {
    await page.goto("/");
    await page.locator(".tt", { hasText: "Utah OAIP View" }).click();
    await expect(page.locator("input[type='password']").first()).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────
// 6. VOICE INTAKE GATE
// ─────────────────────────────────────────────

test.describe("Voice Intake Gate", () => {
  test("no voice fork screen on landing page", async ({ page }) => {
    await page.goto("/");
    const voiceFork = page.locator("text=/voice.*intake|speak.*answers|conversation.*mode/i");
    await expect(voiceFork).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────
// 7. API ENDPOINTS
// ─────────────────────────────────────────────

test.describe("API Endpoints", () => {
  test("NPI lookup API responds", async ({ request }) => {
    const res = await request.get("/api/npi?first_name=Smith&last_name=John&state=UT");
    expect(res.status()).toBeLessThan(500);
  });

  test("Fax API rejects GET requests", async ({ request }) => {
    const res = await request.get("/api/fax");
    expect(res.status()).toBe(405);
  });

  test("Fax API validates missing fields", async ({ request }) => {
    const res = await request.post("/api/fax", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("Fax API validates phone format", async ({ request }) => {
    const res = await request.post("/api/fax", {
      data: { to: "123", encounterNote: "test note" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid fax number");
  });

  test("Fax API accepts valid 10-digit phone", async ({ request }) => {
    const res = await request.post("/api/fax", {
      data: { to: "8015551234", encounterNote: "test note" },
      headers: { "Content-Type": "application/json" },
    });
    // Should get past validation (may fail at Telnyx but not 400)
    expect(res.status()).not.toBe(400);
  });
});

// ─────────────────────────────────────────────
// 8. SECURITY HEADERS
// ─────────────────────────────────────────────

test.describe("Security Headers", () => {
  test("X-Frame-Options is DENY", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
  });

  test("X-Content-Type-Options is nosniff", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("Strict-Transport-Security is set", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["strict-transport-security"]).toContain("max-age=");
  });

  test("Content-Security-Policy is present", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["content-security-policy"]).toBeTruthy();
  });

  test("Referrer-Policy is strict-origin-when-cross-origin", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});

// ─────────────────────────────────────────────
// 9. PAGE PERFORMANCE
// ─────────────────────────────────────────────

test.describe("Performance", () => {
  test("page loads in under 5 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/", { waitUntil: "networkidle" });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test("no console errors on page load", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/", { waitUntil: "networkidle" });
    // Filter out known benign errors (e.g. favicon, service worker)
    const real = errors.filter((e) => !e.includes("favicon") && !e.includes("sw.js"));
    expect(real).toHaveLength(0);
  });
});
