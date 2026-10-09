"""Fail if an HWP 5 conversion lost expected pictures; no document mutation.

Record tags follow Hancom HWP 5.0 revision 1.3: EQEDIT=16+72 and
SHAPE_COMPONENT_PICTURE=16+69. This checks presence, not page layout.
"""
from pathlib import Path
import argparse
import collections
import json
import struct
import sys
import zlib


class Compound:
    def __init__(self, path):
        if Path(path).stat().st_size > 300 * 1024 * 1024:
            raise ValueError('HWP 검증 파일이 너무 큽니다.')
        self.data = Path(path).read_bytes()
        if self.data[:8] != bytes.fromhex('d0cf11e0a1b11ae1'):
            raise ValueError('Not an OLE compound file')
        self.size = 1 << self.u16(30)
        self.mini_size = 1 << self.u16(32)
        if self.size not in (512,4096) or self.mini_size != 64:
            raise ValueError('지원하지 않는 HWP compound 구조입니다.')
        difat = list(struct.unpack_from('<109I', self.data, 76))
        next_sector = self.u32(68)
        for _ in range(self.u32(72)):
            values = struct.unpack('<'+'I'*(self.size//4), self.sector(next_sector))
            difat.extend(values[:-1]); next_sector = values[-1]
        self.fat = []
        for sector in difat[:self.u32(44)]:
            self.fat.extend(struct.unpack('<'+'I'*(self.size//4), self.sector(sector)))
        directories = self.chain(self.u32(48), self.fat, self.sector)
        self.entries = []
        for offset in range(0, len(directories), 128):
            item = directories[offset:offset+128]
            length = struct.unpack_from('<H', item, 64)[0]
            self.entries.append(dict(name=item[:max(0,length-2)].decode('utf-16le'),
                type=item[66],left=struct.unpack_from('<I',item,68)[0],right=struct.unpack_from('<I',item,72)[0],
                child=struct.unpack_from('<I',item,76)[0],start=struct.unpack_from('<I',item,116)[0],
                size=struct.unpack_from('<Q',item,120)[0]))
        root=self.entries[0]
        self.mini = self.chain(root['start'],self.fat,self.sector)[:root['size']]
        minifat_data=self.chain(self.u32(60),self.fat,self.sector)
        self.minifat=list(struct.unpack('<'+'I'*(len(minifat_data)//4),minifat_data))
        self.streams={}
        self.directory_seen=set()
        self.walk(root['child'],'')

    def u16(self,o): return struct.unpack_from('<H',self.data,o)[0]
    def u32(self,o): return struct.unpack_from('<I',self.data,o)[0]
    def sector(self,s): return self.data[(s+1)*self.size:(s+2)*self.size]
    def chain(self,start,fat,reader):
        chunks=[]; seen=set()
        while start < 0xfffffffa:
            if start in seen or start>=len(fat): raise ValueError('Invalid compound chain')
            seen.add(start); chunks.append(reader(start)); start=fat[start]
        return b''.join(chunks)
    def walk(self,index,prefix):
        if index>=0xfffffffa: return
        if index in self.directory_seen or index>=len(self.entries):
            raise ValueError('Invalid compound directory')
        self.directory_seen.add(index)
        entry=self.entries[index]
        self.walk(entry['left'],prefix)
        name=prefix+entry['name']
        if entry['type']==2:
            if entry['size']<self.u32(56):
                data=self.chain(entry['start'],self.minifat,lambda s:self.mini[s*self.mini_size:(s+1)*self.mini_size])
            else: data=self.chain(entry['start'],self.fat,self.sector)
            self.streams[name]=data[:entry['size']]
        elif entry['type']==1: self.walk(entry['child'],name+'/')
        self.walk(entry['right'],prefix)


def inspect(path, include_text=False):
    ole=Compound(path)
    flags=struct.unpack_from('<I',ole.streams['FileHeader'],36)[0]
    if flags&2:
        raise ValueError('암호가 설정된 HWP는 자동 검증할 수 없습니다.')
    counts=collections.Counter(); controls=collections.Counter(); texts=[]
    for name,blob in ole.streams.items():
        if not name.startswith('BodyText/Section'): continue
        if flags&1: blob=zlib.decompress(blob,-15)
        offset=0
        while offset<len(blob):
            head=struct.unpack_from('<I',blob,offset)[0];offset+=4
            tag=head&1023; length=head>>20
            if length==4095: length=struct.unpack_from('<I',blob,offset)[0];offset+=4
            payload=blob[offset:offset+length];offset+=length
            if len(payload)!=length: raise ValueError('Truncated HWP record')
            counts[tag]+=1
            if tag==71: controls[payload[:4][::-1].decode('ascii',errors='replace')]+=1
            if tag==67 and include_text: texts.append(payload.decode('utf-16le',errors='replace'))
    result = dict(file=str(path),equationRecords=counts[88],pictureRecords=counts[85],
        embeddedImages=[name for name in ole.streams if name.startswith('BinData/')],
        controlTypes=dict(controls),recordCounts=dict(sorted(counts.items())))
    if include_text: result['paragraphText']=texts
    return result


def verify(path, min_pictures, expected_equations=None):
    if min_pictures<0: raise ValueError('그림 개수는 0 이상이어야 합니다.')
    result=inspect(path, include_text=True)
    if result['pictureRecords']<min_pictures:
        raise ValueError(f"HWP 변환에서 그림이 누락되었습니다 ({result['pictureRecords']}/{min_pictures}개). Word 원본은 보존했습니다.")
    if expected_equations is not None and result['equationRecords'] != expected_equations:
        raise ValueError(f"HWP 고유 수식 개수가 다릅니다 ({result['equationRecords']}/{expected_equations}개).")
    if any('EXAMEQ' in value for value in result.pop('paragraphText')):
        raise ValueError('변환되지 않은 한글 수식 표시가 남았습니다.')
    result.update(ok=True,minPictures=min_pictures)
    return result


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True)
    parser.add_argument('--min-pictures',type=int,required=True)
    parser.add_argument('--expected-equations',type=int)
    args=parser.parse_args()
    try:
        print(json.dumps(verify(args.input,args.min_pictures,args.expected_equations),ensure_ascii=False))
    except Exception as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
