"""Offline HWPX writer for the web export snapshot (no Hancom/COM/service).

Reuse the existing document composer for reading order, structured tables and
measured breaks, then translate its private intermediate XML into OWPML. This is
not a general DOCX converter: unknown visible constructs fail closed. Formula
source is attached while composing, never reverse-engineered from display text.
본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
"""
from __future__ import annotations
from copy import deepcopy
import hashlib
import io
import json
import math
import os
import re
from pathlib import Path
import tempfile
import zipfile
import struct
from lxml import etree as E
from docx.oxml.ns import qn
import export_docx as composer
from hwp_native import equation
from word_math import Expr, parse_latex, dimensions, MathSyntaxError

NS = {p: 'http://www.hancom.co.kr/hwpml/2011/' + part for p, part in
      [('hp', 'paragraph'), ('hh', 'head'), ('hc', 'core'), ('hs', 'section'), ('hm', 'master-page')]}
NS.update(opf='http://www.idpf.org/2007/opf/',
          w='http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          m='http://schemas.openxmlformats.org/officeDocument/2006/math',
          a='http://schemas.openxmlformats.org/drawingml/2006/main',
          wp='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
          r='http://schemas.openxmlformats.org/officeDocument/2006/relationships')
SOURCE = '{urn:examstudio:hwpx-source:1}'
TEMPLATE = Path(__file__).parent / 'hwpx' / 'Skeleton.hwpx'
MIME = 'application/hwp+zip'
PARSER = E.XMLParser(resolve_entities=False, no_network=True)
# Baseline observed in documents saved by Hancom 2018 (10.0.0.14910).
# This describes the emitted structure, not a claim that Hancom wrote the file.
HWP2018_PROFILE = dict(major='5', minor='1', micro='0', buildNumber='1', xmlVersion='1.4')


def compatible_2018_header(header):
    """Emit the common explicit paragraph model instead of redundant choices.

    Our template's 1.5 textDir and identical HwpUnitChar/default branches are
    unnecessary for horizontal HWPUNIT text. Direct margin/lineSpacing children
    are supported by Hancom's published CParaShapeType model. No cached line
    coordinates are fabricated; editable equations retain native auto metrics.
    """
    header.set('version', HWP2018_PROFILE['xmlVersion'])
    for para in header.findall('.//hh:paraPr', NS):
        if para.get('textDir') == 'LTR':
            del para.attrib['textDir']
        for switch in list(para.findall('hp:switch', NS)):
            fallback = switch.find('hp:default', NS)
            branches = switch.findall('hp:case', NS)
            if fallback is None or not branches:
                continue
            signature = lambda node: [(c.tag, dict(c.attrib), [(g.tag, dict(g.attrib)) for g in c]) for c in node]
            if any(signature(branch) != signature(fallback) for branch in branches):
                continue
            if any(c.tag not in (tag('hh:margin'), tag('hh:lineSpacing')) for c in fallback):
                continue
            position = para.index(switch)
            for child in list(fallback):
                para.insert(position, deepcopy(child))
                position += 1
            para.remove(switch)
    E.cleanup_namespaces(header)


def tag(name):
    prefix, local = name.split(':')
    return '{' + NS[prefix] + '}' + local


def el(element_name, parent=None, text=None, **attrs):
    node = E.Element(tag(element_name)) if parent is None else E.SubElement(parent, tag(element_name))
    for key, value in attrs.items():
        node.set(key, str(value))
    if text is not None:
        node.text = str(text)
    return node


def xml(node):
    return E.tostring(node, encoding='UTF-8', xml_declaration=True, standalone=True)


def wval(node, name, default=None, attr='val'):
    found = node.find('w:' + name, NS) if node is not None else None
    return found.get(qn('w:' + attr), default) if found is not None else default


def truth(value):
    return value is not None and value not in ('0', 'false', 'off')


def hu(twips):
    return round(float(twips) * 5)


def equation_extents(expr):
    """Estimated ascent/descent in ems, not a Hancom font measurement.

    A fraction's denominator belongs below the text baseline. Multiplying
    total planning height by a fixed 85% raised fractions above surrounding
    text. Keep the two extents separate, including in mixed expressions.
    """
    kind, value, children = expr.kind, expr.value, expr.children
    if kind in ('text', 'roman'):
        return .85, .2
    if kind == 'seq':
        sizes = [equation_extents(c) for c in children]
        return max([.85] + [a for a, _ in sizes]), max([.2] + [d for _, d in sizes])
    if kind in ('frac', 'binom'):
        na, nd = equation_extents(children[0])
        da, dd = equation_extents(children[1])
        return (na + nd) * .85 + .3, (da + dd) * .85 + .15
    if kind == 'script':
        ascent, descent = equation_extents(children[0])
        lower, upper = children[1:]
        if upper is not None:
            # The native mapper writes degrees without another superscript.
            if equation(upper).strip() != 'DEG':
                ascent += .65 * sum(equation_extents(upper))
        if lower is not None:
            descent += .65 * sum(equation_extents(lower))
        return ascent, descent
    if kind == 'root':
        ascent, descent = equation_extents(children[1])
        return ascent + .3, descent
    if kind == 'accent':
        ascent, descent = equation_extents(children[0])
        return (ascent, descent + .25) if value == 'underline' else (ascent + .3, descent)
    if kind == 'stack':
        ascent, descent = equation_extents(children[0])
        extra = .75 * sum(equation_extents(children[1])) + .15
        return (ascent, descent + extra) if value == 'bottom' else (ascent + extra, descent)
    if kind in ('style', 'delim', 'box'):
        return equation_extents(children[0])
    if kind == 'array':
        height = sum(max((sum(equation_extents(c)) for c in row), default=1.05) + .35 for row in children)
        return height / 2 + .2, max(.2, height / 2 - .2)
    raise MathSyntaxError('Cannot estimate native equation extents: ' + kind)


def choice_script_extents(expr):
    """Return (ascent, descent, has_script) for simple scripted choices.

    Script glyph boxes overlap their base glyph vertically; their full height
    must not be added to the base's ascent. Placement constants are adapted
    from python-hwpx's Apache-2.0 EqEdit measurer (see hwpx/NOTICE.txt).
    They approximate macOS Hancom saved boxes, not Windows font measurements.
    Keep radicals/fractions and body layout on the existing path until checked.
    """
    kind, children = expr.kind, expr.children
    if kind in ('text', 'roman'):
        return .85, .14, False
    if kind in ('style', 'delim'):
        return choice_script_extents(children[0])
    if kind == 'seq':
        sizes = [choice_script_extents(c) for c in children]
        if any(s is None for s in sizes):
            return None
        return (max([.85] + [s[0] for s in sizes]),
                max([.14] + [s[1] for s in sizes]), any(s[2] for s in sizes))
    if kind != 'script':
        return None
    sizes = [choice_script_extents(c) if c is not None else (.0, .0, False) for c in children]
    if any(s is None for s in sizes):
        return None
    (ascent, descent, scripted), lower, upper = sizes
    if children[2] is not None and equation(children[2]).strip() != 'DEG':
        ascent = max(ascent, max(ascent - .85, 0) + .48 + .55 * sum(upper[:2]))
        scripted = True
    if children[1] is not None:
        descent = max(descent, max(descent - .14, 0) - .2 + .55 * sum(lower[:2]))
        scripted = True
    return ascent, descent, scripted


class Writer:
    def __init__(self, snapshot, document, package):
        self.snapshot, self.document, self.package = snapshot, document, package
        with zipfile.ZipFile(TEMPLATE) as z:
            self.parts = {n: z.read(n) for n in ('version.xml', 'settings.xml', 'META-INF/container.xml',
                          'META-INF/container.rdf', 'META-INF/manifest.xml')}
            self.header = E.fromstring(z.read('Contents/header.xml'), PARSER)
            self.sec_template = E.fromstring(z.read('Contents/section0.xml'), PARSER).find('.//hp:secPr', NS)
        compatible_2018_header(self.header)
        self.ref = self.header.find('hh:refList', NS)
        self.char_base = deepcopy(self.ref.find('hh:charProperties/hh:charPr', NS))
        self.para_base = deepcopy(self.ref.find('hh:paraProperties/hh:paraPr', NS))
        self.borders = self.ref.find('hh:borderFills', NS)
        self.char_props = self.ref.find('hh:charProperties', NS)
        self.para_props = self.ref.find('hh:paraProperties', NS)
        self.char_cache, self.para_cache, self.border_cache = {}, {}, {}
        self.styles = {n.get(qn('w:styleId')): n for n in E.fromstring(package.read('word/styles.xml'), PARSER)}
        self.relationships = {n.get('Id'): n for n in E.fromstring(package.read('word/_rels/document.xml.rels'), PARSER)}
        self.counter, self.images, self.formulas, self.sections, self.warnings = 1000, {}, [], [], []
        self.first_name = bool(snapshot.get('settings', {}).get('showStudentNameLine'))
        # Empty-template font and style IDs remain valid; custom properties use
        # explicitly selected fonts, with no machine-specific embedded fonts.
        for face in self.ref.findall('hh:fontfaces/hh:fontface', NS):
            for font in face:
                font.set('face', snapshot.get('settings', {}).get('bodyFont', '맑은 고딕'))
        self.pending_column = False
        self.equation_sources = {}
        self.math_box_extents = {}

    def ident(self):
        self.counter += 1
        return str(self.counter)

    def warn(self, message):
        if message not in self.warnings:
            self.warnings.append(message)

    def props(self, node, kind, style=None):
        """Resolve only the inherited properties used by the private composer."""
        sid = wval(node.find('w:pPr', NS), 'pStyle', 'Normal') if style is None else style
        chain, seen = [], set()
        while sid in self.styles and sid not in seen:
            seen.add(sid)
            s = self.styles[sid]
            chain.insert(0, s.find('w:' + kind, NS))
            sid = wval(s, 'basedOn')
        own = node.find('w:' + kind, NS)
        result = E.Element(qn('w:' + kind))
        for source in [*chain, own]:
            if source is not None:
                for child in source:
                    old = result.find(child.tag)
                    if old is not None:
                        result.remove(old)
                    result.append(deepcopy(child))
        return result

    def border(self, source):
        if source is None:
            return '1'
        key = E.tostring(source)
        if key in self.border_cache:
            return self.border_cache[key]
        result = deepcopy(self.borders[0])
        identifier = str(len(self.borders) + 1)
        result.set('id', identifier)
        for side in ('left', 'right', 'top', 'bottom'):
            src = source.find(qn('w:' + side)) if E.QName(source).localname != 'bdr' else source
            dst = result.find('hh:' + side + 'Border', NS)
            if src is not None and src.get(qn('w:val')) not in ('nil', 'none', None):
                if src.get(qn('w:val')) != 'single':
                    raise ValueError('HWPX에서 지원하지 않는 테두리 종류입니다.')
                dst.set('type', 'SOLID')
                dst.set('width', '0.2 mm')
                dst.set('color', '#' + src.get(qn('w:color'), '000000').replace('auto', '000000'))
        self.borders.append(result)
        self.border_cache[key] = identifier
        return identifier

    def char(self, props=None, font_pt=None, bold=False):
        pt = float(font_pt or float(wval(props, 'sz', 20)) / 2)
        key = (E.tostring(props) if props is not None else b'', pt, bold)
        if key in self.char_cache:
            return self.char_cache[key]
        result = deepcopy(self.char_base)
        identifier = str(len(self.char_props))
        result.set('id', identifier)
        result.set('height', str(round(pt * 100)))
        if bold or truth(wval(props, 'b', '1' if props is not None and props.find('w:b', NS) is not None else None)):
            el('hh:bold', result)
        if props is not None:
            if props.find('w:i', NS) is not None and wval(props, 'i', '1') != '0':
                el('hh:italic', result)
            if wval(props, 'u', 'none') not in ('none', '0'):
                result.find('hh:underline', NS).set('type', 'BOTTOM')
            if props.find('w:bdr', NS) is not None:
                result.set('borderFillIDRef', self.border(props.find('w:bdr', NS)))
            vert = wval(props, 'vertAlign')
            if vert in ('superscript', 'subscript'):
                el('hh:supscript' if vert == 'superscript' else 'hh:subscript', result)
            color = wval(props, 'color')
            if color and color != 'auto':
                result.set('textColor', '#' + color)
        self.char_props.append(result)
        self.char_cache[key] = identifier
        return identifier

    def para(self, props=None, keep=None, lines=None, align=None):
        key = (E.tostring(props) if props is not None else b'', keep, lines, align)
        if key in self.para_cache:
            return self.para_cache[key]
        result = deepcopy(self.para_base)
        identifier = str(len(self.para_props))
        result.set('id', identifier)
        result.set('snapToGrid', '0')
        result.find('hh:align', NS).set('horizontal', align or {'left': 'LEFT', 'center': 'CENTER', 'right': 'RIGHT', 'both': 'JUSTIFY'}.get(wval(props, 'jc'), 'LEFT'))
        br = result.find('hh:breakSetting', NS)
        for name, arg, source in [('keepWithNext', keep, 'keepNext'), ('keepLines', lines, 'keepLines')]:
            flag = arg if arg is not None else (props is not None and props.find('w:' + source, NS) is not None and wval(props, source, '1') != '0')
            br.set(name, '1' if flag else '0')
        br.set('widowOrphan', '1')
        # Page breaks live on hp:p; duplicating them in both properties is risky.
        br.set('pageBreakBefore', '0')
        spacing = props.find('w:spacing', NS) if props is not None else None
        indent = props.find('w:ind', NS) if props is not None else None
        for margin in result.findall('.//hh:margin', NS):
            for key2, attr in [('prev', 'before'), ('next', 'after')]:
                margin.find('hc:' + key2, NS).set('value', str(hu(spacing.get(qn('w:' + attr), 0))) if spacing is not None else '0')
            if indent is not None:
                for key2, attr in [('left', 'left'), ('right', 'right'), ('intent', 'firstLine')]:
                    margin.find('hc:' + key2, NS).set('value', str(hu(indent.get(qn('w:' + attr), 0))))
        for line in result.findall('.//hh:lineSpacing', NS):
            rule = spacing.get(qn('w:lineRule'), 'auto') if spacing is not None else 'auto'
            value = spacing.get(qn('w:line'), '360') if spacing is not None else '360'
            line.set('type', {'auto': 'PERCENT', 'atLeast': 'AT_LEAST', 'exact': 'FIXED'}[rule])
            line.set('value', str(round(float(value) * 100 / 240)) if rule == 'auto' else str(hu(value)))
        border = props.find('w:pBdr', NS) if props is not None else None
        result.find('hh:border', NS).set('borderFillIDRef', self.border(border))
        if border is not None:
            result.find('hh:border', NS).set('connect', '1')
        self.para_props.append(result)
        self.para_cache[key] = identifier
        return identifier

    def paragraph(self, parent, source=None, text=None, keep=None, lines=None, align=None, font_pt=None):
        props = self.props(source, 'pPr') if source is not None else None
        p = el('hp:p', parent, id=self.ident(), paraPrIDRef=self.para(props, keep, lines, align),
               styleIDRef=0, pageBreak=int(truth(wval(props, 'pageBreakBefore', '1' if props is not None and props.find('w:pageBreakBefore', NS) is not None else None))),
               columnBreak=int(self.pending_column), merged=0)
        self.pending_column = False
        if text is not None:
            el('hp:t', el('hp:run', p, charPrIDRef=self.char(font_pt=font_pt)), text=text)
        return p

    def sublist(self, parent, width=0, height=0):
        return el('hp:subList', parent, id='', textDirection='HORIZONTAL', lineWrap='BREAK', vertAlign='TOP',
                  linkListIDRef=0, linkListNextIDRef=0, textWidth=width, textHeight=height, hasTextRef=0, hasNumRef=0)

    def shape(self, name, parent, width, height, inline=True):
        node = el(name, parent, id=self.ident(), zOrder=0, numberingType='EQUATION' if name == 'hp:equation' else 'PICTURE' if name == 'hp:pic' else 'TABLE',
                  textWrap='TOP_AND_BOTTOM', textFlow='BOTH_SIDES', lock=0, dropcapstyle='None')
        el('hp:sz', node, width=max(1, round(width)), widthRelTo='ABSOLUTE', height=max(1, round(height)), heightRelTo='ABSOLUTE', protect=0)
        el('hp:pos', node, treatAsChar=int(inline), affectLSpacing=0, flowWithText=1, allowOverlap=0, holdAnchorAndSO=0,
           vertRelTo='PARA', horzRelTo='COLUMN', vertAlign='TOP', horzAlign='LEFT', vertOffset=0, horzOffset=0)
        el('hp:outMargin', node, left=0, right=0, top=0, bottom=0)
        return node

    def math(self, parent, source):
        latex, pt = source.get(SOURCE + 'latex'), float(source.get(SOURCE + 'fontPt', '10'))
        if latex is None:
            raise ValueError('HWPX 수식의 원문 연결 정보가 없습니다.')
        expr = parse_latex(latex)
        validate_formula(expr)
        if not has_box(expr):
            self.native_math(parent, expr, pt, latex)
            return
        # A top-level boxed term can remain a native inline object, with an
        # editable native equation inside a one-cell bordered table. A box
        # nested in a fraction/script cannot be split without changing layout.
        if any(has_box(atom) and (atom.kind != 'box' or has_box(atom.children[0])) for atom in expr.children):
            raise MathSyntaxError('분수·첨자·중첩 수식 안의 \\boxed 테두리는 아직 지원하지 않습니다. 테두리나 수식은 생략하지 않았습니다.')
        pending = []
        for atom in expr.children:
            if atom.kind != 'box':
                pending.append(atom)
                continue
            if pending:
                fragment = Expr('seq', children=tuple(pending))
                self.native_math(parent, fragment, pt, ''.join(a.source for a in pending).strip(), source_latex=latex)
                pending = []
            inner = atom.children[0]
            # The parser may absorb a leading display/text style command.
            inner_source = re.split(r'\\boxed\b', atom.source, maxsplit=1)[1].strip()
            self.boxed_math(parent, inner, pt, inner_source, latex)
        if pending:
            self.native_math(parent, Expr('seq', children=tuple(pending)), pt,
                             ''.join(a.source for a in pending).strip(), source_latex=latex)

    def native_math(self, parent, expr, pt, latex, source_latex=None, boxed=False):
        script = equation(expr)
        width, _ = dimensions(expr)
        ascent, descent = equation_extents(expr)
        height = ascent + descent
        # Planning widths exclude native operator/italic spacing. Reserve a
        # conservative advance; this changes the box, never the equation text.
        node = self.shape('hp:equation', parent, (width * 1.35 + .4) * pt * 100, height * pt * 100)
        parent.set('charPrIDRef', self.char(font_pt=pt))
        node.find('hp:pos', NS).set('affectLSpacing', '1')
        node.find('hp:outMargin', NS).attrib.update(dict(left=str(round(pt * 15)), right=str(round(pt * 15)),
                                                        top=str(round(pt * 10)), bottom=str(round(pt * 10))))
        node.attrib.update(dict(version='Equation Version 60', baseLine=str(round(100 * ascent / height)), textColor='#000000',
                           baseUnit=str(round(pt * 100)), lineMode='CHAR', font='HYhwpEQ'))
        el('hp:script', node, text=script)
        self.equation_sources[node.get('id')] = expr
        self.reserve_equation_line(parent.getparent())
        record = {'latex': latex, 'script': script, 'fontPt': pt}
        if source_latex is not None:
            record.update(sourceLatex=source_latex, boxed=boxed)
        self.formulas.append(record)
        return node

    def boxed_math(self, parent, expr, pt, latex, source_latex):
        # OWPML run -> tbl -> tr/tc -> subList -> p/run -> equation. The
        # border is a real four-sided cell border, never a rasterized formula.
        border_source = E.Element(qn('w:bdr'))
        border_source.set(qn('w:val'), 'single')
        border_source.set(qn('w:color'), '000000')
        border = self.border(border_source)
        table = self.shape('hp:tbl', parent, 1, 1)
        table.find('hp:pos', NS).set('affectLSpacing', '1')
        table.attrib.update(dict(pageBreak='NONE', repeatHeader='0', rowCnt='1', colCnt='1',
                                 cellSpacing='0', borderFillIDRef=border, noAdjust='0'))
        el('hp:inMargin', table, left=0, right=0, top=0, bottom=0)
        cell = el('hp:tc', el('hp:tr', table), name='math-box', header=0, hasMargin=1,
                  protect=0, editable=1, dirty=0, borderFillIDRef=border)
        contents = self.sublist(cell)
        paragraph = self.paragraph(contents, keep=True, lines=True, align='LEFT')
        run = el('hp:run', paragraph, charPrIDRef=self.char(font_pt=pt))
        formula = self.native_math(run, expr, pt, latex, source_latex=source_latex, boxed=True)
        size, margin = formula.find('hp:sz', NS), formula.find('hp:outMargin', NS)
        padding = max(1, round(pt * 20))
        width = int(size.get('width')) + int(margin.get('left')) + int(margin.get('right')) + 2 * padding
        props = next(p for p in self.para_props if p.get('id') == paragraph.get('paraPrIDRef'))
        line = max(float(s.get('value')) for s in props.findall('.//hh:lineSpacing', NS))
        required = int(size.get('height')) + int(margin.get('top')) + int(margin.get('bottom'))
        height = math.ceil(max(line, required)) + 2 * padding
        table.find('hp:sz', NS).attrib.update(dict(width=str(width), height=str(height)))
        contents.set('textWidth', str(width - 2 * padding))
        contents.set('textHeight', str(height - 2 * padding))
        el('hp:cellAddr', cell, colAddr=0, rowAddr=0)
        el('hp:cellSpan', cell, colSpan=1, rowSpan=1)
        el('hp:cellSz', cell, width=width, height=height)
        el('hp:cellMargin', cell, left=padding, right=padding, top=padding, bottom=padding)
        ascent, descent = equation_extents(expr)
        above = height * ascent / (ascent + descent)
        self.math_box_extents[table.get('id')] = (above, height - above)
        parent.set('charPrIDRef', self.char(font_pt=pt))
        self.reserve_equation_line(parent.getparent())

    def reserve_equation_line(self, paragraph):
        """Give mixed inline equations sufficient line space, including cells."""
        equations = paragraph.findall('hp:run/hp:equation', NS)
        ascents, descents = [], []
        for formula in equations:
            height = int(formula.find('hp:sz', NS).get('height'))
            baseline = int(formula.get('baseLine')) / 100
            margin = formula.find('hp:outMargin', NS)
            ascents.append(height * baseline + int(margin.get('top')))
            descents.append(height * (1 - baseline) + int(margin.get('bottom')))
        for table in paragraph.findall('hp:run/hp:tbl', NS):
            if table.get('id') in self.math_box_extents:
                ascent, descent = self.math_box_extents[table.get('id')]
                ascents.append(ascent)
                descents.append(descent)
        if not ascents:
            return
        required = math.ceil(max(ascents) + max(descents))
        current = next(p for p in self.para_props if p.get('id') == paragraph.get('paraPrIDRef'))
        result = deepcopy(current)
        identifier = str(len(self.para_props))
        result.set('id', identifier)
        result.find('hh:align', NS).set('vertical', 'BASELINE')
        font_height = max(int(next(c for c in self.char_props if c.get('id') == r.get('charPrIDRef')).get('height'))
                          for r in paragraph.findall('hp:run', NS))
        for spacing in result.findall('.//hh:lineSpacing', NS):
            value = float(spacing.get('value'))
            previous = font_height * value / 100 if spacing.get('type') == 'PERCENT' else value
            spacing.set('type', 'AT_LEAST')
            # Inline objects already have affectLSpacing=1. Reserve the base
            # text line here and let Hancom enlarge only the physical line
            # containing the fraction/root. Applying the tallest formula to
            # every wrapped line inflated otherwise fitting question cells.
            spacing.set('value', str(math.ceil(previous)))
        self.para_props.append(result)
        paragraph.set('paraPrIDRef', identifier)

    def picture(self, parent, source, raw=None):
        ref = source.find('.//a:blip', NS)
        size = source.find('.//wp:extent', NS)
        if ref is None or size is None:
            raise ValueError('HWPX 그림 참조 또는 크기가 없습니다.')
        if raw is None:
            relation = self.relationships[ref.get(qn('r:embed'))]
            target = relation.get('Target', '')
            if relation.get('TargetMode') == 'External' or not target.startswith('media/') or '..' in target:
                raise ValueError('외부 그림은 HWPX에 포함할 수 없습니다.')
            raw = self.package.read('word/' + target)
        if not raw.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('HWPX 웹 그림은 검증된 PNG만 지원합니다.')
        digest = hashlib.sha256(raw).hexdigest()
        identifier = self.images.get(digest)
        if identifier is None:
            identifier = 'image' + str(len(self.images) + 1)
            self.images[digest] = identifier
            self.parts['BinData/' + identifier + '.png'] = raw
        width, height = round(int(size.get('cx')) / 127), round(int(size.get('cy')) / 127)
        node = self.shape('hp:pic', parent, width, height)
        node.attrib.update(dict(reverse='0', href='', groupLevel='0', instid=self.ident()))
        el('hp:offset', node, x=0, y=0)
        el('hp:orgSz', node, width=width, height=height)
        el('hp:curSz', node, width=0, height=0)
        el('hp:flip', node, horizontal=0, vertical=0)
        el('hp:rotationInfo', node, angle=0, centerX=width // 2, centerY=height // 2, rotateimage=1)
        transforms = el('hp:renderingInfo', node)
        for name in ('transMatrix', 'scaMatrix', 'rotMatrix'):
            el('hc:' + name, transforms, e1=1, e2=0, e3=0, e4=0, e5=1, e6=0)
        rect = el('hp:imgRect', node)
        for i, (x, y) in enumerate(((0, 0), (width, 0), (width, height), (0, height))):
            el('hc:pt' + str(i), rect, x=x, y=y)
        # imgDim/imgClip describe the source raster, not the displayed shape.
        # Native Hancom writes PNG pixels at 75 HWPUNIT per pixel (96 dpi).
        # Reusing hp:sz here cropped a 3x form raster to its upper-left third
        # in readers that honor the crop, enlarging the title over the body.
        pixels_w, pixels_h = struct.unpack('>II', raw[16:24])
        raster_w, raster_h = pixels_w * 75, pixels_h * 75
        el('hp:imgClip', node, left=0, right=raster_w, top=0, bottom=raster_h)
        el('hp:inMargin', node, left=0, right=0, top=0, bottom=0)
        el('hp:imgDim', node, dimwidth=raster_w, dimheight=raster_h)
        el('hc:img', node, binaryItemIDRef=identifier, bright=0, contrast=0, effect='REAL_PIC', alpha=0)
        el('hp:effects', node)
        # Picture-specific properties precede common placement properties in
        # Hancom's native serialization; equations retain their own order.
        for name in ('hp:sz', 'hp:pos', 'hp:outMargin'):
            node.append(node.find(name, NS))
        props = source.find('.//wp:docPr', NS)
        el('hp:shapeComment', node, text=props.get('descr', '문항 그림') if props is not None else '문항 그림')
        return node

    def content(self, p, source, psource):
        style = wval(psource.find('w:pPr', NS), 'pStyle', 'Normal')
        for child in source:
            local = E.QName(child).localname
            if child.tag == qn('w:r'):
                props = self.props(child, 'rPr', style)
                run = el('hp:run', p, charPrIDRef=self.char(props))
                for item in child:
                    kind = E.QName(item).localname
                    if kind == 'rPr':
                        continue
                    if kind == 't':
                        el('hp:t', run, text=item.text or '')
                    elif kind == 'tab':
                        el('hp:t', run, text='\t')
                    elif kind == 'br':
                        break_type = item.get(qn('w:type'), 'textWrapping')
                        if break_type in ('column', 'page'):
                            if len(source.findall('.//w:t', NS)):
                                raise ValueError('문장 중간 단/쪽 나눔은 HWPX에서 지원하지 않습니다.')
                            self.pending_column = break_type == 'column'
                            if break_type == 'page':
                                p.set('pageBreak', '1')
                        else:
                            el('hp:lineBreak', el('hp:t', run))
                    elif kind == 'drawing':
                        self.picture(run, item)
                    elif kind in ('fldChar', 'instrText'):
                        raise ValueError('HWPX 본문의 미지원 필드입니다.')
                    else:
                        raise ValueError('HWPX 미지원 글자 요소: ' + kind)
            elif child.tag == tag('m:oMath'):
                self.math(el('hp:run', p, charPrIDRef=self.char()), child)
            elif child.tag == tag('m:oMathPara'):
                for formula in child.findall('m:oMath', NS):
                    self.math(el('hp:run', p, charPrIDRef=self.char()), formula)
            elif local == 'hyperlink':
                anchor = child.get(qn('w:anchor'))
                if not anchor:
                    raise ValueError('HWPX 내부 정답 링크의 대상이 없습니다.')
                identifier = self.ident()
                # Shape and command verified against Hancom 2018's own
                # DOCX bookmark import and HWPX save (reference-probe).
                run = el('hp:run', p, charPrIDRef=self.char(font_pt=1))
                field = el('hp:fieldBegin', el('hp:ctrl', run), id=identifier,
                           type='HYPERLINK', name='', editable=0, dirty=1,
                           zorder=-1, fieldid=identifier)
                params = el('hp:parameters', field, cnt=5, name='')
                el('hp:integerParam', params, name='Prop', text='0')
                for name, value in [('Command', f'?{anchor};0;0;-1;'),
                                    ('Category', 'HWPHYPERLINK_TYPE_HWP'),
                                    ('TargetType', 'HWPHYPERLINK_TARGET_BOOKMARK'),
                                    ('DocOpenType', 'HWPHYPERLINK_JUMP_DONTCARE')]:
                    el('hp:stringParam', params, name=name, text=value)
                self.content(p, child, psource)
                run = el('hp:run', p, charPrIDRef=self.char(font_pt=1))
                el('hp:fieldEnd', el('hp:ctrl', run), beginIDRef=identifier, fieldid=identifier)
            elif local == 'bookmarkStart':
                if not hasattr(self, 'bookmarks'):
                    self.bookmarks = {}
                identifier = self.ident()
                self.bookmarks[child.get(qn('w:id'))] = identifier
                run = el('hp:run', p, charPrIDRef=self.char(font_pt=1))
                field = el('hp:fieldBegin', el('hp:ctrl', run), id=identifier,
                           type='BOOKMARK', name=child.get(qn('w:name')),
                           editable=0, dirty=0, zorder=-1, fieldid=identifier)
                el('hp:integerParam', el('hp:parameters', field, cnt=1, name=''), name='Prop', text='2')
            elif local == 'bookmarkEnd':
                identifier = getattr(self, 'bookmarks', {}).get(child.get(qn('w:id')))
                if identifier is None:
                    raise ValueError('HWPX 정답 책갈피의 시작 위치가 없습니다.')
                run = el('hp:run', p, charPrIDRef=self.char(font_pt=1))
                el('hp:fieldEnd', el('hp:ctrl', run), beginIDRef=identifier, fieldid=identifier)
            elif local != 'pPr':
                raise ValueError('HWPX 미지원 문단 요소: ' + local)

    def table(self, parent, source, width, keep):
        rows = source.findall('w:tr', NS)
        grid = source.findall('w:tblGrid/w:gridCol', NS)
        if not rows or not grid:
            raise ValueError('HWPX 표의 행/열 정의가 없습니다.')
        weights = [float(c.get(qn('w:w'), 1)) for c in grid]
        tw = source.find('w:tblPr/w:tblW', NS)
        if tw is not None and tw.get(qn('w:type')) == 'pct':
            width *= min(1, float(tw.get(qn('w:w'), '5000')) / 5000)
        widths = [round(width * w / sum(weights)) for w in weights]
        wrapper = self.paragraph(parent, keep=keep, lines=True)
        layout_table = source.get(SOURCE + 'role') == 'form-layout'
        if layout_table:
            # DOCX has a block table; HWPX requires a containing paragraph.
            # That technical anchor must not add a normal 15pt prose line at
            # both levels of the nested page/column tables.
            anchor_props = E.Element(qn('w:pPr'))
            anchor_spacing = E.SubElement(anchor_props, qn('w:spacing'))
            anchor_spacing.set(qn('w:line'), '240')
            wrapper.set('paraPrIDRef', self.para(anchor_props, keep=False, lines=False))
        table = self.shape('hp:tbl', el('hp:run', wrapper, charPrIDRef=self.char(font_pt=1) if layout_table else self.char()), width, 1000)
        border = self.border(source.find('w:tblPr/w:tblBorders', NS))
        table.attrib.update(dict(pageBreak='NONE' if keep else 'CELL', repeatHeader='0', rowCnt=str(len(rows)),
                            colCnt=str(len(grid)), cellSpacing='0', borderFillIDRef=border, noAdjust='0'))
        el('hp:inMargin', table, left=0, right=0, top=0, bottom=0)
        for row_index, row in enumerate(rows):
            height_node=row.find('w:trPr/w:trHeight', NS)
            minimum_height=hu(height_node.get(qn('w:val'),'0')) if height_node is not None else 1000
            cells = row.findall('w:tc', NS)
            if len(cells) != len(grid):
                raise ValueError('HWPX에서 병합된 표는 아직 지원하지 않습니다.')
            tr = el('hp:tr', table)
            for col, source_cell in enumerate(cells):
                if source_cell.find('w:tcPr/w:vMerge', NS) is not None or source_cell.find('w:tcPr/w:gridSpan', NS) is not None:
                    raise ValueError('HWPX에서 병합된 표는 아직 지원하지 않습니다.')
                cell = el('hp:tc', tr, name='', header=0, hasMargin=1, protect=0, editable=1, dirty=0,
                          borderFillIDRef=border)
                contents = self.sublist(cell, widths[col], 0)
                self.blocks(contents, list(source_cell), widths[col], keep)
                if not len(contents):
                    self.paragraph(contents, text='')
                el('hp:cellAddr', cell, colAddr=col, rowAddr=row_index)
                el('hp:cellSpan', cell, colSpan=1, rowSpan=1)
                el('hp:cellSz', cell, width=widths[col], height=max(1000,minimum_height))
                margins = source_cell.find('w:tcPr/w:tcMar', NS)
                if margins is None:
                    margins = source.find('w:tblPr/w:tblCellMar', NS)
                el('hp:cellMargin', cell, **{s: hu(wval(margins, s, 0, 'w')) for s in ('left', 'right', 'top', 'bottom')})
        if source.get(SOURCE + 'role') == 'web-choice-table':
            self.align_choice_rows(table)
        return wrapper

    def align_choice_rows(self, table):
        """Keep choice row space, but align script choices on their baseline.

        CENTER aligns whole boxes, so the exponent lifts the box's centre away
        from its base letter. Use corrected extents plus BASELINE for supported
        scripted choices. Preserve v3 radical cells and shared row dimensions.
        """
        total_height = 0
        for row in table.findall('hp:tr', NS):
            cells = row.findall('hp:tc', NS)
            paragraphs = [p for cell in cells for p in cell.findall('hp:subList/hp:p', NS)]
            shared_line = 1000
            for p in paragraphs:
                props = next(n for n in self.para_props if n.get('id') == p.get('paraPrIDRef'))
                for spacing in props.findall('.//hh:lineSpacing', NS):
                    if spacing.get('type') == 'AT_LEAST':
                        shared_line = max(shared_line, int(spacing.get('value')))
                # Choice rows remain one shared, explicit row. Preserve the
                # original formula reserve here, independently of prose flow.
                formulas = p.findall('hp:run/hp:equation', NS)
                if formulas:
                    above, below = [], []
                    for formula in formulas:
                        height = int(formula.find('hp:sz', NS).get('height'))
                        ratio = int(formula.get('baseLine')) / 100
                        margin = formula.find('hp:outMargin', NS)
                        above.append(height * ratio + int(margin.get('top')))
                        below.append(height * (1-ratio) + int(margin.get('bottom')))
                    shared_line = max(shared_line, math.ceil(max(above)+max(below)))
                for run in p.findall('hp:run', NS):
                    char = next(c for c in self.char_props if c.get('id') == run.get('charPrIDRef'))
                    shared_line = max(shared_line, math.ceil(int(char.get('height')) * 1.35))
            for p in paragraphs:
                formulas = p.findall('hp:run/hp:equation', NS)
                sizes = [choice_script_extents(self.equation_sources[f.get('id')]) for f in formulas]
                baseline = bool(sizes) and all(s is not None for s in sizes) and any(s[2] for s in sizes)
                if baseline:
                    for formula, (ascent, descent, _) in zip(formulas, sizes):
                        height = ascent + descent
                        formula.find('hp:sz', NS).set('height', str(round(height * int(formula.get('baseUnit')))))
                        formula.set('baseLine', str(round(100 * ascent / height)))
                props = deepcopy(next(n for n in self.para_props if n.get('id') == p.get('paraPrIDRef')))
                props.set('id', str(len(self.para_props)))
                props.find('hh:align', NS).set('vertical', 'BASELINE' if baseline else 'CENTER')
                for spacing in props.findall('.//hh:lineSpacing', NS):
                    spacing.set('type', 'AT_LEAST')
                    spacing.set('value', str(shared_line))
                self.para_props.append(props)
                p.set('paraPrIDRef', props.get('id'))
            row_height = shared_line * max(len(cell.findall('hp:subList/hp:p', NS)) for cell in cells)
            for cell in cells:
                cell.find('hp:subList', NS).set('vertAlign', 'CENTER')
                cell.find('hp:cellSz', NS).set('height', str(row_height))
            total_height += row_height
        table.find('hp:sz', NS).set('height', str(total_height))

    def blocks(self, parent, sources, width, keep=False):
        for source in sources:
            if source.tag == qn('w:p'):
                # The existing composer emits a 1pt marker-only column break.
                # Apply it to the following visible paragraph, without an extra line.
                if source.find('.//w:br[@w:type="column"]', NS) is not None and not source.findall('.//w:t', NS):
                    self.pending_column = True
                    continue
                p = self.paragraph(parent, source, keep=keep if keep else None, lines=True if keep else None)
                self.content(p, source, source)
                if not len(p):
                    spacing = source.find('w:pPr/w:spacing', NS)
                    marker = spacing is not None and spacing.get(qn('w:lineRule')) == 'exact' and spacing.get(qn('w:line')) == '20'
                    el('hp:t', el('hp:run', p, charPrIDRef=self.char(font_pt=1) if marker else self.char()), text='')
            elif source.tag == qn('w:tbl'):
                self.table(parent, source, width, keep)
            elif source.tag not in (qn('w:sectPr'), qn('w:tcPr')):
                raise ValueError('HWPX 미지원 본문 요소: ' + E.QName(source).localname)

    def section(self, sources, properties, answers=False):
        root = E.Element(tag('hs:sec'), nsmap=NS)
        self.sections.append(root)
        first = self.paragraph(root, text='')
        run = first.find('hp:run', NS)
        sec = deepcopy(self.sec_template)
        run.insert(0, sec)
        size, margins = properties.find('w:pgSz', NS), properties.find('w:pgMar', NS)
        page = sec.find('hp:pagePr', NS)
        page.set('width', str(hu(size.get(qn('w:w')))))
        page.set('height', str(hu(size.get(qn('w:h')))))
        target_margin = page.find('hp:margin', NS)
        for key in ('left', 'right', 'top', 'bottom', 'header', 'footer', 'gutter'):
            target_margin.set(key, str(hu(margins.get(qn('w:' + key), 0))))
        cols = properties.find('w:cols', NS)
        count, gap = int(cols.get(qn('w:num'), '1')), hu(cols.get(qn('w:space'), 0))
        width = (int(page.get('width')) - int(target_margin.get('left')) - int(target_margin.get('right')) - gap * (count - 1)) / count
        ctrl = el('hp:ctrl', run)
        colpr = el('hp:colPr', ctrl, id='', type='NEWSPAPER', layout='LEFT', colCount=count, sameSz=1, sameGap=gap)
        if count > 1 and not (self.snapshot.get('paperFormPages') and not answers):
            el('hp:colLine', colpr, type='SOLID', width='0.1 mm', color='#808080')
        forms = self.snapshot.get('paperFormPages')
        if forms and not answers:
            # Word's header/footer values are distances from the paper edge;
            # HWP reserves those areas in addition to the top/bottom margins.
            # These pages have no header/footer stories: the captured form is
            # anchored to paper, and topMm/bottomMm already delimit the body.
            target_margin.set('header', '0')
            target_margin.set('footer', '0')
            form = forms[len(self.sections)-1]
            drawing=E.Element(tag('w:drawing'),nsmap=NS)
            el('wp:extent',drawing,cx=7560000,cy=10692000)
            el('a:blip',drawing)
            el('wp:docPr',drawing,descr=form.get('description','시험지 폼'))
            picture=self.picture(run,drawing,raw=Path(form['backgroundPath']).read_bytes())
            picture.set('textWrap','BEHIND_TEXT')
            if form.get('backgroundTransparent'):picture.set('zOrder','1')
            picture.find('hp:pos',NS).attrib.update(dict(treatAsChar='0',vertRelTo='PAPER',horzRelTo='PAPER',flowWithText='0',allowOverlap='1',vertOffset='0',horzOffset='0'))
            if form.get('logo'):
                logo=form['logo'];drawing=E.Element(tag('w:drawing'),nsmap=NS)
                el('wp:extent',drawing,cx=round(logo['widthMm']*36000),cy=round(logo['heightMm']*36000));el('a:blip',drawing);el('wp:docPr',drawing,descr='학원 로고')
                picture=self.picture(run,drawing,raw=Path(logo['path']).read_bytes());picture.set('textWrap','BEHIND_TEXT' if form.get('backgroundTransparent') else 'IN_FRONT_OF_TEXT');picture.set('zOrder','0' if form.get('backgroundTransparent') else '1')
                picture.find('hp:pos',NS).attrib.update(dict(treatAsChar='0',vertRelTo='PAPER',horzRelTo='PAPER',flowWithText='0',allowOverlap='1',vertOffset=str(round(logo['yMm']*7200/25.4)),horzOffset=str(round(logo['xMm']*7200/25.4))))
        else:
            header = el('hp:header', ctrl, id=self.ident(), applyPageType='BOTH')
            self.paragraph(self.sublist(header), text=self.snapshot.get('title','수학 시험지') if forms else '정답 및 해설' if answers else self.snapshot.get('title','수학 시험지'), font_pt=self.snapshot.get('settings',{}).get('nativeHeaderFontPt',10))
            if not forms:el('hp:pageNum', ctrl, pos='BOTTOM_CENTER', formatType='DIGIT', sideChar='')
        # Optional-page master is attached only to the first section. It is not
        # a repeated header and therefore cannot add name fields to answer pages.
        if len(self.sections) == 1 and self.first_name and not forms:
            sec.set('masterPageCnt', '1')
            el('hp:masterPage', sec, idRef='masterpage0')
            master = E.Element(tag('hm:masterPage'), nsmap=NS, id='masterpage0', type='OPTIONAL_PAGE',
                               pageNumber='1', pageDuplicate='0', pageFront='0')
            full_width = width * count + gap * (count - 1)
            anchor = self.paragraph(self.sublist(master), text='')
            box = self.shape('hp:tbl', anchor.find('hp:run', NS), full_width, 1200, inline=False)
            box.attrib.update(dict(pageBreak='NONE', repeatHeader='0', rowCnt='1', colCnt='1', cellSpacing='0', borderFillIDRef='1', noAdjust='0'))
            pos = box.find('hp:pos', NS)
            pos.attrib.update(dict(vertRelTo='PAPER', horzRelTo='PAPER', flowWithText='0', allowOverlap='1',
                                  vertOffset=target_margin.get('header'), horzOffset=target_margin.get('left')))
            el('hp:inMargin', box, left=0, right=0, top=0, bottom=0)
            cell = el('hp:tc', el('hp:tr', box), name='', header=0, hasMargin=1, protect=0, editable=1, dirty=0, borderFillIDRef=1)
            self.paragraph(self.sublist(cell, round(full_width)), text='이름: __________________', align='RIGHT', font_pt=10)
            el('hp:cellAddr', cell, colAddr=0, rowAddr=0)
            el('hp:cellSpan', cell, colSpan=1, rowSpan=1)
            el('hp:cellSz', cell, width=round(full_width), height=1200)
            el('hp:cellMargin', cell, left=0, right=0, top=0, bottom=0)
            self.parts['Contents/masterpage0.xml'] = xml(master)
        # Paragraph keep chains enforce question cohesion; answer prose retains
        # the composer's flowing paragraphs. Tables remain native editable cells.
        if answers or forms:
            # Captured form pages already carry question cells and their exact
            # top/bottom slots. A keep chain over the entire nested page table
            # promotes a small cell overflow into a blank physical page.
            # Preserve the composer's paragraph properties instead.
            self.blocks(root, sources, width)
        else:
            groups, current = [], []
            for source in sources:
                if source.tag == qn('w:p') and wval(source.find('w:pPr', NS), 'pStyle') == 'QuestionLabel' and current:
                    groups.append(current)
                    current = []
                current.append(source)
            if current:
                groups.append(current)
            for group in groups:
                start = len(root)
                self.blocks(root, group, width, keep=True)
                visible = list(root)[start:]
                if visible:
                    last = visible[-1]
                    props = deepcopy(self.para_props[int(last.get('paraPrIDRef'))])
                    props.set('id', str(len(self.para_props)))
                    props.find('hh:breakSetting', NS).set('keepWithNext', '0')
                    self.para_props.append(props)
                    last.set('paraPrIDRef', props.get('id'))
        # Put section controls on the first real paragraph, avoiding a phantom
        # line at each section start. HWPX line segments are left to the reader.
        if len(root) > 1:
            actual = root[1]
            actual.insert(0, run)
            root.remove(first)

    def build(self):
        sources = []
        body = self.document.find('w:body', NS)
        for child in body:
            sect = child.find('w:pPr/w:sectPr', NS) if child.tag == qn('w:p') else child if child.tag == qn('w:sectPr') else None
            if sect is not None:
                self.section(sources, sect, answers=len(self.sections)>=len(self.snapshot['paperFormPages']) if self.snapshot.get('paperFormPages') else bool(self.sections))
                sources = []
            else:
                sources.append(child)
        if sources or not self.sections:
            raise ValueError('HWPX 구역 경계가 완전하지 않습니다.')
        self.header.set('secCnt', str(len(self.sections)))
        for collection in (self.char_props, self.para_props, self.borders):
            collection.set('itemCnt', str(len(collection)))
        self.parts['Contents/header.xml'] = xml(self.header)
        for index, section in enumerate(self.sections):
            # Hancom's native reader recalculates equation metrics when all
            # three values are zero. Persisting conservative planning widths
            # instead reserves blank space after each editable formula.
            # https://forum.developer.hancom.com/t/hp-sz-width/1783
            # Keep planning extents through table/line layout, then serialize
            # the native auto-metric sentinel without changing font or script.
            for formula in section.findall('.//hp:equation', NS):
                formula.set('baseLine', '0')
                formula.find('hp:sz', NS).attrib.update(dict(width='0', height='0'))
                formula.find('hp:outMargin', NS).attrib.update(dict(left='0', right='0'))
            self.parts[f'Contents/section{index}.xml'] = xml(section)
        version = E.fromstring(self.parts['version.xml'], PARSER)
        version.attrib.update(HWP2018_PROFILE)
        version.set('application', 'ExamStudio')
        version.set('appVersion', 'hwpx-2018-profile-1')
        self.parts['version.xml'] = xml(version)
        settings = E.fromstring(self.parts['settings.xml'], PARSER)
        for cursor in settings:
            if E.QName(cursor).localname == 'CaretPosition':
                cursor.set('paraIDRef', self.sections[0][0].get('id'))
                cursor.set('pos', '0')
        self.parts['settings.xml'] = xml(settings)
        rdfns, pkgns = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'http://www.hancom.co.kr/hwpml/2016/meta/pkg#'
        rdf = E.Element('{' + rdfns + '}RDF', nsmap={'rdf': rdfns, 'pkg': pkgns})
        for name, kind in [('Contents/header.xml', 'HeaderFile')] + [(f'Contents/section{i}.xml', 'SectionFile') for i in range(len(self.sections))]:
            desc = E.SubElement(rdf, '{' + rdfns + '}Description', attrib={'{' + rdfns + '}about': ''})
            E.SubElement(desc, '{' + pkgns + '}hasPart', attrib={'{' + rdfns + '}resource': name})
            desc = E.SubElement(rdf, '{' + rdfns + '}Description', attrib={'{' + rdfns + '}about': name})
            E.SubElement(desc, '{' + rdfns + '}type', attrib={'{' + rdfns + '}resource': pkgns + kind})
        desc = E.SubElement(rdf, '{' + rdfns + '}Description', attrib={'{' + rdfns + '}about': ''})
        E.SubElement(desc, '{' + rdfns + '}type', attrib={'{' + rdfns + '}resource': pkgns + 'Document'})
        self.parts['META-INF/container.rdf'] = xml(rdf)
        # Preserve editable application geometry/structured data beside rendered
        # PNG assets. HWPX editors edit text/math/tables; app JSON import is not
        # implied. Export paths refer to packaged assets through this explicit map.
        asset_paths = {}
        for question in self.snapshot['questions']:
            paths = [question.get('diagramPath'), *question.get('materialPaths', []), *question.get('structureFigurePaths', {}).values()]
            for path in filter(None, paths):
                digest = hashlib.sha256(Path(path).read_bytes()).hexdigest()
                if digest in self.images:
                    asset_paths[path] = 'BinData/' + self.images[digest] + '.png'
        self.parts['Contents/examstudio.json'] = json.dumps({'version': 1, 'snapshot': self.snapshot,
                 'equations': self.formulas, 'imageSha256': self.images, 'assets': asset_paths}, ensure_ascii=False, allow_nan=False).encode('utf-8')
        texts = [''.join(section.itertext()) for section in self.sections]
        self.parts['Preview/PrvText.txt'] = '\n'.join(texts).encode('utf-8')
        package = E.Element(tag('opf:package'), nsmap={'opf': NS['opf']}, version='', id='', attrib={'unique-identifier': ''})
        metadata = el('opf:metadata', package)
        el('opf:title', metadata, text=self.snapshot.get('title', '수학 시험지'))
        el('opf:language', metadata, text='ko')
        el('opf:meta', metadata, name='creator', content='text', text='문제공방')
        manifest, spine = el('opf:manifest', package), el('opf:spine', package)
        entries = [('header', 'Contents/header.xml', 'application/xml'), ('settings', 'settings.xml', 'application/xml'),
                   ('version', 'version.xml', 'application/xml')]
        entries += [(f'section{i}', f'Contents/section{i}.xml', 'application/xml') for i in range(len(self.sections))]
        if 'Contents/masterpage0.xml' in self.parts:
            entries.append(('masterpage0', 'Contents/masterpage0.xml', 'application/xml'))
        entries += [(identifier, 'BinData/' + identifier + '.png', 'image/png') for identifier in self.images.values()]
        entries.append(('examstudio', 'Contents/examstudio.json', 'application/json'))
        for identifier, name, mime in entries:
            item = el('opf:item', manifest, id=identifier, href=name)
            item.set('media-type', mime)
            if mime == 'image/png':
                item.set('isEmbeded', '1')
            if identifier == 'header' or identifier.startswith('section'):
                el('opf:itemref', spine, idref=identifier, linear='yes')
        self.parts['Contents/content.hpf'] = xml(package)
        return self.parts


def validate_package(data):
    """Structural/reference validation, explicitly not full KS X 6101 validation."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        if len(names) != len(set(names)) or z.testzip():
            raise ValueError('HWPX ZIP 무결성 오류')
        first = z.infolist()[0]
        if first.filename != 'mimetype' or first.compress_type != zipfile.ZIP_STORED or z.read('mimetype') != MIME.encode():
            raise ValueError('HWPX mimetype 오류')
        if z.getinfo('version.xml').compress_type != zipfile.ZIP_STORED:
            raise ValueError('HWPX version.xml must be stored without compression')
        roots = {n: E.fromstring(z.read(n), PARSER) for n in names if n.endswith(('.xml', '.hpf', '.rdf'))}
        package = roots['Contents/content.hpf']
        items = {n.get('id'): n for n in package.findall('opf:manifest/opf:item', NS)}
        if len(items) != len(package.findall('opf:manifest/opf:item', NS)):
            raise ValueError('HWPX manifest ID 중복')
        for item in items.values():
            if item.get('href') not in names:
                raise ValueError('HWPX manifest 파일 누락')
        spine = package.findall('opf:spine/opf:itemref', NS)
        if any(n.get('idref') not in items for n in spine):
            raise ValueError('HWPX spine 참조 오류')
        header = roots['Contents/header.xml']
        maps = {attr: {n.get('id') for n in header.findall('.//hh:' + name, NS)} for attr, name in
                [('charPrIDRef', 'charPr'), ('paraPrIDRef', 'paraPr'), ('styleIDRef', 'style'), ('borderFillIDRef', 'borderFill')]}
        sections = [n for n in roots if n.startswith('Contents/section')]
        if len(sections) != int(header.get('secCnt')):
            raise ValueError('HWPX 구역 개수 오류')
        if [n.get('idref') for n in spine if n.get('idref', '').startswith('section')] != [f'section{i}' for i in range(len(sections))]:
            raise ValueError('HWPX 구역 읽기 순서 오류')
        eqs = pics = tables = 0
        scripts = []
        for name in sections + [n for n in roots if n.startswith('Contents/masterpage')]:
            for node in roots[name].iter():
                for attr, values in maps.items():
                    if node.get(attr) is not None and node.get(attr) not in values:
                        raise ValueError('HWPX 스타일 참조 오류: ' + attr)
                if node.tag == tag('hc:img'):
                    pics += 1
                    if node.get('binaryItemIDRef') not in items:
                        raise ValueError('HWPX 그림 자산 누락')
                if node.tag == tag('hp:equation'):
                    eqs += 1
                    if not node.findtext('hp:script', namespaces=NS):
                        raise ValueError('HWPX 빈 수식')
                    scripts.append(node.findtext('hp:script', namespaces=NS))
                if node.tag == tag('hp:masterPage') and node.get('idRef') not in items:
                    raise ValueError('HWPX 바탕쪽 참조 오류')
                if node.tag == tag('hp:tbl'):
                    tables += 1
                    if len(node.findall('hp:tr', NS)) != int(node.get('rowCnt')):
                        raise ValueError('HWPX 표 행 오류')
                    if any(len(row.findall('hp:tc', NS)) != int(node.get('colCnt')) for row in node.findall('hp:tr', NS)):
                        raise ValueError('HWPX 표 열 오류')
                if node.tag in (tag('hp:sz'), tag('hp:cellSz')):
                    # Zero metrics are valid only for a native equation asking
                    # the reader to measure its nonempty script at a real size.
                    parent = node.getparent()
                    if (node.tag == tag('hp:sz') and parent.tag == tag('hp:equation')
                            and node.get('width') == node.get('height') == parent.get('baseLine') == '0'
                            and math.isfinite(float(parent.get('baseUnit', 'nan')))
                            and float(parent.get('baseUnit', '0')) > 0
                            and parent.findtext('hp:script', namespaces=NS)):
                        continue
                    if not all(math.isfinite(float(node.get(a, 'nan'))) and float(node.get(a, 0)) > 0 for a in ('width', 'height')):
                        raise ValueError('HWPX 개체 크기 오류')
        native = json.loads(z.read('Contents/examstudio.json'))
        if scripts != [f['script'] for f in native['equations']]:
            raise ValueError('HWPX 수식 개수/순서 또는 원문 연결 오류')
        for digest, identifier in native['imageSha256'].items():
            if identifier not in items or hashlib.sha256(z.read(items[identifier].get('href'))).hexdigest() != digest:
                raise ValueError('HWPX 그림 데이터 체크섬 오류')
        return {'sections': len(sections), 'equations': eqs, 'pictures': pics, 'tables': tables,
                'packageVerified': True, 'schemaFullyValidated': False, 'hancomOpenVerified': False,
                'paginationVerified': False}


def has_box(value):
    if isinstance(value, Expr):
        return value.kind == 'box' or any(has_box(child) for child in value.children)
    return isinstance(value, tuple) and any(has_box(child) for child in value)


def validate_formula(expr):
    if any(has_box(atom) and (atom.kind != 'box' or has_box(atom.children[0])) for atom in expr.children):
        raise MathSyntaxError('분수·첨자·중첩 수식 안의 \\boxed 테두리는 아직 지원하지 않습니다. 테두리나 수식은 생략하지 않았습니다.')
    equation(expr)


def export_document(snapshot, output):
    output = Path(output)
    if output.suffix.lower() != '.hwpx':
        raise ValueError('출력 확장자는 .hwpx여야 합니다.')
    # Serialization validates NaNs and preserves a detached copy of caller data.
    snapshot = json.loads(json.dumps(snapshot, ensure_ascii=False, allow_nan=False))
    snapshot['questions'] = [q for q in snapshot['questions'] if q.get('include') is not False]
    original = composer.formatted_math
    original_choices = composer.append_choices

    def tagged_formula(source, display=False, font_pt=None):
        node = original(source, display, font_pt)
        formula = node if node.tag == tag('m:oMath') else node.find('m:oMath', NS)
        formula.set(SOURCE + 'latex', source)
        formula.set(SOURCE + 'fontPt', str(font_pt or composer.FONT_PT))
        return node

    def tagged_choices(document, question, keep=True):
        # A transient composer marker avoids guessing table roles from text.
        before = {t._tbl for t in document.tables}
        result = original_choices(document, question, keep)
        if question.get('webChoiceColumns') == 2:
            for table in document.tables:
                if table._tbl not in before:
                    table._tbl.set(SOURCE + 'role', 'web-choice-table')
        return result

    with tempfile.TemporaryDirectory(prefix='exam-hwpx-') as temp:
        intermediate = Path(temp) / 'composition.docx'
        try:
            composer.formatted_math = tagged_formula
            composer.append_choices = tagged_choices
            layout = composer.export_document(snapshot, intermediate, math_validator=validate_formula)
            if any(page.get('overflow') for page in layout['layout']):
                raise ValueError('HWPX 시험지의 문항이 한 단을 넘습니다. 문항을 나누거나 출력 배치를 조정해 주세요.')
        finally:
            composer.formatted_math = original
            composer.append_choices = original_choices
        with zipfile.ZipFile(intermediate) as source:
            writer = Writer(snapshot, E.fromstring(source.read('word/document.xml'), PARSER), source)
            parts = writer.build()
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('mimetype', MIME, compress_type=zipfile.ZIP_STORED)
            for name, value in parts.items():
                z.writestr(name, value, compress_type=(zipfile.ZIP_STORED if name == 'version.xml' else zipfile.ZIP_DEFLATED))
        data = buffer.getvalue()
        result = validate_package(data)
        result.update(warnings=writer.warnings + ['HWPX의 실제 한글 열기·편집·인쇄와 최종 쪽/단 배치는 아직 검증되지 않았습니다.',
                      '그림은 PNG이며 원래 도형·구조화 편집 데이터는 문서 내부 JSON으로 보존합니다.'],
                      layout=layout['layout'], bytes=len(data))
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=output.parent, suffix='.hwpx', delete=False) as f:
            tmp = Path(f.name)
            f.write(data)
        try:
            os.replace(tmp, output)
        finally:
            tmp.unlink(missing_ok=True)
        return result


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(json.dumps(export_document(json.loads(Path(args.input).read_text(encoding='utf-8-sig')), args.output), ensure_ascii=False))
