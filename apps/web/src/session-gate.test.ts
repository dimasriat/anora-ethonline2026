import { describe, expect, it } from "bun:test";
import { needsSession } from "./session-gate";

describe("needsSession", () => {
  it("lets the public pages through", () => {
    expect(needsSession("")).toBe(false);
    expect(needsSession("#home")).toBe(false);
    expect(needsSession("#how-it-works")).toBe(false);
    expect(needsSession("#access")).toBe(false);
  });

  it("holds the workspace back", () => {
    expect(needsSession("#workspace")).toBe(true);
  });
});
