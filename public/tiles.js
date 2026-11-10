// Preserve useful imagery across zoom levels and decode off the drawing path.
export class TileMap {
  constructor(manifest,onChange){
    Object.assign(this,{manifest,onChange});
    this.cache=new Map();this.pending=new Map();this.failures=new Map();this.pins=new Map();this.queue=[];
    this.wantedKeys=new Set();this.retryAttempts=new Map();this.retryBaseMs=350;this.retryTimer=null;this.loadTimeoutMs=15000;
    this.active=0;this.limit=4;this.clock=0;this.cacheBytes=0;this.maxCacheBytes=96*1024*1024;
  }
  static async load(onChange){
    const response=await fetch('./data/map.json?v=11');if(!response.ok)throw new Error('Map manifest unavailable');
    const map=new TileMap(await response.json(),onChange);
    map.overview=await map.loadImage(map.manifest.overview);return map;
  }
  async loadImage(url,signal,cache='force-cache'){
    const response=await fetch(url,{signal,cache});if(!response.ok)throw new Error(`Map image: HTTP ${response.status}`);
    const blob=await response.blob();
    if(typeof createImageBitmap==='function'){
      const bitmap=await createImageBitmap(blob);
      if(signal?.aborted){bitmap.close();throw new DOMException('Cancelled','AbortError');}return bitmap;
    }
    const objectUrl=URL.createObjectURL(blob);
    try{return await new Promise((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>resolve(image);image.onerror=reject;image.src=objectUrl;});}
    finally{URL.revokeObjectURL(objectUrl);}
  }
  levelFor(zoom){return Math.max(0,Math.min(this.manifest.maxLevel,Math.floor(Math.log2(1/zoom))));}
  tile(level,x,y){const span=this.manifest.tileSize*2**level;return {key:`${level}/${x}_${y}`,level,x,y,span};}
  visibleTiles(camera,width,height,level=this.levelFor(camera.z),margin=0){
    const {tileSize,width:mw,height:mh}=this.manifest,span=tileSize*2**level;
    const x0=Math.max(0,Math.floor((camera.x-width/(2*camera.z))/span)-margin),x1=Math.min(Math.ceil(mw/span)-1,Math.floor((camera.x+width/(2*camera.z))/span)+margin);
    const y0=Math.max(0,Math.floor((camera.y-height/(2*camera.z))/span)-margin),y1=Math.min(Math.ceil(mh/span)-1,Math.floor((camera.y+height/(2*camera.z))/span)+margin);
    const tiles=[];for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)tiles.push({...this.tile(level,x,y),distance:Math.hypot((x+.5)*span-camera.x,(y+.5)*span-camera.y)});
    return tiles.sort((a,b)=>a.distance-b.distance);
  }
  request(tile,retain=false){
    const cached=this.cache.get(tile.key);if(cached){cached.used=++this.clock;return Promise.resolve(cached.image);}
    const existing=this.pending.get(tile.key);if(existing){existing.retain||=retain;return existing.promise;}
    if((this.failures.get(tile.key)||0)>Date.now())return Promise.resolve(null);
    let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});
    const job={...tile,retain,promise,resolve,reject,controller:new AbortController()};
    this.pending.set(tile.key,job);this.queue.push(job);return promise;
  }
  pump(){
    while(this.active<this.limit&&this.queue.length){
      const job=this.queue.shift();if(job.controller.signal.aborted)continue;this.active++;job.active=true;
      const interrupted=new Promise((resolve,reject)=>{job.onAbort=()=>reject(new DOMException('Cancelled','AbortError'));job.controller.signal.addEventListener('abort',job.onAbort,{once:true});});
      const timeout=setTimeout(()=>{job.timedOut=true;job.controller.abort();},this.loadTimeoutMs);timeout.unref?.();
      const loading=this.loadImage(`${this.manifest.baseUrl}/${job.key}.webp`,job.controller.signal,this.retryAttempts.has(job.key)?'reload':'force-cache').then(image=>{
        if(job.controller.signal.aborted){image.close?.();throw new DOMException('Cancelled','AbortError');}return image;
      });
      Promise.race([loading,interrupted]).then(image=>{
        if(job.controller.signal.aborted){image.close?.();return;}
        this.remember(job.key,image);job.resolve(image);this.onChange();
      }).catch(error=>{
        if(job.timedOut||error?.name!=='AbortError'){
          const attempt=(this.retryAttempts.get(job.key)||0)+1;this.retryAttempts.set(job.key,attempt);
          this.failures.set(job.key,Date.now()+Math.min(5000,this.retryBaseMs*2**Math.min(attempt-1,5)));
        }
        job.reject(error);
      }).finally(()=>{
        clearTimeout(timeout);
        job.controller.signal.removeEventListener('abort',job.onAbort);
        if(this.pending.get(job.key)===job)this.pending.delete(job.key);this.active--;this.pump();this.armRetry();
      });
    }
  }
  updateRequests(tiles){
    const wanted=new Set(tiles.map(t=>t.key));
    this.wantedKeys=wanted;
    for(const [key,job]of this.pending){
      if(wanted.has(key)||job.retain)continue;
      job.controller.abort();job.resolve(null);this.pending.delete(key);
    }
    this.queue=this.queue.filter(job=>!job.controller.signal.aborted);
    for(const tile of tiles)this.request(tile);
    const rank=new Map(tiles.map((tile,i)=>[tile.key,i]));
    this.queue.sort((a,b)=>(rank.get(a.key)??Number.MAX_SAFE_INTEGER)-(rank.get(b.key)??Number.MAX_SAFE_INTEGER));
    this.pump();this.armRetry();
  }
  armRetry(){
    clearTimeout(this.retryTimer);this.retryTimer=null;
    let next=Infinity;
    for(const key of this.wantedKeys){
      if(!this.cache.has(key)&&!this.pending.has(key)&&this.failures.has(key))next=Math.min(next,this.failures.get(key));
    }
    if(Number.isFinite(next)){
      this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.onChange();},Math.max(0,next-Date.now()));
      this.retryTimer.unref?.();
    }
  }
  remember(key,image){
    this.failures.delete(key);this.retryAttempts.delete(key);
    const old=this.cache.get(key);if(old){this.cacheBytes-=old.bytes;if(old.image!==image)old.image.close?.();}
    const bytes=image.width*image.height*4;
    this.cache.set(key,{image,bytes,used:++this.clock});this.cacheBytes+=bytes;
  }
  trim(protectedTiles){
    const protectedKeys=new Set([...protectedTiles.map(t=>t.key),...this.pins.keys()]);
    const candidates=[...this.cache].filter(([key])=>!protectedKeys.has(key)).sort((a,b)=>a[1].used-b[1].used);
    for(const [key,entry]of candidates){
      if(this.cacheBytes<=this.maxCacheBytes)break;
      this.cache.delete(key);this.cacheBytes-=entry.bytes;entry.image.close?.();
    }
  }
  drawImage(ctx,image,bounds,camera,width,height){
    const [left,top,right,bottom]=bounds,z=camera.z;
    const sx=Math.round(width/2+(left-camera.x)*z),sy=Math.round(height/2+(top-camera.y)*z),ex=Math.round(width/2+(right-camera.x)*z),ey=Math.round(height/2+(bottom-camera.y)*z);
    const dx=Math.max(0,sx),dy=Math.max(0,sy),dr=Math.min(width,ex),db=Math.min(height,ey);
    if(dr<=dx||db<=dy||ex<=sx||ey<=sy)return;
    // Crop the source too: never scale the entire city-sized overview merely
    // to display a small neighborhood within the canvas viewport.
    ctx.drawImage(image,(dx-sx)/(ex-sx)*image.width,(dy-sy)/(ey-sy)*image.height,(dr-dx)/(ex-sx)*image.width,(db-dy)/(ey-sy)*image.height,dx,dy,dr-dx,db-dy);
  }
  paint(ctx,camera,width,height,request=true,{moving=false}={}){
    const {width:mw,height:mh,maxLevel,detailPixelRatio=1,tileSize}=this.manifest;
    this.drawImage(ctx,this.overview,[0,0,mw,mh],camera,width,height);
    const visible=this.visibleTiles(camera,width,height),level=this.levelFor(camera.z),wanted=new Set(visible.map(t=>t.key));
    const missing=visible.some(t=>!this.cache.has(t.key));let displayed=visible;
    if(missing){
      // Commit one complete resolution across the viewport. Drawing individual
      // ready tiles over the overview creates a sharp/blurry seam at every edge.
      displayed=[];
      for(let l=Math.max(0,level-1);l<=maxLevel;l++){
        if(l===level)continue;
        const candidates=this.visibleTiles(camera,width,height,l);
        if(candidates.length&&candidates.every(tile=>this.cache.has(tile.key))){displayed=candidates;break;}
      }
    }
    for(const tile of displayed){
      const entry=this.cache.get(tile.key);if(!entry)continue;entry.used=++this.clock;
      const ratio=tile.level===0?detailPixelRatio:1;
      this.drawImage(ctx,entry.image,[tile.x*tile.span,tile.y*tile.span,tile.x*tile.span+entry.image.width/ratio*2**tile.level,tile.y*tile.span+entry.image.height/ratio*2**tile.level],camera,width,height);
    }
    const parents=level<maxLevel?this.visibleTiles(camera,width,height,level+1):[];
    if(request){
      const neighbors=moving?[]:this.visibleTiles(camera,width,height,level,1).filter(t=>!wanted.has(t.key)).slice(0,2);
      // Visible detail is still needed during wheel, pinch and drag gestures.
      // Only speculative neighbors wait until movement has stopped.
      this.updateRequests([...visible,...parents,...neighbors]);
      const visibleBytes=visible.length*(tileSize*(level===0?detailPixelRatio:1))**2*4;
      this.maxCacheBytes=Math.min(192*1024**2,Math.max(96*1024**2,visibleBytes*1.5));
    }
    if(request)this.trim([...visible,...displayed,...parents]);
  }
  async ensure(camera,width,height){
    const tiles=this.visibleTiles(camera,width,height);let released=false;
    for(const tile of tiles)this.pins.set(tile.key,(this.pins.get(tile.key)||0)+1);
    const release=()=>{if(released)return;released=true;for(const tile of tiles){const count=this.pins.get(tile.key)-1;if(count)this.pins.set(tile.key,count);else this.pins.delete(tile.key);}};
    try{const promises=tiles.map(tile=>this.request(tile,true));this.pump();const images=await Promise.all(promises);if(images.some(image=>!image))throw new Error('Detail image temporarily unavailable');return release;}
    catch(error){release();throw error;}
  }
}
