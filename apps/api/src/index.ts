import { makeApp } from "./app";
import { resolveChecker, resolvePorts } from "./ports";
import { openAuthenticator, privyAuthenticator } from "./auth";
import { identityIsSimulated } from "./identity-mode";
import { resolveDocuSeal } from "./docuseal";

const port = Number(process.env.PORT ?? 3333);
console.log(`anora listening on 127.0.0.1:${port}`);

const appId = process.env.PRIVY_APP_ID;
const authenticate = identityIsSimulated(process.env) ? openAuthenticator : privyAuthenticator(appId!);

export default {
  port,
  hostname: "127.0.0.1",
  fetch: makeApp(resolvePorts(), authenticate, resolveChecker().checker, resolveDocuSeal(process.env)).fetch,
};
