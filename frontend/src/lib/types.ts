export interface User {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
  role?: "patient" | "staff";
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
  /** Shown once after sign-up or a password reset; the only way back in after a forgotten password. */
  recovery_code?: string | null;
  has_recovery_code?: boolean;
}

export interface SecurityStatus {
  has_recovery_code: boolean;
  recovery_created_at: string | null;
}

export type Sex = "female" | "male" | "other";

export interface Profile {
  date_of_birth: string | null;
  sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  blood_group: string | null;
  is_pregnant: boolean;
  smoker: boolean;
  alcohol_use: "none" | "occasional" | "regular" | null;
  activity_level: "low" | "moderate" | "high" | null;
  allergies: string[];
  chronic_conditions: string[];
  current_medications: string[];
  emergency_contact: string | null;
  age?: number | null;
  bmi?: number | null;
  updated_at?: string | null;
}

export type HistoryCategory = "condition" | "surgery" | "medication" | "allergy" | "vaccination" | "visit" | "other";

export interface HistoryEntry {
  id: number;
  category: HistoryCategory;
  title: string;
  details: string | null;
  event_date: string | null;
  is_ongoing: boolean;
  created_at: string;
}

export type LabStatus = "low" | "normal" | "high" | "critical_low" | "critical_high";

export interface LabValue {
  test: string;
  key: string;
  value: number;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  status: LabStatus;
  raw?: string | null;
  explanation?: string;
  report_id?: number;
}

export interface ImageFeatures {
  width: number;
  height: number;
  mode: string;
  format: string | null;
  is_grayscale: boolean;
  mean_brightness: number;
  contrast: number;
  sharpness: number;
  quality_warnings: string[];
  quality_ok: boolean;
}

export interface ReportSummary {
  id: number;
  kind: "report" | "image";
  title: string;
  report_type: string | null;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  report_date: string | null;
  extraction_status: "pending" | "done" | "partial" | "failed" | "skipped";
  extraction_method: string | null;
  lab_count: number;
  created_at: string;
}

export interface ReportDetail extends ReportSummary {
  extracted_text: string | null;
  extraction_error: string | null;
  lab_values: LabValue[];
  image_features: ImageFeatures | null;
  /** false while originals are sealed on the server (no preview or download) */
  file_download_allowed: boolean;
}

export type TrendAssessment = "worsening" | "approaching_limit" | "improving" | "stable" | "single_result";

export interface LabTrendPoint {
  date: string;
  value: number;
  status: LabStatus;
  report_id: number | null;
}

export interface LabTrend {
  code: string;
  name: string;
  unit: string;
  category: string | null;
  loinc: string | null;
  ref_low: number | null;
  ref_high: number | null;
  n: number;
  points: LabTrendPoint[];
  latest: { date: string; value: number; status: LabStatus };
  direction: "rising" | "falling" | "stable" | null;
  assessment: TrendAssessment;
  toward: "high" | "low" | null;
  change: number | null;
  change_pct: number | null;
  slope_per_year: number | null;
  span_days: number;
  flags: { kind: string; text: string }[];
  events: { date: string; category: string; title: string }[];
  summary: string;
}

export interface TrendsResponse {
  tests: LabTrend[];
  with_history: number;
  needs_attention: number;
  note: string;
}

export type Urgency = "emergency" | "urgent" | "soon" | "routine";

export interface Factor {
  type: "symptom" | "lab" | "risk_factor" | "duration" | "image" | "missing" | "trend";
  label: string;
  points: number;
  direction: "supports" | "against";
  share: number;
}

export interface ConditionMatch {
  key: string;
  name: string;
  category: string;
  description: string;
  match_score: number;
  score_components?: { saturation: number; coverage: number };
  confidence: "low" | "moderate" | "high";
  evidence_points: number;
  factors: Factor[];
  not_reported: string[];
  suggested_tests: string[];
  specialist: string | null;
  specialties?: string[];
  notes: string[];
}

export interface RedFlag {
  code: string;
  level: Urgency;
  title: string;
  message: string;
}

export interface SourceDoc {
  id?: string;
  reasons?: string[];
  slug: string;
  title: string;
  source: "WHO" | "CDC" | string;
  url: string;
  topics: string[];
  origin: string;
  score: number;
  snippet: string;
}

export interface CarePlan {
  urgency: Urgency;
  follow_up: string;
  immediate_actions: string[];
  self_care: string[];
  when_to_see_doctor: string[];
  suggested_tests: string[];
  specialists: string[];
  personalised: string[];
  /** absent on analyses saved before specialty rules existed */
  specialty_recommendations?: SpecialtyRecommendations;
}

export interface ImageResult {
  report_id: number;
  title: string;
  report_type: string | null;
  quality: Partial<ImageFeatures>;
  error?: string;
  ai_observation: {
    provider: string;
    is_mock: boolean;
    observations: string[];
    possible_findings: string[];
    note: string | null;
    quality: string | null;
    unverified: boolean;
  } | null;
}

export interface AiStatus {
  status: "generated" | "mock" | "failed" | "skipped_emergency";
  is_real_ai: boolean;
  provider: string;
  model: string;
  reason: string | null;
  message: string | null;
  attempts: { provider: string; ok: boolean; kind?: string; error?: string }[];
}

export interface Citation {
  id: string;
  title: string;
  source: string;
  url: string;
  excerpt: string;
  reasons: string[];
}

export interface AssessedCondition {
  key: string;
  name: string;
  status: "unconfirmed";
  is_diagnosis: false;
  confidence: "low" | "moderate" | "high";
  match_score: number;
  supporting: { type: string; label: string; points: number }[];
  against: { type: string; label: string; points: number }[];
  not_reported: string[];
  history_considered: string[];
  already_in_history: boolean;
  evidence_ids: string[];
  evidence_note: string | null;
  uncertainty: string[];
  ai_explanation: string | null;
  ai_cites: string[];
  ai_grounded: boolean;
}

export interface Assessment {
  diagnosis_status: string;
  ai: AiStatus;
  urgency: { level: Urgency; guidance: string; set_by: string; red_flag_codes: string[] };
  possible_conditions: AssessedCondition[];
  uncertainty: { text: string; source: "rules" | "ai" }[];
  limitations: string[];
  history_considered: { conditions: string[]; medications: string[]; allergies: string[]; family_history: string[] };
  citations: Citation[];
}

export interface AnalysisResult {
  ai?: AiStatus;
  assessment?: Assessment;
  disclaimer: string;
  is_mock: boolean;
  urgency: Urgency;
  urgency_guidance: string;
  red_flags: RedFlag[];
  symptoms: { key: string; label: string }[];
  conditions: ConditionMatch[];
  lab_values: LabValue[];
  trends?: LabTrend[];
  abnormal_lab_count: number;
  reports: { report_id: number; title: string; extraction_status: string; lab_count: number }[];
  images: ImageResult[];
  care_plan: CarePlan;
  sources: SourceDoc[];
  explanation: {
    summary: string;
    report_interpretation: string;
    questions_for_doctor: string[];
    notice?: string | null;
    safety_filtered_sentences: number;
    condition_notes?: { key: string; explanation: string; cites: string[]; grounded: boolean }[];
    uncertainty?: string[];
  };
  data_completeness: Record<"symptoms" | "lab_values" | "images" | "profile", boolean> & { lab_history?: boolean };
  limitations: string[];
  provenance: {
    engine_version: string;
    explanation_provider: string;
    explanation_model: string;
    provider_attempts: { provider: string; ok: boolean; error?: string }[];
    image_provider: unknown;
    duration_ms: number;
  };
}

export interface AnalysisInputs {
  symptoms: string[];
  symptom_text: string | null;
  duration_days: number | null;
  severity: "mild" | "moderate" | "severe" | null;
  report_ids: number[];
  image_ids: number[];
  notes: string | null;
}

export interface Analysis {
  id: number;
  status: string;
  urgency: Urgency;
  provider: string;
  is_mock: boolean;
  created_at: string;
  inputs: AnalysisInputs;
  result: AnalysisResult;
}

export interface AnalysisSummary {
  id: number;
  status: string;
  urgency: Urgency;
  provider: string;
  is_mock: boolean;
  created_at: string;
  top_condition: string | null;
  symptom_preview: string[];
}

export interface SystemStatus {
  app: string;
  environment: string;
  ai: {
    active_provider: string;
    mock_mode: boolean;
    force_mock: boolean;
    allow_mock_fallback?: boolean;
    unavailable_reason?: string | null;
    unavailable_message?: string | null;
    providers: { name: string; configured: boolean; model: string; vision: boolean }[];
  };
  ocr: { tesseract_available: boolean };
  emergency_number: string;
  crisis_line: string;
  disclaimer: string;
}

export interface AuditEntry {
  action: string;
  actor_role: string;
  detail: string | null;
  created_at: string;
}

export interface SupportStatus {
  active: boolean;
  expires_at: string | null;
  reason: string | null;
  log: AuditEntry[];
}

export interface StatRow { period: string; dimension: string; count: number | null; display: string }

export interface TeamStats {
  min_count: number;
  note: string;
  totals: {
    patients: number | string;
    files_by_kind: StatRow[];
    analyses_by_month_and_urgency: StatRow[];
    lab_results_by_test: StatRow[];
  };
  counters: { metric: string; label: string; rows: StatRow[] }[];
  /** older data not yet in the counters (counted at each owner's next sign-in) */
  not_yet_counted?: { accounts: number; files: number; analyses: number };
}

export interface SupportRequest { patient_id: number; email: string; reason: string | null; granted_at: string; expires_at: string }

export interface StaffPatientView {
  patient: { id: number; email: string; full_name: string };
  grant: { expires_at: string };
  profile: { sex: string | null; date_of_birth: string | null; allergies: string[]; chronic_conditions: string[]; current_medications: string[] } | null;
  history: { id: number; category: string; title: string; details: string | null; event_date: string | null; is_ongoing: boolean }[];
  reports: { id: number; title: string; report_date: string | null; extraction_status: string;
    lab_values: (Pick<LabValue, "key" | "test" | "value" | "unit" | "ref_low" | "ref_high" | "status" | "raw"> & { corrected?: boolean; original_value?: number | null })[] }[];
  not_available: string;
}

// ---- Care navigation ----------------------------------------------------------

export interface Specialty {
  code: string;
  name: string;
  doctor: string;
  what: string;
}

export interface SpecialtySuggestion extends Specialty {
  role: "emergency" | "first_line" | "specialist";
  reasons: { source: "condition" | "trend" | "safety"; text: string }[];
  when: string | null;
}

export interface SpecialtyRecommendations {
  version: string;
  items: SpecialtySuggestion[];
  note: string;
  based_on_analysis?: { analysis_id: number; created_at: string } | null;
  trends_considered?: number;
}

export interface Facility {
  id: string;
  name: string;
  kind: "hospital" | "clinic" | "doctors" | "centre";
  kind_label: string;
  lat: number;
  lon: number;
  specialities: string[];
  address: string | null;
  phone: string | null;
  website: string | null;
  opening_hours: string | null;
  emergency: boolean;
  osm_url: string;
  distance_km: number;
  match: "listed" | "emergency" | "hospital" | "unknown";
  match_text: string;
  verification: { status: "map_listing"; label: string };
}

export interface FacilitiesResponse {
  source: "openstreetmap";
  /** which OpenStreetMap service answered */
  via: "nominatim" | "overpass";
  /** true when every service was down and results saved earlier (up to a day old) are shown */
  stale: boolean;
  specialty: string | null;
  radius_km: number;
  count: number;
  results: Facility[];
  cached: boolean;
  attribution: string;
  attribution_url: string;
  verification_note: string;
  privacy_note: string;
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
}
