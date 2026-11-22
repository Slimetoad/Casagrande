import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';

// Workerd itself handles outbound fetch. The provider worker is local and is
// the only outbound destination; no provider or student data is contacted.
test('workerd: requestRemote recibe 200 y rechaza 302 sin seguirlo',async()=>{
  const providers=await readFile(new URL('../src/providers.js',import.meta.url),'utf8');
  const entry=`${providers}\nexport default {async fetch(request){
    const redirect=new URL(request.url).pathname==='/redirect';
    try {const response=await requestRemote('https://proveedor.example/'+(redirect?'redirect':'ok'),{method:'GET',redirect:'follow'},'Prueba');
      return Response.json({status:response.status,text:await response.text()});
    } catch(error){return Response.json({status:error.status,remoteStatus:error.remoteStatus});}
  }};`;
  const mock=`export default {async fetch(request){
    const path=new URL(request.url).pathname;
    if(path==='/redirect')return new Response(null,{status:302,headers:{Location:'https://proveedor.example/followed'}});
    return new Response(path==='/followed'?'SEGUIR REDIRECCIÓN':'confirmado',{status:200});
  }};`;
  const mf=new Miniflare({workers:[
    {name:'principal',modules:true,compatibilityDate:'2026-01-01',script:entry,outboundService:'proveedor'},
    {name:'proveedor',modules:true,compatibilityDate:'2026-01-01',script:mock}
  ]});
  try {
    const ok=await (await mf.dispatchFetch('http://worker.test/ok')).json();
    assert.deepEqual(ok,{status:200,text:'confirmado'});
    const redirect=await (await mf.dispatchFetch('http://worker.test/redirect')).json();
    assert.deepEqual(redirect,{status:503,remoteStatus:302});
  } finally {await mf.dispose()}
});
