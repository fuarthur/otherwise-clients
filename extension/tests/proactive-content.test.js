import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createProactiveCoordinator} from '../proactive/coordinator.js';
const source=readFileSync(new URL('../proactive/content.js',import.meta.url),'utf8');
class Element {
 constructor(){this.isConnected=true;this.style={};this.dataset={};this.children=[];}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(){}
 addEventListener(){}
 attachShadow(){return new Element();}
 remove(){this.isConnected=false;}
 getClientRects(){return [1];}
 after(node){node.previousElementSibling=this;}
}
function page(sendMessage){
 const jobs=new Map(),handlers={},messages=[];let requestCount=0,connections=0,nextJob=1;
 const anchor=new Element();
 const ctx={location:{origin:'https://www.google.com',pathname:'/search',search:'?q=a'},document:{visibilityState:'visible',documentElement:{},createElement:()=>new Element(),querySelector:()=>anchor,addEventListener:(name,fn)=>{handlers[name]=fn;}},getComputedStyle:()=>({visibility:'visible'}),MutationObserver:class{observe(){}},window:{addEventListener(){}},setTimeout:(fn,ms)=>{const id=nextJob++;jobs.set(id,{fn,ms});return id;},clearTimeout:id=>jobs.delete(id),chrome:{runtime:{sendMessage:message=>{requestCount++;return sendMessage?sendMessage(message):new Promise(r=>messages.push(r));},connect:()=>{connections++;return {onMessage:{addListener(fn){queueMicrotask(()=>fn({type:'ready'}));}},onDisconnect:{addListener(){}},disconnect(){}};}}}};
 vm.runInNewContext(source,ctx);
 return {handlers,messages,requests:()=>requestCount,connections:()=>connections,jobs,
  visibility(value){ctx.document.visibilityState=value;handlers.visibilitychange();},
  check:()=>{const entry=[...jobs].find(([,v])=>v.ms===120);assert.ok(entry,'a content check should be scheduled');jobs.delete(entry[0]);return entry[1].fn();}};
}
test('same-route navigation during a pending request schedules another check without needing a DOM mutation',async()=>{
 const p=page(),first=p.check();await new Promise(r=>setImmediate(r));
 p.handlers['yt-navigate-finish']();await p.check();
 p.messages.shift()({enabled:false,cards:[]});await first;
 const second=p.check();await new Promise(r=>setImmediate(r));assert.equal(p.requests(),2);
 p.messages.shift()({enabled:false,cards:[]});await second;
});
test('enabled empty recommendations still establish a change subscription',async()=>{
 const p=page(),first=p.check();await new Promise(r=>setImmediate(r));p.messages.shift()({enabled:true,cards:[]});await first;assert.equal(p.connections(),1);
});

test('returning to a results tab reuses fresh cards and replaces expired cards with usable recommendations',async()=>{
 let now=1000000,backendCalls=0,reply;
 const opened=[],sender={id:'review',frameId:0,url:'https://www.google.com/search?q=a',tab:{id:1,incognito:false}};
 const chrome={runtime:{id:'review'},tabs:{},permissions:{contains:async()=>true},storage:{session:{setAccessLevel:async()=>{},get:async()=>({}),set:async()=>{}}}};
 const controller={getState:async()=>({settings:{proactiveEnabled:true,language:'en'}}),getProactiveProfileKey:async()=>'profile',
  getProactiveRecommendations:async()=>{backendCalls++;return {profileKey:'profile',items:[{topic:`Topic ${backendCalls}`,description:'A recommendation.'}]};},
  openProactiveRecommendation:async({item})=>opened.push(item.topic)};
 const coordinator=createProactiveCoordinator({chrome,controller,clock:()=>now});await coordinator.reconcile();
 const p=page(async message=>{reply=await coordinator.handle(message,sender);return reply;});
 await p.check();const original=reply;assert.equal(backendCalls,1);assert.equal(original.cards[0].topic,'Topic 1');
 p.visibility('hidden');await p.check();assert.equal(p.requests(),1);
 now+=60000;p.visibility('visible');await p.check();
 assert.equal(p.requests(),2,'a visible return revalidates the issued cards');
 assert.equal(backendCalls,1,'an unexpired batch is reused');assert.equal(reply.batchId,original.batchId);
 p.visibility('hidden');await p.check();now+=31*60000;
 p.visibility('visible');await p.check();
 assert.equal(backendCalls,2);assert.notEqual(reply.batchId,original.batchId);
 await coordinator.handle({type:'PROACTIVE_OPEN',batchId:reply.batchId,cardId:reply.cards[0].cardId},sender);
 assert.deepEqual(opened,['Topic 2']);
});
