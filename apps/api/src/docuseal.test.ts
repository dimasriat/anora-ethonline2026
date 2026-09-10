import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { docuSealConfig, makeDocuSealClient, verifyDocuSealWebhook } from "./docuseal";

describe("DocuSeal", () => {
  test("creates an individual Cloud signing URL", async () => {
    const config = docuSealConfig({ DOCUSEAL_API_KEY: "key", DOCUSEAL_WEBHOOK_SECRET: "secret", DOCUSEAL_TEMPLATE_ID: "42" })!;
    const client = makeDocuSealClient(config, async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.template_id).toBe(42);
      expect(payload.submitters[0].external_id).toBe("REQ-1");
      expect(payload.submitters[0].email).toBeUndefined();
      expect(payload.submitters[0].name).toBeUndefined();
      return Response.json([{ id: 7, submission_id: 9, slug: "signer-slug" }]);
    });
    const result = await client.createSubmission({ requestId: "REQ-1", receiptId: "SRG-1", requestedIdr: 100 });
    expect(result).toEqual({ submissionId: 9, submitterId: 7, slug: "signer-slug", url: "https://docuseal.com/s/signer-slug" });
  });

  test("accepts only fresh signatures over the exact body", () => {
    const now = 1_800_000_000_000;
    const timestamp = String(now / 1000);
    const body = new TextEncoder().encode('{"event_type":"submission.completed"}');
    const digest = createHmac("sha256", "secret").update(`${timestamp}.`).update(body).digest("hex");
    expect(verifyDocuSealWebhook(body, `${timestamp}.${digest}`, "secret", now)).toBe(true);
    expect(verifyDocuSealWebhook(new TextEncoder().encode("{}"), `${timestamp}.${digest}`, "secret", now)).toBe(false);
    expect(verifyDocuSealWebhook(body, `${timestamp}.${digest}`, "secret", now + 301_000)).toBe(false);
  });
});
