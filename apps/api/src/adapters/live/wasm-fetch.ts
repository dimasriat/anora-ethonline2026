import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * IDKit loads its WebAssembly by fetching a file:// URL built from
 * import.meta.url, and it does so while the module is being imported. Bun's
 * fetch resolves that scheme; Node's refuses it, so the check died with
 * "fetch failed" the moment the runtime changed.
 *
 * This module must be imported before IDKit for the patch to be in place.
 */
const original = globalThis.fetch;

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const href = typeof input === "string"
    ? input
    : input instanceof URL ? input.href : (input as Request).url;

  if (!href.startsWith("file://")) return original(input, init);

  return new Response(await readFile(fileURLToPath(href)), {
    headers: { "content-type": "application/wasm" },
  });
}) as typeof fetch;
