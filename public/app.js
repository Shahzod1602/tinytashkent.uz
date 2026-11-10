import {project,unproject,WIDTH,HEIGHT,MAP_BOUNDS} from './renderer.js?v=10';
import {TileMap} from './tiles.js?v=14';
import {MapNavigation} from './navigation.js?v=6';
import {normalizeSearch,searchPlaces} from './search.js?v=1';
import {readPreferences,savePreferences,parseMapLocation} from './state.js?v=1';
import {initAtmosphere} from './atmosphere.js?v=2';
const $=s=>document.querySelector(s);
const places=[
  {id:'amir',name:'Amir Temur xiyoboni',category:'Xiyobon',icon:'✳',coords:[69.2797551,41.3111759],desc:'Toshkent markazidagi yashil orol. Amir Temur haykali atrofidan shahar ko‘chalari turli yo‘nalishlarga yoyiladi.',keywords:'skver square amir temur park'},
  {id:'hotel',name:'O‘zbekiston mehmonxonasi',category:'Me’morchilik',icon:'▦',coords:[69.2827166,41.3114062],desc:'Xiyobon ro‘parasidagi tanish siluet. Mehmonxonaning naqshli fasadi Toshkent me’morchiligining o‘ziga xos belgilaridan biri.',keywords:'uzbekistan hotel otel ozbekiston uzbekiston'},
  {id:'museum',name:'Temuriylar tarixi muzeyi',category:'Muzey',icon:'◉',coords:[69.2789838,41.3136702],desc:'Moviy gumbaz, yumaloq bino va yashil bog‘. Temuriylar davri tarixiga bag‘ishlangan muzeyni yuqoridan ham darhol tanish mumkin.',keywords:'amir temur museum muzey'},
  {id:'navoi',name:'Navoiy teatri',category:'Madaniyat',icon:'♜',coords:[69.2713076,41.3092707],desc:'Alisher Navoiy nomidagi opera va balet teatri. Teatr maydoni, favvoralar va atrofdagi sayr yo‘laklarini kashf eting.',keywords:'alisher navoiy navoi opera ballet teatr theatre'},
  {id:'independence',name:'Mustaqillik maydoni',category:'Maydon',icon:'⚑',coords:[69.2674378,41.3153897],desc:'Keng maydonlar va daraxtzorlar orasidagi shahar timsoli. Bu yerdan Toshkent markazining yashil yo‘laklari bo‘ylab sayr boshlanadi.',keywords:'mustaqillik independence square maydon'},
  {id:'broadway',name:'Sayilgoh ko‘chasi',category:'Sayr',icon:'↝',coords:[69.275188,41.311674],desc:'Toshkentliklar “Broadway” deb ataydigan sayr ko‘chasi. Amir Temur xiyobonidan shaharning boshqa tanish manzillariga olib boradi.',keywords:'broadway sayilgoh street walking kocha'},
  {id:'forum',name:'Forumlar saroyi',category:'Me’morchilik',icon:'▥',coords:[69.282680,41.309565],desc:'Xiyobon janubidagi och rangli, katta hajmli saroy. Uning atrofidagi ochiq maydon va geometrik yo‘laklar xaritada yaqqol ko‘rinadi.',keywords:'forum palace saroy anjumanlar'},
  {id:'clock',name:'Toshkent kurantlari',category:'Shahar ramzi',icon:'◷',coords:[69.280163,41.309262],desc:'Markazning vaqtini belgilab turuvchi tanish soat minorasi. Kichik ko‘rinsa ham, Toshkent manzarasining ajralmas bo‘lagi.',keywords:'clock soat kurant chimes'},
  {id:'chorsu',name:'Chorsu bozori',category:'Eski shahar',icon:'◉',coords:[69.2351083,41.3267756],desc:'Toshkentning eski shahar qismidagi tanish moviy gumbaz. Bozor atrofidagi mahallalar va tor ko‘chalarni yuqoridan kashf eting.',keywords:'chorsu chor su bazaar bazar bozor market eski shahar чорсу'},
  {id:'tashkent-city',name:'Tashkent City',category:'Bog‘ va me’morchilik',icon:'▥',coords:[69.2483999,41.3165315],desc:'Zamonaviy binolar orasidagi sayilgoh, ko‘l va yo‘laklar. Markazdan g‘arbga qarab xaritani surib, shaharning yangi qiyofasiga yetib boring.',keywords:'tashkent city park siti toshkent сити'},
  {id:'magic-city',name:'Magic City',category:'Sayr va hordiq',icon:'♜',coords:[69.2450584,41.3036218],desc:'Shaharning janubi-g‘arb tomonidagi sayr va ko‘ngilochar hudud. Atrofdagi bog‘lar, suv yo‘llari va ko‘chalar ham kengaytirilgan xaritaga kirdi.',keywords:'magic city magiccity mejik siti park мэжик'},
  {id:'minor',name:'Minor masjidi',category:'Me’morchilik',icon:'◉',coords:[69.2751989,41.3354619],desc:'Oq fasadlar va moviy gumbaz. Anhor yaqinidagi masjid va uning atrofini izometrik ko‘rinishda tomosha qiling.',keywords:'minor mosque masjid oq масжид минор'},
  {id:'tower',name:'Toshkent teleminorasi',category:'Shahar ramzi',icon:'↑',coords:[69.2848233,41.345678],desc:'Shahar shimolidagi baland siluet. Teleminora atrofi, ko‘chalar va yashil hududlar endi xaritada ochiq.',keywords:'teleminora television tv tower tashkent toshkent телебашня'},
];
const metroPlaces=[],districtPlaces=[],cityRings=[];let catalogPlaces=[],catalogPromise=null,catalogState='idle',restoreSequence=0;
const catalogIndex=new Map();
const allPlaces=()=>[...districtPlaces,...places,...metroPlaces,...catalogPlaces];
const findPlace=id=>catalogIndex.get(id)||[...districtPlaces,...places,...metroPlaces].find(p=>p.id===id);
let showMetro=false;
const canvas=$('#map'),ctx=canvas.getContext('2d',{alpha:false});
const profile=new URLSearchParams(location.search).get('profile')==='1';
const profileSamples=[];
const mini=$('#minimap'),mc=mini.getContext('2d');
const home=project([69.27885,41.3120]);
let camera={x:home[0],y:home[1],z:1},scene=null,tileMap=null,selected=null,night=false,labels=true,w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,2),frame=0,activeResult=-1,filtered=[],dragged=false,animation=0,ready=false;
let mapStats=null,miniBase=null,cityPath=null,markerOrder=[],markerSelection;
const navigation=new MapNavigation(camera,{viewport:()=>({width:w,height:h}),minZoom,constrain:clampCamera,onChange:requestDraw,onRest:scheduleSave,reducedMotion:()=>matchMedia('(prefers-reduced-motion: reduce)').matches});
let initialZoom=innerWidth<760?1.12:1.42;
camera.z=initialZoom;
const markerNodes=new Map();
const prefs=readPreferences();night=prefs.night;labels=prefs.labels;showMetro=prefs.metro;
document.body.classList.toggle('night',night);$('#markers').classList.toggle('labels-hidden',!labels);
$('#labels-toggle').setAttribute('aria-pressed',String(labels));$('#metro-toggle').setAttribute('aria-pressed',String(showMetro));$('#theme-toggle').setAttribute('aria-pressed',String(night));
const rememberPreferences=()=>savePreferences({labels,metro:showMetro,night});
// Live atmosphere (time of day, weather, seasons). Null when WebGL is unavailable; the classic evening toggle remains.
const atmo=initAtmosphere({source:canvas,camera,viewport:()=>({width:w,height:h}),requestDraw,toast,onActiveChange:on=>{if(!on)document.body.classList.toggle('night',night);}});
const dimmed=()=>night&&!atmo?.active;
for(const p of places){
  p.point=project(p.coords);
  const b=document.createElement('button');b.className='map-marker';b.dataset.id=p.id;b.setAttribute('aria-label',p.name);b.innerHTML=`<span class="marker-label">${p.name}</span><span class="marker-pin"></span>`;b.addEventListener('click',()=>selectPlace(p.id));$('#markers').append(b);markerNodes.set(p.id,b);
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2800);}
function screenPoint(p){return [(p[0]-camera.x)*camera.z+w/2,(p[1]-camera.y)*camera.z+h/2];}
function minZoom(){return Math.min(.22,Math.min(w/WIDTH,h/HEIGHT)*.8);}
function clampCamera(){
  camera.z=Math.min(3,Math.max(minZoom(),camera.z));
  // Tall phone viewports can exceed the map height when fitting a district.
  // Bound the center itself so southern/northern districts remain reachable.
  camera.x=Math.max(0,Math.min(WIDTH,camera.x));camera.y=Math.max(0,Math.min(HEIGHT,camera.y));
}
function requestDraw(){if(!frame)frame=requestAnimationFrame(draw);}
function draw(time){
  const started=profile?performance.now():0;
  frame=0;if(!scene)return;
  const nextFrame=navigation.step(time),moving=navigation.moving||!!animation;
  const density=Math.min(devicePixelRatio||1,moving?1.5:2);
  if(canvas.width!==Math.round(w*density)||canvas.height!==Math.round(h*density)){canvas.width=Math.round(w*density);canvas.height=Math.round(h*density);}dpr=density;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=dimmed()?'#293d3c':'#819461';ctx.fillRect(0,0,w,h);
  ctx.imageSmoothingEnabled=moving||camera.z<1.5;ctx.imageSmoothingQuality='low';
  tileMap.paint(ctx,camera,w,h,true,{moving});
  if(camera.z<.2&&cityPath){
    ctx.save();ctx.translate(w/2-camera.x*camera.z,h/2-camera.y*camera.z);ctx.scale(camera.z,camera.z);ctx.strokeStyle='#586e5499';ctx.lineWidth=1.2/camera.z;ctx.setLineDash([4/camera.z,4/camera.z]);ctx.stroke(cityPath);
    ctx.restore();
  }
  if(dimmed()){ctx.globalCompositeOperation='multiply';ctx.fillStyle='#596b8f';ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';ctx.fillStyle='#152c4026';ctx.fillRect(0,0,w,h);}
  atmo?.mapDrawn(time);
  const occupied=[],priority=p=>p.id===selected?-1:['district-chilonzor','district-yunusobod','district-sergeli'].indexOf(p.id);
  if(!markerOrder.length||markerSelection!==selected){markerSelection=selected;markerOrder=[...districtPlaces,...places,...metroPlaces,...(catalogIndex.has(selected)?[catalogIndex.get(selected)]:[])].sort((a,b)=>(priority(a)<0&&a.id!==selected?10:priority(a))-(priority(b)<0&&b.id!==selected?10:priority(b)));}
  for(const p of markerOrder){
    const el=markerNodes.get(p.id);
    if(p.metro&&!showMetro){if(!el.hidden)el.hidden=true;continue;}
    const [x,y]=screenPoint(p.point),hidden=(p.district?camera.z>.6&&p.id!==selected:!p.metro&&camera.z<.18)||x<-100||x>w+100||y<-50||y>h+60;
    if(el.hidden!==hidden)el.hidden=hidden;if(hidden)continue;
    el.style.transform=`translate3d(${x}px,${y-9*camera.z}px,0) translate(-50%,-100%)`;
    p.label??=el.querySelector('.marker-label');p.label.hidden=!p.district&&camera.z<.55&&p.id!==selected;
    if(p.district&&!el.hidden&&labels&&w<1100){
      const labelWidth=p.name.replace(/ tumani$/,'').length*(w<760?4.7:6.3)+24,labelHeight=w<760?24:34;
      const box=[x-labelWidth/2,y-labelHeight,x+labelWidth/2,y+4];
      if(occupied.some(b=>box[0]<b[2]+3&&box[2]>b[0]-3&&box[1]<b[3]+3&&box[3]>b[1]-3))el.hidden=true;
      else occupied.push(box);
    }
  }
  $('#zoom-value').textContent=Math.round(camera.z*100)+'%';
  $('#zoom-in').disabled=camera.z>=2.99;$('#zoom-out').disabled=camera.z<=minZoom()*1.001;
  const meters=camera.z<.15?1000:camera.z<.5?500:100;
  $('#scale-bar').textContent=`≈ ${meters===1000?'1 km':meters+' m'} ${'━'.repeat(Math.max(2,Math.round(meters*camera.z/16)))}`;
  drawMini();
  if(profile){profileSamples.push(performance.now()-started);if(profileSamples.length===60){const samples=profileSamples.splice(0).sort((a,b)=>a-b);console.info('Map render (60 frames) '+JSON.stringify({medianMs:samples[30],p95Ms:samples[57],maxMs:samples[59]}));}}
  if(nextFrame)requestDraw();
}
function drawMini(){
  if(!scene||w<=480)return;
  const sw=mini.width,sh=mini.height,scale=Math.min(sw/WIDTH,sh/HEIGHT),ox=(sw-WIDTH*scale)/2,oy=(sh-HEIGHT*scale)/2;
  if(!miniBase){
    miniBase=document.createElement('canvas');miniBase.width=sw;miniBase.height=sh;
    const base=miniBase.getContext('2d'),pixels=document.createElement('canvas');pixels.width=80;pixels.height=55;
    pixels.getContext('2d').drawImage(scene,0,0,80,55);
    base.save();base.translate(ox,oy);base.scale(scale,scale);
    if(cityPath){base.fillStyle='#1d2433';base.fill(cityPath);base.strokeStyle='#1d2433';base.lineWidth=5/scale;base.stroke(cityPath);base.clip(cityPath);}
    base.imageSmoothingEnabled=false;base.drawImage(pixels,0,0,WIDTH,HEIGHT);base.restore();
  }
  mc.clearRect(0,0,sw,sh);mc.drawImage(miniBase,0,0);
  const rx=(camera.x-w/(2*camera.z))*scale+ox,ry=(camera.y-h/(2*camera.z))*scale+oy,rw=Math.max(5,w/camera.z*scale),rh=Math.max(4,h/camera.z*scale);
  mc.fillStyle='#ffffff20';mc.fillRect(rx,ry,rw,rh);mc.strokeStyle='#1d2433';mc.lineWidth=5;mc.strokeRect(rx,ry,rw,rh);mc.strokeStyle='#f5f1e3';mc.lineWidth=2;mc.strokeRect(rx,ry,rw,rh);
}
function cancelInteractions(){navigation.cancel();cancelAnimationFrame(animation);animation=0;canvas.classList.remove('dragging');inputRect=null;}
function resize(){cancelInteractions();w=innerWidth;h=innerHeight;$('#search').placeholder=w<600?'Joy, metro yoki ko‘cha...':'Joy, ko‘cha, metro yoki tuman qidiring...';clampCamera();requestDraw();}
function animateTo(x,y,z){
  navigation.stop();cancelAnimationFrame(animation);
  const from={...camera},start=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:700;
  function step(t){const f=Math.min(1,(t-start)/(duration||1)),e=1-Math.pow(1-f,3);camera.x=from.x+(x-from.x)*e;camera.y=from.y+(y-from.y)*e;camera.z=from.z+(z-from.z)*e;clampCamera();if(f<1)animation=requestAnimationFrame(step);else{animation=0;savePosition();}requestDraw();}
  animation=requestAnimationFrame(step);
}
function changeZoom(factor,sx=w/2,sy=h/2){
  cancelAnimationFrame(animation);animation=0;navigation.zoom(factor,{x:sx,y:sy});
}
function savePosition(){if(!ready)return;const [lon,lat]=unproject([camera.x,camera.y]);const hash=`#map=${lat.toFixed(5)},${lon.toFixed(5)},${camera.z.toFixed(4)}${selected?`&place=${selected}`:''}${atmo?.hashParam()??''}`;history.replaceState(null,'',hash);}
function scheduleSave(){clearTimeout(scheduleSave.timer);scheduleSave.timer=setTimeout(savePosition,250);}
function selectPlace(id,move=true){
  const p=findPlace(id);if(!p)return;
  if(p.district){
    closePlace();selected=id;$('.area-caption').style.opacity='0';$('#search').value='';$('#clear-search').hidden=true;closeResults();
    markerNodes.get(id).classList.add('selected');$('#current-area').textContent=p.name+' · Yaqinlashtirib kashf eting.';
    if(move){const view=fitBounds(p.bounds);animateTo(view.x,view.y,view.z);}else{requestDraw();savePosition();}
    return;
  }
  if(selected!==id)removeCatalogMarker(selected);
  selected=id;p.point??=project(p.coords);
  if(p.catalog&&!markerNodes.has(id)){
    const b=document.createElement('button');b.className='map-marker';b.setAttribute('aria-label',p.name);
    const label=document.createElement('span');label.className='marker-label';label.textContent=p.name;
    const pin=document.createElement('span');pin.className='marker-pin';b.append(label,pin);p.label=label;b.onclick=()=>selectPlace(id);$('#markers').append(b);markerNodes.set(id,b);
  }
  if(p.metro){showMetro=true;$('#metro-toggle').setAttribute('aria-pressed','true');rememberPreferences();}
  for(const [key,el]of markerNodes)el.classList.toggle('selected',key===id);
  $('#place-name').textContent=p.name;$('#place-category').textContent=p.category;
  $('#place-number').textContent=p.catalog?'KO‘CHALAR VA JOYLAR':p.metro?'TOSHKENT METROSI':`TOSHKENTNI KASHF ETING · ${String(places.indexOf(p)+1).padStart(2,'0')} / ${places.length}`;
  $('#place-description').textContent=p.desc||(p.street?'Ko‘cha va uning atrofidagi mahallalarni xaritada kashf eting.':'Bu joy va uning atrofini yaqinlashtirib tomosha qiling.');$('#place-coordinate').textContent=`${p.coords[1].toFixed(4)}° N, ${p.coords[0].toFixed(4)}° E`;
  $('#osm-link').href=`https://www.openstreetmap.org/?mlat=${p.coords[1]}&mlon=${p.coords[0]}#map=18/${p.coords[1]}/${p.coords[0]}`;
  $('#place-card').hidden=false;$('.area-caption').style.opacity='0';$('#search').value='';$('#clear-search').hidden=true;closeResults();
  if(scene){
    const pc=$('#place-canvas'),pctx=pc.getContext('2d'),view={x:p.point[0],y:p.point[1]-50,z:pc.width/270};
    const paint=()=>{if(selected!==p.id)return;pctx.fillStyle='#dfe3c8';pctx.fillRect(0,0,pc.width,pc.height);pctx.imageSmoothingEnabled=true;tileMap.paint(pctx,view,pc.width,pc.height,false);};
    paint();tileMap.ensure(view,pc.width,pc.height).then(release=>{try{paint();}finally{release();}}).catch(()=>{});
  }
  if(move&&p.street){const z=Math.max(1.12,Math.min(camera.z,1.65)),offset=w>760?80:0;animateTo(p.point[0]+offset/z,p.point[1]-30/z,z);}
  else if(move){const z=Math.max(camera.z,1.65);const offset=w>760?80:0;animateTo(p.point[0]+offset/z,p.point[1]-30/z,z);}
  else{requestDraw();savePosition();}
}
function removeCatalogMarker(id){if(catalogIndex.has(id)){markerNodes.get(id)?.remove();markerNodes.delete(id);}}
function closePlace(save=true){removeCatalogMarker(selected);selected=null;$('#place-card').hidden=true;$('.area-caption').style.opacity='1';$('#current-area').textContent='Butun Toshkent. Tumaningizni tanlang.';for(const el of markerNodes.values())el.classList.remove('selected');if(save)savePosition();}
function fitBounds([west,south,east,north]){
  const points=[[west,south],[east,south],[east,north],[west,north]].map(project);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const z=Math.min((w-48)/(right-left),(h-(w<760?260:140))/(bottom-top))*.9;
  // Keep the district above the mobile search panel.
  return {x:(left+right)/2,y:(top+bottom)/2+(w<760?50/z:0),z};
}
const normalize=normalizeSearch;
async function loadSearchCatalog(){
  if(catalogState==='ready')return catalogPlaces;if(catalogPromise)return catalogPromise;
  catalogState='loading';
  catalogPromise=fetch('./data/search.json?v=1').then(r=>{if(!r.ok)throw new Error('Search catalog unavailable');return r.json();}).then(data=>{
    catalogPlaces=data.places.map(p=>({...p,catalog:true,icon:p.street?'↝':p.category==='Bog‘'?'✳':'◇'}));
    for(const p of catalogPlaces)catalogIndex.set(p.id,p);catalogState='ready';return catalogPlaces;
  }).catch(()=>{catalogState='error';catalogPromise=null;return [];}).finally(()=>{if(document.activeElement===$('#search'))showResults(false,false);});
  return catalogPromise;
}
function showResults(all=false,allowLoad=true){
  if(allowLoad)void loadSearchCatalog();
  const q=normalize($('#search').value.trim());filtered=searchPlaces(q||all?allPlaces():[...districtPlaces,...places],q);activeResult=-1;
  $('#results').innerHTML='';
  if(!filtered.length){const n=document.createElement('p');n.className='no-results';n.textContent=catalogState==='loading'?'Ko‘chalar va joylar yuklanmoqda...':catalogState==='error'?'Ko‘cha katalogi yuklanmadi. Qayta qidirib ko‘ring.':'Bu nom topilmadi. Joy yoki ko‘cha nomini boshqa yozilishda qidirib ko‘ring.';$('#results').append(n);}
  for(const p of filtered){
    const b=document.createElement('button');b.id=`result-${p.id}`;b.setAttribute('role','option');b.setAttribute('aria-selected','false');
    const icon=document.createElement('span');icon.className='result-icon';icon.textContent=p.icon;
    const text=document.createElement('span'),name=document.createElement('strong'),small=document.createElement('small');text.className='result-copy';name.textContent=p.name;small.textContent=p.category+' · Toshkent';text.append(name,small);
    const arrow=document.createElement('span');arrow.className='result-arrow';arrow.textContent='↗';b.append(icon,text,arrow);
    b.addEventListener('click',()=>{selectPlace(p.id);$('#search').blur();});$('#results').append(b);
  }
  $('#results').hidden=false;$('#search').setAttribute('aria-expanded','true');$('#clear-search').hidden=!q;
}
function closeResults(){$('#results').hidden=true;$('#search').setAttribute('aria-expanded','false');$('#search').removeAttribute('aria-activedescendant');}
function keyboard(e){
  if(e.target.matches('input'))return;
  if(e.key==='/'&&!document.querySelector('dialog[open]')){e.preventDefault();$('#search').focus();showResults();return;}
  if(document.querySelector('dialog[open]'))return;
  if(e.key==='Escape'){closeResults();closePlace();return;}
  const move=90/camera.z;
  if(e.key.startsWith('Arrow')){navigation.stop();cancelAnimationFrame(animation);animation=0;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))e.preventDefault();
  if(e.key==='ArrowLeft')camera.x-=move;else if(e.key==='ArrowRight')camera.x+=move;else if(e.key==='ArrowUp')camera.y-=move;else if(e.key==='ArrowDown')camera.y+=move;else if(e.key==='+'||e.key==='=')changeZoom(1.25);else if(e.key==='-')changeZoom(.8);else if(e.key==='Home')resetHome();else return;
  clampCamera();requestDraw();scheduleSave();
}
function resetHome(){closePlace();animateTo(home[0],home[1],innerWidth<760?1.12:1.42);}
function hideHint(){$('#gesture-hint').style.opacity='0';}
const surface=$('#app'),isMapTarget=target=>target instanceof Element&&(target===canvas||!!target.closest('#markers'));
let inputRect=null;
function localPoint(e){const r=inputRect??=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
surface.addEventListener('pointerdown',e=>{
  if(!isMapTarget(e.target)||(e.button!==0&&e.pointerType!=='touch'))return;
  cancelAnimationFrame(animation);animation=0;
  const capture=e.target.closest('button')||canvas;capture.setPointerCapture(e.pointerId);
  navigation.pointerDown(e.pointerId,localPoint(e),performance.now());canvas.classList.add('dragging');hideHint();closeResults();
});
surface.addEventListener('pointermove',e=>{if(navigation.pointers.has(e.pointerId))navigation.pointerMove(e.pointerId,localPoint(e),performance.now());});
function endPointer(e){navigation.pointerUp(e.pointerId,performance.now(),e.type!=='pointerup');if(!navigation.pointers.size)canvas.classList.remove('dragging');}
surface.addEventListener('pointerup',endPointer);surface.addEventListener('pointercancel',endPointer);surface.addEventListener('lostpointercapture',endPointer);
surface.addEventListener('click',e=>{if(isMapTarget(e.target)&&navigation.suppressClick(performance.now())){e.preventDefault();e.stopImmediatePropagation();}},true);
surface.addEventListener('wheel',e=>{
  if(!isMapTarget(e.target))return;e.preventDefault();cancelAnimationFrame(animation);animation=0;hideHint();
  navigation.wheel({deltaX:e.deltaX,deltaY:e.deltaY,deltaMode:e.deltaMode,ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey,...localPoint(e)},performance.now());
},{passive:false});
surface.addEventListener('dblclick',e=>{if(isMapTarget(e.target)&&!navigation.suppressClick(performance.now())){const p=localPoint(e);changeZoom(1.5,p.x,p.y);}});
mini.addEventListener('pointerdown',e=>{const r=mini.getBoundingClientRect(),s=Math.min(mini.width/WIDTH,mini.height/HEIGHT),ox=(mini.width-WIDTH*s)/2,oy=(mini.height-HEIGHT*s)/2;animateTo(((e.clientX-r.left)/r.width*mini.width-ox)/s,((e.clientY-r.top)/r.height*mini.height-oy)/s,camera.z);});
$('#zoom-in').onclick=()=>changeZoom(1.28);$('#zoom-out').onclick=()=>changeZoom(1/1.28);$('#home-button').onclick=()=>{$('#settings-dialog').close();resetHome();};
$('#fit-button').onclick=()=>{$('#settings-dialog').close();closePlace();animateTo(WIDTH/2,HEIGHT/2,Math.min(w/WIDTH,h/HEIGHT)*.86);};
$('#labels-toggle').onclick=()=>{labels=!labels;$('#markers').classList.toggle('labels-hidden',!labels);$('#labels-toggle').setAttribute('aria-pressed',String(labels));rememberPreferences();};
$('#metro-toggle').onclick=()=>{showMetro=!showMetro;$('#metro-toggle').setAttribute('aria-pressed',String(showMetro));rememberPreferences();requestDraw();};
$('#theme-toggle').onclick=()=>{night=!night;if(!atmo?.active)document.body.classList.toggle('night',night);$('#theme-toggle').setAttribute('aria-pressed',String(night));rememberPreferences();requestDraw();toast(night?'Toshkent oqshomi':'Quyoshli Toshkent');};
$('#search').addEventListener('input',()=>showResults());$('#search').addEventListener('focus',()=>showResults());
$('#search').addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeResults();$('#search').blur();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if($('#results').hidden)showResults();activeResult=Math.max(0,Math.min(filtered.length-1,activeResult+(e.key==='ArrowDown'?1:-1)));for(const [i,b]of [...$('#results').querySelectorAll('button')].entries()){b.classList.toggle('active',i===activeResult);b.setAttribute('aria-selected',String(i===activeResult));}if(filtered[activeResult]){$('#search').setAttribute('aria-activedescendant',`result-${filtered[activeResult].id}`);$(`#result-${filtered[activeResult].id}`).scrollIntoView({block:'nearest'});}}
  if(e.key==='Enter'&&filtered.length){e.preventDefault();selectPlace(filtered[Math.max(0,activeResult)].id);$('#search').blur();}
});
$('#clear-search').onclick=()=>{$('#search').value='';showResults();$('#search').focus();};
$('#all-places').onclick=()=>{$('#search').focus();showResults(true);};
document.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>selectPlace(b.dataset.place));
document.querySelectorAll('[data-district]').forEach(b=>b.onclick=()=>{const p=districtPlaces.find(p=>normalize(p.name).includes(normalize(b.dataset.district)));if(p)selectPlace(p.id);});
$('#close-place').onclick=closePlace;
for(const name of ['about','share','settings']){
  $(`#${name}-button`).onclick=()=>{closeResults();if(name==='share'){savePosition();$('#share-url').value=location.href;}$(`#${name}-dialog`).showModal();};
  $(`#close-${name}`).onclick=()=>$(`#${name}-dialog`).close();
  $(`#${name}-dialog`).addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}});
}
$('#start-exploring').onclick=()=>$('#about-dialog').close();
$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#share-url').value);$('#copy-link').textContent='Nusxalandi ✓';toast('Xarita havolasi nusxalandi');setTimeout(()=>$('#copy-link').textContent='Nusxalash',2200);}catch{$('#share-url').select();toast('Havolani belgiladik. Nusxalash uchun Ctrl/Cmd+C bosing.');}};
$('#download-map').onclick=async()=>{
  if(!scene)return;
  const out=document.createElement('canvas');out.width=1600;out.height=1000;const c=out.getContext('2d'),view={...camera,z:1600/w*camera.z};
  const button=$('#download-map');button.disabled=true;
  let release=()=>{};
  try{release=await tileMap.ensure(view,1600,1000);}catch{toast('Ayrim detallar yuklanmadi. Rasm mavjud sifatda saqlanadi.');}finally{button.disabled=false;}
  c.fillStyle='#819461';c.fillRect(0,0,1600,1000);try{tileMap.paint(c,view,1600,1000,false);}finally{release();}
  if(dimmed()){c.globalCompositeOperation='multiply';c.fillStyle='#596b8f';c.fillRect(0,0,1600,1000);c.globalCompositeOperation='source-over';}
  const lit=atmo?.active?atmo.still(out,view,1600,1000):null;if(lit)c.drawImage(lit,0,0);
  c.fillStyle='#1d2433';c.fillRect(0,905,1600,95);c.fillStyle='#eeeade';c.font='600 30px "Pixelify Sans", monospace';c.fillText('tiny tashkent',42,958);c.font='15px "DM Sans", sans-serif';c.fillStyle='#bfc6c8';c.fillText('Toshkent, kaftingizda.',290,958);c.font='12px sans-serif';c.textAlign='right';c.fillText('© OpenStreetMap contributors · Binolar badiiy talqinda',1558,958);
  out.toBlob(blob=>{if(!blob){toast('Rasmni tayyorlab bo‘lmadi. Qayta urinib ko‘ring.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tiny-tashkent.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Rasm yuklab olishga tayyorlandi');},'image/png');
};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.explore'))closeResults();});
window.addEventListener('keydown',keyboard);window.addEventListener('resize',resize);window.addEventListener('blur',cancelInteractions);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelInteractions();else requestDraw();});
window.addEventListener('hashchange',()=>{if(ready)void restorePosition();});
async function restorePosition(){
  const sequence=++restoreSequence,locationView=parseMapLocation(location.hash,MAP_BOUNDS);
  if(locationView.place?.startsWith('catalog-'))await loadSearchCatalog();
  if(sequence!==restoreSequence)return;
  cancelInteractions();closePlace(false);
  if(locationView.view){const p=project(locationView.view.coords);Object.assign(camera,{x:p[0],y:p[1],z:locationView.view.zoom});clampCamera();}
  if(findPlace(locationView.place))selectPlace(locationView.place,false);
  requestDraw();
}
async function init(){
  resize();
  try{
    const [data,districts,boundary]=await Promise.all(['stations','districts','city-boundary'].map(async name=>{const response=await fetch(`./data/${name}.json?v=4`);if(!response.ok)throw new Error(`Map data: HTTP ${response.status}`);return response.json();}));
    const polygons=boundary.geometry.type==='MultiPolygon'?boundary.geometry.coordinates:[boundary.geometry.coordinates];
    for(const polygon of polygons)for(const ring of polygon)cityRings.push(ring.map(project));
    cityPath=new Path2D();for(const ring of cityRings){ring.forEach((p,i)=>i?cityPath.lineTo(...p):cityPath.moveTo(...p));cityPath.closePath();}
    for(const f of districts.features){
      const name=f.properties.displayName||f.properties.name;
      const p={id:f.id,name,category:'Tuman',icon:'◇',coords:f.geometry.coordinates,point:project(f.geometry.coordinates),district:true,bounds:f.properties.bounds,keywords:'tuman district rayon '+Object.values(f.properties).join(' ')};
      districtPlaces.push(p);const b=document.createElement('button');b.className='map-marker district-marker';b.setAttribute('aria-label',name+' xaritasini ochish');
      const label=document.createElement('span');label.className='marker-label';label.textContent=name.replace(/ tumani$/,'');b.append(label);b.onclick=()=>selectPlace(p.id);$('#markers').append(b);markerNodes.set(p.id,b);
    }
    for(const f of data.features.filter(f=>f.kind==='metro'&&f.geometry.type==='Point')){
      const name=f.properties['name:uz']||f.properties.name||f.properties['name:en'];if(!name)continue;
      const p={id:f.id.replace('/','-'),name:`${name} metrosi`,category:'Metro stansiyasi',icon:'M',coords:f.geometry.coordinates,point:project(f.geometry.coordinates),metro:true,keywords:'metro subway station '+Object.values(f.properties).join(' '),desc:`${name} — Toshkent metrosi stansiyasi. Shu joydan atrofdagi ko‘chalar va diqqatga sazovor manzillarni kashf eting.`};
      metroPlaces.push(p);const b=document.createElement('button');b.className='map-marker metro-marker';b.setAttribute('aria-label',p.name);b.hidden=true;
      const label=document.createElement('span');label.className='marker-label';label.textContent=p.name;const pin=document.createElement('span');pin.className='metro-pin';pin.textContent='M';b.append(label,pin);b.onclick=()=>selectPlace(p.id);$('#markers').append(b);markerNodes.set(p.id,b);
    }
    tileMap=await TileMap.load(requestDraw);scene=tileMap.overview;mapStats=tileMap.manifest;ready=true;await restorePosition();requestDraw();$('#loading').classList.add('loaded');setTimeout(()=>$('#loading').hidden=true,600);
    $('#place-count').textContent=districtPlaces.length+' HUDUD';$('#about-place-count').textContent=districtPlaces.length+' hudud';$('#map-area').textContent=mapStats.areaKm2+' km²';$('#metro-count').textContent=metroPlaces.length;
    setTimeout(hideHint,14000);
  }catch(error){console.error(error);$('#loading p').textContent='Xaritani yuklab bo‘lmadi. Internetni tekshirib, sahifani yangilang.';$('.loading-bar').hidden=true;const b=document.createElement('button');b.className='wide-button';b.style.width='200px';b.textContent='Qayta urinish ↻';b.onclick=()=>location.reload();$('#loading').append(b);}
}
init();
