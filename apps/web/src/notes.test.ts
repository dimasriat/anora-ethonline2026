import { describe, expect, test } from "vitest";
import { noteDetail } from "./notes";

describe("how a held note describes its return", () => {
  test("states an annualized target, never a coupon", () => {
    const detail = noteDetail(240, "18 Nov 2026");
    expect(detail).toContain("2.4% annualized target");
    expect(detail).toContain("matures 18 Nov 2026");
    expect(detail).not.toContain("p.a.");
  });

  test("keeps one decimal so 450bp does not read as 5%", () => {
    expect(noteDetail(450, "15 Jan 2027")).toContain("4.5%");
  });
});
