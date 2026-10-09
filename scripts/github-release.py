"""Create the public portable ZIP and checksum manifest from a clean packaged build."""
import hashlib,json,sys,zipfile
from pathlib import Path
def build(source,output):
    source,output=Path(source).resolve(),Path(output).resolve()
    package=json.loads((source/'resources/app/package.json').read_text(encoding='utf-8'))
    version=package['version']
    for required in ['문제공방.exe','runtime/python/python.exe','runtime/codex/bin/codex.exe']:
        if not (source/required).is_file(): raise ValueError('Missing release runtime: '+required)
    for forbidden in ['data','결과물','.git','.codex','runtime/gemini','runtime/claude']:
        if (source/forbidden).exists(): raise ValueError('Personal data in build: '+forbidden)
    output.mkdir(parents=True,exist_ok=True)
    target=output/f'ExamStudio-{version}-win32-x64.zip'
    if target.exists(): raise ValueError('Release already exists; use a new output folder')
    files=list(source.rglob('*'))
    if any(p.is_symlink() for p in files): raise ValueError('Symlink in release')
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for file in files:
            if not file.is_file(): continue
            relative=file.relative_to(source)
            if relative.as_posix() in {'BUILD-INFO.json','CANDIDATE-REVIEW.txt','resources/app/desktop-release.json'}: continue
            if '__pycache__' in relative.parts or file.suffix=='.pyc': continue
            if any(part in {'.env','auth.json','.git','.codex-remote-attachments'} for part in relative.parts): raise ValueError('Private file in release: '+str(relative))
            # Existing updaters only replace the explicit program-file allowlist.
            # Keep the setup guide inside resources so 0.4.x can install this ZIP.
            archive_name = 'resources/app/SHARED-BANK-SETUP.md' if relative.as_posix() == 'SHARED-BANK-SETUP.md' else relative.as_posix()
            z.write(file,archive_name)
    manifest=dict(schema=1,version=version,platform='win32-x64',asset=target.name,size=target.stat().st_size,sha256=hashlib.file_digest(target.open('rb'),'sha256').hexdigest())
    (output/'update.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(manifest));return manifest
if __name__=='__main__':build(*sys.argv[1:])
