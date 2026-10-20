import test from 'node:test';
import assert from 'node:assert/strict';
import {createGalaxyTourMusic} from '../ui/galaxy-tour-music.js';

function fixture({play,random}={}) {
  let now=0,next=0,active=true;
  const frames=new Map(),media=[],tracks=[];
  const music=createGalaxyTourMusic({now:()=>now,isActive:()=>active,random,onTrackChange:id=>tracks.push(id),
    requestFrame:callback=>{frames.set(++next,callback);return next;},cancelFrame:id=>frames.delete(id),
    createAudio:src=>{
      const audio={src:String(src),volume:1,paused:true,currentTime:0,duration:180,plays:0,
        play(){this.paused=false;this.plays++;return play?.(this)??Promise.resolve();},
        pause(){this.paused=true;},
      };
      media.push(audio);return audio;
    },
  });
  const settle=async()=>{await Promise.resolve();await Promise.resolve();};
  const step=async ms=>{now+=ms;const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback(now));await settle();};
  return {music,media,frames,tracks,step,settle,active:value=>{active=value;}};
}

test('default track 2 plays continuously through arrivals, with a user-controlled independent volume',async()=>{
  const f=fixture();
  for(const status of ['ready','paused','idle'])f.music.sync({status,phase:'hold'});
  assert.equal(f.media.length,0);
  f.music.sync({status:'playing',phase:'intro'});await f.settle();
  const audio=f.media[0];
  assert.match(audio.src,/\/assets\/music\/stellar-passage\.mp3$/);
  assert.equal(audio.loop,false);assert.equal(audio.volume,0);
  await f.step(225);assert.ok(audio.volume>0&&audio.volume<.22);
  await f.step(225);assert.equal(audio.volume,.22);
  audio.currentTime=18;
  for(const phase of ['travel','hold','depart','travel','outro']) {
    f.music.sync({status:'playing',phase,volume:.65});await f.step(100);
    assert.equal(audio.volume,.65);assert.equal(audio.paused,false);
  }
  assert.equal(audio.plays,1);assert.equal(audio.currentTime,18);
  f.music.sync({status:'playing',phase:'hold',volume:0});assert.equal(audio.volume,0);
  f.music.sync({status:'playing',phase:'hold',volume:1});assert.equal(audio.volume,1);
  f.music.sync({status:'ended',phase:'outro'});await f.step(450);
  assert.equal(audio.paused,true);assert.equal(audio.volume,0);
  f.music.destroy();assert.equal(audio.paused,true);assert.equal(f.frames.size,0);
});

test('default list repeat crossfades from track 2 to 3, wraps to 1 and resets each incoming track',async()=>{
  const f=fixture();f.music.sync({status:'playing'});await f.settle();await f.step(450);
  const first=f.media[0];first.currentTime=178;await f.step(0);
  assert.equal(f.media.length,2);const next=f.media[1];assert.match(next.src,/distant-echoes/);
  assert.equal(next.currentTime,0);assert.equal(next.volume,0);assert.equal(first.paused,false);
  await f.step(1000);assert.ok(first.volume>0&&first.volume<.22);assert.ok(next.volume>0&&next.volume<.22);
  await f.step(1000);assert.equal(first.paused,true);assert.equal(next.volume,.22);
  f.music.sync({status:'playing'});assert.equal(next.plays,1,'Frames do not restart the automatically chosen track');
  next.currentTime=178;await f.step(0);await f.step(2000);
  assert.match(f.media.at(-1).src,/starlit-drift/);assert.deepEqual(f.tracks,['3','1']);
  f.music.destroy();assert.equal(f.frames.size,0);
});

test('single repeat crossfades two instances of the same track instead of jumping to its start',async()=>{
  const f=fixture();f.music.sync({status:'playing',track:'2',mode:'single'});await f.settle();await f.step(450);
  const original=f.media[0];original.currentTime=178;await f.step(0);
  assert.equal(f.media.length,2);const next=f.media[1];
  assert.equal(next.src,original.src);assert.notEqual(next,original);assert.equal(next.currentTime,0);
  await f.step(1000);assert.ok(original.volume>0&&next.volume>0);
  await f.step(1000);assert.equal(original.paused,true);assert.equal(next.volume,.22);assert.equal(next.loop,false);
  f.music.destroy();
});

test('shuffle excludes the current track, and changing mode keeps the current position',async()=>{
  let choice=.99;const f=fixture({random:()=>choice});
  f.music.sync({status:'playing',track:'2'});await f.settle();await f.step(450);
  f.media[0].currentTime=42;f.music.sync({status:'playing',mode:'shuffle'});
  assert.equal(f.media[0].currentTime,42);assert.equal(f.media[0].plays,1);
  f.media[0].currentTime=178;await f.step(0);await f.step(2000);
  assert.match(f.media.at(-1).src,/distant-echoes/);
  choice=0;f.media.at(-1).currentTime=178;await f.step(0);await f.step(2000);
  assert.match(f.media.at(-1).src,/starlit-drift/);assert.deepEqual(f.tracks,['3','1']);f.music.destroy();
});

test('a manual selection while paused restarts the chosen track, while ordinary resume preserves its position',async()=>{
  const f=fixture();f.music.sync({status:'playing',track:'2'});await f.settle();await f.step(450);
  const second=f.media[0];second.currentTime=42;
  f.music.sync({status:'playing',track:'1'});await f.settle();await f.step(450);
  const first=f.media[1];first.currentTime=10;
  f.music.sync({status:'paused'});await f.step(450);
  f.music.sync({status:'playing'});await f.settle();await f.step(450);
  assert.equal(first.currentTime,10,'Resuming without a new choice keeps the current position');
  f.music.sync({status:'paused'});await f.step(450);
  f.music.sync({status:'paused',track:'2'});
  f.music.sync({status:'playing',track:'2'});await f.settle();await f.step(450);
  assert.equal(second.currentTime,0,'A paused manual selection must not resume an old cached position');
  f.music.destroy();
});

test('an ended event recovers if the final fade window was missed',async()=>{
  const f=fixture();f.music.sync({status:'playing'});await f.settle();await f.step(450);
  f.media[0].currentTime=180;f.media[0].ended=true;f.media[0].onended();await f.settle();await f.step(2000);
  assert.match(f.media.at(-1).src,/distant-echoes/);assert.equal(f.media.at(-1).volume,.22);f.music.destroy();
});

test('pause and destroy cancel both sides of a crossfade and pending next-track playback',async()=>{
  const f=fixture();f.music.sync({status:'playing'});await f.settle();await f.step(450);
  f.media[0].currentTime=178;await f.step(0);await f.step(500);
  f.music.sync({status:'paused'});await f.step(450);
  assert.ok(f.media.every(audio=>audio.paused&&audio.volume===0));assert.equal(f.frames.size,0);
  f.music.sync({status:'playing'});await f.settle();await f.step(450);
  assert.match(f.media.at(-1).src,/distant-echoes/);f.music.destroy();assert.equal(f.frames.size,0);
  let finish;
  const delayed=fixture({play:audio=>audio.src.endsWith('distant-echoes.mp3')?new Promise(resolve=>{finish=resolve;}):Promise.resolve()});
  delayed.music.sync({status:'playing'});await delayed.settle();await delayed.step(450);
  delayed.media[0].currentTime=178;await delayed.step(0);delayed.music.destroy();finish();await delayed.settle();
  assert.ok(delayed.media.every(audio=>audio.paused));assert.equal(delayed.frames.size,0);assert.deepEqual(delayed.tracks,[]);
});

test('a failed incoming track leaves the outgoing track intact without repeated play attempts',async()=>{
  const f=fixture({play:audio=>audio.src.endsWith('distant-echoes.mp3')?Promise.reject(new Error('Decode error')):Promise.resolve()});
  f.music.sync({status:'playing'});await f.settle();await f.step(450);
  f.media[0].currentTime=178;await f.step(0);await f.settle();
  for(let i=0;i<10;i++)await f.step(450);
  assert.equal(f.media[0].paused,false);assert.equal(f.media[0].volume,.22);assert.equal(f.media[1].plays,1);
  f.music.destroy();
});

test('changing BGM volume during a fade adjusts its level without restarting playback or the fade',async()=>{
  const f=fixture();f.music.sync({status:'playing',volume:.4});await f.settle();await f.step(225);
  assert.equal(f.media[0].volume,.2);
  f.music.sync({status:'playing',volume:.8});assert.equal(f.media[0].volume,.4);
  await f.step(225);assert.equal(f.media[0].volume,.8);assert.equal(f.media[0].plays,1);
  f.music.sync({status:'paused',volume:.8});await f.step(225);assert.equal(f.media[0].volume,.4);
  f.music.sync({status:'paused',volume:.2});assert.equal(f.media[0].volume,.1);
  await f.step(225);assert.equal(f.media[0].paused,true);f.music.destroy();
});

test('users can switch all tracks and turn music off, including rapid changes during a fade',async()=>{
  const f=fixture(),travel=track=>f.music.sync({status:'playing',phase:'travel',track});
  travel('1');await f.settle();await f.step(450);
  assert.match(f.media[0].src,/starlit-drift\.mp3$/);
  travel('3');await f.step(450);await f.step(450);
  assert.equal(f.media[0].paused,true);assert.match(f.media[1].src,/distant-echoes\.mp3$/);
  travel('2');await f.step(450);await f.step(450);
  assert.match(f.media[2].src,/stellar-passage\.mp3$/);
  for(let i=0;i<100;i++)travel('2');
  assert.equal(f.media[2].plays,1,'Frame updates must not restart a track');
  travel('1');travel('off');await f.step(450);
  assert.ok(f.media.every(audio=>audio.paused));assert.equal(f.media[0].volume,0);
  travel('3');await f.settle();await f.step(450);
  assert.equal(f.media[1].plays,2);assert.equal(f.media[1].paused,false);
  f.music.destroy();
});

test('pause fades out; background stop and destroy are immediate and cancel delayed playback',async()=>{
  let resolve;
  const f=fixture({play:()=>new Promise(done=>{resolve=done;})});
  f.music.sync({status:'playing',phase:'travel',track:'2'});
  f.active(false);f.music.stop();resolve();await f.settle();
  assert.equal(f.media[0].paused,true);assert.equal(f.frames.size,0);
  f.music.sync({status:'playing',phase:'travel',track:'2'});
  assert.equal(f.media[0].plays,1);
  f.active(true);f.music.sync({status:'playing',phase:'travel',track:'2'});
  f.music.destroy();resolve();await f.settle();
  assert.equal(f.media[0].paused,true);assert.equal(f.frames.size,0);
  const paused=fixture();paused.music.sync({status:'playing',phase:'travel'});
  await paused.settle();await paused.step(450);
  paused.music.sync({status:'paused',phase:'travel'});await paused.step(225);
  assert.ok(paused.media[0].volume>0&&paused.media[0].volume<.22);
  await paused.step(225);assert.equal(paused.media[0].paused,true);
  paused.music.destroy();
});

test('blocked or broken media stays silent without frame-by-frame retries and can recover on another track',async()=>{
  const f=fixture({play:audio=>audio.src.endsWith('stellar-passage.mp3')?Promise.reject(new Error('Autoplay blocked')):Promise.resolve()});
  const sync=track=>f.music.sync({status:'playing',phase:'travel',track});
  sync('2');await f.settle();
  for(let i=0;i<100;i++)sync('2');
  assert.equal(f.media[0].plays,1);assert.equal(f.media[0].paused,true);
  sync('1');await f.settle();await f.step(450);
  assert.equal(f.media[1].paused,false);
  f.media[1].onerror();assert.equal(f.media[1].paused,true);
  for(let i=0;i<100;i++)sync('1');
  assert.equal(f.media[1].plays,1);assert.equal(f.frames.size,0);
  f.music.destroy();
});
