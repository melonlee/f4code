import { createInferenceAtoms } from "@f4code/client-runtime/state/inference";
import { makeLocalUsageModelsAtom } from "@f4code/client-runtime/state/provider-instance-display";

import { serverEnvironment } from "./server";

export const {
  threadInferenceWaitAtom,
  hasInferenceServersAtom,
  environmentsWithInferenceServersAtom,
  hasEnabledInferenceServerAtom,
  inferenceUsageAtom,
  threadInferenceRequestAtom,
  threadInferenceStopAtom,
} = createInferenceAtoms(serverEnvironment);

/** Local models and the ones priced by the user, across the environments (ids as a JSON array). */
export const localUsageModelsAtom = makeLocalUsageModelsAtom(serverEnvironment);
