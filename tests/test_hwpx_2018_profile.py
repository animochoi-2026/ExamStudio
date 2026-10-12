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

    def test_serialized_spacing_matches_hangul_2018_saved_xml_units(self):
        # Observed in a file re-saved by Hangul 10.0.0.14910: a 15pt minimum
        # is case=1500/default=3000; negative indents double too.
        root = E.fromstring(f'''<hh:head xmlns:hh="{h.NS['hh']}" xmlns:hc="{h.NS['hc']}">
          <hh:paraPr><hh:margin><hc:intent value="-1310" unit="HWPUNIT"/>
          <hc:next value="500" unit="HWPUNIT"/></hh:margin>
          <hh:lineSpacing type="AT_LEAST" value="1500" unit="HWPUNIT"/></hh:paraPr>
          <hh:paraPr><hh:lineSpacing type="PERCENT" value="150" unit="HWPUNIT"/></hh:paraPr>
          <hh:paraPr><hh:lineSpacing type="FIXED" value="13605" unit="HWPUNIT"/></hh:paraPr>
          </hh:head>''')
        original = E.tostring(root)
        saved = h.serialized_2018_header(root)
        self.assertEqual(E.tostring(root), original)
        modern = saved.findall('.//hp:case/hh:lineSpacing', h.NS)
        legacy = saved.findall('.//hp:default/hh:lineSpacing', h.NS)
        self.assertEqual([x.get('value') for x in modern], ['1500', '150', '13605'])
        self.assertEqual([x.get('value') for x in legacy], ['3000', '150', '27210'])
        self.assertEqual(saved.find('.//hp:default/hh:margin/hc:intent', h.NS).get('value'), '-2620')
        self.assertEqual(saved.find('.//hp:case', h.NS).get(h.tag('hp:required-namespace')),
                         'http://www.hancom.co.kr/hwpml/2016/HwpUnitChar')
        self.assertEqual(E.tostring(h.serialized_2018_header(saved)), E.tostring(saved))


if __name__ == '__main__':
    unittest.main()
