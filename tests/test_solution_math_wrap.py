import sys,unittest,tempfile,zipfile
from pathlib import Path
from lxml import etree
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import export_docx as e
from word_math import parse_latex,dimensions,MathSyntaxError
class SolutionMathWrap(unittest.TestCase):
 def test_actual_long_area_equation_is_split_without_changing_tokens(self):
  s=r'\triangle AOC\text{의 넓이}+\triangle BOC\text{의 넓이}=47-15=32.'
  rows=e.solution_math_lines(s,9)
  self.assertGreater(len(rows),1); self.assertEqual(''.join(rows),s)
  self.assertTrue(all(dimensions(parse_latex(row))[0]*9<=e.COL_WIDTH_PT*.8 for row in rows))
 def test_short_fraction_stays_whole(self):
  s=r'\frac12\times32=\boxed{16}'
  self.assertEqual(e.solution_math_lines(s,9),[s])
 def test_grouped_large_object_is_not_silently_clipped(self):
  with self.assertRaises(MathSyntaxError): e.solution_math_lines(r'\frac{'+('1234567890'*12)+'}{2}',9)
 def test_web_opt_in_keeps_native_math_and_original_solution(self):
  s=r'\[\triangle AOC\text{의 넓이}+\triangle BOC\text{의 넓이}=47-15=32.\]'
  q={'id':'q','sourceId':'q','kind':'original','body':'문제','choices':[],'answer':'16','solution':s}
  with tempfile.TemporaryDirectory() as d:
   output=Path(d)/'web.docx';e.export_document({'title':'검증','settings':{'answerMode':'detailed','wrapSolutionMath':True,'workspaceLines':0},'questions':[q]},output)
   xml=etree.fromstring(zipfile.ZipFile(output).read('word/document.xml'));ns={'m':e.M_NS,'w':e.W_NS}
   self.assertGreater(len(xml.xpath('//m:oMath',namespaces=ns)),1)
   self.assertIn('32.',''.join(xml.xpath('//m:t/text()',namespaces=ns)))
   self.assertEqual(q['solution'],s)
if __name__=='__main__':unittest.main()
