import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as yieldTask} from 'node:timers/promises';
import {prepareGalaxy} from '../ui/galaxy-logic.js';
import {normalizeTourInput} from '../ui/galaxy-tour-options.js';
import {buildTourGraph,planTourRoute} from '../ui/galaxy-tour-route.js';
import {createGalaxyTour} from '../ui/galaxy-tour-session.js';

const read = path => readFile(new URL(path,import.meta.url),'utf8').then(JSON.parse);
const [topics,layout] = await Promise.all([read('../../client-assets/catalog.json'),read('../../client-assets/galaxy-layout.json')]);
const data = prepareGalaxy(topics.map(topic=>({...topic,id:topic.topic})),layout);
const graph = await buildTourGraph(data,{yieldTask});

test('the public catalog is connected and each planned hop is an original semantic edge',async t=>{
  const reached=new Set([data.topics[0].id]),queue=[data.topics[0].id];
  for(let i=0;i<queue.length;i++)for(const edge of graph.adjacency.get(queue[i])) {
    if(!reached.has(edge.id)){reached.add(edge.id);queue.push(edge.id);}
  }
  assert.equal(reached.size,data.topics.length);
  const started=performance.now();
  const plan=await planTourRoute(graph,normalizeTourInput({topics:['Photography','Education','Gardening'],order:'given'}),{yieldTask});
  assert.deepEqual(plan.issues,[]);
  for(const leg of [...plan.legs,plan.returnLeg]) {
    for(let i=1;i<leg.nodeIds.length;i++) {
      const a=data.byId.get(leg.nodeIds[i-1]),b=data.byId.get(leg.nodeIds[i]);
      const original=[a.neighbors.find(edge=>edge.id===b.id),b.neighbors.find(edge=>edge.id===a.id)].filter(Boolean);
      assert.ok(original.length,'No invented edge: '+a.id+' → '+b.id);
      assert.equal(leg.distances[i-1],Math.min(...original.map(edge=>edge.distance)));
    }
    // Independent unweighted BFS verifies hop priority on the shipped graph.
    const distances=new Map([[leg.from,0]]),pending=[leg.from];
    for(let i=0;i<pending.length&&!distances.has(leg.to);i++)for(const edge of graph.adjacency.get(pending[i])) {
      if(!distances.has(edge.id)){distances.set(edge.id,distances.get(pending[i])+1);pending.push(edge.id);}
    }
    assert.equal(leg.hops,distances.get(leg.to));
  }
  t.diagnostic(JSON.stringify({topics:data.topics.length,edges:[...graph.adjacency.values()].reduce((n,edges)=>n+edges.length,0)/2,
    sampleMs:Math.round(performance.now()-started),photographyToEducation:plan.legs[0].nodeIds}));
});

test('a many-stop real-catalog session yields, cancels mid-planning, and loads again',async t=>{
  let yields=0,cancelAt=Infinity,tour;
  tour=createGalaxyTour({data,viewport:{width:1000,height:700},yieldTask:async()=>{
    await yieldTask();if(++yields===cancelAt)tour.exit();
  }});
  await tour.load({topics:['Photography','Education']});
  yields=0;cancelAt=3;
  const started=performance.now();
  const many=Array.from({length:160},(_,i)=>data.topics[Math.floor(i*data.topics.length/160)].id);
  await assert.rejects(tour.load({topics:many}),{name:'AbortError'});
  assert.equal(yields,3);assert.equal(tour.getSnapshot().status,'idle');
  t.diagnostic('Cancellation after yielding: '+(performance.now()-started).toFixed(1)+'ms (not a product deadline).');
  cancelAt=Infinity;
  const next=await tour.load({topics:['Education','Photography'],order:'given'});
  assert.equal(next.status,'ready');assert.deepEqual(next.stopIds,['Education','Photography']);
  tour.destroy();
});
