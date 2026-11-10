const COOKIE='tiny_tashkent_visitor';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const baseHeaders={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{...baseHeaders,...headers}});

export async function handleVisitorRequest(request,db){
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405,{Allow:'GET, POST'});
  if(!db)return json({error:'Counter unavailable'},503);
  let setCookie;
  try{
    if(request.method==='POST'){
      const url=new URL(request.url),origin=request.headers.get('origin');
      if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Invalid origin'},403);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Expected JSON'},415);
      if(Number(request.headers.get('content-length'))>256)return json({error:'Request too large'},413);
      const raw=await request.text();if(raw.length>256)return json({error:'Request too large'},413);
      let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
      if(!body||typeof body!=='object'||Array.isArray(body)||body.visitorId!==null&&body.visitorId!==undefined&&!UUID.test(body.visitorId))return json({error:'Invalid visitor identifier'},400);
      // Dispatch injects a stable per-Site account ID when signed in. Hash it
      // before persistence so the DB and public count never expose identities.
      const user=request.headers.get('oai-authenticated-user-id');
      const cookie=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
      const browserId=UUID.test(cookie||'')?cookie:body.visitorId||crypto.randomUUID();
      const key=user?'account:'+user:'browser:'+browserId;
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('tiny-tashkent-visitors-v1:'+key));
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      // Primary key + atomic INSERT OR IGNORE make refreshes, concurrent tabs
      // and retried requests idempotent. GET and asset requests never count.
      await db.prepare('INSERT OR IGNORE INTO visitors (visitor_hash) VALUES (?)').bind(hash).run();
      if(!user)setCookie=COOKIE+'='+browserId+'; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax'+(url.protocol==='https:'?'; Secure':'');
    }
    const row=await db.prepare('SELECT COUNT(*) AS total FROM visitors').first();
    const total=Number(row?.total);if(!Number.isSafeInteger(total)||total<0)throw new Error('Invalid total');
    return json({total,metric:'unique_visitors'},200,setCookie?{'Set-Cookie':setCookie}:{});
  }catch{
    // A missing migration or temporary storage failure must not become a fake 0.
    return json({error:'Counter unavailable'},503);
  }
}
