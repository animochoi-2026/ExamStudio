"""Small, strict LaTeX to Office Math converter for school mathematics.

The accepted grammar is deliberately explicit: unsupported constructs are an
export error, never an image or a formula silently changed into ordinary text.
No TeX, subprocesses, macros, or code from the input are executed.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field
from lxml import etree

M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML = "http://www.w3.org/XML/1998/namespace"


class MathSyntaxError(ValueError):
    pass


def node(tag, children=(), **attrs):
    elem = etree.Element(f"{{{M}}}{tag}")
    for key, value in attrs.items():
        elem.set(f"{{{M}}}{key}", str(value))
    elem.extend(children)
    return elem


def run(value, style=None):
    elem = node("r")
    if style:
        elem.append(node("rPr", [node("sty", val=style)]))
    text = node("t")
    text.text = value
    if value[:1].isspace() or value[-1:].isspace():
        text.set(f"{{{XML}}}space", "preserve")
    elem.append(text)
    return elem


@dataclass
class Expr:
    kind: str
    value: str = ""
    children: tuple = ()
    # Output layout may split between complete atoms, never inside commands,
    # their arguments, scripts, delimiters or nested environments.
    source: str = field(default="", compare=False, repr=False)


SYMBOLS = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ϵ",
    "varepsilon": "ε", "zeta": "ζ", "eta": "η", "theta": "θ", "vartheta": "ϑ",
    "iota": "ι", "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ",
    "pi": "π", "rho": "ρ", "sigma": "σ", "tau": "τ", "upsilon": "υ", "phi": "ϕ",
    "varphi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω", "Gamma": "Γ",
    "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ", "Pi": "Π",
    "Sigma": "Σ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
    "angle": "∠", "measuredangle": "∡", "triangle": "△", "square": "□",
    "circ": "°", "degree": "°", "times": "×", "div": "÷", "cdot": "·",
    "pm": "±", "mp": "∓", "le": "≤", "leq": "≤", "ge": "≥", "geq": "≥",
    "ne": "≠", "neq": "≠", "approx": "≈", "equiv": "≡", "sim": "∼",
    "cong": "≅", "simeq": "≃", "parallel": "∥", "perp": "⊥", "propto": "∝",
    "infty": "∞", "therefore": "∴", "because": "∵", "to": "→",
    "rightarrow": "→", "leftarrow": "←", "Rightarrow": "⇒", "Leftarrow": "⇐",
    "Leftrightarrow": "⇔", "iff": "⇔", "implies": "⇒", "leftrightarrow": "↔",
    "in": "∈", "notin": "∉", "ni": "∋", "subset": "⊂", "subseteq": "⊆",
    "supset": "⊃", "supseteq": "⊇", "cup": "∪", "cap": "∩",
    "emptyset": "∅", "varnothing": "∅", "forall": "∀", "exists": "∃",
    "ldots": "…", "cdots": "⋯", "vdots": "⋮", "ddots": "⋱",
    "lvert": "|", "rvert": "|", "vert": "|", "lVert": "‖", "rVert": "‖",
    "Vert": "‖", "langle": "⟨", "rangle": "⟩", "lbrace": "{", "rbrace": "}",
    "lfloor": "⌊", "rfloor": "⌋", "lceil": "⌈", "rceil": "⌉", "mid": "|",
    "prime": "′", "ast": "∗", "bullet": "•", "setminus": "∖",
    "frown": "⌢", "smile": "⌣", "ell": "ℓ",
}
FUNCTIONS = {"sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan",
             "log", "ln", "exp", "min", "max", "gcd", "lcm", "lim", "det"}
SPACES = {",": "\u2009", ";": "\u2005", ":": "\u2005", " ": " ",
          "quad": "\u2003", "qquad": "\u2003\u2003", "!": ""}


class Parser:
    def __init__(self, source):
        if not isinstance(source, str) or len(source) > 20000:
            raise MathSyntaxError("수식이 없거나 너무 깁니다 (최대 20000자).")
        self.source = source
        self.i = 0
        self.depth = 0

    def fail(self, message):
        raise MathSyntaxError(f"{message} (수식 위치 {self.i + 1}: {self.source[max(0, self.i-14):self.i+25]!r})")

    def skip(self):
        while self.i < len(self.source) and self.source[self.i].isspace():
            self.i += 1

    def command(self):
        self.i += 1
        match = re.match(r"[A-Za-z]+|.", self.source[self.i:], re.S)
        if not match:
            self.fail("완성되지 않은 역슬래시 명령")
        self.i += len(match.group())
        return match.group()

    def sequence(self, closing=None, stop_right=False):
        self.depth += 1
        if self.depth > 80:
            self.fail("수식 중첩이 너무 깊습니다")
        values = []
        while True:
            self.skip()
            if closing and self.source.startswith(closing, self.i):
                self.i += len(closing)
                break
            if stop_right and re.match(r"\\right\b", self.source[self.i:]):
                break
            if self.i >= len(self.source):
                if closing or stop_right:
                    self.fail("닫는 괄호 또는 right가 없습니다")
                break
            start = self.i
            value = self.scripted_atom()
            value.source = self.source[start:self.i]
            values.append(value)
        self.depth -= 1
        return Expr("seq", children=tuple(values))

    def scripted_atom(self):
        value = self.atom()
        lower = upper = None
        while True:
            self.skip()
            if self.i < len(self.source) and self.source[self.i] == "'":
                start = self.i
                while self.i < len(self.source) and self.source[self.i] == "'":
                    self.i += 1
                if upper is not None:
                    self.fail("위첨자가 중복되었습니다")
                upper = Expr("text", "′" * (self.i-start))
                continue
            if self.i >= len(self.source) or self.source[self.i] not in "_^":
                break
            script = self.source[self.i]
            self.i += 1
            child = self.atom()
            if script == "_":
                if lower is not None:
                    self.fail("아래첨자가 중복되었습니다")
                lower = child
            else:
                if upper is not None:
                    self.fail("위첨자가 중복되었습니다")
                upper = child
        if lower is not None or upper is not None:
            return Expr("script", children=(value, lower, upper))
        return value

    def literal_group(self):
        self.skip()
        if self.i >= len(self.source) or self.source[self.i] != "{":
            self.fail("중괄호 인수가 필요합니다")
        self.i += 1
        start = self.i
        nesting = 1
        while self.i < len(self.source):
            char = self.source[self.i]
            if char == "\\":
                self.i += 2
                continue
            if char == "{":
                nesting += 1
            elif char == "}":
                nesting -= 1
                if not nesting:
                    text = self.source[start:self.i]
                    self.i += 1
                    return text
            self.i += 1
        self.fail("닫는 중괄호가 없습니다")

    def delimiter(self):
        self.skip()
        if self.i >= len(self.source):
            self.fail("구분 기호가 없습니다")
        if self.source[self.i] == "\\":
            command = self.command()
            if command in ("{", "}", "|"):
                return command
            if command in SYMBOLS:
                return SYMBOLS[command]
            self.fail(f"지원하지 않는 구분 기호 \\{command}")
        value = self.source[self.i]
        self.i += 1
        if value == ".":
            return ""
        if value not in "()[]{}|":
            self.fail(f"지원하지 않는 구분 기호 {value}")
        return value

    def environment(self):
        name = self.literal_group()
        supported = {"aligned", "gathered", "matrix", "pmatrix", "bmatrix", "vmatrix", "cases"}
        if name not in supported:
            self.fail(f"지원하지 않는 수식 환경 {name}")
        # Split only at top level; nested environments are handled recursively.
        start = self.i
        end_pattern = "\\end{" + name + "}"
        stack = 0
        group_depth = 0
        rows, cells = [], []
        while self.i < len(self.source):
            rest = self.source[self.i:]
            if stack == 0 and group_depth == 0 and rest.startswith(end_pattern):
                cells.append(self.source[start:self.i])
                rows.append(cells)
                self.i += len(end_pattern)
                parsed = tuple(tuple(parse_latex(cell) for cell in row) for row in rows)
                return Expr("array", name, parsed)
            if rest.startswith("\\begin{"):
                stack += 1
            elif rest.startswith("\\end{"):
                stack -= 1
            if not stack and not group_depth and rest.startswith("\\\\"):
                cells.append(self.source[start:self.i])
                rows.append(cells)
                cells = []
                self.i += 2
                start = self.i
                continue
            if not stack and not group_depth and rest.startswith("&"):
                cells.append(self.source[start:self.i])
                self.i += 1
                start = self.i
                continue
            if rest.startswith("\\"):
                self.command()
                continue
            if rest[0] == "{":
                group_depth += 1
            elif rest[0] == "}":
                group_depth -= 1
            self.i += 1
        self.fail(f"수식 환경 {name}의 end가 없습니다")

    def atom(self):
        self.skip()
        if self.i >= len(self.source):
            self.fail("수식 인수가 없습니다")
        value = self.source[self.i]
        if value == "{":
            self.i += 1
            return self.sequence("}")
        if value in "}^_&$":
            self.fail(f"예상하지 않은 기호 {value}")
        if value != "\\":
            self.i += 1
            if ord(value) < 32:
                self.fail("잘못된 제어 문자")
            return Expr("text", value)
        command = self.command()
        if command in SYMBOLS:
            return Expr("text", SYMBOLS[command])
        if command in FUNCTIONS:
            return Expr("roman", command)
        if command in SPACES:
            return Expr("text", SPACES[command])
        if command in ("{", "}", "%", "#", "$", "_", "&", "|", "\\"):
            if command == "\\":
                self.fail("수식 줄바꿈은 aligned 또는 gathered 환경에서 사용하세요")
            return Expr("text", command)
        if command in ("frac", "dfrac", "tfrac"):
            return Expr("frac", children=(self.atom(), self.atom()))
        if command in ("overset", "underset", "stackrel"):
            # LaTeX takes the annotation first, then the base expression.
            annotation, base = self.atom(), self.atom()
            return Expr("stack", "bottom" if command == "underset" else "top", (base, annotation))
        if command == "sqrt":
            self.skip()
            degree = Expr("seq")
            if self.i < len(self.source) and self.source[self.i] == "[":
                self.i += 1
                degree = self.sequence("]")
            return Expr("root", children=(degree, self.atom()))
        if command in ("overline", "bar", "underline", "vec", "hat", "widehat", "tilde", "widetilde", "dot", "ddot", "overrightarrow", "overleftrightarrow"):
            return Expr("accent", command, (self.atom(),))
        if command in ("text", "textrm", "operatorname"):
            text = self.literal_group()
            text = re.sub(r"\\([{}%#$&_ ])", r"\1", text)
            if "\\" in text or "{" in text or "}" in text:
                self.fail(f"{command} 안의 중첩 명령은 지원하지 않습니다")
            return Expr("roman", text)
        if command in ("mathrm", "mathit", "mathbf", "boldsymbol", "mathsf"):
            return Expr("style", command, (self.atom(),))
        if command == "left":
            left = self.delimiter()
            content = self.sequence(stop_right=True)
            if self.command() != "right":
                self.fail("right가 필요합니다")
            return Expr("delim", left + "\0" + self.delimiter(), (content,))
        if command in ("big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr"):
            return Expr("text", self.delimiter())
        if command == "boxed":
            return Expr("box", children=(self.atom(),))
        if command in ("displaystyle", "textstyle", "scriptstyle"):
            return self.atom()
        if command in ("sum", "prod", "int", "oint", "bigcup", "bigcap"):
            return Expr("text", {"sum": "∑", "prod": "∏", "int": "∫", "oint": "∮", "bigcup": "⋃", "bigcap": "⋂"}[command])
        if command == "binom":
            return Expr("binom", children=(self.atom(), self.atom()))
        if command == "begin":
            return self.environment()
        self.fail(f"지원하지 않는 수식 명령 \\{command}")


def parse_latex(source):
    # A few OCR results contain JSON-style double escaping in inline math,
    # e.g. \\widehat{AB}. Outside a math environment this cannot be a valid
    # row break, so recover only known commands. Keep genuine \\ row breaks
    # inside aligned/matrix environments and reject all other malformed math.
    if isinstance(source, str) and not re.search(r"(?<!\\)\\begin\{", source):
        escaped = {"widehat", "hat", "overline", "bar", "underline",
                   "vec", "overrightarrow", "overleftrightarrow", "angle",
                   "triangle", "sqrt", "frac", "dfrac", "tfrac", "circ",
                   "mathrm", "text", "cdot", "times", "parallel", "perp"}
        source = re.sub(r"\\\\([A-Za-z]+)",
                        lambda m: "\\" + m.group(1) if m.group(1) in escaped else m.group(0),
                        source)
    result = Parser(source).sequence()
    result.source = source
    return result


def emit(expr, style=None):
    k, v, c = expr.kind, expr.value, expr.children
    if k == "seq":
        output = []
        # Coalescing adjacent text makes numbers/identifiers natural Word math runs.
        for child in c:
            output.extend(emit(child, style))
        return output
    if k in ("text", "roman"):
        return [run(v, "p" if k == "roman" else style)] if v else []
    if k == "frac" or k == "binom":
        properties = [node("type", val="noBar")] if k == "binom" else []
        fraction = node("f", [node("fPr", properties), node("num", emit(c[0], style)), node("den", emit(c[1], style))])
        if k == "binom":
            return [node("d", [node("dPr", [node("begChr", val="("), node("endChr", val=")")]), node("e", [fraction])])]
        return [fraction]
    if k == "root":
        hidden = not c[0].children and not c[0].value
        return [node("rad", [node("radPr", [node("degHide", val="1" if hidden else "0")]),
                             node("deg", emit(c[0], style)), node("e", emit(c[1], style))])]
    if k == "script":
        base, lower, upper = c
        tag = "sSubSup" if lower is not None and upper is not None else "sSub" if lower is not None else "sSup"
        parts = [node("e", emit(base, style))]
        if lower is not None:
            parts.append(node("sub", emit(lower, style)))
        if upper is not None:
            parts.append(node("sup", emit(upper, style)))
        return [node(tag, parts)]
    if k == "stack":
        return [node("limLow" if v == "bottom" else "limUpp",
                     [node("e", emit(c[0], style)), node("lim", emit(c[1], style))])]
    if k == "accent":
        if v in ("overline", "bar", "underline"):
            return [node("bar", [node("barPr", [node("pos", val="bot" if v == "underline" else "top")]), node("e", emit(c[0], style))])]
        glyph = {"vec": "→", "overrightarrow": "→", "overleftrightarrow": "↔", "hat": "̂", "widehat": "̂", "tilde": "̃", "widetilde": "̃", "dot": "̇", "ddot": "̈"}[v]
        return [node("acc", [node("accPr", [node("chr", val=glyph)]), node("e", emit(c[0], style))])]
    if k == "style":
        return emit(c[0], {"mathrm": "p", "mathsf": "p", "mathit": "i", "mathbf": "b", "boldsymbol": "bi"}[v])
    if k == "delim":
        left, right = v.split("\0")
        return [node("d", [node("dPr", [node("begChr", val=left), node("endChr", val=right), node("grow", val="1")]), node("e", emit(c[0], style))])]
    if k == "box":
        return [node("borderBox", [node("e", emit(c[0], style))])]
    if k == "array":
        if v in ("aligned", "gathered"):
            return [node("eqArr", [node("e", [e for cell in row for e in emit(cell, style)]) for row in c])]
        cols = max(len(row) for row in c)
        matrix = node("m", [node("mPr", [node("mcs", [node("mc", [node("mcPr", [node("count", val=cols), node("mcJc", val="center")])])])])])
        for row in c:
            matrix.append(node("mr", [node("e", emit(cell, style)) for cell in row] + [node("e") for _ in range(cols-len(row))]))
        brackets = {"pmatrix": ("(", ")"), "bmatrix": ("[", "]"), "vmatrix": ("|", "|"), "cases": ("{", "")}
        if v in brackets:
            left, right = brackets[v]
            return [node("d", [node("dPr", [node("begChr", val=left), node("endChr", val=right)]), node("e", [matrix])])]
        return [matrix]
    raise MathSyntaxError(f"알 수 없는 수식 노드: {k}")


def latex_to_omml(source, display=False):
    result = node("oMath", emit(parse_latex(source)))
    return node("oMathPara", [node("oMathParaPr", [node("jc", val="center")]), result]) if display else result


def text_width_em(text):
    return sum(1.0 if unicodedata.east_asian_width(c) in ("W", "F") else .3 if c.isspace() else .58 for c in text)


def dimensions(expr):
    """Conservative width/height in ems, used for planning, not a Word renderer."""
    k, v, c = expr.kind, expr.value, expr.children
    if k in ("text", "roman"):
        return text_width_em(v), 1.2
    if k == "seq":
        sizes = [dimensions(child) for child in c]
        return sum(x for x, _ in sizes), max([1.2] + [y for _, y in sizes])
    if k in ("frac", "binom"):
        (nw, nh), (dw, dh) = dimensions(c[0]), dimensions(c[1])
        return max(nw, dw) + .5, nh + dh + .5
    if k == "root":
        (dw, _), (bw, bh) = dimensions(c[0]), dimensions(c[1])
        return bw + 1 + dw*.5, bh + .5
    if k == "script":
        bw, bh = dimensions(c[0])
        sizes = [dimensions(x) for x in c[1:] if x is not None]
        return bw + .75*max(x for x, _ in sizes), bh + .5*sum(y for _, y in sizes)
    if k == "stack":
        (bw, bh), (aw, ah) = dimensions(c[0]), dimensions(c[1])
        return max(bw, .75*aw), bh + .75*ah + .2
    if k in ("accent", "box", "delim", "style"):
        width, height = dimensions(c[0])
        return width + (1 if k == "delim" else .2), height + (.4 if k in ("accent", "box") else 0)
    if k == "array":
        widths, heights = [], []
        for row in c:
            sizes = [dimensions(cell) for cell in row]
            widths.append(sum(x for x, _ in sizes) + len(row)*.5)
            heights.append(max(y for _, y in sizes))
        return max(widths, default=0) + 1, sum(heights) + .4*len(heights)
    raise MathSyntaxError(f"수식 크기를 계산할 수 없습니다: {k}")


def split_math(text):
    """Return (text|inline|display, content), rejecting unmatched delimiters."""
    parts, pending = [], []
    i = 0
    while i < len(text):
        if text.startswith("\\$", i):
            pending.append("$")
            i += 2
            continue
        opening = next((token for token in ("$$", "$", "\\[", "\\(") if text.startswith(token, i)), None)
        if not opening:
            pending.append(text[i])
            i += 1
            continue
        if pending:
            parts.append(("text", "".join(pending)))
            pending = []
        closing = {"\\[": "\\]", "\\(": "\\)"}.get(opening, opening)
        end = i + len(opening)
        start = end
        while end < len(text):
            if text.startswith(closing, end):
                break
            if text[end] == "\\" and not closing.startswith("\\"):
                end += 2
            else:
                end += 1
        else:
            raise MathSyntaxError(f"수식 구분 기호 {opening!r}가 닫히지 않았습니다.")
        content = text[start:end].strip()
        if not content:
            raise MathSyntaxError("빈 수식은 출력할 수 없습니다.")
        parts.append(("display" if opening in ("$$", "\\[") else "inline", content))
        i = end + len(closing)
    if pending:
        parts.append(("text", "".join(pending)))
    return parts
