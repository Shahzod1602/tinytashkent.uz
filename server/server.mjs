import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {realpathSync} from 'node:fs';
import {openVisitorStore} from './store.mjs';
import {handleVisitorRequest} from './visitor-service.mjs';

export function createVisitorServer({databasePath,allowedHosts}){
  const db=openVisitorStore(databasePath),hosts=new Set(allowedHosts);
  const server=createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:10000},async(req,res)=>{
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
    try{
      const host=req.headers.host||'';
      if(!hosts.has(host))return json(421,{error:'Unknown host'});
      const protocol=req.headers['x-forwarded-proto']==='https'?'https':'http';
      const url=new URL(req.url,protocol+'://'+host);
      if(url.pathname==='/healthz'&&req.method==='GET'){
        await db.prepare('SELECT COUNT(*) AS total FROM visitors').first();
        return json(200,{status:'ok'});
      }
      if(url.pathname!=='/api/visitors')return json(404,{error:'Not found'});
      let body;
      if(req.method==='POST'){
        if(Number(req.headers['content-length'])>256){req.resume();return json(413,{error:'Request too large'});}
        const chunks=[];let length=0;
        for await(const chunk of req){
          length+=chunk.length;
          if(length>256){json(413,{error:'Request too large'});return;}
          chunks.push(chunk);
        }
        body=Buffer.concat(chunks);
      }
      const headers=new Headers();
      // On this public VPS there is no trusted ChatGPT identity gateway.
      // Never forward client-supplied account/authentication headers.
      for(const name of ['origin','content-type','sec-fetch-site','cookie'])if(req.headers[name])headers.set(name,req.headers[name]);
      const request=new Request(url,{method:req.method,headers,...(body?{body}:{})});
      const response=await handleVisitorRequest(request,db);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){
      console.error('Visitor request failed:',error.name);
      if(!res.headersSent)json(503,{error:'Counter unavailable'});else res.end();
    }
  });
  server.keepAliveTimeout=5000;
  server.on('close',()=>db.close());
  return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href){
  const server=createVisitorServer({databasePath:process.env.DATABASE_PATH||'/var/lib/tiny-tashkent/visitors.sqlite',allowedHosts:(process.env.ALLOWED_HOSTS||'tinytashkent.uz,www.tinytashkent.uz').split(',')});
  server.listen(Number(process.env.PORT||3040),'127.0.0.1',()=>console.log('Tiny Tashkent counter listening on loopback'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),8000).unref();});
}
