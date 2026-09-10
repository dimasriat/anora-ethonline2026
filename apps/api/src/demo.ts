process.env.ADAPTER_PROOF = "demo";

const { default: server } = await import("./index");

export default server;
