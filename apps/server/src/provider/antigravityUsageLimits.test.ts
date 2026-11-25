import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeAntigravityUsageProbe } from "./antigravityUsageLimits.ts";

describe("makeAntigravityUsageProbe", () => {
  it.effect("returns unsupported without reading tokens or calling internal Google endpoints", () =>
    Effect.gen(function* () {
      const { probe, clear } = yield* makeAntigravityUsageProbe({
        profileDirectory: "/tmp/nonexistent-antigravity-profile",
        authMethod: "oauth-personal",
      });
      const result = yield* probe;
      expect(result.unavailable?.reason).toBe("unsupported");
      expect(result.windows).toEqual([]);
      yield* clear;
    }),
  );
});
