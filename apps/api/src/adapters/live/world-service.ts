import type { CheckSession, Credential, EligibilityChecker } from "./world";

/**
 * Talks to the Selfie Check service instead of driving IDKit in this process.
 * The library refuses to instantiate its WebAssembly here while the very same
 * version does so in that service, so the working one is treated as the
 * dependency.
 */
export function worldService(baseUrl: string): EligibilityChecker {
  const owners = new Map<string, string>();
  const credentials = new Map<string, Credential>();

  const read = async (id: string) => {
    const res = await fetch(`${baseUrl}/api/session/${id}`);
    if (!res.ok) throw new Error(`selfie check service: ${res.status}`);
    return await res.json() as { id: string; state: CheckSession["state"]; connectorURI: string; detail?: unknown };
  };

  const settle = (id: string, state: CheckSession["state"]) => {
    const ownerId = owners.get(id);
    if (!ownerId || state !== "verified" || credentials.has(ownerId)) return;
    credentials.set(ownerId, {
      nullifierHash: `0xservice-${id}`,
      verifiedAt: new Date().toISOString(),
      method: "selfie-check",
    });
  };

  return {
    async open(ownerId) {
      const res = await fetch(`${baseUrl}/api/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ environment: "sandbox" }),
      });
      if (!res.ok) throw new Error(`selfie check service: ${res.status} ${(await res.text()).slice(0, 200)}`);

      const body = await res.json() as { sessionId: string; connectorURI: string };
      owners.set(body.sessionId, ownerId);

      void (async () => {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          await new Promise((r) => setTimeout(r, 2_000));
          const now = await read(body.sessionId).catch(() => null);
          if (!now) continue;
          if (now.state !== "pending") return settle(body.sessionId, now.state);
        }
      })();

      return { id: body.sessionId, ownerId, connectorURI: body.connectorURI, state: "pending" };
    },

    read(id) {
      const ownerId = owners.get(id);
      if (!ownerId) return null;
      const credential = credentials.get(ownerId);
      return {
        id, ownerId, connectorURI: "",
        state: credential ? "verified" : "pending",
        credential,
      };
    },

    credentialOf: (ownerId) => credentials.get(ownerId) ?? null,
  };
}
