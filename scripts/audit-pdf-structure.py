"""Read-only PDF object/geometry audit. Outputs no extracted question text."""
import argparse, hashlib, json, re
from pathlib import Path
import fitz

def inspect(path):
    doc = fitz.open(path)
    pages, images, fonts = [], {}, {}
    for n, page in enumerate(doc):
        text = page.get_text()
        placements = []
        for im in page.get_image_info(xrefs=True):
            box = fitz.Rect(im['bbox']) & page.rect
            fraction = box.get_area() / page.rect.get_area()
            xref = im.get('xref', 0)
            placements.append({'xref':xref,'width':im['width'],'height':im['height'],'pageArea':round(fraction,4),'bbox':list(im['bbox'])})
            if xref and xref not in images:
                images[xref] = {'xref':xref,'streamBytes':len(doc.xref_stream_raw(xref) or b''),'width':im['width'],'height':im['height'],'filter':doc.xref_get_key(xref,'Filter')[1]}
        for font in page.get_fonts(full=True):
            fonts[font[0]] = {'xref':font[0],'type':font[2],'name':font[3]}
        pages.append({'page':n+1,'width':page.rect.width,'height':page.rect.height,'textChars':len(text),'koreanChars':len(re.findall('[가-힣]',text)),'vectorPaths':len(page.get_drawings()),'images':placements,'fullPageRaster':any(i['pageArea']>.80 for i in placements),'empty':not text.strip() and not placements and not page.get_drawings()})
    return {'file':str(path.resolve()),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pageCount':len(doc),'producer':doc.metadata.get('producer'),'pages':pages,'images':list(images.values()),'imageStreamBytes':sum(i['streamBytes'] for i in images.values()),'fonts':list(fonts.values()),'fullPageRasterPages':[p['page'] for p in pages if p['fullPageRaster']]}

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('files',nargs='+');p.add_argument('--output',required=True);a=p.parse_args()
    result=[inspect(Path(f)) for f in a.files]
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps([{k:r[k] for k in ['file','bytes','sha256','pageCount','producer','imageStreamBytes','fullPageRasterPages']} for r in result],ensure_ascii=False,indent=2))
