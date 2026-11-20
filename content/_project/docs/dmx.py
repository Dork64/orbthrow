import struct,sys
d=open(sys.argv[1],'rb').read()
p=d.index(b'\n\0')+2
def i32():
    global p; v=struct.unpack_from('<i',d,p)[0]; p+=4; return v
def u8():
    global p; v=d[p]; p+=1; return v
def cstr():
    global p; e=d.index(b'\0',p); s=d[p:e].decode('utf-8','replace'); p=e+1; return s
hdr=d[:p]
print(hdr[:60])
# prefix
npre=i32(); print('prefix elems',npre)
for _ in range(npre):
    na=i32()
    for _ in range(na):
        name=cstr(); t=u8()
        if t==6:
            ln=i32(); p+=ln
        elif t==5:
            v=cstr(); print('   =',v)
        else: raise SystemExit('prefix type %d'%t)
        print(' prefix attr',name,t)
nstr=i32(); print('strings',nstr)
strings=[cstr() for _ in range(nstr)]
print(strings[:40])
nel=i32(); print('elements',nel)
els=[]
for _ in range(nel):
    t=i32(); n=i32(); g=d[p:p+16]; p+=16
    els.append((strings[t],strings[n] if n<len(strings) else n))
print(els[:10])
print('pos after element headers',p)
open('/tmp/dmx_state.txt','w').write(str(p))
import collections
print(collections.Counter(e[0] for e in els).most_common(30))

SIZES={2:4,3:4,4:1,7:4,8:4,9:8,10:12,11:16,12:12,13:16,14:64,15:8,16:1}
def read_val(t):
    global p
    if t==1: return ('el',i32())
    if t==5: return strings[i32()]
    if t==6:
        ln=i32(); v=d[p:p+ln]; p+=ln; return ('bin',ln)
    if t in (10,12):
        v=struct.unpack_from('<3f',d,p); p+=12; return v
    if t==3:
        v=struct.unpack_from('<f',d,p)[0]; p+=4; return v
    if t==2:
        return i32()
    if t==4 or t==16:
        return u8()
    if t in SIZES:
        v=d[p:p+SIZES[t]]; p+=SIZES[t]; return ('raw',t)
    raise ValueError('type %d at %d'%(t,p))
ARR=32
attrs=[]
for ei in range(nel):
    na=i32(); a={}
    for _ in range(na):
        nm=strings[i32()]; t=u8()
        if t>ARR:
            bt=t-ARR; cnt=i32()
            if bt==5:
                v=[cstr() for _ in range(cnt)]
            else:
                v=[read_val(bt) for _ in range(cnt)]
            if bt in (2,3,4,16,15,9,11,13,14,8,7) and cnt>6: v=('arr',bt,cnt)
        else:
            v=read_val(t)
        a[nm]=v
    attrs.append(a)
print('end',p,len(d))
import json
ents=[]
for i,(t,n) in enumerate(els):
    if t=='CMapEntity':
        a=attrs[i]
        props=a.get('entity_properties')
        pr=attrs[props[1]] if props and props[0]=='el' and props[1]>=0 else {}
        ents.append(dict(cls=pr.get('classname'),name=pr.get('targetname'),origin=a.get('origin'),props={k:v for k,v in pr.items() if isinstance(v,(str,int,float)) and k not in('classname','targetname')}))
json.dump(ents,open('/tmp/ents.json','w'),default=str,indent=0)
from collections import Counter
print(Counter(e['cls'] for e in ents).most_common(40))

pref=[]
for i,(t,n) in enumerate(els):
    if t=='CMapPrefab':
        a=attrs[i]
        pref.append(dict(path=a.get('targetMapPath'),origin=a.get('origin'),angles=a.get('angles'),name=a.get('name')))
json.dump(pref,open('/tmp/prefabs.json','w'),default=str,indent=0)
for x in pref: print('PREFAB',x)
for e in json.load(open('/tmp/ents.json')):
    if e['cls'] not in ('prop_static',): print('ENT',e['cls'],e['name'],e['origin'],{k:v for k,v in e['props'].items() if k in ('target','model','path','unitname','MapUnitName','teamnumber','teamNum')})
