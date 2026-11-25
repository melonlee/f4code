import {
  AuthRelayReadScope,
  AuthRelayWriteScope,
  type EnvironmentId,
  managedCapabilityDenial,
} from "@f4code/contracts";

import { useManagedPolicy } from "../state/managedPolicy";
import { useEnvironmentCanConfigureRelay, useEnvironmentScope } from "../state/session";
import { useCloudLinkState } from "./cloudLinkState";
import { hasCloudPublicConfig } from "./publicConfig";
import { resolveF4ConnectTurnOn } from "./f4ConnectState";

/** Whether this client can turn on F4 Connect for `environmentId`, and if not, why. */
export function useF4ConnectTurnOn(environmentId: EnvironmentId | null) {
  const canReadRelay = useEnvironmentScope(environmentId, AuthRelayReadScope);
  const canWriteRelay = useEnvironmentScope(environmentId, AuthRelayWriteScope);
  const canConfigureRelay = useEnvironmentCanConfigureRelay(environmentId);
  const connectDenial = managedCapabilityDenial(useManagedPolicy(environmentId), "connect");
  const linkState = useCloudLinkState(environmentId).data;
  return resolveF4ConnectTurnOn({
    // Unknown while loading and on older servers, which keep today's switch in Settings.
    linkableHere: linkState?.linkableHere ?? true,
    cloudConfigured: hasCloudPublicConfig(),
    canReadRelay,
    canWriteRelay: canWriteRelay && canConfigureRelay,
    connectDenial,
  });
}
