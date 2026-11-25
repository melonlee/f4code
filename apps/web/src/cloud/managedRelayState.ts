import { useAtomValue } from "@effect/atom-react";
import {
  createManagedRelayQueryManager,
  ManagedRelay,
  managedRelaySessionAtom,
  readManagedRelaySnapshotState,
} from "@f4code/client-runtime/relay";
import {
  DEFAULT_MANAGED_TUNNEL_LIMIT,
  F4CHAT_PLAN_TUNNEL_LIMITS,
  type RelayClientEnvironmentRecord,
  type RelayF4ChatLinkResponse,
} from "@f4code/contracts/relay";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AsyncResult, Atom } from "effect/reactivity";

import { runtime } from "../lib/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";

const managedRelayAtomRuntime = Atom.runtime(
  Layer.effect(
    ManagedRelay.ManagedRelayClient,
    runtime.contextEffect.pipe(
      Effect.map((context) => Context.get(context, ManagedRelay.ManagedRelayClient)),
    ),
  ),
);

const managedRelayQueryManager = createManagedRelayQueryManager(managedRelayAtomRuntime);

const EMPTY_F4CHAT_LINK_ATOM = Atom.make(
  AsyncResult.success<RelayF4ChatLinkResponse>({ available: false, link: null }),
).pipe(Atom.keepAlive, Atom.withLabel("managed-relay:web:f4chat-link:null"));

function useManagedRelayF4ChatLink() {
  const session = useAtomValue(managedRelaySessionAtom);
  const accountId = session?.accountId ?? null;
  const atom = accountId
    ? managedRelayQueryManager.f4ChatLinkAtom(accountId)
    : EMPTY_F4CHAT_LINK_ATOM;
  const snapshot = readManagedRelaySnapshotState(useAtomValue(atom));
  const refresh = () => {
    if (accountId) {
      managedRelayQueryManager.refreshF4ChatLink(appAtomRegistry, accountId);
    }
  };

  return { ...snapshot, accountId, refresh };
}

const EMPTY_ENVIRONMENTS_ATOM = Atom.make(
  AsyncResult.success<ReadonlyArray<RelayClientEnvironmentRecord>>([]),
).pipe(Atom.keepAlive, Atom.withLabel("managed-relay:web:environments:null"));

function useManagedRelayEnvironments() {
  const session = useAtomValue(managedRelaySessionAtom);
  const accountId = session?.accountId ?? null;
  const atom = accountId
    ? managedRelayQueryManager.environmentsAtom(accountId)
    : EMPTY_ENVIRONMENTS_ATOM;
  const result = useAtomValue(atom);
  const snapshot = readManagedRelaySnapshotState(result);
  const refresh = () => {
    if (accountId) {
      managedRelayQueryManager.refreshEnvironments(appAtomRegistry, accountId);
    }
  };

  return {
    ...snapshot,
    accountId,
    refresh,
  };
}

/** How this account can raise its tunnel cap: link F4 Chat, or upgrade the linked plan. */
export type ManagedTunnelUpgrade = "link" | "pro" | "premier" | null;

// Mirrors the relay's cap: a manual override is exact, otherwise the F4 Chat plan raises the default.
function managedTunnelCap(f4Chat: RelayF4ChatLinkResponse): {
  readonly limit: number;
  readonly upgrade: ManagedTunnelUpgrade;
} {
  if (f4Chat.maxTunnelsOverride !== undefined) {
    return { limit: f4Chat.maxTunnelsOverride, upgrade: null };
  }
  if (!f4Chat.available) return { limit: DEFAULT_MANAGED_TUNNEL_LIMIT, upgrade: null };
  switch (f4Chat.link?.plan) {
    case "premier":
      return { limit: F4CHAT_PLAN_TUNNEL_LIMITS.premier, upgrade: null };
    case "pro":
      return { limit: F4CHAT_PLAN_TUNNEL_LIMITS.pro, upgrade: "premier" };
    case "free":
      return { limit: DEFAULT_MANAGED_TUNNEL_LIMIT, upgrade: "pro" };
    case undefined:
      return { limit: DEFAULT_MANAGED_TUNNEL_LIMIT, upgrade: "link" };
  }
}

/** Refetches the account's environments and F4 Chat plan after a tunnel changes. */
export function refreshManagedTunnelUsage() {
  const accountId = appAtomRegistry.get(managedRelaySessionAtom)?.accountId;
  if (!accountId) return;
  managedRelayQueryManager.refreshEnvironments(appAtomRegistry, accountId);
  managedRelayQueryManager.refreshF4ChatLink(appAtomRegistry, accountId);
}

/** Managed tunnels on this account and its cap. Null fields are still loading or failed. */
export function useManagedTunnelUsage() {
  const environments = useManagedRelayEnvironments();
  const f4Chat = useManagedRelayF4ChatLink();
  const used =
    environments.accountId === null
      ? null
      : (environments.data?.filter(
          (environment) => environment.endpoint.providerKind === "cloudflare_tunnel",
        ).length ?? null);
  const cap = f4Chat.accountId !== null && f4Chat.data ? managedTunnelCap(f4Chat.data) : null;
  return {
    used,
    limit: cap?.limit ?? null,
    upgrade: cap?.upgrade ?? null,
    refresh: refreshManagedTunnelUsage,
  };
}
