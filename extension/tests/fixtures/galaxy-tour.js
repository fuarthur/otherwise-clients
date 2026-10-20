import {prepareGalaxy} from '../../ui/galaxy-logic.js';

export function makeTourData({edges = [], ids = [], positions = {}} = {}) {
  const names = [...new Set([...ids, ...edges.flatMap(([from, to]) => [from, to])])];
  const catalog = names.map(id => ({id, topic: id, domain: 'Science', description: 'A public test topic.'}));
  return prepareGalaxy(catalog, {
    schema_version: 1, cache_key: 'tour-fixture', metadata: {},
    domains: [{id: 'Science', x: 0, y: 0}],
    topics: names.map((id, index) => ({
      id, x: positions[id]?.[0] ?? index * 2, y: positions[id]?.[1] ?? index % 2,
      neighbors: edges.filter(([from]) => from === id).map(([, id, distance]) => ({id, distance})),
    })),
  });
}

export function createTourClock() {
  let time=0, id=0;
  const pending=new Map();
  return {
    now:()=>time,
    requestFrame:callback=>{ pending.set(++id,callback); return id; },
    cancelFrame:handle=>pending.delete(handle),
    advance(ms) { time+=ms; const callbacks=[...pending.values()];pending.clear();for(const callback of callbacks)callback(time); },
    pendingFrames:()=>pending.size,
  };
}
