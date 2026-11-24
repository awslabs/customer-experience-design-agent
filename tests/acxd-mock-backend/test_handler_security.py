# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
"""Security tests for the mock handler: operation-name validation, log redaction, generic errors.
Run: python3 tests/acxd-mock-backend/test_handler_security.py"""
import importlib.util, json, logging, os, shutil, sys, tempfile

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "tools", "acxd-mock-backend")
tmp = tempfile.mkdtemp()
shutil.copy(os.path.join(ROOT, "handler.py"), tmp)
os.makedirs(os.path.join(tmp, "data")); os.makedirs(os.path.join(tmp, "ops"))
json.dump({"ACC1": {"verified": True, "pin": "1234"}, "_default": {"verified": False}},
          open(os.path.join(tmp, "data", "verifyIdentity.json"), "w"))
json.dump({}, open(os.path.join(tmp, "data", "boom.json"), "w"))
open(os.path.join(tmp, "ops", "boom.py"), "w").write("def handle(p, d):\n    raise ValueError('secret internal detail')\n")
spec = importlib.util.spec_from_file_location("handler", os.path.join(tmp, "handler.py"))
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)

records = []
class Cap(logging.Handler):
    def emit(self, r): records.append(r.getMessage())
h.log.addHandler(Cap())

def call(op, body=None):
    ev = {"pathParameters": {"operation": op}, "body": json.dumps(body) if body else None}
    r = h.lambda_handler(ev); return r["statusCode"], json.loads(r["body"])

passed = 0
def test(name, fn):
    global passed
    records.clear(); fn(); passed += 1; print("  ok ", name)

def t_valid():
    s, b = call("verifyIdentity", {"accountNumber": "ACC1", "pin": "1234"}); assert s == 200 and b["verified"] is True
test("positive: a valid operation returns its data", t_valid)

def t_bad_ops():
    for op in ["../etc/passwd", "a/b", "1abc", "verify-identity", "x" * 70, "op.py"]:
        s, b = call(op); assert s == 400 and b["error"] == "BAD_OPERATION", op
test("negative: invalid operation names are rejected before any file is read", t_bad_ops)

def t_redact():
    call("verifyIdentity", {"accountNumber": "ACC1", "pin": "1234", "Password": "pw", "nested": {"otpCode": "999"}})
    text = " ".join(records)
    assert "1234" not in text and "pw" not in text and "999" not in text, text
    assert "ACC1" in text and "***" in text
test("negative: PIN, password and OTP values never reach the logs (request and response)", t_redact)

def t_error():
    s, b = call("boom")
    assert s == 500 and b == {"error": "OP_ERROR", "message": "operation failed"}
    assert "secret internal detail" not in json.dumps(b)
test("negative: an op error returns a generic message, not the exception text", t_error)

def t_api_dir():
    # Each API's Lambda serves only its own folder (MOCK_API_DIR=apis/<apiId>).
    os.makedirs(os.path.join(tmp, "apis", "pricingApi", "data"))
    json.dump({"_default": {"premium": 100}}, open(os.path.join(tmp, "apis", "pricingApi", "data", "getQuote.json"), "w"))
    os.environ["MOCK_API_DIR"] = "apis/pricingApi"
    try:
        spec2 = importlib.util.spec_from_file_location("handler2", os.path.join(tmp, "handler.py"))
        h2 = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(h2)
        r = h2.lambda_handler({"pathParameters": {"operation": "getQuote"}, "body": None})
        assert r["statusCode"] == 200 and json.loads(r["body"])["premium"] == 100
        r = h2.lambda_handler({"pathParameters": {"operation": "verifyIdentity"}, "body": None})
        assert r["statusCode"] == 404, "another API's operation is not served"
    finally:
        del os.environ["MOCK_API_DIR"]
test("positive: an API's Lambda serves its own apis/<apiId>/ folder and no other API's operations", t_api_dir)

print(f"mock handler security tests: {passed} passed")
shutil.rmtree(tmp)
