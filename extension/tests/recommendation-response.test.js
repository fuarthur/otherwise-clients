import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../controller.js';
import {createState} from '../core/index.js';

const topic={topic:'Concrete idea',domain:'Science',description:'A public idea.',discovery:{concept_id:'Q12',area_id:'ecology',graph_path:['Ecology','Concrete idea'],source_url:'https://www.wikidata.org/wiki/Q12',level:2,exploration_pick:false,exploration_target:0,exploration_achieved:0}};

for(const entry of ['recommend','getProactiveRecommendations']){
 test(`${entry} validates recommendation envelopes without accepting mismatched or duplicate graph results`,async()=>{
  for(const change of [null,body=>{body.seed=-1;},body=>{body.graph_sha256='invalid';},body=>{body.recommendations.push(topic);},body=>{body.recommendations=null;}]){
   let stored=createState();stored.settings.proactiveEnabled=true;stored.settings.recommendationKind='specific';
   stored.approved=[{id:'Gardening',topic:'Gardening',domain:'Nature',description:'',addedAt:0}];
   const controller=createController({catalog:[],readState:async()=>stored,writeState:async value=>{stored=value;},hasEndpointPermission:async()=>true,
    fetchImpl:async(_url,options)=>{const request=JSON.parse(options.body),body={recommendations:[topic],seed:request.seed,graph_sha256:'a'.repeat(64)};change?.(body);return new Response(JSON.stringify(body));}});
   const before=await controller.getState();
   if(entry==='getProactiveRecommendations'){
    if(change)await assert.rejects(controller[entry]());
    else assert.equal((await controller[entry]()).items[0].topic,'Concrete idea');
    assert.deepEqual(await controller.getState(),before);
   }else{
    const after=await controller[entry]();
    if(change){assert.equal(after.recommendations.length,0);assert.match(after.lastError,/invalid/);}
    else{assert.equal(after.recommendations[0].topic,'Concrete idea');assert.equal(after.lastError,null);}
   }
  }
 });
}
