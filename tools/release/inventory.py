"""Read-only size/source inventory. Never follows directory links or deletes data."""
import os, json, hashlib, argparse
from pathlib import Path

def digest(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def inventory(root):
    totals={}; links=[]; data=[]
    for folder,dirs,files in os.walk(root,followlinks=False):
        base=Path(folder); rel=base.relative_to(root)
        for name in list(dirs):
            p=base/name
            if p.is_symlink() or p.is_junction():
                links.append(str(p.relative_to(root)));dirs.remove(name)
        if base.name in {'data','profile','profiles','.restorepoint','restore-points'}:
            data.append(str(rel))
        for name in files:
            p=base/name
            try:size=p.stat().st_size
            except OSError:continue
            parts=(*rel.parts,name)
            for n in range(1,min(3,len(parts))+1):
                k='/'.join(parts[:n]);item=totals.setdefault(k,{'bytes':0,'files':0});item['bytes']+=size;item['files']+=1
    return {'root':str(root),'totals':totals,'links':links,'dataDirectories':data}

def sources(root):
    locations={'root':root,'phase2':root/'phase2-desktop','installed':root/'phase2-desktop/builds/hwpx2018-20261010/ExamStudio-win32-x64/resources/app'}
    maps={}
    for key,base in locations.items():
        maps[key]={str(p.relative_to(base)).replace('\\','/'):digest(p) for name in ['app','scripts','supabase'] for p in (base/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts and '.temp' not in p.parts}
    names=set(maps['installed'])
    return {'maps':maps,'installedVsRoot':[n for n in sorted(names) if maps['root'].get(n)!=maps['installed'][n]],'installedVsPhase2':[n for n in sorted(names) if maps['phase2'].get(n)!=maps['installed'][n]]}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('mode',choices=['size','sources']);ap.add_argument('output');a=ap.parse_args()
    root=Path(__file__).resolve().parents[2];out=root/a.output;out.parent.mkdir(parents=True,exist_ok=True)
    result=inventory(root) if a.mode=='size' else sources(root)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(({k:v for k,v in result['totals'].items() if '/' not in k}) if a.mode=='size' else {k:v for k,v in result.items() if k!='maps'},ensure_ascii=False))
