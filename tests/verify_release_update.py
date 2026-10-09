"""Apply an actual release ZIP to an isolated old installation, retaining user files."""
import json, subprocess, sys, tempfile
from pathlib import Path

workspace = Path(__file__).resolve().parents[1]
release = Path(sys.argv[1]).resolve()
manifest = json.loads((release / 'update.json').read_text(encoding='utf-8'))
test_dir = Path(tempfile.mkdtemp(prefix='github-update-', dir=workspace / 'data/validation'))
root = test_dir / '문제공방'
stage = root / 'data/updates/test-install'
stage.mkdir(parents=True)
canaries = {'data/project.json': b'preserved work', 'data/rules.json': b'preserved rules', '결과물/exam.docx': b'preserved output', 'runtime/gemini/test.txt': b'preserved Gemini', 'runtime/claude/test.txt': b'preserved Claude'}
for name, content in {**canaries, '문제공방.exe': b'old executable', 'resources/app/package.json': b'{"version":"0.3.18"}'}.items():
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
plan = dict(root=str(root), zip=str(release / manifest['asset']), sha256=manifest['sha256'], version=manifest['version'], parentPid=99999999, restart=False)
plan_path = stage / 'plan.json'
plan_path.write_text(json.dumps(plan), encoding='utf-8')
result = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(workspace / 'scripts/apply-update.ps1'), '-Plan', str(plan_path)], capture_output=True, timeout=240)
report = json.loads((stage / 'result.json').read_text(encoding='utf-8-sig'))
assert result.returncode == 0 and report['status'] == 'installed', report
for name, content in canaries.items():
    assert (root / name).read_bytes() == content, name
assert (stage / 'backup/문제공방.exe').read_bytes() == b'old executable'
assert json.loads((root / 'resources/app/package.json').read_text(encoding='utf-8'))['version'] == manifest['version']
assert (root / '문제공방.exe').stat().st_size > 1000000
print('PASS actual release ZIP: replacement, private data preservation, rollback backup')
print(root)
