import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../lib/auth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const user = { id: 1, email: "asha@example.com", full_name: "Asha Example", created_at: "2026-01-01T00:00:00Z" };
const CODE = "ABCDE-FGHJK-MNPQR-STUVW-XYZ23-45678";
let calls: { url: string; body: unknown }[] = [];
let hasCode = true;

beforeEach(() => {
  calls = [];
  hasCode = true;
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  vi.stubGlobal("IntersectionObserver", IO);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (url.endsWith("/api/auth/register")) return json({ access_token: "tok", token_type: "bearer", user, recovery_code: CODE, has_recovery_code: true }, 201);
    if (url.endsWith("/api/auth/reset-password")) {
      return body.recovery_code === CODE
        ? json({ access_token: "tok2", token_type: "bearer", user, recovery_code: "NEWCD-NEWCD-NEWCD-NEWCD-NEWCD-NEWCD", has_recovery_code: true })
        : json({ detail: "Email or recovery code is incorrect" }, 400);
    }
    if (url.endsWith("/api/auth/me")) return localStorage.getItem("bmc_token") === "stale" ? json({ detail: "For your security, please sign in again to unlock your data." }, 401) : json(user);
    if (url.endsWith("/api/auth/security")) return json({ has_recovery_code: hasCode, recovery_created_at: null });
    if (url.endsWith("/api/system/status")) return json({ emergency_number: "112", ai: { mock_mode: false } });
    if (url.endsWith("/api/profile")) return json({ date_of_birth: null, sex: null, height_cm: null, weight_kg: null, blood_group: null, is_pregnant: false, smoker: false, alcohol_use: null, activity_level: null, allergies: [], chronic_conditions: [], current_medications: [], emergency_contact: null });
    if (url.endsWith("/api/reports") || url.endsWith("/api/analyses") || url.endsWith("/api/history")) return json([]);
    return json({ detail: "not found" }, 404);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);

describe("Account security", () => {
  it("shows the recovery code once after sign-up and requires confirming it was saved", async () => {
    const u = userEvent.setup();
    renderAt("/register");
    await u.type(await screen.findByLabelText("Full name"), "Asha Example");
    await u.type(screen.getByLabelText("Email"), "asha@example.com");
    await u.type(screen.getByLabelText("Password"), "Password123");
    await u.type(screen.getByLabelText("Confirm password"), "Password123");
    await u.click(screen.getByRole("checkbox"));
    await u.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByTestId("recovery-code")).toHaveTextContent(CODE);
    const done = screen.getByRole("button", { name: "Done" });
    expect(done).toBeDisabled();
    await u.click(screen.getByLabelText(/I have saved my recovery code/));
    await u.click(done);
    await waitFor(() => expect(screen.queryByTestId("recovery-code")).not.toBeInTheDocument());
  });

  it("resets a forgotten password with the recovery code and shows the new code", async () => {
    const u = userEvent.setup();
    renderAt("/login");
    await u.click(await screen.findByRole("link", { name: "Forgot password?" }));
    await screen.findByLabelText("Recovery code"); // wait for the reset page (lazy-loaded)
    await u.type(screen.getByLabelText("Email"), "asha@example.com");
    await u.type(screen.getByLabelText("Recovery code"), "wrong-code-12345");
    await u.type(screen.getByLabelText("New password"), "BrandNew123");
    await u.type(screen.getByLabelText("Confirm new password"), "BrandNew123");
    await u.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByText("Email or recovery code is incorrect")).toBeInTheDocument();
    await u.clear(screen.getByLabelText("Recovery code"));
    await u.type(screen.getByLabelText("Recovery code"), CODE);
    await u.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByTestId("recovery-code")).toHaveTextContent("NEWCD-NEWCD");
    expect(localStorage.getItem("bmc_token")).toBe("tok2");
  });

  it("explains why an old session must sign in again", async () => {
    localStorage.setItem("bmc_token", "stale");
    renderAt("/reports");
    expect(await screen.findByText("For your security, please sign in again to unlock your data.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("nudges patients without a recovery code", async () => {
    hasCode = false;
    localStorage.setItem("bmc_token", "tok");
    renderAt("/history");
    expect(await screen.findByText("No recovery code yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create one now" })).toBeInTheDocument();
  });
});
