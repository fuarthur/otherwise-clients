import test from 'node:test';
import assert from 'node:assert/strict';

const event=()=>{const listeners=new Set();return {addListener:listener=>listeners.add(listener),emit:(...args)=>[...listeners].map(listener=>listener(...args))};};

test('only trusted pages can check the saved connection and endpoint permission changes clear window results',async()=>{
  let stored;const requests=[],id='a'.repeat(32),base=`chrome-extension://${id}/`;
  const runtime={id,getURL:path=>base+path,onMessage:event(),onConnect:event(),onInstalled:event(),onStartup:event()};
  const permissions={onAdded:event(),onRemoved:event(),contains:async()=>true};
  globalThis.chrome={runtime,permissions,
    storage:{local:{setAccessLevel:async()=>{},get:async()=>({state:stored}),set:async value=>{stored=value.state;}}},
    tabs:{create:async()=>{}},sidePanel:{setPanelBehavior:async()=>{}},alarms:{onAlarm:event(),create:async()=>{}},
  };
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    if(String(url).endsWith('catalog.json'))return new Response('[]');
    requests.push({url,options});
    return new Response(JSON.stringify({schema_version:1,service:'otherwise',ready:true,discovery_ready:false}),{headers:{'Content-Type':'application/json'}});
  };
  try{
    await import(`../background.js?connection=${Date.now()}`);
    const send=(message,sender={id,url:base+'dashboard.html'})=>new Promise(resolve=>runtime.onMessage.emit(message,sender,resolve));
    await send({type:'GET_STATE'});assert.equal(requests.length,0);
    const checked=await send({type:'CHECK_CONNECTION'});
    assert.deepEqual(checked,{result:{status:'discovery_unavailable',ready:true,discovery_ready:false}});
    assert.equal(requests[0].url,'http://127.0.0.1:8000/api/status');assert.equal(requests[0].options.body,undefined);
    for(const sender of [{id:'foreign',url:base+'dashboard.html'},{id,url:'https://foreign.example'},
      {id,url:base+'dashboard.html',tab:{incognito:true}}]){
      assert.ok((await send({type:'CHECK_CONNECTION'},sender)).error);
    }
    for(const extra of [{endpoint:'https://untrusted.example'},{accessToken:'private'},{history:['private']}]){
      assert.ok((await send({type:'CHECK_CONNECTION',...extra})).error);
    }
    assert.equal(requests.length,1);
    const port={name:'otherwise-focus',sender:{id,url:base+'dashboard.html'},onMessage:event(),onDisconnect:event(),posted:[],
      postMessage(message){this.posted.push(message);},disconnect(){this.onDisconnect.emit();}};
    runtime.onConnect.emit(port);await send({type:'GET_STATE'});
    await send({type:'ACTION',action:{type:'SET_SETTINGS',patch:{accessToken:'new-token'}}});
    assert.equal(port.posted.filter(message=>message.type==='connection-invalidated').length,1);
    permissions.onAdded.emit({origins:['http://127.0.0.1:8000/*']});await send({type:'GET_STATE'});
    assert.equal(port.posted.filter(message=>message.type==='connection-invalidated').length,2);
    permissions.onRemoved.emit({origins:['http://127.0.0.1:8000/*']});await send({type:'GET_STATE'});
    assert.equal(port.posted.filter(message=>message.type==='connection-invalidated').length,3);
    port.disconnect();await send({type:'ACTION',action:{type:'RESET'}});
    assert.equal(port.posted.filter(message=>message.type==='connection-invalidated').length,3);
    assert.equal(requests.length,1);
  }finally{globalThis.fetch=originalFetch;delete globalThis.chrome;}
});
