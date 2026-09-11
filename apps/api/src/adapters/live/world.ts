import { IDKit, selfieCheckLegacy } from "@worldcoin/idkit-core";
import { signRequest } from "@worldcoin/idkit-core/signing";

export type Credential = {
  nullifierHash: string;
  verifiedAt: string;
  method: "selfie-check";
};

export type CheckSession = {
  id: string;
  ownerId: string;
  connectorURI: string;
  state: "pending" | "verified" | "failed";
  because?: string;
  credential?: Credential;
};

export type WorldConfig = {
  appId: `app_${string}`;
  rpId: string;
  signingKey: string;
  action: string;
  environment: "production" | "staging" | "sandbox";
  returnTo: string;
};

export interface EligibilityChecker {
  open(ownerId: string): Promise<CheckSession>;
  read(id: string): CheckSession | null;
  credentialOf(ownerId: string): Credential | null;
}

export function worldChecker(config: WorldConfig): EligibilityChecker {
  const sessions = new Map<string, CheckSession>();
  const credentials = new Map<string, Credential>();

  return {
    async open(ownerId) {
      const rp = signRequest({ signingKeyHex: config.signingKey, action: config.action });
      const id = crypto.randomUUID();

      const request = await IDKit.request({
        app_id: config.appId,
        action: config.action,
        environment: config.environment,
        allow_legacy_proofs: true,
        return_to: `${config.returnTo}?check=${id}`,
        rp_context: {
          rp_id: config.rpId,
          nonce: rp.nonce,
          created_at: rp.createdAt,
          expires_at: rp.expiresAt,
          signature: rp.sig,
        },
      }).preset(selfieCheckLegacy());

      const session: CheckSession = {
        id,
        ownerId,
        connectorURI: request.connectorURI,
        state: "pending",
      };
      sessions.set(id, session);

      /* The browser cannot own this wait: on a phone the page unloads when the
         World App opens, and an in-page poll dies with it. */
      void (async () => {
        const completion = await request.pollUntilCompletion();
        if (!completion.success) {
          session.state = "failed";
          session.because = String(completion.error);
          return;
        }

        const res = await fetch(`https://developer.world.org/api/v4/verify/${config.rpId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          /* The guide says to forward the result as-is, but the endpoint
             rejects it without the action. */
          body: JSON.stringify({ ...completion.result, action: config.action }),
        });

        if (!res.ok) {
          session.state = "failed";
          session.because = (await res.text()).slice(0, 300);
          return;
        }

        const verified = await res.json() as { nullifier_hash?: string };
        const credential: Credential = {
          nullifierHash: verified.nullifier_hash ?? "unknown",
          verifiedAt: new Date().toISOString(),
          method: "selfie-check",
        };
        credentials.set(ownerId, credential);
        session.state = "verified";
        session.credential = credential;
      })();

      return session;
    },

    read: (id) => sessions.get(id) ?? null,
    credentialOf: (ownerId) => credentials.get(ownerId) ?? null,
  };
}

/** Used when World is not configured, so the API stays runnable offline. */
export function unavailableChecker(): EligibilityChecker {
  return {
    async open() {
      throw new Error("World ID is not configured");
    },
    read: () => null,
    credentialOf: () => null,
  };
}
