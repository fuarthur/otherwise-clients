import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduceState,buildRequest} from '../core/index.js';
import {summarizeStats} from '../core/stats.js';
import {createController} from '../controller.js';

const now=Date.parse('2026-10-15T18:00Z');
test('new and existing profiles follow the system timezone and regroup history when it changes',()=>{
 const previous=process.env.TZ;
 try {
  process.env.TZ='America/Chicago';
  let state=reduceState(createState(now),{type:'ADD_INTEREST',topic:'Seed'},now-86400000);
  assert.equal(state.settings.statsFollowSystemTimeZone,true);
  state=reduceState(state,{type:'EXPLORE',topic:'A'},Date.parse('2026-10-14T23:00Z'));
  state=reduceState(state,{type:'EXPLORE',topic:'B'},Date.parse('2026-10-15T01:00Z'));
  assert.equal(summarizeStats(state,{now}).activeDays,1);
  const original=structuredClone(state.stats);
  process.env.TZ='UTC';
  assert.equal(summarizeStats(state,{now}).timeZone,'UTC');
  assert.equal(summarizeStats(state,{now}).activeDays,2);
  assert.equal(summarizeStats(state,{now}).streak,2);
  delete state.settings.statsFollowSystemTimeZone;
  delete state.settings.statsTimeZone;
  state=reduceState(state,{type:'PRUNE'},now);
  assert.equal(state.settings.statsFollowSystemTimeZone,true);
  assert.equal(summarizeStats(state,{now}).total,2);
  assert.equal(summarizeStats(state,{now}).growth.percent,200);
  assert.equal(state.stats.startedAt,original.startedAt);
  assert.deepEqual(state.stats.baselineIds,original.baselineIds);
  state=reduceState(state,{type:'SET_SETTINGS',patch:{statsFollowSystemTimeZone:false}},now);
  assert.equal(state.settings.statsTimeZone,'UTC');
  process.env.TZ='Asia/Shanghai';
  assert.equal(summarizeStats(state,{now}).timeZone,'UTC');
 } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('timezone regrouping acknowledges historical milestones without replaying celebrations',async()=>{
 const previous=process.env.TZ;
 try {
  process.env.TZ='America/Chicago';
  let stored=createState(now);
  for(const [i,date] of ['2026-10-13T23:00Z','2026-10-14T01:00Z','2026-10-15T01:00Z'].entries())stored=reduceState(stored,{type:'EXPLORE',topic:`Topic ${i}`},Date.parse(date));
  stored=reduceState(stored,{type:'CLAIM_STATS',salt:stored.salt,startedAt:stored.stats.startedAt,ids:['first-1']},now);
  const controller=createController({catalog:[],clock:()=>now,readState:async()=>stored,writeState:async value=>{stored=value;}});
  await controller.getState();
  process.env.TZ='UTC';
  const response=await controller.dispatch({type:'CLAIM_STATS',salt:stored.salt,startedAt:stored.stats.startedAt,ids:['streak-3']});
  assert.equal(summarizeStats(response,{now}).longestStreak,3);
  assert.deepEqual(response.statsCelebration,[]);
  assert.deepEqual(summarizeStats(await controller.getState(),{now}).pending,[]);
  assert.ok(stored.stats.acknowledged.includes('streak-3'));
  await controller.dispatch({type:'SET_SETTINGS',patch:{statsFollowSystemTimeZone:false,statsTimeZone:'America/Chicago'}});
  assert.ok(stored.stats.acknowledged.includes('streak-3'));
  await controller.dispatch({type:'SET_SETTINGS',patch:{statsTimeZone:'UTC'}});
  assert.deepEqual(summarizeStats(stored,{now}).pending,[]);
 } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('manual timezone persists through the controller without changing requests or growth',async()=>{
 let stored=createState(now);
 const controller=createController({catalog:[],clock:()=>now,readState:async()=>stored,writeState:async value=>{stored=value;}});
 await controller.dispatch({type:'ADD_INTEREST',topic:'Seed'});
 stored=reduceState(await controller.getState(),{type:'EXPLORE',topic:'A'},Date.parse('2026-10-15T01:00Z'));
 const reopened=createController({catalog:[],clock:()=>now,readState:async()=>stored,writeState:async value=>{stored=value;}});
 const before=await reopened.getState();
 const next=await reopened.dispatch({type:'SET_SETTINGS',patch:{statsFollowSystemTimeZone:false,statsTimeZone:'America/Chicago'}});
 assert.equal(next.settings.statsTimeZone,'America/Chicago');
 assert.equal(next.settings.statsFollowSystemTimeZone,false);
 assert.equal(summarizeStats(next,{now}).calendar.at(-2).count,1);
 assert.deepEqual(buildRequest(next),buildRequest(before));
 assert.equal(next.generation,before.generation);
 assert.deepEqual(summarizeStats(next,{now}).growth,summarizeStats(before,{now}).growth);
 const another=createController({catalog:[],clock:()=>now,readState:async()=>stored,writeState:async value=>{stored=value;}});
 assert.equal(summarizeStats(await another.getState(),{now}).timeZone,'America/Chicago');
 for(const statsTimeZone of ['Mars/Unknown','',null,7]){
  const invalid=await another.dispatch({type:'SET_SETTINGS',patch:{statsTimeZone}});
  assert.equal(invalid.settings.statsTimeZone,'America/Chicago');
  assert.ok(invalid.lastError);
 }
});
