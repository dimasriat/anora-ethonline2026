/* The local demo entry point: every gate that needs a credential we cannot
   issue offline stands in, so the whole lifecycle is walkable. `dev:api` and
   `start` keep the real gates. */
process.env.ADAPTER_PROOF = "demo";
process.env.ADAPTER_ELIGIBILITY = "demo";

const { default: server } = await import("./index");

export default server;
