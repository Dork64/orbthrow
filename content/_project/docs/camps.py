import struct,math,zlib,json,os
g=open('fs.gnv','rb').read(); w,h,mx,my=274,288,-137,-144; grid=g[32:]
def val(x,y):
    cx=int((x-mx*64)//64); cy=int((y-my*64)//64)
    return grid[cy*w+cx] if 0<=cx<w and 0<=cy<h else 0
def clear(x,y,r):
    for dx in range(-r,r+1,32):
        for dy in range(-r,r+1,32):
            if dx*dx+dy*dy<=r*r and val(x+dx,y+dy)!=1: return False
    return True
def rot(x,y,deg):
    a=math.radians(deg); return (x*math.cos(a)-y*math.sin(a), x*math.sin(a)+y*math.cos(a))
F=(1696.2,4799.7); T=(1472,4128); S=(1543.7,4395.8)
bases=[]
for k in range(10):
    ang=-36*k
    bases.append(dict(k=k, fountain=rot(*F,ang), tower=rot(*T,ang), spawn=rot(*S,ang)))
for b in bases:
    b['angle']=math.degrees(math.atan2(b['fountain'][1],b['fountain'][0]))%360
items=[(1664,1664),(2432,0),(1664,-1664),(0,-2432),(-1664,-1664),(-2432,0),(-1664,1664),(0,2432)]
runes=[(-2432,-3264),(-3808,1344),(3776,1088),(128,3904),(2240,-3200)]
towers=[b['tower'] for b in bases]
placed=[]
def ok(p,r=180):
    x,y=p
    if placed and min(math.dist(p,q) for q in placed)<850: return False
    if not clear(x,y,r): return False
    if min(math.dist(p,t) for t in towers)<1150: return False
    if min(math.dist(p,i) for i in items)<450: return False
    if min(math.dist(p,q) for q in runes)<450: return False
    return True
def find(angle,radius,r=180,spread=14,rad_spread=500):
    best=None
    for da in range(0,spread+1,2):
        for s in (1,-1):
            for dr in range(0,rad_spread+1,50):
                for sr in (1,-1):
                    a=angle+s*da; R=radius+sr*dr
                    p=(R*math.cos(math.radians(a)),R*math.sin(math.radians(a)))
                    if ok(p,r):
                        placed.append(p); return p
    return None
camps=[]
for b in bases:
    p=find(b['angle']-9,3150)
    camps.append(dict(type='medium' if b['k']%2==0 else 'small',base=b['k'],pos=p))
large_slots=[0,3,5,8]
for k in large_slots:
    a=bases[k]['angle']+18
    camps.append(dict(type='large',pos=find(a,2750,200)))
for a in (22.5+45*1, 22.5+45*5):
    camps.append(dict(type='ancient',pos=find(a,1750,220)))
for c in camps: print(c['type'], c.get('base'), None if c['pos'] is None else (round(c['pos'][0]),round(c['pos'][1])))
print('bases', [(b['k'],round(b['angle'],1),tuple(round(v) for v in b['fountain'])) for b in bases])
json.dump(dict(bases=bases,items=items,runes=runes,camps=camps),open('mapinfo.json','w'),indent=1)
# render
S=3; W,H=w*S,h*S
img=[[ (20,20,20) for _ in range(W)] for _ in range(H)]
col={0:(15,15,15),1:(205,215,190),16:(70,110,70),17:(120,160,110),20:(60,60,60)}
for cy in range(h):
    for cx in range(w):
        c=col.get(grid[cy*w+cx],(255,0,0))
        for yy in range(S):
            for xx in range(S):
                img[(h-1-cy)*S+yy][cx*S+xx]=c
def pix(x,y): return (int((x-mx*64)/64*S), int((h-1-(y-my*64)/64)*S))
def dot(p,color,r=6):
    px,py=pix(*p)
    for yy in range(-r,r+1):
        for xx in range(-r,r+1):
            if xx*xx+yy*yy<=r*r and 0<=py+yy<H and 0<=px+xx<W: img[py+yy][px+xx]=color
def ring(p,R,color):
    for t in range(720):
        a=math.radians(t/2); dot((p[0]+R*math.cos(a),p[1]+R*math.sin(a)),color,1)
ring((0,0),900,(230,180,30))
for b in bases: dot(b['fountain'],(40,120,255),8); dot(b['tower'],(20,60,200),5)
for i in items: dot(i,(255,140,0),6)
for q in runes: dot(q,(255,215,0),7)
cc={'small':(255,90,90),'medium':(220,40,40),'large':(150,0,0),'ancient':(120,0,160)}
for c in camps:
    if c['pos']: dot(c['pos'],cc[c['type']],9 if c['type'] in('large','ancient') else 7)
raw=b''.join(b'\x00'+bytes([v for px in row for v in px]) for row in img)
def chunk(t,data): return struct.pack('>I',len(data))+t+data+struct.pack('>I',zlib.crc32(t+data)&0xffffffff)
out=os.path.expanduser('~/mnt/content--dota_addons/orbthrow/_project/docs/map_plan.png')
open(out,'wb').write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',W,H,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))
print('png ok')
