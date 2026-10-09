"""Separate diagnostic copies for older Hanword image/endnote import faults."""
from pathlib import Path
from copy import deepcopy
import json
import sys
import zipfile
from lxml import etree

W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL='http://schemas.openxmlformats.org/package/2006/relationships'
def xml(blob): return etree.fromstring(blob,etree.XMLParser(resolve_entities=False,no_network=True))
def serial(root): return etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)

def flatten_endnotes(blobs):
    blobs=dict(blobs)
    document=xml(blobs['word/document.xml']); notes=xml(blobs['word/endnotes.xml'])
    relationships=xml(blobs['word/_rels/document.xml.rels'])
    note_rels=xml(blobs['word/_rels/endnotes.xml.rels'])
    used={node.get('Id') for node in relationships}; mapping={}
    for relationship in note_rels:
        old=relationship.get('Id'); new='rIdFlattened'+old
        while new in used:new+='x'
        used.add(new);mapping[old]=new
        clone=deepcopy(relationship);clone.set('Id',new);relationships.append(clone)
    body=document.find(f'{{{W}}}body')
    final=body.find(f'{{{W}}}sectPr')
    insert_at=list(body).index(final) if final is not None else len(body)
    for note in notes:
        if int(note.get(f'{{{W}}}id','0'))<=0:continue
        for child in note:
            clone=deepcopy(child)
            for node in clone.iter():
                for attr in ('embed','link','id'):
                    name=f'{{{R}}}{attr}'
                    if node.get(name) in mapping:node.set(name,mapping[node.get(name)])
            for reference in clone.iter(f'{{{W}}}endnoteRef'):
                reference.getparent().remove(reference)
            body.insert(insert_at,clone);insert_at+=1
    for reference in document.iter(f'{{{W}}}endnoteReference'):
        text=etree.Element(f'{{{W}}}t');text.text=reference.get(f'{{{W}}}id','')
        reference.getparent().replace(reference,text)
    for element in list(relationships):
        if element.get('Type','').endswith('/endnotes'):relationships.remove(element)
    for node in list(document.iter(f'{{{W}}}endnotePr')):node.getparent().remove(node)
    settings=xml(blobs['word/settings.xml'])
    for node in list(settings.iter(f'{{{W}}}endnotePr')):node.getparent().remove(node)
    types=xml(blobs['[Content_Types].xml'])
    for node in list(types):
        if node.get('PartName')=='/word/endnotes.xml':types.remove(node)
    blobs['word/document.xml']=serial(document)
    blobs['word/_rels/document.xml.rels']=serial(relationships)
    blobs['word/settings.xml']=serial(settings)
    blobs['[Content_Types].xml']=serial(types)
    blobs.pop('word/endnotes.xml',None);blobs.pop('word/_rels/endnotes.xml.rels',None)
    return blobs


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf8')
    source=Path(sys.argv[1]);output=Path(sys.argv[2]);output.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(source) as archive:original={name:archive.read(name) for name in archive.namelist()}
    variants={}
    no_position=dict(original)
    for part in ('word/document.xml','word/endnotes.xml'):
        root=xml(no_position[part])
        for element in list(root.iter(f'{{{W}}}position')):element.getparent().remove(element)
        no_position[part]=serial(root)
    variants['A_baseline없음.docx']=no_position
    no_note_images=dict(original)
    root=xml(no_note_images['word/endnotes.xml'])
    for element in list(root.iter(f'{{{W}}}drawing')):element.getparent().remove(element)
    no_note_images['word/endnotes.xml']=serial(root)
    variants['B_미주이미지제거_진단전용.docx']=no_note_images
    variants['C_풀이본문부록.docx']=flatten_endnotes(original)
    variants['D_부록_baseline없음.docx']=flatten_endnotes(no_position)
    for name,blobs in variants.items():
        with zipfile.ZipFile(output/name,'w',zipfile.ZIP_DEFLATED) as archive:
            for entry,blob in blobs.items():archive.writestr(entry,blob)
    print(json.dumps({'outputs':[str(output/name) for name in variants]},ensure_ascii=False))
