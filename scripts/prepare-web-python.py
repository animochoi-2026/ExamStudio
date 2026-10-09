"""Vendor a pinned browser Python runtime. No service, account, or API key required."""
import json, urllib.request, pathlib
out=pathlib.Path('web-bank/runtime');out.mkdir(parents=True,exist_ok=True)
base='https://cdn.jsdelivr.net/pyodide/v0.28.3/full/'
def get(name,url=None):
    dest=out/name
    if not dest.exists(): urllib.request.urlretrieve(url or base+name,dest)
    return dest
for n in ['pyodide.js','pyodide.asm.js','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json']:get(n)
lock=json.loads((out/'pyodide-lock.json').read_text())
done=set()
def package(name):
    if name in done:return
    done.add(name)
    p=lock['packages'][name]
    for dep in p.get('depends',[]):package(dep)
    get(p['file_name'])
for n in ['lxml','pillow']:package(n)
for name,ver in [('python-docx','1.2.0'),('typing-extensions','4.15.0')]:
    data=json.load(urllib.request.urlopen(f'https://pypi.org/pypi/{name}/{ver}/json'))
    item=next(x for x in data['urls'] if x['filename'].endswith('py3-none-any.whl'))
    get(item['filename'],item['url'])
print(json.dumps({'files':len(list(out.iterdir())),'bytes':sum(p.stat().st_size for p in out.iterdir()),'oversize':[p.name for p in out.iterdir() if p.stat().st_size>25*1024*1024]}))
