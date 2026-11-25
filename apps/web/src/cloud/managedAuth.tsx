import { setManagedRelaySession } from "@f4code/client-runtime/relay";
import type { ReactNode } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";

export function deactivateManagedRelayAuthentication(): void {
  setManagedRelaySession(appAtomRegistry, null);
}

export function activateManagedRelayAuthentication(
  accountId: string,
  readClerkToken: () => Promise<string | null>,
): void {
  setManagedRelaySession(appAtomRegistry, {
    accountId,
    readClerkToken,
  });
}

/** Clerk has been removed from this fork; cloud auth is permanently signed out. */
export function useCloudAuth(_options?: { readonly treatPendingAsSignedOut?: boolean }) {
  return {
    isLoaded: true as const,
    isSignedIn: false as const,
    userId: null as string | null,
    getToken: async (_options?: unknown): Promise<string | null> => null,
  };
}

export function useCloudClient() {
  return {
    status: "ready" as const,
    session: null,
    openSignIn: (_props?: unknown) => {},
    signOut: async (_options?: unknown) => {},
    openUserProfile: (_props?: unknown) => {},
  };
}

export function ManagedRelayAuthProvider({ children }: { readonly children: ReactNode }) {
  return children;
}
