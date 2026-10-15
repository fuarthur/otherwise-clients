// Exercise the packaged UI with fictional state in a disposable browser profile.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.OTHERWISE_PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.cache/qa/telegram-ui/browser');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(resolve(tmpdir(),'otherwise-telegram-ui-'));
const extension=resolve(root,'dist/otherwise-extension');
const checks=[],errors=[],measurements=[];
let context,page,failure;
const rect=async selector=>page.locator(selector).first().boundingBox();
const inViewport=async selector=>{
  const box=await rect(selector), {height}=page.viewportSize();
  assert.ok(box && box.y>=0 && box.y+box.height<=height+1,`${selector} remains visible in ${height}px: ${JSON.stringify(box)}`);
};
try{
  context=await chromium.launchPersistentContext(profile,{
    executablePath:process.env.OTHERWISE_CHROMIUM || chromium.executablePath(),
    headless:true,ignoreDefaultArgs:['--disable-extensions'],viewport:{width:320,height:600},
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const base=worker.url().replace('background.js','');
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const open=async(surface,view,width,height)=>{
    await page.setViewportSize({width,height});
    await page.goto(`${base}${surface}.html?preview=1&view=${view}`);
    await page.locator('[data-focus="nav-settings"]').waitFor();
    await page.emulateMedia({reducedMotion:'reduce'});
  };
  for(const [surface,view,width,height] of [
    ['sidepanel','interests',320,600],['sidepanel','interests',390,700],
    ['dashboard','interests',1280,800],['sidepanel','discover',320,600],
    ['sidepanel','discover',390,700],['dashboard','discover',1280,800],
  ]){
    await open(surface,view,width,height);
    if(view==='interests')await page.evaluate(async()=>{
      const {dispatch}=await import('./dev-preview.js');
      for(let i=1;i<=15;i++)await dispatch({type:'ADD_INTEREST',topic:`Saved topic ${i}`});
    });
    const size=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
    measurements.push({surface,view,...size});
    await page.screenshot({path:resolve(output,`${surface}-${view}-${width}.png`)});
    assert.equal(size.scrollWidth,width,'The page has no horizontal overflow');
    assert.ok(size.scrollHeight<=height+1,`The ${view} page fits ${width}×${height}; measured ${size.scrollHeight}`);
    if(surface==='sidepanel'){
      const navigation=await rect('.main-nav'),content=await rect('.workspace-content');
      assert.ok(navigation.y+navigation.height<=content.y+1,'Navigation does not overlap page content');
      const firstTab=await rect('.main-nav button[data-view]'),dashboardLink=await rect('.main-nav .dashboard-link');
      assert.ok(Math.abs(firstTab.y-dashboardLink.y)<1,'All four tabs and Dashboard fit one navigation row');
    }
    if(view==='interests'){
      const list=await rect('.saved-interest-list');
      assert.ok(list.height>=90,`Saved interests retain readable space: ${JSON.stringify(list)}`);
      const footer=await rect('.saved-interest-footer');
      assert.ok(list.y+list.height<=footer.y+1,'The saved-interest footer does not overlap the list');
      await inViewport('.page-actions');await inViewport('.saved-interest-footer');
    }else{
      await inViewport('.topic-actions');
      if(surface==='sidepanel')await inViewport('.single-pagination');
      const copy=await rect('.topic-detail-copy');
      assert.ok(copy.height>=90,`Topic text retains readable space: ${JSON.stringify(copy)}`);
    }
  }
  checks.push('Saved interests, topic reading, Search/Save and pagination remain usable at 320×600, 390×700 and 1280×800');
  await open('dashboard','discover',1280,800);
  const searchTrigger=page.locator('.topic-search > summary');
  await searchTrigger.focus();await searchTrigger.press('ArrowDown');
  assert.equal(await page.locator('.topic-search').evaluate(node=>node.open),true,'ArrowDown opens Search');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.provider),'google','Keyboard opening focuses the first action');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.provider),'youtube');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.provider),'google');
  await page.keyboard.press('End');await page.keyboard.press('Escape');
  assert.equal(await page.locator('.topic-search').evaluate(node=>node.open),false);
  assert.equal(await searchTrigger.evaluate(node=>node===document.activeElement),true,'Escape returns to the trigger');
  await searchTrigger.click();await page.locator('.topic-more > summary').click();
  assert.equal(await page.locator('[data-action-popover][open]').count(),1,'Only one action popup stays open');
  await page.locator('#selected-topic-title').click();
  assert.equal(await page.locator('[data-action-popover][open]').count(),0,'Clicking outside closes the popup');
  await searchTrigger.press('Enter');await page.keyboard.press('Tab');await page.keyboard.press('Tab');
  assert.equal(await page.locator('[data-action-popover][open]').count(),0,'Tab leaves and closes the action popup');
  const constrainedPanel=await page.addStyleTag({content:'.topic-search .topic-action-menu {max-height:48px !important}'});
  const readingPosition=await page.evaluate(()=>[scrollY,document.querySelector('.discover-page').scrollTop]);
  await searchTrigger.press('ArrowDown');await page.keyboard.press('End');
  const panel=await rect('.topic-search .topic-action-menu');
  const focusedAction=await page.evaluate(()=>{const r=document.activeElement.getBoundingClientRect();return {top:r.top,bottom:r.bottom};});
  assert.ok(focusedAction.top>=panel.y && focusedAction.bottom<=panel.y+panel.height,'Keyboard focus is visible inside a constrained popup');
  assert.deepEqual(await page.evaluate(()=>[scrollY,document.querySelector('.discover-page').scrollTop]),readingPosition,'Menu scrolling preserves the outer reading position');
  await page.keyboard.press('Escape');await constrainedPanel.evaluate(node=>node.remove());
  await open('sidepanel','interests',320,600);
  const groupTrigger=page.locator('.interest-group-tools > summary');
  await groupTrigger.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.groupAction),'suggest');
  await inViewport('.interest-group-tools .action-popover-panel');
  await page.keyboard.press('Escape');
  assert.equal(await groupTrigger.evaluate(node=>node===document.activeElement),true);
  await groupTrigger.press('ArrowDown');await page.keyboard.press('Enter');
  await page.locator('.interest-group-dialog').waitFor();await page.keyboard.press('Escape');
  await page.locator('.interest-group-dialog').waitFor({state:'detached'});
  assert.equal(await groupTrigger.evaluate(node=>node===document.activeElement),true,'Closing group tools returns to the visible trigger');
  await groupTrigger.click();await page.locator('[data-group-action="suggest"]').click();
  await page.locator('.interest-group-dialog').waitFor({timeout:2000});
  await page.keyboard.press('Escape');await page.locator('.interest-group-dialog').waitFor({state:'detached'});
  checks.push('Action popups support Arrow/Home/End, Enter, Escape, focus return, outside click and Tab exit; group tools fit 320px');
  await open('dashboard','discover',1280,800);
  const topicTitle=await page.locator('#selected-topic-title').innerText();
  const batchTime=await page.locator('.last-updated').innerText();
  await page.locator('[data-action="save-topic"]').press('Enter');
  await page.locator('.saved-label').waitFor();
  assert.equal(await page.locator('.connection-label').innerText(),'Interest saved.','Saving has visible success feedback');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'selected-topic-title','Saving by keyboard keeps focus with the selected topic');
  assert.equal(await page.locator('#selected-topic-title').innerText(),topicTitle);
  assert.equal(await page.locator('.last-updated').innerText(),batchTime,'Feedback does not replace the recommendation batch');
  await inViewport('.topic-actions');
  await page.locator('[data-focus="nav-settings"]').click();
  assert.equal(await page.locator('.connection-label').innerText(),'Demo preview','Navigation clears old success feedback');
  checks.push('Saving gives visible feedback without covering actions, preserves the batch and keyboard focus, and clears on navigation');
  assert.deepEqual(errors,[]);
}catch(error){failure=error;if(page)await page.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});}
finally{
  await writeFile(resolve(output,'results.json'),JSON.stringify({checks,measurements,errors,failure:failure?.stack},null,2));
  await context?.close();await rm(profile,{recursive:true,force:true});
}
if(failure)throw failure;
console.log(JSON.stringify({checks,measurements},null,2));
