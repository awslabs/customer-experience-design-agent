# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""
ACXD Lambda Handler Template — Integration Adapter

This handler is a STATELESS integration adapter: it receives the ACXD request (JSON body and/or URL params),
calls the customer's EXTERNAL system of record (CRM, core banking, IdP, etc.), and
flattens that system's response to the ACXD data request contract. There is NO local
data store by default — the customer's system holds the data.

AGENT CUSTOMISATION:
  - Copy this file per operation: verify-identity/, check-balance/, etc.
  - Implement the upstream call in the business-logic function (auth + flatten)
  - Follow the ACXD data request contract strictly:
      Request:  JSON body and/or URL params as the data request defines (nested body objects allowed)
      Response: bare value object (no resolvedVariables envelope)
      Errors:   HTTP 200 for business failures; 5xx only for infrastructure errors

Provenance: [VERIFIED] — ACXD data request contract; integration-adapter pattern.
"""

import json
import os
import logging
from decimal import Decimal
from typing import Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables set by CDK stack
ENVIRONMENT = os.environ.get("ENVIRONMENT", "dev")

# The adapter is stateless — it calls an upstream system, it does not own data.
# Read the upstream base URL / credential from env or Secrets Manager. Secret names follow the fixed
# schema acxd/<PROJECT_NAME>/<ENVIRONMENT>/<name>; the stack grants read access to that path only, e.g.:
#   PROJECT_NAME = os.environ["PROJECT_NAME"]
#   SECRET_ID = f"acxd/{PROJECT_NAME}/{ENVIRONMENT}/upstream"
#   (fetch it with boto3 secretsmanager.get_secret_value(SecretId=SECRET_ID) on cold start)
#
# Add a DynamoDB client here ONLY for a justified store (idempotency/session/cache/audit):
#   import boto3
#   TABLE_NAME = os.environ.get("TABLE_NAME", "")
#   _table = boto3.resource("dynamodb").Table(TABLE_NAME) if TABLE_NAME else None


# =============================================================================
# ACXD RESPONSE HELPERS
# =============================================================================


def acxd_response(data: dict, status_code: int = 200) -> dict:
    """Format a response compliant with the ACXD data request contract.

    Rules:
      - Bare value object — no wrapping envelope, no resolvedVariables key.
      - HTTP 200 for business-logic failures (e.g. account not found).
      - Non-200 only for infrastructure errors (timeouts, crashes).

    Response conventions:
      - Money:    formatted + raw fields (e.g. "balance": "$1,234.56", "balanceRaw": 1234.56)
      - Boolean:  found/verified field (bool) + success-only string message
      - Date:     ISO 8601 string (e.g. "2026-10-15")
      - List:     Array of flat objects
      - Error:    HTTP 200, boolean false, reason string
    """
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(data, default=_serialize),
    }


def _serialize(obj: Any) -> Any:
    """JSON serializer for types not handled by default encoder."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _canonicalise(value: str) -> str:
    """Canonicalise a caller-supplied identifier.

    Strips whitespace and upper-cases. Store keys in canonical form
    so lookups always match regardless of user input formatting.
    """
    return value.strip().upper() if value else ""


# =============================================================================
# HANDLER — AGENT: Replace business logic per operation
# =============================================================================


def lambda_handler(event: dict, context: Any) -> dict:
    """ACXD data request handler.

    ACXD Data Request Contract:
      Request (flat body):  { "accountId": "string", "dateOfBirth": "string" }
      Response (bare value): { "verified": bool, "customerName": "string", "message": "string" }
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return acxd_response(
            {"verified": False, "customerName": "", "message": "Invalid request body"},
        )

    # --- Parse and canonicalise inputs ---
    account_id = _canonicalise(body.get("accountId", ""))
    date_of_birth = body.get("dateOfBirth", "").strip()

    if not account_id or not date_of_birth:
        # Business failure — still HTTP 200 (ACXD treats non-200 as system errors)
        return acxd_response(
            {
                "verified": False,
                "customerName": "",
                "message": "Missing required fields: accountId and dateOfBirth",
            },
        )

    logger.info("Verify identity request: accountId=%s", account_id)

    # --- Business logic (AGENT: replace with actual implementation) ---
    try:
        result = _verify_identity(account_id, date_of_birth)
    except Exception:
        logger.exception("Upstream verification failed")
        # Infrastructure error — return 500 so ACXD takes the Failure edge
        return acxd_response(
            {"error": "UPSTREAM_ERROR", "message": "Identity verification service unavailable"},
            status_code=500,
        )

    # --- Return bare value object ---
    return acxd_response(
        {
            "verified": result["verified"],
            "customerName": result.get("customerName", ""),
            "customerId": result.get("customerId", ""),
            "message": "Verified" if result["verified"] else "Verification failed",
        },
    )


def _verify_identity(account_id: str, date_of_birth: str) -> dict:
    """Adapter business logic — AGENT: implement the upstream call per engagement.

    Default (production): call the customer's EXTERNAL system of record (option A) and
    map its response to the ACXD contract (fields the flow reads at the top level). Option B is a local-dev stand-in.
    Option C (a DynamoDB lookup) is a rare exception — use only if a store was justified.
    """
    # --- Option A (DEFAULT, production): call the customer's external system ---
    # Authenticate to the upstream (API key/OAuth/SigV4 from Secrets Manager), call it,
    # and return the fields the FLOW reads at the TOP LEVEL (a flow resolves {dr.field} top-level only); deeper
    # detail the flow does not read may stay nested.
    #
    #   import urllib.request  # or requests / an SDK
    #   upstream = _call_customer_crm(account_id, date_of_birth)   # -> dict from the real system
    #   return {
    #       "verified": bool(upstream.get("isVerified")),
    #       "customerName": upstream.get("full_name", "") if upstream.get("isVerified") else "",
    #       "customerId": upstream.get("crm_id", "") if upstream.get("isVerified") else "",
    #   }

    # --- Option B (local dev): mock stand-in so the handler runs with no upstream ---
    # Remove once the upstream call above is implemented.
    return {
        "verified": account_id == "A1001" and date_of_birth == "1990-01-15",
        "customerName": "Jane Smith" if account_id == "A1001" else "",
        "customerId": account_id if account_id == "A1001" else "",
    }

    # --- Option C (RARE exception): read from a justified DynamoDB store ---
    # Only if this operation genuinely needs Lambda-owned state (idempotency/session/
    # cache/audit) AND a table was added in the CDK stack:
    #   response = _table.get_item(Key={"PK": f"CUSTOMER#{account_id}", "SK": "PROFILE"})
    #   item = response.get("Item")
    #   ...flatten and return...
