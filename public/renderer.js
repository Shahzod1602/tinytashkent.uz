// Real OSM footprints, rendered locally as an illustrated orthographic city.
// Geographic outlines are preserved; heights and facade details are artistic.
import {buildingProfile,HEIGHT_SCALE} from './architecture.js';
import {LANDMARK_ROLES} from './landmarks.js';
import {drawLandmarkFacade,drawNeighbourhoodDetails} from './facades.js';
const ORIGIN = [69.276, 41.315];
const COS = Math.cos(-Math.PI / 9), SIN = Math.sin(-Math.PI / 9);
const METER = .98, TILT = .62, MARGIN = 220;
// Edition 11 is baked as pixel art (one art pixel per world pixel), so facade
// details are drawn at whole-pixel sizes instead of hairlines that would alias.
const PIXEL = true;
export const MAP_BOUNDS = [69.115, 41.150, 69.535, 41.430];
const [WEST,SOUTH,EAST,NORTH] = MAP_BOUNDS;
function raw([lon, lat]) {
  const x = (lon - ORIGIN[0]) * 111320 * Math.cos(ORIGIN[1] * Math.PI / 180);
  const y = (ORIGIN[1] - lat) * 111320;
  return [(x * COS - y * SIN) * METER, (x * SIN + y * COS) * METER * TILT];
}
const corners = [[WEST,SOUTH],[EAST,SOUTH],[EAST,NORTH],[WEST,NORTH]].map(raw);
const MINX = Math.min(...corners.map(p=>p[0])) - MARGIN;
const MINY = Math.min(...corners.map(p=>p[1])) - MARGIN;
export const WIDTH = Math.ceil((Math.max(...corners.map(p=>p[0])) - MINX + MARGIN)/32)*32;
export const HEIGHT = Math.ceil((Math.max(...corners.map(p=>p[1])) - MINY + MARGIN)/32)*32;
export function project(p) { const a=raw(p); return [a[0]-MINX,a[1]-MINY]; }
export function unproject([x,y]) {
  x=(x+MINX)/METER;y=(y+MINY)/METER/TILT;
  return [ORIGIN[0]+(x*COS+y*SIN)/(111320*Math.cos(ORIGIN[1]*Math.PI/180)),ORIGIN[1]-(-x*SIN+y*COS)/111320];
}
export function hash(s) { let h=2166136261;for(let i=0;i<String(s).length;i++)h=Math.imul(h^String(s).charCodeAt(i),16777619);return h>>>0; }
function rng(seed) { let a=seed;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}; }
function polygons(f) {
  if(f.geometry.type==='Polygon')return [f.geometry.coordinates];
  if(f.geometry.type==='MultiPolygon')return f.geometry.coordinates;
  return [];
}
function polygonPath(c, rings, height=0) {
  c.beginPath();for(const ring of rings){for(let i=0;i<ring.length;i++){const p=ring[i];i?c.lineTo(p[0],p[1]-height):c.moveTo(p[0],p[1]-height);}c.closePath();}
}
function shape(c, ring, color) { polygonPath(c,[ring]);c.fillStyle=color;c.fill(); }
function area(p){let a=0;for(let i=0,j=p.length-1;i<p.length;j=i++)a+=p[j][0]*p[i][1]-p[i][0]*p[j][1];return Math.abs(a/2);}
function inside(pt, p){let b=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>pt[1])!==(p[j][1]>pt[1])&&pt[0]<(p[j][0]-p[i][0])*(pt[1]-p[i][1])/(p[j][1]-p[i][1])+p[i][0])b=!b;return b;}
function bounds(p){return [Math.min(...p.map(a=>a[0])),Math.min(...p.map(a=>a[1])),Math.max(...p.map(a=>a[0])),Math.max(...p.map(a=>a[1]))];}
function center(p){const n=p.length-1||1;return [p.slice(0,n).reduce((s,a)=>s+a[0],0)/n,p.slice(0,n).reduce((s,a)=>s+a[1],0)/n];}
function fillPolygon(c, f, color) { for(const poly of polygons(f)){polygonPath(c,poly.map(r=>r.map(project)));c.fillStyle=color;c.fill('evenodd');} }
// A restrained ink outline, sunlit plaster and cool shadows give the real
// footprints the appearance of hand-painted miniature buildings.
function blend(hex,other,t){
  const a=parseInt(hex.slice(1),16),b=parseInt(other.slice(1),16);
  return '#'+[16,8,0].map(s=>Math.round(((a>>s)&255)*(1-t)+((b>>s)&255)*t).toString(16).padStart(2,'0')).join('');
}
function strokeShape(c,p,fill,stroke='#465650',width=.65){
  polygonPath(c,[p]);c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=width;c.lineJoin='round';c.stroke();
}
function drawTree(c,x,y,size,seed){
  const r=rng(seed),s=size,poplar=seed%11===0,pine=seed%17===3;
  const rx=s*(poplar?.55:pine?.7:.96),ry=s*(poplar?1.22:pine?1.1:.88),cy=y-s*(poplar?1.65:pine?1.52:1.28);
  const colors=[['#254b32','#527d3c','#99b45b'],['#2d4e2e','#688849','#b0bd6d'],['#254b3c','#47764b','#88a966'],['#314d30','#5a7d3b','#9fac57']][seed%4];
  c.fillStyle='#243d3334';c.beginPath();c.ellipse(x+s*.7,y+s*.18,s*1.12,s*.43,-.16,0,Math.PI*2);c.fill();
  c.fillStyle='#263d3438';c.beginPath();c.ellipse(x,y+.3,s*.44,s*.22,0,0,Math.PI*2);c.fill();
  c.strokeStyle='#66604a';c.lineWidth=Math.max(.8,s*.12);c.beginPath();c.moveTo(x,y);c.lineTo(x-.12*s,cy+s*.45);c.stroke();
  c.strokeStyle='#a5996c';c.lineWidth=.4;c.beginPath();c.moveTo(x-.4,y-.1);c.lineTo(x-.12*s-.4,cy+s*.45);c.stroke();
  const outline=[];
  for(let i=0;i<32;i++){const a=i/32*Math.PI*2,lobe=.92+.07*Math.sin(a*5+seed)+r()*.06;outline.push([x+Math.cos(a)*rx*lobe,cy+Math.sin(a)*ry*lobe]);}
  if(pine){
    outline.length=0;
    outline.push([x,cy-ry],[x+rx*.4,cy-ry*.35],[x+rx*.18,cy-ry*.35],[x+rx*.7,cy+ry*.2],[x+rx*.37,cy+ry*.2],[x+rx,cy+ry*.78],[x+rx*.25,cy+ry],[x-rx*.8,cy+ry*.85],[x-rx*.35,cy+ry*.2],[x-rx*.65,cy+ry*.2],[x-rx*.18,cy-ry*.35],[x-rx*.36,cy-ry*.35]);
  }
  strokeShape(c,outline,colors[0],'#203d3270',.35);
  c.save();polygonPath(c,[outline]);c.clip();
  const lobes=[[-.05,.47,.65],[-.48,.05,.53],[.46,.12,.57],[.05,-.03,.67],[-.32,-.42,.55],[.3,-.43,.5],[.02,-.65,.42]];
  for(const [dx,dy,radius]of lobes){
    const xx=x+dx*rx+(r()-.5)*s*.13,yy=cy+dy*ry+(r()-.5)*s*.12;
    c.fillStyle=colors[1];c.beginPath();c.ellipse(xx,yy,rx*radius,ry*radius*.85,0,0,Math.PI*2);c.fill();
    c.fillStyle=colors[2]+'a0';c.beginPath();c.ellipse(xx-rx*.12,yy-ry*.14,rx*radius*.63,ry*radius*.51,-.25,0,Math.PI*2);c.fill();
    c.fillStyle=colors[0]+'46';c.beginPath();c.ellipse(xx+rx*.2,yy+ry*.19,rx*radius*.55,ry*radius*.33,.2,0,Math.PI*2);c.fill();
  }
  for(let i=0;i<26;i++){
    const xx=x+(r()-.54)*rx*1.7,yy=cy+(r()-.57)*ry*1.65;
    c.fillStyle=i%4===0?colors[0]+'85':colors[2]+'b0';c.fillRect(xx,yy,.4+r()*.7,.3+r()*.45);
  }
  c.restore();
}
function facade(c,a,b,h,seed,pal,props,hotel=false){
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  if(len<4||h<4||Math.abs(dx)/len<.14)return;
  c.save();
  // Windows follow the wall's perspective, including sloped street fronts.
  c.translate(a[0],a[1]);c.transform(dx/len,dy/len,0,1,0,0);
  c.beginPath();c.rect(0,-h,len,h);c.clip();
  const mappedLevel=Number.parseFloat(props['building:levels']),minLevel=Number.parseFloat(props['building:min_level']);
  const wallFloors=Math.min(160,Math.max(1,hotel?17:Number.isFinite(mappedLevel)?mappedLevel-(Number.isFinite(minLevel)?minLevel:0):Math.round(h/(3.2*HEIGHT_SCALE))));
  const details={len,h,dx,seed,pal,props,floors:wallFloors,identity:pal.identity,typology:pal.typology};
  if(drawLandmarkFacade(c,details)){c.restore();return;}
  if(pal.art){
    if(pal.style==='industrial'){
      for(let x=0;x<len;x+=16)c.drawImage(pal.art.cells[5],x,-h,16,h);
      c.globalCompositeOperation='multiply';c.fillStyle=dx<0?'#77938f':'#baa98f';c.fillRect(0,-h,len,h);c.globalCompositeOperation='source-over';
      c.fillStyle='#4f6c70';c.fillRect(len*.5-2,-Math.min(h*.8,4.5),4,Math.min(h*.8,4.5));c.restore();return;
    }
    const mapped=Number.parseFloat(props['building:levels']);
    const minLevel=Number.parseFloat(props['building:min_level']);
    const floors=Math.min(160,Math.max(1,hotel?17:Number.isFinite(mapped)?mapped-(Number.isFinite(minLevel)?minLevel:0):Math.round(h/(3.2*HEIGHT_SCALE))));
    const slot=hotel?3:pal.style==='glass'?2:['mosque','civic'].includes(pal.style)?6:pal.style==='house'?0:1;
    const columns=[2,3,6,4,0,0,4][slot],rows=[2,4,5,5,0,0,1][slot];
    const dh=['mosque','civic'].includes(pal.style)?h:rows*h/floors,dw=columns*(hotel?4:pal.style==='glass'?3.5:4.8);
    const image=pal.art.cells[slot];c.imageSmoothingEnabled=true;c.imageSmoothingQuality='low';
    for(let y=-h;y<-.01;y+=dh)for(let x=0;x<len;x+=dw)c.drawImage(image,x,y,dw,dh);
    const paleStone=['mosque','civic'].includes(pal.style);
    c.globalCompositeOperation='multiply';c.fillStyle=paleStone?(dx<0?'#9bb1a7':'#ded0ad'):(dx<0?'#75928f':'#c5b194');c.fillRect(0,-h,len,h);c.globalCompositeOperation='source-over';
    if(!paleStone&&!hotel){
      if(pal.style!=='glass'){
        c.globalCompositeOperation='color';c.globalAlpha=pal.typology==='slab'?.65:.4;c.fillStyle=pal.wall;c.fillRect(0,-h,len,h);c.globalAlpha=1;c.globalCompositeOperation='source-over';
      }
      const step=pal.style==='glass'?3.5:4.8,fh=h/floors;
      c.fillStyle='#213b3b35';c.fillRect(0,-Math.min(2,h*.2),len,Math.min(2,h*.2));
      if(pal.style==='glass'){
        c.fillStyle='#d9e9df1c';c.beginPath();c.moveTo(len*.12,-h);c.lineTo(len*.34,-h);c.lineTo(len*.68,0);c.lineTo(len*.52,0);c.closePath();c.fill();
        c.strokeStyle='#b7d0ca80';c.lineWidth=.45;for(let x=0;x<len;x+=step*3){c.beginPath();c.moveTo(x,-h);c.lineTo(x,0);c.stroke();}
      }else{
        c.strokeStyle='#3a514733';c.lineWidth=.4;for(let x=step*3;x<len;x+=step*3){c.beginPath();c.moveTo(x,-h);c.lineTo(x,0);c.stroke();}
        if(h>12&&props.building==='apartments')for(let f=1;f<floors-1;f+=2)for(let j=seed%3;j<len/step;j+=3){
          const x=(j+.5)*step,y=-h+(f+.85)*fh;
          c.fillStyle='#24444160';c.fillRect(x-1.65,y+.4,3.3,.8);c.fillStyle=blend(pal.wall,'#f0e6cb',.27);c.fillRect(x-1.65,y-.2,3.3,.65);
          c.fillStyle=(seed+j+f)%4===0?'#3d6b40':'#8b9c8e';c.fillRect(x-1.15,y-.7,1.1,.7);
        }
        if(h>8){
          c.strokeStyle='#4e625775';c.lineWidth=.45;c.beginPath();c.moveTo(len*.08,-h);c.lineTo(len*.08,0);c.stroke();
          for(let f=2;f<floors-1;f+=4){const x=((seed+f*7)%Math.max(1,Math.floor(len/step))+.72)*step,y=-h+(f+.7)*fh;c.fillStyle='#344d4c70';c.fillRect(x+.25,y+.35,1.8,1.2);c.fillStyle='#c4c8b5';c.fillRect(x,y,1.7,.9);}
        }
        if(len>15&&h>8){const x=len*(.28+(seed%4)*.13);c.fillStyle='#283f42';c.fillRect(x,-3.4,2.3,3.4);c.fillStyle=blend(pal.wall,'#e6ddc0',.4);c.fillRect(x-.6,-4.2,3.6,.55);c.fillStyle='#29413b35';c.fillRect(x-.5,-3.6,3.6,.65);}
      }
    }
    drawNeighbourhoodDetails(c,details);
    c.fillStyle='#f3e9d580';c.fillRect(0,-h,len,.55);c.restore();return;
  }
  if(pal.style==='mosque'||pal.style==='civic'){
    const columns=Math.max(1,Math.floor(len/6)),step=len/columns,arch=Math.min(step*.30,h*.20),top=-h*.72;
    for(let i=0;i<columns;i++){
      const x=(i+.5)*step;c.fillStyle=pal.style==='mosque'?'#709799':'#667e7e';
      c.beginPath();c.moveTo(x-arch,-1);c.lineTo(x-arch,top+arch);c.quadraticCurveTo(x-arch,top,x,top-.4);c.quadraticCurveTo(x+arch,top,x+arch,top+arch);c.lineTo(x+arch,-1);c.closePath();c.fill();
      c.strokeStyle='#f5edd9';c.lineWidth=.75;c.stroke();
      c.fillStyle='#c5c6ad';c.fillRect(x-arch-.7,-1.2,arch*2+1.4,.7);
      c.fillStyle='#e9e1cc';c.fillRect(x-arch-.8,top+arch,.8,-top-arch);c.fillRect(x+arch,top+arch,.8,-top-arch);
    }
    c.fillStyle='#eee6d1';c.fillRect(0,-h,len,.8);c.fillStyle=pal.style==='mosque'?'#6b9fa3':'#c2bba6';c.fillRect(0,-h+1,len,.6);c.restore();return;
  }
  const mappedFloors=Number.parseFloat(props['building:levels']),minFloors=Number.parseFloat(props['building:min_level'])||0;
  const floors=Math.min(160,Math.max(1,hotel?17:props['roof:shape']&&props['roof:shape']!=='flat'?Math.round(h/(3.2*HEIGHT_SCALE)):Number.isFinite(mappedFloors)?Math.round(mappedFloors-minFloors):Math.round(h/(3.2*HEIGHT_SCALE)))),fh=h/floors;
  const count=Math.max(1,Math.floor(len/(hotel?4.2:pal.style==='house'?5.4:4.5))),step=len/count;
  const glass=pal.style==='glass';
  if(glass){
    const reflection=c.createLinearGradient(0,-h,len,0);reflection.addColorStop(0,blend(pal.wall,'#9fbdba',.3));reflection.addColorStop(.46,blend(pal.wall,'#244451',.48));reflection.addColorStop(1,blend(pal.wall,'#5d8791',.3));c.fillStyle=reflection;c.fillRect(0,-h,len,h);
    c.strokeStyle='#d0e2d138';c.lineWidth=1.1;for(let x=-h;x<len+h;x+=24){c.beginPath();c.moveTo(x,-h);c.lineTo(x+h*.4,0);c.stroke();}
  }else if(h>8&&!PIXEL){
    c.fillStyle=blend(pal.wall,'#526561',.12);for(let x=step*2.9;x<len;x+=step*3)c.fillRect(x,-h,.35,h);
    c.fillStyle=blend(pal.wall,'#f5e9d4',.13);c.fillRect(len*.08,-h,Math.max(.6,len*.015),h);
  }
  const balcony=!hotel&&!glass&&h>12&&(props.building==='apartments'||seed%3===0);
  c.fillStyle='#344a4430';c.fillRect(0,-2,len,2);
  for(let f=0;f<floors;f++){
    const top=-h+f*fh+Math.min(1.2,fh*.23),wh=Math.max(1.4,fh*.52);
    if(f>0&&h>10&&!PIXEL){c.fillStyle=blend(pal.wall,'#405a5a',.20);c.fillRect(0,-h+f*fh-.3,len,.35);}
    for(let j=0;j<count;j++){
      const x=(j+.5)*step,ww=Math.min(step*(glass?.88:.52),glass?4.5:2.7),variant=(seed+j*29+f*17)%23;
      if(hotel){
        c.fillStyle='#48616a';c.fillRect(x-step*.38,top,step*.76,wh);
        c.strokeStyle='#f5e7cc';c.lineWidth=.65;c.strokeRect(x-step*.46,top-.35,step*.92,wh+.65);
        c.beginPath();c.moveTo(x,top-.35);c.lineTo(x,top+wh+.3);c.moveTo(x-step*.46,top+wh*.48);c.lineTo(x+step*.46,top+wh*.48);c.stroke();
      }else if(PIXEL){
        // One clean pane per bay and storey: a regular grid reads as windows,
        // where sub-pixel frames and glints turn into speckle.
        const pane=glass?Math.max(2,step-1):step>=5?3:2,tall=Math.max(2,Math.min(Math.round(fh-2),5)),y=-h+f*fh+1;
        c.fillStyle=variant<2?'#c2bfa8':glass?blend(pal.wall,'#1b4659',.5):variant===3?'#5d7377':'#2c4753';c.fillRect(x-pane/2,y,pane,Math.min(tall,fh-1));
        if(balcony&&f<floors-1&&j%3!==2){c.fillStyle=blend(pal.wall,'#2e4b48',.32);c.fillRect(x-pane/2-1,y+Math.min(tall,fh-1),pane+2,1);}
      }else{
        c.fillStyle=blend(pal.wall,glass?'#c1d1c8':'#f6e7ce',glass?.12:.38);c.fillRect(x-ww/2-.35,top-.3,ww+.7,wh+.6);
        c.fillStyle=variant<2?'#b5b39b':glass?blend(pal.wall,'#1b4659',.46):variant===3?'#6f7e78':'#334d56';c.fillRect(x-ww/2,top,ww,wh);
        c.fillStyle=glass?'#8fb3ba':'#92a9a6';c.fillRect(x-ww/2+.2,top+.2,Math.max(.5,ww*.35),wh*.55);
        if(wh>3){c.fillStyle='#c8c6b0';c.fillRect(x-ww/2,top+wh*.48,ww,.35);}
        c.fillStyle='#42545180';c.fillRect(x-ww/2-.5,top+wh+.45,ww+1,.6);
        if(balcony&&f<floors-1&&j%3!==2){
          c.fillStyle=blend(pal.wall,'#2e4b48',.28);c.fillRect(x-ww*.7,top+wh-.3,ww*1.4,1.3);
          c.fillStyle=blend(pal.wall,'#f4ead5',.35);c.fillRect(x-ww*.7,top+wh-.4,ww*1.4,.4);
          c.fillStyle=variant%3===0?'#46734a':'#738b83';c.fillRect(x-ww*.7+.45,top+wh,Math.max(.5,ww*.2),.7);
          c.fillStyle='#384f5070';c.fillRect(x-ww*.7,top+wh+.9,ww*1.4,.4);
        }
        if(!glass&&variant===7&&f<floors-1){c.fillStyle='#30444455';c.fillRect(x+ww*.6,top+wh*.55,1.8,1.2);c.fillStyle='#c8cab8';c.fillRect(x+ww*.6,top+wh*.55-.3,1.6,.85);}
      }
    }
  }
  if(len>12&&h>7){
    c.fillStyle='#485d61';c.fillRect(len*.5-1.2,-3.2,2.4,3.2);c.fillStyle='#d0c4a6';c.fillRect(len*.5-1.5,-3.5,3,.5);
    if((props.building==='retail'||seed%17===0)&&h<30){
      for(let j=0;j<6;j++){c.fillStyle=j%2?'#f4e5c8':'#c77d62';c.fillRect(len*.5-4+j*1.35,-4.6,1.35,1.5);}
      c.fillStyle='#4b574850';c.fillRect(len*.5-4,-3.1,8.1,.6);
    }
  }
  c.fillStyle='#e5dec6a0';c.fillRect(0,-h,len,PIXEL?1:.5);
  c.restore();
}
function roofBox(c,x,y,w,d,h,color){
  const p=[[x-w/2,y-d/2],[x+w/2,y-d/2+1.5],[x+w/2-2,y+d/2],[x-w/2-2,y+d/2-1.5]];
  shape(c,p.map(a=>[a[0]+h*.8,a[1]+1]),'#30423f2e');
  strokeShape(c,[p[2],p[3],[p[3][0],p[3][1]-h],[p[2][0],p[2][1]-h]],blend(color,'#334e50',.3),'#54655d',.4);
  strokeShape(c,[p[1],p[2],[p[2][0],p[2][1]-h],[p[1][0],p[1][1]-h]],blend(color,'#334e50',.45),'#54655d',.4);
  strokeShape(c,p.map(a=>[a[0],a[1]-h]),color,'#58685e',.4);
}
function roofCorners(ring){
  const points=ring.slice(0,-1);
  return points.filter((p,i)=>{
    const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
    return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>Math.hypot(b[0]-a[0],b[1]-a[1])*.15;
  });
}
function paintRoofMaterial(c,face,index,pal,alpha=.36){
  if(!pal.art)return;
  const image=pal.art.cells[index];
  let pattern=pal.art.patterns.get(index);if(!pattern){pattern=c.createPattern(image,'repeat');pal.art.patterns.set(index,pattern);}
  const bb=bounds(face),scale=(index===7?8:6)/image.width;
  c.save();polygonPath(c,[face]);c.clip();c.globalAlpha=alpha;c.scale(scale,scale);c.fillStyle=pattern;c.fillRect(bb[0]/scale,bb[1]/scale,(bb[2]-bb[0])/scale,(bb[3]-bb[1])/scale);c.restore();
}
function drawDomeRoof(c,b,pal){
  const bb=bounds(b.rings[0]),x=(bb[0]+bb[2])/2,y=(bb[1]+bb[3])/2-b.eave;
  const rx=(bb[2]-bb[0])/2,ry=(bb[3]-bb[1])/2,rise=Math.max(1,b.rise);
  const rows=12,columns=48,onion=b.roofShape==='onion',faces=[];
  const point=(i,j)=>{
    const theta=i/columns*Math.PI*2,phi=j/rows*Math.PI/2;
    const radius=Math.cos(phi)*(onion?1+.18*Math.sin(phi*2):1);
    return [x+rx*Math.cos(theta)*radius,y+ry*Math.sin(theta)*radius-rise*Math.sin(phi)];
  };
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
    const p=[point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1)];
    let signed=0;for(let k=0;k<4;k++){const a=p[k],v=p[(k+1)%4];signed+=a[0]*v[1]-v[0]*a[1];}
    if(signed<=.001)continue;
    const theta=(i+.5)/columns*Math.PI*2,phi=(j+.5)/rows*Math.PI/2;
    const light=.48-.30*Math.cos(theta)*Math.cos(phi)+.28*Math.sin(phi)-.10*Math.sin(theta)*Math.cos(phi);
    const color=light>.52?blend(pal.roof,'#e9e3bc',(light-.52)*.75):blend(pal.roof,'#244555',(.52-light)*.85);
    faces.push({p,color,i,j,y:p.reduce((sum,p)=>sum+p[1],0)/4});
  }
  faces.sort((a,b)=>a.y-b.y);
  for(const face of faces){
    strokeShape(c,face.p,face.color,face.color,.35);
    if(pal.art)paintRoofMaterial(c,face.p,7,pal,.16);
    if(b.identity==='chorsu'&&[3,4,8].includes(face.j)){
      const p=face.p,mid=(a,v)=>[(a[0]+v[0])/2,(a[1]+v[1])/2];
      c.fillStyle=face.j===4?'#2b6f8f99':'#e2d0a58a';polygonPath(c,[[mid(p[0],p[1]),mid(p[1],p[2]),mid(p[2],p[3]),mid(p[3],p[0])]]);c.fill();
    }
    if(face.i%6===0){c.strokeStyle='#d9e4cd85';c.lineWidth=.45;c.beginPath();c.moveTo(...face.p[0]);c.lineTo(...face.p[3]);c.stroke();}
    if(face.j===2||face.j===8){c.strokeStyle='#d9d9b879';c.lineWidth=.45;c.beginPath();c.moveTo(...face.p[0]);c.lineTo(...face.p[1]);c.stroke();}
  }
  c.strokeStyle=blend(pal.roof,'#294750',.45);c.lineWidth=.6;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI);c.stroke();
  if(b.props.religion==='muslim'||b.id==='way/523383977'){
    c.strokeStyle='#c1ac74';c.lineWidth=.7;c.beginPath();c.moveTo(x,y-rise);c.lineTo(x,y-rise-3);c.stroke();
  }
}
// OSM roof:direction is downhill slope, not the ridge bearing.
export function roofEdgeForDirection(points,bearing,skillion=false){
  const theta=(bearing+90)*Math.PI/180,p=project(ORIGIN),v=project([ORIGIN[0]+Math.sin(theta)*.001/Math.cos(ORIGIN[1]*Math.PI/180),ORIGIN[1]+Math.cos(theta)*.001]);
  const axis=[v[0]-p[0],v[1]-p[1]],score=i=>{const a=points[i],v=points[(i+1)%4],dx=v[0]-a[0],dy=v[1]-a[1];return Math.abs(dx*axis[0]+dy*axis[1])/(Math.hypot(dx,dy)||1);};
  let edge=Array.from({length:4},(_,i)=>i).sort((a,b)=>score(b)-score(a))[0];
  if(skillion){
    const theta=bearing*Math.PI/180,v=project([ORIGIN[0]+Math.sin(theta)*.001/Math.cos(ORIGIN[1]*Math.PI/180),ORIGIN[1]+Math.cos(theta)*.001]);
    const low=points[(edge+1)%4],high=points[(edge+2)%4];
    if((low[0]-high[0])*(v[0]-p[0])+(low[1]-high[1])*(v[1]-p[1])<0)edge=(edge+2)%4;
  }
  return edge;
}
function drawPitchedRoof(c,b,pal,roof){
  const points=roofCorners(roof),shape=b.roofShape,rise=Math.max(1,b.rise);
  if(points.length!==4&&shape!=='pyramidal'&&shape!=='conical')return false;
  const cp=center(roof);
  let faces;
  if(shape==='pyramidal'||shape==='conical'){
    const apex=[cp[0],cp[1]-rise];faces=points.map((p,i)=>[p,points[(i+1)%points.length],apex]);
  }else{
    let longest=0;
    for(let i=1;i<4;i++)if(Math.hypot(points[(i+1)%4][0]-points[i][0],points[(i+1)%4][1]-points[i][1])>Math.hypot(points[(longest+1)%4][0]-points[longest][0],points[(longest+1)%4][1]-points[longest][1]))longest=i;
    if(b.roofBearing!==null&&b.roofBearing!==undefined)longest=roofEdgeForDirection(points,b.roofBearing,shape==='skillion');
    else if(b.props['roof:orientation']==='across')longest=(longest+1)%4;
    const q=Array.from({length:4},(_,i)=>points[(i+longest)%4]);
    const a=[(q[0][0]+q[3][0])/2,(q[0][1]+q[3][1])/2],v=[(q[1][0]+q[2][0])/2,(q[1][1]+q[2][1])/2];
    const inset=['gabled','gambrel','round'].includes(shape)?0:.19;
    const r1=[a[0]*(1-inset)+v[0]*inset,a[1]*(1-inset)+v[1]*inset-rise],r2=[a[0]*inset+v[0]*(1-inset),a[1]*inset+v[1]*(1-inset)-rise];
    if(shape==='skillion')faces=[[q[0],q[1],[q[2][0],q[2][1]-rise],[q[3][0],q[3][1]-rise]]];
    else faces=[[q[0],q[1],r2,r1],[q[1],q[2],r2],[q[2],q[3],r1,r2],[q[3],q[0],r1]];
  }
  faces.sort((a,b)=>a.reduce((s,p)=>s+p[1],0)/a.length-b.reduce((s,p)=>s+p[1],0)/b.length);
  for(const face of faces){
    const a=face[0],v=face[1],len=Math.hypot(v[0]-a[0],v[1]-a[1])||1;
    const lit=.18+.20*(v[0]-a[0])/len;
    const color=blend(pal.roof,lit>.18?'#f5dbac':'#304e58',Math.abs(lit-.18)+.10);
    strokeShape(c,face,color,'#4e5a54a0',.55);
    const rgb=parseInt(pal.roof.slice(1),16);paintRoofMaterial(c,face,((rgb>>16)&255)>((rgb>>8)&255)*1.07?4:5,pal,.55);
    c.save();polygonPath(c,[face]);c.clip();
    const bb=bounds(face);c.strokeStyle='#e7d7bd54';c.lineWidth=.4;
    for(let y=bb[1]+2;y<bb[3];y+=2.6){c.beginPath();c.moveTo(bb[0],y);c.lineTo(bb[2],y+(v[1]-a[1])*.3);c.stroke();}
    c.restore();
  }
  return true;
}
function drawBuilding(c,b,art){
  const {rings,seed,props}=b,ring=rings[0],rand=rng(seed),ar=area(ring),h=b.eave,base=b.base;
  if(ring.length<4)return;
  const hotel=props.name?.includes('Uzbekistan')||props['name:en']?.includes('Uzbekistan Hotel')||b.id==='way/44491343';
  const pal={wall:b.wall,roof:blend(b.roof,'#294955',b.identity?.06:['mosque','civic'].includes(b.style)?.08:b.style==='house'?.10:.14),style:b.style,identity:b.identity,typology:b.typology,id:b.id,art};
  const sides=[];
  for(const r of rings)for(let i=0;i<r.length-1;i++){const a=r[i],v=r[i+1];sides.push({a,b:v,y:(a[1]+v[1])/2});}
  sides.sort((a,b)=>a.y-b.y);
  for(const {a,b:v} of sides){
    const dx=v[0]-a[0],dy=v[1]-a[1],len=Math.hypot(dx,dy);
    const shade=.05+.50*(.5+.5*(.76*dx+.65*dy)/(len||1));
    const wall=blend(pal.wall,'#43585b',shade);
    if(h>base+.1){
      strokeShape(c,[[a[0],a[1]-base],[v[0],v[1]-base],[v[0],v[1]-h],[a[0],a[1]-h]],wall,'#4b5b546b',.5);
      if(ar>25&&len>4)facade(c,[a[0],a[1]-base],[v[0],v[1]-base],h-base,seed,{...pal,wall},props,hotel||b.style==='hotel');
    }
  }
  const roof=ring.map(p=>[p[0],p[1]-h]),roofRings=rings.map(r=>r.map(p=>[p[0],p[1]-h])),bb=bounds(roof);
  polygonPath(c,roofRings);c.fillStyle=pal.roof;c.fill('evenodd');c.strokeStyle='#465954';c.lineWidth=.75;c.stroke();
  if(b.plinth)return;
  if(['dome','onion'].includes(b.roofShape)){drawDomeRoof(c,b,pal);return;}
  if(b.roofShape!=='flat'&&b.rise>.1&&drawPitchedRoof(c,b,pal,roof))return;
  c.save();polygonPath(c,roofRings);c.clip('evenodd');
  if(art)paintRoofMaterial(c,roof,5,pal,.13);
    // Parapets sit just inside the roof, with a dark inner edge and sunlit lip.
    c.strokeStyle='#465b5666';c.lineWidth=1.8;polygonPath(c,roofRings);c.stroke();
    c.strokeStyle='#d6d5c2';c.lineWidth=.65;polygonPath(c,roofRings);c.stroke();
    if(ar>100&&!b.identity){
      c.strokeStyle='#536c6026';c.lineWidth=.5;
      const a=roof[0],v=roof[1],angle=Math.atan2(v[1]-a[1],v[0]-a[0]);
      c.save();const cp=center(roof);c.translate(...cp);c.rotate(angle);
      const span=Math.hypot(bb[2]-bb[0],bb[3]-bb[1]);
      for(let y=-span;y<span;y+=b.style==='industrial'?5.5:13){c.beginPath();c.moveTo(-span,y);c.lineTo(span,y);c.stroke();}if(b.style!=='industrial'){c.strokeStyle='#e0ddc225';for(let x=-span;x<span;x+=19){c.beginPath();c.moveTo(x,-span);c.lineTo(x,span);c.stroke();}}c.restore();
      const count=Math.min(12,Math.max(1,Math.floor(ar/220)));
      for(let i=0;i<count;i++){
        const x=bb[0]+(bb[2]-bb[0])*(.18+rand()*.64),y=bb[1]+(bb[3]-bb[1])*(.18+rand()*.64);
        if(!inside([x,y],roof)||roofRings.slice(1).some(r=>inside([x,y],r)))continue;
        if(seed%5===0&&ar>500){
          strokeShape(c,[[x-3,y-2],[x+4,y-1],[x+3,y+2],[x-4,y+1]],'#547782','#405a63',.4);
          c.strokeStyle='#bdced066';c.lineWidth=.5;c.beginPath();c.moveTo(x,y-1.5);c.lineTo(x-1,y+1.5);c.stroke();
        }else roofBox(c,x,y,i===0&&ar>700?7:3+rand()*3,i===0&&ar>700?5:2+rand()*2,i===0&&ar>700?4:1.8+rand()*2.2,blend(pal.wall,'#9aa399',.35));
      }
    }
  c.restore();
  c.strokeStyle='#e0ddc16b';c.lineWidth=.45;polygonPath(c,roofRings);c.stroke();
}
function landmarkDetail(c,type,p){
  if(type==='amir'){
    const [x,y]=p;shape(c,[[x-5,y],[x+5,y-2],[x+9,y+1],[x,y+5]],'#bcb093');c.fillStyle='#b7a886';c.fillRect(x-4,y-8,9,10);c.fillStyle='#4c6255';
    c.beginPath();c.moveTo(x-6,y-14);c.lineTo(x+5,y-17);c.lineTo(x+8,y-22);c.lineTo(x+11,y-21);c.lineTo(x+9,y-13);c.lineTo(x+3,y-11);c.lineTo(x+4,y-5);c.lineTo(x+2,y-5);c.lineTo(x,y-11);c.lineTo(x-4,y-10);c.lineTo(x-5,y-5);c.lineTo(x-7,y-5);c.closePath();c.fill();c.fillRect(x-1,y-23,3,9);c.beginPath();c.arc(x,y-25,2,0,Math.PI*2);c.fill();
  }else if(type==='clock'){
    const [x,y]=p;shape(c,[[x-4,y],[x+4,y+2],[x+4,y-32],[x-4,y-34]],'#b9b39a');shape(c,[[x+4,y+2],[x+8,y-1],[x+8,y-35],[x+4,y-32]],'#dfd4af');shape(c,[[x-5,y-35],[x+4,y-32],[x+9,y-36],[x,y-39]],'#627a6b');c.fillStyle='#f4ebcf';c.beginPath();c.arc(x,y-27,2.5,0,Math.PI*2);c.fill();c.fillStyle='#4b5d52';c.fillRect(x,y-29,.7,3);
  }
}
function drawTower(c,[x,y]){
  const s=HEIGHT_SCALE;
  // Original vector model: the real tripod, two occupied rings and antenna.
  c.strokeStyle='#596c6966';c.lineWidth=4;
  for(const [dx,dy]of [[-30,9],[0,-18],[30,9]]){c.beginPath();c.moveTo(x+dx,y+dy);c.lineTo(x,y-93*s);c.stroke();}
  c.strokeStyle='#e1dfcd';c.lineWidth=2.5;
  for(const [dx,dy]of [[-30,9],[0,-18],[30,9]]){c.beginPath();c.moveTo(x+dx,y+dy);c.lineTo(x,y-93*s);c.stroke();}
  c.strokeStyle='#d3d7cc';c.lineWidth=5;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-241*s);c.stroke();
  c.strokeStyle='#617975';c.lineWidth=.6;
  for(let h=6;h<94;h+=6){const width=30*(1-h/100);c.beginPath();c.moveTo(x-width,y-h*s);c.lineTo(x+width,y-(h+5)*s);c.moveTo(x+width,y-h*s);c.lineTo(x-width,y-(h+5)*s);c.stroke();}
  for(const [height,radius,depth]of [[110,14,12],[223,9.5,23]]){
    const top=y-height*s,base=top+depth*s;
    c.fillStyle='#aebcb6';c.beginPath();c.ellipse(x,base,radius,4.5,0,0,Math.PI*2);c.fill();c.fillRect(x-radius,top,radius*2,depth*s);
    c.fillStyle='#476b7b';c.fillRect(x-radius,top+2,radius*2,Math.max(2,depth*s*.42));
    c.strokeStyle='#d4d9cd';c.lineWidth=.65;for(let i=-radius+2;i<radius;i+=3){c.beginPath();c.moveTo(x+i,top+2);c.lineTo(x+i,top+depth*s*.6);c.stroke();}
    c.fillStyle='#e3dfc7';c.beginPath();c.ellipse(x,top,radius,4.5,0,0,Math.PI*2);c.fill();
  }
  for(let h=241;h<355;h+=12){c.strokeStyle=Math.floor(h/12)%2?'#dfdbca':'#ad7564';c.lineWidth=Math.max(1.2,4*(1-(h-241)/145));c.beginPath();c.moveTo(x,y-h*s);c.lineTo(x,y-(h+12)*s);c.stroke();}
  c.strokeStyle='#6f827c';c.lineWidth=.8;c.beginPath();c.moveTo(x,y-355*s);c.lineTo(x,y-375*s);c.stroke();
}
function interiorPoint(rings){
  const ring=rings[0],cp=center(ring),valid=p=>inside(p,ring)&&!rings.slice(1).some(hole=>inside(p,hole));
  if(valid(cp))return cp;
  // The centroid of a courtyard or U-shaped hall can lie in empty space.
  // Find an actual wall interior rather than orphaning its mapped roof slab.
  for(let i=1;i<ring.length;i++)for(const inset of [.02,.08,.25,.5]){
    const mid=[(ring[i-1][0]+ring[i][0])/2,(ring[i-1][1]+ring[i][1])/2],p=[mid[0]*(1-inset)+cp[0]*inset,mid[1]*(1-inset)+cp[1]*inset];
    if(valid(p))return p;
  }
  return cp;
}
export function compoundBuildings(buildings){
  const parents=buildings.filter(b=>!b.props['building:part']),grid=new Map(),cell=128;
  for(const b of parents){
    b.parts=[];b.box=bounds(b.rings[0]);b.area=area(b.rings[0]);
    for(let y=Math.floor(b.box[1]/cell);y<=Math.floor(b.box[3]/cell);y++)for(let x=Math.floor(b.box[0]/cell);x<=Math.floor(b.box[2]/cell);x++){
      const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(b);
    }
  }
  for(const b of buildings.filter(b=>b.props['building:part'])){
    const cp=interiorPoint(b.rings),a=area(b.rings[0]);
    const parent=(grid.get(Math.floor(cp[0]/cell)+','+Math.floor(cp[1]/cell))||[]).filter(p=>p.area>a*.95&&inside(cp,p.rings[0])&&!p.rings.slice(1).some(r=>inside(cp,r))).sort((a,b)=>a.area-b.area)[0];
    if(parent){parent.parts.push(b);b.parent=parent;}
  }
  for(const b of parents.filter(b=>b.parts.length)){
    // A building outline is an aggregate when mapped parts cover its massing.
    // Avoid painting that outline over its columns, setbacks and curved slabs.
    let covered=0,total=0;
    for(let y=0;y<7;y++)for(let x=0;x<7;x++){
      const p=[b.box[0]+(x+.5)/7*(b.box[2]-b.box[0]),b.box[1]+(y+.5)/7*(b.box[3]-b.box[1])];
      if(!inside(p,b.rings[0])||b.rings.slice(1).some(r=>inside(p,r)))continue;total++;
      if(b.parts.some(part=>inside(p,part.rings[0])&&!part.rings.slice(1).some(r=>inside(p,r))))covered++;
    }
    if(covered/total>.68){b.eave=b.h=Math.min(b.eave,1.2*HEIGHT_SCALE);b.rise=0;b.roofShape='flat';b.plinth=true;}
    b.parts.sort((a,b)=>a.base-b.base||a.h-b.h||a.y-b.y);
  }
  return buildings.filter(b=>!b.parent);
}
function segmentDistance(x,y,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy;
  const u=n?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/n)):0;
  return Math.hypot(x-a[0]-u*dx,y-a[1]-u*dy);
}
function pocketGardens(c,region,buildings,footprintGrid,roadGrid,cell,features,water,trees){
  const urban=buildings.filter(b=>!b.props['building:part']&&b.style!=='industrial').map(b=>center(b.rings[0]));
  const blocked=features.filter(f=>['green','water','parking','apron','pitch'].includes(f.kind)).flatMap(f=>polygons(f).map(poly=>{const rings=poly.map(r=>r.map(project));return {rings,box:bounds(rings[0])};}));
  const channels=water.filter(f=>f.geometry.type==='LineString').flatMap(f=>{const p=f.geometry.coordinates.map(project);return p.slice(1).map((b,i)=>({a:p[i],b,radius:f.properties.waterway==='canal'?8:4}));});
  let count=0;
  // World-anchored candidates make the same small garden on adjacent tiles.
  const spacing=42;
  for(let gy=Math.floor((region.y-40)/spacing);gy<=Math.ceil((region.y+region.height+40)/spacing);gy++)for(let gx=Math.floor((region.x-40)/spacing);gx<=Math.ceil((region.x+region.width+40)/spacing);gx++){
    const seed=hash('pocket-'+gx+','+gy);if(seed%100>=72)continue;
    const random=rng(seed),x=(gx+.5)*spacing+(random()-.5)*32,y=(gy+.5)*spacing+(random()-.5)*32,radius=5+random()*5;
    if(!urban.some(p=>(p[0]-x)**2+(p[1]-y)**2<110**2))continue;
    const nearbyBuildings=new Set(),nearbyRoads=new Set();
    for(let yy=Math.floor((y-radius)/cell);yy<=Math.floor((y+radius)/cell);yy++)for(let xx=Math.floor((x-radius)/cell);xx<=Math.floor((x+radius)/cell);xx++){
      const key=xx+','+yy;for(const rings of footprintGrid.get(key)||[])nearbyBuildings.add(rings);for(const road of roadGrid.get(key)||[])nearbyRoads.add(road);
    }
    if([...nearbyRoads].some(r=>segmentDistance(x,y,r.a,r.b)<radius+r.clearance+1))continue;
    if(![...nearbyRoads].length&&!features.some(f=>f.kind==='road'&&f.geometry.type==='LineString'&&f.geometry.coordinates.some(p=>{const q=project(p);return (q[0]-x)**2+(q[1]-y)**2<65**2;})))continue;
    if(channels.some(r=>segmentDistance(x,y,r.a,r.b)<radius+r.radius))continue;
    if([...nearbyBuildings].some(rings=>inside([x,y],rings[0])&&!rings.slice(1).some(r=>inside([x,y],r))||rings.some(r=>r.slice(1).some((b,i)=>segmentDistance(x,y,r[i],b)<radius+2))))continue;
    if(blocked.some(({rings,box:b})=>x>=b[0]-radius&&x<=b[2]+radius&&y>=b[1]-radius&&y<=b[3]+radius&&(inside([x,y],rings[0])&&!rings.slice(1).some(r=>inside([x,y],r))||rings.some(r=>r.slice(1).some((b,i)=>segmentDistance(x,y,r[i],b)<radius)))))continue;
    c.fillStyle=['#6f914b','#7a984f','#63864b'][seed%3];c.beginPath();c.ellipse(x,y,radius,radius*.66,-.16,0,Math.PI*2);c.fill();
    c.fillStyle='#a4c46577';c.beginPath();c.ellipse(x-radius*.12,y-radius*.12,radius*.77,radius*.44,-.16,0,Math.PI*2);c.fill();
    for(let i=0;i<14;i++){c.fillStyle=i%2?'#b9ce775e':'#4a803b55';c.fillRect(x+(random()-.5)*radius*1.5,y+(random()-.5)*radius,.7+random(),.6);}
    for(let i=0;i<2+seed%2;i++){
      const angle=i*2.4+random(),distance=radius*(.2+random()*.38);
      trees.push({x:x+Math.cos(angle)*distance,y:y+Math.sin(angle)*distance*.65,size:3.8+random()*2.1,seed:hash(seed+'-'+i),type:'tree'});
    }
    count++;
  }
  return count;
}
export async function renderCity(data, progress=()=>{}, options={}) {
  const art=options.architectureAssets?{...options.architectureAssets,patterns:new Map()}:null;
  const region=options.region||{x:0,y:0,width:WIDTH,height:HEIGHT};
  const scale=options.pixelRatio||1,bleed=4;
  const makeCanvas=(w,h)=>{const out=options.createCanvas?options.createCanvas(w,h):document.createElement('canvas');out.width=w;out.height=h;return out;};
  // Draw beyond tile edges, then crop. Native canvas clips can otherwise change
  // antialiasing of a facade exactly where two independently drawn tiles meet.
  const canvas=makeCanvas((region.width+bleed*2)*scale,(region.height+bleed*2)*scale);
  const c=canvas.getContext('2d',{alpha:false});c.scale(scale,scale);c.translate(-region.x+bleed,-region.y+bleed);c.fillStyle='#819461';c.fillRect(region.x-bleed,region.y-bleed,region.width+bleed*2,region.height+bleed*2);
  // Ground is a continuous illustrated meadow rather than empty cream paper.
  // World-anchored patches and grain remain identical along tile boundaries.
  for(let gy=Math.floor((region.y-100)/90);gy<=Math.ceil((region.y+region.height+100)/90);gy++)for(let gx=Math.floor((region.x-100)/90);gx<=Math.ceil((region.x+region.width+100)/90);gx++){
    const seed=hash('terrain-'+gx+','+gy),r=rng(seed),x=gx*90+r()*55,y=gy*90+r()*55;
    c.fillStyle=['#77925369','#94a86b60','#536f443b','#a2ad7547'][seed%4];
    c.beginPath();c.ellipse(x,y,45+r()*40,22+r()*22,r()*.5,0,Math.PI*2);c.fill();
  }
  for(let gy=Math.floor(region.y/8)-2;gy<=Math.ceil((region.y+region.height)/8)+2;gy++)for(let gx=Math.floor(region.x/8)-2;gx<=Math.ceil((region.x+region.width)/8)+2;gx++){
    const seed=hash('grain-'+gx+','+gy),r=rng(seed);c.fillStyle=seed%2?'#d6d4ae21':'#536a4930';c.fillRect(gx*8+r()*6,gy*8+r()*6,.7+r(),.5+r()*.5);
  }
  // The build selects all intersecting features. A road may enter the city far
  // from its first vertex, so do not filter real geometry by its first point.
  const f=data.features;
  const green=f.filter(a=>a.kind==='green'),water=f.filter(a=>a.kind==='water'),roads=f.filter(a=>a.kind==='road'),buildings=[],trees=[];
  for(const g of green){
    const wooded=g.properties.natural==='wood'||g.properties.landuse==='forest';
    const colors=wooded?['#4f7544','#5e8046']:['#71944b','#7d9f50','#69914c','#8ba759'];
    fillPolygon(c,g,colors[hash(g.id)%colors.length]);
    for(const poly of polygons(g)){
      const rings=poly.map(r=>r.map(project)),p=rings[0],a=area(p),box=bounds(p);
      if(a<30)continue;
      const r=rng(hash(g.id));
      // Grass tufts stay inside the mapped green polygon and its holes. Draw
      // them before roads and paths, using feature seeds for seamless tiles.
      c.save();polygonPath(c,rings);c.clip('evenodd');
      const grass=rng(hash(g.id+'-grass'));
      for(let i=0,n=Math.min(700,Math.floor(a/170));i<n;i++){
        const x=box[0]+grass()*(box[2]-box[0]),y=box[1]+grass()*(box[3]-box[1]);
        c.fillStyle=i%3===0?'#b9ce7050':i%3===1?'#477f3838':'#699a4050';
        c.fillRect(x,y,1+grass()*2.5,.6+grass()*.8);
      }
      c.restore();
      const isGrass=g.properties.landuse==='grass'||g.properties.natural==='grassland'||g.properties.leisure==='pitch';
      const count=Math.min(800,Math.floor(a/(wooded?105:isGrass?1050:220)));
      for(let i=0;i<count*3;i++){
        if(i>=count*1.5)break;
        const point=[box[0]+r()*(box[2]-box[0]),box[1]+r()*(box[3]-box[1])];
        if(inside(point,p)&&!rings.slice(1).some(h=>inside(point,h)))trees.push({x:point[0],y:point[1],size:4.8+r()*5.6,seed:hash(g.id+i),type:'tree'});
      }
    }
  }
  for(const p of f.filter(a=>a.kind==='parking'))fillPolygon(c,p,'#929b8b');
  for(const p of f.filter(a=>a.kind==='apron'))fillPolygon(c,p,'#89958f');
  for(const w of water){
    if(w.geometry.type==='LineString'){
      const p=w.geometry.coordinates.map(project);c.beginPath();p.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle='#476a6c';c.lineWidth=w.properties.waterway==='canal'?14:4;c.stroke();c.strokeStyle='#6b9691';c.lineWidth=w.properties.waterway==='canal'?10:2;c.stroke();
    }else fillPolygon(c,w,'#587b7a');
  }
  const roadWidth={motorway:22,trunk:24,primary:23,secondary:19,tertiary:16,residential:9,unclassified:9,service:5,living_street:7,pedestrian:10,footway:2.7,path:2.2,steps:3,cycleway:3,track:4};
  const roadPaths=roads.filter(r=>r.geometry.type==='LineString').map(r=>({...r,path:r.geometry.coordinates.map(project),width:r.properties.aeroway?Math.max(6,Math.min(70,parseFloat(r.properties.width)||(r.properties.aeroway==='runway'?45:16))):roadWidth[r.properties.highway]||4}));
  // Ground-level road casings, then surfaces, so intersections remain continuous.
  for(const pass of [0,1]){
    for(const r of roadPaths){
      const walk=['footway','path','steps','pedestrian','cycleway'].includes(r.properties.highway);
      c.beginPath();r.path.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.lineJoin='round';c.lineCap='round';c.lineWidth=r.width+(pass===0?1.8:0);c.strokeStyle=pass===0?'#a3aa97':r.properties.aeroway?'#7e8c89':walk?'#b0af93':'#68726f';c.stroke();
    }
  }
  for(const r of roadPaths.filter(r=>r.width>=16)){
    c.beginPath();r.path.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.setLineDash([6,8]);c.lineWidth=.7;c.strokeStyle='#d4d4baa0';c.stroke();c.setLineDash([]);
    if(r.properties.aeroway)continue;
    // Tiny cars are decorative; road geometry remains the original OSM geometry.
    const random=rng(hash(r.id));for(let i=1;i<r.path.length;i++){const a=r.path[i-1],b=r.path[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<30)continue;for(let j=0;j<Math.floor(len/70);j++){const t=random(),x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;const ang=Math.atan2(b[1]-a[1],b[0]-a[0]);c.save();c.translate(x,y);c.rotate(ang);c.fillStyle=['#f0edde','#7c8c7b','#cbb997','#e6dcc3'][Math.floor(random()*4)];c.fillRect(-3,2,6,3);c.fillStyle='#607b7877';c.fillRect(-.5,2.4,2,2);c.restore();}}
  }
  for(const p of f.filter(a=>a.kind==='pitch')){fillPolygon(c,p,'#6d9d43');for(const poly of polygons(p)){polygonPath(c,poly.map(r=>r.map(project)));c.strokeStyle='#f0edcbcc';c.lineWidth=.7;c.stroke();}}
  progress('Binolar chizilmoqda');
  await new Promise(r=>setTimeout(r,0));
  for(const b of f.filter(a=>a.kind==='building')){
    for(const poly of polygons(b)){
      const role=LANDMARK_ROLES.get(b.id);if(role==='tower')continue;
      const rings=poly.map(r=>r.map(project)),a=area(rings[0]);if(a<(b.properties['building:part'] ? .25 : 8))continue;
      const seed=hash(b.id),props={...b.properties};
      if(role==='minor'){
        props.religion='muslim';props.amenity='place_of_worship';props['building:colour']='#f0eee3';
        if(b.id==='way/1328003448'){props['roof:shape']='dome';props['roof:height']='12';props['roof:colour']='#4e9dab';}
        if(['way/1334917067','way/1334917068'].includes(b.id)){props['roof:shape']='conical';props['roof:height']='3';props['roof:colour']='#b7c9bf';}
      }
      if(role==='museum'){props['building:colour']='#e8dfc7';props['roof:colour']=props['roof:shape']==='dome'?'#4a9aaa':'#b2b4a0';}
      if(role==='chorsu'){props['roof:colour']='#4d9fab';props['building:colour']='#e2d2b1';}
      if(role==='navoiy'){props['building:colour']='#e8d6b2';props['roof:colour']='#b4b5a0';}
      // This hall's retained tag says 13 storeys, unlike its single monumental
      // prayer-hall mass in the reference. Use an explicit illustrated 13 m
      // estimate rather than letting a 41.6 m box swallow both mapped domes.
      // Original OSM tags and downloadable source remain unchanged.
      if(b.id==='way/1456934598')props.height='13';
      if(role==='nest'&&Number.parseFloat(props.height)>200)props['building:levels']=String(Math.round(Number.parseFloat(props.height)/266.5*51));
      const profile=buildingProfile({...b,properties:props},a,seed);
      if(['museum','navoiy'].includes(role)||['way/44351799','way/235797552'].includes(b.id))profile.style='civic';
      if(role==='hotel')Object.assign(profile,{style:'hotel',wall:'#e6d7ba',roof:'#b7b8aa'});
      buildings.push({type:'building',rings,...profile,seed,props,id:b.id,y:Math.max(...rings[0].map(p=>p[1])),x:center(rings[0])[0]});
    }
  }
  for(const t of f.filter(a=>a.kind==='tree'&&a.geometry.type==='Point')){
    const p=project(t.geometry.coordinates),s=hash(t.id);trees.push({x:p[0],y:p[1],size:4+s%5,seed:s,type:'tree'});
  }
  // Decorative street planting follows verges; collision checks below keep
  // trunks out of streets and buildings. These are illustrated, not OSM trees.
  for(const road of roadPaths.filter(r=>['primary','secondary','tertiary','residential','living_street'].includes(r.properties.highway))){
    for(let i=1;i<road.path.length;i++){
      const a=road.path[i-1],b=road.path[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
      if(len<36)continue;
      const random=rng(hash(road.id+'-verge-'+i)),offset=road.width/2+4.5;
      for(let distance=16+random()*12;distance<len-10;distance+=32){
        if(random()<.25)continue;
        const u=distance/len;
        for(const side of [-1,1]){
          if(random()<.18)continue;
          const seed=hash(road.id+'-'+i+'-'+distance+'-'+side);
          trees.push({x:a[0]+dx*u-dy/len*offset*side,y:a[1]+dy*u+dx/len*offset*side,size:4.3+random()*1.8,seed,type:'tree'});
        }
      }
    }
  }
  // Decorative park canopies must not grow through a building's roof.
  // A local grid keeps this affordable in the densest parts of the city.
  const footprintGrid=new Map(),cell=48;
  for(const b of buildings){
    const box=bounds(b.rings[0]);
    for(let y=Math.floor(box[1]/cell);y<=Math.floor(box[3]/cell);y++)for(let x=Math.floor(box[0]/cell);x<=Math.floor(box[2]/cell);x++){
      const key=x+','+y;if(!footprintGrid.has(key))footprintGrid.set(key,[]);footprintGrid.get(key).push(b.rings);
    }
  }
  const roadGrid=new Map();
  for(const road of roadPaths)for(let i=1;i<road.path.length;i++){
    const a=road.path[i-1],b=road.path[i],clearance=road.width/2+1;
    for(let y=Math.floor((Math.min(a[1],b[1])-clearance)/cell);y<=Math.floor((Math.max(a[1],b[1])+clearance)/cell);y++)for(let x=Math.floor((Math.min(a[0],b[0])-clearance)/cell);x<=Math.floor((Math.max(a[0],b[0])+clearance)/cell);x++){
      const key=x+','+y;if(!roadGrid.has(key))roadGrid.set(key,[]);roadGrid.get(key).push({a,b,clearance});
    }
  }
  const gardens=pocketGardens(c,region,buildings,footprintGrid,roadGrid,cell,f,water,trees);
  const visibleTrees=trees.filter(t=>{
    const key=Math.floor(t.x/cell)+','+Math.floor(t.y/cell);
    if((footprintGrid.get(key)||[]).some(rings=>inside([t.x,t.y],rings[0])&&!rings.slice(1).some(r=>inside([t.x,t.y],r))))return false;
    return !(roadGrid.get(key)||[]).some(({a,b,clearance})=>{
      const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
      const u=length?Math.max(0,Math.min(1,((t.x-a[0])*dx+(t.y-a[1])*dy)/length)):0;
      return (t.x-a[0]-u*dx)**2+(t.y-a[1]-u*dy)**2<clearance*clearance;
    });
  });
  // Resolve aggregate outlines before shadows: a low podium must not cast the
  // guessed tall outline's shadow on top of its independently mapped towers.
  const roots=compoundBuildings(buildings);
  for(const b of buildings){
    const ring=b.rings[0],height=b.h,offset=[height*.64,height*.17];
    // One silhouette prevents each overlapping edge from darkening the same
    // courtyard repeatedly. Contact shade uses a narrow fixed ground offset.
    c.save();c.fillStyle='#1c30364f';c.beginPath();
    for(let i=0;i<ring.length-1;i++){
      const a=ring[i],d=ring[i+1],p=[a,d,[d[0]+offset[0],d[1]+offset[1]],[a[0]+offset[0],a[1]+offset[1]]];
      let signed=0;for(let j=0;j<4;j++)signed+=p[j][0]*p[(j+1)%4][1]-p[(j+1)%4][0]*p[j][1];if(signed<0)p.reverse();
      c.moveTo(...p[0]);for(const v of p.slice(1))c.lineTo(...v);c.closePath();
    }
    c.fill();
    c.strokeStyle='#273e3c30';c.lineWidth=1.6;c.lineJoin='round';polygonPath(c,b.rings);c.stroke();c.restore();
  }
  const extras=[['amir',[69.2797551,41.3111759]],['clock',[69.280163,41.309262]],['tower',[69.2848233,41.345678]]].map(([name,p])=>{const [x,y]=project(p);return {type:'landmark',name,x,y};}).filter(o=>o.x>=region.x-250&&o.x<=region.x+region.width+250&&o.y>=region.y-60&&o.y<=region.y+region.height+512);
  for(const o of extras.filter(o=>o.name==='tower'))shape(c,[[o.x-4,o.y],[o.x+4,o.y],[o.x+175,o.y+45],[o.x+160,o.y+48]],'#334b4933');
  const objects=[...roots,...visibleTrees,...extras];
  objects.sort((a,b)=>a.y-b.y);
  let i=0;
  for(const o of objects){
    if(o.type==='building'){drawBuilding(c,o,art);for(const part of o.parts||[])drawBuilding(c,part,art);}
    else if(o.type==='landmark'){if(o.name==='tower')drawTower(c,[o.x,o.y]);else landmarkDetail(c,o.name,[o.x,o.y]);}
    else drawTree(c,o.x,o.y,o.size,o.seed);
    if(++i%5000===0)await new Promise(r=>setTimeout(r,0));
  }
  // A quiet edge treatment helps the illustrated map sit on the paper background.
  c.strokeStyle='#c9cfb655';c.lineWidth=1;c.strokeRect(1,1,WIDTH-2,HEIGHT-2);
  const tile=makeCanvas(region.width*scale,region.height*scale);
  const tileContext=tile.getContext('2d');tileContext.filter='contrast(1.08) saturate(1.12)';
  tileContext.drawImage(canvas,bleed*scale,bleed*scale,tile.width,tile.height,0,0,tile.width,tile.height);
  canvas.width=1;canvas.height=1;
  return {canvas:tile,buildings:buildings.length,trees:visibleTrees.length,gardens};
}
