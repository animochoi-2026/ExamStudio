"""Structural regression checks for equations, two-column answers, and reading order.

These checks deliberately do not claim Word/Hancom visual pagination fidelity.
Run with the bundled Python: python -m unittest discover -s tests -p test_export_docx.py
"""
from pathlib import Path
from io import BytesIO
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile

from lxml import etree
from docx.shared import Mm, Pt
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from export_docx import export_document, plan_layout, validate_snapshot, estimate_text, PPR_ORDER, RPR_ORDER, SECT_ORDER
from word_math import MathSyntaxError, dimensions, latex_to_omml, parse_latex, split_math

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
      "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
      "ct": "http://schemas.openxmlformats.org/package/2006/content-types"}


def question(index, *, body=None, kind=None, source=None, layout="auto"):
    return {"id": f"q{index}", "kind": kind or ("original" if index % 3 == 1 else "variant"),
            "sourceId": source or ("s1" if index < 4 else "s2"),
            "body": body or r"직각삼각형에서 $AB=13$, $AC=5$, $BC=12$이다. 외심 $O$와 내심 $I$에 대하여 넓이를 구하시오.",
            "choices": [], "answer": r"$\frac{7}{2}$",
            "solution": r"빗변의 중점이 외심이므로 $AO=\frac{13}{2}$이다." + "\n" +
                        r"$$\frac12\times\frac72\times2=\frac72$$",
            "layout": layout}


class NativeMathTests(unittest.TestCase):
    def test_number_starts_with_prose_and_only_final_reference_is_hidden(self):
        with tempfile.TemporaryDirectory() as directory:
            q = question(1, body='본문 $x^2+y_1$의 값을 구하시오.\n두 번째 조건을 유지한다.')
            q.update(choices=['첫 보기', '마지막 보기'], webChoiceColumns=2)
            output = Path(directory) / 'inline.docx'
            export_document({'title':'검증','questions':[q], 'settings':{'showQuestionLabels':False,'workspaceLines':0,'answerMode':'quick'}}, output)
            with zipfile.ZipFile(output) as z:
                doc = etree.fromstring(z.read('word/document.xml'))
            first = doc.xpath('//w:p[w:pPr/w:pStyle[@w:val="QuestionLabel"]]', namespaces=NS)[0]
            self.assertTrue(''.join(first.xpath('.//w:t/text()',namespaces=NS)).startswith('1. 본문 '))
            self.assertFalse(first.xpath('.//w:hyperlink',namespaces=NS))
            reference = doc.xpath('//w:hyperlink',namespaces=NS)[0]
            self.assertEqual(reference.get('{'+NS['w']+'}anchor'), 'solution_1')
            self.assertEqual(reference.xpath('.//w:color/@w:val',namespaces=NS), ['FFFFFF'])
            self.assertEqual(len(doc.xpath('//w:vanish',namespaces=NS)), 1)
            self.assertEqual(len(reference.xpath('.//w:vanish',namespaces=NS)), 1)
            self.assertTrue(doc.xpath('//m:sSup',namespaces=NS))
            self.assertTrue(doc.xpath('//m:sSub',namespaces=NS))
            self.assertEqual(doc.xpath('//w:bookmarkStart/@w:name',namespaces=NS), ['solution_1'])
            self.assertTrue(reference.xpath('preceding::w:t[contains(.,"마지막 보기")]',namespaces=NS))

    def test_web_points_follow_problem_sentence_and_quadrant_spacing(self):
        with tempfile.TemporaryDirectory() as directory:
            first, second = question(1, body='넓이를 구하시오.'), question(2, body='각을 구하시오.')
            first.update(originalPoints='4', pointsAtBodyEnd=True, quadrantFill=True, workspaceMm=0)
            second.update(originalPoints='3', pointsAtBodyEnd=True, workspaceMm=0)
            output = Path(directory) / 'quadrants.docx'
            export_document({'title':'시험지','questions':[first,second], 'settings':{'showQuestionLabels':False,'workspaceLines':0,'quadrantLayout':True,'measuredPages':[[['q1','q2'],[]]],'answerMode':'quick'}},output)
            with zipfile.ZipFile(output) as archive:
                doc=etree.fromstring(archive.read('word/document.xml'))
                # The approved hidden reference now follows the full question.
                # Visible prose excludes that link, not the points or equations.
                paragraphs=[''.join(p.xpath('.//w:t[not(ancestor::w:hyperlink)]/text()',namespaces=NS)) for p in doc.xpath('//w:body/w:p',namespaces=NS)]
                self.assertTrue(any(p.endswith('넓이를 구하시오. (4점)') for p in paragraphs))
                self.assertTrue(any(p.endswith('각을 구하시오. (3점)') for p in paragraphs))
                self.assertNotIn('1. (4점)', ''.join(paragraphs))
                self.assertGreater(len(doc.xpath('//w:body/w:p[w:pPr/w:spacing[@w:after]]',namespaces=NS)),0)

    def test_web_exam_header_and_mixed_question_points(self):
        with tempfile.TemporaryDirectory() as directory:
            q = question(1, body='삼각형의 넓이를 구하시오.')
            q.update(originalPoints=4, sourceCaption='광희중 · 원문 16번')
            output = Path(directory) / 'web-exam.docx'
            export_document({'title': '중간고사', 'questions': [q], 'settings': {'showStudentNameLine': True, 'showQuestionLabels': False, 'answerMode': 'quick'}}, output)
            with zipfile.ZipFile(output) as archive:
                document = etree.fromstring(archive.read('word/document.xml'))
                header = etree.fromstring(archive.read('word/header1.xml'))
                self.assertIn('1. (4점)', ''.join(document.xpath('//w:t/text()', namespaces=NS)))
                self.assertIn('광희중 · 원문 16번', ''.join(document.xpath('//w:t/text()', namespaces=NS)))
                self.assertNotIn('이름:', ''.join(header.xpath('//w:t/text()', namespaces=NS)))
                first_header = etree.fromstring(archive.read('word/header2.xml'))
                self.assertIn('이름: ________________', ''.join(first_header.xpath('//w:t/text()', namespaces=NS)))
                self.assertTrue(all(value == '1' for value in document.xpath('//w:cols/@w:sep', namespaces=NS)))

    def test_original_number_points_and_optional_source_caption(self):
        with tempfile.TemporaryDirectory() as directory:
            q = question(1, body=r'삼각형 $ABC$의 넓이를 구하시오.')
            q.update(printedNumber='16', originalPoints='4점', sourceCaption='광희중 · 중2 · 2026학년도 · 2학기 · 중간고사 · 원문 16번')
            output = Path(directory) / 'source.docx'
            export_document({'title': '기출', 'questions': [q], 'settings': {'answerMode':'quick','showQuestionLabels':False}}, output)
            with zipfile.ZipFile(output) as archive:
                doc = etree.fromstring(archive.read('word/document.xml'))
                text = ''.join(doc.xpath('//w:t/text()', namespaces=NS))
                self.assertIn('16. (4점)', text)
                self.assertNotIn('4점점', text)
                self.assertIn('광희중 · 중2 · 2026학년도', text)
                self.assertIn('16번', text)

    def test_solution_comment_is_in_teacher_endnotes_without_changing_problem(self):
        with tempfile.TemporaryDirectory() as directory:
            q = question(1, body='합동이 될 수 없는 조건은?')
            q['solution'] = '합동을 보장하는지 확인한다.\n\n[참고 코멘트]\n각이 같아도 크기의 일치는 보장되지 않는다.'
            output = Path(directory) / 'comment.docx'
            export_document({'title': '풀이집', 'questions': [q], 'settings': {}}, output)
            with zipfile.ZipFile(output) as archive:
                doc = etree.fromstring(archive.read('word/document.xml'))
                notes = etree.fromstring(archive.read('word/document.xml'))
                self.assertIn('합동이 될 수 없는 조건은?', ''.join(doc.xpath('//w:t/text()', namespaces=NS)))
                text = ''.join(notes.xpath('//w:t/text()', namespaces=NS))
                self.assertIn('[참고 코멘트]', text)
                self.assertTrue(text.endswith('각이 같아도 크기의 일치는 보장되지 않는다.'))

    def test_boxed_statements_keep_letters_equations_and_have_no_choice_number(self):
        with tempfile.TemporaryDirectory() as directory:
            q = question(1, body="보기에서 옳은 것을 모두 쓰시오.")
            q['statementBox'] = [r'ㄱ. $\frac{1}{2}$이다.', 'ㄴ. 삼각형이다.']
            output = Path(directory) / 'statements.docx'
            export_document({'title': '보기', 'questions': [q], 'settings': {}}, output)
            with zipfile.ZipFile(output) as archive:
                doc = etree.fromstring(archive.read('word/document.xml'))
                paragraphs = doc.xpath('//w:p[w:pPr/w:pBdr]', namespaces=NS)
                self.assertEqual(len(paragraphs), 2)
                text = ''.join(paragraphs[0].xpath('.//w:t/text()', namespaces=NS))
                self.assertTrue(text.startswith('ㄱ.'))
                self.assertNotIn('①', text)
                self.assertEqual(len(paragraphs[0].xpath('.//m:f', namespaces=NS)), 1)

    def test_box_and_diagram_follow_source_position_between_paragraphs(self):
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / 'diagram.png'
            Image.new('RGB', (120, 70), 'white').save(image)
            q = question(1, body='앞 문장이다.\n\n뒤 문장이다.')
            q.update(statementBox=['ㄱ. 첫 조건', 'ㄴ. 둘째 조건'], boxSlot='gap:1',
                     diagramPath=str(image), figurePlacements={'diagram': 'gap:1'})
            output = Path(directory) / 'ordered.docx'
            export_document({'title': '원본 배치', 'questions': [q], 'settings': {}}, output)
            with zipfile.ZipFile(output) as archive:
                doc = etree.fromstring(archive.read('word/document.xml'))
                body = doc.xpath('//w:body/w:p', namespaces=NS)
                descriptions = [''.join(p.xpath('.//w:t/text()', namespaces=NS)) or
                                ('[도형]' if p.xpath('.//wp:docPr', namespaces=NS) else '') for p in body]
                positions = [next(i for i, text in enumerate(descriptions) if label in text)
                             for label in ['앞 문장', 'ㄱ. 첫 조건', 'ㄴ. 둘째 조건', '[도형]', '뒤 문장']]
                self.assertEqual(positions, sorted(positions))
                boxed = [p for p in body if p.xpath('./w:pPr/w:pBdr', namespaces=NS)]
                self.assertEqual(len(boxed), 2)
                self.assertEqual(len(boxed[0].xpath('./w:pPr/w:pBdr/w:top', namespaces=NS)), 1)
                self.assertEqual(len(boxed[0].xpath('./w:pPr/w:pBdr/w:bottom', namespaces=NS)), 0)
                self.assertEqual(len(boxed[1].xpath('./w:pPr/w:pBdr/w:bottom', namespaces=NS)), 1)

    def test_printed_outer_border_keeps_body_diagram_and_choices_inside(self):
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / 'diagram.png'
            Image.new('RGB', (120, 70), 'white').save(image)
            q = question(1, body='조건을 읽으시오.\n\n도형을 보고 답하시오.')
            q.update(bodyBorder=True, diagramPath=str(image),
                     figurePlacements={'diagram': 'gap:1'}, choices=['① 첫째', '② 둘째'])
            output = Path(directory) / 'outer-box.docx'
            export_document({'title': '테두리', 'questions': [q], 'settings': {}}, output)
            with zipfile.ZipFile(output) as archive:
                doc = etree.fromstring(archive.read('word/document.xml'))
                body = doc.xpath('//w:body/w:p', namespaces=NS)
                boxed = [p for p in body if p.xpath('./w:pPr/w:pBdr', namespaces=NS)]
                text = ''.join(''.join(p.xpath('.//w:t/text()', namespaces=NS)) for p in boxed)
                self.assertIn('조건을 읽으시오.', text)
                self.assertIn('도형을 보고 답하시오.', text)
                self.assertIn('①', text)
                self.assertTrue(any(p.xpath('.//wp:docPr', namespaces=NS) for p in boxed))
                self.assertEqual(len(boxed[0].xpath('./w:pPr/w:pBdr/w:top', namespaces=NS)), 1)
                self.assertEqual(len(boxed[-1].xpath('./w:pPr/w:pBdr/w:bottom', namespaces=NS)), 1)

    def test_legacy_student_setting_always_includes_fast_answers_and_endnotes(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'student.docx'
            q = question(1)
            q['answer'] = 'SECRET_ANSWER'
            q['solution'] = 'SECRET_SOLUTION'
            result = export_document({'title': '학생용', 'questions': [q], 'settings': {'audience': 'student'}}, output)
            with zipfile.ZipFile(output) as archive:
                self.assertNotIn('word/endnotes.xml', archive.namelist())
                xml = archive.read('word/document.xml').decode('utf-8')
                self.assertIn('SECRET_ANSWER', xml)
                self.assertLess(xml.index('빠른 정답'), xml.index('SECRET_ANSWER'))
                self.assertIn('SECRET_SOLUTION', xml)
                self.assertLess(xml.index('상세 풀이'), xml.index('SECRET_SOLUTION'))
                self.assertIn('solution_1', xml)
            self.assertGreater(result['solutionPageCountEstimate'], 0)
            self.assertEqual(q['answer'], 'SECRET_ANSWER')

    def test_nested_fractions_roots_and_scripts_are_structural(self):
        xml = latex_to_omml(r"\frac{1+\sqrt[3]{x_1^2}}{\frac{a}{b}}=90^\circ")
        self.assertEqual(2, len(xml.xpath(".//m:f", namespaces=NS)))
        self.assertEqual(1, len(xml.xpath(".//m:rad", namespaces=NS)))
        self.assertEqual(1, len(xml.xpath(".//m:sSubSup", namespaces=NS)))
        self.assertEqual("3", "".join(xml.xpath(".//m:deg//m:t/text()", namespaces=NS)))
        self.assertIn("°", xml.xpath(".//m:t/text()", namespaces=NS))

    def test_unbraced_fraction_geometry_and_greek(self):
        xml = latex_to_omml(r"\angle ABC=\theta,\quad\overline{AB}\perp\overline{CD},\;\frac72")
        self.assertEqual(["7"], xml.xpath(".//m:num//m:t/text()", namespaces=NS))
        self.assertEqual(["2"], xml.xpath(".//m:den//m:t/text()", namespaces=NS))
        self.assertEqual(2, len(xml.xpath(".//m:bar", namespaces=NS)))
        for symbol in ["∠", "θ", "⊥"]:
            self.assertIn(symbol, xml.xpath(".//m:t/text()", namespaces=NS))

    def test_delimiters_aligned_cases_and_text(self):
        xml = latex_to_omml(r"\left(\frac{a}{b}\right)^2+\begin{aligned}x&=2\\y&=3\end{aligned}")
        self.assertEqual(1, len(xml.xpath(".//m:d", namespaces=NS)))
        self.assertEqual(2, len(xml.xpath(".//m:eqArr/m:e", namespaces=NS)))
        cases = latex_to_omml(r"\begin{cases}1&\text{양수}\\0&\text{그 외}\end{cases}")
        self.assertEqual(2, len(cases.xpath(".//m:mr", namespaces=NS)))
        self.assertIn("양수", cases.xpath(".//m:t/text()", namespaces=NS))

    def test_double_escaped_inline_commands_do_not_become_math_line_breaks(self):
        xml = latex_to_omml(r"\\widehat{AB}:\\widehat{BC}")
        self.assertEqual(2, len(xml.xpath(".//m:acc", namespaces=NS)))
        self.assertEqual(["AB", "BC"], ["".join(n.xpath(".//m:t/text()", namespaces=NS)) for n in xml.xpath(".//m:acc/m:e", namespaces=NS)])
        # A real row break in an aligned environment must retain its meaning.
        aligned = latex_to_omml(r"\begin{aligned}x&=1\\y&=2\end{aligned}")
        self.assertEqual(2, len(aligned.xpath(".//m:eqArr/m:e", namespaces=NS)))

    def test_unknown_and_malformed_math_fails_explicitly(self):
        for source in [r"\madeup{x}", r"\frac{1}", r"x^^2", r"\left(x", "{a", "x}", r"\begin{align}x\end{align}"]:
            with self.subTest(source=source), self.assertRaises(MathSyntaxError):
                latex_to_omml(source)
        for text in ["미완성 $x", "미완성 $$x$", "빈 수식 $$ $$"]:
            with self.subTest(text=text), self.assertRaises(MathSyntaxError):
                split_math(text)

    def test_overset_arcs_preserve_base_annotation_and_nested_fractions(self):
        source = r"\overset{\frown}{AB}:\overset{\frown}{BC}=\frac{2}{3}"
        xml = latex_to_omml(source)
        self.assertEqual(['AB', 'BC'], [''.join(e.xpath('.//m:t/text()', namespaces=NS)) for e in xml.xpath('.//m:limUpp/m:e', namespaces=NS)])
        self.assertEqual(['⌢', '⌢'], xml.xpath('.//m:limUpp/m:lim//m:t/text()', namespaces=NS))
        self.assertEqual(1, len(xml.xpath('.//m:f', namespaces=NS)))
        self.assertGreater(dimensions(parse_latex(source))[1], dimensions(parse_latex('AB:BC'))[1])
        other = latex_to_omml(r"\underset{x\to0}{\overset{\text{정의}}{=}}+\stackrel{\frac{1}{2}}{AB}")
        self.assertEqual(1, len(other.xpath('.//m:limLow', namespaces=NS)))
        self.assertEqual(2, len(other.xpath('.//m:limUpp', namespaces=NS)))
        for bad in [r'\overset{\frown}', r'\overset{\madeup}{AB}', r'\underset{a}{']:
            with self.subTest(bad=bad), self.assertRaises(MathSyntaxError):
                latex_to_omml(bad)

    def test_arc_export_in_body_choices_answer_and_endnotes(self):
        with tempfile.TemporaryDirectory() as directory:
            q = question(3, body=r'두 호의 비는 $\overset{\frown}{AB}:\overset{\frown}{BC}=2:3$이다.')
            q.update(choices=[r'$\overset{\frown}{AB}$', r'$\frac{1}{2}$'], answer=r'$\overset{\frown}{AB}=40^\circ$', solution=r'호의 비에서 $\overset{\frown}{AB}=\frac{2}{5}\times100^\circ=40^\circ$이다.')
            output = Path(directory) / 'arcs.docx'
            export_document({'title': '호의 비', 'questions': [q], 'settings': {}}, output)
            with zipfile.ZipFile(output) as archive:
                doc = etree.fromstring(archive.read('word/document.xml'))
                notes = etree.fromstring(archive.read('word/document.xml'))
                self.assertGreaterEqual(len(doc.xpath('//m:limUpp', namespaces=NS)), 4)
                self.assertEqual(2, len(notes.xpath('//w:p[w:pPr/w:pStyle[@w:val="EndnoteText"] or w:bookmarkStart]//m:limUpp', namespaces=NS)))
                self.assertNotIn('overset', archive.read('word/document.xml').decode())

    def test_mixed_text_preserves_escaped_dollar_and_displays(self):
        self.assertEqual([("text", "가격 $5, "), ("inline", "x"), ("text", "와 "), ("display", r"\frac12")],
                         split_math(r"가격 \$5, $x$와 $$\frac12$$"))
        self.assertGreater(dimensions(parse_latex(r"\frac{1}{\sqrt{x}}"))[1], 2)
        primes = latex_to_omml("A'B''")
        self.assertEqual(["′", "′′"], primes.xpath(".//m:sSup/m:sup//m:t/text()", namespaces=NS))


class ExportTests(unittest.TestCase):
    def test_no_writing_room_keeps_midpoints_and_tall_question_owns_only_its_column(self):
        from unittest.mock import patch
        from export_docx import COL_HEIGHT_PT, HALF_HEIGHT_PT, add_question, configure_document
        from docx import Document
        qs = [question(i) for i in range(1, 5)]
        heights = [HALF_HEIGHT_PT + 5, 80, 100, 110]
        with patch('export_docx.estimate_question', side_effect=heights):
            pages, _, _ = plan_layout(qs, {'workspaceLines': 0})
        self.assertEqual(len(pages), 2)
        self.assertEqual([(p['column'], p['slot']) for p in pages[0]['positions']],
                         [(0, 0), (1, 0), (1, 1)])
        self.assertEqual(pages[1]['questionIds'], ['q4'])
        document = Document()
        configure_document(document, '공간 없음')
        add_question(document, qs[0], 1, {}, 90, HALF_HEIGHT_PT, 0, False)
        # No blank writing paragraph, even when the old caller supplies a slot.
        self.assertTrue(document.paragraphs[-1].text.strip())
        with patch('export_docx.estimate_question', side_effect=[100, 100]):
            pages, _, _ = plan_layout(qs[:2], {'workspaceLines': 0})
        self.assertEqual([p['column'] for p in pages[0]['positions']], [0, 0])
        with patch('export_docx.estimate_question', side_effect=[100, 100]):
            pages, _, _ = plan_layout(qs[:2], {'workspaceLines': 0, 'layout': '2'})
        self.assertEqual([p['column'] for p in pages[0]['positions']], [0, 1])

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="exam_docx_test_")
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name) / "시험지.docx"

    def snapshot(self, questions=None):
        return {"title": "도형 유사문제", "settings": {"layout": "auto", "workspaceLines": 4},
                "questions": questions or [question(i) for i in range(1, 7)]}

    def read_xml(self, member):
        with zipfile.ZipFile(self.output) as package:
            return etree.fromstring(package.read(member))

    def test_native_two_column_and_numbering_in_reading_order(self):
        manifest = export_document(self.snapshot(), self.output)
        document = self.read_xml("word/document.xml")
        columns = document.xpath(".//w:sectPr/w:cols", namespaces=NS)[0]
        self.assertEqual("2", columns.get(f"{{{NS['w']}}}num"))
        self.assertEqual(["1", "1"], document.xpath(".//w:sectPr/w:cols/@w:sep", namespaces=NS))
        headers = document.xpath(".//w:sectPr/w:headerReference[@w:type='default']/@r:id", namespaces=NS)
        self.assertEqual(2, len(headers))
        self.assertEqual(1, len(set(headers)))
        rules = self.read_xml("word/header1.xml").xpath(".//w:drawing/wp:anchor[wp:docPr[@name='ExamPageColumnRule']]", namespaces=NS)
        self.assertEqual(1, len(rules))
        appendix_rules = document.xpath(".//w:p[w:pPr/w:pStyle[@w:val='EndnoteHeading']]//wp:anchor[wp:docPr[@name='ExamPageColumnRule']]", namespaces=NS)
        self.assertEqual(0, len(appendix_rules))
        for rule, rule_id in zip(rules+appendix_rules, ("1000000", "1000001")):
            self.assertEqual([rule_id], rule.xpath("wp:docPr/@id", namespaces=NS))
            self.assertEqual("0", rule.get("behindDoc"))
            self.assertEqual("251659264", rule.get("relativeHeight"))
            self.assertEqual(1, len(rule.xpath("wp:wrapNone", namespaces=NS)))
            self.assertEqual(["page"], rule.xpath("wp:positionH/@relativeFrom", namespaces=NS))
            self.assertEqual(["page"], rule.xpath("wp:positionV/@relativeFrom", namespaces=NS))
            self.assertEqual([str(Mm(105)-Pt(.5))], rule.xpath("wp:positionH/wp:posOffset/text()", namespaces=NS))
            self.assertEqual([str(Mm(20))], rule.xpath("wp:positionV/wp:posOffset/text()", namespaces=NS))
            self.assertEqual([str(Pt(1))], rule.xpath("wp:extent/@cx", namespaces=NS))
            self.assertEqual([str(Mm(259))], rule.xpath("wp:extent/@cy", namespaces=NS))
        image_id = rules[0].xpath(".//a:blip/@r:embed", namespaces=NS)[0]
        image_target = next(rel.get("Target") for rel in self.read_xml("word/_rels/header1.xml.rels") if rel.get("Id")==image_id)
        with zipfile.ZipFile(self.output) as package, Image.open(BytesIO(package.read("word/"+image_target))) as picture:
            self.assertEqual((4, round(Mm(259).pt*4)), picture.size)
            self.assertEqual(((0, 0), (0, 0), (0, 0)), picture.convert("RGB").getextrema())
        page_size = document.xpath(".//w:sectPr/w:pgSz", namespaces=NS)[0]
        self.assertLess(abs(int(page_size.get(f"{{{NS['w']}}}w"))-11906), 2)
        # Labels share their paragraph with prose; inspect their bold prefix.
        labels = document.xpath(".//w:p[w:pPr/w:pStyle[@w:val='QuestionLabel']]/w:r[w:rPr/w:b]/w:t/text()", namespaces=NS)
        self.assertEqual(["1. [원본문제]", "2. [유사문제 · 원문 1번]", "3. [유사문제 · 원문 1번]",
                          "4. [원본문제]", "5. [유사문제 · 원문 4번]", "6. [유사문제 · 원문 4번]"], labels)
        self.assertEqual(["q1", "q2", "q3", "q4"], manifest["layout"][0]["questionIds"])
        self.assertEqual([(0, 0), (0, 1), (1, 0), (1, 1)],
                         [(p["column"], p["slot"]) for p in manifest["layout"][0]["positions"]])
        self.assertFalse(manifest["paginationVerified"])
        self.assertTrue(self.output.with_suffix(".layout.json").is_file())
        self.assertEqual(0, len(document.xpath(".//w:tbl", namespaces=NS)))
        body_sizes = document.xpath(".//m:r/w:rPr/w:sz/@w:val", namespaces=NS)
        self.assertTrue(body_sizes)
        self.assertEqual({"24", "18"}, set(body_sizes))  # body 12 pt, quick answers 9 pt
        self.assertEqual({"Cambria Math"}, set(document.xpath(".//m:r/w:rPr/w:rFonts/@w:ascii", namespaces=NS)))

    def test_two_column_answer_section_links_fonts_and_equations(self):
        export_document(self.snapshot(), self.output)
        document = self.read_xml("word/document.xml")
        with zipfile.ZipFile(self.output) as package:
            self.assertNotIn("word/endnotes.xml", package.namelist())
        anchors = document.xpath(".//w:hyperlink/@w:anchor", namespaces=NS)
        bookmarks = document.xpath(".//w:bookmarkStart/@w:name", namespaces=NS)
        self.assertEqual([f"solution_{n}" for n in range(1, 7)], anchors)
        self.assertEqual(anchors, bookmarks)
        notes = etree.Element("solutions")
        for p in document.xpath('.//w:p[w:pPr/w:pStyle[@w:val="EndnoteText"] or w:bookmarkStart]', namespaces=NS):
            notes.append(p)
        self.assertGreater(len(notes.xpath(".//m:f", namespaces=NS)), 6)
        self.assertEqual({"18"}, set(notes.xpath(".//m:r/w:rPr/w:sz/@w:val", namespaces=NS)))
        self.assertEqual({"18"}, set(notes.xpath(".//m:ctrlPr/w:rPr/w:sz/@w:val", namespaces=NS)))
        self.assertEqual({"Cambria Math"}, set(notes.xpath(".//m:r/w:rPr/w:rFonts/@w:ascii", namespaces=NS)))
        self.assertEqual({"18"}, set(notes.xpath(".//w:r[w:t]/w:rPr/w:sz/@w:val", namespaces=NS)))
        self.assertEqual({"맑은 고딕"}, set(notes.xpath(".//w:r[w:t]/w:rPr/w:rFonts/@w:eastAsia", namespaces=NS)))
        self.assertEqual({"270"}, set(notes.xpath(".//w:pPr/w:spacing/@w:line", namespaces=NS)))
        self.assertEqual(["2", "2"], document.xpath(".//w:sectPr/w:cols/@w:num", namespaces=NS))
        self.assertEqual(["510", "510"], document.xpath(".//w:sectPr/w:cols/@w:space", namespaces=NS))
        self.assertIn("빠른 정답", document.xpath(".//w:t/text()", namespaces=NS))
        self.assertIn("상세 풀이", document.xpath(".//w:t/text()", namespaces=NS))
        self.assertEqual(0, len(document.xpath(".//w:docGrid", namespaces=NS)))
        styles = self.read_xml("word/styles.xml")
        self.assertEqual(0, len(styles.xpath(".//w:pBdr", namespaces=NS)))
        self.assertFalse(any(r.get("Type").endswith("/endnotes") for r in self.read_xml("word/_rels/document.xml.rels")))

    def test_all_property_children_follow_ooxml_schema_order(self):
        export_document(self.snapshot(), self.output)
        for member in ("word/document.xml", "word/styles.xml", "word/header1.xml", "word/footer1.xml"):
            root = self.read_xml(member)
            for tag, order in (("pPr", PPR_ORDER), ("rPr", RPR_ORDER), ("sectPr", SECT_ORDER)):
                for parent in root.xpath(f".//w:{tag}", namespaces=NS):
                    ranks = [order.index(etree.QName(child.tag).localname) for child in parent if etree.QName(child.tag).localname in order]
                    self.assertEqual(sorted(ranks), ranks, f"{member} {tag}")

    def test_long_problem_uses_one_column_without_smaller_font(self):
        qs = [question(1, body="도형의 조건을 자세히 확인하고 풀이 과정을 쓰시오. "*20), question(2)]
        result = export_document(self.snapshot(qs), self.output)
        self.assertEqual(4, result["layout"][0]["capacity"])
        self.assertEqual([0, 1], [p["column"] for p in result["layout"][0]["positions"]])
        styles = self.read_xml("word/styles.xml")
        for style in ("Normal", "QuestionLabel"):
            self.assertEqual(["24"], styles.xpath(f"w:style[@w:styleId='{style}']/w:rPr/w:sz/@w:val", namespaces=NS))
            self.assertEqual(["맑은 고딕"], styles.xpath(f"w:style[@w:styleId='{style}']/w:rPr/w:rFonts/@w:eastAsia", namespaces=NS))
        for style in ("EndnoteText", "EndnoteHeading", "EndnoteReference"):
            self.assertEqual(["18"], styles.xpath(f"w:style[@w:styleId='{style}']/w:rPr/w:sz/@w:val", namespaces=NS))
        self.assertGreater(estimate_text(qs[0]["body"], font_pt=12), estimate_text(qs[0]["body"], font_pt=9))

    def test_two_remaining_questions_keep_top_and_bottom_unless_two_mode_selected(self):
        snapshot = self.snapshot([question(1), question(2)])
        result = export_document(snapshot, self.output)
        self.assertEqual(4, result["layout"][0]["capacity"])
        self.assertEqual([(0, 0), (0, 1)], [(p["column"], p["slot"]) for p in result["layout"][0]["positions"]])
        snapshot["settings"]["layout"] = "2"
        result = export_document(snapshot, self.output)
        self.assertEqual(2, result["layout"][0]["capacity"])
        self.assertEqual([(0, 0), (1, 0)], [(p["column"], p["slot"]) for p in result["layout"][0]["positions"]])
        document = self.read_xml("word/document.xml")
        self.assertEqual(1, len(document.xpath(".//w:br[@w:type='column']", namespaces=NS)))

    def test_very_long_problem_spills_instead_of_clipping(self):
        qs = [question(1, body="조건과 풀이에 필요한 긴 지문입니다. "*100), question(2)]
        result = export_document(self.snapshot(qs), self.output)
        self.assertTrue(result["layout"][0]["overflow"])
        self.assertGreater(result["layout"][0]["estimatedColumns"], 1)
        self.assertTrue(any("이어집니다" in warning for warning in result["warnings"]))
        document = self.read_xml("word/document.xml")
        # An overflowing question cannot add a huge blank paragraph that
        # pushes real text down beyond the footer.
        spacers = document.xpath(".//w:p[w:pPr/w:spacing[@w:lineRule='exact']]", namespaces=NS)
        self.assertEqual([], spacers)

    def test_reordering_updates_source_number(self):
        qs = [question(4), question(1), question(2)]
        export_document(self.snapshot(qs), self.output)
        document = self.read_xml("word/document.xml")
        self.assertIn("3. [유사문제 · 원문 2번]", document.xpath(".//w:t/text()", namespaces=NS))

    def test_unsupported_formula_does_not_replace_existing_document(self):
        self.output.write_bytes(b"existing good export")
        qs = [question(1)]
        qs[0]["solution"] = r"$\unsupported{x}$"
        with self.assertRaises(MathSyntaxError):
            export_document(self.snapshot(qs), self.output)
        self.assertEqual(b"existing good export", self.output.read_bytes())
        qs[0]["solution"] = "$" + "x+"*100 + "1$"
        with self.assertRaises(MathSyntaxError):
            export_document(self.snapshot(qs), self.output)
        self.assertEqual(b"existing good export", self.output.read_bytes())

    def test_cli_json_and_invalid_input_exit(self):
        source = Path(self.temp.name) / "snapshot.json"
        source.write_text(json.dumps(self.snapshot(), ensure_ascii=False), encoding="utf-8")
        cli = Path(__file__).resolve().parents[1] / "scripts/export_docx.py"
        process = subprocess.run([sys.executable, str(cli), "--input", str(source), "--output", str(self.output)],
                                 capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(0, process.returncode, process.stderr)
        self.assertEqual(str(self.output.resolve()), json.loads(process.stdout)["path"])
        source.write_text('{"questions":[]}', encoding="utf-8")
        process = subprocess.run([sys.executable, str(cli), "--input", str(source), "--output", str(self.output)],
                                 capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(1, process.returncode)
        self.assertEqual("", process.stdout)


if __name__ == "__main__":
    unittest.main()
