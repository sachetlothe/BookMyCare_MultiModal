import { describe, expect, it } from "vitest";
import { extractionNote } from "../lib/format";

describe("extractionNote", () => {
  it("describes extraction problems in plain English", () => {
    expect(extractionNote("failed")).toBe("the text could not be read");
    expect(extractionNote("partial")).toBe("only part of the text could be read");
    expect(extractionNote("skipped")).toBe("text reading was skipped");
    expect(`Uploaded, but ${extractionNote("failed")}.`).not.toMatch(/was failed/);
  });
});
