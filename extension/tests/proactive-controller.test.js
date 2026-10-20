import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduceState} from '../core/index.js';
import {createBackup} from '../core/backup.js';
import {createController} from '../controller.js';
const topic=(id)=>({id,topic:id,domain:'Nature',description:`About ${id}`});
const catalog=['Gardening','Botany','Ecology'].map(topic);
export function rig({fetchImpl,openTab}={}){
 let state=createState();const requests=[],opened=[];
 const controller=createController({catalog,readState:async()=>state,writeState:async s=>{state=s;},hasHistoryPermission:async()=>true,hasEndpointPermission:async()=>true,historySearch:async()=>[],openTab:openTab|| (async url=>opened.push(url)),fetchImpl:fetchImpl|| (async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({recommendations:[{...catalog[1],nearest_interest:'Gardening'}]}));})});
 return {controller,requests,opened};
}
test('proactive preference defaults off, migrates off, resets off, and is not portable',()=>{
 const initial=createState();assert.equal(initial.settings.proactiveEnabled,false);
 delete initial.settings.proactiveEnabled;
 const migrated=reduceState(initial,{type:'PRUNE'});assert.equal(migrated.settings.proactiveEnabled,false);
 const enabled=reduceState(migrated,{type:'SET_SETTINGS',patch:{proactiveEnabled:true}});
 assert.equal(enabled.settings.proactiveEnabled,true);assert.equal(enabled.generation,migrated.generation);
 assert.equal(reduceState(enabled,{type:'RESET'}).settings.proactiveEnabled,false);
 assert.equal('proactiveEnabled' in createBackup(enabled).data.preferences,false);
});
test('proactive generation uses all saved interests without changing Discover or its errors',async()=>{
 const r=rig(),c=r.controller;
 await c.dispatch({type:'ADD_INTEREST',topic:catalog[0]});await c.dispatch({type:'ADD_INTEREST',topic:catalog[2]});
 await c.dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:true}});
 const before=await c.getState();
 const result=await c.getProactiveRecommendations({});
 assert.deepEqual(r.requests[0].body.keywords,['Gardening','Ecology']);assert.equal(r.requests[0].body.mode,'global');
 assert.equal(result.items[0].topic,'Botany');assert.match(result.profileKey,/^[a-f0-9]{64}$/);
 assert.deepEqual(await c.getState(),before);
 await c.openProactiveRecommendation({item:result.items[0],profileKey:result.profileKey,provider:'youtube'});
 assert.deepEqual(r.opened,['https://www.youtube.com/results?search_query=Botany']);
 const after=await c.getState();assert.equal(after.explored[0].id,'Botany');assert.equal(after.explorationPrompts.length,1);assert.deepEqual(after.approved,before.approved);
 await c.dispatch({type:'REMOVE_INTEREST',id:'Gardening'});
 await assert.rejects(c.openProactiveRecommendation({item:result.items[0],profileKey:result.profileKey,provider:'google'}),/changed|unavailable/i);
});
test('removing an interest aborts pending proactive work and rejects its stale response',async()=>{
 let release,started;const began=new Promise(r=>started=r);let signal;
 const r=rig({fetchImpl:async(_url,options)=>{signal=options.signal;started();await new Promise(r=>release=r);return new Response(JSON.stringify({recommendations:[catalog[1]]}));}}),c=r.controller;
 await c.dispatch({type:'ADD_INTEREST',topic:catalog[0]});await c.dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:true}});
 const pending=c.getProactiveRecommendations({});await began;
 await c.dispatch({type:'REMOVE_INTEREST',id:'Gardening'});assert.equal(signal.aborted,true);release();await assert.rejects(pending,/changed/i);
 assert.equal((await c.getState()).lastError,null);
});
test('specific proactive requests have independent exposures and never overwrite Discover context',async()=>{
 let body;const r=rig({fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({recommendations:[],seed:body.seed,graph_sha256:'a'.repeat(64)}));}}),c=r.controller;
 await c.dispatch({type:'ADD_INTEREST',topic:catalog[0]});await c.dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:true,recommendationKind:'specific'}});
 const before=await c.getState();await c.getProactiveRecommendations({});assert.deepEqual(body.exposures,{});assert.deepEqual((await c.getState()).discovery,before.discovery);
});
