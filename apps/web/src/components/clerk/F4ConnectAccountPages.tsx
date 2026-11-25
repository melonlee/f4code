import type { ReactNode } from "react";

export type F4ConnectAccountPageUrl = "mobile-clients" | "f4-connect" | "f4-chat";

export function useF4ConnectAccountPage(): {
  readonly open: ((page?: F4ConnectAccountPageUrl) => void) | null;
  readonly portals: ReactNode;
} {
  return { open: null, portals: null };
}
