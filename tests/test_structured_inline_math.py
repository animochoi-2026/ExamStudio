from pathlib import Path
import json,sys,tempfile,unittest,zipfile
from PIL import Image
from lxml import etree
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from export_docx import export_document
from structured_docx import inline_math
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','m':'http://schemas.openxmlformats.org/officeDocument/2006/math','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}

class ActualStructuredInlineMath(unittest.TestCase):
 def test_actual_saved_proof_exports_without_resolving_or_rewriting_source(self):
  q=json.loads((ROOT/'tests/fixtures/compound-proof-actual.json').read_text(encoding='utf-8'))
  # This older readback predates the source-confirmed arrow revision. Never
  # infer a direction or bypass the missing-arrow output guard in the engine.
  confirmed=json.loads((ROOT/'tests/fixtures/compound-proof-arrow-confirmed.json').read_text(encoding='utf-8'))
  q['layoutDocument']['nodes']=[confirmed['node'] if n['id']=='arrow' else n for n in q['layoutDocument']['nodes']]
  before=json.dumps(q,ensure_ascii=False)
  with tempfile.TemporaryDirectory() as folder:
   image=Path(folder)/'diagram.png';Image.new('RGB',(180,240),'white').save(image)
   q['structureFigurePaths']={n['id']:str(image) for n in q['layoutDocument']['nodes'] if n['type']=='figure'}
   output=Path(folder)/'actual.docx';export_document(dict(title='실제 저장본',settings=dict(audience='student',workspaceLines=0),questions=[q]),output)
   with zipfile.ZipFile(output) as z:root=etree.fromstring(z.read('word/document.xml'))
   condition=next(p for p in root.xpath('//w:p',namespaces=NS) if '인 두 직각삼각형' in ''.join(p.xpath('.//w:t/text()',namespaces=NS)))
   self.assertEqual(len(condition.xpath('./m:oMath',namespaces=NS)),4)
   self.assertEqual(condition.xpath('./w:pPr/w:jc/@w:val',namespaces=NS),['left'])
   self.assertFalse(root.xpath('//m:oMathPara',namespaces=NS));self.assertFalse(root.xpath('//m:t[contains(.,"$")]',namespaces=NS))
   for marker in ['인 두 직각삼각형','와 ','에서 ','라고 하자.']:
    self.assertIn(marker,''.join(condition.xpath('.//w:t/text()',namespaces=NS)))
   box=root.xpath('//w:tbl[w:tblPr/w:tblBorders/w:top[@w:val="single"]]',namespaces=NS)[0]
   # The standalone ㉠ blank was changed to a real bordered cell; the four
   # inline blanks still use character borders (see test_standalone_blank).
   self.assertEqual(len(box.xpath('.//w:rPr/w:bdr',namespaces=NS)),4)
   self.assertEqual(len(box.xpath('.//w:tbl[w:tblPr/w:tblBorders/w:top[@w:val="single"]][.//w:t="㉠"]',namespaces=NS)),1)
   self.assertEqual(len(box.xpath('.//wp:inline',namespaces=NS)),3)
   place=next(p for p in box.xpath('.//w:p',namespaces=NS) if '를 뒤집어' in ''.join(p.xpath('.//w:t/text()',namespaces=NS)))
   self.assertIn('DEF',''.join(place.xpath('.//m:t/text()',namespaces=NS)))
   del q['structureFigurePaths'];self.assertEqual(json.dumps(q,ensure_ascii=False),before)
 def test_unconfirmed_actual_arrow_is_rejected_without_changing_the_source(self):
  q=json.loads((ROOT/'tests/fixtures/compound-proof-actual.json').read_text(encoding='utf-8'));before=json.dumps(q,ensure_ascii=False)
  with tempfile.TemporaryDirectory() as folder:
   image=Path(folder)/'diagram.png';Image.new('RGB',(180,240),'white').save(image)
   q['structureFigurePaths']={n['id']:str(image) for n in q['layoutDocument']['nodes'] if n['type']=='figure'}
   with self.assertRaisesRegex(ValueError,'화살표 원본 확인 필요'):
    export_document(dict(title='미확인 원본',settings=dict(audience='student',workspaceLines=0),questions=[q]),Path(folder)/'rejected.docx')
   del q['structureFigurePaths'];self.assertEqual(json.dumps(q,ensure_ascii=False),before)
 def test_wrapped_and_raw_latex_keep_row_separators_and_escaped_dollars(self):
  raw=r'\begin{aligned}a&=b\\c&=d\end{aligned}'
  for wrapped in ['$'+raw+'$','$$'+raw+'$$',r'\('+raw+r'\)',r'\['+raw+r'\]']:
   self.assertEqual(inline_math(wrapped),raw)
  self.assertEqual(inline_math(r'$x+\$5$'),r'x+\$5');self.assertEqual(inline_math(r'\angle C'),r'\angle C')
  with self.assertRaises(ValueError):inline_math('$x$ + $y$')

if __name__=='__main__':unittest.main()
