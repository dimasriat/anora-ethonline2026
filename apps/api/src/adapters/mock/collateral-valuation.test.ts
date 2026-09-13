import { describe, expect, test } from "vitest";
import { ESRGS, INTAKES } from "./seed";

const MADE_TEA_IDR_PER_KG = { min: 11_000, max: 30_000 };

const teaReceipts = ESRGS.filter((esrg) => esrg.commodity.includes("Tea"));

describe("seeded tea collateral", () => {
  test("every receipt is worth what made tea actually sells for", () => {
    for (const esrg of teaReceipts) {
      const impliedIdrPerKg = esrg.valueIdr / esrg.quantityKg;
      expect(impliedIdrPerKg).toBeGreaterThanOrEqual(MADE_TEA_IDR_PER_KG.min);
      expect(impliedIdrPerKg).toBeLessThanOrEqual(MADE_TEA_IDR_PER_KG.max);
    }
  });

  test("intakes account for the whole receipt quantity", () => {
    for (const esrg of teaReceipts) {
      const intakes = INTAKES[esrg.id] ?? [];
      const declared = intakes.reduce((sum, intake) => sum + intake.madeTeaKg, 0);
      expect(declared).toBe(esrg.quantityKg);
    }
  });
});
