import test from 'node:test';
import assert from 'node:assert/strict';

const event=()=>{const listeners=new Set();return {addListener:listener=>listeners.add(listener),emit:(...args)=>[...listeners].map(listener=>listener(...args))};};

test('bridge checks contain no caller settings and preserve only result envelopes',async()=>{
  globalThis.location={search:''};let reply={result:{status:'ready',ready:true,discovery_ready:true}};const sent=[];
  globalThis.chrome={runtime:{id:'a'.repeat(32),sendMessage:async message=>{sent.push(message);return reply;}}};
  try{
    const bridge=await import(`../bridge.js?connection-envelope=${Date.now()}`);
    assert.deepEqual(await bridge.checkConnection({endpoint:'https://untrusted.example',accessToken:'private'}),reply.result);
    assert.deepEqual(sent,[{type:'CHECK_CONNECTION'}]);
    reply={error:'This request is not permitted.'};await assert.rejects(bridge.checkConnection(),/not permitted/);
    reply={state:{}};await assert.rejects(bridge.checkConnection(),/reconnecting/);
  }finally{delete globalThis.chrome;delete globalThis.location;}
});

test('connection invalidation is independent of Focus and reconnects without probing',async()=>{
  const ports=[],sent=[];globalThis.location={search:''};
  globalThis.chrome={runtime:{id:'a'.repeat(32),connect:()=>{const port={onMessage:event(),onDisconnect:event()};ports.push(port);return port;},
    sendMessage:async message=>{sent.push(message);return {result:{status:'warming',ready:false,discovery_ready:false}};}}};
  try{
    const bridge=await import(`../bridge.js?connection-events=${Date.now()}`);
    let connectionCount=0,focusCount=0;
    const off=bridge.subscribeConnectionInvalidation(()=>connectionCount++);
    const offFocus=bridge.subscribeFocusInvalidation(()=>focusCount++);
    assert.equal(sent.length,0);
    ports[0].onMessage.emit({type:'connection-invalidated'});
    assert.equal(connectionCount,1);assert.equal(focusCount,0);
    ports[0].onMessage.emit({type:'invalidated'});assert.equal(connectionCount,1);
    ports[0].onDisconnect.emit();assert.equal(connectionCount,2);
    await bridge.checkConnection();assert.equal(ports.length,2);
    ports[1].onMessage.emit({type:'connection-invalidated'});assert.equal(connectionCount,3);
    off();offFocus();ports[1].onMessage.emit({type:'connection-invalidated'});assert.equal(connectionCount,3);
    assert.deepEqual(sent,[{type:'CHECK_CONNECTION'}]);
  }finally{delete globalThis.chrome;delete globalThis.location;}
});

test('offline preview explicitly reports connection unavailable without runtime or network calls',async()=>{
  globalThis.location={search:'?preview=1'};const originalFetch=globalThis.fetch;let fetches=0;
  globalThis.fetch=async()=>{fetches++;throw new Error('Preview must not probe a real service.');};
  try{
    const bridge=await import(`../bridge.js?connection-preview=${Date.now()}`);
    assert.deepEqual(await bridge.checkConnection(),{status:'preview_unavailable'});
    assert.equal(fetches,0);
  }finally{delete globalThis.location;globalThis.fetch=originalFetch;}
});
