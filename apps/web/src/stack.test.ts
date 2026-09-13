import { describe, expect, test } from "bun:test";
import { STACK_PORTS } from "./stack";
import deployed from "../../../contracts/deployed.json";

const detailOf = (port: string) => STACK_PORTS.find((p) => p.port === port)!.detail;

describe("the stack diagram", () => {
  test("names the contracts that are actually deployed", () => {
    expect(detailOf("Proof")).toContain(deployed.HonkVerifier.slice(0, 6));
    expect(detailOf("Proof")).toContain(deployed.HonkVerifier.slice(-4));
    expect(detailOf("Token")).toContain(deployed.AnoraNote.address.slice(0, 6));
    expect(detailOf("Token")).toContain(deployed.AnoraNote.address.slice(-4));
  });

  test("keeps every label inside the box", () => {
    for (const { backend, detail } of STACK_PORTS) {
      expect(backend.length).toBeLessThanOrEqual(26);
      expect(detail.length).toBeLessThanOrEqual(26);
    }
  });
});
