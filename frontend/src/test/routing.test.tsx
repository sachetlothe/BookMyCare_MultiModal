import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../lib/auth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const user = { id: 1, email: "demo@example.com", full_name: "Riya Sharma", created_at: "2026-01-01T00:00:00Z" };

beforeEach(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  vi.stubGlobal("IntersectionObserver", IO);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/auth/login") && init?.method === "POST") return json({ access_token: "tok", token_type: "bearer", user });
    if (url.endsWith("/api/auth/me")) return json(user);
    if (url.endsWith("/api/system/status")) return json({ emergency_number: "112", ai: { mock_mode: false } });
    if (url.endsWith("/api/profile")) return json({ date_of_birth: null, sex: null, height_cm: null, weight_kg: null, blood_group: null, is_pregnant: false, smoker: false, alcohol_use: null, activity_level: null, allergies: [], chronic_conditions: [], current_medications: [], emergency_contact: null });
    if (url.endsWith("/api/reports") || url.endsWith("/api/analyses") || url.endsWith("/api/history")) return json([]);
    return json({ detail: "not found" }, 404);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);

describe("Public homepage and auth routing", () => {
  it("shows the public homepage at / without a login form", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Your Health, Beyond the Numbers.");
    const nav = within(screen.getByRole("navigation", { name: "Primary" }));
    expect(nav.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(nav.getByRole("link", { name: /Get Started/ })).toHaveAttribute("href", "/register");
    for (const l of ["Home", "How It Works", "Features", "About", "Languages"]) expect(screen.getAllByRole("button", { name: l }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Everything your health information needs/ })).toBeInTheDocument();
  });

  it("opens /login from the Login button, and Back to Home returns to /", async () => {
    renderAt("/");
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Primary" })).getByRole("link", { name: "Login" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Create an account" }));
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /Back to Home/ }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Your Health, Beyond the Numbers.");
  });

  it("protects /dashboard and lands there after a successful login", async () => {
    renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "demo@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Password1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: /Welcome back! Let's understand your health journey/ })).toBeInTheDocument();
    expect(localStorage.getItem("bmc_token")).toBe("tok");
  });

  it("signs in from /login with no previous page and opens the dashboard", async () => {
    renderAt("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "demo@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Password1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /Welcome back! Let's understand your health journey/ })).toBeInTheDocument());
  });

  it("shows a Dashboard button instead of Login when already signed in", async () => {
    localStorage.setItem("bmc_token", "tok");
    renderAt("/");
    expect(await screen.findByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
  });
});
