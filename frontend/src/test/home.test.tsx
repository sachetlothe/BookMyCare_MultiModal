import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../lib/auth";
import UploadPanel, { useReportUpload } from "../components/story/UploadPanel";
import DashboardPage from "../pages/Dashboard";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const uploaded = {
  id: 42, kind: "report", title: "cbc", report_type: "blood_test", original_filename: "cbc.txt", content_type: "text/plain",
  size_bytes: 30, report_date: null, extraction_status: "done", extraction_method: "plain_text", lab_count: 0, created_at: "2026-10-31T10:00:00Z",
  extracted_text: "Hemoglobin 10.8 g/dL", extraction_error: null, image_features: null, file_download_allowed: false,
  lab_values: [{ test: "Hemoglobin", key: "hemoglobin", value: 10.8, unit: "g/dL", ref_low: 12, ref_high: 15.5, status: "low" }],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  vi.stubGlobal("IntersectionObserver", IO);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  localStorage.setItem("bmc_token", "t");
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/auth/me")) return json({ id: 1, email: "a@b.com", full_name: "Riya Sharma", created_at: "2026-01-01T00:00:00Z" });
    if (url.endsWith("/api/profile")) return json({ date_of_birth: null, sex: null, height_cm: null, weight_kg: null, blood_group: null, is_pregnant: false, smoker: false, alcohol_use: null, activity_level: null, allergies: [], chronic_conditions: [], current_medications: [], emergency_contact: null });
    if (url.endsWith("/api/reports") && init?.method === "POST") return json(uploaded, 201);
    if (url.endsWith("/api/reports")) return json([]);
    if (url.endsWith("/api/analyses")) return json([{ id: 7, status: "completed", urgency: "soon", provider: "gemini", is_mock: false, created_at: "2026-10-30T10:00:00Z", top_condition: "Iron deficiency anaemia", symptom_preview: ["Fatigue"] }]);
    if (url.endsWith("/api/history")) return json([]);
    return json({ detail: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const renderHome = () => render(<MemoryRouter><AuthProvider><DashboardPage /></AuthProvider></MemoryRouter>);

describe("Home storytelling page", () => {
  it("shows the hero, the four story steps and the real dashboard data", async () => {
    renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your Health, Beyond the Numbers.");
    expect(screen.getByRole("button", { name: /Start Your Health Journey/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Explore the Experience/ })).toBeInTheDocument();
    const steps = within(screen.getByRole("navigation", { name: "Story steps" })).getAllByRole("button");
    expect(steps.map((b) => b.getAttribute("aria-label"))).toEqual(["1. Welcome", "2. Confusion", "3. Upload", "4. Analysis", "5. Understand", "6. Insights", "7. Care", "8. Language"]);
    expect(screen.getByRole("heading", { name: /Everything your health information needs/ })).toBeInTheDocument();
    expect(screen.getByText("Sample values · for illustration")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Welcome back! Let's understand your health journey/ })).toBeInTheDocument();
    expect(await screen.findByText("Iron deficiency anaemia")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Start Your Health Journey/ }));
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it("links quick actions to real pages and shows notifications from real data", async () => {
    renderHome();
    expect(screen.getByRole("link", { name: /Previous reports/ })).toHaveAttribute("href", "/reports");
    expect(await screen.findByRole("link", { name: /Care plan/ })).toHaveAttribute("href", "/analyses/7");
    expect(screen.getByRole("button", { name: /Upload X-ray/ })).toBeInTheDocument();
    expect(await screen.findByText(/Your profile is 0% complete/)).toBeInTheDocument();
  });

});

function UploadHarness() {
  const upload = useReportUpload();
  return <UploadPanel {...upload} />;
}

describe("Story upload panel", () => {
  it("uploads through POST /api/reports and links to Simple Mode", async () => {
    render(<MemoryRouter><UploadHarness /></MemoryRouter>);
    const file = new File(["Hemoglobin 10.8 g/dL"], "cbc.txt", { type: "text/plain" });
    await userEvent.upload(screen.getByTestId("story-file-input"), file);
    expect(await screen.findByText(/Uploaded! 1 lab value\(s\) recognised/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith("/api/reports") && i?.method === "POST")!;
    expect(url).toBe("/api/reports");
    const body = init.body as FormData;
    expect(body.get("kind")).toBe("report");
    expect((body.get("file") as File).name).toBe("cbc.txt");
    const link = screen.getByRole("link", { name: /See it in Simple Mode/ });
    expect(link).toHaveAttribute("href", "/reports/42");
    await userEvent.click(link);
    await waitFor(() => expect(localStorage.getItem("bmc_simple_mode")).toBe("1"));
  });

  it("uploads X-rays as images with the xray type", async () => {
    render(<MemoryRouter><UploadHarness /></MemoryRouter>);
    await userEvent.click(screen.getByRole("radio", { name: /X-ray image/ }));
    const input = screen.getByTestId("story-file-input");
    expect(input).toHaveAttribute("accept", ".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff");
    await userEvent.upload(input, new File(["img"], "chest.png", { type: "image/png" }));
    await screen.findByRole("status");
    const [, init] = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith("/api/reports") && i?.method === "POST")!;
    const body = init.body as FormData;
    expect(body.get("kind")).toBe("image");
    expect(body.get("report_type")).toBe("xray");
  });

  it("rejects unsupported files before calling the API", async () => {
    render(<MemoryRouter><UploadHarness /></MemoryRouter>);
    await userEvent.upload(screen.getByTestId("story-file-input"), new File(["x"], "virus.exe"), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Upload a PDF/);
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
  });
});
