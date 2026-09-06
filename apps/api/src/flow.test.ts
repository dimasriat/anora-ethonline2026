import { beforeEach, describe, expect, test } from "bun:test";
import { makeFlow } from "./flow";
import { mockPorts } from "./adapters/mock/index";
import { FlowError } from "./errors";

let flow: ReturnType<typeof makeFlow>;
beforeEach(() => { flow = makeFlow(mockPorts()); });

const codeOf = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); } catch (e) { return (e as FlowError).code; }
  throw new Error("expected a refusal");
};

const upToTokenized = async () => {
  const s = await flow.create("SRG-TEH-024");
  await flow.signMandate(s.request.id);
  await flow.approve(s.request.id);
  s.request.status = "proven";
  await flow.tokenize(s.request.id);
  return s.request.id;
};

describe("create", () => {
  test("derives the requested principal from the receipt", async () => {
    const s = await flow.create("SRG-TEH-024");
    expect(s.request.requestedIdr).toBe(420_000_000);
    expect(s.facility.ceilingIdr).toBe(420_000_000);
    expect(s.request.status).toBe("draft");
  });

  test("gives a smaller receipt a smaller facility", async () => {
    const s = await flow.create("SRG-TEH-031");
    expect(s.request.requestedIdr).toBe(158_760_000);
  });

  test("refuses an unknown receipt", async () => {
    expect(await codeOf(() => flow.create("SRG-NOPE"))).toBe("unknown_receipt");
  });
});

describe("step order", () => {
  test("refuses approval before the mandate is signed", async () => {
    const s = await flow.create("SRG-TEH-024");
    expect(await codeOf(() => flow.approve(s.request.id))).toBe("step_out_of_order");
  });

  test("refuses repayment on a request that was never funded", async () => {
    const s = await flow.create("SRG-TEH-024");
    expect(await codeOf(() => flow.repay(s.request.id))).toBe("step_out_of_order");
  });

  test("refuses subscription before the note is issued", async () => {
    const s = await flow.create("SRG-TEH-024");
    expect(await codeOf(() => flow.subscribe(s.request.id, "INV-BRS", "SENIOR", 50_000_000)))
      .toBe("step_out_of_order");
  });
});

describe("prove", () => {
  test("reports the capability as unavailable rather than faking a proof", async () => {
    const s = await flow.create("SRG-TEH-024");
    await flow.signMandate(s.request.id);
    await flow.approve(s.request.id);
    expect(await codeOf(() => flow.prove(s.request.id))).toBe("capability_not_available");
    expect(flow.get(s.request.id)!.request.status).toBe("approved");
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
    expect(flow.get(id)!.request.status).toBe("tokenized");
    await flow.subscribe(id, "INV-KIT", "JUNIOR", 120_000_000);
    expect(flow.get(id)!.request.status).toBe("subscribed");
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

describe("back", () => {
  test("rewinds one step while only documents exist", async () => {
    const s = await flow.create("SRG-TEH-024");
    await flow.signMandate(s.request.id);
    expect((await flow.back(s.request.id)).request.status).toBe("draft");
  });

  test("refuses to rewind once the note is issued", async () => {
    const id = await upToTokenized();
    expect(await codeOf(() => flow.back(id))).toBe("not_reversible");
  });
});
