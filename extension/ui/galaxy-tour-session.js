import {normalizeTourInput} from './galaxy-tour-options.js';
import {buildTourGraph,planTourRoute} from './galaxy-tour-route.js';
import {compileTourTimeline,sampleTourFrame} from './galaxy-tour-timeline.js';
import {compileTourContext,sampleTourContext} from './galaxy-tour-context.js';

const failure = code => Object.assign(new Error('Galaxy tour: '+code),{code});

/** Window-local playback. Its only effects are frames and explicitly supplied events. */
export function createGalaxyTour({data,viewport,reducedMotion=false,now=()=>performance.now(),
  requestFrame=callback=>globalThis.requestAnimationFrame(callback),cancelFrame=id=>globalThis.cancelAnimationFrame(id),
  yieldTask,onFrame=()=>{},onChange=()=>{},onStop=()=>{},onSeek=()=>{}}) {
  let status='idle',input=null,plan=null,timeline=null,context=null,graph=null,graphData=null;
  let timeMs=0,lastNow=0,handle=0,generation=0,abort=null,lastFrame=null,error=null,loopCount=0,lastStop=null;
  let effectiveLoop=false,pendingLoop=null,closing=null,loadingInput=null;
  const alive=()=>{if(status==='destroyed')throw failure('destroyed');};
  const ready=()=>{alive();if(!timeline)throw failure('not-ready');};
  const duration=()=>!timeline?0:closing?closing.startMs+input.timing.outroMs:
    effectiveLoop?timeline.introMs+timeline.loopDurationMs:timeline.singleDurationMs;
  function getSnapshot() {
    return {status,timeMs,durationMs:duration(),singleDurationMs:timeline?.singleDurationMs??0,
      loopDurationMs:timeline?.loopDurationMs??0,loopCount,stopIds:[...plan?.stopIds??[]],stopTimes:[...timeline?.stopTimes??[]],
      skipped:(plan?.skipped??[]).map(item=>({...item})),issues:(plan?.issues??[]).map(item=>({...item})),
      speed:input?.speed??1,loop:effectiveLoop,pendingLoop,clean:input?.clean??false,
      phase:lastFrame?.phase??null,phaseKey:lastFrame?.phaseKey??null,phaseProgress:lastFrame?.phaseProgress??0,
      stopIndex:lastFrame?.stopIndex??0,error:error?{code:error.code??'failed',message:error.message}:null};
  }
  const publish=()=>onChange(getSnapshot());
  function emitFrame({announce=true,forceStop=false}={}) {
    if(!timeline || status==='destroyed')return;
    const previous=lastFrame?.phaseKey,epoch=generation;
    const activeTimeline=closing?.timeline??timeline;
    const frameTime=closing?input.timing.holdMs+timeMs-closing.startMs:timeMs;
    lastFrame=sampleTourFrame(activeTimeline,frameTime,{viewport,loop:effectiveLoop,reducedMotion});
    const emitted=lastFrame;
    if(closing)lastFrame.route={nodeIds:timeline.loopRouteIds,completedEdges:timeline.loopRouteIds.length-1};
    const labels=sampleTourContext(closing?.context??context,lastFrame,viewport);
    onFrame({...lastFrame,labels,timeMs,durationMs:duration()});
    if(epoch!==generation||lastFrame!==emitted||status==='destroyed'||!timeline)return;
    if(announce && lastFrame.phase==='hold') {
      const key=loopCount+':'+lastFrame.stopIndex;
      if(forceStop||lastStop!==key) {
        lastStop=key;
        onStop({id:plan.stopIds[lastFrame.stopIndex],index:lastFrame.stopIndex,loopCount});
        if(epoch!==generation||lastFrame!==emitted||!timeline)return;
      }
    }
    if(previous!==lastFrame.phaseKey)publish();
  }
  function stopFrame() { if(handle)cancelFrame(handle);handle=0; }
  function finishReturn(boundary) {
    const first=plan.stopIds[0];
    const closePlan={...plan,stopIds:[first],legs:[],returnLeg:{from:first,to:first,nodeIds:[first],distances:[],hops:0,distance:0}};
    const closeInput={...input,timing:{...input.timing,introMs:0}};
    const closeTimeline=compileTourTimeline(closePlan,{data,viewport,options:closeInput});
    closing={startMs:boundary,timeline:closeTimeline,
      context:compileTourContext(closePlan,closeTimeline,{data,viewport})};
    effectiveLoop=false;pendingLoop=null;
  }
  function applyPendingLoop(targetTime) {
    if(pendingLoop===null||!lastFrame||lastFrame.phase==='outro'||closing)return;
    const segments=effectiveLoop?timeline.loopSegments:timeline.segments;
    const segment=segments.find(segment=>segment.phaseKey===lastFrame.phaseKey);
    if(!segment||targetTime<segment.startMs+segment.durationMs)return;
    if(effectiveLoop&&!pendingLoop&&lastFrame.legIndex===plan.legs.length) {
      const boundary=timeline.introMs+timeline.loopDurationMs;
      if(targetTime>=boundary)finishReturn(boundary);
    } else { effectiveLoop=pendingLoop;pendingLoop=null; }
  }
  function advance() {
    const current=now();
    timeMs+=Math.max(0,current-lastNow)*(input?.speed??1);lastNow=current;
    applyPendingLoop(timeMs);
    if(timeMs>=duration()) {
      if(effectiveLoop) {
        loopCount+=Math.floor((timeMs-timeline.introMs)/timeline.loopDurationMs);
        timeMs=timeline.introMs+(timeMs-timeline.introMs)%timeline.loopDurationMs;
      } else {timeMs=duration();status='ended';stopFrame();}
    }
    emitFrame();
  }
  function schedule() {
    if(handle||status!=='playing')return;
    handle=requestFrame(()=>{handle=0;if(status!=='playing')return;advance();if(status==='playing')schedule();else publish();});
  }
  function pause() {
    if(status==='playing') {status='paused';stopFrame();advance();publish();}
    return getSnapshot();
  }
  function play() {
    ready();
    if(status==='playing')return getSnapshot();
    if(status==='planning')throw failure('busy');
    if(status==='ended'){timeMs=0;loopCount=0;lastStop=null;effectiveLoop=input.loop;pendingLoop=null;closing=null;}
    status='playing';lastNow=now();emitFrame();publish();schedule();return getSnapshot();
  }
  async function load(raw) {
    alive();
    const nextInput=normalizeTourInput(raw);
    const previous={input,plan,timeline,context,timeMs,lastFrame,effectiveLoop,pendingLoop,closing};
    if(status==='playing')pause();
    abort?.abort();const controller=new AbortController();abort=controller;
    const epoch=++generation;
    loadingInput=nextInput;
    status='planning';error=null;stopFrame();publish();
    try {
      const nextGraph=graphData===data&&graph?graph:await buildTourGraph(data,{signal:controller.signal,yieldTask});
      const nextPlan=await planTourRoute(nextGraph,nextInput,{signal:controller.signal,yieldTask});
      if(epoch!==generation||controller.signal.aborted)throw new DOMException('Tour replaced.','AbortError');
      graph=nextGraph;graphData=data;input=nextInput;plan=nextPlan;
      timeline=plan.issues.length?null:compileTourTimeline(plan,{data,viewport,options:input});
      context=timeline?compileTourContext(plan,timeline,{data,viewport}):null;
      timeMs=0;loopCount=0;lastStop=null;lastFrame=null;effectiveLoop=input.loop;pendingLoop=null;closing=null;
      status=timeline?'ready':'error';error=timeline?null:failure(plan.issues[0].code);
      emitFrame({announce:false});publish();return getSnapshot();
    } catch(caught) {
      if(epoch!==generation||controller.signal.aborted||status==='destroyed')throw caught;
      ({input,plan,timeline,context,timeMs,lastFrame,effectiveLoop,pendingLoop,closing}=previous);
      error=caught;status=timeline?'paused':'error';publish();throw caught;
    }
  }
  function seek(value) {
    ready();if(!Number.isFinite(value))throw failure('invalid');
    if(closing && value<closing.startMs){closing=null;effectiveLoop=false;}
    timeMs=Math.max(0,Math.min(duration(),value));lastNow=now();
    if(status==='ended'&&timeMs<duration())status='paused';
    emitFrame({forceStop:true});onSeek({timeMs});publish();return getSnapshot();
  }
  function setOptions(patch) {
    ready();
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||
      Object.keys(patch).some(key=>!['speed','loop','clean'].includes(key)))throw failure('invalid');
    const next=normalizeTourInput({...input,...patch});
    if(status==='playing')advance();
    input=next;
    if(status==='ready'&&timeMs===0)effectiveLoop=input.loop;
    else if(patch.loop!==undefined)pendingLoop=input.loop===effectiveLoop?null:input.loop;
    lastNow=now();publish();return getSnapshot();
  }
  async function updateEnvironment(patch) {
    alive();
    const nextViewport=patch.viewport??viewport;
    if(!nextViewport||!Number.isFinite(nextViewport.width)||!Number.isFinite(nextViewport.height)||
      nextViewport.width<0||nextViewport.height<0||
      patch.reducedMotion!==undefined&&typeof patch.reducedMotion!=='boolean')throw failure('invalid');
    viewport={...nextViewport};
    const geometryChanged=patch.data!==undefined&&patch.data!==data;
    const motionChanged=patch.reducedMotion!==undefined&&patch.reducedMotion!==reducedMotion;
    if(!geometryChanged&&!motionChanged) {emitFrame({announce:false});publish();return getSnapshot();}
    if(status==='planning') {
      if(geometryChanged)data=patch.data;
      if(patch.reducedMotion!==undefined)reducedMotion=patch.reducedMotion;
      return load(loadingInput);
    }
    pause();
    const priorFrame=lastFrame,closeStart=closing?.startMs;
    const nextData=patch.data??data;
    const epoch=++generation;abort?.abort();const controller=new AbortController();abort=controller;
    const nextGraph=geometryChanged&&timeline?await buildTourGraph(nextData,{signal:controller.signal,yieldTask}):graph;
    if(epoch!==generation||controller.signal.aborted)throw new DOMException('Environment replaced.','AbortError');
    data=nextData;
    if(patch.reducedMotion!==undefined)reducedMotion=patch.reducedMotion;
    if(!timeline){graph=null;graphData=null;publish();return getSnapshot();}
    if(nextGraph.id!==plan.graphId) {
      stopFrame();timeline=null;context=null;plan=null;lastFrame=null;status='error';error=failure('changed');
      graph=nextGraph;graphData=data;publish();return getSnapshot();
    }
    graph=nextGraph;graphData=data;
    timeline=compileTourTimeline(plan,{data,viewport,options:input});
    context=compileTourContext(plan,timeline,{data,viewport});
    if(closeStart!==undefined)finishReturn(closeStart);
    const active=closing?.timeline??timeline,segments=effectiveLoop?active.loopSegments:active.segments;
    const phase=segments.find(segment=>segment.phaseKey===priorFrame?.phaseKey);
    if(phase)timeMs=phase.startMs+priorFrame.phaseProgress*phase.durationMs+(closing?closing.startMs-input.timing.holdMs:0);
    emitFrame({announce:false});publish();return getSnapshot();
  }
  function exit() {
    if(status==='destroyed')return getSnapshot();
    ++generation;abort?.abort();abort=null;stopFrame();
    input=null;loadingInput=null;plan=null;timeline=null;context=null;lastFrame=null;error=null;timeMs=0;loopCount=0;lastStop=null;
    effectiveLoop=false;pendingLoop=null;closing=null;status='idle';publish();return getSnapshot();
  }
  function destroy() {
    if(status==='destroyed')return getSnapshot();
    exit();status='destroyed';graph=null;graphData=null;publish();return getSnapshot();
  }
  return {load,play,pause,seek,setOptions,updateEnvironment,exit,destroy,getSnapshot};
}
