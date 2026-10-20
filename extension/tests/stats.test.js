import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeStats} from '../core/stats.js';
import {createState,reduceState} from '../core/index.js';
const at = date => Date.parse(date);
const now = at('2026-10-15T18:00:00Z');
const topic = (id,domain='Science') => ({id,topic:id,domain,description:''});
const event = (id,date,domain) => ({...topic(id,domain),at:at(date),parentId:null});
test('activity counts daily unique topics, includes inactive days, and retains yesterday streak',()=>{
 const state={settings:{statsFollowSystemTimeZone:false,statsTimeZone:'UTC'},explored:[event('A','2026-10-13T12:00Z'),event('A','2026-10-13T13:00Z'),event('B','2026-10-14T12:00Z'),event('A','2026-10-14T13:00Z'),event('future','2026-10-16T12:00Z'),{id:'invalid',at:NaN}],stats:{timeZone:'UTC'}};
 const summary=summarizeStats(state,{now,period:7});
 assert.equal(summary.total,2); assert.equal(summary.activeDays,2); assert.equal(summary.dailyAverage,3/7);
 assert.equal(summary.streak,2);assert.equal(summary.longestStreak,2);assert.equal(summary.calendar.length,7);
 assert.equal(summary.calendar.at(-1).count,0); assert.equal(summary.calendar.at(-2).count,2);
});
test('growth freezes all saved interests before first exploration and ignores repeated or old topics',()=>{
 let state=createState(now-1000);
 for(const id of ['A','B'])state=reduceState(state,{type:'ADD_INTEREST',topic:topic(id)},now-500);
 state=reduceState(state,{type:'EXPLORE',topic:topic('C')},now);
 assert.equal(summarizeStats(state,{now}).growth.percent,50);
 state=reduceState(state,{type:'REMOVE_INTEREST',id:'A'},now);
 state=reduceState(state,{type:'EXPLORE',topic:topic('C')},now);
 assert.equal(summarizeStats(state,{now}).growth.percent,50);
 assert.equal(state.stats.baselineIds.length,2);
 const reset=reduceState(state,{type:'RESET'},now);
 assert.equal(reset.stats,null); assert.equal(summarizeStats(reset,{now}).total,0);
});
test('legacy migration excludes historical discoveries and suppresses historical celebrations',()=>{
 let state=createState(now);delete state.stats;
 state.approved=[{...topic('A'),addedAt:now-1000}];state.explored=[event('B','2026-10-13T12:00Z')];
 state=reduceState(state,{type:'PRUNE'},now);
 assert.equal(state.stats.startedAt,now);assert.deepEqual(summarizeStats(state,{now}).pending,[]);
 state=reduceState(state,{type:'EXPLORE',topic:topic('B')},now+1);
 assert.equal(summarizeStats(state,{now:now+1}).growth.count,0);
 state=reduceState(state,{type:'EXPLORE',topic:topic('C')},now+2);
 assert.equal(summarizeStats(state,{now:now+2}).growth.percent,100);
 const empty=reduceState(createState(now),{type:'EXPLORE',topic:topic('X')},now);
 assert.equal(summarizeStats(empty,{now}).growth.percent,null);
});
test('calendar arithmetic survives DST, leap day, year boundaries and reporting timezone changes',()=>{
 for(const dates of [['2026-03-07T19:00Z','2026-03-08T19:00Z','2026-03-09T19:00Z'],['2024-02-28T19:00Z','2024-02-29T19:00Z','2024-03-01T19:00Z'],['2025-12-30T19:00Z','2025-12-31T19:00Z','2026-01-01T19:00Z']]){
  const state={settings:{statsFollowSystemTimeZone:false,statsTimeZone:'America/Chicago'},stats:{timeZone:'America/Chicago'},explored:dates.map(date=>event('A',date))};
  assert.equal(summarizeStats(state,{now:at(dates.at(-1))}).streak,3);
  assert.equal(summarizeStats(state,{now:at(dates.at(-1))+2*86400000}).streak,0);
 }
 const state={settings:{statsFollowSystemTimeZone:false,statsTimeZone:'America/Chicago'},stats:{timeZone:'America/Chicago'},explored:[event('A','2026-10-15T02:00Z')]};
 assert.equal(summarizeStats(state,{now}).calendar.at(-2).count,1);
});
test('milestones are claimed only once and stale claims cannot affect a reset profile',()=>{
 let state=reduceState(createState(now),{type:'EXPLORE',topic:topic('A')},now);
 assert.deepEqual(summarizeStats(state,{now}).pending,['first-1']);
 const claim={type:'CLAIM_STATS',salt:state.salt,startedAt:state.stats.startedAt,ids:['first-1','breadth-100']};
 state=reduceState(state,claim,now);assert.deepEqual(summarizeStats(state,{now}).pending,[]);
 assert.deepEqual(state.stats.acknowledged,['first-1']);
 const reset=reduceState(state,{type:'RESET'},now);
 assert.equal(reduceState(reset,claim,now).stats,null);
});
