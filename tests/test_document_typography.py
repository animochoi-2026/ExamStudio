"""DOCX formatting and native-HWP conversion preparation, without installed Office."""
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from lxml import etree
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from export_docx import export_document
from hwp_native import prepare

class TypographyTests(unittest.TestCase):
    def test_font_size_in_word_body_math_and_hwp_native_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            q=dict(id='q',sourceId='s',kind='original',body='본문 $x=2$ 입니다.',choices=['$2$'],answer='$2$',solution='이유 $x=2$')
            snapshot=dict(title='서식 검사',settings={'bodyFont':'바탕','bodyFontSize':16,'solutionFont':'돋움','solutionFontSize':14},questions=[q])
            output=root/'body.docx';export_document(snapshot,output)
            ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','m':'http://schemas.openxmlformats.org/officeDocument/2006/math'}
            with zipfile.ZipFile(output) as z:
                doc=etree.fromstring(z.read('word/document.xml'))
                paragraph=doc.xpath('//w:p[w:r/w:t[starts-with(.,"본문 ")]]',namespaces=ns)[0]
                self.assertEqual(paragraph.xpath('.//w:rFonts/@w:eastAsia',namespaces=ns)[0],'바탕')
                self.assertTrue(all(x=='32' for x in paragraph.xpath('.//w:sz/@w:val',namespaces=ns)))
                solution=doc.xpath('//w:p[w:r/w:t[starts-with(.,"이유 ")]]',namespaces=ns)[0]
                self.assertEqual(solution.xpath('.//w:rFonts/@w:eastAsia',namespaces=ns)[0],'돋움')
                self.assertTrue(all(x=='28' for x in solution.xpath('.//w:sz/@w:val',namespaces=ns)))
            input_path=root/'snapshot.json';input_path.write_text(json.dumps(snapshot),encoding='utf-8')
            result=prepare(output,input_path,root/'hwp-bridge.docx')
            manifest=json.loads(Path(result['manifestPath']).read_text(encoding='utf-8'))
            self.assertEqual([e['fontPt'] for e in manifest['equations']],[16,16,14,14,14])
            snapshot['settings']={};export_document(snapshot,root/'default.docx')
            with zipfile.ZipFile(root/'default.docx') as z:
                doc=etree.fromstring(z.read('word/document.xml'))
                paragraph=doc.xpath('//w:p[w:r/w:t[starts-with(.,"본문 ")]]',namespaces=ns)[0]
                self.assertEqual(paragraph.xpath('.//w:rFonts/@w:eastAsia',namespaces=ns)[0],'맑은 고딕')
                self.assertTrue(all(x=='24' for x in paragraph.xpath('.//w:sz/@w:val',namespaces=ns)))
                solution=doc.xpath('//w:p[w:r/w:t[starts-with(.,"이유 ")]]',namespaces=ns)[0]
                self.assertEqual(solution.xpath('.//w:rFonts/@w:eastAsia',namespaces=ns)[0],'맑은 고딕')
                self.assertTrue(all(x=='18' for x in solution.xpath('.//w:sz/@w:val',namespaces=ns)))

if __name__=='__main__': unittest.main()
