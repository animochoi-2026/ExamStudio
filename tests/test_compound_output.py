from pathlib import Path
import json,sys,tempfile,unittest,zipfile
from PIL import Image
from lxml import etree
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from export_docx import export_document
from structured_docx import for_output
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}

class CompoundOutput(unittest.TestCase):
 def test_saved_proof_leaders_and_score_option_in_docx(self):
  q=json.loads((ROOT/'tests/fixtures/compound-proof-uploaded.json').read_text(encoding='utf8'));before=json.dumps(q)
  self.assertEqual([x['text'] for n in for_output(q)['layoutDocument']['nodes'] for x in n['inlines'] if x['kind']=='reason'],['…… ①','…… ②','…… ③'])
  with tempfile.TemporaryDirectory() as directory:
   image=Path(directory)/'geometry.png';Image.new('RGB',(180,240),'white').save(image)
   q['structureFigurePaths']={n['id']:str(image) for n in q['layoutDocument']['nodes'] if n['type']=='figure'}
   with self.assertRaisesRegex(ValueError,'화살표 원본 확인 필요'):
    export_document(dict(title='incomplete',settings=dict(audience='student',workspaceLines=0),questions=[q]),Path(directory)/'incomplete.docx')
   arrow=next(n for n in q['layoutDocument']['nodes'] if n['type']=='arrow')
   saved_arrow=arrow['inlines'];arrow['inlines']=[dict(kind='text',text='→',label='',border='none',widthEm=0,align='center',origin='printed')]
   for points in [None,4]:
    q['originalPoints']=points;q['pointsAtBodyEnd']=True
    output=Path(directory)/'exam.docx';export_document(dict(title='proof output',settings=dict(audience='student',workspaceLines=0),questions=[q]),output)
    with zipfile.ZipFile(output) as z:root=etree.fromstring(z.read('word/document.xml'))
    text=''.join(root.xpath('//w:t/text()',namespaces=NS))
    self.assertEqual(text.count('→'),1)
    for leader in ['…… ①','…… ②','…… ③']:self.assertIn(leader,text)
    self.assertEqual(text.count('4점'),0 if points is None else 1)
    self.assertEqual(len(root.xpath('//w:rPr/w:bdr',namespaces=NS)),5);self.assertEqual(len(root.xpath('//wp:inline',namespaces=NS)),3)
   for key in ['originalPoints','pointsAtBodyEnd','structureFigurePaths']:del q[key]
   arrow['inlines']=saved_arrow
   self.assertEqual(json.dumps(q),before)

if __name__=='__main__':unittest.main()
