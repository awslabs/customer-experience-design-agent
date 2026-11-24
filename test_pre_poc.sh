#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

#
# test_pre_poc.sh - one-command pre-PoC clean and verification for the Customer Experience (CX) Design Agent plugin.
#
# Runs the standard checks we do before seeding a PoC, in order:
#   1. CLEAN   - remove build cruft (node_modules, cdk.out, __pycache__, .DS_Store); lockfiles are kept
#   2. INSTALL - npm ci in the deploy engine (npm install only if no lockfile yet); creates any missing
#                lockfiles for the CDK apps. Existing package-lock.json files are never changed or deleted.
#   3. TSC     - npx tsc --noEmit  (type-check the engine + flow-dsl)
#   4. TESTS   - the flow-dsl roundtrip + spec tests, the engine's `npm test`, the plugin
#                structure tests (bun test tests/plugin.test.ts), and the mock API security
#                tests (tests/acxd-mock-backend/stack.test.ts, run inside the mock CDK app: API key required, usage plan, throttling)
#   5. CLEAN   - remove the cruft again so the source is seed-ready (symlink-free)
#
# The final CLEAN always runs (even if a step fails), so the tree is never left with a
# node_modules that would break the plugin build. The script's EXIT CODE is the result of
# the verification: 0 = all green and cleaned, non-zero = a check failed (details above the
# cleanup banner). Nothing is deployed and no AWS calls are made.
#
# USAGE:
#   ./test_pre_poc.sh                 # clean, verify, clean up; exit 0 only if all passed
#   ./test_pre_poc.sh --keep-modules  # skip the FINAL clean (leave node_modules for debugging)
#
# Run from anywhere; it operates on its own directory (the plugin root).

set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENGINE="$ROOT/tools/acxd-deploy-engine"
TESTS="$ROOT/tests/acxd-deploy-engine"

KEEP_MODULES=0
case "${1:-}" in
  --keep-modules) KEEP_MODULES=1 ;;
  "") ;;
  *) echo "Unknown option: $1" >&2; echo "Usage: $0 [--keep-modules]" >&2; exit 2 ;;
esac

FAILED=0
FAILS=""

banner() { echo; echo "========================================"; echo "$1"; echo "========================================"; }

# clean_cruft: remove node_modules / cdk.out / __pycache__ dirs + lock/.DS_Store files under ROOT.
clean_cruft() {
  find "$ROOT" -type d \( -name node_modules -o -name cdk.out -o -name __pycache__ \) -prune -exec rm -rf {} + 2>/dev/null
  find "$ROOT" -type f -name .DS_Store -delete 2>/dev/null
  echo "Removed node_modules, cdk.out, __pycache__, .DS_Store under the plugin root (package-lock.json files are kept and committed)."
}

# step <label> -- <cmd...>: run <cmd> from the ENGINE dir, print PASS/FAIL, and record any failure.
# The command runs in a subshell (so the cd is scoped), and we read its EXIT CODE in the parent -
# a variable set inside a subshell would NOT propagate, so correctness depends on the exit code here.
step() {
  local label="$1"; shift
  [ "$1" = "--" ] && shift
  echo "--> $label"
  ( cd "$ENGINE" && "$@" )
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "    PASS: $label"
  else
    echo "    FAIL: $label (exit $rc)"
    FAILED=1; FAILS="$FAILS\n  - $label"
  fi
}

banner "ACXD pre-PoC verification"
echo "Plugin root: $ROOT"

banner "1/5  CLEAN (pre)"
clean_cruft

banner "2/5  INSTALL (npm install in the deploy engine)"
if [ -d "$ENGINE" ]; then
  if [ -f "$ENGINE/package-lock.json" ]; then
    step "npm ci (lockfile kept as-is)" -- npm ci
  else
    step "npm install (creates package-lock.json)" -- npm install
  fi
  # Make sure every package has a committed lockfile; create only the missing ones (never rewrites existing).
  # A full install (scripts off) is used: --package-lock-only is refused by npm's remote-fetch guard (EALLOWREMOTE).
  # The node_modules it creates is removed by the final CLEAN.
  for PKG in tools/acxd-mock-backend/cdk tools/acxd-connect-backend/cdk tools/acxd-adapter-backend/cdk; do
    if [ ! -f "$ROOT/$PKG/package-lock.json" ]; then
      echo "--> creating lockfile for $PKG"
      if ( cd "$ROOT/$PKG" && npm install --ignore-scripts --no-audit --no-fund ); then
        echo "    PASS: lockfile for $PKG"
      else
        echo "    FAIL: lockfile for $PKG"; FAILED=1; FAILS="$FAILS\n  - lockfile for $PKG"
      fi
    fi
  done
else
  echo "    FAIL: engine dir not found at $ENGINE"; FAILED=1
fi

# Only attempt the compile/test steps if install left a node_modules to resolve against.
if [ -d "$ENGINE/node_modules" ]; then
  banner "3/5  TSC (npx tsc --noEmit)"
  step "tsc --noEmit" -- npx tsc --noEmit

  banner "4/5  TESTS (flow-dsl roundtrip + spec, npm test, plugin structure, mock API security)"
  step "flow-dsl roundtrip.test.ts" -- npx --yes tsx "$TESTS/flow-dsl/roundtrip.test.ts"
  step "flow-dsl spec.test.ts"      -- npx --yes tsx "$TESTS/flow-dsl/spec.test.ts"
  step "npm test"                   -- npm test
  step "plugin structure tests"     -- bun test "$ROOT/tests/plugin.test.ts"
  echo "--> mock handler security tests"
  if python3 "$ROOT/tests/acxd-mock-backend/test_handler_security.py"; then echo "    PASS: mock handler security tests"; else echo "    FAIL: mock handler security tests"; FAILED=1; FAILS="$FAILS\n  - mock handler security tests"; fi
  MOCK_CDK="$ROOT/tools/acxd-mock-backend/cdk"
  echo "--> mock API security tests (npm install + stack.test.ts)"
  cp "$ROOT/tests/acxd-mock-backend/stack.test.ts" "$MOCK_CDK/stack.test.ts"
  if ( cd "$MOCK_CDK" && npm ci --silent && npx --yes tsx stack.test.ts ); then echo "    PASS: mock API security tests"; else echo "    FAIL: mock API security tests"; FAILED=1; FAILS="$FAILS\n  - mock API security tests"; fi
  rm -f "$MOCK_CDK/stack.test.ts"
else
  banner "3-4/5  SKIPPED"
  echo "    npm install did not produce node_modules; skipping tsc + tests."
  FAILED=1
fi

if [ "$KEEP_MODULES" -eq 1 ]; then
  banner "5/5  CLEAN (post) - SKIPPED (--keep-modules)"
  echo "Left node_modules / build output in place for debugging."
else
  banner "5/5  CLEAN (post)"
  clean_cruft
fi

banner "RESULT"
if [ "$FAILED" -eq 0 ]; then
  echo "ALL CHECKS PASSED. The plugin source is verified and seed-ready."
  exit 0
else
  echo "ONE OR MORE CHECKS FAILED:"
  printf "%b\n" "$FAILS"
  echo "Review the FAIL lines above before seeding."
  echo "(Re-run with --keep-modules to inspect the build output.)"
  exit 1
fi
