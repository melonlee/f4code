import type { PullRequestChangeBreakdown } from "@f4code/contracts";
import { summarizeChangedFiles } from "@f4code/shared/changedFileKind";
import type { ProviderFileStats } from "@f4code/source-control-core/server/PullRequestProvider";

export function toChangeBreakdown(stats: ProviderFileStats): PullRequestChangeBreakdown {
  if (stats.truncated) return null;
  return summarizeChangedFiles(stats.files);
}
