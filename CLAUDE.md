# Expect Health — Utah OAIP Pilot

## Project Overview
AI-augmented pelvic floor physical therapy platform for Utah's OAIP (Office of Artificial Intelligence Policy) regulatory sandbox pilot. Founded by Dara Cook, clinical lead Dr. Nicole Dugan, PT, DPT, WCS.

Two user types: **patients** (intake flow) and **physical therapists** (review portal + OAIP dashboard).

## Key Files

### Platform
- `public/index.html` — **THE** deployed clinical platform (single-file React app via Babel standalone). This is what Vercel serves.
- `expect-utah-clinical-platform-v3 goodNPI.html` — Working copy / development version. Changes should land in `public/index.html` for deployment.
- `api/npi.js` — Vercel serverless function proxying CMS NPI Registry lookups (avoids CORS).
- `vercel.json` — Vercel config: routes `public/` as output, rewrites to `index.html`, security headers.

### Proposal & Documents
- `expect_oaip_pilot_proposal_REWRITTEN.txt` — Source text for the OAIP pilot proposal.
- `build_docx.py` — Generates `expect_oaip_pilot_proposal_FINAL.docx` from the text file using python-docx.
- `expect_oaip_pilot_proposal_FINAL.docx` — Formatted proposal output.
- `Pilot Proposal Checklist.pdf` / `Expect_Health_AI_Sandbox_Pilot.pdf` — Reference docs.

### PT Reference Documents
- `build_utah_checklist.py` → `utah-pt-reviewer-checklist.docx` — 8-step PT reviewer checklist.
- `build_utah_logic_review.py` → `utah-pt-logic-review.docx` — Comprehensive clinical logic review.
- `expect-adjunct-library-reference.docx` — Adjunct library smart phrase reference for PTs.

## Architecture

### Platform Stack
- Single HTML file with inline React (JSX), compiled by Babel standalone in-browser.
- All clinical logic is deterministic (no LLM/AI at runtime) — scoring, tier assignment, exercise selection, ICD-10 diagnosis.
- Deployed on Vercel with `/api/npi` serverless proxy for NPI lookups.
- Logo assets in `public/`: `Expect_Logo_WhiteTM.png`, `Exepect_Submark_White.png`.

### Clinical Instruments
- **ICIQ-UI Short Form** (0-21) — incontinence severity + subtype classification
- **ICIQ-FLUTS** (0-44) — filling, voiding, incontinence subscales
- **ICIQ-FLUTSsex** (0-13) — sexual symptom burden
- **GUPI-F** (0-45) — genitourinary pain index (pain + urinary + QOL)
- **PHQ-2** (0-6) — depression screening (validated wording, do NOT modify)
- **Bristol Stool Scale** (types 1-7) — bowel form assessment
- Pain composite (custom) + bowel frequency + straining

### Key Clinical Logic
- **3-tier exercise system**: Beginner (ICIQ 13-21, 12wk), Moderate (6-12, 8wk), Advanced (1-5, 6wk)
- **Constipation composite**: straining >= 2 OR frequency < 3x/wk OR Bristol 1-2
- **Pudendal neuralgia flag**: sitting_long trigger + pain composite > 6 → G57.91 dx
- **Depression flag**: PHQ-2 >= 3 → OAIP red flag (MODERATE 3-4, HIGH 5-6)
- **Prenatal protocol**: pregnancy flag → exercise substitutions + vena cava precaution

### Demo Data
- `DEMO_NPI_FAXES` constant: pre-populates fax `801-585-5146` for NPI `1932669694` (Rosa Speranza) — demo only.
- `MOCK_PROVIDERS` array: demo provider entries for testing.

## Coding Conventions

### When editing `public/index.html`:
- This is a minified single-file app. Keep changes compact and inline with existing style.
- All scoring functions: `sICIQ()`, `sFLUTS()`, `sFSEX()`, `sGUPI()`, `sPain()` — deterministic, no side effects.
- `genPlan()` is the care plan generator — all adjunct/dx/exercise logic lives here.
- `EXPANSION_LIB` is the adjunct library — 3+ char match triggers smart phrase auto-population.
- `L()` is the audit logger — call it for any clinically significant event.
- Answer state: `ans` object, set via `set(key, value)`, multi-select via `togM(key, value)`.

### When editing proposal text:
- Edit `expect_oaip_pilot_proposal_REWRITTEN.txt`, then run `python3 build_docx.py` to regenerate the DOCX.
- Heading patterns must match what `build_docx.py` expects (see `h1_patterns`, `appendix_section_titles`, `bold_headings`, `big_picture_prefixes`).

## Git & Deployment
- Remote: `https://github.com/expectdara/expect-health-v3.git`
- Branch: `main`
- Vercel auto-deploys from `main`. Push = deploy.
- Always commit `public/index.html` for platform changes to go live.
- Do NOT commit: `.DS_Store`, `.claude/`, Word temp files (`~$*.docx`).

## Important Rules
- **PHQ-2 wording is validated** — do not change "Several days" or any response option text.
- **All clinical logic is deterministic** — no LLM calls, no randomness, no hallucination risk.
- **PHI handling**: Auditor Mode toggle masks 17 PHI field types. All PT actions are audit-logged.
- **Two HTML files exist** — `public/index.html` is deployed; the `goodNPI.html` working copy may lag behind. Always check which file needs the change.
- **Dr. Nicole Dugan** is the clinical authority. Her feedback on clinical content (cue wording, adjunct text, instrument selection) takes priority.

## Established Patterns (do not redesign these)

### NPI Lookup
- Patient intake: public/index.html lines 331–354, NPILookup component
  - doSearch() at line 335
  - selectProvider() at line 354
- PT concierge search: public/index.html lines 570–613, ConciergeSearch component
  - doSearch() at line 588
  - selectProvider() at line 614
- Server proxy: api/npi.js lines 1–13, Vercel serverless function
  - Proxies to npiregistry.cms.hhs.gov
- Demo override: public/index.html line 549
  - DEMO_NPI_FAXES={"1932669694":"8015855146"}
- When adding any new provider lookup, follow NPILookup/ConciergeSearch pattern — do NOT redesign or use a different API

### Logo
- Patient clinical summary: public/index.html line 1041
  - filter:"invert(1)" — white logo inverted to dark for light background
- Patient care plan header: public/index.html line 1093
  - Inside .cp-hdr — purple gradient background, white logo
- PT portal top nav: public/index.html line 1892
  - .topnav-logo class
- Do NOT change logo implementation without asking — PT-facing branding, OAIP pilot materials reference this visual identity
