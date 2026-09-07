import { Hono } from "hono";
import { IDKit, selfieCheckLegacy } from "@worldcoin/idkit-core";
import { signRequest } from "@worldcoin/idkit-core/signing";

const APP_ID = process.env.WORLD_APP_ID!;
const RP_ID = process.env.WORLD_RP_ID!;
const SIGNING_KEY = process.env.WORLD_RP_SIGNING_KEY!;
const ACTION = "anora-eligibility";
const PUBLIC_URL = process.env.PUBLIC_URL ?? "https://selfie-check-test.dimsky.xyz";

type Session = {
  id: string;
  connectorURI: string;
  state: "pending" | "verified" | "failed";
  detail?: unknown;
  startedAt: number;
};

/* Polling lives here, not in the page. On a phone the page unloads when the
   World App opens, and an in-page poll dies with it. */
const sessions = new Map<string, Session>();

const app = new Hono();

app.get("/api/config", (c) => c.json({ appId: APP_ID, rpId: RP_ID, action: ACTION }));

app.post("/api/session", async (c) => {
  const rpSig = signRequest({ signingKeyHex: SIGNING_KEY, action: ACTION });
  const id = crypto.randomUUID();

  const request = await IDKit.request({
    app_id: APP_ID,
    action: ACTION,
    /* The Sandbox app claims sandbox.world.org. "staging" is the older
       simulator and its link falls through to the production app. */
    environment: "sandbox",
    allow_legacy_proofs: true,
    return_to: `${PUBLIC_URL}/?session=${id}`,
    rp_context: {
      rp_id: RP_ID,
      nonce: rpSig.nonce,
      created_at: rpSig.createdAt,
      expires_at: rpSig.expiresAt,
      signature: rpSig.sig,
    },
  }).preset(selfieCheckLegacy());

  const session: Session = {
    id,
    connectorURI: request.connectorURI,
    state: "pending",
    startedAt: Date.now(),
  };
  sessions.set(id, session);

  void (async () => {
    const completion = await request.pollUntilCompletion();
    if (!completion.success) {
      session.state = "failed";
      session.detail = { stage: "idkit", error: completion.error };
      return;
    }
    const res = await fetch(`https://developer.world.org/api/v4/verify/${RP_ID}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      /* The guide says to forward the IDKit result as-is, but the endpoint
         rejects it with "action is required for uniqueness proofs" unless the
         action travels with it. */
      body: JSON.stringify({ ...completion.result, action: ACTION }),
    });
    const body = await res.text();
    session.state = res.ok ? "verified" : "failed";
    session.detail = { stage: "verify", status: res.status, body };
  })();

  return c.json({ sessionId: id, connectorURI: session.connectorURI });
});

app.get("/api/session/:id", (c) => {
  const session = sessions.get(c.req.param("id"));
  if (!session) return c.json({ error: "unknown session" }, 404);
  const { id, state, detail, connectorURI } = session;
  return c.json({ id, state, detail, connectorURI });
});

app.get("/idkit_wasm_bg.wasm", () =>
  new Response(
    Bun.file(new URL("../node_modules/@worldcoin/idkit-core/dist/idkit_wasm_bg.wasm", import.meta.url).pathname),
    { headers: { "content-type": "application/wasm" } },
  ));

app.get("/app.js", () =>
  new Response(Bun.file(new URL("./app.js", import.meta.url).pathname), {
    headers: { "content-type": "application/javascript" },
  }));

app.get("/*", async (c) =>
  c.html(await Bun.file(new URL("./index.html", import.meta.url).pathname).text()));

const port = Number(process.env.PORT ?? 3500);
console.log(`selfie-check spike on 127.0.0.1:${port}`);
export default { port, hostname: "127.0.0.1", fetch: app.fetch };
