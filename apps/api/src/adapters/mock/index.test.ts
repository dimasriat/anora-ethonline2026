import { beforeEach, describe, expect, test } from "bun:test";
import { mockPorts } from "./index";
import type { Ports } from "@anora/core";

let ports: Ports;
beforeEach(() => { ports = mockPorts(); });

describe("esrg", () => {
  test("lists seeded receipts", async () => {
    const all = await ports.esrg.list();
    expect(all.map((e) => e.id)).toEqual(["SRG-TEH-024", "SRG-TEH-031"]);
  });

  test("returns null for an unknown receipt rather than throwing", async () => {
    expect(await ports.esrg.get("SRG-NOPE")).toBeNull();
  });

  test("intakes sum to the quantity on the receipt", async () => {
    for (const esrg of await ports.esrg.list()) {
      const intakes = await ports.esrg.intakes(esrg.id);
      const total = intakes.reduce((sum, i) => sum + i.madeTeaKg, 0);
      expect(total).toBe(esrg.quantityKg);
    }
  });
});

describe("registry", () => {
  test("confirms and returns a reference", async () => {
    const c = await ports.registry.confirmSecurity("SRG-TEH-024", "ANR-SRG-024");
    expect(c.confirmed).toBe(true);
    expect(c.ref).toContain("SRG-TEH-024");
  });
});

describe("token", () => {
  test("issues a draft note that is reserved and non-transferable until activated", async () => {
    const esrg = (await ports.esrg.get("SRG-TEH-024"))!;
    const note = await ports.token.issueDraftNote(
      { id: "REQ-1", esrgId: esrg.id, requestedIdr: 420_000_000, maturityDays: 90, maxLtvBp: 7_000, epoch: 1, status: "proven" },
      esrg,
      [],
    );
    expect(note.state).toBe("reserved");
    expect(note.underlying).toBe("SRG-TEH-024");
    expect(note.transferRule).toBe("allowlisted");
    expect(note.ceilingIdr).toBe(420_000_000);
  });

  test("activation moves the note to active", async () => {
    const esrg = (await ports.esrg.get("SRG-TEH-024"))!;
    const draft = await ports.token.issueDraftNote(
      { id: "REQ-1", esrgId: esrg.id, requestedIdr: 420_000_000, maturityDays: 90, maxLtvBp: 7_000, epoch: 1, status: "proven" },
      esrg,
      [],
    );
    expect((await ports.token.activate(draft.series)).state).toBe("active");
    expect((await ports.token.redeem(draft.series)).state).toBe("redeemed");
  });

  test("refuses to activate a note it never issued", async () => {
    await expect(ports.token.activate("ANR-NOPE")).rejects.toThrow();
  });
});

describe("status", () => {
  test("declares a mode and a reason for every capability", () => {
    const rows = ports.status();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.capability).toBeTruthy();
      expect(["live", "testnet", "simulated", "planned"]).toContain(row.mode);
      expect(row.because.length).toBeGreaterThan(10);
    }
  });

  test("never claims the registry is live", () => {
    const registry = ports.status().find((r) => r.capability === "registry");
    expect(registry?.mode).toBe("simulated");
  });
});
