"""Validate candidate generation schemas and saved responses without network/process I/O."""
import sys
import json
import pathlib
import hashlib
import copy


def deny(event, args):
    if event.startswith(("socket.", "subprocess.", "os.system", "os.spawn", "os.exec")):
        raise RuntimeError("Offline schema checker blocked external IO: " + event)


sys.addaudithook(deny)
if len(sys.argv) > 2:
    sys.path.insert(0, sys.argv[2])
from jsonschema import Draft202012Validator

base = pathlib.Path(sys.argv[1]).resolve()
data = (base / "schema-cases.json").read_bytes()
cases = json.loads(data)
checks = []


def check(name, actual, expected):
    checks.append({"name": name, "pass": actual == expected})
    assert actual == expected, name


for case in cases:
    schema = case["schema"]
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    check(case["label"] + ": original rejected", validator.is_valid(case["original"]),
          case["expected_original_valid"])
    check(case["label"] + ": diagnostic only", validator.is_valid(case["diagnostic"]),
          case["expected_diagnostic_valid"])
    discovery = schema["properties"]["viable_routes"]["items"]["properties"]["critical_discoveries"]["items"]
    ids = Draft202012Validator(discovery["properties"]["evidence_relation_ids"])
    check(case["label"] + ": unique empty selector accepted", ids.is_valid([]), True)
    check(case["label"] + ": redundant selector rejected", ids.is_valid(["invented"]), False)
    for name, fact in discovery["properties"]["structure_audit"]["properties"].items():
        audit_validator = Draft202012Validator(fact)
        for applies in [False, True]:
            good = {"applies": applies, "evidence": "existing evidence" if applies else "",
                    "non_trigger_reason": "" if applies else "existing reason",
                    "direct_clue_quote": "" if applies else "existing source quote"}
            check(case["label"] + "/" + name + "/" + str(applies) + ": valid",
                  audit_validator.is_valid(good), True)
            for field in (["evidence"] if applies else ["non_trigger_reason", "direct_clue_quote"]):
                for blank in ["", " \t\n"]:
                    bad = copy.deepcopy(good)
                    bad[field] = blank
                    check(case["label"] + "/" + name + "/" + field + ": blank rejected",
                          audit_validator.is_valid(bad), False)

result = {"schemas": len(cases), "checks": len(checks), "passed": sum(c["pass"] for c in checks),
          "failed": sum(not c["pass"] for c in checks), "actualAICalls": 0, "networkAllowed": False,
          "subprocessAllowed": False, "schema_cases_sha256": hashlib.sha256(data).hexdigest(),
          "live_provider_schema_acceptance_tested": False,
          "scope": "Local JSON Schema semantics only; no new generated responses."}
(base / "schema-validation.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result))
