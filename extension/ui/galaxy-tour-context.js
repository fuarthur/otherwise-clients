const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;

export function compileTourContext(plan, timeline, {data,viewport}) {
  const span=Math.max(data.bounds.maxX-data.bounds.minX,data.bounds.maxY-data.bounds.minY,1),cell=span/60,grid=new Map();
  const key=(x,y)=>Math.floor(x/cell)+':'+Math.floor(y/cell);
  for(const topic of data.topics) {
    const k=key(topic.x,topic.y); if(!grid.has(k))grid.set(k,[]); grid.get(k).push(topic);
  }
  const nearby = (center,current,next) => {
    const found=new Map(),gx=Math.floor(center.x/cell),gy=Math.floor(center.y/cell);
    for(let radius=0;radius<=4 && found.size<24;radius++) {
      for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++) {
        if(radius && Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
        for(const topic of grid.get((gx+dx)+':'+(gy+dy))||[])found.set(topic.id,topic);
      }
    }
    for(const id of [current,next])for(const edge of data.byId.get(id)?.neighbors||[]) {
      found.set(edge.id,data.byId.get(edge.id));
    }
    const pool=[...found.values()].filter(topic=>topic.id!==current&&topic.id!==next).sort((a,b)=>
      Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y)||order(a.id,b.id));
    const chosen=[],quadrants=new Set();
    for(const topic of pool) {
      const quadrant=(topic.x>=center.x?1:0)+(topic.y>=center.y?2:0);
      if(quadrants.has(quadrant))continue;
      quadrants.add(quadrant);chosen.push(topic);
    }
    for(const topic of pool)if(!chosen.includes(topic)&&chosen.length<8)chosen.push(topic);
    return chosen.slice(0,6);
  };
  const phases=new Map();
  for(const segment of [...timeline.segments,...timeline.loopSegments]) {
    if(phases.has(segment.phaseKey))continue;
    const leg=segment.legIndex===plan.legs.length?plan.returnLeg:plan.legs[segment.legIndex];
    const current=segment.phase==='travel'?leg.nodeIds[segment.edgeIndex]:segment.topicId;
    const next=segment.phase==='travel'?leg.nodeIds[segment.edgeIndex+1]:segment.nextId;
    const primary=[current,...(next&&next!==current?[next]:[])].map((id,index)=>({
      ...data.byId.get(id),text:data.byId.get(id).topic,kind:index?'hovered':'selected',offsets:[[12,index?23:-14]],primary:true,
    }));
    const count=segment.phase==='travel'?2:1,buckets=[];
    for(let i=0;i<count;i++) {
      const progress=(i+.5)/count;
      const center={x:segment.fromPoint.x+(segment.toPoint.x-segment.fromPoint.x)*progress,
        y:segment.fromPoint.y+(segment.toPoint.y-segment.fromPoint.y)*progress};
      const background=nearby(center,current,next).map((topic,index)=>({
        ...topic,text:topic.topic,kind:'saved',offsets:[[index%2? -24:12,index%3===0?-18:index%3===1?24:42]],primary:false,
      }));
      const domain=data.domains.find(domain=>domain.id===data.byId.get(current).domain);
      buckets.push([...primary,...background,...(domain?[{...domain,text:domain.id,kind:'domain',offsets:[[12,-30]]}]:[])]);
    }
    phases.set(segment.phaseKey,{buckets,durationMs:segment.durationMs});
  }
  return {phases};
}

export function sampleTourContext(context,frame,viewport) {
  const phase=context.phases.get(frame.phaseKey);
  if(!phase)return [];
  const count=phase.buckets.length;
  const index=Math.min(count-1,Math.floor(frame.phaseProgress*count));
  const local=frame.phaseProgress*count-index;
  const fade=Math.min(1,local*phase.durationMs/count/220,(1-local)*phase.durationMs/count/220);
  let topics=0,domains=0;
  return phase.buckets[index].filter(label=>{
    if(label.kind==='domain')return domains++<1;
    return topics++<(viewport.width<450?5:8);
  }).map(label=>({...label,alpha:label.primary?1:Math.max(0,fade)}));
}
