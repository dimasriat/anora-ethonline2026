import { beforeEach, describe, expect, test } from "bun:test";
import { makeFlow } from "./flow";
import { mockPorts } from "./adapters/mock/index";
import { FlowError } from "./errors";

const OWNER = "did:privy:test";
let flow: ReturnType<typeof makeFlow>;
beforeEach(() => { flow = makeFlow(mockPorts()); });

const codeOf = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); } catch (e) { return (e as FlowError).code; }
  throw new Error("expected a refusal");
};

const signMandate = async (id: string) => {
  await flow.approveMandate(id, "OFF-1");
  await flow.approveMandate(id, "OFF-3");
};

const upToTokenized = async () => {
  const s = await flow.create("SRG-TEH-024", OWNER);
  await signMandate(s.request.id);
  await flow.approve(s.request.id);
  s.request.status = "proven";
  await flow.tokenize(s.request.id);
  return s.request.id;
};

describe("create", () => {
  test("derives the requested principal from the receipt", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    expect(s.request.requestedIdr).toBe(420_000_000);
    expect(s.facility.ceilingIdr).toBe(420_000_000);
    expect(s.request.status).toBe("draft");
  });

  test("gives a smaller receipt a smaller facility", async () => {
    const s = await flow.create("SRG-TEH-018", OWNER);
    expect(s.request.requestedIdr).toBe(217_000_000);
  });

  test("refuses an unknown receipt", async () => {
    expect(await codeOf(() => flow.create("SRG-NOPE", OWNER))).toBe("unknown_receipt");
  });
});

describe("mandate quorum", () => {
  test("one officer is not enough", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    await flow.approveMandate(s.request.id, "OFF-1");
    expect(flow.get(s.request.id, OWNER)!.request.status).toBe("draft");
  });

  test("two officers sign the mandate", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    await flow.approveMandate(s.request.id, "OFF-1");
    const done = await flow.approveMandate(s.request.id, "OFF-3");
    expect(done.request.status).toBe("mandate_signed");
    expect(done.mandateSignature).toBeTruthy();
  });

  test("the same officer approving twice does not reach the quorum", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    await flow.approveMandate(s.request.id, "OFF-2");
    await flow.approveMandate(s.request.id, "OFF-2");
    expect(flow.get(s.request.id, OWNER)!.request.status).toBe("draft");
  });

  test("an unknown officer is refused", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    expect(await codeOf(() => flow.approveMandate(s.request.id, "OFF-9"))).toBe("unknown_officer");
  });

  test("every facility gets an organisation wallet", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    expect(s.orgWallet!.threshold).toBe(2);
    expect(s.orgWallet!.officers).toHaveLength(3);
  });
});

describe("step order", () => {
  test("refuses approval before the mandate is signed", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    expect(await codeOf(() => flow.approve(s.request.id))).toBe("step_out_of_order");
  });

  test("refuses repayment on a request that was never funded", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    expect(await codeOf(() => flow.repay(s.request.id))).toBe("step_out_of_order");
  });

  test("refuses subscription before the note is issued", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    expect(await codeOf(() => flow.subscribe(s.request.id, "INV-BRS", "SENIOR", 50_000_000)))
      .toBe("step_out_of_order");
  });
});

describe("prove", () => {
  test("reports the capability as unavailable rather than faking a proof", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    await signMandate(s.request.id);
    await flow.approve(s.request.id);
    expect(await codeOf(() => flow.prove(s.request.id))).toBe("capability_not_available");
    expect(flow.get(s.request.id, OWNER)!.request.status).toBe("approved");
  });
});

describe("subscribe", () => {
  test("refuses an investor who is not allowlisted", async () => {
    const id = await upToTokenized();
    expect(await codeOf(() => flow.subscribe(id, "INV-MFC", "JUNIOR", 50_000_000)))
      .toBe("not_allowlisted");
  });

  test("refuses a tranche outside the investor's mandate", async () => {
    const id = await upToTokenized();
    expect(await codeOf(() => flow.subscribe(id, "INV-DPN", "JUNIOR", 100_000_000)))
      .toBe("mandate_excludes_tranche");
  });

  test("refuses more than the tranche has left", async () => {
    const id = await upToTokenized();
    await flow.subscribe(id, "INV-KIT", "JUNIOR", 120_000_000);
    expect(await codeOf(() => flow.subscribe(id, "INV-YMS", "JUNIOR", 10_000_000)))
      .toBe("exceeds_remaining_capacity");
  });

  test("closes the facility only when every tranche is full", async () => {
    const id = await upToTokenized();
    await flow.subscribe(id, "INV-BRS", "SENIOR", 270_000_000);
    expect(flow.get(id, OWNER)!.request.status).toBe("tokenized");
    await flow.subscribe(id, "INV-KIT", "JUNIOR", 120_000_000);
    expect(flow.get(id, OWNER)!.request.status).toBe("subscribed");
  });
});

describe("funding and repayment", () => {
  const fullySubscribed = async () => {
    const id = await upToTokenized();
    await flow.subscribe(id, "INV-BRS", "SENIOR", 270_000_000);
    await flow.subscribe(id, "INV-KIT", "JUNIOR", 120_000_000);
    return id;
  };

  test("registry confirmation activates the note and funds", async () => {
    const id = await fullySubscribed();
    const s = await flow.registerAndFund(id);
    expect(s.request.status).toBe("funded");
    expect(s.note!.state).toBe("active");
    expect(s.registryRef).toContain("SRG-TEH-024");
  });

  test("repayment redeems the note and raises the round", async () => {
    const id = await fullySubscribed();
    await flow.registerAndFund(id);
    const s = await flow.repay(id);
    expect(s.request.status).toBe("repaid");
    expect(s.note!.state).toBe("redeemed");
    expect(s.request.epoch).toBe(2);
  });
});

describe("secondary transfers", () => {
  const funded = async () => {
    const id = await upToTokenized();
    await flow.subscribe(id, "INV-BRS", "SENIOR", 270_000_000);
    await flow.subscribe(id, "INV-KIT", "JUNIOR", 120_000_000);
    await flow.registerAndFund(id);
    return id;
  };

  test("enforces pause, freeze, and recipient mandate before settlement", async () => {
    const id = await funded();
    flow.pause(id, true);
    expect(() => flow.transfer(id, "INV-KIT", "INV-MVA", "JUNIOR", 10_000_000)).toThrow("paused");
    flow.pause(id, false);
    flow.freeze(id, "INV-MVA", true);
    expect(() => flow.transfer(id, "INV-KIT", "INV-MVA", "JUNIOR", 10_000_000)).toThrow("frozen");
    flow.freeze(id, "INV-MVA", false);
    flow.transfer(id, "INV-KIT", "INV-MVA", "JUNIOR", 10_000_000);
    expect(flow.positions(id)).toContainEqual({ investorId: "INV-MVA", tranche: "JUNIOR", unitsIdr: 10_000_000 });
  });
});

describe("back", () => {
  test("rewinds one step while only documents exist", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    await signMandate(s.request.id);
    expect((await flow.back(s.request.id)).request.status).toBe("draft");
  });

  test("refuses to rewind once the note is issued", async () => {
    const id = await upToTokenized();
    expect(await codeOf(() => flow.back(id))).toBe("not_reversible");
  });
});

describe("ownership", () => {
  const OTHER = "did:privy:someone-else";

  test("a facility belongs to whoever opened it", async () => {
    const mine = await flow.create("SRG-TEH-024", OWNER);
    expect(flow.all(OWNER).map((s) => s.request.id)).toContain(mine.request.id);
    expect(flow.all(OTHER)).toHaveLength(0);
  });

  test("someone else's facility reads as absent, not forbidden", async () => {
    const mine = await flow.create("SRG-TEH-024", OWNER);
    expect(flow.get(mine.request.id, OTHER)).toBeNull();
  });

  test("the facility allowance is per owner", async () => {
    for (let i = 0; i < 5; i++) await flow.create("SRG-TEH-024", OWNER);
    expect(await codeOf(() => flow.create("SRG-TEH-024", OWNER))).toBe("facility_limit_reached");
    expect((await flow.create("SRG-TEH-024", OTHER)).ownerId).toBe(OTHER);
  });
});
