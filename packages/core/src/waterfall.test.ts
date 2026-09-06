import { describe, expect, test } from "bun:test";
import { allocateLoss, distribute } from "./waterfall";

const TERMS = {
  seniorPrincipalIdr: 270_000_000,
  juniorPrincipalIdr: 120_000_000,
  seniorReturnIdr: 5_400_000,
  juniorReturnIdr: 5_400_000,
};

const issued = TERMS.seniorPrincipalIdr + TERMS.juniorPrincipalIdr;
const dueInFull = issued + TERMS.seniorReturnIdr + TERMS.juniorReturnIdr;

describe("distribute", () => {
  test("pays every claim when cash covers the facility in full", () => {
    const paid = distribute(dueInFull, TERMS);

    expect(paid.seniorReturnIdr).toBe(TERMS.seniorReturnIdr);
    expect(paid.seniorPrincipalIdr).toBe(TERMS.seniorPrincipalIdr);
    expect(paid.juniorReturnIdr).toBe(TERMS.juniorReturnIdr);
    expect(paid.juniorPrincipalIdr).toBe(TERMS.juniorPrincipalIdr);
    expect(paid.residualIdr).toBe(0);
  });

  test("sends surplus above every claim to the receipt holder", () => {
    const paid = distribute(dueInFull + 7_000_000, TERMS);
    expect(paid.residualIdr).toBe(7_000_000);
  });

  test("conserves cash at every level", () => {
    for (const cash of [0, 1, 5_400_000, 270_000_000, 300_000_000, dueInFull, dueInFull + 1]) {
      const p = distribute(cash, TERMS);
      const out =
        p.seniorReturnIdr + p.seniorPrincipalIdr +
        p.juniorReturnIdr + p.juniorPrincipalIdr + p.residualIdr;
      expect(out).toBe(cash);
    }
  });

  test("pays senior in full before junior receives anything", () => {
    const paid = distribute(TERMS.seniorReturnIdr + TERMS.seniorPrincipalIdr, TERMS);

    expect(paid.seniorPrincipalIdr).toBe(TERMS.seniorPrincipalIdr);
    expect(paid.juniorReturnIdr).toBe(0);
    expect(paid.juniorPrincipalIdr).toBe(0);
  });

  test("never pays junior while any senior claim is outstanding", () => {
    for (const cash of [0, 1_000_000, 200_000_000, 275_000_000]) {
      const p = distribute(cash, TERMS);
      const seniorOutstanding =
        TERMS.seniorReturnIdr - p.seniorReturnIdr +
        TERMS.seniorPrincipalIdr - p.seniorPrincipalIdr;
      if (seniorOutstanding > 0) {
        expect(p.juniorReturnIdr + p.juniorPrincipalIdr).toBe(0);
      }
    }
  });

  test("pays nothing on zero recovery", () => {
    const paid = distribute(0, TERMS);
    expect(paid.seniorReturnIdr).toBe(0);
    expect(paid.residualIdr).toBe(0);
  });

  test("refuses negative cash", () => {
    expect(() => distribute(-1, TERMS)).toThrow();
  });
});

describe("allocateLoss", () => {
  const JUNIOR = { attachmentIdr: 0, detachmentIdr: 120_000_000 };
  const SENIOR = { attachmentIdr: 120_000_000, detachmentIdr: 390_000_000 };

  test("junior absorbs loss before senior is touched", () => {
    expect(allocateLoss(80_000_000, JUNIOR)).toBe(80_000_000);
    expect(allocateLoss(80_000_000, SENIOR)).toBe(0);
  });

  test("senior loss is still zero at exact junior exhaustion", () => {
    expect(allocateLoss(120_000_000, JUNIOR)).toBe(120_000_000);
    expect(allocateLoss(120_000_000, SENIOR)).toBe(0);
  });

  test("one rupiah past exhaustion is the first rupiah of senior loss", () => {
    expect(allocateLoss(120_000_001, JUNIOR)).toBe(120_000_000);
    expect(allocateLoss(120_000_001, SENIOR)).toBe(1);
  });

  test("caps each tranche at its own thickness", () => {
    expect(allocateLoss(issued, JUNIOR)).toBe(120_000_000);
    expect(allocateLoss(issued, SENIOR)).toBe(270_000_000);
  });

  test("tranche losses sum to the realised loss", () => {
    for (const loss of [0, 1, 60_000_000, 120_000_000, 250_000_000, issued]) {
      expect(allocateLoss(loss, JUNIOR) + allocateLoss(loss, SENIOR)).toBe(loss);
    }
  });
});
