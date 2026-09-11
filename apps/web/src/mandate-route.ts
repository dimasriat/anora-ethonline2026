const ABSENT = /docuseal is not configured|capability_not_available/i;

export function isSigningUnavailable(error: unknown): boolean {
  return error instanceof Error && ABSENT.test(error.message);
}
