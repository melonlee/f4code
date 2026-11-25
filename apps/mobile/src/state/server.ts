import { createInferenceAtoms } from "@f4code/client-runtime/state/inference";
import { makeLocalUsageModelsAtom } from "@f4code/client-runtime/state/provider-instance-display";
import { createServerEnvironmentAtoms } from "@f4code/client-runtime/state/server";
import {
  createOutdatedServerDescriptionCommand,
  createOutdatedServerUpdateCommand,
} from "@f4code/client-runtime/state/outdatedServerUpdate";
import { createEnvironmentServerConfigsAtom } from "@f4code/client-runtime/state/shell";

import { environmentCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentSession } from "./session";

export const serverEnvironment = createServerEnvironmentAtoms(connectionAtomRuntime, {
  initialConfigValueAtom: environmentSession.initialConfigValueAtom,
  usageLimitSources: true,
  usageLimitsCommand: true,
  providerCatalogsOnDemand: true,
  providerCatalogDigests: true,
  providerStatusDeltas: true,
  omitRefreshedProviders: true,
});
export const localUsageModelsAtom = makeLocalUsageModelsAtom(serverEnvironment);
export const inferenceAtoms = createInferenceAtoms(serverEnvironment);
export const describeOutdatedServer = createOutdatedServerDescriptionCommand(connectionAtomRuntime);
export const updateOutdatedServer = createOutdatedServerUpdateCommand(connectionAtomRuntime);
export const environmentServerConfigsAtom = createEnvironmentServerConfigsAtom({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  serverConfigValueAtom: serverEnvironment.configValueAtom,
});
