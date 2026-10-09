import hashlib,json,os,subprocess,tempfile,unittest,zipfile
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'scripts/apply-update.ps1'
@unittest.skipUnless(os.name=='nt','Windows updater')
class UpdateTests(unittest.TestCase):
 def run_case(self,bad=False,locked=False):
  with tempfile.TemporaryDirectory() as tmp:
   folder=Path(tmp);root=folder/'문제공방 설치';stage=folder/'download';stage.mkdir()
   originals={'문제공방.exe':b'old executable','resources/app/old.txt':b'old app','locales/old.pak':b'old locale','data/project.json':b'private work','결과물/exam.docx':b'private output','runtime/gemini/agy.exe':b'keep cli'}
   for name,content in originals.items():p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(content)
   archive=stage/'release.zip'
   with zipfile.ZipFile(archive,'w') as z:
    for name,content in {'문제공방.exe':b'new executable','resources/app/package.json':json.dumps(dict(name='geometry-exam-studio',version='0.4.0')),'runtime/python/python.exe':b'python','locales/new.pak':b'new locale'}.items():z.writestr(name,content)
    if bad:z.writestr('../outside.txt',b'unsafe')
   plan=dict(root=str(root),zip=str(archive),sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),version='0.4.0',parentPid=99999999,restart=False)
   planfile=stage/'plan.json';planfile.write_text(json.dumps(plan),encoding='utf-8')
   held=(root/'resources/app/old.txt').open('rb') if locked else None
   try:r=subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(SCRIPT),'-Plan',str(planfile)],capture_output=True,timeout=30)
   finally:
    if held:held.close()
   report=json.loads((stage/'result.json').read_text(encoding='utf-8-sig'))
   self.assertEqual(report['status'],'failed' if bad or locked else 'installed',str(report)+r.stderr.decode(errors='replace'))
   for name in ['data/project.json','결과물/exam.docx','runtime/gemini/agy.exe']:self.assertEqual((root/name).read_bytes(),originals[name])
   if bad or locked:
    for name,content in originals.items():self.assertEqual((root/name).read_bytes(),content)
   else:self.assertEqual((root/'문제공방.exe').read_bytes(),b'new executable');self.assertEqual((stage/'backup/문제공방.exe').read_bytes(),b'old executable')
   self.assertFalse((folder/'outside.txt').exists())
 def test_install_preserves_user_data_and_keeps_backup(self):self.run_case()
 def test_unsafe_zip_keeps_installation_unchanged(self):self.run_case(bad=True)
 def test_locked_files_roll_back_previous_moves(self):self.run_case(locked=True)
if __name__=='__main__':unittest.main()
