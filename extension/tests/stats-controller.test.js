import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../controller.js';
import {createState} from '../core/index.js';
import {summarizeStats} from '../core/stats.js';
const now=Date.parse('2026-10-15T18:00Z');
const catalog=['A','B'].map(id=>({id,topic:id,domain:'Science',description:''}));
function rig(fail=false){
 let stored=createState(now);
 const c=createController({catalog,clock:()=>now,readState:async()=>stored,writeState:async s=>{stored=s;},openTab:async()=>{if(fail)throw Error('blocked');},hasEndpointPermission:async()=>true});
 return {c,stored:()=>stored};
}
test('successful searches share growth and only one of two simultaneous clients claims the reward',async()=>{
 const {c,stored}=rig();await c.dispatch({type:'ADD_INTEREST',topic:catalog[0]});
 await c.search(catalog[1]);const before=await c.getState();
 const action={type:'CLAIM_STATS',salt:before.salt,startedAt:before.stats.startedAt,ids:['first-1']};
 const responses=await Promise.all([c.dispatch(action),c.dispatch(action)]);
 assert.deepEqual(responses.map(row=>row.statsCelebration.length).sort(),[0,1]);
 assert.equal(Object.hasOwn(stored(),'statsCelebration'),false);
 assert.equal(summarizeStats(await c.getState(),{now}).growth.percent,100);
});
test('failed search never starts tracking or earns exploration rewards',async()=>{
 const {c}=rig(true);await assert.rejects(c.search(catalog[0]));
 const state=await c.getState();assert.equal(state.stats,null);assert.equal(summarizeStats(state,{now}).total,0);
});
test('Discover, Map and proactive exploration share the same distinct-topic counters',async()=>{
 const {proactiveProfileKey}=await import('../proactive/recommendations.js');
 const {c}=rig();await c.dispatch({type:'ADD_INTEREST',topic:catalog[0]});
 await c.search(catalog[1]);await c.search(catalog[0],'google',{source:'galaxy'});
 await c.dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:true}});
 await c.openProactiveRecommendation({item:catalog[1],profileKey:await proactiveProfileKey(await c.getState()),provider:'youtube'});
 const state=await c.getState(),s=summarizeStats(state,{now});
 assert.equal(state.explored.length,3);assert.equal(s.total,2);assert.equal(s.calendar.at(-1).count,2);
 assert.equal(s.growth.percent,100);assert.equal(state.approved.length,1);
});
