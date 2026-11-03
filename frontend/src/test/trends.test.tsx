import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TrendsPage from "../pages/Trends";
import type { LabTrend, TrendsResponse } from "../lib/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const hba1c: LabTrend = {
  code: "hba1c", name: "HbA1c", unit: "%", category: "Diabetes", loinc: "4548-4", ref_low: null, ref_high: 5.6, n: 3,
  points: [
    { date: "2025-09-15", value: 6.1, status: "high", report_id: 3 },
    { date: "2026-03-12", value: 6.6, status: "high", report_id: 4 },
    { date: "2026-09-22", value: 7.1, status: "high", report_id: 1 },
  ],
  latest: { date: "2026-09-22", value: 7.1, status: "high" }, direction: "rising", assessment: "worsening", toward: "high",
  change: 1, change_pct: 16.4, slope_per_year: 1, span_days: 372,
  flags: [{ kind: "persistent", text: "High on 3 results over 1 year" }],
  events: [{ date: "2026-04-01", category: "medication", title: "Metformin" }],
  summary: "HbA1c rose from 6.1% to 7.1% over 1 year (3 results); latest is high.",
};
const tsh: LabTrend = {
  ...hba1c, code: "tsh", name: "TSH", unit: "mIU/L", category: "Thyroid", loinc: "3016-3", ref_low: 0.4, ref_high: 4, n: 1,
  points: [{ date: "2026-09-22", value: 2.1, status: "normal", report_id: 1 }], latest: { date: "2026-09-22", value: 2.1, status: "normal" },
  direction: null, assessment: "single_result", flags: [], events: [], change: null, change_pct: null, summary: "Only one TSH result so far (2026-09-22).",
};

let body: TrendsResponse;
beforeEach(() => {
  body = { tests: [hba1c, tsh], with_history: 1, needs_attention: 1, note: "Thresholds are hand-set." };
  localStorage.setItem("bmc_token", "t");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("/api/trends") ? json(body) : json({ detail: "not found" }, 404))));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const renderPage = () => render(<MemoryRouter><TrendsPage /></MemoryRouter>);

describe("Lab trends page", () => {
  it("shows worsening trends with a chart, flags, context events and a table view", async () => {
    renderPage();
    expect(await screen.findByText(hba1c.summary, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Getting worse")).toBeInTheDocument();
    expect(screen.getByText("High on 3 results over 1 year")).toBeInTheDocument();
    expect(screen.getByText(/Metformin/)).toBeInTheDocument();
    expect(screen.getByText(/does not mean this caused the change/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: hba1c.summary })).toBeInTheDocument();
    expect(screen.getByText("Discuss these changes with a doctor")).toBeInTheDocument();
    // single-result tests are listed separately, not charted
    expect(screen.getByText("Only one result so far")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: tsh.summary })).not.toBeInTheDocument();
  });

  it("shows a tooltip for a point on hover or keyboard focus", async () => {
    renderPage();
    const points = await screen.findAllByRole("button", { name: /HbA1c|2026|2025/ });
    expect(points).toHaveLength(3);
    fireEvent.focus(points[1]);
    expect(screen.getAllByText("6.6%").length).toBeGreaterThan(0);
  });

  it("explains how to get trends when there are no results", async () => {
    body = { tests: [], with_history: 0, needs_attention: 0, note: "" };
    renderPage();
    expect(await screen.findByText("No lab results yet")).toBeInTheDocument();
  });
});
