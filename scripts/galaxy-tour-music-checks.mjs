import assert from 'node:assert/strict';
import {resolve} from 'node:path';

// Native media checks on a trusted fixture copied only to the disposable build.
export async function checkTourMusic({context,base,output}) {
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const music=()=>page.locator('.galaxy-tour-bar [data-tour-action="music"]');
  const audible=file=>page.waitForFunction(file=>tourMusicMedia.some(audio=>audio.src.endsWith(file)&&!audio.paused&&audio.currentTime>0&&audio.volume>=.2199),file);
  const silent=()=>page.waitForFunction(()=>tourMusicMedia.every(audio=>audio.paused));
  try {
    await page.goto(base+'tour-test.html');await page.waitForFunction(()=>window.tourTest);
    await page.evaluate(async()=>{
      await tourTest.tour.load({topics:['Photography','Education'],order:'given',
        timing:{introMs:0,holdMs:2000,departMs:200,edgeMinMs:60000,edgeMaxMs:60000,outroMs:1000}});
      tourTest.tour.seek(2300);
    });
    assert.equal(await page.locator('.galaxy-tour-setup [data-tour-action="music"]').inputValue(),'2');
    await page.locator('[data-tour-action="start"]').click();
    await audible('stellar-passage.mp3');
    for(const [id,file] of [['1','starlit-drift.mp3'],['3','distant-echoes.mp3'],['2','stellar-passage.mp3']]) {
      await music().selectOption(id);await audible(file);
      assert.equal(await page.evaluate(()=>[...new Set(tourMusicMedia)].filter(audio=>!audio.paused).length),1);
    }
    const mode=page.locator('.galaxy-tour-bar [data-tour-action="music-mode"]');
    assert.equal(await mode.getAttribute('data-mode'),'list');
    assert.equal((await mode.innerText()).trim(),'');assert.equal(await mode.locator('svg').count(),1);
    const nearEnd=()=>page.evaluate(()=>{const audio=tourMusicMedia.at(-1);audio.currentTime=audio.duration-1.8;});
    const overlap=()=>page.waitForFunction(()=>[...new Set(tourMusicMedia)].filter(audio=>!audio.paused&&audio.volume>0&&audio.src.endsWith('.mp3')).length===2);
    await nearEnd();await overlap();
    await audible('distant-echoes.mp3');assert.equal(await music().inputValue(),'3');
    await page.evaluate(()=>tourTest.map.update({state:{...tourTest.state,settings:{...tourTest.state.settings,soundEffectsVolume:.4}}}));
    await page.waitForTimeout(100);
    assert.equal(await music().inputValue(),'3','Unrelated state updates must preserve the automatically playing track');
    await nearEnd();await overlap();await audible('starlit-drift.mp3');assert.equal(await music().inputValue(),'1');
    await mode.click();assert.equal(await mode.getAttribute('data-mode'),'single');
    const singleCalls=await page.evaluate(()=>tourMusicCalls.length);
    await nearEnd();await overlap();await audible('starlit-drift.mp3');
    assert.ok(await page.evaluate(count=>tourMusicCalls.length>count&&tourMusicMedia.at(-1).currentTime<4,singleCalls),'Single repeat starts a fresh instance with a faded restart');
    await mode.click();assert.equal(await mode.getAttribute('data-mode'),'shuffle');
    await nearEnd();await overlap();
    await page.waitForFunction(()=>tourMusicMedia.at(-1).volume>=.2199);
    assert.notEqual(await music().inputValue(),'1','Shuffle must avoid an immediate repeat');
    await mode.click();assert.equal(await mode.getAttribute('data-mode'),'list');
    await music().selectOption('2');await audible('stellar-passage.mp3');
    const volume=page.locator('.galaxy-tour-bar [data-tour-action="music-volume"]');
    await volume.evaluate(input=>{input.value='65';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>tourMusicMedia.at(-1).volume===.65);
    assert.equal(await page.locator('.galaxy-tour-setup [data-tour-action="music-volume"]').inputValue(),'65');
    assert.equal(await page.locator('.galaxy-tour-bar .galaxy-tour-volume output').innerText(),'65%');
    await volume.focus();await volume.press('Home');assert.equal(await page.evaluate(()=>tourMusicMedia.at(-1).volume),0);
    await volume.evaluate(input=>{input.value='22';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
    await music().selectOption('off');await silent();
    const count=await page.evaluate(()=>tourMusicCalls.length);
    await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>tourMusicCalls.length),count);
    await music().selectOption('2');await audible('stellar-passage.mp3');
    await page.locator('[data-tour-action="pause"]').click();await silent();
    const position=await page.evaluate(()=>tourMusicMedia.at(-1).currentTime);
    await page.locator('[data-tour-action="play"]').click();await audible('stellar-passage.mp3');
    assert.ok(await page.evaluate(position=>tourMusicMedia.at(-1).currentTime>=position,position));
    await page.evaluate(()=>{tourMusicMedia.at(-1).currentTime=23;});
    for(const [id,file] of [['1','starlit-drift.mp3'],['2','stellar-passage.mp3']]) {
      await page.locator('[data-tour-action="pause"]').click();await silent();
      await music().selectOption(id);
      await page.locator('[data-tour-action="play"]').click();await audible(file);
      assert.ok(await page.evaluate(()=>tourMusicMedia.at(-1).currentTime<3),'Manual selections made while paused start from the beginning');
    }
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await silent();
    const away=await page.evaluate(()=>tourMusicCalls.length);
    await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>tourMusicCalls.length),away,'Blur must stay quiet across animation frames');
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await audible('stellar-passage.mp3');
    await page.evaluate(()=>tourTest.map.setActive(false));await silent();
    await page.evaluate(()=>tourTest.map.setActive(true));
    assert.equal(await page.locator('.galaxy-root').getAttribute('data-tour-status'),'paused');
    await page.locator('[data-tour-action="play"]').click();await audible('stellar-passage.mp3');
    const beforeArrival=await page.evaluate(()=>({calls:tourMusicCalls.length,time:tourMusicMedia.at(-1).currentTime}));
    await page.locator('[data-tour-action="next"]').click();await page.waitForTimeout(600);
    assert.ok(await page.evaluate(before=>!tourMusicMedia.at(-1).paused&&tourMusicMedia.at(-1).currentTime>before.time&&tourMusicCalls.length===before.calls,beforeArrival),'Arrival must preserve continuous BGM playback');
    await page.evaluate(()=>{tourTest.tour.seek(2300);tourTest.tour.play();});await audible('stellar-passage.mp3');
    await page.evaluate(()=>tourTest.tour.exit());await silent();
    await page.evaluate(()=>tourTest.map.update({language:'zh-CN'}));
    await page.locator('[data-galaxy-action="tour"]').click();
    await page.waitForFunction(()=>tourTest.tour.getSnapshot().status==='ready');
    assert.deepEqual(await page.locator('.galaxy-tour-setup [data-tour-action="music"] option').allTextContents(),['星间微光','星海航线','远方回声','关闭音乐']);
    await page.setViewportSize({width:320,height:900});
    await page.screenshot({path:resolve(output,'music-setup-320-zh.png'),fullPage:true});
    await page.locator('[data-tour-action="start"]').click();await page.locator('[data-tour-action="pause"]').click();
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await music().evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>100;}));
    for(const theme of ['dark','light']) {
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
      const pairs=await page.locator('.galaxy-tour-bar .galaxy-tour-music span,.galaxy-tour-bar .galaxy-tour-volume span,.galaxy-tour-bar .galaxy-tour-volume output,.galaxy-tour-bar select,.galaxy-tour-bar [data-tour-action="play"],.galaxy-tour-bar [data-tour-action="music-mode"]').evaluateAll(nodes=>nodes.map(node=>{
        const ink=getComputedStyle(node).color;
        while(node){const bg=getComputedStyle(node).backgroundColor;if(/^rgb\(/.test(bg))return {ink,bg};node=node.parentElement;}
        throw new Error('No opaque surface for music controls');
      }));
      const luminance=value=>{
        const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});
        return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
      };
      for(const {ink,bg} of pairs){const a=luminance(ink),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,theme+' music control contrast: '+ink+' on '+bg);}
      await page.screenshot({path:resolve(output,'music-controls-320-'+theme+'.png'),fullPage:true});
    }
    await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
    await page.screenshot({path:resolve(output,'music-controls-320-zh.png'),fullPage:true});
    assert.deepEqual(await page.evaluate(()=>tourTest.mutations),[]);assert.deepEqual(errors,[]);
    return ['native MP3 decoding; list repeat 2→3→1, single repeat and nonrepeating shuffle with overlapping fades; icon modes, state broadcasts, volume, pause/resume and blur cleanup; silent arrivals, 320px controls and dark/light contrast'];
  } catch(error) {
    await page.screenshot({path:resolve(output,'music-failure.png'),fullPage:true});
    console.log(JSON.stringify({music:await page.evaluate(()=>({calls:tourMusicCalls,started:tourMusicStarted,media:tourMusicMedia.map(audio=>({src:audio.src,paused:audio.paused,currentTime:audio.currentTime,volume:audio.volume,error:audio.error?.message})),status:tourTest.tour.getSnapshot()}))}));
    throw error;
  } finally {await page.evaluate(()=>window.tourTest?.map.destroy()).catch(()=>{});await page.close();}
}
