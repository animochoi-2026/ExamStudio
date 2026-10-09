"""Focused compatibility checks; no rendering or external programs required."""
from pathlib import Path
import sys
import unittest
from lxml import etree as E

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
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


if __name__ == '__main__':
    unittest.main()
