"""Local JSON Schema check. No network, child processes or provider requests."""
import sys, json, hashlib, pathlib

def deny(event, args):
    if event.startswith(("socket.", "subprocess.", "os.system", "os.spawn", "os.exec")):
        raise RuntimeError("Offline schema checker blocked external IO: " + event)

sys.addaudithook(deny)
out = pathlib.Path(sys.argv[1])
deps = pathlib.Path(sys.argv[2])
sys.path.insert(0, str(deps))
from jsonschema import Draft202012Validator

data = (out / "schemas.json").read_bytes()
schemas = json.loads(data)
meta = json.loads((out / "schema-export.json").read_text(encoding="utf-8"))
errors, portability_errors = [], []
control_count = 0

def portable(node, location):
    global control_count
    if not isinstance(node, dict):
        return
    if "pattern" in node and any(x in node["pattern"] for x in ("(?=", "(?!", "(?<=", "(?<!")):
        portability_errors.append({"path": location, "error": "unsupported lookaround"})
    if node.get("type") == "array" and node.get("maxItems") == 0:
        validator = Draft202012Validator(node)
        assert validator.is_valid([])
        assert not validator.is_valid(["invented-id"])
        control_count += 2
    for key, value in node.items():
        if isinstance(value, dict):
            portable(value, location + "." + key)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                portable(item, location + "." + key + "[" + str(index) + "]")

for index, schema in enumerate(schemas):
    try:
        Draft202012Validator.check_schema(schema)
        portable(schema, "$[" + str(index) + "]")
    except Exception as error:
        errors.append({"index": index, "error": str(error)})
    if (index + 1) % 50 == 0:
        print(json.dumps({"checked": index + 1, "total": len(schemas)}), flush=True)
result = {
    "total": len(schemas), "passed": len(schemas) - len(errors), "failed": len(errors), "errors": errors,
    "input_sha256": hashlib.sha256(data).hexdigest(),
    "schema_module_sha256": meta["schema_module_sha256"],
    "portability": {"failed": len(portability_errors), "errors": portability_errors, "empty_array_controls": control_count},
    "actualAIcalls": 0, "networkAllowed": False, "subprocessAllowed": False
}
(out / "schema-meta.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result), flush=True)
sys.exit(1 if errors or portability_errors else 0)
