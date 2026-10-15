import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduceState,buildRequest} from '../core/index.js';
import {createBackup,parseBackup,restoreBackup} from '../core/backup.js';
import {createController} from '../controller.js';

const now=1_800_000_000_000;

test('new and legacy profiles use the existing dark theme',()=>{
  assert.equal(createState(now).settings.theme,'dark');
  const legacy=createState(now);delete legacy.settings.theme;
  assert.equal(reduceState(legacy,{type:'PRUNE'},now).settings.theme,'dark');
});

test('manual theme changes preserve recommendations, profile and request generation',()=>{
  let state=reduceState(createState(now),{type:'ADD_INTEREST',topic:'Gardening'},now);
  state=reduceState(state,{type:'RECOMMENDATIONS',generation:state.generation,items:[{topic:'Botany',domain:'Science',description:'Plants.'}]},now);
  const before=structuredClone(state),request=buildRequest(state);
  state=reduceState(state,{type:'SET_SETTINGS',patch:{theme:'light'}},now);
  assert.equal(state.settings.theme,'light');
  assert.equal(state.generation,before.generation);
  assert.deepEqual(state.recommendationBatch,before.recommendationBatch);
  assert.deepEqual(state.recommendations,before.recommendations);
  assert.deepEqual(state.approved,before.approved);
  assert.deepEqual(buildRequest(state),request);
  assert.equal(reduceState(state,{type:'SET_SETTINGS',patch:{theme:'dark'}},now).settings.theme,'dark');
});

test('unknown stored themes fall back safely and invalid manual values are ignored',()=>{
  const state=createState(now);state.settings.theme='retired-theme';
  assert.equal(reduceState(state,{type:'PRUNE'},now).settings.theme,'dark');
  const light=reduceState(createState(now),{type:'SET_SETTINGS',patch:{theme:'light'}},now);
  for(const theme of ['unregistered','LIGHT','',null,42,{},['light']]){
    const next=reduceState(light,{type:'SET_SETTINGS',patch:{theme}},now);
    assert.equal(next.settings.theme,'light');
    assert.equal(next.generation,light.generation);
  }
});

test('theme preferences round trip through backup; merge keeps the local choice',()=>{
  const light=reduceState(createState(now),{type:'SET_SETTINGS',patch:{theme:'light'}},now);
  const backup=parseBackup(JSON.stringify(createBackup(light,now)));
  assert.equal(backup.data.preferences.theme,'light');
  assert.equal(restoreBackup(createState(now),backup,'replace',now).settings.theme,'light');
  assert.equal(restoreBackup(createState(now),backup,'merge',now).settings.theme,'dark');
  assert.equal(reduceState(light,{type:'RESET'},now).settings.theme,'dark');
});

test('backups made before themes and old profiles export with the dark default',()=>{
  for(const version of [1,2]){
    const legacy=createBackup(createState(now),now);legacy.version=version;delete legacy.data.stats;
    delete legacy.data.preferences.theme;
    if(version===1){delete legacy.data.interestGroups;delete legacy.data.recommendationGroupIds;}
    const parsed=parseBackup(JSON.stringify(legacy));
    assert.equal(parsed.data.preferences.theme,'dark');
    assert.equal(restoreBackup(createState(now),parsed,'replace',now).settings.theme,'dark');
  }
  const legacy=createState(now);delete legacy.settings.theme;
  assert.equal(createBackup(legacy,now).data.preferences.theme,'dark');
});

test('backup validation rejects unregistered or malformed theme preferences',()=>{
  for(const theme of ['retired-theme',null,4,{},['light']]){
    const backup=createBackup(createState(now),now);backup.data.preferences.theme=theme;
    assert.throws(()=>parseBackup(JSON.stringify(backup)),/valid OtherWise backup/);
  }
});

test('the production controller saves themes without cancelling or repeating an active request',async()=>{
  let saved=reduceState(createState(now),{type:'ADD_INTEREST',topic:'Gardening'},now);
  saved.settings.autoRefresh=true;
  let release,started,calls=0,signal;
  const response=new Promise(resolve=>release=resolve),sent=new Promise(resolve=>started=resolve);
  const controller=createController({catalog:[],clock:()=>now,
    readState:async()=>saved,writeState:async next=>{saved=structuredClone(next);},
    hasEndpointPermission:async()=>true,
    fetchImpl:async(url,options)=>{calls++;signal=options.signal;started();await response;return new Response(JSON.stringify({recommendations:[{topic:'Botany',domain:'Science',description:'Plants.'}]}));},
  });
  const pending=controller.recommend();await sent;
  const before=await controller.getState();
  try {
    const next=await controller.dispatch({type:'SET_SETTINGS',patch:{theme:'light'}});
    assert.equal(next.settings.theme,'light');assert.equal(saved.settings.theme,'light');
    assert.equal(signal.aborted,false);assert.equal(next.generation,before.generation);assert.equal(calls,1);
  } finally { release(); }
  const result=await pending;
  assert.equal(result.settings.theme,'light');assert.equal(result.recommendations[0].topic,'Botany');
  assert.equal(calls,1);
});
