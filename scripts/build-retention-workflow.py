"""Keep the standalone distribution-repo workflow in sync with its tested source."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
header = '''name: Keep latest 3 releases
on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      dry_run:
        description: Preview cleanup without deleting releases
        type: boolean
        default: true
permissions:
  contents: write
concurrency:
  group: release-retention
  cancel-in-progress: false
jobs:
  cleanup:
    if: github.repository == 'animochoi-2026/ExamStudio'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Verify retained packages and remove older releases
        env:
          GH_TOKEN: ${{ github.token }}
          DRY_RUN: ${{ github.event.inputs.dry_run || 'false' }}
        shell: bash
        run: |
          python3 - <<'PY'
'''
target = root / '.github/workflows/release-retention.yml'
target.parent.mkdir(parents=True, exist_ok=True)
source = (root / 'scripts/github-retention.py').read_text(encoding='utf-8')
target.write_text(header + ''.join('          ' + line + '\n' for line in source.splitlines()) + '          PY\n', encoding='utf-8')
print(target)
