const cyrillic={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'i',ь:'',э:'e',ю:'yu',я:'ya',ў:'o',қ:'q',ғ:'g',ҳ:'h'};
export function normalizeSearch(value){
 return String(value).toLowerCase().replace(/[а-яёўқғҳ]/g,c=>cyrillic[c]??c).normalize('NFD').replace(/[\u0300-\u036fʻ‘’ʼʹ'`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
const keys=new WeakMap();
export function searchPlaces(places,query,limit=24){
 const q=normalizeSearch(query),tokens=q.split(/\s+/).filter(Boolean);
 if(!q)return places.slice(0,limit);
 const scored=[];
 for(const p of places){
  let k=keys.get(p);if(!k){k={name:p.searchName||normalizeSearch(p.name),all:p.searchKey||normalizeSearch([p.name,p.category,p.keywords,...(p.aliases||[])].join(' '))};keys.set(p,k);}
  if(!tokens.every(t=>k.all.includes(t)))continue;
  const rank=k.name===q?0:k.name.startsWith(q)?1:tokens.every(t=>k.name.includes(t))?2:3;
  scored.push({p,rank});
 }
 return scored.sort((a,b)=>a.rank-b.rank||Number(!!a.p.catalog)-Number(!!b.p.catalog)).slice(0,limit).map(x=>x.p);
}
