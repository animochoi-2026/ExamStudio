import sys, tempfile, unittest, zipfile
from pathlib import Path
from lxml import etree
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from export_docx import export_document

class StandaloneBlank(unittest.TestCase):
 def test_real_cell_border_and_centered_label_at_two_font_sizes(self):
  q = dict(id='local-blank', kind='original', sourceId='local-fixture', body='㉠', choices=[], answer='', solution='', include=True,
   layoutMode='structure', layoutDocument=dict(version=1, features=[], nodes=[dict(
    id='blank-line', parentId=None, type='paragraph', origin='printed', align='center', widthRatio=1,
    inlines=[dict(kind='blank', text='', label='㉠', border='box', widthEm=13, align='center', origin='printed')])]))
  ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
  with tempfile.TemporaryDirectory() as d:
   for size in [7, 15]:
    f=Path(d)/f'blank-{size}.docx'
    export_document(dict(title='blank', settings=dict(bodyFontSize=size, workspaceLines=0), questions=[q]), f)
    with zipfile.ZipFile(f) as z: doc=etree.fromstring(z.read('word/document.xml'))
    table=doc.xpath('//w:tbl[.//w:t="㉠"]', namespaces=ns)[0]
    self.assertEqual(table.xpath('./w:tblPr/w:jc/@w:val', namespaces=ns), ['center'])
    self.assertEqual(table.xpath('./w:tr/w:tc/w:p/w:pPr/w:jc/@w:val', namespaces=ns), ['center'])
    self.assertEqual(len(table.xpath('./w:tblPr/w:tblBorders/*[@w:val="single"]', namespaces=ns)), 4)
    # A final question reference may follow the blank, but its
    # hidden marker is not part of the visible centered label.
    self.assertEqual(table.xpath('.//w:t[not(ancestor::w:hyperlink)]/text()', namespaces=ns), ['㉠'])
    for link in table.xpath('.//w:hyperlink', namespaces=ns):
     self.assertEqual(len(link.xpath('.//w:vanish', namespaces=ns)), 1)
    self.assertTrue(0 < int(table.xpath('./w:tblPr/w:tblW/@w:w', namespaces=ns)[0]) < 5000)
    self.assertFalse(table.xpath('.//w:rPr/w:bdr', namespaces=ns))

if __name__ == '__main__': unittest.main()
