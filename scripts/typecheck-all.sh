#!/usr/bin/env bash
# Typechecks every package one at a time. `vp run typecheck` runs them in parallel and gets
# OOM-killed on small runners, and it skips the apps. Prints the errors and fails if any.
set -u
cd "$(git rev-parse --show-toplevel)"
bad=0
for d in apps/* infra/* evals scripts packages/*; do
  [ -f "$d/tsconfig.json" ] || continue
  out=$(cd "$d" && vp exec effect-tsgo tsrs --noEmit 2>&1 | grep -v TS377141 | grep -E ' error |error TS')
  if [ -n "$out" ]; then echo "== $d"; echo "$out" | head -20 | cut -c1-240; bad=1; fi
done
exit $bad
