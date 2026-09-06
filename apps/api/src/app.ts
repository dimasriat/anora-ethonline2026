import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Ports, TrancheName } from "@anora/core";
import { makeFlow } from "./flow";
import { FlowError, STATUS_FOR } from "./errors";
import { INVESTORS } from "./adapters/mock/investors";
import { OFFICERS } from "./adapters/mock/wallet";

export function makeApp(ports: Ports) {
  const flow = makeFlow(ports);
  const app = new Hono();

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
  app.get("/api/investors", (c) => c.json(INVESTORS));

  app.get("/api/esrg", async (c) => c.json(await ports.esrg.list()));

  app.get("/api/requests", (c) => c.json(flow.all()));
  app.get("/api/requests/:id", (c) => {
    const state = flow.get(id(c));
    if (!state) throw new FlowError("unknown_request", `unknown request: ${id(c)}`);
    return c.json(state);
  });
  app.get("/api/requests/:id/tranches", (c) => c.json(flow.tranches(id(c))));
  app.get("/api/requests/:id/remaining", (c) => c.json(flow.remaining(id(c))));

  app.post("/api/requests", async (c) => {
    const body: { esrgId?: string } = await c.req.json().catch(() => ({}));
    if (!body.esrgId) throw new FlowError("unknown_receipt", "esrgId is required");
    return c.json(await flow.create(body.esrgId), 201);
  });

  app.post("/api/requests/:id/approve-mandate", async (c) => {
    const body: { officerId?: string } = await c.req.json().catch(() => ({}));
    if (!body.officerId) throw new FlowError("unknown_officer", "officerId is required");
    return c.json(await flow.approveMandate(id(c), body.officerId));
  });
  app.get("/api/officers", (c) => c.json(OFFICERS));
  app.post("/api/requests/:id/approve", async (c) => c.json(await flow.approve(id(c))));
  app.post("/api/requests/:id/prove", async (c) => c.json(await flow.prove(id(c))));
  app.post("/api/requests/:id/tokenize", async (c) => c.json(await flow.tokenize(id(c))));
  app.post("/api/requests/:id/register", async (c) => c.json(await flow.registerAndFund(id(c))));
  app.post("/api/requests/:id/repay", async (c) => {
    const body: { cashReceivedIdr?: number } = await c.req.json().catch(() => ({}));
    return c.json(await flow.repay(id(c), body.cashReceivedIdr === undefined ? undefined : Number(body.cashReceivedIdr)));
  });
  app.post("/api/requests/:id/back", async (c) => c.json(await flow.back(id(c))));

  app.post("/api/requests/:id/subscribe", async (c) => {
    const body: { investorId?: string; tranche?: TrancheName; unitsIdr?: number } =
      await c.req.json().catch(() => ({}));
    if (!body.investorId) throw new FlowError("unknown_investor", "investorId is required");
    if (body.tranche !== "SENIOR" && body.tranche !== "JUNIOR") {
      throw new FlowError("mandate_excludes_tranche", "tranche must be SENIOR or JUNIOR");
    }
    return c.json(await flow.subscribe(id(c), body.investorId, body.tranche, Number(body.unitsIdr)));
  });

  const built = "./apps/web/dist";
  app.use("/*", serveStatic({ root: built }));
  app.get("*", serveStatic({ path: `${built}/index.html` }));

  return app;
}
