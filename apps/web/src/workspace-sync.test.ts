import { describe, expect, it } from "bun:test";
import { syncWorkspace } from "./workspace-sync";

const flow = { id: "f1" } as never;
const view = { state: { receipts: {} }, options: { borrower: [] } } as never;

describe("syncWorkspace", () => {
  it("keeps the intake view when the signed-in feed is rejected", async () => {
    const result = await syncWorkspace({
      requests: () => Promise.reject(new Error("Sign in to continue")),
      intake: () => Promise.resolve(view),
    });

    expect(result.intake).toBe(view);
    expect(result.flow).toBeNull();
    expect(result.error).toBeNull();
  });

  it("reports an error when the intake view itself is rejected", async () => {
    const result = await syncWorkspace({
      requests: () => Promise.resolve([flow]),
      intake: () => Promise.reject(new Error("Registry unavailable")),
    });

    expect(result.intake).toBeNull();
    expect(result.error).toBe("Registry unavailable");
  });

  it("returns the last flow and the intake view when both resolve", async () => {
    const result = await syncWorkspace({
      requests: () => Promise.resolve([{ id: "old" } as never, flow]),
      intake: () => Promise.resolve(view),
    });

    expect(result.flow).toBe(flow);
    expect(result.intake).toBe(view);
    expect(result.error).toBeNull();
  });
});
