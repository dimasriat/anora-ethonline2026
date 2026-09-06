import { describe, expect, test } from "bun:test";
import { OFFICERS, QUORUM_THRESHOLD, makePrivy } from "./privy";

const online = process.env.ANORA_INTEGRATION === "1"
  && Boolean(process.env.PRIVY_APP_ID)
  && Boolean(process.env.PRIVY_APP_SECRET);

describe.skipIf(!online)("privy organisation wallet", () => {
  const privy = makePrivy({
    appId: process.env.PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
  });

  test("a quorum-owned wallet refuses one signature and accepts two", async () => {
    const wallet = await privy.createOrgWallet(OFFICERS, QUORUM_THRESHOLD);

    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallet.threshold).toBe(2);

    const message = "Financing mandate SRG-TEH-024 - Rp 420.000.000";

    await expect(privy.signAsOrg(wallet, ["OFF-1"], message)).rejects.toThrow(
      /authorization threshold/i,
    );

    const signature = await privy.signAsOrg(wallet, ["OFF-1", "OFF-3"], message);
    expect(signature).toMatch(/^0x[0-9a-fA-F]+$/);
  }, 90_000);
});
