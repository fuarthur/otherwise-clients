import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTourData} from './fixtures/galaxy-tour.js';
import {normalizeTourInput} from '../ui/galaxy-tour-options.js';
import {buildTourGraph, planTourRoute} from '../ui/galaxy-tour-route.js';

test('a tour uses a direct semantic edge in either direction before a cheaper multi-edge path', async () => {
  const graph = await buildTourGraph(makeTourData({edges: [['A','B',.9], ['A','C',.1], ['C','B',.1]]}));
  const plan = await planTourRoute(graph, normalizeTourInput({topics:['B','A'], order:'given'}));
  assert.deepEqual(plan.legs[0].nodeIds, ['B','A']);
  assert.equal(plan.legs[0].hops, 1);
  assert.equal(plan.legs[0].distance, .9);
  assert.deepEqual(plan.returnLeg.nodeIds, ['A','B']);
});

test('equally short paths prefer lower total semantic distance and reverse consistently', async () => {
  const data = makeTourData({edges:[['A','B',.4],['B','D',.5],['A','C',.2],['C','D',.3]]});
  const graph = await buildTourGraph(data);
  const plan = await planTourRoute(graph, normalizeTourInput({topics:['A','D'], order:'given'}));
  assert.deepEqual(plan.legs[0].nodeIds, ['A','C','D']);
  assert.deepEqual(plan.returnLeg.nodeIds, ['D','C','A']);
});

test('auto visits all resolved interests in a stable nearest-stop order without mutating inputs', async () => {
  const data = makeTourData({edges:[['A','B',.2],['B','C',.3],['C','D',.2]]});
  const graph = await buildTourGraph(data);
  const input = normalizeTourInput({topics:['A','D','B','C','B']});
  const plan = await planTourRoute(graph, input);
  assert.deepEqual(plan.stopIds, ['A','B','C','D']);
  assert.deepEqual(input.topics, ['A','D','B','C','B']);
});

test('full titles resolve uniquely, exact identities win, and missing or ambiguous words are reported', async () => {
  const data = makeTourData({ids:['Java','JAVA','New York'], edges:[['Java','New York',.2],['JAVA','Java',.1]]});
  const graph = await buildTourGraph(data);
  const plan = await planTourRoute(graph, normalizeTourInput({topics:['Java','jAvA','  NEW   YORK ','missing'],order:'given'}));
  assert.deepEqual(plan.stopIds, ['Java','New York']);
  assert.deepEqual(plan.skipped, [{input:'jAvA',reason:'ambiguous'},{input:'missing',reason:'missing'}]);
});

test('empty, single, repeated and disconnected stops produce truthful plans without invented edges', async () => {
  const graph = await buildTourGraph(makeTourData({ids:['A','B','C'],edges:[['A','B',.2]]}));
  assert.deepEqual((await planTourRoute(graph, normalizeTourInput({topics:[]}))).issues, [{code:'empty'}]);
  const single = await planTourRoute(graph, normalizeTourInput({topics:['A']}));
  assert.deepEqual(single.legs, []);
  assert.deepEqual(single.issues, [{code:'insufficient'}]);
  assert.equal(single.returnLeg,null);
  const repeat = await planTourRoute(graph, normalizeTourInput({topics:['A','A','B'],order:'given'}));
  assert.deepEqual(repeat.legs[0].distances, []);
  const broken = await planTourRoute(graph, normalizeTourInput({topics:['A','C'],order:'given'}));
  assert.deepEqual(broken.issues, [{code:'unreachable',from:'A',to:'C'}]);
  assert.ok(broken.legs.every(Boolean));
});

test('a tour requires two distinct mapped topics after aliases and missing topics are resolved',async()=>{
  const graph=await buildTourGraph(makeTourData({edges:[['A','B',.2]]}));
  for(const topics of [['A','missing'],['A','A'],['A',' a ']]) {
    const plan=await planTourRoute(graph,normalizeTourInput({topics,order:'given'}));
    assert.deepEqual(plan.issues,[{code:'insufficient'}]);
    assert.equal(plan.returnLeg,null);
  }
  const plan=await planTourRoute(graph,normalizeTourInput({topics:['A','B','missing']}));
  assert.deepEqual(plan.issues,[]);assert.deepEqual(plan.stopIds,['A','B']);
});

test('invalid timing, playback settings and inapplicable starting stops are rejected', async () => {
  for (const patch of [{unknown:1},{speed:'2'},{speed:3},{loop:'false'},{clean:1},
    {rotationDegrees:13},{order:'random'},{topics:[1]},{timing:{holdMs:0}},
    {timing:{edgeMinMs:3000,edgeMaxMs:1000}},{timing:{introMs:Infinity}},
    {timing:{unknown:1}},{timing:{outroMs:60001}},{order:'given',startId:'A'}]) {
    assert.throws(() => normalizeTourInput({topics:['A'],...patch}), undefined, JSON.stringify(patch));
  }
  const graph = await buildTourGraph(makeTourData({edges:[['A','B',.2]]}));
  await assert.rejects(planTourRoute(graph, normalizeTourInput({topics:['A'],startId:'B'})));
});

test('graph building and search yield and can be cancelled before publishing a plan', async () => {
  const edges = Array.from({length:3000}, (_, i) => ['N'+i,'N'+(i+1),.1]);
  const data = makeTourData({edges});
  const building = new AbortController();
  let yields = 0;
  await assert.rejects(buildTourGraph(data, {signal:building.signal, yieldTask:async () => {
    yields++; building.abort();
  }}), {name:'AbortError'});
  assert.ok(yields > 0);
  const graph = await buildTourGraph(data);
  const searching = new AbortController();
  await assert.rejects(planTourRoute(graph, normalizeTourInput({topics:['N0','N3000'],order:'given'}),
    {signal:searching.signal,yieldTask:async () => searching.abort()}), {name:'AbortError'});
});

test('graph identity and tie choices survive geometry and array ordering changes', async () => {
  const edges = [['A','B',.2],['B','D',.2],['A','C',.2],['C','D',.2]];
  const first = await buildTourGraph(makeTourData({edges}));
  const changed = await buildTourGraph(makeTourData({edges:[...edges].reverse(), positions:{A:[100,300]}}));
  assert.equal(first.id, changed.id);
  const input = normalizeTourInput({topics:['D','A'],order:'given'});
  assert.deepEqual((await planTourRoute(first,input)).legs[0].nodeIds, ['D','B','A']);
  assert.deepEqual(await planTourRoute(first,input), await planTourRoute(changed,input));
});
