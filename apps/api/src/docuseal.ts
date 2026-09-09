import { createHmac, timingSafeEqual } from "node:crypto";

export type DocuSealSubmission = {
  submissionId: number;
  submitterId: number;
  slug: string;
  url: string;
};

export type DocuSealCreateInput = {
  requestId: string;
  signerName: string;
  signerEmail: string;
  receiptId: string;
  requestedIdr: number;
};

export type DocuSealClient = {
  createSubmission(input: DocuSealCreateInput): Promise<DocuSealSubmission>;
};

type Config = {
  apiKey: string;
  templateId: number;
  webhookSecret: string;
  apiBaseUrl: string;
  signingBaseUrl: string;
  signerRole: string;
};

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function docuSealConfig(env: Record<string, string | undefined>): Config | null {
  const apiKey = env.DOCUSEAL_API_KEY?.trim();
  const webhookSecret = env.DOCUSEAL_WEBHOOK_SECRET?.trim();
  const templateId = Number(env.DOCUSEAL_TEMPLATE_ID);
  if (!apiKey || !webhookSecret || !Number.isSafeInteger(templateId) || templateId <= 0) return null;
  return {
    apiKey,
    webhookSecret,
    templateId,
    apiBaseUrl: (env.DOCUSEAL_API_BASE_URL ?? "https://api.docuseal.com").replace(/\/$/, ""),
    signingBaseUrl: (env.DOCUSEAL_SIGNING_BASE_URL ?? "https://docuseal.com").replace(/\/$/, ""),
    signerRole: env.DOCUSEAL_SIGNER_ROLE?.trim() || "First Party",
  };
}

export function makeDocuSealClient(config: Config, fetcher: Fetcher = fetch): DocuSealClient {
  return {
    async createSubmission(input) {
      const response = await fetcher(`${config.apiBaseUrl}/submissions`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Auth-Token": config.apiKey },
        body: JSON.stringify({
          template_id: config.templateId,
          send_email: false,
          submitters: [{
            role: config.signerRole,
            name: input.signerName,
            email: input.signerEmail,
            external_id: input.requestId,
            metadata: { request_id: input.requestId },
            fields: [
              { name: "Receipt ID", default_value: input.receiptId, readonly: true },
              { name: "Requested financing", default_value: String(input.requestedIdr), readonly: true },
            ],
          }],
        }),
      });
      if (!response.ok) throw new Error(`DocuSeal submission failed (${response.status})`);
      const submitters = await response.json() as { id: number; submission_id: number; slug: string }[];
      const signer = submitters[0];
      if (!signer?.submission_id || !signer.slug) throw new Error("DocuSeal returned no signer URL");
      return {
        submissionId: signer.submission_id,
        submitterId: signer.id,
        slug: signer.slug,
        url: `${config.signingBaseUrl}/s/${signer.slug}`,
      };
    },
  };
}

export function verifyDocuSealWebhook(rawBody: Uint8Array, header: string | undefined, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const [timestamp, supplied] = header.split(".", 2);
  const seconds = Number(timestamp);
  if (!timestamp || !supplied || !Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest();
  let received: Buffer;
  try { received = Buffer.from(supplied, "hex"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export const resolveDocuSeal = (env: Record<string, string | undefined>) => {
  const config = docuSealConfig(env);
  return config ? { client: makeDocuSealClient(config), webhookSecret: config.webhookSecret } : null;
};
