"""Generate NStar's original 15×15 board art. Run from any directory.
The coordinate-alignment tests in tests/board-art.test.js protect its geometry.
"""
from pathlib import Path
from math import sin,cos,pi
p=Path(__file__).resolve().parents[1] / 'assets' / 'boards' / 'nstar-board.svg'
colors={'green':('#1dba76','#08784d','#d9fff0'),'yellow':('#ffdb5a','#ef9c10','#fff7d4'),'red':('#ff7466','#d6273e','#ffebdf'),'blue':('#4ea5fb','#2854c6','#e5f4ff')}
yards={'green':(0,0),'yellow':(900,0),'red':(0,900),'blue':(900,900)}
lanes={'red':[(13,7),(12,7),(11,7),(10,7),(9,7)],'green':[(7,1),(7,2),(7,3),(7,4),(7,5)],'yellow':[(1,7),(2,7),(3,7),(4,7),(5,7)],'blue':[(7,13),(7,12),(7,11),(7,10),(7,9)]}
starts={'red':(13,6),'green':(6,1),'yellow':(1,8),'blue':(8,13)}
stars=[(8,2),(2,6),(6,12),(12,8)]
q=[]
a=q.append
a('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 1500" role="img" aria-label="NStar Ludo game board">')
a('<defs><clipPath id="clip"><rect width="1500" height="1500" rx="65"/></clipPath>')
a('<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdf2"/><stop offset="1" stop-color="#eadfc2"/></linearGradient>')
a('<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffdf7"/><stop offset="1" stop-color="#f3ebd7"/></linearGradient>')
for name,(hi,lo,pale) in colors.items():
 a(f'<linearGradient id="{name}" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="{hi}"/><stop offset="1" stop-color="{lo}"/></linearGradient>')
 a(f'<linearGradient id="{name}lane" x1="0" y1="0" x2="0" y2="1"><stop stop-color="{hi}"/><stop offset="1" stop-color="{lo}"/></linearGradient>')
a('<radialGradient id="well"><stop stop-color="#ffffff" stop-opacity=".85"/><stop offset="1" stop-color="#ffffff" stop-opacity=".48"/></radialGradient></defs>')
a('<g clip-path="url(#clip)"><rect width="1500" height="1500" fill="url(#paper)"/>')
for name,(x,y) in yards.items():
 hi,lo,pale=colors[name]
 a(f'<g><rect x="{x}" y="{y}" width="600" height="600" fill="url(#{name})"/>')
 a(f'<rect x="{x+35}" y="{y+35}" width="530" height="530" rx="60" fill="none" stroke="#ffffff" stroke-opacity=".24" stroke-width="5"/>')
 a(f'<rect x="{x+95}" y="{y+95}" width="410" height="410" rx="62" fill="{pale}" fill-opacity=".94" stroke="#fff" stroke-opacity=".7" stroke-width="5"/>')
 for dx,dy in [(200,200),(400,200),(200,400),(400,400)]:
  a(f'<circle cx="{x+dx}" cy="{y+dy}" r="51" fill="{lo}" fill-opacity=".20"/><circle cx="{x+dx}" cy="{y+dy-4}" r="42" fill="url(#well)" stroke="{hi}" stroke-opacity=".5" stroke-width="4"/>')
 a('</g>')
for row in range(15):
 for col in range(15):
  if not ((6<=row<=8) or (6<=col<=8)): continue
  if 6<=row<=8 and 6<=col<=8: continue
  paint='url(#tile)'
  for name,positions in lanes.items():
   if (row,col) in positions or (row,col)==starts[name]: paint=f'url(#{name}lane)'
  a(f'<rect x="{col*100+1}" y="{row*100+1}" width="98" height="98" rx="8" fill="{paint}" stroke="#ad9f83" stroke-opacity=".62" stroke-width="2"/>')
  a(f'<path d="M{col*100+10} {row*100+9}h80" stroke="#fff" stroke-opacity=".44" stroke-width="3" stroke-linecap="round"/>')
# four colored home wedges
a('<g stroke="#ffffff" stroke-opacity=".7" stroke-width="4" stroke-linejoin="round">')
a('<path d="M600 600H900L750 750Z" fill="url(#yellow)"/><path d="M900 600V900L750 750Z" fill="url(#blue)"/><path d="M600 900H900L750 750Z" fill="url(#red)"/><path d="M600 600V900L750 750Z" fill="url(#green)"/></g>')
a('<circle cx="750" cy="750" r="38" fill="#fff5d8" stroke="#e5b958" stroke-width="8"/><circle cx="750" cy="750" r="15" fill="#f2c853"/>')
# stars on the safe cells
for r,c in stars:
 cx,cy=(c+.5)*100,(r+.5)*100
 points=[]
 for i in range(10):
  angle=-pi/2+i*pi/5; rad=29 if i%2==0 else 13
  points.append(f'{cx+rad*cos(angle):.1f},{cy+rad*sin(angle):.1f}')
 a(f'<polygon points="{" ".join(points)}" fill="#e9c36b" stroke="#9f7731" stroke-width="4" stroke-linejoin="round"/>')
# start arrows that also act as safe indicators
for name,(r,c) in starts.items():
 cx,cy=(c+.5)*100,(r+.5)*100
 a(f'<circle cx="{cx}" cy="{cy}" r="24" fill="#fff" fill-opacity=".74"/><circle cx="{cx}" cy="{cy}" r="10" fill="{colors[name][1]}"/>')
a('</g><rect x="3" y="3" width="1494" height="1494" rx="62" fill="none" stroke="#fff5cf" stroke-width="7" opacity=".8"/></svg>')
p.write_text('\n'.join(q)+'\n')
print('Created',p,p.stat().st_size,'bytes')
