// Original vector facades, studied from the references in architecture-notes.md.
// Coordinates here are local to a perspective-correct wall, clipped by renderer.
const mix=(a,b,t)=>'#'+[0,2,4].map(i=>Math.round(parseInt(a.slice(i+1,i+3),16)*(1-t)+parseInt(b.slice(i+1,i+3),16)*t).toString(16).padStart(2,'0')).join('');
function arch(c,x,y,w,h,color,pointed=false){
  c.fillStyle=color;c.beginPath();c.moveTo(x,y+h);c.lineTo(x,y+w*.44);
  if(pointed){c.quadraticCurveTo(x,y+h*.15,x+w/2,y);c.quadraticCurveTo(x+w,y+h*.15,x+w,y+w*.44);}
  else c.ellipse(x+w/2,y+w*.44,w/2,w*.44,0,Math.PI,0);
  c.lineTo(x+w,y+h);c.closePath();c.fill();
}
function glazing(c,len,h,color='#426675'){
  const g=c.createLinearGradient(0,-h,len,0);g.addColorStop(0,mix(color,'#b1c6bf',.35));g.addColorStop(.45,color);g.addColorStop(1,mix(color,'#233e4b',.34));c.fillStyle=g;c.fillRect(0,-h,len,h);
  c.fillStyle='#dae4d41a';c.beginPath();c.moveTo(len*.05,-h);c.lineTo(len*.27,-h);c.lineTo(len*.72,0);c.lineTo(len*.57,0);c.closePath();c.fill();
}
function cornice(c,len,h,color){
  c.fillStyle='#263b414a';c.fillRect(0,-h+1,len,1.1);c.fillStyle=color;c.fillRect(0,-h,len,1);
  c.fillStyle=mix(color,'#243f44',.25);c.fillRect(0,-1.1,len,1.1);
}
export function drawLandmarkFacade(c,{identity,len,h,dx,floors,pal,props}){
  if(!identity||identity==='tower')return false;
  const stone=mix(pal.wall,'#e8e4d6',dx<0?.12:.35),dark=dx<0?'#304c56':'#42626a';
  const bays=Math.max(1,Math.ceil(len/5.2)),step=len/bays;
  if(identity==='hotel'){
    // The sun screen is offset rectangular panjara, not an apartment window grid.
    glazing(c,len,h,'#5b665e');
    if(h>20){
      const fh=h/17,rh=(h-fh*1.3)/34,pitch=2.7;
      c.fillStyle=stone;c.fillRect(0,-h,len,fh*.17);c.fillStyle='#af8c7b';c.fillRect(0,-h+fh*.65,len,fh*.45);
      for(let y=-h+fh*1.3,row=0;y<-.1;y+=rh,row++)for(let x=-pitch;x<len;x+=pitch){
        const xx=x+(row%2)*pitch*.5;
        c.strokeStyle='#3c504c';c.lineWidth=.55;c.strokeRect(xx+.25,y+.3,pitch*.72,rh*.86);
        c.strokeStyle=stone;c.lineWidth=.38;c.strokeRect(xx,y,pitch*.78,rh*.88);
        c.beginPath();c.moveTo(xx+pitch*.78,y+rh*.36);c.lineTo(xx+pitch,y+rh*.36);c.lineTo(xx+pitch,y+rh*.88);c.stroke();
      }
      c.fillStyle=stone;for(let x=0;x<len;x+=pitch*8)c.fillRect(x,-h,.6,h);
    }else{
      c.fillStyle=stone;for(let x=1;x<len;x+=4)c.fillRect(x,-h,.7,h);
    }
    cornice(c,len,h,stone);return true;
  }
  if(['hilton','nest','mall','humo'].includes(identity)){
    glazing(c,len,h,identity==='hilton'?'#354e5d':identity==='nest'?'#496d7a':'#4b6b72');
    if(identity==='humo'){
      c.fillStyle='#b4c1bc';c.fillRect(0,-h,len,h*.55);
      for(let x=-h;x<len+h;x+=10){c.strokeStyle='#e0e6d48c';c.lineWidth=.65;c.beginPath();c.moveTo(x,-h);c.lineTo(x+h*.65,-h*.45);c.stroke();}
      for(const y of [-h,-h*.57,-h*.4]){c.fillStyle='#d6dbcf';c.fillRect(0,y,len,1);}
      for(let x=0;x<len;x+=5){c.fillStyle='#b6c7bf';c.fillRect(x,-h*.4,.4,h*.4);}
    }else if(identity==='mall'){
      c.fillStyle='#aa9674';for(let y=-h+1;y<0;y+=5.5)c.fillRect(0,y,len,1.4);
      for(let x=0;x<len;x+=8){c.fillStyle='#dac7a1';c.fillRect(x,-h,.65,h);}
    }else{
      const fh=h/Math.max(1,floors);
      for(let f=1;f<floors;f++){c.fillStyle=identity==='hilton'?'#9bafab':'#c7c9b9';c.fillRect(0,-h+f*fh,len,identity==='hilton'?.35:.5);c.fillStyle='#182f3b55';c.fillRect(0,-h+f*fh+.6,len,.35);}
      const spacing=identity==='hilton'?7:4.4;
      for(let x=0;x<len;x+=spacing){c.fillStyle=identity==='hilton'?'#8aaba9':'#e1dfcc';c.fillRect(x,-h,identity==='hilton'?.35:.85,h);c.fillStyle='#213e4b66';c.fillRect(x+1,-h,.4,h);}
      if(identity==='nest'){c.fillStyle='#ddd9c4';for(let x=1;x<len;x+=spacing*5)c.fillRect(x,-h,2,h);}
      if(identity==='hilton'){
        c.fillStyle='#c3b690';c.fillRect(0,-h,len,1.1);
        if(len>20){c.strokeStyle='#c6bb92';c.lineWidth=.9;c.beginPath();c.moveTo(len*.63,-h);c.bezierCurveTo(len*.54,-h*.7,len*.52,-h*.35,len*.41,0);c.stroke();c.strokeStyle='#abc2bc99';c.lineWidth=.45;c.beginPath();c.moveTo(len*.68,-h);c.bezierCurveTo(len*.59,-h*.7,len*.57,-h*.35,len*.46,0);c.stroke();}
      }
    }
    cornice(c,len,h,stone);return true;
  }
  if(['museum','navoiy','forum','library','minor','hazrat','kukeldash','chorsu'].includes(identity)){
    const brick=identity==='kukeldash'||identity==='hazrat';
    c.fillStyle=brick?mix('#c6a87e',pal.wall,.35):stone;c.fillRect(0,-h,len,h);
    if(brick){
      c.strokeStyle='#785c4333';c.lineWidth=.3;for(let y=-h+1,row=0;y<0;y+=1.8,row++){c.beginPath();c.moveTo(0,y);c.lineTo(len,y);for(let x=(row%2)*2;x<len;x+=4){c.moveTo(x,y);c.lineTo(x,y+1.8);}c.stroke();}
    }
    if(identity==='kukeldash'&&pal.id==='way/1299136748'&&len>8){
      const w=len*.64,x=(len-w)/2,y=-h*.86,ah=h*.86;
      c.fillStyle='#3d7e99';c.fillRect(x-1.3,-h+1,w+2.6,h-1);
      c.fillStyle='#ddd1a3';for(let yy=-h+1.3;yy<0;yy+=1.7){c.fillRect(x-1.05,yy,.6,.8);c.fillRect(x+w+.4,yy,.6,.8);}
      arch(c,x,y,w,ah,'#e0c69d',true);arch(c,x+.7,y+.8,w-1.4,ah-.8,'#294851',true);
      c.fillStyle='#826e50';c.fillRect(len*.43,-3,len*.14,3);cornice(c,len,h,stone);return true;
    }
    if(identity==='forum'||identity==='library'){
      glazing(c,len,h,identity==='forum'?'#6f8d8d':'#527b86');
      const spacing=identity==='forum'?5.5:9;
      for(let x=1;x<len;x+=spacing){
        c.fillStyle='#203e464a';c.fillRect(x+.7,-h+2,1.8,h-2);
        c.fillStyle=stone;c.fillRect(x,-h+1,identity==='forum'?1.25:1.8,h-1);
        c.fillStyle='#f0edda';c.fillRect(x,-h+1,.35,h-1);
      }
      c.fillStyle=stone;c.fillRect(0,-h,len,h*.12);c.fillRect(0,-2,len,2);
      c.strokeStyle='#d2d9c88c';c.lineWidth=.4;for(let y=-h+4;y<0;y+=4){c.beginPath();c.moveTo(0,y);c.lineTo(len,y);c.stroke();}
    }else if(h>5&&len>5){
      const rows=identity==='kukeldash'&&h>8?2:1,rowH=h/rows;
      for(let row=0;row<rows;row++)for(let j=0;j<bays;j++){
        const w=Math.min(step*.67,identity==='minor'?6:5),x=(j+.5)*step-w/2,y=-h+row*rowH+rowH*.18,ah=rowH*.70;
        arch(c,x-.6,y-.4,w+1.2,ah+.6,brick?'#ddc5a0':'#f0e7d2',brick||identity==='minor');
        arch(c,x,y,w,ah,dark,brick||identity==='minor');
        c.fillStyle='#839c954d';c.fillRect(x+w*.17,y+ah*.45,w*.25,ah*.5);
        if(identity==='navoiy'){c.fillStyle=stone;c.fillRect(x-.85,y-.5,.7,ah+1);c.fillStyle='#b8ab8d';c.fillRect(x-1,y-.8,1.6,.6);}
      }
      if(identity==='minor'||identity==='hazrat'||identity==='kukeldash'){
        c.fillStyle=identity==='minor'?'#6ca4a7':'#437e97';c.fillRect(0,-h+1,len,.9);
        c.fillStyle='#dcd3ac';for(let x=.4;x<len;x+=2)c.fillRect(x,-h+1.2,.55,.45);
      }
    }
    cornice(c,len,h,stone);return true;
  }
  return false;
}
export function drawNeighbourhoodDetails(c,{len,h,seed,pal,floors,typology}){
  const fh=h/Math.max(1,floors);
  if(typology==='slab'){
    // Panel seams, enclosed loggias and stairwell strips distinguish long slabs.
    for(let x=2;x<len;x+=15){
      c.fillStyle='#d4d2bdaa';c.fillRect(x,-h,3.2,h);
      for(let f=0;f<floors;f++){const y=-h+(f+.24)*fh;c.fillStyle='#38515b';c.fillRect(x+.65,y,1.6,fh*.48);c.fillStyle='#94aaa3';c.fillRect(x+.8,y+.2,.45,fh*.27);}
      c.strokeStyle='#354a4745';c.lineWidth=.35;c.strokeRect(x,-h,3.2,h);
    }
    for(let f=0;f<floors-1;f++)for(let x=7;x<len-3;x+=15){
      const y=-h+(f+.85)*fh;c.fillStyle='#203d425e';c.fillRect(x-.3,y+.5,5.3,.85);
      c.fillStyle=(seed+f)%4===0?'#adbbaf':'#d7cbb0';c.fillRect(x,y-1,4.6,1.6);c.fillStyle='#637c77';c.fillRect(x+.4,y-.85,3.8,.65);
    }
  }else if(typology==='contemporary'){
    const pitch=16;
    for(let x=seed%3;x<len;x+=pitch){
      c.fillStyle=pal.wall;c.fillRect(x,-h,2.2,h);c.fillStyle='#e9dfc67a';c.fillRect(x,-h,.5,h);
      for(let f=1;f<floors;f++){const y=-h+f*fh;c.fillStyle='#253e4b75';c.fillRect(x+3,y-fh*.72,7,fh*.72);c.fillStyle='#94b4b16b';c.fillRect(x+3.5,y-fh*.65,2,fh*.49);c.fillStyle='#d9d9c4';c.fillRect(x+2.6,y-.3,8,.6);}
    }
  }else if(typology==='mahalla'){
    c.fillStyle='#354b423d';c.fillRect(0,-h+.5,len,1.1);
    if(len>13){
      const x=len*(.2+(seed%5)*.12),w=Math.min(5,len*.25);c.fillStyle=['#617d71','#5f706e','#85634e'][seed%3];c.fillRect(x,-Math.min(3.6,h*.7),w,Math.min(3.6,h*.7));
      c.strokeStyle='#c5bd954d';c.lineWidth=.4;c.strokeRect(x,-Math.min(3.6,h*.7),w,Math.min(3.6,h*.7));c.beginPath();c.moveTo(x+w/2,0);c.lineTo(x+w/2,-Math.min(3.6,h*.7));c.stroke();
    }
  }
}
