import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduceState} from '../core/index.js';
import {createController} from '../controller.js';
const now=1800000000000;
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function setup({fetchImpl,hasEndpointPermission=async()=>true}={}) {
  let stored=reduceState(createState(now),{type:'ADD_INTEREST',topic:'Education'},now);
  const requests=[];
  const controller=createController({catalog:[],clock:()=>now,readState:async()=>stored,writeState:async value=>{stored=value;},
    hasEndpointPermission,hasHistoryPermission:async()=>false,historySearch:async()=>[],openTab:async()=>{},
    fetchImpl:fetchImpl || (async(url,options)=>{requests.push({url,options});return Response.json(url.endsWith('/api/interest-groups') ? {groups:[{name:'Education',interest_ids:['Education']}]} : {recommendations:[{topic:'A new topic',domain:'Custom',description:'Fixture recommendation.'}]});})});
  return {controller,requests};
}

test('semantic grouping sends only saved titles and language, makes no profile changes and supports local mode',async()=>{
  const {controller,requests}=setup();
  const before=await controller.getState();
  const result=await controller.suggestInterestGroups();
  assert.deepEqual(result,{groups:[{name:'Education',interest_ids:['Education']}]});
  assert.match(requests[0].url,/\/api\/interest-groups$/);
  assert.deepEqual(JSON.parse(requests[0].options.body),{keywords:['Education'],language:'en'});
  assert.equal(requests[0].options.headers.Authorization,undefined);
  assert.deepEqual(await controller.getState(),before);
  const created=await controller.dispatch({type:'CREATE_INTEREST_GROUP',name:'Research',interestIds:['Education']});
  assert.equal(created.interestGroups.length,1);
});

test('group scope persists in the public controller and request payload uses its members',async()=>{
  const {controller,requests}=setup();
  await controller.dispatch({type:'ADD_INTEREST',topic:'Gardening'});
  const created=await controller.dispatch({type:'CREATE_INTEREST_GROUP',name:'Research',interestIds:['Education']});
  await controller.dispatch({type:'SET_RECOMMENDATION_GROUPS',ids:[created.interestGroups[0].id]});
  assert.deepEqual((await controller.getState()).recommendationGroupIds,[created.interestGroups[0].id]);
  const result=await controller.recommend();assert.equal(result.lastError,null);
  assert.deepEqual(JSON.parse(requests[0].options.body).keywords,['Education']);
});

for(const groups of [[],[{name:null,interest_ids:['Education']}],[{name:'Unknown',interest_ids:['Private forged topic']}],[{name:'Duplicate',interest_ids:['Education','Education']}],[{name:'Missing',interest_ids:[]}]]) {
  test('forged or incomplete semantic responses cannot become groups: '+JSON.stringify(groups),async()=>{
    const {controller}=setup({fetchImpl:async()=>Response.json({groups})});
    await assert.rejects(()=>controller.suggestInterestGroups(),/group/i);
    assert.deepEqual((await controller.getState()).interestGroups,[]);
  });
}

test('reset during grouping permission check prevents upload',async()=>{
  const started=deferred(), permission=deferred();let uploads=0;
  const {controller}=setup({hasEndpointPermission:async()=>{started.resolve();return permission.promise;},fetchImpl:async()=>{uploads++;return Response.json({groups:[]});}});
  const pending=controller.suggestInterestGroups();
  await started.promise;await controller.dispatch({type:'RESET'});permission.resolve(true);
  await assert.rejects(()=>pending,/changed/i);assert.equal(uploads,0);
});

test('changing interests aborts pending semantic work and hides untrusted transport errors',async()=>{
  const sent=deferred(), release=deferred();let signal;
  const {controller}=setup({fetchImpl:async(url,options)=>{signal=options.signal;sent.resolve();await release.promise;throw new Error('private credential and URL');}});
  const pending=controller.suggestInterestGroups();await sent.promise;
  await controller.dispatch({type:'ADD_INTEREST',topic:'Gardening'});assert.equal(signal.aborted,true);release.resolve();
  await assert.rejects(()=>pending,error=>!/private|credential|URL/.test(error.message));
  assert.deepEqual((await controller.getState()).interestGroups,[]);
});
