export function identityIsSimulated(env: Record<string, string | undefined>): boolean {
  if (env.ADAPTER_IDENTITY === "demo") return true;
  return !env.PRIVY_APP_ID;
}
