import copy, json, sys, unittest, zipfile
from pathlib import Path
from lxml import etree as E
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from export_docx import export_document
from export_hwpx import export_document as hwpx

class WatermarkTest(unittest.TestCase):
    def test_client_output_mark_and_metadata_without_original_mutation(self):
        out=Path(__file__).resolve().parent/'artifacts/download-security'
        out.mkdir(parents=True,exist_ok=True)
        raw={'title':'출력 보존 검사','settings':{'showQuestionLabels':False,'workspaceLines':0,'wrapSolutionMath':True,'audience':'teacher','solutionGuideMode':'text'},'questions':[
            {'id':'q'+str(i),'sourceId':'s'+str(i),'kind':'original','include':True,'body':r'방정식 $x+1=3$의 해를 구하시오.','answer':'2','solution':r'$x=3-1=2$이다.','workspaceMm':20,'originalPoints':i+2} for i in range(2)]}
        frozen=copy.deepcopy(raw)
        for code in ('0012','9876'):
            snapshot={**copy.deepcopy(raw),'securityWatermark':code}
            doc=out/(code+'.docx');export_document(snapshot,doc)
            with zipfile.ZipFile(doc) as z:
                root=E.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                runs=root.xpath('//w:r[w:t="'+code+'"]',namespaces=ns)
                self.assertEqual(len(runs),2)
                for run in runs:
                    self.assertEqual(run.xpath('string(w:rPr/w:sz/@w:val)',namespaces=ns),'2')
                    self.assertEqual(run.xpath('string(w:rPr/w:color/@w:val)',namespaces=ns),'FFFFFF')
                self.assertIn('>'+code+'<',z.read('docProps/core.xml').decode())
            h=out/(code+'.hwpx');hwpx(snapshot,h)
            with zipfile.ZipFile(h) as z:
                sections=[E.fromstring(z.read(n)) for n in z.namelist() if n.startswith('Contents/section') and n.endswith('.xml')]
                runs=[r for s in sections for r in s.xpath('//*[local-name()="run"][*[local-name()="t" and text()="'+code+'"]]')]
                self.assertEqual(len(runs),2)
                header=E.fromstring(z.read('Contents/header.xml'))
                for run in runs:
                    style=header.xpath('//*[local-name()="charPr"][@id="'+run.get('charPrIDRef')+'"]')[0]
                    self.assertEqual(style.get('height'),'100')
                    self.assertEqual(style.get('textColor'),'#FFFFFF')
                self.assertIn('>'+code+'<',z.read('Contents/content.hpf').decode())
            (out/(code+'.json')).write_text(json.dumps(snapshot,ensure_ascii=False),encoding='utf8')
        self.assertEqual(raw,frozen)
        with self.assertRaises(ValueError):export_document({**raw,'securityWatermark':'bad'},out/'invalid.docx')

if __name__=='__main__':unittest.main()
