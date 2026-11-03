# BookMyCare architecture

## Analysis pipeline

```
 Symptoms (chips + free text) ─► symptom normaliser (synonyms, negation) ─┐
 Lab reports ─► extraction (pdf text / OCR) ─► lab parser (ranges, units) ─┼─► rule-based scorer ─► ranked conditions + factors
 Medical images ─► quality features  [+ optional vision-LLM observations] ─┤                │
 Profile & history ─► risk-factor context (age, BMI, sex, pregnancy…) ─────┘                ▼
                                                             safety layer (red flags, urgency)
                                                                          ▼
                                       care-plan builder (personalised)   WHO/CDC BM25 retrieval
                                                                          ▼
                                     AI explanation (Gemini/Groq/OpenRouter or mock) ─► sanitiser
                                                                          ▼
                                       stored Analysis (inputs + full result JSON + provenance)
```

`app/services/analysis_engine.py` orchestrates the steps. Each step is deterministic except the AI explanation and the
optional image observation; those are clearly labelled with their provider.

## Grounded assessment (AI + retrieval)

`services/grounding.py` sits between the rule engine and the language model:

1. **Evidence** - `gather_evidence()` retrieves WHO/CDC passages (BM25, topic-matched) for each of the top three conditions, for red-flag topics (emergency, stroke, mental health) and for the patient's own history (e.g. diabetes, asthma, smoking). Passages are numbered `S1…S8`.
2. **Context** - `build_context()` gives the model the scored conditions (supporting / against / missing evidence), lab values, patient history, the fixed urgency and the numbered passages.
3. **Generation** - `registry.generate()` tries providers in order; `validate_ai_response()` rejects unusable replies so the next provider is tried. Failures keep their kind (`rate_limited`, `auth_error`, `model_not_found`, `timeout`, `invalid_response`, …).
4. **Cleaning** - `clean_ai_output()` drops citation ids that were not retrieved, notes about unknown conditions, diagnostic assertions, dosing, "stop your medicine" and "no need to see a doctor" sentences, and always puts the rule-based urgency guidance first for urgent results.
5. **Assessment** - `build_assessment()` returns one structured block: possible conditions (unconfirmed, with supporting / against evidence, history considered, citations, uncertainty), overall uncertainty, limitations, next steps, citations and an explicit `ai` status (`generated | mock | failed | skipped_emergency`).

Emergency urgency skips the model completely. `is_mock` is true only when template text is shown.

## Scoring (explainable)

For each condition in `app/data/conditions.json`:

* **Symptoms** add their weight when reported.
* **Lab rules** add weight when a value deviates in the expected direction (×0.7 mild, ×1.0 marked, ×1.25 critical).
  Strongly weighted labs that are *normal* subtract points (evidence against).
* **Risk factors** (age, BMI, smoking, alcohol, activity, sex, pregnancy, chronic and family history) add small weights,
  but cannot create a match on their own.
* **Duration** adds weight for chronic patterns (e.g. TB, typhoid) and penalises conditions whose usual course is exceeded.
* **Image observations** (only from a real vision provider, unverified) add small weights via a keyword map.

`match = 0.5 × saturation + 0.5 × coverage`, where saturation = `1 − exp(−1.6 · points / scale)` and coverage is the
share of the condition's observable characteristic features that are present. Lab-defined conditions (diabetes, anaemia,
thyroid, kidney, liver, lipids, vitamins) are capped at 45% without lab evidence. Confidence is *high* only with ≥ 70%
match and either two evidence modalities or a strong lab-defined match.

These weights are hand-set for an explainable prototype and **are not clinically validated**.

## Lab trends (longitudinal)

* Every recognised lab value is stored as a row in `lab_results` (one per test per report, in the catalog unit,
  dated by the report date). `lab_test_catalog` holds the test name, unit, LOINC code and `min_change`.
  Rows are rewritten on upload, re-process and report-date change, and deleted with the report.
* `services/trends.py` works only on these rows, never on the (encrypted, sealed) original files. Per test it reports
  direction, change, slope per year, and flags: `new_abnormal`, `back_to_normal`, `persistent` (abnormal on ≥ 2
  results ≥ 30 days apart), `rapid_change` (≥ 20 % between results), `consistent` and `approaching_limit`
  (in range but projected to cross a limit within a year). The assessment is `worsening`, `improving`,
  `approaching_limit`, `stable` or `single_result`.
* Scoring adds a small, labelled `trend` factor (share of the lab rule's weight) for worsening, persistent or
  approaching trends in the direction a condition expects, and a negative factor for improving trends.
  The AI receives `lab_trends` and must describe them as changes, not causes.
* `min_change` thresholds and trend weights are hand-set and **not clinically validated**.

## Uploaded files

Only the patient can open their original reports (`services/patient_keys.py`, `services/file_store.py`):

* Each patient has a random file key, stored only wrapped with a key derived from their password (scrypt).
* At sign-in the server unwraps it and puts it, encrypted, in the access token (`fk` claim). Uploads, the report text,
  downloads, re-processing and image analysis use it inside that patient's own requests.
* Files are AES-256-GCM encrypted with it (format version 2) in `UPLOAD_DIR` or a private Supabase Storage bucket;
  the extracted report text is encrypted with it in the database. The database, the storage, `FILE_ENCRYPTION_KEY`
  and `JWT_SECRET` together cannot open them, and a token minted by the server has no file key.
* Sealed database fields (`app/db/sealing.py`): models list sensitive attributes in `__sealed__` (name, allergies,
  conditions, medicines, emergency contact, history entries, report titles/file names/lab values/image features,
  analysis inputs and results, lab_results values). The columns hold only AES-GCM ciphertext bound to table, field
  and owner. SQLAlchemy events decrypt after load and encrypt before flush, using the key that `get_current_user`
  puts in `session.info` for the signed-in patient only. Every authenticated request requires that key.
  Plain (demographic) columns used for queries stay plain: email, dates, sex, height/weight, test codes, categories.
* Recovery: the key is also wrapped with a one-time-shown recovery code. `POST /auth/reset-password` (rate-limited)
  sets a new password without data loss and rotates the code; `POST /auth/change-password` re-wraps the key.
  Both raise `users.session_version` (token claim `sv`), which ends all other sessions; `POST /auth/logout-all`
  does the same on request.
* Older data (plain, or files on the server key) is sealed at the owner's next sign-in.
  `python -m scripts.check_sealing` lists anything still readable without a patient key.
* Without the password or the recovery code, nobody (including the team) can open the data.

## Team operations without reading patient data

* **Patient corrections:** `PATCH /api/reports/{id}/labs/{code}` fixes a misread (or adds a missed) lab value;
  the report, `lab_results` and trends update, and the change is logged.
* **Consented support access** (`services/support.py`, `/api/support-access`, `/api/staff/...`): only the patient
  can grant it (their request holds the key) for 1-72 hours. Each staff member (`users.role = "staff"`, set with
  `scripts/make_staff.py`) gets an X25519 key pair at their first sign-in as staff; the private key is a sealed
  field of their own account. The patient's key is encrypted to each staff member's public key (ephemeral X25519 +
  HKDF + AES-GCM, bound to patient, staff member and expiry) in `support_grant_keys`. Only a signed-in staff member
  can open it: server secrets, database and storage together cannot. Staff then view profile, history and lab
  values (with the source line) and correct them in a separate per-patient session; original files and full report
  text stay patient-only. Revoking, expiry or removing the staff role deletes the copies. Every view and change is written to `audit_logs`
  (detail sealed with the patient's key), which the patient sees under *My profile -> Support access*.
* **Anonymous statistics** (`services/stats.py`, `/api/staff/stats`): counters `(metric, month, category) -> count`
  are increased inside patients' own requests (uploads, lab results, out-of-range results, analyses, top matches,
  worsening trends) and hold no user id or free text. Totals from plain columns are added. Groups smaller than
  `STATS_MIN_COUNT` (default 5) are shown as `<N`. Each account, file and analysis has a plain `stats_counted`
  flag: live events set it, and older rows are counted once at the owner's next sign-in (when their key can read
  them), in the month they were created. `/api/staff/stats` reports how much is still waiting (`not_yet_counted`).

## Care navigation (doctor type + nearby facilities)

* **Doctor type is rule-based** (`app/data/specialties.json`, `services/specialty.py`). Each condition maps to a
  general physician (always first-line) plus optional specialists; lab categories map to specialties
  (Diabetes/Thyroid -> endocrinology, Lipids/BP -> cardiology, Kidney -> nephrology, Liver -> gastroenterology,
  Blood count -> haematology, SpO2 -> pulmonology). Suggestions come from condition matches and from worsening,
  near-limit or persistently abnormal lab trends, and every suggestion lists the reasons that triggered it.
  Emergencies put the emergency department first. The AI never chooses a specialty. The mapping is hand-written
  and not clinically validated. Analyses store it as `care_plan.specialty_recommendations`; `GET /api/care/suggested`
  combines the latest analysis with current trends.
* **Nearby facilities** (`services/facilities.py`, `GET /api/care/facilities`, `GET /api/care/geocode`) use
  OpenStreetMap data. Sources are tried in order (`FACILITY_SOURCES`): **Nominatim** (three generic searches,
  "hospital", "clinic", "doctors", bounded to a box around the location; about 6-8 s for a new area) and then
  **Overpass** (more complete, but public servers were mostly at capacity when tested on 2026-11-03). If every source
  fails, results saved for the same area in the last 24 hours are shown and marked as saved. Nominatim also
  resolves place names. Only the location rounded to
  2 decimals (about 1 km) and generic facility types are sent; the condition and the chosen specialty are never
  sent, and specialty filtering happens on the server. Answers are cached for an hour, external calls are limited
  per user, Nominatim gets at most one request per second, and an identifying User-Agent is sent. Every result is labelled "Map listing (OpenStreetMap), not verified", sorted by distance
  only, and the page shows OSM attribution. Verified listings (ABDM Health Facility / Professional Registry) are a
  later step.

## Safety design

1. Red-flag rules run independently of scoring and always override urgency.
2. Crisis messaging for self-harm phrases, with configurable emergency number / helpline (`EMERGENCY_NUMBER`, `CRISIS_LINE`).
3. The LLM receives only structured results and is instructed not to diagnose or prescribe; its output is post-filtered to
   remove sentences with dosages, definitive diagnoses or instructions to change medicines.
4. Mock mode is visible in the UI banner, the result badge and the explanation text.
5. Every result includes the disclaimer, limitations and provenance (engine version, provider, fallbacks).

## Data model

`users` 1–1 `patient_profiles`; `users` 1–n `medical_history`, `medical_reports` (kind = report | image), `analyses`;
`health_documents` (curated or ingested WHO/CDC text). Migrations live in `backend/alembic/versions`.

## Roadmap / not yet implemented

* Trained, validated imaging models (e.g. chest X-ray classifier) behind the existing image interface.
* Vector embeddings for hybrid BM25 + dense retrieval, and a patient-facing question-answer chat built on the same evidence + citation layer.
* Evaluation framework with labelled synthetic vignettes (precision@k, red-flag recall).
* Clinician role, appointment booking, report sharing, audit log, rate limiting, refresh tokens.
* Multilingual explanations.
