import {openDialog,closeDialog} from './dialog-motion.js';
import {TOUR_MUSIC_TRACKS,TOUR_MUSIC_MODES,normalizeTourMusicMode} from '../core/galaxy-tour-music.js';

const repeatPath='<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>';
const modeIcons={list:repeatPath,single:repeatPath+'<path d="m10 10 2-1v6m-2 0h4"/>',shuffle:'<path d="m18 3 4 4-4 4m0 2 4 4-4 4M2 5h3c6 0 8 14 14 14h3M2 19h3c2 0 4-2 6-5m2-4c2-3 4-5 6-5h3"/>'};
const modeSvg=mode=>'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+modeIcons[mode]+'</svg>';
const clock = ms => {const seconds=Math.max(0,Math.ceil(ms/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};

export function createGalaxyTourControls({host,text,onAction,getTopic=id=>({topic:id})}) {
  const element=document.createElement('div');element.className='galaxy-tour-layer';element.hidden=true;
  const musicPicker=()=>'<div class="galaxy-tour-music-row"><label class="galaxy-tour-music"><span data-tour-copy="tourMusic"></span><select data-tour-action="music">'+TOUR_MUSIC_TRACKS.map(track=>'<option value="'+track.id+'" data-tour-copy="'+track.name+'"></option>').join('')+'<option value="off" data-tour-copy="tourMusicOff"></option></select></label><button class="galaxy-tour-music-mode" type="button" data-tour-action="music-mode"></button></div>';
  const audioControls=()=>'<div class="galaxy-tour-audio">'+musicPicker()+'<label class="galaxy-tour-volume"><span data-tour-copy="tourMusicVolume"></span><input type="range" min="0" max="100" step="1" value="22" data-tour-action="music-volume"><output>22%</output></label></div>';
  const scopeControls='<section class="galaxy-tour-scope" hidden><p class="galaxy-tour-scope-title" data-tour-copy="tourScope"></p><div class="galaxy-tour-scope-modes" role="group" data-tour-label="tourScope">'+[['all','tourScopeAll'],['group','tourScopeGroup'],['category','tourScopeCategory']].map(([value,key])=>'<button type="button" data-tour-action="scope-mode" value="'+value+'" aria-pressed="false" data-tour-copy="'+key+'"></button>').join('')+'</div><fieldset class="galaxy-tour-scope-list"><legend></legend><div class="galaxy-tour-scope-choices"></div></fieldset><p class="galaxy-tour-scope-help" data-tour-copy="tourScopeHelp"></p></section>';
  element.innerHTML='<dialog class="galaxy-tour-setup"><div class="galaxy-tour-setup-heading"><h2 data-tour-copy="tourTitle"></h2><button type="button" data-tour-action="exit" data-tour-label="tourClose">×</button></div>'+scopeControls+'<p class="galaxy-tour-summary" role="status"></p><section class="galaxy-tour-skipped" hidden><h3 data-tour-copy="tourSkipped"></h3><ul></ul></section><p class="galaxy-tour-error" role="alert" hidden></p>'+audioControls()+'<div class="galaxy-tour-setup-actions"><button type="button" class="primary" data-tour-action="start" data-tour-copy="tourStart"></button><button type="button" data-tour-action="interests" data-tour-copy="tourOpenInterests" hidden></button></div></dialog>'+
    '<section class="galaxy-tour-caption" aria-live="off"><p class="galaxy-tour-eyebrow"></p><h2></h2><p class="galaxy-tour-domain"></p><p class="galaxy-tour-subtitle"></p></section>'+
    '<div class="galaxy-tour-bar" role="toolbar"><div class="galaxy-tour-transport"><button type="button" data-tour-action="previous" data-tour-label="tourPrevious">←</button><button type="button" data-tour-action="play"><span aria-hidden="true">▶</span> <span data-tour-copy="tourPlay"></span></button><button type="button" data-tour-action="pause"><span aria-hidden="true">Ⅱ</span> <span data-tour-copy="tourPause"></span></button><button type="button" data-tour-action="next" data-tour-label="tourNext">→</button></div><div class="galaxy-tour-timeline"><progress max="1" value="0"></progress><output></output></div>'+audioControls()+'<div class="galaxy-tour-options"><label><span class="galaxy-sr-only" data-tour-copy="tourSpeed"></span><select data-tour-action="speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><button type="button" data-tour-action="loop" data-tour-label="tourLoop" aria-pressed="false">↻</button><button type="button" data-tour-action="clean" data-tour-label="tourClean" aria-pressed="false">◌</button><button type="button" data-tour-action="fullscreen" data-tour-label="fullscreen">⛶</button><button type="button" data-tour-action="exit" data-tour-label="tourExit">×</button></div></div>';
  host.append(element);
  const $=selector=>element.querySelector(selector),dialog=$('dialog'),cleanups=[];
  let snapshot={status:'idle',stopIds:[],skipped:[]},timer=0,setup=false,skippedKey='',renderKey='',scopeChoicesKey='',lastScope=null;
  const on=(target,event,callback)=>{target.addEventListener(event,callback);cleanups.push(()=>target.removeEventListener(event,callback));};
  const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  function reveal() {
    element.dataset.idle='false';clearTimeout(timer);
    if(snapshot.clean)timer=setTimeout(()=>{
      if(!element.contains(document.activeElement)||!document.activeElement.matches(':focus-visible'))element.dataset.idle='true';
    },2200);
  }
  function copy() {
    renderKey='';
    for(const node of element.querySelectorAll('[data-tour-copy]'))setText(node,text(node.dataset.tourCopy));
    for(const node of element.querySelectorAll('[data-tour-label]')) {
      const label=text(node.dataset.tourLabel);node.setAttribute('aria-label',label);node.title=label;
    }
    $('.galaxy-tour-bar').setAttribute('aria-label',text('tourProgress'));
    $('progress').setAttribute('aria-label',text('tourProgress'));
  }
  function renderScope(scope) {
    $('.galaxy-tour-scope').hidden=!scope;
    if(!scope)return;
    for(const button of element.querySelectorAll('[data-tour-action="scope-mode"]'))button.setAttribute('aria-pressed',String(button.value===scope.mode));
    $('.galaxy-tour-scope-list').hidden=scope.mode==='all'||!scope.choices.length;
    $('.galaxy-tour-scope-list legend').textContent=text(scope.mode==='group'?'tourScopeChooseGroups':'tourScopeChooseCategories');
    const choices=scope.choices.map(choice=>[choice.id,choice.name||text('tourScopeUnclassified'),text('tourScopeTopicCount',{count:choice.count})]);
    const key=JSON.stringify([scope.mode,choices]);
    if(key!==scopeChoicesKey) {
      scopeChoicesKey=key;const list=$('.galaxy-tour-scope-choices');list.replaceChildren();
      for(const [id,name,count] of choices) {
        const label=document.createElement('label'),input=document.createElement('input'),title=document.createElement('span'),total=document.createElement('small');
        label.className='galaxy-tour-scope-option';input.type='checkbox';input.value=id;input.dataset.tourAction='scope-choice';
        title.textContent=name;total.textContent=count;label.append(input,title,total);list.append(label);
      }
    }
    const selected=new Set(scope.ids);
    for(const input of element.querySelectorAll('[data-tour-action="scope-choice"]'))input.checked=selected.has(input.value);
  }
  function update(next) {
    const wasClean=snapshot.clean;
    snapshot=next;
    $('progress').max=Math.max(1,next.durationMs);$('progress').value=next.timeMs;
    setText($('.galaxy-tour-timeline output'),clock(next.timeMs)+' / '+clock(next.durationMs));
    const key=JSON.stringify([next.status,next.rejoining,next.phaseKey,next.stopIndex,next.speed,next.loop,next.pendingLoop,next.clean,next.music,next.musicVolume,next.musicMode,next.error,next.stopIds,next.skipped]);
    if(renderKey===key&&lastScope===next.scope)return;
    renderKey=key;lastScope=next.scope;renderScope(next.scope);
    const showing=['planning','ready','error'].includes(next.status);
    element.hidden=next.status==='idle'||next.status==='destroyed';
    if(showing&&!setup){setup=true;openDialog(dialog);}
    else if(!showing&&setup){setup=false;closeDialog(dialog);}
    const ready=next.status==='ready'&&new Set(next.stopIds).size>=2;
    $('[data-tour-action="start"]').disabled=!ready;
    $('[data-tour-action="interests"]').hidden=!['empty','insufficient'].includes(next.error?.code);
    const issue=next.error?.code;
    let errorKey=issue==='empty'?'tourEmpty':issue==='insufficient'?'tourInsufficient':issue==='unreachable'?'tourDisconnected':issue==='changed'?'tourChanged':'tourFailed';
    if(issue&&next.scope?.mode!=='all'&&next.scope) {
      if(!next.scope.choices.length)errorKey=next.scope.mode==='group'?'tourScopeNoGroups':'tourScopeNoCategories';
      else if(!next.scope.ids.length)errorKey=next.scope.mode==='group'?'tourScopeChooseGroups':'tourScopeChooseCategories';
    }
    $('.galaxy-tour-error').hidden=!issue;
    setText($('.galaxy-tour-error'),issue?text(errorKey):'');
    setText($('.galaxy-tour-summary'),next.status==='planning'?text('tourPreparing'):
      issue?text('tourScopeTopicCount',{count:new Set(next.stopIds).size}):text('tourReady',{count:next.stopIds.length,duration:clock(next.durationMs)}));
    const skipped=JSON.stringify(next.skipped);
    if(skipped!==skippedKey) {
      skippedKey=skipped;const list=$('.galaxy-tour-skipped ul');list.replaceChildren();
      for(const item of next.skipped){const row=document.createElement('li');row.textContent=item.input;list.append(row);}
    }
    $('.galaxy-tour-skipped').hidden=!next.skipped.length;
    const playing=next.status==='playing'||next.rejoining;
    $('[data-tour-action="play"]').hidden=playing;
    $('[data-tour-action="pause"]').hidden=!playing;
    $('[data-tour-action="previous"]').disabled=!next.stopIds.length;
    $('[data-tour-action="next"]').disabled=!next.stopIds.length;
    $('[data-tour-action="speed"]').value=String(next.speed);
    for(const select of element.querySelectorAll('[data-tour-action="music"]'))select.value=next.music??'2';
    const musicMode=normalizeTourMusicMode(next.musicMode);
    for(const button of element.querySelectorAll('[data-tour-action="music-mode"]')){
      if(button.dataset.mode!==musicMode){button.dataset.mode=musicMode;button.innerHTML=modeSvg(musicMode);}
      const label=text('tourMusicMode',{mode:text('tourMusicMode'+musicMode[0].toUpperCase()+musicMode.slice(1))});
      button.setAttribute('aria-label',label);button.title=label;
    }
    const percent=String(Math.round((next.musicVolume??.22)*100));
    for(const input of element.querySelectorAll('[data-tour-action="music-volume"]')){input.value=percent;input.setAttribute('aria-valuetext',percent+'%');}
    for(const output of element.querySelectorAll('.galaxy-tour-volume output'))setText(output,percent+'%');
    $('[data-tour-action="loop"]').setAttribute('aria-pressed',String(next.pendingLoop??next.loop));
    $('[data-tour-action="clean"]').setAttribute('aria-pressed',String(next.clean));
    const travelling=['travel','depart'].includes(next.phase);
    const index=travelling?(next.stopIndex+1)%Math.max(1,next.stopIds.length):next.stopIndex;
    const topic=next.stopIds[index]??'';
    const details=getTopic(topic);
    setText($('.galaxy-tour-eyebrow'),text('tourStop',{current:index+1,total:next.stopIds.length}));
    setText($('.galaxy-tour-caption h2'),next.status==='ended'?text('tourFinished'):details?.topic??topic);
    setText($('.galaxy-tour-domain'),details?.domain??'');
    $('.galaxy-tour-domain').hidden=next.status==='ended';
    setText($('.galaxy-tour-subtitle'),next.status==='ended'?text('tourEndedCopy'):
      next.status==='paused'?text('tourPaused'):travelling?text('tourHeading',{topic}):text('tourPlaying'));
    element.dataset.clean=String(next.clean);
    if(wasClean!==next.clean)reveal();
  }
  on(element,'click',event=>{
    const button=event.target.closest('button[data-tour-action]');if(!button)return;
    const action=button.dataset.tourAction;
    const value=action==='scope-mode'?button.value:action==='music-mode'?TOUR_MUSIC_MODES[(TOUR_MUSIC_MODES.indexOf(normalizeTourMusicMode(snapshot.musicMode))+1)%TOUR_MUSIC_MODES.length]:['loop','clean'].includes(action)?button.getAttribute('aria-pressed')!=='true':undefined;
    onAction(action,value);
    reveal();
  });
  on(element,'change',event=>{const action=event.target.dataset.tourAction;if(action==='scope-choice')onAction(action,{id:event.target.value,checked:event.target.checked});else if(action==='speed')onAction(action,Number(event.target.value));else if(action==='music')onAction(action,event.target.value);else if(action==='music-volume')onAction(action,Number(event.target.value)/100);reveal();});
  on(element,'input',event=>{if(event.target.dataset.tourAction==='music-volume')onAction('music-volume-preview',Number(event.target.value)/100);reveal();});
  on(dialog,'cancel',event=>{event.preventDefault();onAction('exit');});
  on(host,'pointermove',reveal);on(element,'focusin',reveal);on(element,'focusout',reveal);
  copy();
  return {element,update,copy,destroy(){clearTimeout(timer);cleanups.forEach(remove=>remove());if(dialog.open)dialog.close();element.remove();}};
}
