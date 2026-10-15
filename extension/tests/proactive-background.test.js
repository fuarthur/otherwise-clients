import test from 'node:test';
import assert from 'node:assert/strict';
import {createProactiveCoordinator} from '../proactive/coordinator.js';
import {createController} from '../controller.js';
import {createState} from '../core/index.js';
const topic=id=>({id,topic:id,description:`About ${id}`,domain:'Test'});
async function fixture(){
 let reply=null;
 let now=1000000,stored=createState(),session={},granted=true,calls=0;
 const opened=[];const id='a'.repeat(32),sender={id,frameId:0,url:'https://www.google.com/search?q=private-query',tab:{id:1,incognito:false}};
 const chrome={runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`},permissions:{contains:async()=>granted},storage:{session:{get:async()=>structuredClone(session),set:async value=>{session={...session,...structuredClone(value)};},setAccessLevel:async()=>{}}},tabs:{create:async({url})=>opened.push(url)}};
 const controller=createController({catalog:[],clock:()=>now,readState:async()=>stored,writeState:async s=>{stored=s;},hasHistoryPermission:async()=>false,hasEndpointPermission:async()=>true,historySearch:async()=>[],openTab:async url=>opened.push(url),fetchImpl:async(_url,options)=>{calls++;assert.ok(!options.body.includes('private-query'));if(reply)return reply();return new Response(JSON.stringify({recommendations:['Botany','Ecology','Forestry','Soil'].map(topic)}));}});
 await controller.dispatch({type:'ADD_INTEREST',topic:topic('Gardening')});await controller.dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:true}});
 const make=()=>createProactiveCoordinator({chrome,controller,clock:()=>now});
 return {coordinator:make(),controller,sender,chrome,make,opened,advance:n=>{now+=n;},calls:()=>calls,setReply:fn=>{reply=fn;},revoke:()=>{granted=false;}};
}
test('content receives only issued cards, deduplicated across tabs, with 30 minute cache',async()=>{
 const r=await fixture();const get={type:'PROACTIVE_GET'};
 const [a,b]=await Promise.all([r.coordinator.handle(get,r.sender),r.coordinator.handle(get,{...r.sender,tab:{id:2}})]);
 assert.equal(a.cards.length,3);assert.deepEqual(a.cards,b.cards);assert.equal(r.calls(),1);
 assert.deepEqual(Object.keys(a).sort(),['batchId','cards','enabled','language']);
 assert.deepEqual(Object.keys(a.cards[0]).sort(),['cardId','description','topic']);
 r.advance(29*60000);await r.coordinator.handle(get,r.sender);assert.equal(r.calls(),1);
 r.advance(60000);const fresh=await r.coordinator.handle(get,r.sender);assert.equal(r.calls(),2);assert.notEqual(fresh.batchId,a.batchId);
 await assert.rejects(r.coordinator.handle({type:'PROACTIVE_OPEN',batchId:a.batchId,cardId:a.cards[0].cardId},r.sender));
 await r.coordinator.handle({type:'PROACTIVE_OPEN',batchId:fresh.batchId,cardId:fresh.cards[0].cardId},r.sender);assert.equal(r.opened[0],'https://www.google.com/search?q=Botany');
});
test('forged messages are rejected and dismissal survives worker recreation until tab closure',async()=>{
 const r=await fixture(),get={type:'PROACTIVE_GET'};
 for(const sender of [{...r.sender,id:'foreign'},{...r.sender,frameId:1},{...r.sender,url:'https://evil.test/search'},{...r.sender,tab:{id:1,incognito:true}}])await assert.rejects(r.coordinator.handle(get,sender));
 for(const message of [{type:'GET_STATE'},{type:'PROACTIVE_GET',url:'https://evil.test'},{type:'PROACTIVE_OPEN',batchId:'x',cardId:'y',url:'https://evil.test'}])await assert.rejects(r.coordinator.handle(message,r.sender));
 await r.coordinator.handle(get,r.sender);await r.coordinator.handle({type:'PROACTIVE_DISMISS'},r.sender);
 const recreated=r.make();assert.deepEqual((await recreated.handle(get,r.sender)).cards,[]);assert.equal(r.calls(),1);
 await recreated.removeTab(1);assert.equal((await recreated.handle(get,r.sender)).cards.length,3);assert.equal(r.calls(),1);
 r.revoke();await assert.rejects(recreated.handle(get,r.sender));
});
test('installed background keeps trusted state private and handles enabled content through its narrow route',async()=>{
 const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},hasListener(fn){return this.listeners.includes(fn);},emit(...args){return this.listeners.map(fn=>fn(...args));}});
 let stored,registered=[],session={};const id='b'.repeat(32),base=`chrome-extension://${id}/`;
 const runtime={id,getURL:p=>base+p,onMessage:event(),onConnect:event(),onInstalled:event(),onStartup:event()};
 const originalChrome=globalThis.chrome,originalFetch=globalThis.fetch;
 globalThis.chrome={runtime,permissions:{contains:async()=>true,onAdded:event(),onRemoved:event()},storage:{onChanged:event(),local:{get:async()=>({state:stored}),setAccessLevel:async()=>{},set:async({state})=>{stored=state;}},session:{get:async()=>session,set:async s=>{session=s;},setAccessLevel:async()=>{}}},scripting:{getRegisteredContentScripts:async()=>registered,registerContentScripts:async s=>{registered=s;},unregisterContentScripts:async()=>{registered=[];},executeScript:async()=>{}},tabs:{create:async()=>{},query:async()=>[],onRemoved:event()},sidePanel:{setPanelBehavior:async()=>{}},alarms:{create:async()=>{},onAlarm:event()}};
 globalThis.fetch=async(url,options)=>options?new Response(JSON.stringify({recommendations:[topic('Botany')]})):new Response(JSON.stringify([topic('Gardening')]));
 try{
  await import('../background.js?proactive-integration');
  const own={id,url:base+'sidepanel.html'},external={id,url:'https://www.google.com/search?q=secret',frameId:0,tab:{id:1}};
  const send=(message,sender=own)=>new Promise(resolve=>runtime.onMessage.emit(message,sender,resolve));
  await send({type:'ACTION',action:{type:'ADD_INTEREST',topic:topic('Gardening')}});
  await send({type:'ACTION',action:{type:'SET_SETTINGS',patch:{proactiveEnabled:true}}});
  assert.ok((await send({type:'GET_STATE'},external)).error);
  const response=await send({type:'PROACTIVE_GET'},external);
  assert.equal(response.cards?.[0]?.topic,'Botany');assert.equal(response.state,undefined);
 }finally{globalThis.chrome=originalChrome;globalThis.fetch=originalFetch;}
});

test('service failures back off and permission revocation rejects a late response',async()=>{
 const r=await fixture();r.setReply(()=>new Response('busy',{status:503}));
 const get={type:'PROACTIVE_GET'};
 assert.deepEqual((await r.coordinator.handle(get,r.sender)).cards,[]);
 await r.coordinator.handle(get,r.sender);assert.equal(r.calls(),1);
 r.advance(60000);await r.coordinator.handle(get,r.sender);assert.equal(r.calls(),2);
 assert.equal((await r.controller.getState()).lastError,null);
 let release,started;const began=new Promise(resolve=>started=resolve);
 r.setReply(async()=>{started();await new Promise(resolve=>release=resolve);return new Response(JSON.stringify({recommendations:[topic('Botany')]}));});
 r.advance(60000);const pending=r.coordinator.handle(get,r.sender);await began;r.revoke();release();await assert.rejects(pending);
});
test('disabling removes cached eligibility and arbitrary cards cannot be opened from an unissued tab',async()=>{
 const r=await fixture(),get={type:'PROACTIVE_GET'};const cards=await r.coordinator.handle(get,r.sender);
 const open={type:'PROACTIVE_OPEN',batchId:cards.batchId,cardId:cards.cards[0].cardId};
 await assert.rejects(r.coordinator.handle(open,{...r.sender,tab:{id:99}}));
 await r.controller.dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:false}});await r.coordinator.reconcile();
 await assert.rejects(r.coordinator.handle(open,r.sender));await assert.rejects(r.coordinator.handle(get,r.sender));assert.equal(r.opened.length,0);
});
test('disable during issuance persistence never delivers stale cards',async()=>{
 const r=await fixture(),get={type:'PROACTIVE_GET'};
 await r.coordinator.handle(get,r.sender);
 let release,started;const began=new Promise(resolve=>started=resolve),original=r.chrome.storage.session.set;
 r.chrome.storage.session.set=async value=>{if(value.proactiveSession.cache?.issuedTabs.includes(2)){started();await new Promise(resolve=>release=resolve);}return original(value);};
 const pending=r.coordinator.handle(get,{...r.sender,tab:{id:2}});await began;
 await r.controller.dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:false}});await r.coordinator.reconcile();release();
 const outcome=await pending.catch(()=>null);assert.ok(!outcome?.enabled || !outcome.cards.length,'disabled profile must not return old cards');
});
test('enabled pages without interests still receive enabled status to subscribe for changes',async()=>{
 const r=await fixture();await r.controller.dispatch({type:'REMOVE_INTEREST',id:'Gardening'});
 const result=await r.coordinator.handle({type:'PROACTIVE_GET'},r.sender);assert.equal(result.enabled,true);assert.deepEqual(result.cards,[]);
});
