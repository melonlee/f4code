import type { AntigravitySettings } from "@f4code/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { makeUnavailableUsageLimits } from "@f4code/provider-core/server/usageLimits";

/**
 * Antigravity usage-limit probing via undocumented Google `v1internal` Cloud Code endpoints
 * (using extracted OS keyring / local OAuth tokens and a spoofed `antigravity/hub` User-Agent)
 * has been removed to stay strictly within Google's official `agy acp` interface and Terms of Service.
 */
export const makeAntigravityUsageProbe = Effect.fn("makeAntigravityUsageProbe")(function* (_input: {
  readonly profileDirectory: string;
  readonly authMethod: AntigravitySettings["authMethod"];
  readonly readKeyringSecret?: Effect.Effect<string | undefined, unknown>;
}) {
  const probe = Effect.gen(function* () {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    return makeUnavailableUsageLimits({
      checkedAt,
      reason: "unsupported",
      message:
        "Antigravity usage-limit probing is disabled in F4code to avoid calling undocumented internal Google APIs.",
    });
  });

  return {
    probe,
    clear: Effect.void,
  };
});
