import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduceState} from '../core/index.js';
import {createBackup,restoreBackup,validateBackup} from '../core/backup.js';
import {summarizeStats} from '../core/stats.js';
const now=Date.parse('2026-10-15T18:00Z');
const add=(state,id,time=now)=>reduceState(state,{type:'ADD_INTEREST',topic:id},time);
const explore=(state,id,time=now)=>reduceState(state,{type:'EXPLORE',topic:id},time);
test('v3 roundtrip preserves growth and timezone, while v1/v2 establish honest legacy starting points',()=>{
 const state=explore(add(createState(now),'A'),'B');
 const backup=createBackup(state,now);assert.equal(backup.version,3);
 const restored=restoreBackup(createState(now),backup,'replace',now+1);
 assert.equal(summarizeStats(restored,{now:now+1}).growth.percent,100);
 assert.equal(restored.stats.timeZone,state.stats.timeZone);
 assert.deepEqual(summarizeStats(restored,{now:now+1}).pending,[]);
 for(const version of [1,2]){
  const legacy=structuredClone(backup);legacy.version=version;delete legacy.data.stats;
  if(version===1){delete legacy.data.interestGroups;delete legacy.data.recommendationGroupIds;}
  const next=restoreBackup(createState(now),legacy,'replace',now+1);
  assert.equal(summarizeStats(next,{now:now+1}).total,1);
  assert.equal(summarizeStats(next,{now:now+1}).growth.count,0);
 }
 const invalid=structuredClone(backup);invalid.data.stats.timeZone='Mars/Unknown';assert.throws(()=>validateBackup(invalid));
 invalid.data.stats=state.stats;invalid.data.stats.invented=1;assert.throws(()=>validateBackup(invalid));
});
test('merge keeps local growth but excludes imported discoveries, including later revisits',()=>{
 const local=explore(add(createState(now),'A'),'B');
 const incoming=explore(explore(add(createState(now),'X'),'B'),'C');
 let merged=restoreBackup(local,createBackup(incoming,now),'merge',now+10);
 assert.equal(summarizeStats(merged,{now:now+10}).growth.percent,100);
 assert.equal(summarizeStats(merged,{now:now+10}).total,2);
 merged=explore(merged,'C',now+11);
 assert.equal(summarizeStats(merged,{now:now+11}).growth.percent,100);
 const again=restoreBackup(merged,createBackup(incoming,now),'merge',now+12);
 assert.equal(again.explored.length,merged.explored.length);
 assert.deepEqual(summarizeStats(again,{now:now+12}).pending,[]);
});
test('merging older records cannot revoke a topic that already qualified locally',()=>{
 const local=explore(add(createState(now),'A'),'B',now+1000);
 const older=explore(add(createState(now-100000),'X',now-100000),'B',now-100000);
 const merged=restoreBackup(local,createBackup(older,now),'merge',now+2000);
 assert.equal(summarizeStats(merged,{now:now+2000}).growth.percent,100);
});
test('backup replacement restores timezone preferences, merge keeps local preferences, and older files default to automatic',()=>{
 const incoming=reduceState(explore(add(createState(now),'A'),'B'),{type:'SET_SETTINGS',patch:{statsFollowSystemTimeZone:false,statsTimeZone:'Asia/Shanghai'}},now);
 const local=reduceState(createState(now),{type:'SET_SETTINGS',patch:{statsFollowSystemTimeZone:false,statsTimeZone:'America/Chicago'}},now);
 const backup=createBackup(incoming,now);
 assert.equal(backup.data.preferences.statsFollowSystemTimeZone,false);
 assert.equal(backup.data.preferences.statsTimeZone,'Asia/Shanghai');
 assert.equal(summarizeStats(restoreBackup(local,backup,'replace',now),{now}).timeZone,'Asia/Shanghai');
 assert.equal(summarizeStats(restoreBackup(local,backup,'merge',now),{now}).timeZone,'America/Chicago');
 const older=structuredClone(backup);
 delete older.data.preferences.statsFollowSystemTimeZone;delete older.data.preferences.statsTimeZone;
 assert.equal(restoreBackup(local,older,'replace',now).settings.statsFollowSystemTimeZone,true);
 for(const patch of [{statsFollowSystemTimeZone:'true'},{statsTimeZone:'Mars/Unknown'},{statsTimeZone:null}]){
  const invalid=structuredClone(backup);Object.assign(invalid.data.preferences,patch);
  assert.throws(()=>validateBackup(invalid));
 }
});
