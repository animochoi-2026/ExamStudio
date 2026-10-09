import sys,os,unittest,tempfile,zipfile
from pathlib import Path
from lxml import etree
sys.path.insert(0,str(Path(os.environ['EXAM_TEST_CODE_ROOT'])/'scripts') if os.environ.get('EXAM_TEST_CODE_ROOT') else str(Path(__file__).resolve().parents[1]/'scripts'))
from export_docx import export_document
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
class SolutionFlow(unittest.TestCase):
 def test_detailed_paragraphs_flow_and_only_heading_keeps_next(self):
  questions=[{'id':f'q{i}','sourceId':f'q{i}','kind':'original','body':'문제 본문','choices':[],'answer':'1','solution':((r'\(x+1=2\)'+'\n')*100 if i==0 else '짧은 풀이'),'workspaceMm':0} for i in range(2)]
  with tempfile.TemporaryDirectory(prefix='exam-solution-flow-') as d:
   file=Path(d)/'test.docx';export_document({'title':'격리 풀이 검증','settings':{'answerMode':'detailed','workspaceLines':0,'quadrantLayout':False},'questions':questions},file)
   xml=etree.fromstring(zipfile.ZipFile(file).read('word/document.xml'))
   paras=xml.xpath('//w:p[w:pPr/w:pStyle/@w:val="EndnoteText"]',namespaces=NS);self.assertTrue(paras)
   for p in paras:
    self.assertFalse(p.xpath('w:pPr/w:keepNext[not(@w:val="0")]',namespaces=NS));self.assertFalse(p.xpath('w:pPr/w:keepLines[not(@w:val="0")]',namespaces=NS));self.assertFalse(p.xpath('w:r/w:br[@w:type="column"]',namespaces=NS))
   headings=xml.xpath('//w:p[w:bookmarkStart]',namespaces=NS);self.assertEqual(len(headings),2)
   self.assertTrue(all(h.xpath('w:pPr/w:keepNext',namespaces=NS) for h in headings))
   self.assertEqual(paras[-2].xpath('string(w:pPr/w:spacing/@w:after)',namespaces=NS),'270');self.assertEqual(paras[-1].xpath('string(w:pPr/w:spacing/@w:after)',namespaces=NS),'0')
   body=xml.xpath('//w:p[w:pPr/w:pStyle/@w:val="QuestionLabel"]',namespaces=NS);self.assertEqual(len(body),2)
   styles=etree.fromstring(zipfile.ZipFile(file).read('word/styles.xml'));self.assertTrue(styles.xpath('//w:style[@w:styleId="QuestionLabel"]/w:pPr/w:keepNext',namespaces=NS))
if __name__=='__main__':unittest.main()
