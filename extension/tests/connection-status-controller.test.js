import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../controller.js';
import {createState} from '../core/index.js';

const now=1770000000000;
const healthy={schema_version:1,service:'otherwise',ready:true,discovery_ready:true};
const statusResponse=(data=healthy,options={})=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'},...options});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function rig({fetchImpl,permission=async()=>true,settings={}}={}){
  let stored=createState(now),writes=0;const requests=[];
  Object.assign(stored.settings,{endpoint:'https://team.example',accessToken:'saved-token'},settings);
  const controller=createController({catalog:[],clock:()=>now,
    readState:async()=>structuredClone(stored),writeState:async value=>{stored=structuredClone(value);writes++;},
    hasHistoryPermission:async()=>false,hasEndpointPermission:permission,historySearch:async()=>[],openTab:async()=>{},
    fetchImpl:async(url,options)=>{requests.push({url,options});return fetchImpl?fetchImpl(url,options):statusResponse();},
  });
  return {controller,requests,saved:()=>stored,writes:()=>writes};
}

test('connection checks run only on request and send only the saved origin and credential',async()=>{
  const r=rig();
  await r.controller.dispatch({type:'ADD_INTEREST',topic:'Private hobby'});
  const before=await r.controller.getState(),writes=r.writes();
  assert.equal(r.requests.length,0);
  assert.deepEqual(await r.controller.checkConnection(),{status:'ready',ready:true,discovery_ready:true});
  assert.equal(r.requests.length,1);
  const {url,options}=r.requests[0];
  assert.equal(url,'https://team.example/api/status');
  assert.equal(options.method,'GET');assert.equal(options.body,undefined);
  assert.deepEqual(options.headers,{'Content-Type':'application/json',Authorization:'Bearer saved-token'});
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  assert.deepEqual(await r.controller.getState(),before);assert.equal(r.writes(),writes);
});

for(const [ready,discovery_ready,status] of [[false,false,'warming'],[true,false,'discovery_unavailable'],[true,true,'ready']]){
  test(`connection reports ${status} from validated readiness flags`,async()=>{
    const r=rig({fetchImpl:async()=>statusResponse({...healthy,ready,discovery_ready})});
    assert.deepEqual(await r.controller.checkConnection(),{status,ready,discovery_ready});
  });
}

test('local connection needs no token and uses the same host permission check',async()=>{
  const origins=[];const r=rig({settings:{endpoint:'http://127.0.0.1:8000',accessToken:''},permission:async origin=>{origins.push(origin);return true;}});
  assert.equal((await r.controller.checkConnection()).status,'ready');
  assert.equal(r.requests[0].url,'http://127.0.0.1:8000/api/status');
  assert.equal(r.requests[0].options.headers.Authorization,undefined);
  assert.deepEqual(origins,['http://127.0.0.1:8000','http://127.0.0.1:8000']);
});

for(const settings of [{endpoint:''},{endpoint:'http://public.example'},{accessToken:''},{endpoint:'https://team.example/private'}]){
  test(`missing or unsafe saved connection cannot probe: ${JSON.stringify(settings)}`,async()=>{
    const r=rig({settings});
    assert.deepEqual(await r.controller.checkConnection(),{status:'missing_configuration'});assert.equal(r.requests.length,0);
  });
}

test('absent host permission returns a recovery status without network or storage changes',async()=>{
  const r=rig({permission:async()=>false});await r.controller.getState();const writes=r.writes();
  assert.deepEqual(await r.controller.checkConnection(),{status:'permission_required'});
  assert.equal(r.requests.length,0);assert.equal(r.writes(),writes);
});

for(const [http,status] of [[401,'unauthorized'],[403,'forbidden'],[404,'incompatible'],[500,'unreachable'],[503,'unreachable']]){
  test(`HTTP ${http} is classified as ${status} without exposing response details`,async()=>{
    const r=rig({fetchImpl:async()=>new Response('private upstream debug data',{status:http})});
    assert.deepEqual(await r.controller.checkConnection(),{status});
  });
}

test('failed network request reports unreachable without exposing credential-bearing errors',async()=>{
  const r=rig({fetchImpl:async()=>{throw new TypeError('private saved-token network failure');}});
  assert.deepEqual(await r.controller.checkConnection(),{status:'unreachable'});
});

for(const payload of [null,[],{}, {...healthy,service:'another-app'}, {...healthy,schema_version:2},
  {...healthy,ready:'true'}, {...healthy,discovery_ready:0}, {...healthy,unexpected:'private debug text'}]){
  test(`unrecognized status data is incompatible: ${JSON.stringify(payload)}`,async()=>{
    const r=rig({fetchImpl:async()=>statusResponse(payload)});
    assert.deepEqual(await r.controller.checkConnection(),{status:'incompatible'});
  });
}

test('HTML and malformed JSON cannot impersonate a ready service',async()=>{
  for(const response of [new Response(JSON.stringify(healthy),{headers:{'Content-Type':'text/html'}}),
    new Response('{invalid json',{headers:{'Content-Type':'application/json'}})]){
    const r=rig({fetchImpl:async()=>response});
    assert.deepEqual(await r.controller.checkConnection(),{status:'incompatible'});
  }
});

test('a streaming oversized response is cancelled without waiting for its end',async()=>{
  let cancelled=false;
  const response=new Response(new ReadableStream({start(controller){
    controller.enqueue(new Uint8Array(1600));controller.enqueue(new Uint8Array(1000));
  },cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json','Content-Length':'1'}});
  const r=rig({fetchImpl:async()=>response});
  assert.deepEqual(await r.controller.checkConnection(),{status:'incompatible'});assert.equal(cancelled,true);
});

for(const [options,status] of [[{status:401},'unauthorized'],[{headers:{'Content-Type':'text/html'}},'incompatible'],
  [{headers:{'Content-Type':'application/json','Content-Length':'999999'}},'incompatible']]){
  test(`unused response bodies are cancelled for ${JSON.stringify(options)}`,async()=>{
    let cancelled=false;
    const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),options);
    const r=rig({fetchImpl:async()=>response});
    assert.deepEqual(await r.controller.checkConnection(),{status});assert.equal(cancelled,true);
  });
}

for(const action of [
  {type:'SET_SETTINGS',patch:{endpoint:'https://new.example'}},
  {type:'SET_SETTINGS',patch:{accessToken:'new-token'}},
  {type:'RESET'},
]){
  test(`pending status is discarded immediately after ${JSON.stringify(action)}`,async()=>{
    const started=deferred(),response=deferred();
    const r=rig({fetchImpl:async()=>{started.resolve();return response.promise;}});
    const pending=r.controller.checkConnection();await started.promise;
    await r.controller.dispatch(action);
    assert.deepEqual(await pending,{status:'invalidated'});
    assert.equal(r.requests[0].options.signal.aborted,true);
    response.resolve(statusResponse());
  });
}

test('a connection change while permission is pending cannot send the old request',async()=>{
  const started=deferred(),permission=deferred();
  const r=rig({permission:async()=>{started.resolve();return permission.promise;}});
  const pending=r.controller.checkConnection();await started.promise;
  await r.controller.dispatch({type:'SET_SETTINGS',patch:{accessToken:'new-token'}});
  assert.deepEqual(await pending,{status:'invalidated'});
  permission.resolve(true);await Promise.resolve();await Promise.resolve();
  assert.equal(r.requests.length,0);
});

test('revoking endpoint permission invalidates pending checks and notifies connected windows',async()=>{
  const started=deferred(),response=deferred();const r=rig({fetchImpl:async()=>{started.resolve();return response.promise;}});
  let invalidations=0;const off=r.controller.subscribeConnectionInvalidation(()=>invalidations++);
  const pending=r.controller.checkConnection();await started.promise;
  await r.controller.revokeEndpoint();
  assert.deepEqual(await pending,{status:'invalidated'});assert.equal(invalidations,1);
  off();await r.controller.dispatch({type:'RESET'});assert.equal(invalidations,1);
  response.resolve(statusResponse());
});

test('permission lost during the request never produces a ready result',async()=>{
  let permitted=true;const r=rig({permission:async()=>permitted,fetchImpl:async()=>{permitted=false;return statusResponse();}});
  assert.deepEqual(await r.controller.checkConnection(),{status:'permission_required'});
});

test('a newer explicit check invalidates a pending older check',async()=>{
  const started=deferred(),response=deferred();let count=0;
  const r=rig({fetchImpl:async()=>{if(count++===0){started.resolve();return response.promise;}return statusResponse();}});
  const first=r.controller.checkConnection();await started.promise;
  assert.deepEqual(await r.controller.checkConnection(),{status:'ready',ready:true,discovery_ready:true});
  assert.deepEqual(await first,{status:'invalidated'});response.resolve(statusResponse());
});

test('the entire check times out within seven seconds even if fetch ignores abort',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const started=deferred(),response=deferred();
  const r=rig({fetchImpl:async()=>{started.resolve();return response.promise;}});
  const pending=r.controller.checkConnection();await started.promise;
  t.mock.timers.tick(7000);
  assert.deepEqual(await pending,{status:'timeout'});assert.equal(r.requests[0].options.signal.aborted,true);
  response.resolve(statusResponse());
});

test('an unfinished response body is covered by the same timeout',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const started=deferred();
  const stream=new ReadableStream({pull(){started.resolve();}});
  const r=rig({fetchImpl:async()=>new Response(stream,{headers:{'Content-Type':'application/json'}})});
  const pending=r.controller.checkConnection();await started.promise;await r.controller.getState();
  t.mock.timers.tick(7000);assert.deepEqual(await pending,{status:'timeout'});
});
