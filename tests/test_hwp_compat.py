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
from export_docx import export_document
from hwp_compat import equation_plan, make_compatible
from verify_hwp import inspect, verify


class CompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.source=self.root/'editable.docx';self.output=self.root/'compatible.docx'
        self.snapshot={'title':'검증','settings':{'layout':'2','workspaceLines':1},'questions':[
            {'id':'q1','kind':'original','sourceId':'s1','body':r'직각 $\angle A=90^\circ$이다. $$\frac{1}{2}$$',
             'choices':[r'$3$'], 'answer':r'$\frac12$', 'solution':r'넓이 $S=\frac12$.'}]}
        self.snapshot_path=self.root/'snapshot.json'
        self.snapshot_path.write_text(json.dumps(self.snapshot,ensure_ascii=False),encoding='utf8')
        export_document(self.snapshot,self.source)
        Image.new('RGB',(80,40),'black').save(self.root/'formula.png')
        self.manifest={'version':1,'images':[dict(part=part,index=index,**formula,file='formula.png',widthPt=20,heightPt=10,depthPt=2)
                       for part,formulas in equation_plan(self.snapshot).items() for index,formula in enumerate(formulas)]}
        self.manifest_path=self.root/'images.json'
        self.write_manifest()
    def write_manifest(self):
        self.manifest_path.write_text(json.dumps(self.manifest),encoding='utf8')
    def run_convert(self):
        return make_compatible(self.source,self.snapshot_path,self.manifest_path,self.output)
    def test_source_preserved_all_parts_and_relationships(self):
        before=hashlib.sha256(self.source.read_bytes()).digest()
        result=self.run_convert()
        self.assertEqual(6,result['equationImages'])
        self.assertEqual(7,result['pictureImages'])  # Six equations and one shared black page divider.
        self.assertEqual(before,hashlib.sha256(self.source.read_bytes()).digest())
        with zipfile.ZipFile(self.output) as archive:
            for part,expected in [('document',6)]:
                root=etree.fromstring(archive.read(f'word/{part}.xml'))
                ns={'m':'http://schemas.openxmlformats.org/officeDocument/2006/math','w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
                self.assertEqual([],root.xpath('.//m:oMath',namespaces=ns))
                self.assertEqual([],root.xpath('.//w:position',namespaces=ns))
                equation_drawings=root.xpath('.//w:drawing[.//*[local-name()="docPr"][starts-with(@name,"Equation ")]]',namespaces=ns)
                self.assertEqual(expected,len(equation_drawings))
                relationships=etree.fromstring(archive.read(f'word/_rels/{part}.xml.rels'))
                targets={node.get('Id'):node.get('Target') for node in relationships}
                for image in root.xpath('.//a:blip',namespaces=ns):
                    rel=image.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                    self.assertIn('word/'+targets[rel],archive.namelist())
            self.assertNotIn('word/endnotes.xml',archive.namelist())
            self.assertEqual(1,len(root.xpath('//w:bookmarkStart[@w:name="solution_1"]',namespaces=ns)))
    def test_snapshot_mismatch_rejected_without_output(self):
        self.snapshot['questions'][0]['body']=self.snapshot['questions'][0]['body'].replace('90','80')
        self.snapshot_path.write_text(json.dumps(self.snapshot),encoding='utf8')
        with self.assertRaisesRegex(ValueError,'수식이 원문과 다릅니다'):
            self.run_convert()
        self.assertFalse(self.output.exists())
    def test_manifest_missing_formula_rejected(self):
        self.manifest['images'].pop();self.write_manifest()
        with self.assertRaisesRegex(ValueError,'수식 이미지 수'):
            self.run_convert()
    def test_manifest_wrong_formula_and_outside_path_rejected(self):
        self.manifest['images'][0]['latex']='2';self.write_manifest()
        with self.assertRaisesRegex(ValueError,'이미지가 원문과 다릅니다'):
            self.run_convert()
        self.manifest['images'][0]['latex']=equation_plan(self.snapshot)['word/document.xml'][0]['latex']
        self.manifest['images'][0]['file']='../outside.png';self.write_manifest()
        with self.assertRaisesRegex(ValueError,'준비 폴더 밖'):
            self.run_convert()
    def test_source_overwrite_rejected(self):
        with self.assertRaisesRegex(ValueError,'경로는 달라야'):
            make_compatible(self.source,self.snapshot_path,self.manifest_path,self.source)
    def test_hwp_actual_fixture_picture_loss_detected(self):
        fixture=Path(__file__).resolve().parent/'fixtures'/'docx_qa_sample.hwp'
        if not fixture.exists(): self.skipTest('HWP fixture missing')
        result=inspect(fixture)
        self.assertGreater(result['pictureRecords'],0)
        self.assertTrue(verify(fixture,result['pictureRecords'])['ok'])
        with self.assertRaisesRegex(ValueError,'누락되었습니다'):
            verify(fixture,result['pictureRecords']+1)


if __name__=='__main__': unittest.main()
