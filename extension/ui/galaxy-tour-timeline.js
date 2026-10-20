import {cameraScale, fitGalaxyCamera} from './galaxy-logic.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => t === 0 ? a : t === 1 ? b : a + (b - a) * t;
const xy = point => ({x:point.x,y:point.y});
const travelPixelsPerSecond = 120;

export function compileTourTimeline(plan, {data, viewport, options}) {
  const {timing} = options;
  const overview = {...fitGalaxyCamera(data.bounds,viewport),angle:0};
  const scale = cameraScale(overview,viewport,data.bounds);
  const maxBank = options.rotationDegrees * Math.PI / 180;
  const stopPose = id => {
    const point = data.byId.get(id);
    const distances = point.neighbors.map(edge => data.byId.get(edge.id))
      .map(other => Math.hypot(other.x-point.x,other.y-point.y)).filter(n=>n>0).sort((a,b)=>a-b);
    const radius = distances[Math.min(3,distances.length-1)] || 1;
    const targetScale = Math.max(80,Math.min(viewport.width,viewport.height)*.27)/radius;
    return {x:point.x,y:point.y,zoom:clamp(targetScale/Math.max(scale,1e-6)*overview.zoom,2.6,9),angle:0};
  };
  const poses = plan.stopIds.map(stopPose), stopTimes = [], segments = [];
  let time = 0, completedEdges = 0;
  const push = (phase, key, durationMs, fromCamera, toCamera, details) => {
    if (durationMs > 0) segments.push({phase,phaseKey:key,startMs:time,durationMs,fromCamera,toCamera,...details});
    time += durationMs;
  };
  const routeIds = plan.legs.reduce((ids,leg) => [...ids,...leg.nodeIds.slice(1)], [plan.stopIds[0]]);
  const initial = {stopIndex:0,topicId:plan.stopIds[0],nextId:plan.stopIds[0],legIndex:-1,edgeIndex:-1,
    fromPoint:xy(data.byId.get(plan.stopIds[0])),toPoint:xy(data.byId.get(plan.stopIds[0])),completedEdges:0};
  push('intro','intro',timing.introMs,overview,poses[0],initial);
  const addLeg = (leg, index, fromPose, toPose, stopIndex) => {
    if (!leg.hops) return;
    const points = leg.nodeIds.map(id => data.byId.get(id));
    const cruiseZoom = Math.max(1.2,Math.min(fromPose.zoom,toPose.zoom)*.65);
    const cameras = points.map((point,i) => {
      if (i === points.length-1) return toPose;
      const next = points[i+1], heading = Math.atan2(next.y-point.y,next.x-point.x);
      return {x:point.x+(next.x-point.x)*.12,y:point.y+(next.y-point.y)*.12,
        zoom:cruiseZoom,angle:Math.sin(heading)*maxBank};
    });
    if (timing.departMs === 0) cameras[0] = fromPose;
    const details = {stopIndex,topicId:leg.from,nextId:leg.to,legIndex:index,
      edgeIndex:-1,fromPoint:xy(points[0]),toPoint:xy(points[0]),completedEdges};
    push('depart','depart:'+index,timing.departMs,fromPose,cameras[0],details);
    const travelScale=cameraScale({zoom:cruiseZoom},viewport,data.bounds);
    const durations = points.slice(1).map((point,i) => {
      const distance=Math.hypot(point.x-points[i].x,point.y-points[i].y);
      return clamp(Math.ceil(Math.max(distance*scale/80,distance*travelScale/travelPixelsPerSecond)*1000),
        timing.edgeMinMs,timing.edgeMaxMs);
    });
    const velocity = i => i === 0 || i === cameras.length-1 ? {x:0,y:0} :
      {x:(cameras[i+1].x-cameras[i-1].x)/(durations[i-1]+durations[i]),
        y:(cameras[i+1].y-cameras[i-1].y)/(durations[i-1]+durations[i])};
    for (let i=0;i<points.length-1;i++) {
      push('travel','edge:'+index+':'+i,durations[i],cameras[i],cameras[i+1],
        {...details,edgeIndex:i,fromPoint:xy(points[i]),toPoint:xy(points[i+1]),completedEdges,
          velocityFrom:velocity(i),velocityTo:velocity(i+1)});
      completedEdges++;
    }
  };
  for (let i=0;i<plan.stopIds.length;i++) {
    stopTimes.push(time);
    const point = xy(data.byId.get(plan.stopIds[i]));
    push('hold','hold:'+i,timing.holdMs,poses[i],poses[i],{...initial,stopIndex:i,
      topicId:plan.stopIds[i],nextId:plan.stopIds[i+1] ?? plan.stopIds[0],fromPoint:point,toPoint:point,completedEdges});
    if (i<plan.legs.length) addLeg(plan.legs[i],i,poses[i],poses[i+1],i);
  }
  const outboundEnd = time, outbound = [...segments];
  const last = plan.stopIds.length-1, lastPoint = xy(data.byId.get(plan.stopIds[last]));
  const ending = {...initial,stopIndex:last,topicId:plan.stopIds[last],nextId:null,
    fromPoint:lastPoint,toPoint:lastPoint,completedEdges};
  push('outro','outro',timing.outroMs,poses[last],overview,ending);
  const singleDurationMs = time, singleSegments = [...segments];
  segments.length = 0; segments.push(...outbound); time = outboundEnd;
  addLeg(plan.returnLeg,plan.legs.length,poses[last],poses[0],last);
  const loopSegments = [...segments], loopDurationMs = time-timing.introMs;
  return {segments:singleSegments,loopSegments,stopTimes,singleDurationMs,loopDurationMs,
    introMs:timing.introMs,routeIds,loopRouteIds:[...routeIds,...plan.returnLeg.nodeIds.slice(1)],
    overview,poses,plan,data,options};
}

export function sampleTourFrame(timeline, timeMs, {viewport,loop=false,reducedMotion=false} = {}) {
  const list = loop ? timeline.loopSegments : timeline.segments;
  const duration = loop ? timeline.introMs+timeline.loopDurationMs : timeline.singleDurationMs;
  const time = clamp(timeMs,0,duration);
  let low=0,high=list.length-1;
  while(low<high) { const middle=(low+high+1)>>1; if(list[middle].startMs<=time)low=middle;else high=middle-1; }
  const segment = list[low], p=clamp((time-segment.startMs)/segment.durationMs,0,1), ease=smooth(p);
  const camera = Object.fromEntries(['x','y','zoom','angle'].map(key =>
    [key,mix(segment.fromCamera[key],segment.toCamera[key],ease)]));
  if (segment.phase === 'travel' && p > 0 && p < 1) {
    const p2=p*p,p3=p2*p;
    for (const key of ['x','y']) camera[key] =
      (2*p3-3*p2+1)*segment.fromCamera[key]+(p3-2*p2+p)*segment.durationMs*segment.velocityFrom[key]+
      (-2*p3+3*p2)*segment.toCamera[key]+(p3-p2)*segment.durationMs*segment.velocityTo[key];
  }
  let opacity = 1;
  if (reducedMotion) {
    Object.assign(camera,segment.phase === 'outro' ? timeline.overview : timeline.poses[segment.stopIndex],{angle:0});
    if (['intro','outro'].includes(segment.phase)) opacity = smooth(p);
    else if (segment.phase === 'hold') opacity = Math.min(1,p*segment.durationMs/180);
  }
  return {camera,phase:segment.phase,phaseKey:segment.phaseKey,phaseProgress:p,
    legIndex:segment.legIndex,edgeIndex:segment.edgeIndex,edgeProgress:p,stopIndex:segment.stopIndex,
    topicId:segment.topicId,nextId:segment.nextId,
    position:reducedMotion ? xy(timeline.data.byId.get(segment.topicId)) :
      {x:mix(segment.fromPoint.x,segment.toPoint.x,p),y:mix(segment.fromPoint.y,segment.toPoint.y,p)},
    route:{nodeIds:loop?timeline.loopRouteIds:timeline.routeIds,completedEdges:segment.completedEdges+(p===1&&segment.phase==='travel'?1:0)},
    opacity};
}
