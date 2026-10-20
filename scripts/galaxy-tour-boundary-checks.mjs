import assert from 'node:assert/strict';
import {resolve} from 'node:path';

// The page and its globals exist only in the disposable test extension.
export async function checkTourBoundaries({context,base,output}) {
  const results=[];
  async function check(name,run) {
    const page=await context.newPage();
    try {
      await page.goto(base+'tour-test.html');await page.waitForFunction(()=>window.tourTest);
      await run(page);results.push({name,passed:true});
    } catch(error) {
      await page.screenshot({path:resolve(output,'boundary-'+name+'-red.png')});
      results.push({name,passed:false,error:error.message});
    } finally {await page.evaluate(()=>window.tourTest?.map.destroy()).catch(()=>{});await page.close();}
  }
  const load=page=>page.evaluate(async()=>{
    const snapshot=await tourTest.tour.load({topics:['Photography','Education'],order:'given'});
    tourTest.tour.play();tourTest.tour.pause();tourTest.tour.seek(snapshot.stopTimes[0]+300);
    return snapshot;
  });
  const preview=async page=>{
    await page.evaluate(()=>tourTest.map.openLayoutEditor());
    await page.locator('[data-layout-action="generate"]').click();
    await page.waitForFunction(()=>document.querySelector('.galaxy-root').dataset.layoutCacheKey==='tour-shifted-layout');
    await page.locator('[data-layout-action="close"]').click();
  };
  await check('idle-layout',async page=>{
    await preview(page);await load(page);
    const actual=await page.evaluate(()=>({camera:tourTest.camera(),topic:tourTest.point('Photography')}));
    assert.ok(Math.abs(actual.camera.x-actual.topic.x-5)<1e-8,'Tour must use the layout selected before loading');
    assert.ok(Math.abs(actual.camera.y-actual.topic.y-3)<1e-8);
  });
  await check('reset-layout',async page=>{
    await load(page);await preview(page);
    await page.waitForFunction(()=>Math.abs(tourTest.camera().x-tourTest.point('Photography').x-5)<1e-8);
    await page.evaluate(()=>tourTest.map.update({state:{...tourTest.state,salt:'new-fictional-profile'}}));
    await load(page);
    const actual=await page.evaluate(()=>({camera:tourTest.camera(),topic:tourTest.point('Photography')}));
    assert.ok(Math.abs(actual.camera.x-actual.topic.x)<1e-8,'Reset must synchronize the session back to packaged coordinates');
    assert.ok(Math.abs(actual.camera.y-actual.topic.y)<1e-8);
  });
  await check('return-next',async page=>{
    await page.evaluate(async()=>{
      const snapshot=await tourTest.tour.load({topics:['Photography','Education'],order:'given',loop:true});
      tourTest.tour.play();tourTest.tour.pause();tourTest.tour.seek(snapshot.durationMs-300);
    });
    assert.match(await page.evaluate(()=>tourTest.tour.getSnapshot().phaseKey),/edge:1:/);
    await page.locator('[data-tour-action="next"]').click();
    const actual=await page.evaluate(()=>tourTest.tour.getSnapshot());
    assert.equal(actual.phase,'hold');assert.equal(actual.stopIndex,0,'Next during return must go to the first stop');
    assert.equal(actual.timeMs,actual.stopTimes[0]);
  });
  await check('repeat-play-during-rejoin',async page=>{
    await load(page);await page.evaluate(()=>tourTest.tour.seek(7000));
    const box=await page.locator('.galaxy-canvas').boundingBox();
    await page.mouse.move(box.x+box.width*.4,box.y+box.height*.25);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.4+50,box.y+box.height*.25+20,{steps:3});await page.mouse.up();
    const before=await page.evaluate(()=>tourTest.tour.getSnapshot().timeMs);
    await page.locator('[data-tour-action="play"]').click();await page.waitForTimeout(80);
    await page.keyboard.press('Space');await page.waitForTimeout(120);
    const paused=await page.evaluate(()=>tourTest.tour.getSnapshot());
    assert.equal(paused.status,'paused','Space during camera rejoining must pause that transition');
    assert.equal(paused.timeMs,before,'Repeated playback input must not start the logical clock');
    await page.locator('[data-tour-action="play"]').click();
    await page.evaluate(()=>document.querySelector('[data-tour-action="play"]').click());
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>tourTest.tour.getSnapshot().timeMs),before);
    await page.waitForFunction(()=>tourTest.tour.getSnapshot().status==='playing');
  });
  return results;
}
