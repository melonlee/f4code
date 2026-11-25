import type { ReactNode } from "react";

import { deactivateCloudRelayAccount } from "./cloudAccountService";

// Clerk has been removed from this fork; drop any persisted cloud registration.
deactivateCloudRelayAccount();

export function useCloudAuth(_options?: { readonly treatPendingAsSignedOut?: boolean }) {
  return {
    isLoaded: true as const,
    isSignedIn: false as const,
    userId: null as string | null,
    getToken: async (_options?: unknown): Promise<string | null> => null,
  };
}

export function useCloudUser() {
  return {
    isLoaded: true as const,
    isSignedIn: false as const,
    user: null as {
      readonly primaryEmailAddress?: { readonly emailAddress?: string } | null;
      readonly fullName?: string | null;
      readonly username?: string | null;
      readonly imageUrl?: string | null;
    } | null,
  };
}

export function CloudAuthProvider(props: { readonly children: ReactNode }) {
  return props.children;
}
