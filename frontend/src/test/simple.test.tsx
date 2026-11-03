import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import LabResults from "../components/LabResults";
import { buildMeter, simpleSummary, zoneOf } from "../lib/simpleLabs";
import type { LabValue } from "../lib/types";

const labs: LabValue[] = [
  { test: "Hemoglobin", key: "hemoglobin", value: 10.8, unit: "g/dL", ref_low: 12, ref_high: 15.5, status: "low" },
  { test: "White blood cells", key: "wbc", value: 7.2, unit: "x10^3/µL", ref_low: 4, ref_high: 11, status: "normal" },
  { test: "Platelets", key: "platelets", value: 40, unit: "x10^3/µL", ref_low: 150, ref_high: 450, status: "critical_low" },
  { test: "Mystery", key: "unknown_test", value: 3, unit: null, ref_low: null, ref_high: null, status: "normal" },
];

afterEach(() => localStorage.clear());

describe("buildMeter", () => {
  it("places values using only the supplied reference range", () => {
    const m = buildMeter(10.8, 12, 15.5)!;
    expect(m.segments.map((s) => s.zone)).toEqual(["low", "normal", "high"]);
    const normal = m.segments.find((s) => s.zone === "normal")!;
    expect(m.position).toBeLessThan(normal.from);
  });
  it("supports one-sided ranges and refuses to invent a range", () => {
    expect(buildMeter(220, null, 199)!.segments.map((s) => s.zone)).toEqual(["normal", "high"]);
    expect(buildMeter(35, 40, null)!.segments.map((s) => s.zone)).toEqual(["low", "normal"]);
    expect(buildMeter(3, null, null)).toBeNull();
  });
  it("flags values beyond the drawn scale", () => {
    expect(buildMeter(1000, 150, 450)!.offScale).toBe("above");
  });
});

describe("Simple Mode", () => {
  it("summarises and maps statuses", () => {
    expect(simpleSummary(labs)).toEqual({ inRange: 2, outside: 2, critical: 1 });
    expect(zoneOf("critical_high")).toBe("high");
  });

  it("toggles between the detailed table and friendly explanations, and remembers the choice", async () => {
    render(<LabResults labs={labs} />);
    const toggle = screen.getByRole("switch", { name: /Simple Mode/ });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("table")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText("Oxygen delivery trucks")).toBeInTheDocument();
    expect(screen.getByText("Body's security guards")).toBeInTheDocument();
    expect(screen.getByText("Tiny repair helpers")).toBeInTheDocument();
    expect(screen.getByText(/2 of 4 values are within the typical range/)).toBeInTheDocument();
    expect(screen.getByText(/please contact your doctor today/)).toBeInTheDocument();
    expect(screen.getByText(/No reference range was available/)).toBeInTheDocument();
    expect(screen.getAllByText(/not a diagnosis/).length).toBeGreaterThan(0);
    expect(localStorage.getItem("bmc_simple_mode")).toBe("1");

    await userEvent.click(toggle);
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});
