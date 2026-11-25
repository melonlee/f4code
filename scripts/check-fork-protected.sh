#!/usr/bin/env bash
# Usage: check-fork-protected.sh <base-ref>
# Fails if any file listed in scripts/fork-protected.txt (files only this fork has)
# differs between <base-ref> and the working tree. Append new fork-only files to the list.
set -u
cd "$(git rev-parse --show-toplevel)"
base=${1:?base ref required}
bad=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if ! git cat-file -e "$base:$f" 2>/dev/null; then continue; fi
  if [ ! -e "$f" ] || ! diff -q <(git show "$base:$f") "$f" >/dev/null 2>&1; then
    echo "Fork file changed or removed: $f"; bad=1
  fi
done < scripts/fork-protected.txt
exit $bad
