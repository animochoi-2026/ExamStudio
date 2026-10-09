"""Read-only verbose wrapper for diagnosing a test document's dropped content."""
from pathlib import Path
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from verify_hwp import inspect
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(inspect(sys.argv[1],include_text=True),ensure_ascii=False,indent=2))
