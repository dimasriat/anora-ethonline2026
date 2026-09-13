import { describe, expect, test } from "bun:test";
import { readCheck } from "./world-check";

describe("what the page does with an eligibility session", () => {
  test("finishes at once when the adapter simulates the check", () => {
    expect(readCheck({ id: "S1", state: "verified", connectorURI: "", qrSvg: null }))
      .toEqual({ phase: "verified", scannable: null });
  });

  test("shows a code to scan while a real check is outstanding", () => {
    const seen = readCheck({ id: "S1", state: "pending", connectorURI: "https://world.org/v?t=a", qrSvg: "<svg/>" });
    expect(seen.phase).toBe("waiting");
    expect(seen.scannable).toEqual({ uri: "https://world.org/v?t=a", svg: "<svg/>" });
  });

  test("keeps waiting rather than claiming success when the code is missing", () => {
    expect(readCheck({ id: "S1", state: "pending", connectorURI: "", qrSvg: null }).phase).toBe("waiting");
  });

  test("reports a refusal with the reason World gave", () => {
    expect(readCheck({ id: "S1", state: "failed", connectorURI: "", qrSvg: null, because: "environment_mismatch" }))
      .toEqual({ phase: "failed", scannable: null, because: "environment_mismatch" });
  });
});

describe("a poll that answers without the code", () => {
  test("still reads as waiting, so the page can keep the code it has", () => {
    const first = readCheck({ id: "S1", state: "pending", connectorURI: "https://world.org/v?t=a", qrSvg: "<svg/>" });
    const poll = readCheck({ id: "S1", state: "pending", connectorURI: "", qrSvg: null });
    expect(first.scannable).not.toBeNull();
    expect(poll.phase).toBe("waiting");
    expect(poll.scannable).toBeNull();
  });
});
