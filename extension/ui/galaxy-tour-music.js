import {TOUR_MUSIC_TRACKS,DEFAULT_TOUR_MUSIC,normalizeTourMusic,DEFAULT_TOUR_MUSIC_VOLUME,normalizeTourMusicVolume,DEFAULT_TOUR_MUSIC_MODE,normalizeTourMusicMode} from '../core/galaxy-tour-music.js';

/** Window-local playlist and crossfades; automatic advances never save preferences. */
export function createGalaxyTourMusic({createAudio=url=>new Audio(url),now=()=>performance.now(),random=Math.random,
  requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id),
  isActive=()=>!document.hidden&&document.hasFocus(),onError=()=>{},onTrackChange=()=>{}}={}) {
  const cache=new Map(),voices=new Set(),fadeMs=450,crossfadeMs=2000;
  let selected=DEFAULT_TOUR_MUSIC,volume=DEFAULT_TOUR_MUSIC_VOLUME,mode=DEFAULT_TOUR_MUSIC_MODE;
  let playing=false,current=null,pending=null,fade=null,handle=0,destroyed=false,autoAttempted=false,restartSelection=false;
  function applyVolume(){for(const voice of voices)voice.audio.volume=Math.max(0,Math.min(1,voice.gain))*volume;}
  function release(voice) {
    if(!voice||!voices.delete(voice))return;
    voice.token++;voice.audio.pause();voice.audio.volume=0;
    voice.audio.onended=null;voice.audio.onerror=null;
    if(pending===voice)pending=null;
    if(current===voice)current=null;
    if(cache.get(voice.id)!==voice.audio){voice.audio.removeAttribute?.('src');voice.audio.load?.();}
  }
  function schedule() {
    const needed=fade||pending||(playing&&current&&!current.audio.ended);
    if(!needed&&handle){cancelFrame(handle);handle=0;}
    if(needed&&!handle&&!destroyed)handle=requestFrame(tick);
  }
  function fadeTo(target,duration=fadeMs,resetAdvance=false) {
    fade={entries:[...voices].map(voice=>({voice,from:voice.gain,to:voice===target?1:0})),target,started:now(),duration,resetAdvance};
    if(!fade.entries.length)fade=null;
    schedule();
  }
  function fail(voice) {
    if(!voices.has(voice))return;
    if(fade?.target===voice)fade=null;
    release(voice);
    if(playing&&current&&!fade){selected=current.id;onTrackChange(selected);fadeTo(current);}
    onError();schedule();
  }
  function nextTrack() {
    const ids=TOUR_MUSIC_TRACKS.map(track=>track.id),id=current.id;
    if(mode==='single')return id;
    if(mode==='shuffle') {
      const choices=ids.filter(candidate=>candidate!==id);
      return choices[Math.min(choices.length-1,Math.max(0,Math.floor(random()*choices.length)))];
    }
    return ids[(ids.indexOf(id)+1)%ids.length];
  }
  function advanceTrack() {
    if(!playing||!current||pending||autoAttempted)return;
    autoAttempted=true;begin(nextTrack(),{restart:true,automatic:true});
  }
  function begin(id,{restart=false,automatic=false}={}) {
    if(pending)release(pending);
    const existing=[...voices].find(voice=>voice.id===id&&!voice.audio.ended);
    if(existing&&!restart){fadeTo(existing);return;}
    // A new user choice keeps at most one outgoing voice, even during a transition.
    const keeper=[...voices].filter(voice=>!voice.audio.ended).sort((a,b)=>b.gain-a.gain)[0]??null;
    for(const voice of [...voices])if(voice!==keeper)release(voice);
    current=keeper;fade=null;
    let voice;
    try {
      let audio=cache.get(id);
      if(!audio||[...voices].some(voice=>voice.audio===audio)) {
        const track=TOUR_MUSIC_TRACKS.find(track=>track.id===id);
        audio=createAudio(new URL('../assets/music/'+track.file,import.meta.url));cache.set(id,audio);
      }
      audio.preload='auto';audio.loop=false;audio.volume=0;
      if(restart||audio.ended)audio.currentTime=0;
      voice={id,audio,gain:0,token:0,automatic};voices.add(voice);pending=voice;
      audio.onerror=()=>fail(voice);
      audio.onended=()=>{if(current===voice&&!fade)advanceTrack();};
      const token=++voice.token;
      Promise.resolve(audio.play()).then(()=>{
        if(destroyed||!voices.has(voice)||voice.token!==token)return;
        if(!playing||!isActive()){release(voice);schedule();return;}
        pending=null;
        const remaining=current&&!current.audio.ended&&Number.isFinite(current.audio.duration)?(current.audio.duration-current.audio.currentTime)*1000:crossfadeMs;
        fadeTo(voice,automatic?Math.max(50,Math.min(crossfadeMs,remaining)):fadeMs,true);
        if(automatic){selected=id;onTrackChange(id);}
      }).catch(()=>{if(voice.token===token)fail(voice);});
    } catch {if(voice)fail(voice);else {onError();schedule();}}
    schedule();
  }
  function tick() {
    handle=0;
    if(destroyed)return;
    if(fade) {
      const transition=fade,progress=Math.max(0,Math.min(1,(now()-transition.started)/transition.duration));
      for(const {voice,from,to} of transition.entries)voice.gain=from+(to-from)*progress;
      if(progress===1) {
        fade=null;
        for(const voice of [...voices])if(voice!==transition.target)release(voice);
        current=transition.target;
        if(current)current.gain=1;
        if(transition.resetAdvance)autoAttempted=false;
      }
    }
    applyVolume();
    if(playing&&current&&!fade&&!pending&&Number.isFinite(current.audio.duration)&&current.audio.duration>0&&
      current.audio.duration-current.audio.currentTime<=crossfadeMs/1000)advanceTrack();
    schedule();
  }
  function sync({status,track=selected,volume:nextVolume=volume,mode:nextMode=mode}={}) {
    if(destroyed)return;
    const selection=normalizeTourMusic(track),selectionChanged=selection!==selected;
    const normalizedMode=normalizeTourMusicMode(nextMode),modeChanged=normalizedMode!==mode;
    if(selectionChanged)restartSelection=selection!=='off';
    selected=selection;mode=normalizedMode;volume=normalizeTourMusicVolume(nextVolume);applyVolume();
    const nextPlaying=status==='playing'&&selection!=='off'&&isActive();
    if(!nextPlaying) {
      if(playing){playing=false;if(pending)release(pending);fadeTo(null);}
    } else if(!playing||selectionChanged) {
      playing=true;autoAttempted=false;begin(selected,{restart:restartSelection});restartSelection=false;
    } else if(modeChanged) {
      autoAttempted=false;
      if(pending?.automatic){release(pending);schedule();}
    }
    schedule();
  }
  function stop() {
    playing=false;fade=null;
    for(const voice of [...voices])release(voice);
    pending=null;current=null;autoAttempted=false;schedule();
  }
  return {sync,stop,destroy(){if(destroyed)return;destroyed=true;stop();for(const audio of cache.values()){audio.removeAttribute?.('src');audio.load?.();}cache.clear();}};
}
