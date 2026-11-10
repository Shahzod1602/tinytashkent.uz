export const defaultPreferences=Object.freeze({labels:true,metro:false,night:false});
const key='tiny-tashkent:preferences:v1';
export function readPreferences(storage){
 const prefs={...defaultPreferences};
 try{const saved=JSON.parse((storage??globalThis.localStorage).getItem(key));if(saved&&typeof saved==='object')for(const k of Object.keys(prefs))if(typeof saved[k]==='boolean')prefs[k]=saved[k];}catch{}
 return prefs;
}
export function savePreferences(prefs,storage){
 try{const value={};for(const k of Object.keys(defaultPreferences))value[k]=typeof prefs[k]==='boolean'?prefs[k]:defaultPreferences[k];(storage??globalThis.localStorage).setItem(key,JSON.stringify(value));return true;}catch{return false;}
}
export function parseMapLocation(hash,bounds){
 const params=new URLSearchParams(hash.replace(/^#/,'')),parts=params.get('map')?.split(',').map(Number);
 const [west,south,east,north]=bounds;
 const valid=parts?.length===3&&parts.every(Number.isFinite)&&parts[0]>=south-.003&&parts[0]<=north+.003&&parts[1]>=west-.003&&parts[1]<=east+.003&&parts[2]>0;
 const id=params.get('place');
 return {view:valid?{coords:[parts[1],parts[0]],zoom:Math.min(3,parts[2])}:null,place:id&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)?id:null};
}
