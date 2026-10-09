"""Local conversion tests; no AI or installed Hancom required."""
from pathlib import Path
import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from lxml import etree
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from export_docx import export_document, choice_rows
from hwp_native import prepare, equation
from word_math import parse_latex, MathSyntaxError


class NativeHwpTests(unittest.TestCase):
    def test_choice_labels_only_once_and_values_preserved(self):
        self.assertEqual(choice_rows(['① 6','② $7$',' ③8','9','10']), ['① 6','② $7$','③ 8','④ 9','⑤ 10'])
        self.assertEqual(choice_rows(['1.5','(1, 2)','①을 고른 이유']), ['① 1.5','② (1, 2)','③ 을 고른 이유'])

    def test_math_semantics_and_scoped_roman_units(self):
        render=lambda value:equation(parse_latex(value))
        self.assertEqual(render(r'\overline{AB}=\frac{13}{2}\,\mathrm{cm}'), ' bar {AB}={{13} over {2}}~{rm cm}')
        self.assertEqual(render(r'x_1^{2}+\sqrt[3]{8}'), '{x}_{1}^{2}+ root {3} of {8}')
        self.assertEqual(render(r'\overset{\frown}{AB}'), ' arch {AB}')
        self.assertEqual(render(r'90^\circ'), '9{0} DEG ')
        self.assertEqual(render(r'\alpha+\beta=\theta'), ' alpha + beta = theta ')
        self.assertEqual(render(r'\frac{11}{2}+\frac{11}{2}=\boxed{11}.'), '{{11} over {2}}+{{11} over {2}}={11}.')
        self.assertIn('pile', render(r'\begin{aligned}x&=1\\y&=2\end{aligned}'))
        self.assertIn('matrix', render(r'\begin{matrix}1&2\\3&4\end{matrix}'))
        with self.assertRaises(MathSyntaxError): render(r'\unsupported{x}')

    def test_native_manifest_covers_answers_and_preserves_diagrams_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            Image.new('RGB',(120,90),'white').save(root/'diagram.png')
            q=dict(id='q1',sourceId='s1',kind='original',body=r'$\angle A=60^\circ$',
                   statementBox=[r'ㄱ. $a=b$'],choices=['① $6$','② $7$'],
                   answer=r'$6$',solution=r'넓이는 $$\frac12\times3\times4=\boxed{6}$$',
                   diagramPath=str(root/'diagram.png'))
            snapshot=dict(title='한글 검증',settings={},questions=[q])
            snapshot_path=root/'snapshot.json'
            snapshot_path.write_text(json.dumps(snapshot),encoding='utf-8')
            source=root/'word.docx';output=root/'bridge.docx'
            export_document(snapshot,source)
            before=hashlib.sha256(source.read_bytes()).digest()
            result=prepare(source,snapshot_path,output)
            manifest=json.loads(Path(result['manifestPath']).read_text(encoding='utf-8'))
            self.assertEqual(result['nativeEquations'],7)
            self.assertEqual(len(result['warnings']),1)
            self.assertIn('사각 테두리', result['warnings'][0])
            self.assertEqual(result['pictureImages'],3)  # diagram plus two native section headers
            self.assertEqual([e['fontPt'] for e in manifest['equations']],[12,12,12,12,9,9,9])
            self.assertEqual(len({e['marker'] for e in manifest['equations']}),7)
            self.assertEqual(hashlib.sha256(source.read_bytes()).digest(),before)
            with zipfile.ZipFile(output) as package:
                all_xml=b''.join(package.read(n) for n in package.namelist() if n.endswith('.xml'))
                self.assertIn(b'ExamPageColumnRule',all_xml)
                self.assertIn(b'behindDoc="1"',all_xml)
                self.assertNotIn(b'<m:oMath',all_xml)
                self.assertNotIn(b'hwp-equation-',all_xml)
                doc=etree.fromstring(package.read('word/document.xml'))
                ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                self.assertTrue(all(x.get('{'+ns['w']+'}sep')=='1' for x in doc.findall('.//w:cols',ns)))
                text=''.join(doc.xpath('//w:t/text()',namespaces=ns))
                self.assertNotIn('① ①',text)
                self.assertEqual(text.count('EXAMEQ'),7)
            q['body']=r'$\angle A=70^\circ$'
            snapshot_path.write_text(json.dumps(snapshot),encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'원문이 다릅니다'):
                prepare(source,snapshot_path,root/'bad.docx')
            self.assertFalse((root/'bad.docx').exists())


if __name__=='__main__': unittest.main()
