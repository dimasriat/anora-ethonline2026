import { beforeEach, describe, expect, test } from "vitest";
import { makeFlow } from "./flow";
import { mockPorts } from "./adapters/mock/index";
import { FlowError } from "./errors";

const OWNER = "did:privy:test";
let flow: ReturnType<typeof makeFlow>;
beforeEach(() => { flow = makeFlow(mockPorts()); });

const releaseFunds = async (id: string) => {
  await flow.approveRelease(id, "OPS-1");
  await flow.approveRelease(id, "OPS-2");
  return flow.registerAndFund(id);
};

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

/* The derived book for SRG-TEH-024. Senior is larger than any single investor's
   maximum ticket, so filling it takes two — which is what a permissioned book
   does rather than a special case. */
const SENIOR_CAP = 301_040_000;
const JUNIOR_CAP = 88_960_000;

const fillSenior = async (id: string) => {
  await flow.subscribe(id, "INV-BRS", "SENIOR", 270_000_000);
  await flow.subscribe(id, "INV-NFO", "SENIOR", SENIOR_CAP - 270_000_000);
};

const upToSubscribed = async () => {
  const id = await upToTokenized();
  await fillSenior(id);
  await flow.subscribe(id, "INV-MVA", "JUNIOR", JUNIOR_CAP);
  return id;
};

describe("create", () => {
  test("derives the requested principal from the receipt", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    expect(s.request.requestedIdr).toBe(390_000_000);
    expect(s.facility.ceilingIdr).toBe(420_000_000);
    expect(s.request.status).toBe("draft");
  });

  test("writes the face below the ceiling it is authorised against", async () => {
    const s = await flow.create("SRG-TEH-024", OWNER);
    expect(s.facility.faceIdr).toBe(390_000_000);
    expect(s.facility.ceilingIdr - s.facility.faceIdr).toBe(30_000_000);
  });

  test("gives a smaller receipt a smaller facility", async () => {
    const s = await flow.create("SRG-TEH-018", OWNER);
    expect(s.request.requestedIdr).toBe(201_500_000);
  });

  test("refuses an unknown receipt", async () => {
    expect(await codeOf(() => flow.create("SRG-NOPE", OWNER))).toBe("unknown_receipt");
  });

  /* A receipt the policy cannot carry is refused here rather than issued and
     explained afterwards. Every seeded receipt is financeable, so the refusal
     needs a receipt built for it. */
  test("refuses a receipt the policy will not structure", async () => {
    const base = mockPorts();
    const tiny = makeFlow({
      ...base,
      esrg: {
        ...base.esrg,
        get: async () => ({
          id: "SRG-TINY", holder: "Koperasi Test", warehouse: "Gudang Test",
          commodity: "Tea", quantityKg: 1, valueIdr: 1,
          issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z",
          documentHash: "0xtiny", encumbrance: "none" as const,
        }),
      },
    });
    expect(await codeOf(() => tiny.create("SRG-TINY", OWNER))).toBe("policy_infeasible");
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

  test("carries what the prover actually printed, not the exit status", async () => {
    const ports = mockPorts();
    ports.proof.prove = () => {
      const shellError = new Error("Failed with exit code 1") as Error & { stderr: Buffer };
      shellError.stderr = Buffer.from("error: Failed constraint\n56 | assert(merkle_root(leaf, path, index) == registry_root);");
      throw shellError;
    };
    const failing = makeFlow(ports);
    const s = await failing.create("SRG-TEH-024", OWNER);
    await failing.approveMandate(s.request.id, "OFF-1");
    await failing.approveMandate(s.request.id, "OFF-3");
    await failing.approve(s.request.id);

    try {
      await failing.prove(s.request.id);
    } catch (e) {
      expect((e as FlowError).detail.because).toContain("Failed constraint");
      return;
    }
    throw new Error("expected a refusal");
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
    await flow.subscribe(id, "INV-KIT", "JUNIOR", JUNIOR_CAP);
    expect(await codeOf(() => flow.subscribe(id, "INV-YMS", "JUNIOR", 10_000_000)))
      .toBe("exceeds_remaining_capacity");
  });

  test("closes the facility only when every tranche is full", async () => {
    const id = await upToTokenized();
    await fillSenior(id);
    expect(flow.get(id, OWNER)!.request.status).toBe("tokenized");
    await flow.subscribe(id, "INV-KIT", "JUNIOR", JUNIOR_CAP);
    expect(flow.get(id, OWNER)!.request.status).toBe("subscribed");
  });
});

describe("funding and repayment", () => {
  const fullySubscribed = async () => {
    const id = await upToTokenized();
    await fillSenior(id);
    await flow.subscribe(id, "INV-KIT", "JUNIOR", JUNIOR_CAP);
    return id;
  };

  test("registry confirmation activates the note and funds", async () => {
    const id = await fullySubscribed();
    const s = await releaseFunds(id);
    expect(s.request.status).toBe("funded");
    expect(s.note!.state).toBe("active");
    expect(s.registryRef).toContain("SRG-TEH-024");
  });

  test("repayment redeems the note and raises the round", async () => {
    const id = await fullySubscribed();
    await releaseFunds(id);
    const s = await flow.repay(id);
    expect(s.request.status).toBe("repaid");
    expect(s.note!.state).toBe("redeemed");
    expect(s.request.epoch).toBe(2);
  });
});

describe("secondary transfers", () => {
  const funded = async () => {
    const id = await upToTokenized();
    await fillSenior(id);
    await flow.subscribe(id, "INV-KIT", "JUNIOR", JUNIOR_CAP);
    await releaseFunds(id);
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

describe("releasing funds needs the operator's own quorum", () => {
  test("refuses a release nobody has approved", async () => {
    const id = await upToSubscribed();
    expect(await codeOf(() => flow.registerAndFund(id))).toBe("quorum_not_reached");
  });

  test("refuses a release one officer approved alone", async () => {
    const id = await upToSubscribed();
    await flow.approveRelease(id, "OPS-1");
    expect(await codeOf(() => flow.registerAndFund(id))).toBe("quorum_not_reached");
  });

  test("refuses an officer who does not belong to the operator", async () => {
    const id = await upToSubscribed();
    expect(await codeOf(() => flow.approveRelease(id, "OFF-1"))).toBe("unknown_officer");
  });

  test("releases once both operator officers have approved", async () => {
    const id = await upToSubscribed();
    await flow.approveRelease(id, "OPS-1");
    await flow.approveRelease(id, "OPS-2");
    const funded = await flow.registerAndFund(id);
    expect(funded.request.status).toBe("funded");
    expect(funded.releaseSignature).toMatch(/^0x/);
  });

  test("the operator wallet is not the cooperative's", async () => {
    const id = await upToSubscribed();
    const s = flow.get(id, OWNER)!;
    expect(s.complianceWallet).toBeDefined();
    expect(s.complianceWallet!.walletId).not.toBe(s.orgWallet!.walletId);
  });
});
