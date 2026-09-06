import { makeApp } from "./app";
import { resolvePorts } from "./ports";

const port = Number(process.env.PORT ?? 3333);
console.log(`anora listening on 127.0.0.1:${port}`);

export default { port, hostname: "127.0.0.1", fetch: makeApp(resolvePorts()).fetch };
