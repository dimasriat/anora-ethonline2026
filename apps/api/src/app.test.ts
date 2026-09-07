import { beforeEach, describe, expect, test } from "bun:test";
import { makeApp } from "./app";
import { mockPorts } from "./adapters/mock/index";
import { openAuthenticator } from "./auth";
import type { EligibilityProof, Ports } from "@anora/core";

const withProvableEligibility = (): Ports => ({
  ...mockPorts(),
  proof: {
    async prove(): Promise<EligibilityProof> {
      return { proofHex: "0x00", publicInputs: [], nullifier: "0x01", checks: [] };
    },
    async verifyOnChain() {
      return { ok: true };
    },
  },
});

let app: ReturnType<typeof makeApp>;
beforeEach(() => { app = makeApp(mockPorts(), openAuthenticator); });

const body = async (res: Response): Promise<any> => res.json();

const get = (path: string) => app.request(path);
const post = (path: string, body?: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const openRequest = async (): Promise<string> => {
  const res = await post("/api/requests", { esrgId: "SRG-TEH-024" });
  return (await body(res)).request.id;
};

describe("read routes", () => {
  test("health answers", async () => {
    expect((await get("/api/health")).status).toBe(200);
  });

  test("status names a mode and reason per capability", async () => {
    const rows = await body(await get("/api/status"));
    expect(rows.every((r: { mode: string; because: string }) => r.mode && r.because)).toBe(true);
  });

  test("investors include one that is not allowlisted", async () => {
    const investors = await body(await get("/api/investors"));
    expect(investors.some((i: { allowlisted: boolean }) => !i.allowlisted)).toBe(true);
  });

  test("unknown request is 404 with a code", async () => {
    const res = await get("/api/requests/REQ-404");
    expect(res.status).toBe(404);
    expect((await body(res)).error.code).toBe("unknown_request");
  });
});

describe("creating a request", () => {
  test("returns 201 and the derived ceiling", async () => {
    const res = await post("/api/requests", { esrgId: "SRG-TEH-024" });
    expect(res.status).toBe(201);
    expect((await body(res)).request.requestedIdr).toBe(420_000_000);
  });

  test("rejects an unknown receipt with 404", async () => {
    const res = await post("/api/requests", { esrgId: "SRG-NOPE" });
    expect(res.status).toBe(404);
    expect((await body(res)).error.code).toBe("unknown_receipt");
  });
});

describe("error codes reach the client", () => {
  test("out-of-order step is 409", async () => {
    const id = await openRequest();
    const res = await post(`/api/requests/${id}/repay`);
    expect(res.status).toBe(409);
    const payload = await body(res);
    expect(payload.error.code).toBe("step_out_of_order");
    expect(payload.error.requires).toBe("funded");
    expect(payload.error.current).toBe("draft");
  });

  test("an unbuilt capability is 501, not a fake success", async () => {
    const id = await openRequest();
    await post(`/api/requests/${id}/approve-mandate`, { officerId: "OFF-1" });
    await post(`/api/requests/${id}/approve-mandate`, { officerId: "OFF-3" });
    await post(`/api/requests/${id}/approve`);
    const res = await post(`/api/requests/${id}/prove`);
    expect(res.status).toBe(501);
    expect((await body(res)).error.code).toBe("capability_not_available");
  });

  test("a refused investor is 403 and names the gate", async () => {
    app = makeApp(withProvableEligibility(), openAuthenticator);
    const id = await openRequest();
    await post(`/api/requests/${id}/approve-mandate`, { officerId: "OFF-1" });
    await post(`/api/requests/${id}/approve-mandate`, { officerId: "OFF-3" });
    for (const step of ["approve", "prove", "tokenize"]) {
      const res = await post(`/api/requests/${id}/${step}`);
      expect(res.status).toBe(200);
    }

    const res = await post(`/api/requests/${id}/subscribe`, {
      investorId: "INV-MFC", tranche: "JUNIOR", unitsIdr: 50_000_000,
    });
    expect(res.status).toBe(403);
    expect((await body(res)).error.code).toBe("not_allowlisted");
  });

  test("the whole lifecycle runs when eligibility can be proven", async () => {
    app = makeApp(withProvableEligibility(), openAuthenticator);
    const id = await openRequest();
    await post(`/api/requests/${id}/approve-mandate`, { officerId: "OFF-1" });
    await post(`/api/requests/${id}/approve-mandate`, { officerId: "OFF-3" });
    for (const step of ["approve", "prove", "tokenize"]) {
      await post(`/api/requests/${id}/${step}`);
    }
    await post(`/api/requests/${id}/subscribe`, {
      investorId: "INV-BRS", tranche: "SENIOR", unitsIdr: 270_000_000,
    });
    await post(`/api/requests/${id}/subscribe`, {
      investorId: "INV-KIT", tranche: "JUNIOR", unitsIdr: 120_000_000,
    });
    await post(`/api/requests/${id}/register`);
    const final = await body(await post(`/api/requests/${id}/repay`));

    expect(final.request.status).toBe("repaid");
    expect(final.note.state).toBe("redeemed");
    expect(final.request.epoch).toBe(2);
  });
});

describe("tranches", () => {
  test("publishes capacity and loss bands before subscription opens", async () => {
    const id = await openRequest();
    const tranches = await body(await get(`/api/requests/${id}/tranches`));
    const senior = tranches.find((t: { name: string }) => t.name === "SENIOR");
    expect(senior.capacityIdr).toBe(270_000_000);
    expect(senior.attachmentIdr).toBe(120_000_000);
  });

  test("remaining capacity starts at full", async () => {
    const id = await openRequest();
    const remaining = await body(await get(`/api/requests/${id}/remaining`));
    expect(remaining).toEqual([
      { tranche: "SENIOR", remainingIdr: 270_000_000 },
      { tranche: "JUNIOR", remainingIdr: 120_000_000 },
    ]);
  });
});
