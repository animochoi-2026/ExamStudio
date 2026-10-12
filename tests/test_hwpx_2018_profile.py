"""Focused compatibility checks; no rendering or external programs required."""
from pathlib import Path
import sys, os
import unittest
from lxml import etree as E

sys.path.insert(0, os.environ.get('EXAM_EXPORT_ENGINE_DIR', str(Path(__file__).resolve().parents[1] / 'scripts')))
import export_hwpx as h


class ProfileTests(unittest.TestCase):
    def header(self, other='120', direction='LTR'):
        return E.fromstring(f'''<hh:head xmlns:hh="{h.NS['hh']}" xmlns:hp="{h.NS['hp']}" version="1.5">
          <hh:paraPr textDir="{direction}"><hp:switch>
          <hp:case required-namespace="urn:test"><hh:margin left="{other}"/><hh:lineSpacing type="PERCENT" value="120"/></hp:case>
          <hp:default><hh:margin left="120"/><hh:lineSpacing type="PERCENT" value="120"/></hp:default>
          </hp:switch></hh:paraPr></hh:head>''')

    def test_identical_branches_become_explicit_without_changing_spacing(self):
        root = self.header()
        h.compatible_2018_header(root)
        para = root.find('hh:paraPr', h.NS)
        self.assertEqual(root.get('version'), '1.4')
        self.assertIsNone(para.get('textDir'))
        self.assertIsNone(para.find('hp:switch', h.NS))
        self.assertEqual(para.find('hh:margin', h.NS).get('left'), '120')
        self.assertEqual(para.find('hh:lineSpacing', h.NS).attrib, {'type': 'PERCENT', 'value': '120'})
        before = E.tostring(root)
        h.compatible_2018_header(root)
        self.assertEqual(E.tostring(root), before)

    def test_different_branches_and_non_ltr_direction_are_preserved(self):
        root = self.header(other='240', direction='RTL')
        h.compatible_2018_header(root)
        para = root.find('hh:paraPr', h.NS)
        self.assertEqual(para.get('textDir'), 'RTL')
        self.assertIsNotNone(para.find('hp:switch', h.NS))

    def test_final_package_retains_accepted_profile_and_native_auto_equations(self):
        # Lock the exported ZIP, not only a helper: a later serialization pass
        # previously reintroduced reader-specific branches after normalization.
        import tempfile, zipfile
        data = dict(title='호환성 검증', questions=[dict(id='q1', sourceId='q1',
                    kind='original', include=True, body=r'값 $x=\frac{7}{2}$를 구하시오.',
                    answer='3.5', solution='계산한다.')],
                    settings=dict(bodyFontSize=10, solutionFontSize=9, workspaceLines=0))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'profile.hwpx'
            h.export_document(data, path)
            with zipfile.ZipFile(path) as z:
                header = E.fromstring(z.read('Contents/header.xml'))
                version = E.fromstring(z.read('version.xml'))
                self.assertEqual(header.get('version'), '1.4')
                for key, value in h.HWP2018_PROFILE.items():
                    self.assertEqual(version.get(key), value)
                self.assertEqual(version.get('appVersion'), 'hwpx-2018-profile-1')
                sections = [E.fromstring(z.read(name)) for name in z.namelist()
                            if name.startswith('Contents/section') and name.endswith('.xml')]
                used = {p.get('paraPrIDRef') for section in sections for p in section.findall('.//hp:p', h.NS)}
                paras = [p for p in header.findall('.//hh:paraPr', h.NS) if p.get('id') in used]
                self.assertTrue(paras)
                for para in paras:
                    self.assertFalse(para.findall('hp:switch', h.NS))
                    self.assertIsNone(para.get('textDir'))
                    self.assertIsNotNone(para.find('hh:margin', h.NS))
                    self.assertIsNotNone(para.find('hh:lineSpacing', h.NS))
                equations = []
                for name in z.namelist():
                    if name.startswith('Contents/section') and name.endswith('.xml'):
                        equations.extend(E.fromstring(z.read(name)).findall('.//hp:equation', h.NS))
                self.assertTrue(equations)
                for eq in equations:
                    self.assertEqual(eq.get('baseLine'), '0')
                    size = eq.find('hp:sz', h.NS)
                    self.assertEqual([size.get('width'), size.get('height')], ['0', '0'])


if __name__ == '__main__':
    unittest.main()
