import { createRemoteJWKSet, jwtVerify } from "jose";
import { FlowError } from "./errors";

export type Caller = { userId: string };

export type Authenticator = (token: string | undefined) => Promise<Caller>;

const ANONYMOUS: Caller = { userId: "anonymous" };

export function privyAuthenticator(appId: string): Authenticator {
  const jwks = createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`),
  );

  return async (token) => {
    if (!token) throw new FlowError("not_signed_in", "Sign in to continue");
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: "privy.io",
        audience: appId,
      });
      if (!payload.sub) throw new Error("token carries no subject");
      return { userId: payload.sub };
    } catch (cause) {
      throw new FlowError("not_signed_in", "That session is not valid", {
        because: (cause as Error).message,
      });
    }
  };
}

/** Used when no Privy app is configured, so the API stays runnable offline. */
export const openAuthenticator: Authenticator = async () => ANONYMOUS;

export const bearer = (header: string | undefined): string | undefined =>
  header?.startsWith("Bearer ") ? header.slice(7) : undefined;
