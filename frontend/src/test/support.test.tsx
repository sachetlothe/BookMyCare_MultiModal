import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LabCorrectionForm from "../components/LabCorrectionForm";
import SupportAccessCard from "../components/SupportAccessCard";
import StaffPage from "../pages/Staff";
import { AuthProvider } from "../lib/auth";
import type { ReportDetail } from "../lib/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const report = {
  id: 5, kind: "report", title: "CBC", report_type: null, original_filename: "cbc.txt", content_type: "text/plain", size_bytes: 10,
  report_date: "2026-05-01", extraction_status: "done", extraction_method: "plain_text", lab_count: 1, created_at: "2026-05-01T00:00:00Z",
  extracted_text: "HbA1c: 7.1 %", extraction_error: null, image_features: null, file_download_allowed: true,
  lab_values: [{ test: "HbA1c", key: "hba1c", value: 7.1, unit: "%", ref_low: null, ref_high: 5.6, status: "high", raw: "HbA1c: 7.1 %" }],
} as ReportDetail;

let calls: { url: string; method: string; body: unknown }[] = [];
let support = { active: false, expires_at: null as string | null, reason: null as string | null, log: [] as unknown[] };

beforeEach(() => {
  calls = [];
  support = { active: false, expires_at: null, reason: null, log: [] };
  localStorage.setItem("bmc_token", "t");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    if (url.endsWith("/api/reports/5/labs/hba1c")) return json({ ...report, lab_values: [{ ...report.lab_values[0], value: body.value }] });
    if (url.endsWith("/api/support-access") && method === "POST") {
      support = { active: true, expires_at: "2026-11-02T10:00:00Z", reason: body.reason, log: [{ action: "support_access_granted", actor_role: "patient", detail: "Support access allowed for 24 hour(s)", created_at: "2026-11-01T10:00:00Z" }] };
      return json(support, 201);
    }
    if (url.endsWith("/api/support-access") && method === "DELETE") { support = { ...support, active: false, expires_at: null }; return json(support); }
    if (url.endsWith("/api/support-access")) return json(support);
    if (url.endsWith("/api/auth/me")) return json({ id: 9, email: "team@example.com", full_name: "Team", created_at: "2026-01-01T00:00:00Z", role: "staff" });
    if (url.endsWith("/api/auth/security")) return json({ has_recovery_code: true, recovery_created_at: null });
    if (url.endsWith("/api/staff/support-requests")) return json([{ patient_id: 3, email: "asha@example.com", reason: "HbA1c wrong", granted_at: "2026-11-01T09:00:00Z", expires_at: "2026-11-02T09:00:00Z" }]);
    if (url.endsWith("/api/staff/stats")) return json({
      min_count: 5, note: "Anonymous counts only.",
      totals: { patients: "<5", files_by_kind: [], analyses_by_month_and_urgency: [{ period: "2026-11", dimension: "soon", count: 12, display: "12" }], lab_results_by_test: [] },
      counters: [{ metric: "lab_abnormal", label: "Out-of-range lab results (by test and direction)", rows: [{ period: "2026-11", dimension: "hba1c:high", count: null, display: "<5" }] }],
    });
    return json({ detail: "not found" }, 404);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("Fixing data and team reports", () => {
  it("lets the patient correct a misread lab value", async () => {
    const u = userEvent.setup();
    const onSaved = vi.fn();
    render(<LabCorrectionForm report={report} onSaved={onSaved} />);
    await u.click(screen.getByRole("button", { name: /Correct it/ }));
    expect(screen.getByText("HbA1c: 7.1 %")).toBeInTheDocument();
    await u.type(screen.getByLabelText(/Correct value/), "6.1");
    await u.click(screen.getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ value: 6.1 });
  });

  it("lets the patient allow and withdraw support access and see the activity log", async () => {
    const u = userEvent.setup();
    render(<SupportAccessCard />);
    await u.type(await screen.findByLabelText(/What do you need help with/), "HbA1c wrong");
    await u.click(screen.getByRole("button", { name: "Allow support access" }));
    expect(await screen.findByText("Support can currently see your data")).toBeInTheDocument();
    expect(screen.getByText(/Support access allowed for 24 hour/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Withdraw access now" }));
    expect(await screen.findByRole("button", { name: "Allow support access" })).toBeInTheDocument();
  });

  it("shows staff only consented patients and anonymous, suppressed statistics", async () => {
    render(<MemoryRouter><AuthProvider><StaffPage /></AuthProvider></MemoryRouter>);
    expect(await screen.findByText("asha@example.com")).toBeInTheDocument();
    expect(await screen.findByText("hba1c:high")).toBeInTheDocument();
    expect(screen.getAllByText("<5").length).toBeGreaterThan(0);
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
