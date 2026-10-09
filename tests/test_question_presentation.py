from pathlib import Path
import sys,tempfile,unittest,zipfile
from PIL import Image
from lxml import etree
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from export_docx import export_document,subquestion_parts,flow_parts,estimate_question,LINE_PT

class PresentationTests(unittest.TestCase):
 def test_figures_at_blank_lines_with_repeated_numbers(self):
  ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
  body='물음에 답하시오.\n\n(1) 첫째 카드\n\n(2) 둘째 카드\n\n(1) 첫째 물음\n\n(2) 둘째 물음'
  flow=flow_parts(body);self.assertEqual(len(flow),5)
  self.assertEqual(len(flow_parts('본문 $$x=1\n\ny=2$$ 끝')),1)
  with tempfile.TemporaryDirectory() as folder:
   image=Path(folder)/'figure.png';Image.new('RGB',(240,140),'white').save(image)
   q=dict(id='q',sourceId='p',kind='original',body=body,choices=[],answer='2',solution='풀이',materialPaths=[str(image),str(image)],materialIds=['one','two'],figurePlacements={'one':flow[1][1],'two':flow[2][1]})
   out=Path(folder)/'gaps.docx';export_document(dict(title='빈 줄 배치',settings={},questions=[q]),out)
   with zipfile.ZipFile(out) as z:root=etree.fromstring(z.read('word/document.xml'))
   rows=root.xpath('/w:document/w:body/w:p',namespaces=ns)
   texts=[''.join(p.xpath('.//w:t/text()|.//wp:docPr/@descr',namespaces=ns)) for p in rows]
   indices=[next(i for i,t in enumerate(texts) if marker in t) for marker in ['물음에 답하시오.','공통 자료 1','첫째 카드','공통 자료 2','둘째 카드']]
   self.assertEqual(indices,sorted(indices));self.assertEqual(len(set(indices)),5)
 def test_independent_figures_between_subquestions(self):
  ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
  with tempfile.TemporaryDirectory() as folder:
   image=Path(folder)/'figure.png';Image.new('RGB',(240,140),'white').save(image)
   q=dict(id='q',sourceId='p',kind='original',body='(1) 첫째 물음\n(2) 둘째 물음',choices=[],answer='2',solution='풀이',diagramPath=str(image),materialPaths=[str(image),str(image)],materialIds=['method-1','method-2'],figurePlacements={'diagram':'part:1','method-1':'before','method-2':'after'},layout='auto')
   out=Path(folder)/'objects.docx';export_document(dict(title='순서',settings=dict(workspaceLines=0),questions=[q]),out)
   with zipfile.ZipFile(out) as z:root=etree.fromstring(z.read('word/document.xml'))
   rows=root.xpath('/w:document/w:body/w:p',namespaces=ns)
   texts=[''.join(p.xpath('.//w:t/text()|.//wp:docPr/@descr',namespaces=ns)) for p in rows]
   indices=[next(i for i,t in enumerate(texts) if marker in t) for marker in ['공통 자료 1','첫째 물음','1번 문제의 도형','둘째 물음','공통 자료 2']]
   self.assertEqual(indices,sorted(indices));self.assertEqual(len(set(indices)),5)
 def test_single_line_figure_after_its_sentence(self):
  ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
  body='∠C=∠F=90°\n△ABC와 △DEF에서 AC=DF라 하자.\n다음 중 옳은 것은?'
  self.assertEqual([slot for _,slot in flow_parts(body)],['before','line:1','line:2'])
  with tempfile.TemporaryDirectory() as folder:
   image=Path(folder)/'figure.png';Image.new('RGB',(240,140),'white').save(image)
   q=dict(id='q',sourceId='p',kind='original',body=body,choices=[],answer='2',solution='풀이',diagramPath=str(image),figurePlacements={'diagram':'line:2'})
   out=Path(folder)/'single-line.docx';export_document(dict(title='문단 그림',settings={'workspaceLines':0},questions=[q]),out)
   with zipfile.ZipFile(out) as z:root=etree.fromstring(z.read('word/document.xml'))
   rows=root.xpath('/w:document/w:body/w:p',namespaces=ns)
   texts=[''.join(p.xpath('.//w:t/text()|.//wp:docPr/@descr',namespaces=ns)) for p in rows]
   indices=[next(i for i,t in enumerate(texts) if marker in t) for marker in ['∠C=∠F=90°','AC=DF라 하자.','1번 문제의 도형','다음 중 옳은 것은?']]
   self.assertEqual(indices,sorted(indices))
 def test_prose_markers_only(self):
  self.assertEqual(len(subquestion_parts('조건 $f(1)=2$\n(1) 길이\n(2) 넓이')),2)
  for text in ['점 (1)에서 점 (2)로 이동','$ (1) + (2) $','(1) 조건\n(3) 조건']:
   self.assertEqual(subquestion_parts(text),[text])
 def test_drawing_order_and_two_line_gap(self):
  ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
  with tempfile.TemporaryDirectory() as folder:
   image=Path(folder)/'figure.png';Image.new('RGB',(240,140),'white').save(image)
   base=dict(id='q',sourceId='p',kind='original',body='(1) 첫째 물음\n(2) 둘째 물음',choices=[],answer='2',solution='풀이',diagramPath=str(image),layout='auto')
   for position in ['before','after']:
    out=Path(folder)/(position+'.docx');export_document(dict(title='순서',settings=dict(workspaceLines=0),questions=[dict(base,diagramPosition=position)]),out)
    with zipfile.ZipFile(out) as z:root=etree.fromstring(z.read('word/document.xml'))
    paragraphs=root.xpath('/w:document/w:body/w:p',namespaces=ns)
    first=next(i for i,p in enumerate(paragraphs) if '첫째 물음' in ''.join(p.xpath('.//w:t/text()',namespaces=ns)))
    drawing=next(i for i,p in enumerate(paragraphs) if p.xpath('.//w:drawing',namespaces=ns))
    self.assertEqual(drawing<first,position=='before')
    second=next(p for p in paragraphs if '둘째 물음' in ''.join(p.xpath('.//w:t/text()',namespaces=ns)))
    self.assertEqual(second.xpath('./w:pPr/w:spacing/@w:before',namespaces=ns),[str(int(LINE_PT*20))])
   without=dict(base,body='첫째 물음 둘째 물음');self.assertGreater(estimate_question(base,0)-estimate_question(without,0),LINE_PT-1)
if __name__=='__main__':unittest.main()
