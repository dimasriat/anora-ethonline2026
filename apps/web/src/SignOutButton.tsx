import { useLogout } from "@privy-io/react-auth";
import { useIdentityStanding } from "./identity";

function PrivySignOut() {
  const { logout } = useLogout();
  return <button type="button" onClick={() => logout()}>Sign out</button>;
}

/** useLogout needs its provider, which only exists when Privy is live. */
export default function SignOutButton() {
  const standing = useIdentityStanding();
  if (standing.label === "Simulated") return null;
  return <PrivySignOut />;
}
