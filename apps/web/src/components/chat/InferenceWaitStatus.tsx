import { useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@f4code/contracts";
import { formatThreadInferenceWait } from "@f4code/client-runtime/state/inference-activity";

import { threadInferenceWaitAtom } from "../../state/inference";

/** "Waiting for rtx · 2 ahead" while F4's gateway holds this thread's request for a busy server. */
export function InferenceWaitStatus({
  threadRef,
  className,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly className?: string;
}) {
  const wait = useAtomValue(
    threadInferenceWaitAtom({
      environmentId: threadRef.environmentId,
      threadId: threadRef.threadId,
    }),
  );
  if (wait === null) return null;
  return (
    <span role="status" className={className}>
      {formatThreadInferenceWait(wait)}
    </span>
  );
}
