import sys, tempfile, unittest, zipfile
from pathlib import Path
from lxml import etree
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from export_docx import export_document

class FirstPageName(unittest.TestCase):
 def test_name_only_first_page_title_and_page_numbers_survive_appendix(self):
  with tempfile.TemporaryDirectory() as d:
   q=[dict(id=str(i),sourceId='fixture',kind='original',body='문제',choices=['답'],answer='①',solution='풀이',include=True,workspaceMm=0) for i in range(7)]
   f=Path(d)/'paper.docx';export_document(dict(title='이름칸 회귀',settings=dict(bodyFontSize=10,showStudentNameLine=True,workspaceLines=0,measuredPages=[[[x['id']],[]] for x in q]),questions=q),f)
   ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
   with zipfile.ZipFile(f) as z:
    headers={p:etree.fromstring(z.read(p)) for p in z.namelist() if p.startswith('word/header') and p.endswith('.xml')}
    self.assertEqual(sum('이름:' in ''.join(h.xpath('//w:t/text()',namespaces=ns)) for h in headers.values()),1)
    for h in headers.values():self.assertIn('이름칸 회귀',''.join(h.xpath('//w:t/text()',namespaces=ns)))
    doc=etree.fromstring(z.read('word/document.xml'));sects=doc.xpath('//w:sectPr',namespaces=ns)
    self.assertEqual(len(sects),2);self.assertEqual(len(sects[0].xpath('./w:titlePg',namespaces=ns)),1)
    self.assertFalse(sects[-1].xpath('./w:titlePg[not(@w:val="0")]',namespaces=ns))
    footer=[z.read(p).decode('utf8') for p in z.namelist() if p.startswith('word/footer') and p.endswith('.xml')]
    self.assertTrue(all('PAGE' in p for p in footer))

if __name__=='__main__':unittest.main()
