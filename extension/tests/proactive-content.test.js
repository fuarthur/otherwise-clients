import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../proactive/content.js',import.meta.url),'utf8');
function page(){
 const jobs=new Map(),handlers={},messages=[];let requestCount=0,connections=0,nextJob=1;
 const ctx={location:{origin:'https://www.google.com',pathname:'/search',search:'?q=a'},document:{visibilityState:'visible',documentElement:{},querySelector:()=>({isConnected:true,getClientRects:()=>[1]}),addEventListener:(name,fn)=>{handlers[name]=fn;}},getComputedStyle:()=>({visibility:'visible'}),MutationObserver:class{observe(){}},window:{addEventListener(){}},setTimeout:(fn,ms)=>{const id=nextJob++;jobs.set(id,{fn,ms});return id;},clearTimeout:id=>jobs.delete(id),chrome:{runtime:{sendMessage:()=>{requestCount++;return new Promise(r=>messages.push(r));},connect:()=>{connections++;return {onMessage:{addListener(fn){queueMicrotask(()=>fn({type:'ready'}));}},onDisconnect:{addListener(){}},disconnect(){}};}}}};
 vm.runInNewContext(source,ctx);
 return {handlers,messages,requests:()=>requestCount,connections:()=>connections,jobs,
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
