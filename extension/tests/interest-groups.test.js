import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduceState,buildRequest} from '../core/index.js';
import {recommendationInterests,groupInterests} from '../core/interest-groups.js';
import {createBackup,parseBackup,restoreBackup} from '../core/backup.js';
const now=1800000000000;
const apply=(state,type,fields={})=>reduceState(state,{type,...fields},now);
const initial=()=>['Machine learning','Education','Gardening'].reduce((state,topic)=>apply(state,'ADD_INTEREST',{topic}),createState(now));
const add=(state,name,interestIds)=>apply(state,'CREATE_INTEREST_GROUP',{name,interestIds});

test('manual groups allow overlap, rename and deletion without deleting saved interests',()=>{
  let state=add(initial(),'Computing',['Machine learning']);
  const first=state.interestGroups[0].id;
  state=add(state,'Education research',['Machine learning','Education']);
  const second=state.interestGroups[1].id;
  assert.match(first,/^[a-f\d]{64}$/);
  assert.deepEqual(groupInterests(state,first).map(row=>row.id),['Machine learning']);
  assert.deepEqual(groupInterests(state,'ungrouped').map(row=>row.id),['Gardening']);
  state=apply(state,'UPDATE_INTEREST_GROUP',{id:first,name:'AI',interestIds:['Machine learning','Gardening']});
  assert.equal(state.interestGroups[0].name,'AI');
  state=apply(state,'DELETE_INTEREST_GROUP',{id:first});
  assert.equal(state.interestGroups[0].id,second);
  assert.equal(state.approved.length,3);
});

test('selected groups union seeds in saved order, deduplicate overlap and use global mode',()=>{
  let state=add(initial(),'Computing',['Machine learning']);
  state=add(state,'Education research',['Education','Machine learning']);
  const ids=state.interestGroups.map(group=>group.id);
  state=apply(state,'SET_RECOMMENDATION_GROUPS',{ids:ids.reverse()});
  assert.deepEqual(recommendationInterests(state).map(row=>row.id),['Machine learning','Education']);
  assert.deepEqual(buildRequest(state).keywords,['Machine learning','Education']);
  assert.equal(buildRequest(state).mode,'global');
  assert.notEqual(buildRequest(state).focus,'Gardening');
  state=apply(state,'RECOMMENDATIONS',{generation:state.generation,items:[{topic:'Gardening'}, {topic:'New idea'}]});
  assert.deepEqual(state.recommendations.map(row=>row.id),['New idea']);
  assert.equal(state.recommendationBatch.seedCount,2);
  assert.deepEqual(state.recommendationBatch.groupNames,['Education research','Computing']);
});

test('empty group scopes do not fall back to all interests and deleting selected groups restores all',()=>{
  let state=add(initial(),'Empty',[]);
  const id=state.interestGroups[0].id;
  state=apply(state,'SET_RECOMMENDATION_GROUPS',{ids:[id]});
  assert.throws(()=>buildRequest(state),/selected groups/i);
  state=apply(state,'DELETE_INTEREST_GROUP',{id});
  assert.equal(state.recommendationGroupIds,null);
  assert.equal(buildRequest(state).keywords.length,3);
});

test('group validation rejects forged members and duplicate names without partial changes',()=>{
  let state=add(initial(),'Computing',['Machine learning']);
  const before=structuredClone(state.interestGroups);
  for(const fields of [{name:'Bad',interestIds:['Unknown']},{name:' computing ',interestIds:[]},{name:'bad\nname',interestIds:[]}]){
    const next=apply(state,'CREATE_INTEREST_GROUP',fields);
    assert.ok(next.lastError);assert.deepEqual(next.interestGroups,before);
  }
  const next=apply(state,'SET_RECOMMENDATION_GROUPS',{ids:['forged']});
  assert.ok(next.lastError);assert.equal(next.recommendationGroupIds,null);
});

test('removal undo restores memberships in surviving groups and reset clears group data',()=>{
  let state=add(initial(),'Research',['Machine learning','Education']);
  const id=state.interestGroups[0].id;
  state=apply(state,'REMOVE_INTEREST',{id:'Machine learning'});
  assert.deepEqual(state.interestGroups[0].interestIds,['Education']);
  state=apply(state,'UNDO_REMOVE_INTERESTS',{token:state.interestUndo.token});
  assert.deepEqual(new Set(state.interestGroups[0].interestIds),new Set(['Machine learning','Education']));
  assert.equal(state.interestGroups[0].id,id);
  const reset=apply(state,'RESET');assert.deepEqual(reset.interestGroups,[]);assert.equal(reset.recommendationGroupIds,null);
});

test('semantic suggestions add editable groups without overwriting manual groups or duplicate imports',()=>{
  let state=add(initial(),'Research',['Education']);
  const groups=[{name:'Research',interest_ids:['Machine learning','Education']},{name:'Gardening',interest_ids:['Gardening']}];
  state=apply(state,'ADD_INTEREST_GROUPS',{groups});
  assert.equal(state.interestGroups.length,3);
  assert.deepEqual(state.interestGroups[0].interestIds,['Education']);
  assert.deepEqual(state.interestGroups[1].interestIds,['Machine learning','Education']);
  const again=apply(state,'ADD_INTEREST_GROUPS',{groups});
  assert.deepEqual(again.interestGroups,state.interestGroups);
});

test('refreshing automatic groups retains matching IDs and protects user edits',()=>{
  const suggestions=[{name:'Research',interest_ids:['Machine learning','Education']},{name:'Gardening',interest_ids:['Gardening']}];
  let state=apply(initial(),'ADD_INTEREST_GROUPS',{groups:suggestions});
  const first=state.interestGroups[0].id, second=state.interestGroups[1].id;
  state=apply(state,'SET_RECOMMENDATION_GROUPS',{ids:[first]});
  state=apply(state,'UPDATE_INTEREST_GROUP',{id:second,name:'My garden',interestIds:['Gardening']});
  assert.equal(state.interestGroups.find(row=>row.id===second).source,'manual');
  state=apply(state,'ADD_INTEREST_GROUPS',{groups:suggestions});
  assert.equal(state.interestGroups.length,2);
  assert.equal(state.interestGroups.find(row=>row.name==='Research').id,first);
  assert.equal(state.interestGroups.find(row=>row.id===second).name,'My garden');
  assert.deepEqual(state.recommendationGroupIds,[first]);
  state=apply(state,'ADD_INTEREST',{topic:'A new hobby'});
  assert.equal(groupInterests(state,'ungrouped').at(-1).id,'A new hobby');
});

test('edited preview suggestions become manual groups and obsolete automatic groups are replaced',()=>{
  let state=apply(initial(),'ADD_INTEREST_GROUPS',{groups:[{name:'Old',interest_ids:['Machine learning']}]});
  state=apply(state,'ADD_INTEREST_GROUPS',{groups:[{name:'My research',interest_ids:['Education'],source:'manual'}]});
  assert.equal(state.interestGroups.length,1);
  assert.equal(state.interestGroups[0].name,'My research');
  assert.equal(state.interestGroups[0].source,'manual');
});

test('an explicitly renamed preview can create a distinct manual group with overlapping membership',()=>{
  let state=add(initial(),'Teaching',['Education']);
  state=apply(state,'ADD_INTEREST_GROUPS',{groups:[{name:'My new classification',interest_ids:['Education'],source:'manual'}]});
  assert.deepEqual(state.interestGroups.map(row=>row.name),['Teaching','My new classification']);
});

test('automatic refresh remaps a selected duplicate to the protected manual group without broadening scope',()=>{
  const groups=[{name:'Research',interest_ids:['Machine learning','Education']},{name:'Garden',interest_ids:['Gardening']}];
  let state=apply(initial(),'ADD_INTEREST_GROUPS',{groups});
  state=apply(state,'SET_RECOMMENDATION_GROUPS',{ids:[state.interestGroups[0].id]});
  state=add(state,'Work',['Machine learning','Education']);
  const manual=state.interestGroups.find(row=>row.name==='Work');
  state=apply(state,'ADD_INTEREST_GROUPS',{groups});
  assert.deepEqual(state.recommendationGroupIds,[manual.id]);
  assert.deepEqual(buildRequest(state).keywords,['Machine learning','Education']);
});

test('a removed automatic scope requires another selection instead of silently using all interests',()=>{
  let state=apply(initial(),'ADD_INTEREST_GROUPS',{groups:[{name:'Research',interest_ids:['Machine learning']}]});
  state=apply(state,'SET_RECOMMENDATION_GROUPS',{ids:[state.interestGroups[0].id]});
  state=apply(state,'ADD_INTEREST_GROUPS',{groups:[{name:'Garden',interest_ids:['Gardening']}]});
  assert.deepEqual(state.recommendationGroupIds,[]);
  assert.throws(()=>buildRequest(state),/selected groups/i);
});

test('group metadata persists through current backup merge/replace and version 1 still loads',()=>{
  let source=add(initial(),'Research',['Machine learning','Education']);
  source=apply(source,'SET_RECOMMENDATION_GROUPS',{ids:[source.interestGroups[0].id]});
  const backup=createBackup(source,now);assert.equal(backup.version,3);
  const replaced=restoreBackup(createState(now),backup,'replace',now);
  assert.deepEqual(replaced.interestGroups,source.interestGroups);
  assert.deepEqual(replaced.recommendationGroupIds,source.recommendationGroupIds);
  const merged=restoreBackup(replaced,backup,'merge',now);
  assert.deepEqual(merged.interestGroups,replaced.interestGroups);
  const old=structuredClone(backup);old.version=1;delete old.data.stats;delete old.data.interestGroups;delete old.data.recommendationGroupIds;
  const legacy=restoreBackup(createState(now),old,'replace',now);
  assert.deepEqual(legacy.interestGroups,[]);assert.equal(legacy.recommendationGroupIds,null);
  const parsedLegacy=parseBackup(JSON.stringify(old));
  const importedLegacy=restoreBackup(createState(now),parsedLegacy,'replace',now);
  assert.deepEqual(importedLegacy.approved,source.approved);
  assert.deepEqual(importedLegacy.interestGroups,[]);
});

test('old profiles migrate without altering saved interests or their all-interests scope',()=>{
  const legacy=initial();delete legacy.interestGroups;delete legacy.recommendationGroupIds;
  const next=apply(legacy,'PRUNE');assert.deepEqual(next.interestGroups,[]);assert.equal(next.recommendationGroupIds,null);
  assert.deepEqual(next.approved,legacy.approved);
});

test('group backups reject forged membership, sources and scope without mutating the profile',()=>{
  const state=add(initial(),'Research',['Education']);
  const backup=createBackup(state,now), before=structuredClone(state);
  for(const mutate of [
    b=>b.data.interestGroups[0].interestIds.push('Unknown'),
    b=>b.data.interestGroups[0].source='untrusted',
    b=>b.data.recommendationGroupIds=['missing'],
  ]){
    const broken=structuredClone(backup);mutate(broken);
    assert.throws(()=>restoreBackup(state,broken,'merge',now));assert.deepEqual(state,before);
  }
});

test('backup merge maps memberships to retained topic casing and keeps local group edits',()=>{
  const local=add(initial(),'Local',['Education']);
  let remote=apply(createState(now),'ADD_INTEREST',{topic:'education'});
  remote=add(remote,'Imported',['education']);
  const merged=restoreBackup(local,createBackup(remote,now),'merge',now);
  assert.deepEqual(merged.interestGroups.at(-1).interestIds,['Education']);
  const repeated=restoreBackup(merged,createBackup(remote,now),'merge',now);
  assert.deepEqual(repeated.interestGroups,merged.interestGroups);
});
