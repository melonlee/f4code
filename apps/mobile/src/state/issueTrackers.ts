import { createIssueTrackerEnvironmentAtoms } from "@f4code/client-runtime/state/issue-trackers";

import { connectionAtomRuntime } from "../connection/runtime";

export const issueTrackerEnvironment = createIssueTrackerEnvironmentAtoms(connectionAtomRuntime);
