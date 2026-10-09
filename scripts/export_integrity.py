"""Reject mixed/stale release files before importing or composing documents."""
from pathlib import Path
import hashlib
import json

def verify():
    root = Path(__file__).resolve().parent
    manifest = root / 'export-engine.json'
    # The development source is authoritative; staged browser/release copies
    # carry a manifest produced and checked by export-engine.cjs.
    if not manifest.exists():
        return
    data = json.loads(manifest.read_text(encoding='utf-8'))
    if data.get('schema') != 1 or not isinstance(data.get('assets'), dict):
        raise ValueError('출력 엔진 정보가 잘못되었습니다. 새로고침 또는 앱 업데이트를 해 주세요.')
    for name, expected in data['assets'].items():
        target = (root / name).resolve()
        if not target.is_relative_to(root) or not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise ValueError('출력 엔진 파일이 서로 다릅니다. 새로고침 또는 앱 업데이트를 해 주세요: ' + name)
