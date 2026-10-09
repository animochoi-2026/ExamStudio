from pathlib import Path
import json, sys, tempfile, unittest, zipfile, subprocess
from lxml import etree
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from export_docx import export_document
import structured_docx

NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','m':'http://schemas.openxmlformats.org/officeDocument/2006/math','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
ROOT=Path(__file__).resolve().parents[1]

class StructuredDocxTests(unittest.TestCase):
 def fixture(self):
  raw=subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./tests/fixtures/compound-proof.cjs').question()))"],cwd=ROOT)
  return json.loads(raw)
 def test_editable_borders_flow_math_and_inline_pictures(self):
  q=self.fixture()
  with tempfile.TemporaryDirectory() as tmp:
   image=Path(tmp)/'figure.png';Image.new('RGB',(300,210),'white').save(image)
   q['structureFigurePaths']={'separate':str(image),'joined':str(image)}
   out=Path(tmp)/'proof.docx';export_document(dict(title='복합 회귀',settings=dict(audience='student',workspaceLines=0),questions=[q]),out)
   with zipfile.ZipFile(out) as z:root=etree.fromstring(z.read('word/document.xml'))
   boxes=root.xpath('//w:tbl[w:tblPr/w:tblBorders/w:top[@w:val="single"]][.//wp:inline]',namespaces=NS)
   self.assertEqual(len(boxes),1)
   box=boxes[0];self.assertEqual(len(box.xpath('.//w:rPr/w:bdr',namespaces=NS)),4)
   self.assertEqual(len(box.xpath('.//wp:inline',namespaces=NS)),2);self.assertFalse(root.xpath('//wp:anchor',namespaces=NS))
   self.assertTrue(box.xpath('.//m:oMath',namespaces=NS));self.assertFalse(box.xpath('.//w:trHeight[@w:hRule="exact"]',namespaces=NS))
   paragraphs=box.xpath('.//w:p',namespaces=NS)
   strings=[''.join(p.xpath('.//w:t/text()|.//m:t/text()|.//wp:docPr/@descr',namespaces=NS)) for p in paragraphs]
   order=[next(i for i,t in enumerate(strings) if mark in t) for mark in ['두 직각삼각형','구조 도형 separate','➜','구조 도형 joined','를 뒤집어','㉠','①','㉡','②','③','㉣','㉤']]
   self.assertEqual(order,sorted(order))
   self.assertIn('DEF',strings[next(i for i,t in enumerate(strings) if '를 뒤집어' in t)])
   standalone=next(n for n in q['layoutDocument']['nodes'] if n['id']=='blank-line')['inlines'][0]['label']
   self.assertEqual(len(box.xpath('.//w:tbl[w:tblPr/w:tblBorders/w:top[@w:val="single"]][.//w:t="'+standalone+'"]',namespaces=NS)),1)
   for mark in ['㉡','㉢','㉣','㉤']:
    self.assertEqual(len(box.xpath('.//w:r[w:rPr/w:bdr][w:t[contains(.,"'+mark+'")]]',namespaces=NS)),1)
   self.assertFalse(any('빨간' in t for t in strings))
   self.assertTrue(root.xpath('//w:sectPr/w:cols[@w:num="2"]',namespaces=NS))
 def test_structure_scales_for_different_column_widths(self):
  from docx import Document
  import export_docx as e
  q=self.fixture()
  with tempfile.TemporaryDirectory() as tmp:
   image=Path(tmp)/'figure.png';Image.new('RGB',(900,600),'white').save(image);q['structureFigurePaths']={'separate':str(image),'joined':str(image)}
   for width in [190,242,340]:
    doc=Document();api=dict(w_element=e.w_element,font_pt=e.FONT_PT,readable_paragraph=e.readable_paragraph,formatted_math=e.formatted_math,figure_size=e.figure_size,string_width=e.string_width,set_font=e.set_font)
    structured_docx.render(doc,q,api,width)
    extents=doc.element.xpath('.//wp:extent')
    self.assertTrue(all(int(x.get('cx'))<width*12700 for x in extents))
    self.assertEqual(len(doc.element.xpath('.//w:rPr/w:bdr')),4)
    self.assertEqual(len(doc.element.xpath('.//w:tbl[w:tblPr/w:tblBorders/w:top[@w:val="single"]]')),2)
 def test_handwriting_and_uncertain_content_are_excluded(self):
  q=self.fixture();q['layoutDocument']['nodes'][-1]['origin']='handwritten'
  q['layoutDocument']['nodes'][-2]['origin']='uncertain'
  roots=structured_docx.tree(q['layoutDocument']);self.assertTrue(roots)
  with tempfile.TemporaryDirectory() as tmp:
   image=Path(tmp)/'figure.png';Image.new('RGB',(100,100),'white').save(image);q['structureFigurePaths']={'separate':str(image),'joined':str(image)}
   out=Path(tmp)/'filtered.docx';export_document(dict(title='인쇄만',settings=dict(audience='student'),questions=[q]),out)
   with zipfile.ZipFile(out) as z:xml=z.read('word/document.xml').decode()
   self.assertNotIn('㉣',xml.split('따라서')[0] if '따라서' in xml else xml.split('</w:tbl>')[0])
 def test_missing_structure_is_not_silent_success(self):
  self.assertRaises(ValueError,structured_docx.active,dict(layoutMode='structure'))

if __name__=='__main__':unittest.main()
