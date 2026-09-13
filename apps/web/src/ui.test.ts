import { expect, test } from "bun:test";
import { groupDigits } from "./ui";

test("groups thousands with id-ID dots", () => {
  expect(groupDigits("270000000")).toBe("270.000.000");
  expect(groupDigits("5000000")).toBe("5.000.000");
  expect(groupDigits("1000")).toBe("1.000");
});

test("leaves short and empty values alone", () => {
  expect(groupDigits("")).toBe("");
  expect(groupDigits("500")).toBe("500");
});

test("stays exact past the safe integer range", () => {
  const huge = "9007199254740993000";
  expect(groupDigits(huge).replace(/\./g, "")).toBe(huge);
  expect(groupDigits(huge)).toBe("9.007.199.254.740.993.000");
});
