// Building volumes come from OSM. Untagged heights and materials are illustrated
// approximations, never measurements inferred from Google imagery.
import {LANDMARK_ROLES} from './landmarks.js';
// Vertical pixels per metre: the 0.62 ground tilt implies the first factor; 1.7 exaggerates volumes so the city reads as a model.
export const HEIGHT_SCALE=1.7*.98*Math.sqrt(1-.62**2);
const colors={white:'#f2eee2',ivory:'#e8dfc8',beige:'#d7c5a5',cream:'#eadbb8',brown:'#92705b',red:'#ad6952',darkred:'#8e574c',grey:'#9ba5a0',gray:'#9ba5a0',lightgrey:'#c7ccc4',lightgray:'#c7ccc4',darkgrey:'#687878',darkgray:'#687878',green:'#739288',blue:'#608f9f',black:'#4c5c60',silver:'#b8c2be',yellow:'#ddc489',orange:'#c18559',pink:'#d2b4a5'};
export function buildingColor(value,fallback){
  if(!value)return fallback;
  const color=String(value).trim().toLowerCase().split(';')[0];
  if(/^#[0-9a-f]{6}$/.test(color))return color;
  if(/^#[0-9a-f]{3}$/.test(color))return '#'+color.slice(1).split('').map(c=>c+c).join('');
  return colors[color.replace(/[_ -]/g,'')]||fallback;
}
export function roofBearing(value){
  if(value===undefined||value===null||String(value).trim()==='')return null;
  const directions={N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,SSE:157.5,S:180,SSW:202.5,SW:225,WSW:247.5,W:270,WNW:292.5,NW:315,NNW:337.5};
  const text=String(value).trim().toUpperCase(),n=directions[text]??Number(text);
  return Number.isFinite(n)?((n%360)+360)%360:null;
}
export function buildingProfile(feature,area,seed){
  const p=feature.properties,kind=p.building||p['building:part']||'yes';
  const identity=LANDMARK_ROLES.get(feature.id);
  const levels=Number.parseFloat(p['building:levels']);
  const tagged=Number.parseFloat(p.height);
  // Untagged volumes (most of Tashkent) get a typical local height by footprint:
  // courtyard houses, 4-5 storey panel blocks, the odd 9-storey slab, low halls.
  const inferred=identity==='humo'?19.2:kind==='apartments'?(area>420&&seed%5<2?28.8:area>260?16:12.8):kind==='garage'||kind==='garages'||kind==='shed'||kind==='roof'?3.2:['school','kindergarten','university','college','hospital'].includes(kind)?(area>700?12.8:9.6):['retail','commercial','supermarket'].includes(kind)?(area>1500?10:7):area>2200?11:area>1150?(seed%7<2?28.8:14)
    :area>480?(seed%9<2?28.8:seed%9<7?16:12.8):area>230?(seed%4?9.6:6.4):area<40?3.2:4.2+(seed%4)*.8;
  const meters=Math.max(1,Math.min(420,Number.isFinite(tagged)?tagged:Number.isFinite(levels)?levels*3.2:inferred));
  const minTag=Number.parseFloat(p.min_height),minLevel=Number.parseFloat(p['building:min_level']);
  const minMeters=Math.max(0,Math.min(meters,Number.isFinite(minTag)?minTag:Number.isFinite(minLevel)?minLevel*3.2:0));
  const roofTag=Number.parseFloat(p['roof:height']),roofLevels=Number.parseFloat(p['roof:levels']);
  // Mapped circular dome volumes lack roof tags at these retained OSM IDs.
  // Infer their illustrated caps from the tourism reference, retaining total h.
  const illustratedDome=['way/1056620232','way/1056620233'].includes(feature.id);
  const illustratedCone=['way/904703444','way/904703446'].includes(feature.id);
  let roofShape=p['roof:shape']||(illustratedDome?'dome':illustratedCone?'conical':null);
  if(!roofShape){
    if(kind==='house'||kind==='detached'||kind==='semidetached_house'||kind==='terrace')roofShape='hipped';
    else if(['industrial','warehouse','barn'].includes(kind))roofShape='gabled';
    else roofShape=area<450&&meters<10&&!p['building:part']&&kind==='yes'?'hipped':'flat';
  }
  const roofDefault=illustratedCone?3:illustratedDome?Math.min(8,meters*.45):['dome','onion','conical'].includes(roofShape)?Math.min(meters*.65,Math.sqrt(area)*.35):roofShape==='flat'?0:Math.min(4,meters*.28);
  const roofMeters=Math.max(0,Math.min(meters-minMeters,Number.isFinite(roofTag)?roofTag:Number.isFinite(roofLevels)?roofLevels*3:roofDefault));
  const hotel=feature.id==='way/44491343';
  const mosque=p.amenity==='place_of_worship'&&p.religion==='muslim';
  const glass=!hotel&&(kind==='office'||meters>85);
  const warehouse=['industrial','warehouse','hangar','barn'].includes(kind)||area>2500&&meters<18;
  const house=!warehouse&&!glass&&meters<=10;
  const style=hotel?'hotel':mosque?'mosque':glass?'glass':warehouse?'industrial':house?'house':'masonry';
  const wallPalettes={hotel:['#eadcbb'],mosque:['#f2eee3'],glass:['#a8c0c4','#b4c8ca','#97b3bd'],industrial:['#c4c7bd','#d1c7ae','#b7c6bd'],house:['#dfc9a8','#e9dabd','#d5bc9e','#e9d6bd','#d7c4aa'],masonry:['#e3dccb','#d6c6b1','#c9d2cb','#ded3be','#cdb8a6','#d9d0bd','#d8d9cf','#d4c3b8']};
  const roofPalettes={hotel:['#c1beb0'],mosque:['#4b9caa'],glass:['#91a9ad','#a3b6b9'],industrial:['#91a2a0','#a8aaa0','#9eaaa3'],house:['#a96e58','#8c9d97','#b47d61','#8d9187','#a17b65','#768f90'],masonry:['#929b96','#9d9b8d','#b5aa96','#87948f','#a5a99c','#8c9292']};
  const date=Number.parseInt(p.start_date),material=String(p['building:material']||'').toLowerCase();
  // These are visual building types, not assertions of the age of untagged homes.
  const typology=warehouse?'industrial':house?'mahalla':kind==='office'||material==='glass'?'office':kind==='apartments'||kind==='residential'?((Number.isFinite(date)&&date>=2000)||meters>40?'contemporary':'slab'):['civic','mosque','church'].includes(kind)?'civic':'mixed';
  const finishes={hotel:['#e0d8bf','#a7aea5'],museum:['#e7deca','#4e9ba6'],chorsu:['#d5c4a0','#398da2'],navoiy:['#e7ddc7','#969d8e'],minor:['#eeeadd','#b6b49e'],nest:['#d4d3be','#929f9b'],mall:['#baa47e','#a9ada1'],hilton:['#d9dbcf','#9aa6a1'],forum:['#eeebdd','#9dafad'],humo:['#c2ccc4','#b9c4bf'],library:['#dddac5','#9ba69d'],kukeldash:['#c9ad85','#ae9879'],hazrat:['#dfc9a3','#b3ad96']};
  const finish=finishes[identity];
  const typeWall=typology==='slab'?['#d9d4be','#c5cdbf','#d9ccb4','#cfc4af'][seed%4]:typology==='contemporary'?['#dbd4c1','#c7b9a5','#d6d9ce','#c3b6a3'][seed%4]:null;
  const wall=buildingColor(p['building:colour'],finish?.[0]||typeWall||wallPalettes[style][seed%wallPalettes[style].length]);
  const roof=buildingColor(p['roof:colour'],illustratedDome||illustratedCone?'#4a98a7':finish?.[1]||roofPalettes[style][seed%roofPalettes[style].length]);
  return {style,kind,typology,identity,wall,roof,meters,levels:Number.isFinite(levels)?levels:Math.max(1,Math.round(meters/3.2)),minMeters,roofMeters,roofShape,roofBearing:roofBearing(p['roof:direction']),h:meters*HEIGHT_SCALE,base:minMeters*HEIGHT_SCALE,eave:(meters-roofMeters)*HEIGHT_SCALE,rise:roofMeters*HEIGHT_SCALE};
}
