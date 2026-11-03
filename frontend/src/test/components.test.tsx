import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../lib/auth";
import { LoginPage } from "../pages/Auth";
import { ResultView } from "../pages/AnalysisResult";
import { analysisFixture, withAi } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("ResultView", () => {
  it("shows urgency, red flags, conditions with explanations and the mock label", async () => {
    render(<MemoryRouter><ResultView result={analysisFixture} /></MemoryRouter>);
    expect(screen.getByTestId("urgency-banner")).toHaveTextContent("See a doctor within 24 hours.");
    expect(screen.getByText("Warning signs detected")).toBeInTheDocument();
    expect(screen.getByText("Dengue fever")).toBeInTheDocument();
    expect(screen.getByText("86%")).toBeInTheDocument();
    expect(screen.getByText("Mock AI")).toBeInTheDocument();
    // top condition is expanded by default and shows its factors, including evidence against
    expect(screen.getByText("Why this was suggested")).toBeInTheDocument();
    expect(screen.getByText(/HbA1c normal/)).toBeInTheDocument();
    expect(screen.getByText(/not a medical diagnosis/)).toBeInTheDocument();
    // collapsing works
    await userEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByText("Why this was suggested")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read on who.int/ })).toHaveAttribute("href", "https://www.who.int/x");
  });
});

describe("ResultView - explicit AI status and grounded evidence", () => {
  const view = (r: typeof analysisFixture) => render(<MemoryRouter><ResultView result={r} /></MemoryRouter>);

  it("shows real AI with citations, history, uncertainty and a not-a-diagnosis label (no mock label)", () => {
    view(withAi({ status: "generated" }));
    expect(screen.getByText("AI: gemini")).toBeInTheDocument();
    expect(screen.queryByText("Mock AI")).not.toBeInTheDocument();
    expect(screen.getByText(/Possible match only - not a diagnosis/)).toBeInTheDocument();
    expect(screen.getByText(/Fever and low platelets can fit dengue/)).toBeInTheDocument();
    const chips = screen.getAllByRole("link", { name: "[S1]" });
    expect(chips[0]).toHaveAttribute("href", "https://www.who.int/x");
    expect(screen.getByText(/Existing condition in your history: Type 2 diabetes/)).toBeInTheDocument();
    expect(screen.getByText("A blood test is needed to tell these apart.")).toBeInTheDocument();
    expect(screen.getByText("Evidence used")).toBeInTheDocument();
    expect(screen.getByTestId("urgency-banner")).toHaveTextContent("See a doctor within 24 hours.");
  });

  it("labels mock output and says why real AI was not used", () => {
    view(withAi({ status: "mock", provider: "mock", model: "template-v1", reason: "missing_key", message: "Real AI was not used: No AI provider key is configured." }));
    expect(screen.getByText("Mock AI")).toBeInTheDocument();
    expect(screen.getByText(/a real AI model was not used/)).toBeInTheDocument();
    expect(screen.getByText(/No AI provider key is configured/)).toBeInTheDocument();
  });

  it("shows an explicit failure instead of fake AI text", () => {
    view(withAi({ status: "failed", provider: "none", model: "", reason: "all_providers_failed", message: "AI explanation unavailable: gemini: The AI provider's rate limit or quota was reached." }));
    expect(screen.getByText("AI unavailable")).toBeInTheDocument();
    expect(screen.getByText(/rate limit or quota was reached/)).toBeInTheDocument();
    expect(screen.queryByText("Mock AI")).not.toBeInTheDocument();
  });

  it("says safety rules (not AI) produced emergency guidance", () => {
    view(withAi({ status: "skipped_emergency", provider: "rules", model: "safety-rules-v1", message: "No AI model was used for the explanation." }, { urgency: "emergency", urgency_guidance: "Seek emergency medical care now." }));
    expect(screen.getByText("Safety rules")).toBeInTheDocument();
    expect(screen.getByText(/No AI model was used/)).toBeInTheDocument();
    expect(screen.getByTestId("urgency-banner")).toHaveTextContent("Seek emergency medical care now.");
  });

  it("flags AI explanations that cite no source", () => {
    const r = withAi({ status: "generated" });
    r.assessment!.possible_conditions[0].ai_grounded = false;
    r.assessment!.possible_conditions[0].ai_cites = [];
    view(r);
    expect(screen.getByText(/No source was cited/)).toBeInTheDocument();
  });
});

describe("LoginPage", () => {
  it("shows the server error message on failed login", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Incorrect email or password" }), { status: 401 })));
    render(<MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Incorrect email or password"));
  });

  it("lets the user show and hide the password", async () => {
    render(<MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>);
    const pw = screen.getByLabelText("Password");
    expect(pw).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(pw).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(pw).toHaveAttribute("type", "password");
  });

  it("reports a friendly message when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "Password1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Cannot reach the BookMyCare server/));
  });
});
