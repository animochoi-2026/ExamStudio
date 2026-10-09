"""Prepare a layout-preserving DOCX with markers for native Hancom equations.

The existing strict LaTeX parser is shared with Word. No equation rasterization
or silent text fallback is allowed. The original editable DOCX is never changed.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
import uuid
import zipfile
from lxml import etree
from docx.oxml.ns import qn
from word_math import parse_latex, MathSyntaxError
from hwp_compat import equation_plan, signature, M
from export_docx import formatted_math


def group(value):
    return '{' + value + '}'


def literal(value):
    # Quoting keeps spaces, Korean and reserved equation commands literal.
    if '"' in value or any(ord(c) < 32 for c in value):
        raise MathSyntaxError('한글 수식의 따옴표/제어 문자를 확인해 주세요.')
    return '"' + value + '"'


SYMBOLS = {'∠':'angle', '△':'TRIANGLE', '°':'DEG', '×':'times', '÷':'div',
           '∥':'parallel', '⊥':'bot', '≠':'neq', '≤':'leq', '≥':'geq',
           '∴':'therefore', '∵':'because', '∞':'inf', '∑':'sum', '∏':'prod',
           '∫':'int', '∮':'oint', '⋃':'union', '⋂':'inter',
           'α':'alpha', 'β':'beta', 'γ':'gamma', 'δ':'delta', 'ε':'epsilon',
           'θ':'theta', 'λ':'lambda', 'μ':'mu', 'π':'pi', 'ρ':'rho',
           'σ':'sigma', 'φ':'phi', 'ω':'omega', 'Δ':'Delta', 'Σ':'Sigma',
           '±':'plusminus', '∓':'minusplus', '≈':'approx', '≅':'cong', '∼':'sim'}


def equation(expr):
    k, v, c = expr.kind, expr.value, expr.children
    if k == 'seq':
        return ''.join(equation(x) for x in c)
    if k == 'text':
        if v in SYMBOLS:
            return ' ' + SYMBOLS[v] + ' '
        if v.isspace():
            return '~'
        if v in '{}#&_%$"':
            return literal(v)
        return v
    if k == 'roman':
        return group('rm ' + literal(v))
    if k == 'box':
        # HWP 2018 has no equation-border command. Keep the full expression
        # editable; prepare() reports this decorative-only difference.
        return group(equation(c[0]))
    if k in ('frac', 'binom'):
        middle = ' over ' if k == 'frac' else ' atop '
        result = group(group(equation(c[0])) + middle + group(equation(c[1])))
        return result if k == 'frac' else ' left ( ' + result + ' right ) '
    if k == 'root':
        degree = equation(c[0])
        return (' sqrt ' if not degree else ' root ' + group(degree) + ' of ') + group(equation(c[1]))
    if k == 'script':
        result = group(equation(c[0]))
        for mark, item in zip(('_', '^'), c[1:]):
            if item is not None:
                rendered = equation(item)
                # DEG already sits above the baseline in Hancom; superscripting
                # it again makes angle values unnaturally small and too high.
                result += ' DEG ' if mark == '^' and rendered.strip() == 'DEG' else mark + group(rendered)
        return result
    if k == 'accent':
        command = {'overline':'bar', 'bar':'bar', 'underline':'under', 'vec':'vec',
                   'overrightarrow':'vec', 'overleftrightarrow':'dyad', 'hat':'hat',
                   'widehat':'hat', 'tilde':'tilde', 'widetilde':'tilde', 'dot':'dot', 'ddot':'ddot'}[v]
        return ' ' + command + ' ' + group(equation(c[0]))
    if k == 'stack':
        # Hancom supports wide arcs as a decoration; keep other stacks explicit.
        annotation = equation(c[1])
        if v == 'top' and annotation == '⌢':
            return ' arch ' + group(equation(c[0]))
        upper, lower = (annotation, equation(c[0])) if v == 'top' else (equation(c[0]), annotation)
        return group(group(upper) + ' atop ' + group(lower))
    if k == 'style':
        command = {'mathrm':'rm', 'mathsf':'rm', 'mathit':'it', 'mathbf':'bold', 'boldsymbol':'bold'}[v]
        return group(command + ' ' + equation(c[0]))
    if k == 'delim':
        left, right = v.split('\0')
        return ' left ' + (left or '.') + ' ' + group(equation(c[0])) + ' right ' + (right or '.') + ' '
    if k == 'array':
        rows = [' & '.join(equation(x) for x in row) for row in c]
        if v in ('aligned','gathered'):
            return ' pile ' + group(' # '.join(''.join(equation(x) for x in row) for row in c))
        name = {'matrix':'matrix', 'pmatrix':'pmatrix', 'bmatrix':'bmatrix', 'vmatrix':'dmatrix', 'cases':'cases'}[v]
        return ' ' + name + ' ' + group(' # '.join(rows))
    # A visible fallback that changes mathematical notation is not acceptable.
    raise MathSyntaxError(f'한글 고유 수식에서 아직 지원하지 않는 형식: {k}')


def prepare(source, snapshot_path, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output:
        raise ValueError('Word 원본과 한글 변환용 파일 경로가 같을 수 없습니다.')
    snapshot = json.loads(Path(snapshot_path).read_text(encoding='utf-8-sig'))
    plan = equation_plan(snapshot)
    with zipfile.ZipFile(source) as package:
        blobs = {name: package.read(name) for name in package.namelist()}
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    prefix = 'EXAMEQ' + uuid.uuid4().hex[:12].upper()
    records, pictures, header_pictures, sections = [], 0, 0, 0
    warnings = []
    for name, data in list(blobs.items()):
        if not name.startswith('word/') or not name.endswith('.xml'):
            continue
        root = etree.fromstring(data, parser)
        if name == 'word/document.xml':
            sections = len(list(root.iter(qn('w:sectPr'))))
        # Keep the full-page divider, but mark it behind text. The native
        # converter also fixes its imported header anchor and FlowWithText.
        # Native column separators alone disappear on half-empty answer pages.
        for drawing in list(root.iter(qn('w:drawing'))):
            props = drawing.find('.//' + qn('wp:docPr'))
            if props is not None and props.get('name') == 'ExamPageColumnRule':
                header_pictures += 1
                anchor = drawing.find(qn('wp:anchor'))
                if anchor is not None:
                    anchor.set('behindDoc', '1')
            pictures += 1
        maths = list(root.iter(f'{{{M}}}oMath'))
        formulas = plan.get(name, [])
        if len(maths) != len(formulas):
            raise ValueError(f'{name}: Word 수식과 원문 수식 개수가 다릅니다.')
        for math, formula in zip(maths, formulas):
            if signature(math) != signature(formatted_math(formula['latex'], font_pt=formula['fontPt'])):
                raise ValueError(f'{name}: Word 수식과 원문이 다릅니다. 다시 내보내 주세요.')
            marker = prefix + f'{len(records):06d}END'
            script = equation(parse_latex(formula['latex']))
            if r'\boxed' in formula['latex']:
                warning = '한글 수식에서 지원하지 않는 정답 강조용 사각 테두리(\\boxed)만 생략했습니다. 테두리 안의 수식 내용은 편집 가능한 수식으로 보존했습니다.'
                if warning not in warnings:
                    warnings.append(warning)
            records.append(dict(marker=marker, script=script, fontPt=formula['fontPt']))
            run = etree.Element(qn('w:r'))
            props = etree.SubElement(run, qn('w:rPr'))
            etree.SubElement(props, qn('w:sz')).set(qn('w:val'), str(round(formula['fontPt']*2)))
            etree.SubElement(run, qn('w:t')).text = marker
            target = math.getparent() if math.getparent().tag == f'{{{M}}}oMathPara' else math
            target.getparent().replace(target, run)
        blobs[name] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    if sum(len(x) for x in plan.values()) != len(records):
        raise ValueError('한글 변환할 수식이 누락되었습니다.')
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as package:
        for name, data in blobs.items():
            package.writestr(name, data)
    manifest = output.with_suffix('.equations.json')
    manifest.write_text(json.dumps(dict(version=1, equations=records), ensure_ascii=False), encoding='utf-8')
    # Hancom expands the shared header into one header object per section.
    # Include those duplicates so a missing problem diagram cannot be masked
    # by an extra header divider during HWP record verification.
    expected_pictures = pictures - header_pictures + header_pictures * sections
    return dict(ok=True, manifestPath=str(manifest), nativeEquations=len(records), pictureImages=expected_pictures, warnings=warnings)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-docx', required=True)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.input_docx, args.snapshot, args.output), ensure_ascii=False))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
