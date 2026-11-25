import {
  connectionErrorText,
  connectionSecurityBadge,
  connectionSecurityBadgeText,
  connectionStatusText,
  type EnvironmentConnectionPhase,
  type EnvironmentConnectionPresentation,
} from "@f4code/client-runtime/connection";
import {
  BearerConnectionTarget,
  PrimaryConnectionTarget,
} from "@f4code/client-runtime/connection";
import * as Option from "effect/Option";
import type { MarkedText } from "@f4code/client-runtime/errors";

import { m, type MessageResolver } from "../../i18n/messages";

/** Connection error text from runtime state, in the current language when the error is marked. */
export function runtimeConnectionErrorText(
  state: { readonly connectionError: string | null; readonly i18nConnectionError?: MarkedText },
  resolve: MessageResolver = m,
): string | null {
  return connectionErrorText(
    {
      error: state.connectionError,
      ...(state.i18nConnectionError === undefined ? {} : { i18nError: state.i18nConnectionError }),
    },
    resolve,
  );
}

export function environmentStatusText(
  connection: EnvironmentConnectionPresentation,
  resolve: MessageResolver = m,
): string {
  const error = connectionErrorText(connection, resolve);
  return connection.phase === "unsupported" && error !== null
    ? error
    : connectionStatusText(connection, resolve);
}

/**
 * Transport-level security badge for a connected environment. Mobile summaries
 * carry no route profiles, so the app-layer E2EE badge is web-only; the
 * transport badge still says whether the stream is protected in transit.
 */
export function connectionSecuritySummaryText(
  input: {
    readonly connectionState: EnvironmentConnectionPhase;
    readonly isRelayManaged: boolean;
    readonly displayUrl: string;
  },
  resolve: MessageResolver = m,
): string | null {
  if (input.connectionState !== "connected") return null;
  const target = input.isRelayManaged
    ? null
    : input.displayUrl.startsWith("ws") || input.displayUrl.startsWith("http")
      ? new PrimaryConnectionTarget({
          environmentId: "mobile" as never,
          label: "",
          httpBaseUrl: input.displayUrl.replace(/^ws/, "http"),
          wsBaseUrl: input.displayUrl,
        })
      : new BearerConnectionTarget({
          environmentId: "mobile" as never,
          label: "",
          connectionId: "",
        });
  if (target === null) return connectionSecurityBadgeText({ kind: "tls-tunnel" }, resolve);
  const badge = connectionSecurityBadge({
    entry: { target, profile: Option.none(), enabled: true },
    connectedTarget: null,
  });
  return badge === null ? null : connectionSecurityBadgeText(badge, resolve);
}
