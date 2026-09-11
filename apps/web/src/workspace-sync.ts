import type { Flow, IntakeView } from "./api";

type WorkspaceFeeds = {
  requests: () => Promise<Flow[]>;
  intake: () => Promise<IntakeView>;
};

export type WorkspaceSync = {
  flow: Flow | null;
  intake: IntakeView | null;
  error: string | null;
};

const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Could not load the shared record.";

export async function syncWorkspace(feeds: WorkspaceFeeds): Promise<WorkspaceSync> {
  const [requests, intake] = await Promise.allSettled([feeds.requests(), feeds.intake()]);

  if (intake.status === "rejected") {
    return { flow: null, intake: null, error: message(intake.reason) };
  }

  return {
    flow: requests.status === "fulfilled" ? requests.value.at(-1) ?? null : null,
    intake: intake.value,
    error: null,
  };
}
