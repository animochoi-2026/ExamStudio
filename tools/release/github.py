"""Release operations using Git Credential Manager; credentials never leave memory."""
import json, os, subprocess, urllib.request, urllib.error, sys, hashlib
from pathlib import Path

REPO='animochoi-2026/ExamStudio'
def credential():
    result=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\nusername=animochoi-2026\n\n',text=True,capture_output=True,check=True,env={**os.environ,'GIT_TERMINAL_PROMPT':'0','GCM_INTERACTIVE':'Never'})
    fields=dict(line.split('=',1) for line in result.stdout.splitlines() if '=' in line)
    return fields['password']
def api(route,method='GET',payload=None,token=None):
    url=route if route.startswith('https://') else 'https://api.github.com/repos/'+REPO+route
    headers={'Authorization':'Bearer '+(token or credential()),'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'ExamStudio-release'}
    if payload is not None:
        headers['Content-Type']='application/json'; payload=json.dumps(payload).encode()
    with urllib.request.urlopen(urllib.request.Request(url,data=payload,headers=headers,method=method),timeout=120) as response:
        data=response.read(); return json.loads(data) if data else None
def upload(release_id,file):
    from urllib.parse import quote
    p=Path(file)
    request=urllib.request.Request(f'https://uploads.github.com/repos/{REPO}/releases/{release_id}/assets?name={quote(p.name)}',data=p.read_bytes(),headers={'Authorization':'Bearer '+credential(),'Content-Type':'application/octet-stream','User-Agent':'ExamStudio-release'},method='POST')
    with urllib.request.urlopen(request,timeout=600) as response:
        r=json.load(response); return {k:r[k] for k in ['id','name','size','state','browser_download_url']}
if __name__=='__main__':
    if sys.argv[1]=='status':
        repo=api(''); workflows=api('/actions/workflows')
        print(json.dumps({'repo':repo['full_name'],'permissions':repo['permissions'],'workflows':[{k:w[k] for k in ['id','name','state']} for w in workflows['workflows']]}))
    elif sys.argv[1]=='upload': print(json.dumps(upload(sys.argv[2],sys.argv[3])))
