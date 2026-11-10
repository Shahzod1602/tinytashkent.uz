const KEY='tiny-tashkent-visitor-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function browserVisitorId(storage,randomUUID=()=>crypto.randomUUID()){
  try{
    const saved=storage.getItem(KEY);if(UUID.test(saved||''))return saved;
    const id=randomUUID();storage.setItem(KEY,id);return id;
  }catch{return null;}
}
export async function requestVisitorCount({visitorId=null,register=true,fetcher=fetch}={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
  try{
    const response=await fetcher('./api/visitors',{method:register?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,...(register?{headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId})}:{})});
    if(!response.ok)throw new Error('Counter unavailable');
    const data=await response.json();if(!Number.isSafeInteger(data.total)||data.total<0)throw new Error('Invalid counter response');
    return data.total;
  }finally{clearTimeout(timeout);}
}
if(typeof document!=='undefined'){
  const badge=document.querySelector('.visitor-badge'),status=document.querySelector('#visitor-status'),retry=document.querySelector('#visitor-retry');
  let visitorId=null,registered=false,busy=false;
  try{visitorId=browserVisitorId(localStorage);}catch{}
  const update=async()=>{
    if(busy||document.visibilityState==='hidden')return;busy=true;retry.hidden=true;
    try{
      const total=await requestVisitorCount({visitorId,register:!registered});registered=true;
      const count=document.createElement('strong');count.id='visitor-count';count.textContent=new Intl.NumberFormat('uz-UZ').format(total);
      status.replaceChildren(count,document.createTextNode(' tashrifchi'));badge.dataset.state='ready';
    }catch{status.textContent='Hisob vaqtincha mavjud emas';badge.dataset.state='error';retry.hidden=false;}
    finally{busy=false;}
  };
  retry.addEventListener('click',update);
  window.addEventListener('online',update);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')update();});
  setInterval(()=>{if(document.visibilityState==='visible')update();},60000);
  update();
}
