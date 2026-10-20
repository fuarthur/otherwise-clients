import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTourData} from './fixtures/galaxy-tour.js';
import {normalizeTourInput} from '../ui/galaxy-tour-options.js';
import {buildTourGraph, planTourRoute} from '../ui/galaxy-tour-route.js';
import {compileTourTimeline, sampleTourFrame} from '../ui/galaxy-tour-timeline.js';

export async function timelineFixture(extra = {}) {
  const data = makeTourData({edges:[['A','B',.2],['B','C',.3]],positions:{A:[0,0],B:[1,1],C:[3,1]}});
  const options = normalizeTourInput({topics:['A','C'],order:'given',...extra});
  const plan = await planTourRoute(await buildTourGraph(data),options);
  return {data,options,plan,timeline:compileTourTimeline(plan,{data,viewport:{width:1000,height:700},options})};
}

test('time sampling follows every real edge and preserves stop timing independently of playback history', async () => {
  const {timeline} = await timelineFixture();
  const travel = timeline.segments.filter(segment => segment.phase === 'travel');
  assert.equal(travel.length,2);
  const first = sampleTourFrame(timeline,travel[0].startMs + travel[0].durationMs / 2);
  const second = sampleTourFrame(timeline,travel[1].startMs + travel[1].durationMs / 2);
  assert.deepEqual(first.position,{x:.5,y:.5});
  assert.deepEqual(second.position,{x:2,y:1});
  assert.equal(first.edgeIndex,0); assert.equal(second.edgeIndex,1);
  assert.equal(timeline.stopTimes[0],2400);
  assert.deepEqual(sampleTourFrame(timeline,travel[0].startMs + travel[0].durationMs / 2),first);
});

test('camera stages join continuously and reduced motion keeps travel static and upright', async () => {
  const {timeline} = await timelineFixture();
  for (const segment of timeline.segments.slice(1)) {
    const before=sampleTourFrame(timeline,segment.startMs-.001).camera;
    const after=sampleTourFrame(timeline,segment.startMs+.001).camera;
    assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<.001);
    assert.ok(Math.abs(before.angle-after.angle)<.001);
  }
  const segment=timeline.segments.find(s=>s.phase==='travel');
  const start=sampleTourFrame(timeline,segment.startMs+segment.durationMs*.1,{reducedMotion:true});
  const end=sampleTourFrame(timeline,segment.startMs+segment.durationMs*.9,{reducedMotion:true});
  assert.deepEqual(start.camera,end.camera);
  assert.equal(start.camera.angle,0);
});

test('zero-duration transitions stay continuous and looping returns to the first pose without another intro', async () => {
  const {timeline,plan,data,options} = await timelineFixture({timing:{departMs:0}});
  const segment=timeline.segments.find(s=>s.phase==='travel');
  const a=sampleTourFrame(timeline,segment.startMs-.001).camera;
  const b=sampleTourFrame(timeline,segment.startMs+.001).camera;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.001);
  assert.ok(Math.abs(a.zoom-b.zoom)<.001);
  const end=sampleTourFrame(timeline,timeline.introMs+timeline.loopDurationMs,{loop:true});
  const start=sampleTourFrame(timeline,timeline.introMs,{loop:true});
  assert.deepEqual(end.position,start.position);
  assert.deepEqual(end.camera,start.camera);
  assert.ok(Math.abs(end.camera.angle)<=12*Math.PI/180);
  const collapsed=compileTourTimeline(plan,{data,viewport:{width:0,height:0},options});
  assert.ok(Object.values(sampleTourFrame(collapsed,0).camera).every(Number.isFinite));
  const before=timeline.singleDurationMs;
  sampleTourFrame(timeline,segment.startMs,{viewport:{width:320,height:390}});
  assert.equal(timeline.singleDurationMs,before);
});

test('the camera continues through transit topics rather than stopping at every intermediate node', async () => {
  const {timeline}=await timelineFixture();
  const junction=timeline.segments.filter(s=>s.phase==='travel')[1].startMs;
  const a=sampleTourFrame(timeline,junction-.01).camera,b=sampleTourFrame(timeline,junction+.01).camera;
  assert.ok(Math.hypot(b.x-a.x,b.y-a.y)/.02>1e-5);
});

test('a closing hold and repeated stops keep finite bounded cameras', async () => {
  const {data}=await timelineFixture();
  for (const topics of [['A'],['A','A','C']]) {
    const options=normalizeTourInput({topics,order:'given'});
    const plan=topics.length===1?{stopIds:topics,legs:[],returnLeg:{from:'A',to:'A',nodeIds:['A'],distances:[],hops:0,distance:0}}:
      await planTourRoute(await buildTourGraph(data),options);
    const timeline=compileTourTimeline(plan,{data,viewport:{width:320,height:390},options});
    assert.equal(timeline.stopTimes.length,topics.length);
    if(topics.length>1)assert.equal(timeline.stopTimes[1]-timeline.stopTimes[0],2500);
    for(let t=0;t<=timeline.singleDurationMs;t+=37) {
      const frame=sampleTourFrame(timeline,t);
      assert.ok(Object.values(frame.camera).every(Number.isFinite));
      assert.ok(Math.abs(frame.camera.angle)<=Math.PI/15+1e-10);
    }
  }
});

test('long travel slows according to the travelling view while short edges retain their pace',async()=>{
  const data=makeTourData({ids:['Far'],edges:[['A','B',.1],['B','C',.2],['C','D',.1]],
    positions:{A:[0,0],B:[1,0],C:[21,0],D:[21.2,0],Far:[100,0]}});
  const options=normalizeTourInput({topics:['A','C'],order:'given'});
  const plan=await planTourRoute(await buildTourGraph(data),options);
  const viewport={width:1000,height:700};
  const timeline=compileTourTimeline(plan,{data,viewport,options});
  const edges=timeline.segments.filter(segment=>segment.phase==='travel');
  assert.equal(edges[0].durationMs,1500,'The short hop keeps its existing 1.5-second pace');
  assert.ok(edges[1].durationMs>=6000,'A screen-spanning hop gets enough time to read its surroundings');
  assert.ok(edges[1].durationMs<=12000);
  const fixed=compileTourTimeline(plan,{data,viewport,options:normalizeTourInput({topics:['A','C'],order:'given',timing:{edgeMinMs:600,edgeMaxMs:600}})});
  assert.ok(fixed.segments.filter(segment=>segment.phase==='travel').every(segment=>segment.durationMs===600),'Explicit demo timing still wins');
});
