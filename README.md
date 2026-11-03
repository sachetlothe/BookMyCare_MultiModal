# BookMyCare

**An explainable, multimodal, patient-centred health screening assistant** — final-year B.Tech Computer Engineering project
based on the concept *"An Explainable Multimodal AI Framework for Disease Detection, Medical Report Interpretation, and Personalized Care Pathway Recommendation"*.

> ⚠️ **Educational prototype.** BookMyCare does not diagnose disease and is not a medical device. All outputs are screening
> suggestions to discuss with a qualified clinician. Sample data in this repository is synthetic. **Never upload real
> patient data**, especially to the shared team database.

**Core principle:** patient data + deterministic rules provide the facts; AI only explains them.
Patient data → extraction → validation → structured health record → rules → WHO/CDC evidence → AI explanation → validation → patient.

**Contents:** [What we have built](#what-we-have-built) · [Run locally](#run-locally-windows) ·
[Team setup: shared Supabase database](#team-setup-shared-supabase-database) · [Testing](#testing) ·
[What to work on next](#what-to-work-on-next) · [Project layout](#project-layout)

## What we have built

| Area | Status |
|---|---|
| Accounts | Register / login (bcrypt + JWT), per-user data isolation, login rate limiting, "sign out everywhere", password change and reset with a one-time recovery code |
| Patient profile | Age, sex, BMI, pregnancy, lifestyle, allergies, conditions, medicines |
| Medical history | Timeline CRUD (conditions, surgeries, medicines, allergies, vaccinations, visits) |
| Report upload | PDF (text layer), scanned PDF / photo (Tesseract OCR, optional), TXT/CSV; magic-byte type check, 15 MB limit |
| Report interpretation | Recognises ~27 common lab tests + blood pressure, unit conversion (mmol/L, g/L, /µL), sex-specific ranges, critical values, LOINC codes; patients can correct a misread value |
| **Lab trends (longitudinal)** | Every lab value is stored per report date. Trends page with charts: direction, change, slope per year, flags for *new abnormal*, *back to normal*, *persistent*, *rapid change*, *approaching a limit*. Trends feed the screening and the AI explanation |
| Medical images | Upload + explainable quality checks (resolution, brightness, contrast, blur). Optional *unverified* observations from a vision LLM (Gemini). **No trained diagnostic imaging model is included.** |
| Multimodal screening | Transparent rule-based engine fusing symptoms, lab values, lab trends, profile risk factors, duration and (optional) image observations across 22 conditions |
| Explainability | Every match shows contributing factors with points and share, evidence *against*, missing typical features, score decomposition |
| Safety | Red-flag triage (cardiac, stroke, breathing, meningitis, self-harm, dengue warning signs, critical labs, BP crisis, pregnancy…), urgency set by rules only, AI output sanitiser (removes dosing / diagnostic claims / "stop your medicine"), disclaimers |
| Care pathway | Personalised plan: immediate actions, self-care, when to see a doctor, tests, profile-specific advice |
| **Doctor-type suggestions** | Rule-based table (`app/data/specialties.json`), never chosen by the AI: general physician first, emergency department first in emergencies, specialists from condition matches and from worsening lab trends, each with its reasons ("HbA1c rose from 6.1% to 7.1%…") |
| **Find care (nearby)** | *Find care* page: current location or place search, then nearby hospitals / clinics / doctors from OpenStreetMap, filtered by doctor type, sorted by distance, every result labelled **"Map listing, not verified"**. Only a location rounded to ~1 km is sent; never health data |
| WHO / CDC retrieval | BM25 search over 37 curated summaries (with source links) + an ingestion script for live who.int / cdc.gov pages. Passages are numbered `[S1]`, `[S2]`… |
| Grounded AI assessment | The AI explains the rule-based results using the retrieved passages and the patient's history; citations are validated. Every result states whether it came from a real AI, a labelled mock, nothing (failure) or safety rules only (emergency) |
| AI providers | Gemini (primary), Groq and OpenRouter behind one interface with automatic fallback and classified errors. **Mock mode** is always labelled |
| **Privacy and encryption** | Each patient has their own key, unlocked only by their password (or recovery code). Uploaded files are AES-256-GCM encrypted (local disk or private Supabase bucket); sensitive database fields are stored encrypted. The database, storage and server secrets together cannot open them. Row-level security on PostgreSQL |
| **Team support (with consent)** | A patient can grant time-limited (1-72 h) support access; staff can then view and correct extracted values, never original files. Every view and change is in an audit log the patient can see. Anonymous team statistics with small-group suppression |
| UI | Responsive React app: 3D home page, dashboard, profile, history, reports, lab trends, analysis wizard, explainable results (printable), find care, health library, staff page |
| Tests | **172 backend tests (pytest), 51 frontend tests (Vitest)**. External services (AI providers, OpenStreetMap) are stubbed |

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (pipeline, scoring, trends, encryption, support access, care navigation, safety).

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router, three.js / react-three-fiber, Motion, lucide-react, Vitest + Testing Library
- **Backend:** FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, PyJWT, bcrypt, cryptography, pypdf, pypdfium2, Pillow, pytesseract, httpx, psycopg 3
- **Database:** SQLite by default (`backend/bookmycare.db`); **shared team database on Supabase PostgreSQL** (see below)
- **File storage:** local `backend/uploads/` or a private Supabase Storage bucket (always encrypted)
- **AI:** Gemini / Groq / OpenRouter via REST, mock fallback
- **Maps:** OpenStreetMap (Nominatim + Overpass), no key needed

## Run locally (Windows)

Prerequisites: **Python 3.12 or newer** (the pinned SQLAlchemy 2.1.4 could not be installed on Python 3.10), **Node.js 20+**, Git.
Optional: [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) for scanned reports.

```powershell
git clone <team repo URL>
cd BookMyCare_MultiModal
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1     # one-time: venv, deps, .env, DB, demo user, npm ci

# terminal 1
powershell -ExecutionPolicy Bypass -File scripts\run-backend.ps1    # http://127.0.0.1:8000  (API docs at /docs)
# terminal 2
powershell -ExecutionPolicy Bypass -File scripts\run-frontend.ps1   # http://localhost:5173
```

Sign in with the synthetic demo account **demo@bookmycare.dev / DemoPass123** (it already has three reports over a year, so
the *Lab trends* page has data), or register a new account.

> **Save the recovery code** shown after registering. Data is encrypted with a key unlocked by your password; without the
> password or the recovery code, nobody (not even the team) can open that account's data.

<details><summary>Manual steps (any OS)</summary>

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env            # macOS/Linux: cp .env.example .env  — then set JWT_SECRET
alembic upgrade head              # also runs automatically on server start (AUTO_MIGRATE=true)
python -m scripts.seed_demo       # optional synthetic demo user
uvicorn app.main:app --reload

cd ../frontend
npm ci
npm run dev
```
</details>

## Team setup: shared Supabase database

By default every member works on their own local SQLite file. To work on **one shared database** (so everyone sees the same
test accounts and data), point your backend at the team's Supabase PostgreSQL project.

### 1. Get the connection details (privately)

Ask **Member 1** (the Supabase project owner) for these values over a private channel. **Never** put them in git, chat
groups, screenshots or the frontend.

| Value | Where it comes from | Who needs it |
|---|---|---|
| `DATABASE_URL` | Supabase → **Connect** → **Session pooler** (port 5432) | Everyone using the shared DB |
| `FILE_ENCRYPTION_KEY` | Created once with `python -m scripts.encrypt_uploads --new-key` | Everyone, **the same value**, when files are in the shared bucket |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys (secret key) | Only if you use `STORAGE_BACKEND=supabase` |

### 2. Edit `backend/.env`

`backend/.env` is git-ignored. Copy it from `.env.example` if it does not exist yet (`setup.ps1` does this), then set:

```ini
DATABASE_URL=postgresql+psycopg://postgres.<project-ref>:<password>@<pooler-host>.pooler.supabase.com:5432/postgres?sslmode=require

# Only ONE member (the migration owner) keeps this true. Everyone else:
AUTO_MIGRATE=false

# Shared encrypted file storage (optional; default is local backend/uploads)
STORAGE_BACKEND=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<server-only secret key>
FILE_ENCRYPTION_KEY=<same value for the whole team>
```

`JWT_SECRET` can differ per member: each of you runs your own backend, and data keys come from passwords, not from the JWT
secret. After switching databases, sign in again.

### 3. Check the connection

```powershell
cd backend
.\.venv\Scripts\python -m scripts.check_db
```

Expected output (the password is never printed):

```
Database: postgresql+psycopg://postgres.<project-ref>:***@...pooler.supabase.com:5432/postgres?sslmode=require
Server:   PostgreSQL ...
Tables:   alembic_version, analyses, audit_logs, health_documents, lab_results, lab_test_catalog, ...
Migration: 0007
Users:    3
OK: connected
```

If `Migration` is lower than the newest file in `backend/alembic/versions/`, the database needs migrating (step 4).
If it says `FAILED`, check the password, that you used the **Session pooler** URL (not "Direct connection"), and that
`?sslmode=require` is at the end.

### 4. Migrations: one person only

Only the **migration owner** changes the shared schema, after pulling a commit that adds a new file to
`backend/alembic/versions/`:

```powershell
cd backend
.\.venv\Scripts\python -m alembic upgrade head      # migration owner only
.\.venv\Scripts\python -m scripts.seed_demo         # once; safe to repeat (it skips existing data)
```

Everyone else keeps `AUTO_MIGRATE=false` and just runs `check_db` to confirm the version. If you write a new migration,
test it on SQLite first (the automated tests do this), then ask the migration owner to apply it.

Row-level security is enabled on every table, which blocks Supabase's public API roles. The backend connects as the table
owner, so it is not affected. Do **not** add policies that open tables to the `anon` or `authenticated` roles.

### 5. Run and use it

Start the backend and frontend as usual. Every member's app now reads and writes the same database. Remember:

* It is shared: only **synthetic** data, test accounts with obvious names (e.g. `riya.test@example.com`).
* Each account's data opens only with **its own password or recovery code**. Note them for shared test accounts.
* Staff accounts: `.\.venv\Scripts\python -m scripts.make_staff someone@example.com` (`--remove` to undo).

## Testing

### Automated tests: run before every push

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-all.ps1
# or individually
cd backend;  .\.venv\Scripts\python -m pytest -q          # 172 tests
cd frontend; npm test; npm run build                      # 51 tests + type check + production build
```

**The automated tests never touch Supabase.** `backend/tests/conftest.py` always creates a fresh temporary SQLite
database, forces mock AI and stubs every outside call (AI providers, OpenStreetMap), even when your `.env` points at
Supabase. This is deliberate: tests create and delete many accounts and would pollute or damage the shared data. So they
are safe to run at any time, and they need no keys.

### Testing against the shared Supabase database

After changing `.env` (or after a new migration), check the real database with these steps:

**1. Connection and schema**

```powershell
cd backend
.\.venv\Scripts\python -m scripts.check_db         # connects, shows migration version and table list
.\.venv\Scripts\python -m scripts.check_sealing    # lists anything still readable without a patient's key (prints no data)
```

`check_sealing` should report nothing unexpected; older data is sealed automatically at its owner's next sign-in.

**2. Walk through the app** (backend + frontend running, `.env` pointing at Supabase)

| # | Do this | Expect |
|---|---|---|
| 1 | Register a new test account | Recovery code is shown; profile page opens |
| 2 | Fill in date of birth and sex on *My profile* | Saved; still there after reloading |
| 3 | *Reports & images* → upload `backend/sample_data/synthetic_metabolic_panel.pdf` (leave *Date* empty = today) | Lab values appear (glucose, HbA1c, lipids…) |
| 4 | Upload `synthetic_followup_2025-09.txt` with *Date* **2025-09-15**, and `synthetic_followup_2026-03.txt` with *Date* **2026-03-12** (the date is not read from the file) | *Lab trends* shows HbA1c rising across three results, with chart and flags |
| 5 | *New analysis* → symptoms *fatigue, excessive thirst*, select the report | Diabetes match, care plan, **Recommended doctor type: general physician, endocrinologist** |
| 6 | *Find care* → search "Kothrud, Pune" | Nearby places labelled "Map listing, not verified" |
| 7 | Sign out, then sign in **on another member's computer** | Same data appears: the database is really shared |
| 8 | Run `python -m scripts.check_db` again | `Users` count went up |

**3. Optional automated browser run** (uses whatever database the running backend uses):

```powershell
pip install playwright; python -m playwright install chromium
python e2e/smoke_test.py          # screenshots in e2e/screenshots/ (git-ignored); BMC_URL overrides http://127.0.0.1:5173
```

## Enabling the real AI (Gemini)

1. Create a key at <https://aistudio.google.com/apikey>.
2. In `backend\.env` set:

   ```
   GEMINI_API_KEY=<your key>
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```

   Keep the key out of git: `backend/.env` is git-ignored. **Free-tier keys may let Google use the content to improve its
   products, so use them with synthetic data only.**
3. **Restart the backend** (settings are read once at start-up).
   Free-tier limits are **per model**: when tested (25 Oct 2026) `gemini-3.8-flash` hung or returned 503, and `gemini-3.6-flash` allowed only 20 requests per day, so the default is `gemini-3.5-flash-lite`. If `check_ai` reports `rate_limited`, timeouts or 503 "high demand", switch `GEMINI_MODEL` to another current free-tier model (list: <https://ai.google.dev/gemini-api/docs/models>, your limits: <https://aistudio.google.com/rate-limit>).
4. Optional fallbacks: `GROQ_API_KEY` (+ `GROQ_MODEL`) and `OPENROUTER_API_KEY` with an explicit `OPENROUTER_MODEL`. They are tried in `AI_PROVIDER_ORDER`.

> **Model names expire.** `gemini-2.0-flash` (shut down 1 June 2026) and Groq's `llama-3.3-70b-versatile` (retired 16 August 2026) no longer work. If you see `model_not_found`, check the current names at <https://ai.google.dev/gemini-api/docs/deprecations> and <https://console.groq.com/docs/deprecations>.

Check the live AI without printing keys: `cd backend; .\.venv\Scripts\python -m scripts.check_ai`.

#### What the AI does and does not do

* The rule-based engine scores conditions, detects red flags, **decides urgency** and **chooses the doctor type**. The model cannot change urgency, add conditions, pick specialties or diagnose.
* The model receives the structured results, lab trends, the patient's history and numbered WHO/CDC passages, and must cite passages by id. Citations that do not match a retrieved passage are dropped.
* Sentences that state a diagnosis ("you have dengue"), give doses, tell the patient to change medicines, or downplay the need for care are removed.
* **Emergency results never call the model**: the guidance comes straight from the safety rules and the page says so.

#### How failures are shown (never silent)

| Situation | What you see |
|---|---|
| Real AI answered | `AI: gemini` badge, citations, no mock label |
| No key / `AI_FORCE_MOCK=true` | Amber **Mock AI** badge and the reason (`missing_key` / `forced_mock`) |
| Rate limit, bad key, retired model, timeout, invalid or blocked reply | The next provider is tried; if none works the result is **Mock AI** with the failure reasons listed |
| `AI_ALLOW_MOCK_FALLBACK=false` and no AI | Red **AI explanation unavailable** notice; the rule-based assessment still appears |
| Emergency warning signs | **Safety rules** badge; no AI used |

## Find care (OpenStreetMap)

No key is needed. Settings in `backend/.env` (defaults shown in `.env.example`): `FACILITY_SEARCH_ENABLED`,
`FACILITY_SOURCES=nominatim,overpass`, `OVERPASS_URLS`, `OSM_USER_AGENT`, `GEOCODE_COUNTRY_CODES=in`.

* A new area takes about 6-8 seconds (OpenStreetMap allows one request per second); the same area is instant for an hour.
* Public Overpass servers are often at capacity, so Nominatim is tried first. If every server is down, results saved for
  that area in the last 24 hours are shown and marked as saved. **For a demo, search your demo area once beforehand.**
* For a public deployment, add a contact e-mail to `OSM_USER_AGENT` (OpenStreetMap usage policy) or switch to a paid
  provider (Azure Maps / Google Places).

## OCR for scanned reports

Install Tesseract and, if it is not on `PATH`, set `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe` in `backend/.env`.
Without it, text PDFs and TXT files still work; scanned files are stored and marked "Not extracted".

## Index live WHO / CDC pages (optional)

```powershell
cd backend
.\.venv\Scripts\python -m scripts.ingest_who_cdc                      # pages listed in app/data/health_corpus.json
.\.venv\Scripts\python -m scripts.ingest_who_cdc https://www.who.int/news-room/fact-sheets/detail/malaria
```

Only `https://www.who.int` and `https://www.cdc.gov` URLs are accepted.

## What to work on next

In priority order. Each item builds on what exists; nothing needs a rewrite. Keep the core rule: **rules decide, AI explains.**

| # | Task | Builds on | Notes |
|---|---|---|---|
| 1 | **Health timeline page**: reports, lab results, history entries and analyses grouped by year | `services/trends.py`, `lab_results`, `medical_history`, `analyses` | Start with a computed `GET /api/timeline` (no new table) |
| 2 | **Guideline thresholds in trends**: baseline vs latest, crossings such as HbA1c 5.7 / 6.5, range bands on the chart | `services/trends.py`, `components/TrendChart.tsx` | Thresholds in data, with source links |
| 3 | **Structured recommendations**: rules with IDs and categories (monitor / discuss / lifestyle / repeat test / specialist / warning signs), each with its evidence | `services/care_plan.py` | AI may only reword them, never add new ones |
| 4 | **Health score v1**: deterministic, versioned score per area (blood sugar, heart, kidney, liver, blood, thyroid) with "not enough data" states | lab values + trends | Show every deduction; label it "tracking indicator, not a medical assessment" |
| 5 | **Hindi and Marathi** | `lib/languages.ts` (home-page demo only today) | i18next for the UI; human-reviewed safety text; numbers protected during AI translation |
| 6 | **Evaluation set**: 20-30 synthetic patient cases with expected conditions, urgency and doctor type, plus an accuracy script | `services/scoring.py`, `services/specialty.py` | Useful for the project report |
| 7 | **Sources per specialty rule** | `app/data/specialties.json` | The mapping is hand-written; add a reviewed source link per row |
| 8 | **OpenAI / Azure OpenAI providers** | `app/ai/remote.py`, `registry.py` | Small: same interface as the existing adapters |
| 9 | **Radiology report parsing** (findings such as opacity, fracture) as *radiologist-reported* evidence | `services/extraction.py`, scoring | Official reports always outrank AI image observations |
| 10 | **Azure deployment**: Container Apps, PostgreSQL Flexible Server, Blob Storage, Key Vault | `file_store.py` (add a Blob backend) | Later: Azure Maps for Find care |

**Known issues:**
- The 3D home bundle (`StoryCanvas`) is about 1 MB.
- `Reports.tsx` is imported both lazily and directly, so lazy loading doesn't split it out.
- Scoring weights and specialty rules are not clinically validated.
- Free OpenStreetMap servers are slow or busy at times.

**Workflow:** create a branch per task, run `scripts\test-all.ps1` before pushing, open a pull request, and tell the
migration owner if your change adds a migration.

## Project layout

```
backend/
  app/
    ai/            provider interface, Gemini/Groq/OpenRouter adapters, mock provider, fallback registry
    api/routes/    auth, profile+history, reports, analyses, trends, care (doctor type + nearby), support, staff, knowledge, system
    services/      extraction (PDF/OCR/image quality), lab_parser, lab_catalog, lab_history, trends, symptoms, scoring,
                   safety, care_plan, specialty, facilities (OpenStreetMap), retrieval (BM25), grounding,
                   analysis_engine (pipeline), patient_keys, file_store, support, stats
    data/          conditions.json (screening rules), specialties.json (doctor-type rules), health_corpus.json (WHO/CDC)
    db/            session, migrations runner, sealing (encrypted fields)
    models/ schemas/ core/ (config, security, rate limiting)
  alembic/         migrations 0001-0007
  scripts/         seed_demo, check_db, check_sealing, check_ai, encrypt_uploads, make_staff, ingest_who_cdc, make_sample_data
  sample_data/     synthetic reports (including two follow-ups for trends) and image
  tests/
frontend/
  src/pages/       Home, Auth, Dashboard, Profile, History, Reports, ReportDetail, Trends, NewAnalysis, AnalysisResult,
                   Analyses, FindCare, Library, Staff
  src/components/  layout, UI kit, lab tables, trend chart, specialty card, security / support cards, 3D home (immersive, story, three)
  src/lib/         API client, auth context, types, formatting
docs/ARCHITECTURE.md
e2e/smoke_test.py  browser smoke test (Playwright)
scripts/           setup / run / test helpers (PowerShell + bash)
```
