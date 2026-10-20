const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const titleKey = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
function checkpoints({signal, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0))} = {}) {
  let count = 0;
  return async (force = false) => {
    if (signal?.aborted) throw new DOMException('Tour planning cancelled.', 'AbortError');
    if (force || ++count % 512 === 0) {
      await yieldTask();
      if (signal?.aborted) throw new DOMException('Tour planning cancelled.', 'AbortError');
    }
  };
}

export async function buildTourGraph(data, options = {}) {
  const checkpoint = checkpoints(options);
  await checkpoint(true);
  const adjacency = new Map(data.topics.map(topic => [topic.id, new Map()]));
  for (const topic of data.topics) {
    await checkpoint();
    for (const neighbor of topic.neighbors) {
      const weight = Math.min(neighbor.distance, adjacency.get(topic.id).get(neighbor.id) ?? Infinity);
      adjacency.get(topic.id).set(neighbor.id, weight);
      adjacency.get(neighbor.id).set(topic.id, weight);
    }
  }
  const sorted = [...adjacency].sort(([a], [b]) => compare(a, b)).map(([id, neighbors]) =>
    [id, [...neighbors].sort(([a], [b]) => compare(a, b)).map(([id, distance]) => ({id, distance}))]);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sorted)));
  const titleIndex = new Map();
  for (const topic of data.topics) {
    await checkpoint();
    const key = titleKey(topic.topic);
    if (!titleIndex.has(key)) titleIndex.set(key, []);
    titleIndex.get(key).push(topic.id);
  }
  return {id: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join(''),
    byId: data.byId, adjacency: new Map(sorted), titleIndex};
}

const comparePath = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = compare(a[i], b[i]); if (order) return order;
  }
  return a.length - b.length;
};

async function search(graph, from, targets, checkpoint) {
  await checkpoint();
  const queue = [from], depth = new Map([[from, 0]]), cost = new Map([[from, 0]]), paths = new Map([[from, [from]]]);
  let limit = targets.has(from) ? 0 : Infinity;
  for (let i = 0; i < queue.length && depth.get(queue[i]) < limit; i++) {
    await checkpoint();
    const current = queue[i], nextDepth = depth.get(current) + 1;
    for (const edge of graph.adjacency.get(current)) {
      if (depth.has(edge.id) && depth.get(edge.id) < nextDepth) continue;
      const candidateCost = cost.get(current) + edge.distance, path = [...paths.get(current), edge.id];
      if (!depth.has(edge.id)) { depth.set(edge.id, nextDepth); queue.push(edge.id); }
      if (!cost.has(edge.id) || candidateCost < cost.get(edge.id) ||
          candidateCost === cost.get(edge.id) && comparePath(path, paths.get(edge.id)) < 0) {
        cost.set(edge.id, candidateCost); paths.set(edge.id, path);
      }
      if (targets.has(edge.id)) limit = nextDepth;
    }
  }
  return {depth, cost, paths};
}

async function pathBetween(graph, from, to, checkpoint) {
  const reverse = compare(from, to) > 0, start = reverse ? to : from, end = reverse ? from : to;
  const result = await search(graph, start, new Set([end]), checkpoint);
  if (!result.paths.has(end)) return null;
  const nodeIds = [...result.paths.get(end)];
  if (reverse) nodeIds.reverse();
  const distances = nodeIds.slice(1).map((id, i) => graph.adjacency.get(nodeIds[i]).find(edge => edge.id === id).distance);
  return {from, to, nodeIds, distances, hops: distances.length, distance: result.cost.get(end)};
}

export async function planTourRoute(graph, input, options = {}) {
  const checkpoint = checkpoints(options);
  await checkpoint(true);
  let stopIds = [];
  const skipped = [];
  for (const value of input.topics) {
    await checkpoint();
    const matches = graph.byId.has(value) ? [value] : graph.titleIndex.get(titleKey(value)) ?? [];
    if (matches.length === 1) stopIds.push(matches[0]);
    else skipped.push({input: value, reason: matches.length ? 'ambiguous' : 'missing'});
  }
  if (!stopIds.length) return {graphId: graph.id, stopIds, legs: [], returnLeg: null, skipped, issues: [{code: 'empty'}]};
  if (input.startId !== undefined && !stopIds.includes(input.startId)) {
    throw Object.assign(new Error('The starting stop must be one of the tour interests.'), {code:'invalid'});
  }
  if (new Set(stopIds).size < 2) return {graphId:graph.id,stopIds,legs:[],returnLeg:null,skipped,issues:[{code:'insufficient'}]};
  const legs = [];
  if (input.order === 'auto' && stopIds.length) {
    const remaining = new Set(stopIds);
    let current = input.startId ?? stopIds[0];
    stopIds = [current]; remaining.delete(current);
    while (remaining.size) {
      const result = await search(graph, current, remaining, checkpoint);
      const next = [...remaining].filter(id => result.depth.has(id)).sort((a, b) =>
        result.depth.get(a) - result.depth.get(b) || result.cost.get(a) - result.cost.get(b) || compare(a, b))[0];
      if (!next) { stopIds.push(...[...remaining].sort(compare)); break; }
      stopIds.push(next); remaining.delete(next); current = next;
    }
  }
  const issues = [];
  for (let i = 1; i < stopIds.length; i++) {
    const leg = await pathBetween(graph, stopIds[i - 1], stopIds[i], checkpoint);
    if (!leg) { issues.push({code:'unreachable',from:stopIds[i - 1],to:stopIds[i]}); break; }
    legs.push(leg);
  }
  const returnLeg = issues.length ? null : await pathBetween(graph, stopIds.at(-1), stopIds[0], checkpoint);
  await checkpoint();
  return {graphId: graph.id, stopIds, legs, returnLeg, skipped, issues};
}
