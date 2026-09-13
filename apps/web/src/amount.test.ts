import { describe, expect, test } from "vitest";
import { digitsOf, formatIdr, caretAfterDigits, digitsBefore, suggestionFor } from "./amount";

describe("the formatted amount field", () => {
  test("keeps only digits, whatever the browser put in the box", () => {
    expect(digitsOf("120.000.000")).toBe("120000000");
    expect(digitsOf("120.000.000120.000.000")).toBe("120000000120000000");
    expect(digitsOf("")).toBe("");
  });

  test("formats with Indonesian thousands separators", () => {
    expect(formatIdr("120000000")).toBe("120.000.000");
    expect(formatIdr("")).toBe("");
  });

  test("counts the digits standing before the caret", () => {
    expect(digitsBefore("120.000.000", 0)).toBe(0);
    expect(digitsBefore("120.000.000", 3)).toBe(3);
    expect(digitsBefore("120.000.000", 4)).toBe(3);
    expect(digitsBefore("120.000.000", 11)).toBe(9);
  });

  test("puts the caret back after the same digit it followed", () => {
    expect(caretAfterDigits("120.000.000", 3)).toBe(3);
    expect(caretAfterDigits("120.000.000", 4)).toBe(5);
    expect(caretAfterDigits("120.000.000", 9)).toBe(11);
    expect(caretAfterDigits("120.000.000", 0)).toBe(0);
  });

  test("typing a digit in the middle does not reorder the number", () => {
    const before = "120.000.000";
    const typedAt = 3;
    const raw = `${before.slice(0, typedAt)}5${before.slice(typedAt)}`;
    const digits = digitsOf(raw);
    expect(formatIdr(digits)).toBe("1.205.000.000");
    expect(caretAfterDigits(formatIdr(digits), digitsBefore(raw, typedAt + 1))).toBe(5);
  });
});

describe("the suggested ticket", () => {
  test("offers the proposal when the field is idle", () => {
    expect(suggestionFor({ suggestedIdr: 270_000_000, minimumTicketIdr: 50_000_000, editing: false }))
      .toBe("270000000");
  });

  test("clears the field when the proposal is below the investor's floor", () => {
    expect(suggestionFor({ suggestedIdr: 10_000_000, minimumTicketIdr: 50_000_000, editing: false }))
      .toBe("");
  });

  test("never overwrites what someone is in the middle of typing", () => {
    expect(suggestionFor({ suggestedIdr: 270_000_000, minimumTicketIdr: 50_000_000, editing: true }))
      .toBeNull();
  });
});
