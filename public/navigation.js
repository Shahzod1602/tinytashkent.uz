const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const centroid=points=>({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length});
const distance=points=>points.length>1?Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y):0;

export function zoomAt(camera,factor,point,viewport,minZoom,maxZoom=3){
  const z=clamp(camera.z*factor,minZoom,maxZoom),dx=point.x-viewport.width/2,dy=point.y-viewport.height/2;
  return {x:camera.x+dx/camera.z-dx/z,y:camera.y+dy/camera.z-dy/z,z};
}

export function gestureView(start,points,viewport,minZoom,maxZoom=3){
  const middle=centroid(points),d=distance(points);
  const z=clamp(start.camera.z*(start.distance>0?d/start.distance:1),minZoom,maxZoom);
  return {x:start.anchor.x-(middle.x-viewport.width/2)/z,y:start.anchor.y-(middle.y-viewport.height/2)/z,z};
}

// Camera math is independent of DOM events, so real multi-pointer traces can
// be checked without depending on a particular browser's touch emulation.
export class MapNavigation {
  constructor(camera,{viewport,minZoom,constrain,onChange,onRest,reducedMotion=()=>false}){
    Object.assign(this,{camera,viewport,minZoom,constrain,onChange,onRest,reducedMotion});
    this.pointers=new Map();this.samples=[];this.lastFrame=0;this.wheelUntil=0;this.suppressUntil=0;
  }
  get moving(){return this.pointers.size>0||!!this.zoomTarget||!!this.velocity||performance.now()<this.wheelUntil;}
  stop(){this.zoomTarget=null;this.velocity=null;this.lastFrame=0;this.wheelUntil=0;}
  cancel(){
    this.stop();this.pointers.clear();this.samples=[];this.gesture=null;this.dragged=false;this.suppressUntil=0;this.wheelMode=null;this.lastWheel=undefined;
    this.onChange();this.onRest();
  }
  changed(){this.constrain();this.onChange();}
  rebase(time){
    if(!this.pointers.size){this.gesture=null;return;}
    const points=[...this.pointers.values()].slice(0,2),middle=centroid(points),v=this.viewport();
    this.gesture={camera:{...this.camera},distance:distance(points),middle,anchor:{x:this.camera.x+(middle.x-v.width/2)/this.camera.z,y:this.camera.y+(middle.y-v.height/2)/this.camera.z}};
    this.samples=[{...middle,time}];
  }
  pointerDown(id,point,time){
    this.stop();if(!this.pointers.size){this.dragged=false;this.suppressUntil=0;}
    this.pointers.set(id,point);if(this.pointers.size>1)this.dragged=true;
    this.rebase(time);this.onChange();
  }
  pointerMove(id,point,time){
    if(!this.pointers.has(id))return;
    this.pointers.set(id,point);
    const points=[...this.pointers.values()].slice(0,2),middle=centroid(points),start=this.gesture;
    if(!this.dragged&&Math.hypot(middle.x-start.middle.x,middle.y-start.middle.y)<4)return;
    this.dragged=true;
    Object.assign(this.camera,gestureView(start,points,this.viewport(),this.minZoom()));
    this.samples.push({...middle,time});
    while(this.samples.length>2&&time-this.samples[0].time>80)this.samples.shift();
    this.changed();
  }
  pointerUp(id,time,cancelled=false){
    if(!this.pointers.has(id))return;
    const single=this.pointers.size===1,samples=this.samples;
    this.pointers.delete(id);
    if(this.dragged)this.suppressUntil=time+400;
    if(this.pointers.size){this.rebase(time);return;}
    this.gesture=null;
    if(single&&this.dragged&&!cancelled&&!this.reducedMotion()&&samples.length>1){
      const a=samples[0],b=samples.at(-1),dt=b.time-a.time;
      if(dt>0&&time-b.time<70){
        const vx=clamp((b.x-a.x)/dt,-2.5,2.5),vy=clamp((b.y-a.y)/dt,-2.5,2.5);
        if(Math.hypot(vx,vy)>.08)this.velocity={x:-vx/this.camera.z,y:-vy/this.camera.z};
      }
    }
    this.onChange();if(!this.velocity)this.onRest();
  }
  suppressClick(time){return time<this.suppressUntil;}
  pan(dx,dy){this.stop();this.camera.x+=dx/this.camera.z;this.camera.y+=dy/this.camera.z;this.changed();}
  zoom(factor,point){
    this.velocity=null;
    const v=this.viewport(),target=clamp((this.zoomTarget||this.camera.z)*factor,this.minZoom(),3);
    this.zoomAnchor={point,world:{x:this.camera.x+(point.x-v.width/2)/this.camera.z,y:this.camera.y+(point.y-v.height/2)/this.camera.z}};
    if(this.reducedMotion()){
      Object.assign(this.camera,zoomAt(this.camera,target/this.camera.z,point,v,this.minZoom()));this.zoomTarget=null;this.changed();this.onRest();return;
    }
    this.zoomTarget=target;this.lastFrame=0;this.onChange();
  }
  wheel(event,time){
    const v=this.viewport(),unit=event.deltaMode===1?16:event.deltaMode===2?v.height:1;
    let dx=event.deltaX*unit,dy=event.deltaY*unit;
    if(event.shiftKey&&!dx){dx=dy;dy=0;}
    if(event.ctrlKey||event.metaKey){
      this.wheelMode=null;this.zoom(Math.exp(-clamp(dy,-100,100)*.01),{x:event.x,y:event.y});
    }else{
      if(time-this.lastWheel>180)this.wheelMode=null;
      // Precision scroll begins with small/fractional pixel deltas. Keep that
      // decision for its whole burst so fast trackpad swipes never flip to zoom.
      if(dx)this.wheelMode='pan';
      if(!this.wheelMode)this.wheelMode=event.deltaMode!==0||(Math.abs(dy)>=40&&Number.isInteger(dy))?'zoom':'pan';
      if(this.wheelMode==='zoom')this.zoom(Math.exp(-clamp(dy,-160,160)*.0025),{x:event.x,y:event.y});
      else{this.pan(dx,dy);this.wheelUntil=time+120;}
    }
    this.lastWheel=time;this.onChange();
  }
  step(time){
    const dt=this.lastFrame?Math.min(40,Math.max(1,time-this.lastFrame)):16;this.lastFrame=time;
    let active=false;
    if(this.zoomTarget){
      const ratio=1-Math.exp(-dt/65),z=Math.exp(Math.log(this.camera.z)+(Math.log(this.zoomTarget)-Math.log(this.camera.z))*ratio),v=this.viewport(),a=this.zoomAnchor;
      this.camera.z=Math.abs(Math.log(this.zoomTarget/z))<.0005?this.zoomTarget:z;
      this.camera.x=a.world.x-(a.point.x-v.width/2)/this.camera.z;this.camera.y=a.world.y-(a.point.y-v.height/2)/this.camera.z;
      if(this.camera.z===this.zoomTarget)this.zoomTarget=null;else active=true;
      this.constrain();
    }
    if(this.velocity){
      const decay=Math.exp(-dt/180),travel=180*(1-decay),velocity=this.velocity;
      this.camera.x+=velocity.x*travel;this.camera.y+=velocity.y*travel;this.constrain();velocity.x*=decay;velocity.y*=decay;
      if(Math.hypot(velocity.x,velocity.y)*this.camera.z<.015)this.velocity=null;else active=true;
    }
    if(time<this.wheelUntil)active=true;
    if(!active){this.lastFrame=0;if(this.wasAnimating)this.onRest();}
    this.wasAnimating=active;return active;
  }
}
