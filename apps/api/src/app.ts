import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { bearer, type Authenticator } from "./auth";
import type { EligibilityChecker } from "./adapters/live/world";
import type { Ports, TrancheName } from "@anora/core";
import { FACILITIES_PER_OWNER, makeFlow } from "./flow";
import { FlowError, STATUS_FOR } from "./errors";
import { INVESTORS } from "./adapters/mock/investors";
import { OFFICERS } from "./adapters/mock/wallet";
import { applyIntake, intakeView, resetIntake, type IntakeAction } from "./intake";
import { verifyDocuSealWebhook, type DocuSealClient } from "./docuseal";

export function makeApp(
  ports: Ports,
  authenticate: Authenticator,
  checker: EligibilityChecker,
  docuseal: { client: DocuSealClient; webhookSecret: string } | null = null,
) {
  const flow = makeFlow(ports);
  const app = new Hono();

  const callerOf = (c: { req: { header: (k: string) => string | undefined } }) =>
    authenticate(bearer(c.req.header("authorization")));

  /** Reading someone else's facility must look like absence, not refusal. */
  const ownedBy = async (c: Parameters<typeof callerOf>[0], requestId: string) => {
    const { userId } = await callerOf(c);
    if (!flow.get(requestId, userId)) {
      throw new FlowError("unknown_request", `unknown request: ${requestId}`, { id: requestId });
    }
    return userId;
  };

  app.onError((error, c) => {
    if (error instanceof FlowError) {
      return c.json({ error: { code: error.code, message: error.message, ...error.detail } },
        STATUS_FOR[error.code] as 400);
    }
    return c.json({ error: { code: "internal", message: error.message } }, 500);
  });

  const id = (c: { req: { param: (k: string) => string } }) => c.req.param("id");

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/status", (c) => c.json(ports.status()));
  app.get("/api/mode", (c) => c.json({ adapters: ports.status() }));
  app.get("/api/investors", (c) => c.json(INVESTORS));

  app.get("/api/esrg", async (c) => c.json(await ports.esrg.list()));
  app.get("/api/intake", (c) => c.json(intakeView()));
  app.post("/api/intake", async (c) => {
    const body: { role?: string; action?: IntakeAction } = await c.req.json().catch(() => ({}));
    if (!body.action) throw new FlowError("unknown_request", "intake action is required");
    const receiptId = "receiptId" in body.action ? body.action.receiptId : undefined;
    const receipt = receiptId ? await ports.esrg.get(receiptId) : null;
    return c.json(applyIntake(body.role ?? "", body.action, receipt));
  });

  app.get("/api/me", async (c) => {
    const { userId } = await callerOf(c);
    const held = flow.all(userId).length;
    return c.json({
      userId,
      facilities: { held, limit: FACILITIES_PER_OWNER, remaining: FACILITIES_PER_OWNER - held },
      eligibility: checker.credentialOf(userId),
    });
  });

  /** A live person must stand behind anything that moves value. */
  const requireEligibility = async (
    c: Parameters<typeof callerOf>[0],
    action: string,
  ): Promise<void> => {
    const { userId } = await callerOf(c);
    if (checker.credentialOf(userId)) return;
    throw new FlowError("not_eligible", `${action} needs a completed eligibility check`, {
      action,
    });
  };

  app.post("/api/eligibility/session", async (c) => {
    const { userId } = await callerOf(c);
    const session = await checker.open(userId);
    return c.json({ id: session.id, connectorURI: session.connectorURI, state: session.state });
  });

  app.get("/api/eligibility/session/:id", async (c) => {
    const { userId } = await callerOf(c);
    const session = checker.read(c.req.param("id"));
    if (!session || session.ownerId !== userId) {
      throw new FlowError("unknown_request", "unknown eligibility session");
    }
    const { id, state, because, credential, connectorURI } = session;
    return c.json({ id, state, because, credential, connectorURI });
  });

  app.get("/api/requests", async (c) => {
    const { userId } = await callerOf(c);
    return c.json(flow.all(userId));
  });
  app.get("/api/requests/:id", async (c) => {
    const userId = await ownedBy(c, id(c));
    return c.json(flow.get(id(c), userId));
  });
  app.get("/api/requests/:id/tranches", async (c) => {
    await ownedBy(c, id(c));
    const state = flow.get(id(c), (await callerOf(c)).userId)!;
    return c.json(flow.tranches(id(c)).map((terms) => ({
      ...terms,
      subscribedIdr: state.subscriptions
        .filter((item) => item.tranche === terms.name)
        .reduce((sum, item) => sum + item.unitsIdr, 0),
      purchasePriceIdr: 0,
    })));
  });
  app.get("/api/requests/:id/positions", async (c) => {
    await ownedBy(c, id(c));
    return c.json(flow.positions(id(c)));
  });
  app.get("/api/requests/:id/remaining", async (c) => {
    await ownedBy(c, id(c));
    return c.json(flow.remaining(id(c)));
  });

  app.post("/api/requests", async (c) => {
    const { userId } = await callerOf(c);
    const body: { esrgId?: string } = await c.req.json().catch(() => ({}));
    if (!body.esrgId) throw new FlowError("unknown_receipt", "esrgId is required");
    return c.json(await flow.create(body.esrgId, userId), 201);
  });

  app.post("/api/requests/:id/signing", async (c) => {
    const userId = await ownedBy(c, id(c));
    await requireEligibility(c, "Signing the mandate");
    if (!docuseal) throw new FlowError("capability_not_available", "DocuSeal is not configured");
    const state = flow.get(id(c), userId)!;
    if (state.documentSigning) return c.json(state);
    const body: { signerEmail?: string; signerName?: string } = await c.req.json().catch(() => ({}));
    const signerEmail = body.signerEmail?.trim() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) {
      throw new FlowError("unknown_request", "A valid signer email is required");
    }
    const submission = await docuseal.client.createSubmission({
      requestId: state.request.id,
      signerName: body.signerName?.trim() || intakeView().state.borrower.profile.entityName,
      signerEmail,
      receiptId: state.request.esrgId,
      requestedIdr: state.request.requestedIdr,
    });
    return c.json(flow.beginDocumentSigning(id(c), submission), 201);
  });

  app.post("/api/webhooks/docuseal", async (c) => {
    if (!docuseal) return c.json({ error: "DocuSeal is not configured" }, 503);
    const rawBody = new Uint8Array(await c.req.raw.arrayBuffer());
    if (!verifyDocuSealWebhook(rawBody, c.req.header("x-docuseal-signature"), docuseal.webhookSecret)) {
      return c.json({ error: "Invalid webhook signature" }, 401);
    }
    let payload: {
      event_type?: string;
      timestamp?: string;
      data?: { id?: number; completed_at?: string; combined_document_url?: string; audit_log_url?: string };
    };
    try { payload = JSON.parse(new TextDecoder().decode(rawBody)); }
    catch { return c.json({ error: "Invalid webhook payload" }, 400); }
    if (payload.event_type !== "submission.completed" || !payload.data?.id) return c.json({ ok: true });
    flow.completeDocumentSigning(
      payload.data.id,
      payload.data.completed_at ?? payload.timestamp ?? new Date().toISOString(),
      payload.data.combined_document_url,
      payload.data.audit_log_url,
    );
    return c.json({ ok: true });
  });

  app.post("/api/requests/:id/approve-mandate", async (c) => {
    await ownedBy(c, id(c));
    await requireEligibility(c, "Signing the mandate");
    if (docuseal) throw new FlowError("step_out_of_order", "Complete the DocuSeal submission to sign the mandate");
    const body: { officerId?: string } = await c.req.json().catch(() => ({}));
    if (!body.officerId) throw new FlowError("unknown_officer", "officerId is required");
    return c.json(await flow.approveMandate(id(c), body.officerId));
  });
  app.get("/api/officers", (c) => c.json(OFFICERS));
  app.post("/api/requests/:id/approve", async (c) => {
    await ownedBy(c, id(c));
    await requireEligibility(c, "Approving the facility");
    return c.json(await flow.approve(id(c)));
  });
  app.post("/api/requests/:id/prove", async (c) => {
    await ownedBy(c, id(c));
    return c.json(await flow.prove(id(c)));
  });
  app.post("/api/requests/:id/tokenize", async (c) => {
    await ownedBy(c, id(c));
    return c.json(await flow.tokenize(id(c)));
  });
  app.post("/api/requests/:id/register", async (c) => {
    await ownedBy(c, id(c));
    return c.json(await flow.registerAndFund(id(c)));
  });
  app.post("/api/requests/:id/repay", async (c) => {
    await ownedBy(c, id(c));
    const body: { cashReceivedIdr?: number } = await c.req.json().catch(() => ({}));
    return c.json(await flow.repay(id(c), body.cashReceivedIdr === undefined ? undefined : Number(body.cashReceivedIdr)));
  });
  app.post("/api/requests/:id/back", async (c) => {
    await ownedBy(c, id(c));
    return c.json(await flow.back(id(c)));
  });

  app.post("/api/requests/:id/subscribe", async (c) => {
    await ownedBy(c, id(c));
    await requireEligibility(c, "Subscribing");
    const body: { investorId?: string; tranche?: TrancheName; unitsIdr?: number } =
      await c.req.json().catch(() => ({}));
    if (!body.investorId) throw new FlowError("unknown_investor", "investorId is required");
    if (body.tranche !== "SENIOR" && body.tranche !== "JUNIOR") {
      throw new FlowError("mandate_excludes_tranche", "tranche must be SENIOR or JUNIOR");
    }
    return c.json(await flow.subscribe(id(c), body.investorId, body.tranche, Number(body.unitsIdr)));
  });
  app.post("/api/requests/:id/transfer", async (c) => {
    await ownedBy(c, id(c));
    const body: { fromInvestorId?: string; toInvestorId?: string; tranche?: TrancheName; unitsIdr?: number } = await c.req.json();
    if (!body.fromInvestorId || !body.toInvestorId || (body.tranche !== "SENIOR" && body.tranche !== "JUNIOR")) {
      throw new FlowError("unknown_investor", "A sender, recipient, and tranche are required");
    }
    return c.json(flow.transfer(id(c), body.fromInvestorId, body.toInvestorId, body.tranche, Number(body.unitsIdr)));
  });
  app.post("/api/requests/:id/pause", async (c) => {
    await ownedBy(c, id(c));
    const body: { paused?: boolean } = await c.req.json();
    return c.json(flow.pause(id(c), Boolean(body.paused)));
  });
  app.post("/api/requests/:id/freeze", async (c) => {
    await ownedBy(c, id(c));
    const body: { investorId?: string; frozen?: boolean } = await c.req.json();
    if (!body.investorId) throw new FlowError("unknown_investor", "investorId is required");
    return c.json(flow.freeze(id(c), body.investorId, Boolean(body.frozen)));
  });
  app.post("/api/reset", (c) => {
    flow.reset();
    resetIntake();
    return c.json({ ok: true as const });
  });

  const built = "./apps/web/dist";
  app.use("/*", serveStatic({ root: built }));
  app.get("*", serveStatic({ path: `${built}/index.html` }));

  return app;
}
