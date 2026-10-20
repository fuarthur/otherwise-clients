import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTourData,createTourClock} from './fixtures/galaxy-tour.js';
import {createGalaxyTour} from '../ui/galaxy-tour-session.js';

const data=()=>makeTourData({edges:[['A','B',.2],['B','C',.3]]});
function session(extra={}) {
  const clock=createTourClock(),frames=[],stops=[],seeks=[];
  const tour=createGalaxyTour({data:data(),viewport:{width:1000,height:700},...clock,
    onFrame:f=>frames.push(f),onStop:s=>stops.push(s),onSeek:s=>seeks.push(s),...extra});
  return {tour,clock,frames,stops,seeks};
}

test('playback pauses without clock drift, changes speed continuously and schedules a single frame',async()=>{
  const {tour,clock}=session();
  assert.equal((await tour.load({topics:['A','C']})).status,'ready');
  tour.play();tour.play();
  assert.equal(clock.pendingFrames(),1);
  clock.advance(1000);
  assert.equal(tour.getSnapshot().timeMs,1000);
  tour.pause();clock.advance(1000);
  assert.equal(tour.getSnapshot().timeMs,1000);
  tour.setOptions({speed:2});tour.play();clock.advance(100);
  assert.equal(tour.getSnapshot().timeMs,1200);
  tour.destroy();
  assert.equal(clock.pendingFrames(),0);
});

test('seeking preserves pause state and announces only the destination hold',async()=>{
  const {tour,stops,seeks}=session();
  const loaded=await tour.load({topics:['A','B','C'],order:'given'});
  tour.seek(loaded.stopTimes[2]);
  assert.equal(tour.getSnapshot().status,'ready');
  assert.deepEqual(stops.map(stop=>stop.id),['C']);
  assert.equal(seeks.length,1);
  const original=tour.getSnapshot().timeMs;
  assert.throws(()=>tour.seek(Infinity));
  assert.equal(tour.getSnapshot().timeMs,original);
  tour.seek(-1);assert.equal(tour.getSnapshot().timeMs,0);
  assert.throws(()=>tour.setOptions({speed:Infinity}));
  await assert.rejects(tour.load({topics:['A'],unknown:true}));
  assert.deepEqual(tour.getSnapshot().stopIds,['A','B','C']);
  tour.destroy();
});

test('looping takes the real return path, wraps to the first hold, and can stop at the first star after return',async()=>{
  const {tour,clock,frames}=session();
  const loaded=await tour.load({topics:['A','C'],order:'given',loop:true});
  tour.play();clock.advance(loaded.durationMs+100);
  assert.equal(tour.getSnapshot().loopCount,1);
  assert.equal(tour.getSnapshot().phase,'hold');
  assert.equal(tour.getSnapshot().stopIndex,0);
  const returning=loaded.durationMs-700;
  tour.seek(returning);
  assert.equal(frames.at(-1).legIndex,1);
  tour.setOptions({loop:false});
  const before=frames.at(-1).position;
  clock.advance(100);
  assert.ok(Math.hypot(frames.at(-1).position.x-before.x,frames.at(-1).position.y-before.y)<1);
  clock.advance(700);
  assert.equal(tour.getSnapshot().phase,'outro');
  assert.equal(frames.at(-1).topicId,'A');
  clock.advance(3000);
  assert.equal(tour.getSnapshot().status,'ended');
  tour.destroy();
});

test('layout and motion changes pause and preserve phase progress while resize preserves time',async()=>{
  const {tour,clock,frames}=session();
  await tour.load({topics:['A','C'],order:'given'});
  tour.play();clock.advance(6500);
  const before=tour.getSnapshot();
  await tour.updateEnvironment({viewport:{width:320,height:500}});
  assert.equal(tour.getSnapshot().timeMs,before.timeMs);
  const moved=makeTourData({edges:[['A','B',.2],['B','C',.3]],positions:{A:[10,0],B:[14,2],C:[18,3]}});
  await tour.updateEnvironment({data:moved,reducedMotion:true});
  assert.equal(tour.getSnapshot().status,'paused');
  assert.equal(tour.getSnapshot().phaseKey,before.phaseKey);
  assert.ok(Math.abs(tour.getSnapshot().phaseProgress-before.phaseProgress)<1e-9);
  assert.equal(frames.at(-1).camera.angle,0);
  tour.destroy();
});

test('late loads cannot replace newer tours or revive exited and destroyed sessions',async()=>{
  let release,first=true;
  const gate=new Promise(resolve=>release=resolve);
  const {tour,clock,frames}=session({yieldTask:()=>{if(first){first=false;return gate;}return Promise.resolve();}});
  const old=tour.load({topics:['A','B']});
  await tour.load({topics:['C','B'],order:'given'});
  release();
  await assert.rejects(old,{name:'AbortError'});
  assert.deepEqual(tour.getSnapshot().stopIds,['C','B']);
  tour.exit();assert.equal(tour.getSnapshot().status,'idle');
  assert.throws(()=>tour.play());
  tour.destroy();const count=frames.length;clock.advance(10000);
  assert.equal(frames.length,count);
  await assert.rejects(tour.load({topics:['A']}),{code:'destroyed'});
  tour.destroy();tour.exit();tour.pause();
});

test('a one-topic or duplicate-only journey cannot play, and adding a second mapped topic recovers',async()=>{
  const {tour}=session();
  for(const topics of [['A'],['A','missing'],['A','A']]) {
    const snapshot=await tour.load({topics});
    assert.equal(snapshot.status,'error');assert.equal(snapshot.error.code,'insufficient');
    assert.throws(()=>tour.play(),{code:'not-ready'});
  }
  assert.equal((await tour.load({topics:['A','C']})).status,'ready');
  assert.equal(tour.play().status,'playing');tour.destroy();
});

test('changing loop at a hold boundary and repeated stops preserves replay and notifications',async()=>{
  const {tour,clock,stops}=session();
  const snap=await tour.load({topics:['A','A','C'],order:'given'});
  assert.equal(snap.stopTimes[1]-snap.stopTimes[0],2500);
  tour.seek(snap.stopTimes[1]);assert.equal(stops.at(-1).index,1);
  tour.setOptions({loop:true});
  tour.play();clock.advance(2501);
  assert.equal(tour.getSnapshot().loop,true);
  assert.ok(tour.getSnapshot().phase!=='intro');
  tour.setOptions({loop:false});clock.advance(30000);
  assert.equal(tour.getSnapshot().status,'ended');
  tour.setOptions({loop:true});tour.play();
  assert.equal(tour.getSnapshot().timeMs,0);
  assert.equal(tour.getSnapshot().loop,true);
  tour.destroy();
});

test('jumping back after completion shows a paused stop instead of the completed poster',async()=>{
  const {tour,clock}=session();
  const loaded=await tour.load({topics:['A','C'],order:'given'});
  tour.play();clock.advance(loaded.durationMs+1);
  assert.equal(tour.getSnapshot().status,'ended');
  tour.seek(loaded.stopTimes[0]);
  assert.equal(tour.getSnapshot().status,'paused');
  assert.equal(tour.getSnapshot().phase,'hold');
  tour.destroy();
});

test('arrival callbacks can exit or destroy without publishing another frame or throwing',async()=>{
  for(const method of ['exit','destroy']) {
    let tour;
    const fixture=session({onStop:()=>tour[method]()});tour=fixture.tour;
    await tour.load({topics:['A','C']});tour.play();
    assert.doesNotThrow(()=>fixture.clock.advance(2500));
    assert.equal(tour.getSnapshot().status,method==='exit'?'idle':'destroyed');
    const count=fixture.frames.length;fixture.clock.advance(10000);
    assert.equal(fixture.frames.length,count);assert.equal(fixture.clock.pendingFrames(),0);
    tour.destroy();
  }
});

test('an arrival callback seeking another stop keeps the new arrival identity',async()=>{
  let tour,stopTimes;const arrivals=[];
  const fixture=session({onStop:stop=>{
    arrivals.push(stop.id);if(stop.id==='A')tour.seek(stopTimes[2]);
  }});tour=fixture.tour;
  ({stopTimes}=await tour.load({topics:['A','B','C'],order:'given'}));
  tour.play();fixture.clock.advance(2500);fixture.clock.advance(1);
  assert.equal(tour.getSnapshot().stopIndex,2);assert.deepEqual(arrivals,['A','C']);
  tour.destroy();
});

test('a frame callback can pause playback without recursive frame publication',async()=>{
  let tour,pausing=false;
  const fixture=session({onFrame:frame=>{if(pausing&&frame.phase==='hold')tour.pause();}});tour=fixture.tour;
  await tour.load({topics:['A','C']});tour.play();pausing=true;
  assert.doesNotThrow(()=>fixture.clock.advance(2500));
  assert.equal(tour.getSnapshot().status,'paused');assert.equal(fixture.clock.pendingFrames(),0);
  tour.destroy();
});
