import { describe, expect, it } from "bun:test";
import { demoChecker } from "./eligibility";

describe("demoChecker", () => {
  it("grants a credential the moment a session opens", async () => {
    const checker = demoChecker();
    const session = await checker.open("did:privy:abc");

    expect(session.state).toBe("verified");
    expect(session.credential?.method).toBe("selfie-check");
    expect(checker.credentialOf("did:privy:abc")).not.toBeNull();
  });

  it("marks the credential as simulated so nothing can mistake it", async () => {
    const checker = demoChecker();
    const session = await checker.open("did:privy:abc");

    expect(session.credential?.nullifierHash).toMatch(/^0xdemo/);
    expect(session.connectorURI).toBe("");
  });

  it("grants to anyone, because no check ever runs", () => {
    const credential = demoChecker().credentialOf("did:privy:stranger");
    expect(credential?.method).toBe("selfie-check");
    expect(credential?.nullifierHash).toMatch(/^0xdemo/);
  });

  it("reads a session back by id", async () => {
    const checker = demoChecker();
    const opened = await checker.open("did:privy:abc");
    expect(checker.read(opened.id)?.ownerId).toBe("did:privy:abc");
    expect(checker.read("no-such-session")).toBeNull();
  });
});
