import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3333);
console.log(`anora listening on 127.0.0.1:${port}`);

export default { port, hostname: "127.0.0.1", fetch: app.fetch };
