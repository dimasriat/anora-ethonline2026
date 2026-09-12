import { describe, expect, it } from "bun:test";
import {
  attachments, chargeFor, covenantCollateral, coverageShortfall, dust, eligibleCollateral,
  faceCeiling, feeOf, headroom, holderClaim, indicativeMark, issuedLtvBp, purchase, reconcile,
  retainedMinimum, seniorSafeCollateral, unlockedSenior, waterfall,
} from "./tranche-math";

/* ANO-24's worked examples are regression fixtures, not defaults. They are
   declared here, in the test, and nowhere else. */
const A = {
  seniorCapIdr: 270_000_000n, juniorCapIdr: 120_000_000n, approvedFaceIdr: 420_000_000n,
  retentionBp: 2_500n, maxLtvBp: 7_000n, registryGrams: 8_000_000n, warehouseGrams: 8_000_000n,
  priceIdrPerKg: 75_000n, haircutBp: 0n, termDays: 90n, seniorYieldBp: 200n, juniorYieldBp: 450n,
};
const Bx = {
  seniorCapIdr: 150_000_000n, juniorCapIdr: 50_000_000n, approvedFaceIdr: 220_000_000n,
  retentionBp: 2_000n, maxLtvBp: 6_000n, registryGrams: 5_000_000n, warehouseGrams: 5_000_000n,
  priceIdrPerKg: 80_000n, haircutBp: 500n, termDays: 120n, seniorYieldBp: 300n, juniorYieldBp: 600n,
};

describe("fixture A", () => {
  const collateral = eligibleCollateral(A.registryGrams, A.priceIdrPerKg, A.haircutBp);
  const target = A.seniorCapIdr + A.juniorCapIdr;

  it("derives collateral, ceiling and headroom", () => {
    expect(collateral).toBe(600_000_000n);
    expect(faceCeiling(collateral, A.maxLtvBp)).toBe(420_000_000n);
    expect(headroom(A.approvedFaceIdr, faceCeiling(collateral, A.maxLtvBp), target)).toBe(30_000_000n);
  });

  it("prices both tranches to the nearest rupiah", () => {
    expect(purchase(A.seniorCapIdr, A.seniorYieldBp, A.termDays)).toBe(268_675_027n);
    expect(purchase(A.juniorCapIdr, A.juniorYieldBp, A.termDays)).toBe(118_683_105n);
    expect(
      purchase(A.seniorCapIdr, A.seniorYieldBp, A.termDays)
      + purchase(A.juniorCapIdr, A.juniorYieldBp, A.termDays),
    ).toBe(387_358_132n);
  });

  it("unlocks Senior in proportion to funded Junior", () => {
    expect(unlockedSenior(40_000_000n, A.seniorCapIdr, A.juniorCapIdr)).toBe(90_000_000n);
    expect(retainedMinimum(A.juniorCapIdr, A.retentionBp)).toBe(30_000_000n);
  });

  it("derives attachment points from frozen face, not from a prescribed split", () => {
    const points = attachments(A.seniorCapIdr, A.juniorCapIdr)!;
    // 4/13 of face, floored into basis points.
    expect(points.juniorDetachBp).toBe(3_076n);
    expect(points.seniorAttachBp).toBe(points.juniorDetachBp);
  });

  it("reproduces the published waterfall row for row", () => {
    const rows: [bigint, bigint, bigint, bigint, bigint, bigint][] = [
      [0n, 0n, 0n, 270_000_000n, 120_000_000n, 0n],
      [220_000_000n, 220_000_000n, 0n, 50_000_000n, 120_000_000n, 0n],
      [269_999_999n, 269_999_999n, 0n, 1n, 120_000_000n, 0n],
      [270_000_000n, 270_000_000n, 0n, 0n, 120_000_000n, 0n],
      [270_000_001n, 270_000_000n, 1n, 0n, 119_999_999n, 0n],
      [330_000_000n, 270_000_000n, 60_000_000n, 0n, 60_000_000n, 0n],
      [390_000_000n, 270_000_000n, 120_000_000n, 0n, 0n, 0n],
      [420_000_000n, 270_000_000n, 120_000_000n, 0n, 0n, 30_000_000n],
    ];
    for (const [available, seniorPaid, juniorPaid, seniorLoss, juniorLoss, surplus] of rows) {
      const result = waterfall(available, 0n, A.seniorCapIdr, A.juniorCapIdr);
      expect(result.seniorPaidIdr).toBe(seniorPaid);
      expect(result.juniorPaidIdr).toBe(juniorPaid);
      expect(result.seniorLossIdr).toBe(seniorLoss);
      expect(result.juniorLossIdr).toBe(juniorLoss);
      expect(result.surplusIdr).toBe(surplus);
    }
  });

  it("places the Senior loss and covenant thresholds where the fixture does", () => {
    expect(seniorSafeCollateral(A.seniorCapIdr, 0n, 10_000n)).toBe(270_000_000n);
    expect(indicativeMark(390_000_000n, 10_000n, 0n, A.seniorCapIdr, A.juniorCapIdr).juniorNavIdr)
      .toBe(A.juniorCapIdr);
    expect(covenantCollateral(target, A.maxLtvBp)).toBe(557_142_858n);
  });
});

describe("fixture B", () => {
  const collateral = eligibleCollateral(Bx.registryGrams, Bx.priceIdrPerKg, Bx.haircutBp);
  const target = Bx.seniorCapIdr + Bx.juniorCapIdr;

  it("needs no change of branch or constant to structure differently", () => {
    expect(collateral).toBe(380_000_000n);
    expect(faceCeiling(collateral, Bx.maxLtvBp)).toBe(228_000_000n);
    expect(headroom(Bx.approvedFaceIdr, faceCeiling(collateral, Bx.maxLtvBp), target)).toBe(20_000_000n);
    expect(retainedMinimum(Bx.juniorCapIdr, Bx.retentionBp)).toBe(10_000_000n);
    expect(unlockedSenior(10_000_000n, Bx.seniorCapIdr, Bx.juniorCapIdr)).toBe(30_000_000n);
  });

  it("settles a shortfall Junior-first", () => {
    const result = waterfall(170_000_000n, 0n, Bx.seniorCapIdr, Bx.juniorCapIdr);
    expect(result.seniorPaidIdr).toBe(150_000_000n);
    expect(result.juniorPaidIdr).toBe(20_000_000n);
    expect(result.seniorLossIdr).toBe(0n);
    expect(result.juniorLossIdr).toBe(30_000_000n);
    expect(attachments(Bx.seniorCapIdr, Bx.juniorCapIdr)!.juniorDetachBp).toBe(2_500n);
  });
});

describe("pricing", () => {
  it("rounds a tie upward rather than flooring it", () => {
    // face × B × 365 is exactly 1.5 divisors, so the tie rule decides.
    const face = 3_669n;
    const cheapFloor = (face * 10_000n * 365n) / (10_000n * 365n + 200n * 90n);
    expect(purchase(face, 200n, 90n)).toBe(cheapFloor + 1n);
  });

  it("makes split orders cost exactly what one order costs", () => {
    const slices = [7_000_001n, 13_499_999n, 500_000n, 99n];
    let cumulative = 0n;
    let charged = 0n;
    for (const slice of slices) {
      charged += chargeFor(cumulative, slice, 450n, 90n);
      cumulative += slice;
    }
    expect(charged).toBe(purchase(cumulative, 450n, 90n));
  });

  it("is monotone in face and in yield", () => {
    expect(purchase(100_000_001n, 200n, 90n)).toBeGreaterThan(purchase(100_000_000n, 200n, 90n));
    expect(purchase(100_000_000n, 201n, 90n)).toBeLessThanOrEqual(purchase(100_000_000n, 200n, 90n));
  });
});

describe("reconciliation and coverage", () => {
  it("accepts exactly at tolerance and rejects one gram outside it", () => {
    // 50 bp of 1,000,000 g is 5,000 g.
    expect(reconcile(1_000_000n, 995_000n, 50n).accepted).toBe(true);
    expect(reconcile(1_000_000n, 994_999n, 50n).accepted).toBe(false);
    expect(reconcile(1_000_000n, 995_000n, 50n).effectiveGrams).toBe(995_000n);
  });

  it("reports no ratio rather than dividing by zero", () => {
    expect(issuedLtvBp(1n, 0n)).toBeNull();
    expect(covenantCollateral(1n, 0n)).toBeNull();
    expect(coverageShortfall(400_000_000n, 380_000_000n)).toBe(20_000_000n);
  });

  it("treats a full haircut as zero collateral, not as an invalid price", () => {
    expect(eligibleCollateral(8_000_000n, 75_000n, 10_000n)).toBe(0n);
  });
});

describe("marks", () => {
  const face = { senior: 270_000_000n, junior: 120_000_000n };

  it("moves the right way with every input", () => {
    const base = indicativeMark(600_000_000n, 8_000n, 1_000_000n, face.senior, face.junior);
    expect(indicativeMark(601_000_000n, 8_000n, 1_000_000n, face.senior, face.junior).availableIdr)
      .toBeGreaterThanOrEqual(base.availableIdr);
    expect(indicativeMark(600_000_000n, 8_100n, 1_000_000n, face.senior, face.junior).availableIdr)
      .toBeGreaterThanOrEqual(base.availableIdr);
    expect(indicativeMark(600_000_000n, 8_000n, 2_000_000n, face.senior, face.junior).availableIdr)
      .toBeLessThanOrEqual(base.availableIdr);
  });

  it("impairs Senior when recovery is zero and caps Junior before costs", () => {
    expect(indicativeMark(600_000_000n, 0n, 0n, face.senior, face.junior).seniorNavIdr).toBe(0n);
    // Cap-before-cost: costs bite even when gross recovery exceeds total face.
    const rich = indicativeMark(900_000_000n, 10_000n, 1n, face.senior, face.junior);
    expect(rich.juniorNavIdr).toBe(face.junior - 1n);
  });
});

describe("claims, dust and fees", () => {
  it("splits an indivisible payment without losing or inventing rupiah", () => {
    const units = [1n, 1n, 1n];
    expect(units.map((u) => holderClaim(10n, u, 3n))).toEqual([3n, 3n, 3n]);
    expect(dust(10n, units, 3n)).toBe(1n);
  });

  it("bounds dust below the number of holders, whatever the split", () => {
    const units = [317n, 4_001n, 55n, 1n, 99_626n];
    const supply = units.reduce((sum, u) => sum + u, 0n);
    expect(dust(987_654_321n, units, supply)).toBeLessThan(BigInt(units.length));
  });

  it("pays nothing against an empty supply", () => {
    expect(holderClaim(0n, 0n, 0n)).toBe(0n);
    expect(dust(0n, [], 0n)).toBe(0n);
  });

  it("charges the snapshotted fee, floored", () => {
    expect(feeOf(24_750_000n, 10n)).toBe(24_750n);
    expect(feeOf(4_500_000n, 50n)).toBe(22_500n);
    expect(feeOf(4_500_000n, 0n)).toBe(0n);
  });
});

describe("waterfall invariants", () => {
  const S = 150_000_000n;
  const J = 50_000_000n;

  it("conserves cash and face at every boundary", () => {
    for (const cash of [0n, S - 1n, S, S + 1n, S + J - 1n, S + J, S + J + 7n]) {
      const w = waterfall(cash, 0n, S, J);
      expect(w.seniorPaidIdr + w.juniorPaidIdr).toBe(cash < S + J ? cash : S + J);
      expect(w.seniorPaidIdr + w.seniorLossIdr).toBe(S);
      expect(w.juniorPaidIdr + w.juniorLossIdr).toBe(J);
      expect(w.costsPaidIdr + w.seniorPaidIdr + w.juniorPaidIdr + w.surplusIdr).toBe(cash);
    }
  });

  it("takes costs before holders and never hands unpaid costs to them", () => {
    expect(waterfall(0n, 5_000_000n, S, J).costsUnpaidIdr).toBe(5_000_000n);
    const short = waterfall(3_000_000n, 5_000_000n, S, J);
    expect(short.costsPaidIdr).toBe(3_000_000n);
    expect(short.availableIdr).toBe(0n);
    expect(short.costsUnpaidIdr).toBe(2_000_000n);
  });

  it("is nondecreasing and 1-Lipschitz in available cash", () => {
    let previous = waterfall(0n, 0n, S, J);
    for (let cash = 1n; cash < S + J; cash += 7_919_111n) {
      const next = waterfall(cash, 0n, S, J);
      const paid = (w: ReturnType<typeof waterfall>) => w.seniorPaidIdr + w.juniorPaidIdr;
      expect(paid(next)).toBeGreaterThanOrEqual(paid(previous));
      expect(paid(next) - paid(previous)).toBeLessThanOrEqual(7_919_111n);
      previous = next;
    }
  });
});
