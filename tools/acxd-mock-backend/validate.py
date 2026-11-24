#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""Validate the ACXD mock backend before deploy, and print its operation surface.

SHIPPED, FIXED. Run from the mock root:  python3 validate.py
Validates every API folder apis/<apiId>/ (one deployed API each).

Checks, and reports "N operations: X plain-lookup, Y computed":
  - every data/<operation>.json parses as JSON and (unless it has a computed ops/ override)
    contains a "_default" key so plain-lookup always has a fallback,
  - every ops/<operation>.py imports and exposes a callable `handle(params, data)`,
  - each ops/<operation>.py has a matching data/<operation>.json (the override still reads data),
  - the operation ids are camelCase (ACXD naming), matching what the flows call.

Exit code 0 = ready to deploy; non-zero = a problem to fix first (so a 20-operation mock fails
loudly here, not with a runtime 500 mid-demo).
"""
import json
import os
import re
import sys
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
APIS_DIR = os.path.join(HERE, "apis")
API_ID = re.compile(r"^[a-z][a-zA-Z0-9]*Api$")
CAMEL = re.compile(r"^[a-z][a-zA-Z0-9]*$")


def _op_ids(directory, suffix):
    if not os.path.isdir(directory):
        return set()
    return {
        f[: -len(suffix)]
        for f in os.listdir(directory)
        if f.endswith(suffix) and not f.startswith("_") and f != "__init__.py"
    }


def check_api(api_dir):
    DATA_DIR = os.path.join(api_dir, "data")
    OPS_DIR = os.path.join(api_dir, "ops")
    data_ops = _op_ids(DATA_DIR, ".json")
    computed_ops = _op_ids(OPS_DIR, ".py")
    errors, warnings = [], []

    if not data_ops:
        errors.append("no data/*.json files found — the mock serves no operations")

    # Every computed op must have a data file (the override still reads data).
    for op in sorted(computed_ops - data_ops):
        errors.append(f"ops/{op}.py has no matching data/{op}.json")

    # Validate each data file parses (+ _default unless a computed override handles it).
    for op in sorted(data_ops):
        if not CAMEL.match(op):
            errors.append(f"operation id '{op}' is not camelCase (ACXD naming)")
        path = os.path.join(DATA_DIR, f"{op}.json")
        try:
            with open(path, encoding="utf-8") as fh:
                doc = json.load(fh)
        except (ValueError, OSError) as exc:
            errors.append(f"data/{op}.json does not parse: {exc}")
            continue
        if op not in computed_ops and isinstance(doc, dict) and "_default" not in doc:
            warnings.append(f"data/{op}.json (plain-lookup) has no '_default' fallback key")

    # Validate each computed override imports and exposes handle(params, data).
    for op in sorted(computed_ops):
        path = os.path.join(OPS_DIR, f"{op}.py")
        try:
            spec = importlib.util.spec_from_file_location(f"ops.{op}", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            if not callable(getattr(module, "handle", None)):
                errors.append(f"ops/{op}.py must define handle(params, data) -> dict")
        except Exception as exc:
            errors.append(f"ops/{op}.py failed to import: {exc}")

    plain = sorted(data_ops - computed_ops)
    computed = sorted(computed_ops)
    print(f"  {len(data_ops)} operations: {len(plain)} plain-lookup, {len(computed)} computed")
    if plain:
        print("  plain-lookup:", ", ".join(plain))
    if computed:
        print("  computed:    ", ", ".join(computed))
    for w in warnings:
        print(f"  WARNING: {w}")
    for e in errors:
        print(f"  ERROR: {e}")
    return len(errors)


def main():
    apis = sorted(d for d in os.listdir(APIS_DIR) if os.path.isdir(os.path.join(APIS_DIR, d))) \
        if os.path.isdir(APIS_DIR) else []
    if not apis:
        print("VALIDATION FAILED:\n  ERROR: no API folders under apis/ (one apis/<apiId>/ per OpenAPI file)")
        sys.exit(1)
    failed = 0
    for api in apis:
        print(f"\n{api}:")
        if not API_ID.match(api):
            print(f"  ERROR: folder name '{api}' is not an API id (camelCase ending in Api, e.g. authApi)")
            failed += 1
        failed += check_api(os.path.join(APIS_DIR, api))
    if failed:
        print("\nVALIDATION FAILED")
        sys.exit(1)
    print(f"\nOK — {len(apis)} API(s) ready to deploy.")


if __name__ == "__main__":
    main()
