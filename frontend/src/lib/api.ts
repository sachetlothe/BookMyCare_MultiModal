import type {
  Analysis, AnalysisInputs, AnalysisSummary, HistoryEntry, Profile, ReportDetail, ReportSummary, TrendsResponse,
  FacilitiesResponse, Place, SecurityStatus, SourceDoc, Specialty, SpecialtyRecommendations, StaffPatientView, SupportRequest, SupportStatus, SystemStatus, TeamStats, TokenResponse, User,
} from "./types";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "bmc_token";
const REASON_KEY = "bmc_signin_reason";

/** Why the user was signed out (shown once on the login page). */
export const signInReason = {
  take: (): string | null => {
    try { const r = sessionStorage.getItem(REASON_KEY); sessionStorage.removeItem(REASON_KEY); return r; } catch { return null; }
  },
  set: (r: string) => { try { sessionStorage.setItem(REASON_KEY, r); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const tokenStore = {
  get: (): string | null => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => (x && typeof x === "object" && "msg" in x ? String(x.msg) : String(x))).join("; ");
  }
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the BookMyCare server. Is the backend running on port 8000?");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) {
      signInReason.set(errorMessage(body, "Your session has ended. Please sign in again."));
      onUnauthorized();
    }
    throw new ApiError(res.status, errorMessage(body, `Request failed (${res.status})`));
  }
  return body as T;
}

const json = (data: unknown) => JSON.stringify(data);

export const api = {
  register: (email: string, full_name: string, password: string) =>
    request<TokenResponse>("/auth/register", { method: "POST", body: json({ email, full_name, password }) }),
  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", { method: "POST", body: json({ email, password }) }),
  me: () => request<User>("/auth/me"),
  securityStatus: () => request<SecurityStatus>("/auth/security"),
  newRecoveryCode: (password: string) =>
    request<{ recovery_code: string; recovery_created_at: string }>("/auth/recovery-code", { method: "POST", body: json({ password }) }),
  changePassword: (current_password: string, new_password: string) =>
    request<TokenResponse>("/auth/change-password", { method: "POST", body: json({ current_password, new_password }) }),
  resetPassword: (email: string, recovery_code: string, new_password: string) =>
    request<TokenResponse>("/auth/reset-password", { method: "POST", body: json({ email, recovery_code, new_password }) }),
  logoutAll: () => request<void>("/auth/logout-all", { method: "POST" }),
  status: () => request<SystemStatus>("/system/status"),

  getProfile: () => request<Profile>("/profile"),
  updateProfile: (p: Profile) => request<Profile>("/profile", { method: "PUT", body: json(p) }),

  listHistory: () => request<HistoryEntry[]>("/history"),
  createHistory: (e: Omit<HistoryEntry, "id" | "created_at">) => request<HistoryEntry>("/history", { method: "POST", body: json(e) }),
  updateHistory: (id: number, e: Partial<HistoryEntry>) => request<HistoryEntry>(`/history/${id}`, { method: "PATCH", body: json(e) }),
  deleteHistory: (id: number) => request<void>(`/history/${id}`, { method: "DELETE" }),

  listReports: (kind?: "report" | "image") => request<ReportSummary[]>(`/reports${kind ? `?kind=${kind}` : ""}`),
  getReport: (id: number) => request<ReportDetail>(`/reports/${id}`),
  uploadReport: (form: FormData) => request<ReportDetail>("/reports", { method: "POST", body: form }),
  updateReport: (id: number, body: { title?: string; report_type?: string | null; report_date?: string | null }) =>
    request<ReportDetail>(`/reports/${id}`, { method: "PATCH", body: json(body) }),
  getTrends: () => request<TrendsResponse>("/trends"),
  correctLab: (reportId: number, code: string, value: number) =>
    request<ReportDetail>(`/reports/${reportId}/labs/${code}`, { method: "PATCH", body: json({ value }) }),

  supportStatus: () => request<SupportStatus>("/support-access"),
  grantSupport: (hours: number, reason: string | null) => request<SupportStatus>("/support-access", { method: "POST", body: json({ hours, reason }) }),
  revokeSupport: () => request<SupportStatus>("/support-access", { method: "DELETE" }),

  staffStats: () => request<TeamStats>("/staff/stats"),
  staffRequests: () => request<SupportRequest[]>("/staff/support-requests"),
  staffPatient: (id: number) => request<StaffPatientView>(`/staff/patients/${id}`),
  staffCorrectLab: (pid: number, rid: number, code: string, value: number, note: string | null) =>
    request<{ ok: boolean }>(`/staff/patients/${pid}/reports/${rid}/labs/${code}`, { method: "PATCH", body: json({ value, note }) }),
  staffFixHistory: (pid: number, hid: number, body: { title?: string; details?: string | null; note?: string | null }) =>
    request<{ ok: boolean }>(`/staff/patients/${pid}/history/${hid}`, { method: "PATCH", body: json(body) }),
  reprocessReport: (id: number) => request<ReportDetail>(`/reports/${id}/reprocess`, { method: "POST" }),
  deleteReport: (id: number) => request<void>(`/reports/${id}`, { method: "DELETE" }),
  reportFileUrl: (id: number) => `${BASE}/api/reports/${id}/file`,
  async reportBlob(id: number): Promise<Blob> {
    const res = await fetch(`${BASE}/api/reports/${id}/file`, { headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` } });
    if (!res.ok) throw new ApiError(res.status, "Could not load file");
    return res.blob();
  },

  symptomCatalog: () => request<{ key: string; label: string }[]>("/analyses/symptoms"),
  createAnalysis: (inputs: Partial<AnalysisInputs>) => request<Analysis>("/analyses", { method: "POST", body: json(inputs) }),
  listAnalyses: () => request<AnalysisSummary[]>("/analyses"),
  getAnalysis: (id: number) => request<Analysis>(`/analyses/${id}`),
  deleteAnalysis: (id: number) => request<void>(`/analyses/${id}`, { method: "DELETE" }),

  careSpecialties: () => request<Specialty[]>("/care/specialties"),
  careSuggested: () => request<SpecialtyRecommendations>("/care/suggested"),
  careFacilities: (lat: number, lon: number, radiusKm: number, specialty: string | null) => {
    const q = new URLSearchParams({ lat: String(lat), lon: String(lon), radius_km: String(radiusKm) });
    if (specialty) q.set("specialty", specialty);
    return request<FacilitiesResponse>(`/care/facilities?${q}`);
  },
  geocode: (q: string) => request<{ results: Place[]; attribution: string }>(`/care/geocode?q=${encodeURIComponent(q)}`),

  searchKnowledge: (q: string, k = 8) => request<{ query: string; results: SourceDoc[] }>(`/knowledge/search?q=${encodeURIComponent(q)}&k=${k}`),
};
