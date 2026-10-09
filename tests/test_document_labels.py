from pathlib import Path
import sys, tempfile, unittest, zipfile
from lxml import etree
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from export_docx import export_document

class DocumentLabelTests(unittest.TestCase):
    def test_labels_toggle_preserves_numbering_answers_and_notes(self):
        ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        with tempfile.TemporaryDirectory() as folder:
            for show in (True,False):
                questions=[dict(id='q'+str(i),kind=kind,sourceId='p1',body='값을 구하시오.',choices=[],answer='2',solution='양변에서 1을 빼면 2입니다.',layout='auto') for i,kind in enumerate(['original','variant'])]
                output=Path(folder)/f'labels-{show}.docx'
                export_document(dict(title='구분 표시 확인',settings=dict(layout='auto',workspaceLines=0,showQuestionLabels=show),questions=questions),output)
                with zipfile.ZipFile(output) as doc:
                    root=etree.fromstring(doc.read('word/document.xml'));texts=root.xpath('//w:t/text()',namespaces=ns)
                    self.assertEqual(any('[원본문제]' in t for t in texts),show)
                    self.assertEqual(any('[유사문제' in t for t in texts),show)
                    self.assertEqual(len(root.xpath('//w:hyperlink[starts-with(@w:anchor,"solution_")]',namespaces=ns)),2)
                    self.assertIn('빠른 정답',texts);self.assertIn('상세 풀이',texts)
                    self.assertTrue(any(t.startswith('1.') for t in texts));self.assertTrue(any(t.startswith('2.') for t in texts))
if __name__=='__main__':unittest.main()
