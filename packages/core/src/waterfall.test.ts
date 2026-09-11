import { describe, expect, it } from "bun:test";
import { splitRecovery } from "./waterfall";

const SENIOR = 270_000_000;
const JUNIOR = 120_000_000;
const FACE = SENIOR + JUNIOR;

describe("splitRecovery", () => {
  it("pays approved costs before any noteholder", () => {
    const s = splitRecovery(FACE + 5_000_000, 5_000_000, SENIOR, JUNIOR);
    expect(s.costsPaidIdr).toBe(5_000_000);
    expect(s.seniorIdr).toBe(SENIOR);
    expect(s.juniorIdr).toBe(JUNIOR);
  });

  it("never pays costs beyond what was recovered", () => {
    const s = splitRecovery(1_000_000, 4_000_000, SENIOR, JUNIOR);
    expect(s.costsPaidIdr).toBe(1_000_000);
    expect(s.seniorIdr).toBe(0);
  });

  it("leaves Senior whole while Junior is wiped out", () => {
    const s = splitRecovery(SENIOR, 0, SENIOR, JUNIOR);
    expect(s.seniorIdr).toBe(SENIOR);
    expect(s.juniorLossIdr).toBe(JUNIOR);
    expect(s.seniorLossIdr).toBe(0);
  });

  it("touches Senior only one rupiah below its face", () => {
    const s = splitRecovery(SENIOR - 1, 0, SENIOR, JUNIOR);
    expect(s.seniorLossIdr).toBe(1);
  });

  it("sends anything above total face to the borrower", () => {
    const s = splitRecovery(FACE + 30_000_000, 0, SENIOR, JUNIOR);
    expect(s.surplusIdr).toBe(30_000_000);
  });

  it("conserves cash and face at every level", () => {
    for (const recovered of [0, 1, SENIOR - 1, SENIOR, SENIOR + 1, FACE, FACE + 1]) {
      const s = splitRecovery(recovered, 0, SENIOR, JUNIOR);
      expect(s.seniorIdr + s.seniorLossIdr).toBe(SENIOR);
      expect(s.juniorIdr + s.juniorLossIdr).toBe(JUNIOR);
      expect(s.costsPaidIdr + s.seniorIdr + s.juniorIdr + s.surplusIdr).toBe(recovered);
    }
  });
});
