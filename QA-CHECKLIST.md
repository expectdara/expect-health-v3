1# Expect Health — OAIP Pilot QA Checklist

Pre-submission smoke test. Run through each scenario on desktop Chrome + mobile Safari.
URL: `https://expect-utah-landing.vercel.app`

---

## 1. Landing Page
- [ ] Page loads without console errors
- [ ] Expect Health logo visible in top nav
- [ ] "Start My Assessment" button visible and clickable
- [ ] "Sign In" button visible
- [ ] Three tabs visible: Patient View | PT Provider View | OAIP View
- [ ] Mobile: layout does not overflow or break

## 2. Patient Intake — Step 0 (Demographics)
- [ ] Click "Start My Assessment" → consent screen appears
- [ ] Accept consent → Step 0 "Let's Get to Know You" loads
- [ ] First name, last name, DOB, sex at birth fields visible
- [ ] "Next" button disabled until required fields filled
- [ ] Enter valid DOB (adult) → no age warning
- [ ] Enter DOB making patient <18 → under-18 message appears, cannot advance

## 3. Male Pathway Gate
- [ ] Select "Male" at sex_at_birth → "Coming Soon" message appears
- [ ] Navigation buttons hidden for male selection
- [ ] Select "Female" → Coming Soon disappears, can proceed normally
- [ ] No male-specific instruments (IPSS, CPSI, SHIM) visible anywhere in female flow

## 4. Female Intake — Full Flow
- [ ] Fill Step 0 completely (name, DOB, female, not pregnant, email, phone, insurance) → "Next" enables
- [ ] Step 1 (Safety Check) — answer "No" to all red flags → can advance
- [ ] Step 1 — answer "Yes" to any red flag → warning banner, cannot advance
- [ ] Step 2 (Eligibility) — answer "No" to exclusions → can advance
- [ ] Step 2 — answer "Yes" to exclusion → exclusion screen with referral info, phone numbers
- [ ] Step 3 (Screeners) — pain/sexual gating questions appear
- [ ] Step 4 (ICIQ) — 4 questions, scoring updates live
- [ ] Step 5 (FLUTS) — filling/voiding questions, all required
- [ ] Step 6 (Bowel) — Bristol stool chart, frequency, straining
- [ ] Step 7 (POPDI-6) — prolapse screening, conditional bother scales
- [ ] Step 8 (Pain) — appears only if pain screener = "Yes"
- [ ] Step 9 (Sexual) — appears only if sexual screener = "Yes"
- [ ] Step 10 (QOL) — quality of life impact questions
- [ ] Step 11 (History/PHQ-2) — depression screening, goals, clinical extras
- [ ] Step 12 (Account) — password creation with validation (8+ chars, uppercase, number)
- [ ] "Complete Assessment" → submission succeeds, moves to "done" view
- [ ] No voice fork screen appears at any point (PHASE2_VOICE gated)

## 5. Care Plan (Patient View)
- [ ] After PT approval, care plan loads with tabs: Scores | Plan | Progress | Adherence
- [ ] Scores tab shows ICIQ, FLUTS, Pain, GUPI, PHQ-2 scores with color coding
- [ ] Plan tab shows exercises (expandable accordions with cue text)
- [ ] Plan tab shows adjunct recommendations with smart phrases
- [ ] "Print Care Plan" button opens print dialog with clean layout
- [ ] "Save as PDF for MyChart" button opens export modal
- [ ] Progress tab shows Week 4 check-in banner (if not yet completed)
- [ ] Adherence tab allows logging daily exercise completion

## 6. Week 4 Check-In
- [ ] "Start Week 4 Check-In" button appears in Progress tab
- [ ] ICIQ re-administration (4 questions)
- [ ] PHQ-2 re-administration (2 questions)
- [ ] Pain re-assessment (if pain was flagged at baseline)
- [ ] Self-rated progress + adherence self-report
- [ ] Results screen shows delta arrows (improved/worsened/unchanged)
- [ ] After completion, Week 4 summary bar appears + Week 8 banner shows

## 7. PT Provider Portal
- [ ] Click "PT Provider View" tab → login form appears
- [ ] Invalid credentials → error message
- [ ] Valid PT credentials → dashboard loads
- [ ] Patient list shows submitted intakes with review status
- [ ] Click patient card → full intake review opens
- [ ] Review shows all instrument scores, risk flags, clinical alerts
- [ ] "Generate Encounter Note" creates clinical documentation
- [ ] Encounter note includes all scores, diagnoses, plan details
- [ ] "Approve Plan" button activates patient's care plan
- [ ] Fax button appears when physician fax number is available
- [ ] Fax button sends encounter note (verify in Telnyx dashboard)
- [ ] Review timer tracks time spent reviewing
- [ ] Referral cards show relevant providers with per-provider explanations
- [ ] Referral cards show correct call-to-action text per provider

## 8. OAIP Dashboard
- [ ] Click "OAIP View" tab → login form appears
- [ ] Valid OAIP credentials → dashboard loads
- [ ] Dashboard shows aggregate statistics
- [ ] Audit log displays chronological events

## 9. Physician Fax (Telnyx)
- [ ] Fax button disabled when no fax number present
- [ ] Fax button disabled when encounter note is empty
- [ ] Click fax → "Sending..." state shown
- [ ] Successful fax → confirmation with fax ID displayed
- [ ] Failed fax → error message with retry option
- [ ] Audit event logged for fax attempt

## 10. Security & Privacy
- [ ] X-Frame-Options: DENY header present
- [ ] X-Content-Type-Options: nosniff header present
- [ ] Strict-Transport-Security header present
- [ ] Content-Security-Policy header present
- [ ] Referrer-Policy: strict-origin-when-cross-origin header present
- [ ] PT portal "Auditor Mode" toggle masks PHI fields
- [ ] No PHI visible in browser URL at any point
- [ ] Session expires and requires re-authentication
- [ ] Logout clears session from localStorage

## 11. NPI Lookup
- [ ] Type physician name in NPI search → results appear from CMS registry
- [ ] Select a provider → name and NPI auto-populate
- [ ] Demo NPI (1932669694 Rosa Speranza) → fax auto-populates 801-585-5146

## 12. Referral System
- [ ] Patients with exclusion criteria see relevant provider referral cards
- [ ] Each referral card shows "Why this was recommended" explanation
- [ ] Provider phone numbers are correct and clickable on mobile
- [ ] PCP recommendation appears for depression/pain/severe incontinence

## 13. Cross-Browser / Mobile
- [ ] Desktop Chrome: full flow works
- [ ] Desktop Safari: full flow works
- [ ] Mobile Safari (iPhone): layout responsive, inputs usable, buttons tappable
- [ ] Mobile Chrome (Android): layout responsive, no overflow

---

**Test Date:** _______________
**Tester:** _______________
**Build:** _______________
**Result:** ☐ PASS  ☐ FAIL (list failures below)

**Notes:**


