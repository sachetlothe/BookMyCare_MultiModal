import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FindCarePage from "../pages/FindCare";
import SpecialtyCard from "../components/SpecialtyCard";
import type { FacilitiesResponse, SpecialtyRecommendations } from "../lib/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const suggested: SpecialtyRecommendations = {
  version: "specialty-rules-v1",
  note: "Suggested doctor types come from fixed rules.",
  based_on_analysis: null,
  trends_considered: 1,
  items: [
    { code: "general_physician", name: "General medicine", doctor: "General physician", what: "First point of contact.", role: "first_line",
      reasons: [{ source: "trend", text: "HbA1c rose from 6.1% to 7.1% over 1 year (3 results); latest is high." }], when: null },
    { code: "endocrinology", name: "Endocrinology", doctor: "Endocrinologist", what: "Hormone and metabolic conditions.", role: "specialist",
      reasons: [{ source: "trend", text: "HbA1c rose from 6.1% to 7.1% over 1 year (3 results); latest is high." }], when: "to review this change over time" },
  ],
};

const specialties = [
  { code: "emergency", name: "Emergency department", doctor: "Emergency department", what: "" },
  { code: "general_physician", name: "General medicine", doctor: "General physician", what: "" },
  { code: "endocrinology", name: "Endocrinology", doctor: "Endocrinologist", what: "" },
];

const facilities: FacilitiesResponse = {
  source: "openstreetmap", via: "nominatim", stale: false, specialty: "endocrinology", radius_km: 5, count: 1, cached: false,
  attribution: "© OpenStreetMap contributors", attribution_url: "https://www.openstreetmap.org/copyright",
  verification_note: "Listings come from OpenStreetMap and are not verified.", privacy_note: "Only your approximate location was sent.",
  results: [{
    id: "node/1", name: "Sugar Care Clinic", kind: "clinic", kind_label: "Clinic", lat: 18.52, lon: 73.85, specialities: ["endocrinology"],
    address: "FC Road, Pune", phone: "+91 20 1234 5678", website: "https://example.org", opening_hours: null, emergency: false,
    osm_url: "https://www.openstreetmap.org/node/1", distance_km: 0.4, match: "listed", match_text: "Endocrinology listed in map data",
    verification: { status: "map_listing", label: "Map listing (OpenStreetMap), not verified" },
  }],
};

let fetchMock: ReturnType<typeof vi.fn>;
let places: { name: string; lat: number; lon: number }[];

beforeEach(() => {
  localStorage.setItem("bmc_token", "t");
  places = [{ name: "Kothrud, Pune, Maharashtra, India", lat: 18.5074, lon: 73.8077 }];
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/api/care/suggested")) return json(suggested);
    if (url.endsWith("/api/care/specialties")) return json(specialties);
    if (url.endsWith("/api/system/status")) return json({ emergency_number: "112" });
    if (url.includes("/api/care/geocode")) return json({ results: places, attribution: "© OpenStreetMap contributors" });
    if (url.includes("/api/care/facilities")) return json(facilities);
    return json({ detail: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const renderPage = (path = "/care") => render(<MemoryRouter initialEntries={[path]}><FindCarePage /></MemoryRouter>);
const calls = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe("Find care page", () => {
  it("shows rule-based doctor suggestions with their reasons", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Endocrinologist" })).toBeInTheDocument();
    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getByText("May be appropriate")).toBeInTheDocument();
    expect(screen.getAllByText(/HbA1c rose from 6.1% to 7.1%/)).toHaveLength(2);
    expect(screen.getAllByText("From your lab trend:")).toHaveLength(2);
  });

  it("searches a place, then lists nearby facilities labelled as unverified", async () => {
    renderPage("/care?specialty=endocrinology");
    await screen.findByText("Suggested for you");
    fireEvent.change(screen.getByLabelText("Area or city"), { target: { value: "Kothrud, Pune" } });
    fireEvent.click(screen.getByRole("button", { name: /find place/i }));

    expect(await screen.findByText("Sugar Care Clinic")).toBeInTheDocument();
    expect(screen.getByText("Map listing (OpenStreetMap), not verified")).toBeInTheDocument();
    expect(screen.getByText("Endocrinology listed in map data")).toBeInTheDocument();
    expect(screen.getByText("400 m", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\+91 20 1234 5678/ })).toHaveAttribute("href", "tel:+912012345678");
    expect(screen.getByRole("link", { name: "© OpenStreetMap contributors" })).toBeInTheDocument();

    const facilityCall = calls().find((u) => u.includes("/api/care/facilities"))!;
    expect(facilityCall).toContain("specialty=endocrinology");
    expect(facilityCall).toContain("lat=18.5074");
    expect(calls().find((u) => u.includes("/api/care/geocode"))).toContain("q=Kothrud%2C%20Pune");
  });

  it("asks which place was meant when several match", async () => {
    places = [
      { name: "Aundh, Pune, India", lat: 18.56, lon: 73.81 },
      { name: "Aundh, Satara, India", lat: 17.53, lon: 74.37 },
    ];
    renderPage();
    await screen.findByText("Suggested for you");
    fireEvent.change(screen.getByLabelText("Area or city"), { target: { value: "Aundh" } });
    fireEvent.click(screen.getByRole("button", { name: /find place/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Aundh, Satara, India" }));
    await screen.findByText("Sugar Care Clinic");
    expect(calls().find((u) => u.includes("/api/care/facilities"))).toContain("lat=17.53");
  });

  it("explains when location permission is denied", async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" } as GeolocationPositionError));
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /use my current location/i }));
    expect(await screen.findByText(/Location permission was denied/)).toBeInTheDocument();
    expect(calls().some((u) => u.includes("/api/care/facilities"))).toBe(false);
  });

  it("tells the patient to call for help when the emergency department is chosen", async () => {
    renderPage("/care?specialty=emergency");
    expect(await screen.findByText(/call for help now/i)).toBeInTheDocument();
    expect(screen.getByText(/Call 112/)).toBeInTheDocument();
  });

  it("says when saved results are shown because the map servers are busy", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/care/facilities")) return json({ ...facilities, stale: true });
      if (url.endsWith("/api/care/suggested")) return json(suggested);
      if (url.endsWith("/api/care/specialties")) return json(specialties);
      if (url.includes("/api/care/geocode")) return json({ results: places, attribution: "" });
      return json({});
    });
    renderPage();
    await screen.findByText("Suggested for you");
    fireEvent.change(screen.getByLabelText("Area or city"), { target: { value: "Pune" } });
    fireEvent.click(screen.getByRole("button", { name: /find place/i }));
    expect(await screen.findByText("Showing saved results")).toBeInTheDocument();
    expect(screen.getByText("Sugar Care Clinic")).toBeInTheDocument();
  });

  it("shows the server's message when the search fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/care/facilities")) return json({ detail: "The map service is busy. Please try again in a minute." }, 429);
      if (url.endsWith("/api/care/suggested")) return json(suggested);
      if (url.endsWith("/api/care/specialties")) return json(specialties);
      if (url.includes("/api/care/geocode")) return json({ results: places, attribution: "" });
      return json({});
    });
    renderPage();
    await screen.findByText("Suggested for you");
    fireEvent.change(screen.getByLabelText("Area or city"), { target: { value: "Pune" } });
    fireEvent.click(screen.getByRole("button", { name: /find place/i }));
    await waitFor(() => expect(screen.getByText(/map service is busy/)).toBeInTheDocument());
  });
});

describe("SpecialtyCard", () => {
  it("links each suggestion to the nearby search for that specialty", () => {
    render(<MemoryRouter><SpecialtyCard rec={suggested} /></MemoryRouter>);
    expect(screen.getByText("Recommended doctor type")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /find nearby/i });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/care?specialty=general_physician", "/care?specialty=endocrinology"]);
  });

  it("says a general physician is the right first contact when nothing specific is suggested", () => {
    render(<MemoryRouter><SpecialtyCard rec={{ ...suggested, items: [] }} /></MemoryRouter>);
    expect(screen.getByText(/general physician is the right first contact/i)).toBeInTheDocument();
  });
});
