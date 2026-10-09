import json, subprocess, sys, tempfile, unittest, zipfile
from pathlib import Path
from lxml import etree
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from export_docx import export_document
from hwp_compat import equation_plan
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','m':'http://schemas.openxmlformats.org/officeDocument/2006/math','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}

class GuideExport(unittest.TestCase):
 def fixture(self,d):
  q=json.loads(subprocess.check_output(['node','-e',"console.log(JSON.stringify(require('./tests/fixtures/solution-guide.cjs').fixture()))"],cwd=ROOT,text=True,encoding='utf8'))
  q['solutionGuideFigurePaths']={}
  for s in q['solutionGuide']['steps']:
   if s.get('view'):
    p=Path(d)/(s['id']+'.png');Image.new('RGB',(640,440),'white').save(p);q['solutionGuideFigurePaths'][s['id']]=str(p)
  return {'title':'합성 해설 출력 검증','settings':{'answerMode':'detailed','solutionFontSize':9,'workspaceLines':0,'quadrantLayout':False},'questions':[q]}
 def test_order_side_captions_and_hwp_math_sequence(self):
  with tempfile.TemporaryDirectory() as d:
   snap=self.fixture(d);p=Path(d)/'guide.docx';export_document(snap,p)
   xml=etree.fromstring(zipfile.ZipFile(p).read('word/document.xml'))
   self.assertEqual(len(xml.xpath('//a:blip',namespaces=NS)),3)
   self.assertEqual(len(xml.xpath('//w:tbl',namespaces=NS)),1)
   self.assertFalse(xml.xpath('//w:tbl//m:oMath',namespaces=NS))
   text=''.join(xml.xpath('//w:t/text()',namespaces=NS))
   positions=[text.index(f'{i+1}. '+s['title']) for i,s in enumerate(snap['questions'][0]['solutionGuide']['steps'])]
   self.assertEqual(positions,sorted(positions));self.assertIn('△AOB ≅ △COD (SAS)',text)
   self.assertEqual(len(xml.xpath('//m:oMath',namespaces=NS)),len(equation_plan(snap)['word/document.xml']))
   self.assertFalse(xml.xpath('//w:tbl//w:pPr/w:keepLines[not(@w:val="0")]',namespaces=NS))
 def test_text_edit_falls_back_and_missing_figures_preserve_prior_file(self):
  with tempfile.TemporaryDirectory() as d:
   snap=self.fixture(d);p=Path(d)/'guide.docx';export_document(snap,p);original=p.read_bytes()
   snap['questions'][0]['solutionGuideFigurePaths']={}
   with self.assertRaises(ValueError):export_document(snap,p)
   self.assertEqual(p.read_bytes(),original)
   snap['questions'][0]['solution']='수동으로 수정한 풀이';export_document(snap,p)
   xml=etree.fromstring(zipfile.ZipFile(p).read('word/document.xml'))
   self.assertEqual(len(xml.xpath('//a:blip',namespaces=NS)),0)

if __name__=='__main__':unittest.main()
