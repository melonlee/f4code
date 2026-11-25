#!/usr/bin/env bash
# Checks that what this fork added is still there and what it removed has not come back.
# Run after merging upstream. Edit the lists below when the fork changes.
set -u
cd "$(git rev-parse --show-toplevel)"
bad=0

# Fork-only paths that must keep existing.
required=(
  MIA_CHANGELOG.md
  packages/provider-omp
  packages/provider-noname
  apps/server/src/inference
  apps/server/src/inference/InferenceGateway.ts
)
for p in "${required[@]}"; do
  if [ -z "$(git ls-files -- "$p")" ]; then echo "Missing fork path: $p"; bad=1; fi
done

# Telemetry removed by this fork must not return.
pkgs='@clerk/|@sentry/|posthog|@opentelemetry/|@effect/opentelemetry'
hits=$(git ls-files -- 'package.json' '**/package.json' 'pnpm-workspace.yaml' ':!:.repos/**' | xargs grep -nE "\"?($pkgs)" 2>/dev/null)
if [ -n "$hits" ]; then echo "Telemetry dependencies present:"; echo "$hits"; bad=1; fi
files=$(git ls-files -- 'packages/shared/src/observability.ts' 'packages/shared/src/otelEnvironment.ts' 'packages/shared/src/telemetryId.ts')
if [ -n "$files" ]; then echo "Telemetry modules present:"; echo "$files"; bad=1; fi

exit $bad
