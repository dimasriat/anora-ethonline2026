import { describe, expect, test } from "bun:test";
import { liveFacilityReader } from "./facility";
import deployed from "../../../../../contracts/deployed.json";

const RPC = "https://testnet.hashio.io/api";
const address = deployed.AnoraFacilityController.address;
const online = process.env.ANORA_INTEGRATION === "1";

describe.skipIf(!online)("the deployed facility controller", () => {
  test("reports the settled split that the testnet run produced", async () => {
    const facility = liveFacilityReader(address, RPC);
    const state = await facility.read();

    expect(state.active).toBe(true);
    expect(state.settled).toBe(true);
    expect(state.eligibleValueIdr).toBe(600_000_000);
    expect(state.issuedFaceIdr).toBe(390_000_000);
    expect(state.split?.seniorIdr).toBe(270_000_000);
    expect(state.split?.juniorIdr).toBe(60_000_000);
    expect(state.split?.seniorLossIdr).toBe(0);
    expect(state.split?.juniorLossIdr).toBe(60_000_000);
  }, 60_000);
});
