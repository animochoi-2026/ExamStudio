from pathlib import Path
import json, sys, tempfile, unittest, zipfile
from lxml import etree
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from structured_docx import split_source_points, for_output
from export_docx import export_document
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

class AnswerCountPoints(unittest.TestCase):
 def test_shared_variants_and_conditions(self):
  cases=json.loads((ROOT/'tests/fixtures/answer-count-points-cases.json').read_text(encoding='utf8'))
  for source,expected,_ in cases['remove']:
   self.assertEqual(split_source_points(source),expected,source)
  for source in cases['preserve']:
   self.assertEqual(split_source_points(source),source,source)

 def test_docx_count_and_explicit_source_score_option(self):
  raw=json.loads((ROOT/'tests/fixtures/answer-count-points-actual.json').read_text(encoding='utf8'))
  before=json.dumps(raw)
  with tempfile.TemporaryDirectory() as directory:
   for score in (None,3):
    q=dict(raw,body=split_source_points(raw['body']),include=True,originalPoints=score,pointsAtBodyEnd=True)
    file=Path(directory)/'exam.docx'
    export_document(dict(title='answer count',settings=dict(audience='student',workspaceLines=0,showQuestionLabels=False),questions=[q]),file)
    with zipfile.ZipFile(file) as z: root=etree.fromstring(z.read('word/document.xml'))
    text=''.join(root.xpath('//w:t/text()',namespaces=NS))
    self.assertIn('(정답 2개)',text);self.assertNotIn('/3점',text);self.assertEqual(text.count('3점'),0 if score is None else 1)
    self.assertEqual(len(root.xpath('//w:t[text()="① "]',namespaces=NS)),1)
   structured=dict(raw,layoutDocument=dict(nodes=[dict(id='prompt',parentId=None,type='paragraph',origin='printed',inlines=[dict(kind='text',origin='printed',text=raw['body'])])]))
   self.assertEqual(for_output(structured)['layoutDocument']['nodes'][0]['inlines'][0]['text'],raw['body'].replace('/3점',''))
  self.assertEqual(json.dumps(raw),before)

if __name__=='__main__': unittest.main()
