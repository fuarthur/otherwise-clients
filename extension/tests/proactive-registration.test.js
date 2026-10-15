import test from 'node:test';
import assert from 'node:assert/strict';
import {createProactiveRegistration} from '../proactive/registration.js';
import {getProactiveSite} from '../proactive/sites.js';
test('only exact supported HTTPS results pages are eligible',()=>{
 assert.equal(getProactiveSite('https://www.google.com/search?q=secret'),'google');
 assert.equal(getProactiveSite('https://www.youtube.com/results?search_query=secret'),'youtube');
 for(const url of ['https://www.google.com/','https://www.youtube.com/watch?v=a','https://www.google.com.evil.test/search','http://www.google.com/search','https://www.google.com:444/search'])assert.equal(getProactiveSite(url),null);
});
test('registration stays off by default and reconciles grants, disable, and revocation',async()=>{
 let enabled=false,granted=false,registered=[],injections=0;
 const chrome={permissions:{contains:async()=>granted},scripting:{getRegisteredContentScripts:async()=>registered,unregisterContentScripts:async()=>{registered=[];},registerContentScripts:async scripts=>{registered=scripts;},executeScript:async()=>{injections++;}},tabs:{query:async()=>[{id:1}]}};
 const registration=createProactiveRegistration({chrome,getState:async()=>({settings:{proactiveEnabled:enabled}}),disable:async()=>{enabled=false;},invalidate:()=>{}});
 await registration.reconcile();assert.equal(registered.length,0);
 enabled=true;await registration.reconcile();assert.equal(enabled,false);assert.equal(registered.length,0);
 enabled=true;granted=true;await registration.reconcile();assert.equal(registered.length,1);assert.equal(injections,1);
 assert.deepEqual(registered[0].matches,['https://www.google.com/*','https://www.youtube.com/*']);
 await registration.reconcile();assert.equal(injections,1);
 granted=false;await registration.reconcile();assert.equal(enabled,false);assert.equal(registered.length,0);
});
test('bridge requests only supported site access before enabling; denial never sends the setting',async()=>{
 let granted=false;const requests=[],messages=[];
 const previousChrome=globalThis.chrome,previousLocation=globalThis.location;
 globalThis.location={search:''};
 globalThis.chrome={runtime:{id:'test',sendMessage:async message=>{messages.push(message);return {state:{}};}},permissions:{request:async request=>{requests.push(request);return granted;}}};
 try{
  const bridge=await import('../bridge.js?proactive-permissions');
  await assert.rejects(bridge.dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:true}}),/access|enabled/i);
  assert.equal(messages.length,0);assert.deepEqual(requests[0],{origins:['https://www.google.com/*','https://www.youtube.com/*']});
  granted=true;await bridge.dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:true}});assert.equal(messages.length,1);
 }finally{globalThis.chrome=previousChrome;globalThis.location=previousLocation;}
});
test('disable wins when registration is still in flight',async()=>{
 let enabled=true,registered=[],release,started;const began=new Promise(r=>started=r);
 const chrome={permissions:{contains:async()=>true},scripting:{getRegisteredContentScripts:async()=>registered,registerContentScripts:async rows=>{started();await new Promise(r=>release=r);registered=rows;},unregisterContentScripts:async()=>{registered=[];},executeScript:async()=>assert.fail('must not inject after disable')},tabs:{query:async()=>[{id:1}]}};
 const registration=createProactiveRegistration({chrome,getState:async()=>({settings:{proactiveEnabled:enabled}}),disable:async()=>{},invalidate:()=>{}});
 const first=registration.reconcile();await began;enabled=false;const second=registration.reconcile();release();await Promise.all([first,second]);assert.deepEqual(registered,[]);
});
