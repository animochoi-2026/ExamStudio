"""Fragment references must preserve one original question and exact order."""
import sys
import unittest
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from export_docx import plan_layout

def node(text):
    return dict(version=1, features=['interleavedFlow','proofSteps'], nodes=[dict(
        id='line',type='paragraph',parentId=None,origin='printed',align='left',widthRatio=1,
        inlines=[dict(kind='text',text=text,label='',border='none',widthEm=0,align='left',origin='printed')])])

class Fragments(unittest.TestCase):
    def setUp(self):
        self.questions=[dict(id='a',sourceId='a',kind='original',body='앞',choices=[]),dict(id='b',sourceId='b',kind='original',body='가나다라',choices=[]),dict(id='c',sourceId='c',kind='original',body='뒤',choices=[])]
        self.settings=dict(workspaceLines=0,quadrantLayout=True,measuredPages=[[
            ['a'],[dict(questionId='b',fragmentIndex=0)]],[[dict(questionId='b',fragmentIndex=1),'c'],[]]],questionFragments={'b':[
            dict(start=0,end=2,total=4,layoutDocument=node('가나')),dict(start=2,end=4,total=4,layoutDocument=node('다라'))]})

    def test_one_original_continues_with_valid_order(self):
        pages,_,_=plan_layout(self.questions,self.settings)
        self.assertEqual([p['questionIds'] for p in pages],[['a','b'],['b','c']])
        self.assertEqual(len(self.questions),3)

    def test_missing_duplicate_or_reordered_fragments_fail(self):
        for change in ['gap','overlap','missing','reverse']:
            settings=deepcopy(self.settings)
            if change=='gap': settings['questionFragments']['b'][1]['start']=3
            if change=='overlap': settings['questionFragments']['b'][1]['start']=1
            if change=='missing': settings['measuredPages'][1][0].pop(0)
            if change=='reverse': settings['measuredPages'][0][1][0]['fragmentIndex']=1
            with self.subTest(change=change),self.assertRaises(ValueError):
                plan_layout(self.questions,settings)

if __name__=='__main__':unittest.main()
