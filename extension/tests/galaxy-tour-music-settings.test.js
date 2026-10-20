import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduceState,buildRequest} from '../core/index.js';
import {createBackup,restoreBackup,validateBackup} from '../core/backup.js';
import {createController} from '../controller.js';

test('tour music defaults to supplied track 2 and migrates old or invalid preferences',()=>{
  assert.equal(createState().settings.galaxyTourMusic,'2');
  assert.equal(createState().settings.galaxyTourMusicVolume,.22);
  for(const value of [undefined,null,'unknown',2]) {
    const state=createState();state.settings.galaxyTourMusic=value;
    assert.equal(reduceState(state,{type:'PRUNE'}).settings.galaxyTourMusic,'2');
  }
});

test('BGM playback mode defaults to list repeat and persists independently through restart and backup',async()=>{
  let stored=reduceState(createState(),{type:'ADD_INTEREST',topic:'Gardening'});
  assert.equal(stored.settings.galaxyTourMusicMode,'list');
  const create=()=>createController({catalog:[],readState:async()=>stored,writeState:async state=>{stored=state;}});
  const controller=create(),before=await controller.getState();
  for(const mode of ['single','shuffle','list']) {
    const state=await controller.dispatch({type:'SET_SETTINGS',patch:{galaxyTourMusicMode:mode}});
    assert.equal(state.settings.galaxyTourMusicMode,mode);
    assert.equal((await create().getState()).settings.galaxyTourMusicMode,mode);
    assert.equal(state.generation,before.generation);assert.deepEqual(buildRequest(state),buildRequest(before));
    assert.equal(restoreBackup(createState(),createBackup(state),'replace').settings.galaxyTourMusicMode,mode);
  }
  for(const value of [undefined,null,'repeat',false,1]) {
    const state=createState();state.settings.galaxyTourMusicMode=value;
    assert.equal(reduceState(state,{type:'PRUNE'}).settings.galaxyTourMusicMode,'list');
    assert.equal(reduceState(stored,{type:'SET_SETTINGS',patch:{galaxyTourMusicMode:value}}).settings.galaxyTourMusicMode,'list');
  }
  const legacy=createBackup(stored);delete legacy.data.preferences.galaxyTourMusicMode;
  const target=createState();target.settings.galaxyTourMusicMode='single';
  assert.equal(restoreBackup(target,legacy,'replace').settings.galaxyTourMusicMode,'list');
  const invalid=createBackup(stored);invalid.data.preferences.galaxyTourMusicMode='unknown';assert.throws(()=>validateBackup(invalid));
});

test('BGM volume is independent, validated, migrated and preserved by the controller and backup',async()=>{
  let stored=reduceState(createState(),{type:'ADD_INTEREST',topic:'Gardening'});stored.settings.soundEffectsVolume=.4;
  const create=()=>createController({catalog:[],readState:async()=>stored,writeState:async state=>{stored=state;}});
  const controller=create(),before=await controller.getState();
  for(const volume of [0,.65,1]) {
    const state=await controller.dispatch({type:'SET_SETTINGS',patch:{galaxyTourMusicVolume:volume}});
    assert.equal(state.settings.galaxyTourMusicVolume,volume);
    assert.equal(state.settings.soundEffectsVolume,.4);
    assert.equal(state.generation,before.generation);assert.deepEqual(buildRequest(state),buildRequest(before));
    assert.equal((await create().getState()).settings.galaxyTourMusicVolume,volume);
    assert.equal(restoreBackup(createState(),createBackup(state),'replace').settings.galaxyTourMusicVolume,volume);
  }
  for(const value of [undefined,null,-.01,1.01,NaN,'0.5']) {
    const state=createState();state.settings.galaxyTourMusicVolume=value;
    assert.equal(reduceState(state,{type:'PRUNE'}).settings.galaxyTourMusicVolume,.22);
    assert.equal(reduceState(stored,{type:'SET_SETTINGS',patch:{galaxyTourMusicVolume:value}}).settings.galaxyTourMusicVolume,1);
  }
  const legacy=createBackup(stored);delete legacy.data.preferences.galaxyTourMusicVolume;
  const destination=createState();destination.settings.galaxyTourMusicVolume=.73;
  assert.equal(restoreBackup(destination,legacy,'replace').settings.galaxyTourMusicVolume,.22);
  const invalid=createBackup(stored);invalid.data.preferences.galaxyTourMusicVolume=2;
  assert.throws(()=>validateBackup(invalid));
});

test('the installed-extension controller saves music choices across restart without permission or network work',async()=>{
  let stored=createState(),external=0;
  stored.settings.autoRefresh=true;
  const create=()=>createController({catalog:[],readState:async()=>stored,writeState:async value=>{stored=value;},
    hasHistoryPermission:async()=>{external++;return false;},hasEndpointPermission:async()=>{external++;return false;},
    fetchImpl:async()=>{external++;throw new Error('Music stays local');},
  });
  const controller=create(),before=await controller.getState();
  await controller.dispatch({type:'SET_SETTINGS',patch:{galaxyTourMusic:'3'}});
  assert.equal((await create().getState()).settings.galaxyTourMusic,'3');
  await controller.dispatch({type:'SET_SETTINGS',patch:{galaxyTourMusic:'off'}});
  assert.equal((await controller.getState()).settings.galaxyTourMusic,'off');
  assert.equal((await controller.getState()).generation,before.generation);assert.equal(external,0);
});

test('music selection and off persist without changing recommendations or service inputs',()=>{
  let state=reduceState(createState(),{type:'ADD_INTEREST',topic:'Gardening'});
  state=reduceState(state,{type:'RECOMMENDATIONS',generation:state.generation,items:[{topic:'Botany'}]});
  const before=state;
  for(const track of ['1','3','off','2']) {
    state=reduceState(state,{type:'SET_SETTINGS',patch:{galaxyTourMusic:track}});
    assert.equal(state.settings.galaxyTourMusic,track);
    assert.equal(state.generation,before.generation);
    assert.deepEqual(state.recommendations,before.recommendations);
    assert.deepEqual(buildRequest(state),buildRequest(before));
    const backup=createBackup(state);
    assert.equal(restoreBackup(createState(),backup,'replace').settings.galaxyTourMusic,track);
  }
  for(const value of [null,'unknown',2,false]) {
    assert.equal(reduceState(state,{type:'SET_SETTINGS',patch:{galaxyTourMusic:value}}).settings.galaxyTourMusic,'2');
  }
  const legacy=createBackup(state);delete legacy.data.preferences.galaxyTourMusic;
  assert.equal(restoreBackup(createState(),legacy,'replace').settings.galaxyTourMusic,'2');
  const invalid=createBackup(state);invalid.data.preferences.galaxyTourMusic='unknown';
  assert.throws(()=>validateBackup(invalid));
});
