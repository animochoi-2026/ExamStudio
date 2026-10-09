"""Synthetic fixtures only; no AI, network, COM or user documents."""
from copy import deepcopy
from pathlib import Path
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from lxml import etree as E
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import export_hwpx as h
import export_docx


def question(index=1, **values):
    return dict(id=f'q{index}', sourceId=f'q{index}', kind='original', include=True,
                body=r'수정값 17.5, $x^2+\sqrt{3}=\frac{7}{2}$와 $\angle ABC=30^\circ$를 구하시오.',
                answer=r'$\frac{7}{2}$', solution='1단계: 조건을 확인합니다.\n2단계: 계산값은 $x^2=4$입니다.',
                **values)


def snapshot(questions=None, **settings):
    return dict(title='HWPX 합성 검증', questions=questions or [question()],
                settings=dict(bodyFontSize=10, solutionFontSize=9, workspaceLines=0,
                              showQuestionLabels=False, showStudentNameLine=True, **settings))


class HwpxTests(unittest.TestCase):
    def test_hidden_end_references_keep_native_quick_and_detailed_targets(self):
        for mode in ['quick', 'detailed']:
            data = snapshot(answerMode=mode)
            data['questions'][0].update(choices=['첫 보기', '마지막 보기'], webChoiceColumns=2)
            result, z, roots = self.export(data)
            fields = [f for root in roots for f in root.findall('.//hp:fieldBegin', h.NS)]
            links = [f for f in fields if f.get('type') == 'HYPERLINK']
            targets = [f for f in fields if f.get('type') == 'BOOKMARK']
            self.assertEqual(len(links), 1)
            self.assertEqual([f.get('name') for f in targets], ['solution_1'])
            self.assertEqual(links[0].findtext('hp:parameters/hp:stringParam[@name="Command"]', namespaces=h.NS), '?solution_1;0;0;-1;')
            marker = links[0].getparent().getparent().getnext()
            self.assertEqual(marker.findtext('hp:t', namespaces=h.NS), '1')
            header = E.fromstring(z.read('Contents/header.xml'))
            style = header.find('.//hh:charPr[@id="'+marker.get('charPrIDRef')+'"]', h.NS)
            self.assertEqual(style.get('textColor'), '#FFFFFF')
            self.assertEqual(style.get('height'), '100')
            source_order = list(roots[0].iter())
            last_choice = next(n for n in roots[0].iter(h.tag('hp:t')) if '마지막 보기' in (n.text or ''))
            self.assertLess(source_order.index(last_choice), source_order.index(links[0]))
            self.assertTrue(roots[0].findall('.//hp:equation', h.NS))
            self.assertFalse(any('이동 기능은 제공하지' in w for w in result.get('warnings', [])))

    def test_boxed_math_keeps_native_equations_inside_visible_editable_borders(self):
        data = snapshot(answerMode='detailed')
        data['questions'][0]['body'] = r'값 $x+\boxed{\frac{7}{2}}=\displaystyle\boxed{3.5}$를 확인한다.'
        before = deepcopy(data)
        result, z, roots = self.export(data)
        boxes = roots[0].xpath('.//hp:tc[@name="math-box"]', namespaces=h.NS)
        self.assertEqual(len(boxes), 2)
        header = E.fromstring(z.read('Contents/header.xml'))
        borders = {node.get('id'): node for node in header.findall('.//hh:borderFill', h.NS)}
        for box in boxes:
            self.assertEqual(box.get('editable'), '1')
            self.assertEqual(box.getparent().getparent().get('pageBreak'), 'NONE')
            for side in ('left', 'right', 'top', 'bottom'):
                self.assertEqual(borders[box.get('borderFillIDRef')].find('hh:' + side + 'Border', h.NS).get('type'), 'SOLID')
            self.assertEqual(len(box.findall('.//hp:equation', h.NS)), 1)
            self.assertEqual(len(box.findall('.//hp:pic', h.NS)), 0)
        self.assertIn(' over ', boxes[0].findtext('.//hp:script', namespaces=h.NS))
        self.assertEqual(boxes[1].findtext('.//hp:script', namespaces=h.NS), '3.5')
        for record in json.loads(z.read('Contents/examstudio.json'))['equations']:
            self.assertEqual(h.equation(h.parse_latex(record['latex'])), record['script'])
        self.assertEqual(data, before)
        self.assertEqual(json.loads(z.read('Contents/examstudio.json'))['snapshot'], before)
        self.assertEqual(result['pictures'], 0)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def export(self, data):
        path = self.root / 'exam.hwpx'
        result = h.export_document(data, path)
        z = zipfile.ZipFile(io.BytesIO(path.read_bytes()))
        self.addCleanup(z.close)
        roots = [E.fromstring(z.read(f'Contents/section{i}.xml')) for i in range(result['sections'])]
        return result, z, roots

    def test_real_package_native_formulas_numbers_and_detached_snapshot(self):
        data = snapshot(answerMode='detailed', measuredPages=[[['q1'], []]])
        before = deepcopy(data)
        result, z, roots = self.export(data)
        self.assertEqual(data, before)
        self.assertEqual(z.read('mimetype'), b'application/hwp+zip')
        self.assertEqual(z.infolist()[0].compress_type, zipfile.ZIP_STORED)
        self.assertEqual(z.getinfo('version.xml').compress_type, zipfile.ZIP_STORED)
        self.assertNotIn('word/document.xml', z.namelist())
        self.assertGreaterEqual(result['equations'], 5)
        scripts = [s.text for r in roots for s in r.findall('.//hp:script', h.NS)]
        self.assertTrue(any(' over ' in s and 'sqrt' in s and '^' in s for s in scripts))
        self.assertTrue(any('angle' in s and 'DEG' in s for s in scripts))
        self.assertIn('17.5', ''.join(roots[0].itertext()))
        native = json.loads(z.read('Contents/examstudio.json'))
        self.assertEqual(native['snapshot'], data)
        self.assertFalse(result['hancomOpenVerified'])
        self.assertFalse(result['paginationVerified'])

    def test_validator_rejects_compressed_version_part(self):
        _, z, _ = self.export(snapshot(answerMode='quick'))
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as out:
            for name in z.namelist():
                out.writestr(name, z.read(name), compress_type=(
                    zipfile.ZIP_DEFLATED if name == 'version.xml' else zipfile.ZIP_STORED))
        with self.assertRaisesRegex(ValueError, 'version.xml'):
            h.validate_package(buf.getvalue())

    def test_inline_equations_use_native_metrics_without_trailing_padding(self):
        q = question()
        q['body'] = r'앞 $x^2+\sqrt{3}=\frac{7}{2}$ 중간 $\angle ABC=30^\circ$ 뒤'
        _, z, roots = self.export(snapshot([q], answerMode='quick'))
        head = E.fromstring(z.read('Contents/header.xml'))
        paragraphs = {p.get('id'): p for p in head.findall('.//hh:paraPr', h.NS)}
        chars = {p.get('id'): p for p in head.findall('.//hh:charPr', h.NS)}
        body = next(p for p in roots[0] if '앞' in ''.join(p.itertext()))
        formulas = body.findall('hp:run/hp:equation', h.NS)
        self.assertEqual(len(formulas), 2)
        # Hancom's documented auto-measurement sentinel replaces estimated
        # serialized boxes; planning extents are tested independently below.
        for formula in formulas:
            pos, size = formula.find('hp:pos', h.NS), formula.find('hp:sz', h.NS)
            self.assertEqual(pos.get('treatAsChar'), '1')
            self.assertEqual(pos.get('affectLSpacing'), '1')
            self.assertEqual(pos.get('vertOffset'), '0')
            self.assertEqual((size.get('width'), size.get('height'), formula.get('baseLine')), ('0', '0', '0'))
            margins = formula.find('hp:outMargin', h.NS)
            self.assertEqual((margins.get('left'), margins.get('right')), ('0', '0'))
            run = formula.getparent()
            self.assertEqual(chars[run.get('charPrIDRef')].get('height'), formula.get('baseUnit'))
        for spacing in paragraphs[body.get('paraPrIDRef')].findall('.//hh:lineSpacing', h.NS):
            self.assertEqual(spacing.get('type'), 'AT_LEAST')
            # 10pt prose retains its 150% base line. Native affectLSpacing
            # expands the actual formula line; imposing max formula height on
            # every wrapped line caused the real 23-question mock's blank page.
            # Evidence: stage1-final-web23/mock/hancom-lineflow/native-print.pdf.
            self.assertEqual(int(spacing.get('value')), 1500)
        # The 9pt answer equation must also have a 9pt control run.
        answer = roots[1].find('.//hp:equation', h.NS)
        self.assertEqual(chars[answer.getparent().get('charPrIDRef')].get('height'), '900')

    def test_native_equation_extents_distinguish_upper_and_lower_scripts(self):
        upper = h.equation_extents(h.parse_latex(r'x^2'))
        lower = h.equation_extents(h.parse_latex(r'x_2'))
        fraction = h.equation_extents(h.parse_latex(r'\frac{7}{2}'))
        self.assertGreater(upper[0], lower[0])
        self.assertGreater(lower[1], upper[1])
        self.assertGreater(fraction[1], upper[1])
        self.assertEqual(h.equation_extents(h.parse_latex(r'30^\circ')), h.equation_extents(h.parse_latex('30')))

    def test_web_choice_labels_and_equations_share_row_alignment(self):
        q = question(choices=[r'$x^2$', r'$\sqrt{3}$', r'$\frac{7}{2}$', 'plain', r'$x_2$'], webChoiceColumns=2)
        original_choices = export_docx.append_choices
        _, z, roots = self.export(snapshot([q], answerMode='quick'))
        self.assertIs(export_docx.append_choices, original_choices)
        head = E.fromstring(z.read('Contents/header.xml'))
        props = {p.get('id'):p for p in head.findall('.//hh:paraPr', h.NS)}
        table = roots[0].find('.//hp:tbl', h.NS)
        self.assertEqual(len(table.findall('hp:tr', h.NS)), 3)
        for row in table.findall('hp:tr', h.NS):
            heights, line_heights = set(), set()
            for cell in row.findall('hp:tc', h.NS):
                self.assertEqual(cell.find('hp:subList', h.NS).get('vertAlign'), 'CENTER')
                heights.add(cell.find('hp:cellSz', h.NS).get('height'))
                for p in cell.findall('hp:subList/hp:p', h.NS):
                    scripts = p.xpath('hp:run/hp:equation/hp:script/text()', namespaces=h.NS)
                    scripted = any('^{2}' in s or '_{2}' in s for s in scripts)
                    self.assertEqual(props[p.get('paraPrIDRef')].find('hh:align', h.NS).get('vertical'),
                                     'BASELINE' if scripted else 'CENTER')
                    line_heights.update(n.get('value') for n in props[p.get('paraPrIDRef')].findall('.//hh:lineSpacing', h.NS))
            self.assertEqual(len(heights), 1)
            self.assertEqual(len(line_heights), 1)
        body = next(p for p in roots[0] if p.findall('hp:run/hp:equation', h.NS))
        self.assertEqual(props[body.get('paraPrIDRef')].find('hh:align', h.NS).get('vertical'), 'BASELINE')
        self.assertEqual(len(table.findall('.//hp:equation', h.NS)), 4)

    def test_choice_script_boxes_follow_saved_hancom_baseline_not_stacked_heights(self):
        # Public python-hwpx/tests/data/equation_hancom_boxes.json: macOS Hancom
        # saved boxes at baseUnit 1000. These are independent reference values,
        # not proof that this generated document renders correctly on Windows.
        for latex, height, baseline in [('x^2', 1163, 89), ('x_1', 1177, 72), ('x_1^2', 1365, 76)]:
            with self.subTest(latex=latex):
                ascent, descent, scripted = h.choice_script_extents(h.parse_latex(latex))
                self.assertTrue(scripted)
                self.assertAlmostEqual((ascent + descent) * 1000, height, delta=25)
                self.assertAlmostEqual(100 * ascent / (ascent + descent), baseline, delta=2)
        self.assertIsNone(h.choice_script_extents(h.parse_latex(r'\sqrt{3}')))
        self.assertIsNone(h.choice_script_extents(h.parse_latex(r'x^2+\frac{1}{2}')))
        self.assertFalse(h.choice_script_extents(h.parse_latex(r'30^\circ'))[2])

        q = question(choices=[r'$x^2$', r'$\sqrt{3}$'], webChoiceColumns=2)
        q['body'] = r'$x^2$'
        _, z, roots = self.export(snapshot([q], answerMode='quick'))
        formulas = roots[0].findall('.//hp:equation', h.NS)
        square = [f for f in formulas if f.findtext('hp:script', namespaces=h.NS) == '{x}^{2}']
        self.assertEqual(len(square), 2)
        self.assertEqual([f.find('hp:sz', h.NS).get('height') for f in square], ['0', '0'])
        self.assertTrue(all(f.find('hp:pos', h.NS).get('vertOffset') == '0' for f in square))
        table = roots[0].find('.//hp:tbl', h.NS)
        self.assertEqual(table.find('hp:sz', h.NS).get('height'), '1933')
        radical = next(f for f in formulas if f.findtext('hp:script', namespaces=h.NS).strip() == 'sqrt {3}')
        self.assertEqual(radical.get('baseLine'), '0')
        self.assertEqual(radical.find('hp:sz', h.NS).get('height'), '0')

    def test_zero_metrics_only_allowed_for_complete_native_equation_sentinel(self):
        _, z, _ = self.export(snapshot(answerMode='quick'))
        for attribute, value in [('baseLine', '80'), ('baseUnit', '0')]:
            with self.subTest(attribute=attribute):
                section = E.fromstring(z.read('Contents/section0.xml'))
                section.find('.//hp:equation', h.NS).set(attribute, value)
                buf = io.BytesIO()
                with zipfile.ZipFile(buf, 'w') as out:
                    for entry in z.infolist():
                        out.writestr(deepcopy(entry), E.tostring(section) if entry.filename == 'Contents/section0.xml' else z.read(entry.filename))
                with self.assertRaisesRegex(ValueError, '크기'):
                    h.validate_package(buf.getvalue())

    def test_first_page_name_and_measured_column_page_breaks(self):
        data = snapshot([question(i) for i in range(1, 4)], answerMode='quick',
                        measuredPages=[[['q1'], ['q2']], [['q3'], []]])
        result, z, roots = self.export(data)
        self.assertEqual(len(roots), 2)
        master = E.fromstring(z.read('Contents/masterpage0.xml'))
        self.assertEqual(master.get('type'), 'OPTIONAL_PAGE')
        self.assertEqual(master.get('pageNumber'), '1')
        self.assertEqual(master.get('pageDuplicate'), '0')
        self.assertEqual(''.join(master.itertext()).count('이름:'), 1)
        self.assertFalse(any('이름:' in ''.join(r.itertext()) for r in roots))
        self.assertEqual(len(roots[0].xpath('.//hp:p[@columnBreak="1"]', namespaces=h.NS)), 1)
        self.assertEqual(len(roots[0].xpath('.//hp:p[@pageBreak="1"]', namespaces=h.NS)), 1)
        self.assertTrue(all(r.find('.//hp:colPr', h.NS).get('colCount') == '2' for r in roots))
        self.assertIsNone(roots[1].find('.//hp:masterPage', h.NS))

    def test_question_keep_chain_but_long_solutions_flow(self):
        q = question()
        q['solution'] = '\n'.join(f'{i}단계: 계산값을 다음 줄에 이어 씁니다.' for i in range(100))
        _, z, roots = self.export(snapshot([q], answerMode='detailed'))
        head = E.fromstring(z.read('Contents/header.xml'))
        styles = {p.get('id'): p.find('hh:breakSetting', h.NS) for p in head.findall('.//hh:paraPr', h.NS)}
        body = list(roots[0])
        self.assertTrue(all(styles[p.get('paraPrIDRef')].get('keepWithNext') == '1' for p in body[:-1]))
        self.assertEqual(styles[body[-1].get('paraPrIDRef')].get('keepWithNext'), '0')
        flow = [p for p in roots[1] if '단계:' in ''.join(p.itertext())]
        self.assertEqual(len(flow), 100)
        self.assertTrue(all(styles[p.get('paraPrIDRef')].get('keepWithNext') == '0' for p in flow))
        self.assertTrue(all(styles[p.get('paraPrIDRef')].get('keepLines') == '0' for p in flow))

    def test_structured_proof_order_boxes_blanks_and_png_bytes(self):
        raw = subprocess.check_output(['node', '-e', "process.stdout.write(JSON.stringify(require('./tests/fixtures/compound-proof.cjs').question()))"], cwd=ROOT)
        q = json.loads(raw)
        file = self.root / 'diagram.png'
        image = Image.new('RGB', (900, 600), 'white')
        draw = ImageDraw.Draw(image)
        draw.line([(50, 500), (400, 50), (850, 500), (50, 500)], fill='black', width=3)
        for x in range(60, 840, 20):
            draw.line((x, 500, x + 10, 480), fill='black', width=2)
        for y in range(60, 480, 20):
            draw.line((400, y, 400, y + 8), fill='black', width=2)
        image.save(file)
        q['structureFigurePaths'] = {'separate': str(file), 'joined': str(file)}
        data = snapshot([q], answerMode='quick')
        result, z, roots = self.export(data)
        self.assertGreaterEqual(result['tables'], 4)
        self.assertEqual(result['pictures'], 2)
        images = [n for n in z.namelist() if n.endswith('.png')]
        self.assertEqual(len(images), 1)
        self.assertEqual(z.read(images[0]), file.read_bytes())
        text = ''.join(roots[0].find('.//hp:tbl', h.NS).itertext())
        marks = ['두 직각삼각형', '구조 도형 separate', '➜', '구조 도형 joined', '를 뒤집어', '㉠', '①', '㉡', '②', '③', '㉣', '㉤']
        self.assertEqual([text.index(m) for m in marks], sorted(text.index(m) for m in marks))
        self.assertNotIn('빨간', text)
        native = json.loads(z.read('Contents/examstudio.json'))
        self.assertEqual(native['snapshot']['questions'][0]['layoutDocument'], q['layoutDocument'])
        self.assertEqual(native['assets'][str(file)], images[0])

    def test_picture_size_and_native_geometry_are_preserved(self):
        file = self.root / 'image.png'
        Image.new('RGB', (800, 600), 'white').save(file)
        q = question(diagramPath=str(file), diagram={'points': [{'name':'A', 'x':1.5, 'y':2}], 'dashed':True})
        data = snapshot([q], answerMode='quick', figureSizePt={str(file): {'width':120, 'height':90}})
        _, z, roots = self.export(data)
        sz = roots[0].find('.//hp:pic/hp:sz', h.NS)
        self.assertEqual((sz.get('width'), sz.get('height')), ('12000', '9000'))
        picture = sz.getparent()
        dim = picture.find('hp:imgDim', h.NS)
        clip = picture.find('hp:imgClip', h.NS)
        self.assertEqual((dim.get('dimwidth'), dim.get('dimheight')), ('60000', '45000'))
        self.assertEqual((clip.get('right'), clip.get('bottom')), ('60000', '45000'))
        self.assertGreater(list(picture).index(sz), list(picture).index(dim))
        self.assertEqual(json.loads(z.read('Contents/examstudio.json'))['snapshot']['questions'][0]['diagram'], q['diagram'])

    def test_unsupported_math_does_not_replace_previous_file_or_patch_composer(self):
        target = self.root / 'exam.hwpx'
        target.write_bytes(b'previous successful export')
        original = export_docx.formatted_math
        original_choices = export_docx.append_choices
        for formula in (r'\notACommand{x}', r'\frac{\boxed{x}}{2}'):
            data = snapshot()
            data['questions'][0]['body'] = '$' + formula + '$'
            with self.assertRaises(ValueError):
                h.export_document(data, target)
            self.assertEqual(target.read_bytes(), b'previous successful export')
            self.assertIs(export_docx.formatted_math, original)
            self.assertIs(export_docx.append_choices, original_choices)

    def test_missing_asset_and_invalid_snapshot_fail(self):
        data = snapshot([question(diagramPath=str(self.root / 'missing.png'))])
        with self.assertRaises((ValueError, OSError)):
            self.export(data)
        data = snapshot(measuredPages=[[['missing'], []]])
        with self.assertRaises(ValueError):
            self.export(data)

    def test_quick_omits_detail_and_full_adds_it(self):
        for mode, expected in [('quick', False), ('detailed', True)]:
            _, _, roots = self.export(snapshot(answerMode=mode))
            self.assertEqual('2단계' in ''.join(roots[1].itertext()), expected)

    def test_validator_detects_missing_picture_target(self):
        _, z, _ = self.export(snapshot())
        parts = {n:z.read(n) for n in z.namelist()}
        root = E.fromstring(parts['Contents/content.hpf'])
        root.find('opf:manifest/opf:item', h.NS).set('href', 'missing.xml')
        parts['Contents/content.hpf'] = h.xml(root)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as out:
            for name, data in parts.items():
                out.writestr(name, data)
        with self.assertRaisesRegex(ValueError, 'manifest'):
            h.validate_package(buf.getvalue())


if __name__ == '__main__':
    unittest.main()
