import { assert, it } from "@effect/vitest";

import {
  repositoryPathFromRemoteUrl,
  transportSafeSourceControlErrorValue,
} from "./SourceControlProvider.ts";

it("removes URL credentials, query parameters, and fragments from error transport values", () => {
  assert.strictEqual(
    transportSafeSourceControlErrorValue(
      "https://user:secret@example.test/org/repo/pull/42?token=secret#discussion",
    ),
    "https://example.test/org/repo/pull/42",
  );
});

it.each([
  ["git@github.com:F4Tools/f4code.git", "F4Tools/f4code"],
  ["github.com:F4Tools/f4code.git", "F4Tools/f4code"],
  ["gitlab.com:F4Tools/platform/f4code", "F4Tools/platform/f4code"],
  ["https://github.com/F4Tools/f4code.git", "F4Tools/f4code"],
  ["https://github.com/F4Tools/f4code.git?view=compact", "F4Tools/f4code"],
  ["https://github.com/F4Tools/f4code.git#section", "F4Tools/f4code"],
  ["C:/repos/f4code", null],
])("reads the repository path of %s", (remoteUrl, expected) => {
  assert.strictEqual(repositoryPathFromRemoteUrl(remoteUrl), expected);
});
