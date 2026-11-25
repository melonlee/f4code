import {
  threadRuntimeCanArchive,
  type ThreadRuntimeSummary,
} from "@f4code/client-runtime/state/models";

export function threadCanArchive(runtime: ThreadRuntimeSummary | null | undefined): boolean {
  return threadRuntimeCanArchive(runtime);
}
