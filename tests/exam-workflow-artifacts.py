"""Read-only validation of browser-generated files and page renders."""
from pathlib import Path
import json, subprocess, zipfile, xml.etree.ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parents[1]
out=root/'artifacts/exam-ux'
poppler=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
reports=[]
with zipfile.ZipFile(out/'selected-students.zip') as z:
 assert z.namelist()==['A1.pdf']
 (out/'selected-A1.pdf').write_bytes(z.read('A1.pdf'))
for name,count,marks in [('single-questions',1,4),('single-answers',1,4),('single-detailed',1,4),('selected-A1',2,8)]:
 doc=PdfReader(out/(name+'.pdf'))
 assert len(doc.pages)==count,(name,len(doc.pages))
 text=''.join(p.extract_text() for p in doc.pages)
 assert text.count('12345678')==marks,(name,text)
 assert doc.metadata.author=='12345678'
 subprocess.run([str(poppler),'-scale-to','1100','-png',str(out/(name+'.pdf')),str(out/name)],check=True,capture_output=True)
 reports.append({'file':name+'.pdf','pages':len(doc.pages),'questionWatermarks':marks})
with zipfile.ZipFile(out/'single.docx') as z:
 tree=ET.fromstring(z.read('word/document.xml'))
 text=''.join(''.join(ET.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.startswith('word/') and n.endswith('.xml'))
 assert '공통 시험지' in text and '12345678' in text
 assert b'<m:oMath' in z.read('word/document.xml')
 reports.append({'file':'single.docx','nativeMath':True,'titleAndWatermark':True})
with zipfile.ZipFile(out/'single.hwpx') as z:
 sections=[n for n in z.namelist() if n.startswith('Contents/section') and n.endswith('.xml')]
 for name in sections: ET.fromstring(z.read(name))
 assert sections and any('공통 시험지' in z.read(n).decode() for n in sections)
 reports.append({'file':'single.hwpx','wellFormedSections':len(sections),'title':True})
(out/'artifact-verification.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(reports,ensure_ascii=False))
