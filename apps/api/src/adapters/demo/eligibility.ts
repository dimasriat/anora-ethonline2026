import type { CheckSession, Credential, EligibilityChecker } from "../live/world";

export function demoChecker(): EligibilityChecker {
  const sessions = new Map<string, CheckSession>();
  const credentials = new Map<string, Credential>();

  return {
    async open(ownerId) {
      const id = crypto.randomUUID();
      const credential: Credential = {
        nullifierHash: `0xdemo-${id}`,
        verifiedAt: new Date().toISOString(),
        method: "selfie-check",
      };
      const session: CheckSession = {
        id,
        ownerId,
        connectorURI: "",
        state: "verified",
        because: "Simulated eligibility. No World ID check took place.",
        credential,
      };
      sessions.set(id, session);
      credentials.set(ownerId, credential);
      return session;
    },
    read: (id) => sessions.get(id) ?? null,
    credentialOf: (ownerId) => credentials.get(ownerId) ?? null,
  };
}
