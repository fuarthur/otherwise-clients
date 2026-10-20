import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTourData} from './fixtures/galaxy-tour.js';
import {normalizeTourInput} from '../ui/galaxy-tour-options.js';
import {buildTourGraph,planTourRoute} from '../ui/galaxy-tour-route.js';
import {compileTourTimeline,sampleTourFrame} from '../ui/galaxy-tour-timeline.js';
import {compileTourContext,sampleTourContext} from '../ui/galaxy-tour-context.js';
import {placeGalaxyLabels} from '../ui/galaxy-labels.js';

async function fixture() {
  const ids=Array.from({length:100},(_,i)=>'Topic '+i);
  const positions=Object.fromEntries(ids.map((id,i)=>[id,[Math.cos(i)*2+i/10,Math.sin(i)*2]]));
  const data=makeTourData({ids,positions,edges:ids.slice(1).map(id=>[ids[0],id,.2])});
  const options=normalizeTourInput({topics:[ids[0],ids[30]],order:'given'});
  const plan=await planTourRoute(await buildTourGraph(data),options);
  const timeline=compileTourTimeline(plan,{data,viewport:{width:1000,height:700},options});
  return {data,plan,timeline,context:compileTourContext(plan,timeline,{data,viewport:{width:1000,height:700}})};
}

test('tour labels stay sparse, prioritize the route and reproduce any directly sampled time', async()=>{
  const {timeline,context}=await fixture();
  for(const width of [1000,450,449,320]){
    const viewport={width,height:700};
    for(const t of [2400,3000,5200,6000]){
      const frame=sampleTourFrame(timeline,t);
      const labels=sampleTourContext(context,frame,viewport);
      assert.ok(labels.filter(l=>l.kind!=='domain').length<=(width<450?5:8));
      assert.ok(labels.filter(l=>l.kind==='domain').length<=1);
      assert.equal(labels[0].id,frame.phase==='travel'?frame.route.nodeIds[frame.edgeIndex]:frame.topicId);
      assert.deepEqual(sampleTourContext(context,frame,viewport),labels);
    }
  }
});

test('fixed tour label directions hide blocked labels and retain ordinary placement behavior',()=>{
  const fixed={id:'A',text:'Literal <A&B> '+ 'Long '.repeat(20),kind:'saved',x:120,y:100,offsets:[[9,-12]]};
  const viewport={width:320,height:390},measure=text=>text.length*7;
  const excluded=[{x:120,y:70,width:200,height:30}];
  assert.deepEqual(placeGalaxyLabels([fixed],viewport,measure,excluded),[]);
  assert.equal(placeGalaxyLabels([{...fixed,offsets:undefined}],viewport,measure,excluded).length,1);
  assert.ok(fixed.text.includes('<A&B>'));
});
