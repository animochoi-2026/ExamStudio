"""Collect formula errors across the entire requested output, without writes."""
from word_math import MathSyntaxError, parse_latex

def text_fields(question):
    for name, label in [('body','본문'),('answer','정답'),('solution','상세 풀이')]:
        yield label, question.get(name), name == 'solution'
    for name, label in [('choices','선택지'),('statementBox','보기')]:
        if isinstance(question.get(name), list):
            for i, text in enumerate(question[name], 1):
                yield f'{label} {i}', text, False
    # Active structured content may differ from the compatibility body field.
    layout = question.get('layoutDocument') or {}
    from structured_docx import active
    if isinstance(layout, dict) and active(question):
        for i, node in enumerate(layout.get('nodes', []), 1):
            if isinstance(node, dict):
                for key in ['text','title']:
                    if key in node: yield f'구조화 본문 {i}', node[key], False
                for j, inline in enumerate(node.get('inlines', []), 1):
                    if not isinstance(inline, dict): continue
                    text=inline.get('text')
                    if isinstance(text,str):
                        yield f'구조화 본문 {i}-{j}', '$'+text+'$' if inline.get('kind')=='math' else text, False

def check(snapshot, rich_paragraphs, solution_math_lines, font_pt, native=None):
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get('questions'), list):
        return  # Shape validation belongs to the composer.
    errors=[]
    settings=snapshot.get('settings') or {}
    if not isinstance(settings, dict): return
    for number, question in enumerate((q for q in snapshot['questions'] if isinstance(q,dict) and q.get('include') is not False), 1):
        for label, text, solution in text_fields(question):
            if not isinstance(text,str): continue
            try:
                for _, parts in rich_paragraphs(text):
                    for kind, source in parts:
                        if kind == 'text': continue
                        try:
                            tree=parse_latex(source)
                            if native: native(tree)
                            if solution and settings.get('wrapSolutionMath'):
                                solution_math_lines(source,font_pt)
                        except MathSyntaxError as error:
                            errors.append(f'{number}번 {label}: {error}')
            except MathSyntaxError as error:
                errors.append(f'{number}번 {label}: {error}')
    if errors:
        errors=list(dict.fromkeys(errors))
        raise MathSyntaxError('출력할 수식 '+str(len(errors))+'곳을 확인해 주세요. '+' | '.join(errors[:30]) + (' | 나머지 '+str(len(errors)-30)+'곳' if len(errors)>30 else ''))
