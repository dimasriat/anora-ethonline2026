import type { PrivyConfig } from "./privy";

const API = "https://api.privy.io/v1";

export type BoardMember = { officerId: string; name: string; role: string; privyUserId: string };

export type BoardWallet = {
  walletId: string;
  address: string;
  quorumId: string;
  organizationId: string;
  threshold: number;
  members: BoardMember[];
};

export type SignaturePayload = {
  version: 1;
  method: "POST";
  url: string;
  body: unknown;
  headers: Record<string, string>;
};

/**
 * A board whose signers are the officers themselves. Members are Privy users,
 * so no key held here can reach the threshold: the signatures must come from
 * the officers' own sessions.
 */
export function makeBoard(config: PrivyConfig) {
  const headers = () => ({
    authorization: `Basic ${Buffer.from(`${config.appId}:${config.appSecret}`).toString("base64")}`,
    "privy-app-id": config.appId,
    "content-type": "application/json",
  });

  const post = async (path: string, body: unknown, extra: Record<string, string> = {}) => {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { ...headers(), ...extra },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 300)}`);
    return JSON.parse(text) as Record<string, unknown>;
  };

  return {
    async open(members: BoardMember[], threshold: number, displayName: string): Promise<BoardWallet> {
      const quorum = await post("/key_quorums", {
        display_name: displayName,
        user_ids: members.map((m) => m.privyUserId),
        authorization_threshold: threshold,
      });

      const organization = await post("/organizations", {
        display_name: displayName,
        default_key_quorum_id: String(quorum.id),
      });

      const wallet = await post("/wallets", {
        chain_type: "ethereum",
        entity: { type: "organization", id: String(organization.id) },
      });

      return {
        walletId: String(wallet.id),
        address: String(wallet.address),
        quorumId: String(quorum.id),
        organizationId: String(organization.id),
        threshold,
        members,
      };
    },

    /** The exact bytes each officer signs. One byte apart and Privy refuses. */
    payloadFor(wallet: BoardWallet, message: string): SignaturePayload {
      return {
        version: 1,
        method: "POST",
        url: `${API}/wallets/${wallet.walletId}/rpc`,
        body: { method: "personal_sign", params: { message, encoding: "utf-8" } },
        headers: { "privy-app-id": config.appId },
      };
    },

    async signWith(wallet: BoardWallet, message: string, signatures: string[]): Promise<string> {
      if (signatures.length < wallet.threshold) {
        throw new Error(`Number of signatures does not match the wallet's authorization threshold`);
      }
      const body = { method: "personal_sign", params: { message, encoding: "utf-8" } };
      const result = await post(`/wallets/${wallet.walletId}/rpc`, body, {
        "privy-authorization-signature": signatures.join(","),
      });
      const data = (result.data ?? result) as { signature?: string };
      if (!data.signature) throw new Error(`no signature in response: ${JSON.stringify(result).slice(0, 200)}`);
      return data.signature;
    },
  };
}
