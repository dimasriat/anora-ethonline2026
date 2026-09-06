import { describe, expect, test } from "bun:test";
import { STEP_ORDER, isReversible, previousStep, requireStep, stepIndex } from "./lifecycle";
import type { RequestStatus } from "./domain";

describe("STEP_ORDER", () => {
  test("matches the lifecycle the spec publishes", () => {
    expect(STEP_ORDER).toEqual([
      "draft", "mandate_signed", "approved", "proven",
      "tokenized", "subscribed", "funded", "repaid",
    ]);
  });

  test("every step is known", () => {
    for (const step of STEP_ORDER) expect(stepIndex(step)).toBeGreaterThanOrEqual(0);
  });
});

describe("requireStep", () => {
  test("allows an action once its gate is reached", () => {
    expect(requireStep("approved", "approved", "Prove eligibility")).toBeNull();
    expect(requireStep("funded", "approved", "Prove eligibility")).toBeNull();
  });

  test("refuses an action that runs ahead of its gate, naming both steps", () => {
    const r = requireStep("draft", "approved", "Prove eligibility");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("step_out_of_order");
    expect(r!.requires).toBe("approved");
    expect(r!.current).toBe("draft");
    expect(r!.action).toBe("Prove eligibility");
  });

  test("gates repayment behind funding", () => {
    expect(requireStep("draft", "funded", "Repay")).not.toBeNull();
    expect(requireStep("subscribed", "funded", "Repay")).not.toBeNull();
    expect(requireStep("funded", "funded", "Repay")).toBeNull();
  });

  test("gates proving behind the signed mandate", () => {
    expect(requireStep("draft", "approved", "Prove")).not.toBeNull();
    expect(requireStep("mandate_signed", "approved", "Prove")).not.toBeNull();
  });
});

describe("isReversible", () => {
  test("allows rewinding while only documents exist", () => {
    expect(isReversible("mandate_signed")).toBe(true);
    expect(isReversible("approved")).toBe(true);
    expect(isReversible("proven")).toBe(true);
  });

  test("refuses to rewind once the note is issued", () => {
    for (const step of ["tokenized", "subscribed", "funded", "repaid"] as RequestStatus[]) {
      expect(isReversible(step)).toBe(false);
    }
  });

  test("has nothing to rewind from the first step", () => {
    expect(isReversible("draft")).toBe(false);
    expect(previousStep("draft")).toBeNull();
  });

  test("rewinds exactly one step", () => {
    expect(previousStep("proven")).toBe("approved");
    expect(previousStep("mandate_signed")).toBe("draft");
    expect(previousStep("tokenized")).toBeNull();
  });
});
