import { beforeEach, describe, expect, test } from "bun:test";
import { makeFlow, settle } from "./flow";
import { mockPorts } from "./adapters/mock/index";
import type { EligibilityProof, Ports } from "@anora/core";

const provable = (): Ports => ({
  ...mockPorts(),
  proof: {
    async prove(): Promise<EligibilityProof> {
      return { proofHex: "0x00", publicInputs: [], nullifier: "0x01", checks: [] };
    },
    async verifyOnChain() { return { ok: true }; },
  },
});

let flow: ReturnType<typeof makeFlow>;
beforeEach(() => { flow = makeFlow(provable()); });

const funded = async () => {
  const s = await flow.create("SRG-TEH-024");
  const id = s.request.id;
  await flow.approveMandate(id, "OFF-1");
  await flow.approveMandate(id, "OFF-3");
  await flow.approve(id);
  await flow.prove(id);
  await flow.tokenize(id);
  await flow.subscribe(id, "INV-BRS", "SENIOR", 270_000_000);
  await flow.subscribe(id, "INV-KIT", "JUNIOR", 120_000_000);
  await flow.registerAndFund(id);
  return id;
};

describe("settlement at repayment", () => {
  test("full repayment leaves no loss anywhere", async () => {
    const s = await flow.repay(await funded());
    const settlement = s.settlement!;

    expect(settlement.conserved).toBe(true);
    expect(settlement.paid.seniorPrincipalIdr).toBe(270_000_000);
    expect(settlement.paid.juniorPrincipalIdr).toBe(120_000_000);
    expect(settlement.loss.every((l) => l.lossIdr === 0)).toBe(true);
  });

  test("a shortfall lands on Junior first", async () => {
    const s = await flow.repay(await funded(), 330_000_000);
    const junior = s.settlement!.loss.find((l) => l.tranche === "JUNIOR")!;
    const senior = s.settlement!.loss.find((l) => l.tranche === "SENIOR")!;

    expect(senior.lossIdr).toBe(0);
    expect(junior.lossIdr).toBeGreaterThan(0);
    expect(s.settlement!.paid.seniorPrincipalIdr).toBe(270_000_000);
  });

  test("Senior is only impaired once Junior is exhausted", async () => {
    const s = await flow.repay(await funded(), 200_000_000);
    const junior = s.settlement!.loss.find((l) => l.tranche === "JUNIOR")!;
    const senior = s.settlement!.loss.find((l) => l.tranche === "SENIOR")!;

    expect(junior.lossIdr).toBe(120_000_000);
    expect(senior.lossIdr).toBeGreaterThan(0);
  });

  test("zero recovery wipes Junior entirely before Senior takes the rest", async () => {
    const s = await flow.repay(await funded(), 0);
    const loss = Object.fromEntries(s.settlement!.loss.map((l) => [l.tranche, l.lossIdr]));

    expect(loss.JUNIOR).toBe(120_000_000);
    expect(loss.SENIOR).toBe(270_000_000);
  });

  test("cash is conserved at every recovery level", async () => {
    for (const cash of [0, 1, 199_999_999, 270_000_000, 390_000_000, 500_000_000]) {
      const id = await funded();
      const s = await flow.repay(id, cash);
      expect(s.settlement!.conserved).toBe(true);
    }
  });

  test("junior is never paid while senior principal is outstanding", async () => {
    const id = await funded();
    const s = await flow.repay(id, 250_000_000);
    expect(s.settlement!.paid.juniorReturnIdr).toBe(0);
    expect(s.settlement!.paid.juniorPrincipalIdr).toBe(0);
  });
});

describe("settle", () => {
  test("is a pure function of the facility and the cash", async () => {
    const id = await funded();
    const state = flow.get(id)!;
    expect(settle(state, 390_000_000)).toEqual(settle(state, 390_000_000));
  });
});
