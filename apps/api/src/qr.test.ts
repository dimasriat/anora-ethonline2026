import { describe, expect, test } from "vitest";
import { qrSvg } from "./qr";

describe("the connector QR", () => {
  test("renders the payload as a self-contained svg", async () => {
    const svg = await qrSvg("https://world.org/verify?t=abc");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("qrserver.com");
  });

  test("never leaves the payload readable in the markup", async () => {
    const svg = await qrSvg("https://world.org/verify?t=secret-token");
    expect(svg).not.toContain("secret-token");
  });

  test("refuses an empty payload rather than drawing nothing", async () => {
    await expect(qrSvg("")).rejects.toThrow();
  });
});
