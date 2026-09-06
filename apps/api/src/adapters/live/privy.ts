import { createPrivateKey, generateKeyPairSync, sign as nodeSign } from "node:crypto";

const API = "https://api.privy.io/v1";
const USER_AGENT = "anora-ethonline2026/0.1";

export type Officer = { id: string; name: string; role: string };

export type OrgWallet = {
  walletId: string;
  address: string;
  quorumId: string;
  threshold: number;
  officers: Officer[];
};

export type PrivyConfig = { appId: string; appSecret: string };

type KeyPair = { privatePem: string; publicDer: string };

function newKeyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicDer: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

function authorizationSignature(privatePem: string, url: string, body: unknown, appId: string): string {
  const payload = {
    version: 1,
    method: "POST",
    url,
    body,
    headers: { "privy-app-id": appId },
  };
  const message = Buffer.from(JSON.stringify(sortDeep(payload)));
  const key = createPrivateKey(privatePem);
  return nodeSign("sha256", message, key).toString("base64");
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort()
        .map((k) => [k, sortDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function makePrivy(config: PrivyConfig) {
  const keys = new Map<string, KeyPair>();

  const headers = (extra: Record<string, string> = {}) => ({
    authorization: `Basic ${Buffer.from(`${config.appId}:${config.appSecret}`).toString("base64")}`,
    "privy-app-id": config.appId,
    "content-type": "application/json",
    "user-agent": USER_AGENT,
    ...extra,
  });

  const post = async (path: string, body: unknown, extra: Record<string, string> = {}) => {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: headers(extra),
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(`privy ${path} ${res.status}: ${JSON.stringify(payload)}`);
    }
    return payload as Record<string, any>;
  };

  return {
    async createOrgWallet(officers: Officer[], threshold: number): Promise<OrgWallet> {
      const publicKeys: string[] = [];
      for (const officer of officers) {
        const pair = newKeyPair();
        keys.set(officer.id, pair);
        publicKeys.push(pair.publicDer);
      }

      const quorum = await post("/key_quorums", {
        display_name: "Cooperative board",
        public_keys: publicKeys,
        authorization_threshold: threshold,
      });

      const wallet = await post("/wallets", {
        chain_type: "ethereum",
        owner_id: quorum.id,
      });

      return {
        walletId: wallet.id,
        address: wallet.address,
        quorumId: quorum.id,
        threshold,
        officers,
      };
    },

    /** Privy enforces the threshold. This only presents the signatures it holds. */
    async signAsOrg(wallet: OrgWallet, signerIds: string[], message: string): Promise<string> {
      const url = `${API}/wallets/${wallet.walletId}/rpc`;
      const body = { method: "personal_sign", params: { message, encoding: "utf-8" } };

      const signatures = signerIds.map((id) => {
        const pair = keys.get(id);
        if (!pair) throw new Error(`no authorization key held for ${id}`);
        return authorizationSignature(pair.privatePem, url, body, config.appId);
      });

      const result = await post(`/wallets/${wallet.walletId}/rpc`, body, {
        "privy-authorization-signature": signatures.join(","),
      });
      return result.data.signature as string;
    },
  };
}

export const OFFICERS: Officer[] = [
  { id: "OFF-1", name: "Ketua koperasi", role: "Chair" },
  { id: "OFF-2", name: "Bendahara", role: "Treasurer" },
  { id: "OFF-3", name: "Sekretaris", role: "Secretary" },
];

export const QUORUM_THRESHOLD = 2;


