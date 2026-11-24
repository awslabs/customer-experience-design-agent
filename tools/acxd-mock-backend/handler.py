# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""ACXD deployed-mock backend — fixed handler CORE (Python 3.12).

SHIPPED, FIXED FILE. Do not edit per engagement. One Lambda behind API Gateway
routes on the /{operation} path parameter (at the API Gateway stage root) and returns a flat, bare value
object per the ACXD data-request contract:

  - request values are read from the JSON body (preferred for mocks) and the URL query string, merged (body wins);
    nested body objects/arrays are passed through to the op unchanged,
  - responses are top-level fields only (no envelope, no nesting the flow can't read),
  - business-logic failures return HTTP 200 with a boolean flag,
  - non-200 is reserved for real system errors (the ACXD Failure/Timeout edge).

Per-engagement variability lives in TWO places per API (apis/<apiId>/) the agent authors — never in this file:

  1. data/<operation>.json   — the canned response data for each operation.
  2. ops/<operation>.py       — OPTIONAL. A computed operation drops a module here
                                exposing `handle(params, data) -> dict`. If present,
                                the core calls it; if absent, the core serves the
                                operation by PLAIN LOOKUP from data/<operation>.json.

Plain-lookup contract (no ops/ file): the operation returns
data[key(params)] or data["_default"], where the lookup key is the first present
of the request params (or "_default"). This covers the common "match a key, return
its JSON" mock with zero code.

Naming: the {operation} path segment, the data/<operation>.json filename, and the
ops/<operation>.py module name all share the SAME operation id (camelCase).
"""
import json
import logging
import os
import re
import importlib.util

log = logging.getLogger()
log.setLevel(logging.INFO)

_HERE = os.path.dirname(__file__)
# Each API has its own folder (apis/<apiId>/data, apis/<apiId>/ops) and its own Lambda; the stack sets
# MOCK_API_DIR to that folder. Unset (tests, local runs) = the handler's own folder.
_API_DIR = os.path.join(_HERE, os.environ.get("MOCK_API_DIR", ""))
DATA_DIR = os.path.join(_API_DIR, "data")
OPS_DIR = os.path.join(_API_DIR, "ops")


# --- shared helpers exposed to per-op modules ----------------------------

def key(value):
    """Canonical lookup key: upper-cased with all non-alphanumerics removed.

    This makes mock lookups tolerant of punctuation/spacing differences between what a
    caller supplies and how the data file is keyed — e.g. "CUST-1001", "CUS1001", and
    "cust 1001" all canonicalise to "CUST1001". A mock exists to validate the flow, not to
    enforce a real system's ID format, so matching is deliberately forgiving. The SAME
    canonicalisation is applied to the data-file keys in _plain_lookup, so both sides agree.
    """
    return re.sub(r"[^A-Za-z0-9]", "", (value or "")).upper()


def money(value):
    """Format a number as a currency string, e.g. 1234.5 -> '$1,234.50'."""
    return "${:,.2f}".format(float(value))


def truthy(value):
    return str(value).strip().lower() in ("true", "1", "yes")


# --- request / response plumbing (fixed) ---------------------------------

def _params(event):
    """Request values from the JSON body and the URL query string, merged.

    The JSON body is the preferred channel for mocked operations (POST writes, sensitive values such as a PIN);
    query-string values are also read, so GET lookups and URL {placeholders} work too. When a name appears in
    both, the body wins. Nested body objects/arrays are passed through unchanged (an op reads them as nested
    dicts/lists); only top-level None values are normalised to "".
    """
    body = {}
    raw = event.get("body")
    if raw:
        if event.get("isBase64Encoded"):
            import base64
            try:
                raw = base64.b64decode(raw).decode("utf-8")
            except (ValueError, TypeError):
                raw = ""
        try:
            parsed = json.loads(raw) if raw else {}
            body = parsed if isinstance(parsed, dict) else {}
        except (ValueError, TypeError):
            body = {}
    qs = event.get("queryStringParameters") or {}
    merged = {**qs, **body}
    return {k: ("" if v is None else v) for k, v in merged.items()}


# Field names whose values are never written to logs (matched case-insensitively as substrings).
_SENSITIVE = ("pin", "password", "passcode", "otp", "secret", "token", "cvv", "dob")
_OPERATION_RE = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,63}$")


def _redact(value):
    """Copy of value with sensitive field values replaced by '***' (recurses into dicts and lists)."""
    if isinstance(value, dict):
        return {k: ("***" if any(s in str(k).lower() for s in _SENSITIVE) else _redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def _resp(obj, status=200):
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(obj)}


def _load_data(operation):
    with open(os.path.join(DATA_DIR, f"{operation}.json"), "r", encoding="utf-8") as fh:
        return json.load(fh)


def _load_op_override(operation):
    """Return the ops/<operation>.py `handle` callable if that module exists, else None."""
    path = os.path.join(OPS_DIR, f"{operation}.py")
    if not os.path.isfile(path):
        return None
    spec = importlib.util.spec_from_file_location(f"ops.{operation}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fn = getattr(module, "handle", None)
    if not callable(fn):
        raise RuntimeError(f"ops/{operation}.py must define handle(params, data) -> dict")
    return fn


def _plain_lookup(params, data):
    """Default behaviour when no ops/<operation>.py exists: match the first present
    param value as the key; fall back to data['_default'].

    Matching is canonical on BOTH sides via key(): the incoming param value and each data
    key are reduced to upper-case alphanumerics before comparison, so punctuation/spacing
    differences (CUST-1001 vs CUS1001) never cause a spurious miss. An exact key hit is
    tried first (cheap), then the canonical map."""
    # Canonical map of the data file's own keys (skip the _default sentinel and _comment).
    canon = {key(dk): dk for dk in data if dk not in ("_default", "_comment")}
    for v in params.values():
        k = key(v)
        if not k:
            continue
        if k in data:            # exact (already-canonical) key hit
            return data[k]
        if k in canon:           # canonical match against a differently-punctuated data key
            return data[canon[k]]
    return data.get("_default", {})


def lambda_handler(event, context=None):
    operation = (event.get("pathParameters") or {}).get("operation", "")
    # REQUEST LOG: the operation path called + the caller's params (query string / body).
    params = _params(event)
    log.info("ACXD-MOCK request: operation=%s params=%s", operation or "(none)", json.dumps(_redact(params)))
    if not operation:
        return _resp({"error": "NO_OPERATION", "message": "missing {operation} path segment"}, status=400)
    if not _OPERATION_RE.match(operation):
        return _resp({"error": "BAD_OPERATION", "message": "operation must be a camelCase id"}, status=400)

    # Data file is required for every operation (both plain-lookup and computed read it).
    try:
        data = _load_data(operation)
    except FileNotFoundError:
        return _resp({"error": "NO_DATA", "message": f"no data/{operation}.json for '{operation}'"}, status=404)

    try:
        override = _load_op_override(operation)
        result = override(params, data) if override else _plain_lookup(params, data)
    except Exception:  # a computed op raising is a real system error -> non-200; detail stays in the logs
        log.exception("ACXD-MOCK error: operation=%s", operation)
        return _resp({"error": "OP_ERROR", "message": "operation failed"}, status=500)
    # RESPONSE LOG: the response JSON payload returned to ACXD.
    log.info("ACXD-MOCK response: operation=%s payload=%s", operation, json.dumps(_redact(result)))
    return _resp(result)
