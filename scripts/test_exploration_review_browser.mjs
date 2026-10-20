// Real extension in a disposable profile; external searches are fulfilled locally.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchExtension} from './browser-test-helpers.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.cache/qa/exploration-review');await mkdir(output,{recursive:true});
const temp=await mkdtemp(resolve(tmpdir(),'otherwise-exploration-review-'));
const extension=resolve(temp,'extension');await cp(resolve(root,'dist/otherwise-extension'),extension,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json'),'utf8'));
manifest.host_permissions=['http://127.0.0.1/*'];
manifest.optional_host_permissions=manifest.optional_host_permissions.filter(value=>value!=='http://127.0.0.1/*');
await writeFile(resolve(extension,'manifest.json'),JSON.stringify(manifest));
const topics=['Botany','Landscape architecture','Ecology','Urban planning'].map(topic=>({topic,domain:'Nature',description:'A fictional topic for exploring.',nearest_interest:'Gardening'}));
const requests=[],errors=[],checks=[];
const server=createServer(async(request,response)=>{
  let body='';for await(const chunk of request)body+=chunk;
  requests.push(JSON.parse(body));response.setHeader('Content-Type','application/json');
  response.end(JSON.stringify({recommendations:topics}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let context,base,close;
try {
  ({context, base, close}=await launchExtension({extension,profile:resolve(temp,'profile'),viewport:{width:390,height:850}}));
  await context.route(/https:\/\/www\.(google|youtube)\.com\//,route=>route.fulfill({contentType:'text/html',body:'<h1>Fictional external search</h1>'}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(8000);
  const action=(target,action)=>target.evaluate(action=>chrome.runtime.sendMessage({type:'ACTION',action}),action);
  const state=()=>page.evaluate(async()=> (await chrome.storage.local.get('state')).state);
  await page.goto(`${base}sidepanel.html?view=interests`);
  await page.locator('#manual-interest').waitFor();
  await action(page,{type:'SET_SETTINGS',patch:{tutorialSeen:true,tutorialActive:false,endpoint:`http://127.0.0.1:${server.address().port}`}});
  await action(page,{type:'ADD_INTEREST',topic:'Gardening'});
  await page.locator('[data-focus=nav-discover]').click();
  await page.locator('[data-action=recommend]').click();
  await page.locator('.topic-detail[data-topic-id=Botany]').waitFor();
  const searchFromUI=async(id)=>{
    await page.bringToFront();
    while(await page.locator('.topic-detail').getAttribute('data-topic-id')!==id)await page.locator('[data-action=topic-next]').click();
    await page.locator('.topic-search > summary').click();
    const opened=context.waitForEvent('page');
    await page.locator(`[data-action=search][data-id="${id}"][data-provider=google]`).click();
    const external=await opened;await external.waitForLoadState();await external.bringToFront();
    await page.waitForFunction(async()=> (await chrome.storage.local.get('state')).state.explored.length>0);
    return external;
  };
  const external=await searchFromUI('Botany');
  assert.deepEqual((await state()).approved.map(row=>row.id),['Gardening']);
  assert.equal((await state()).focus,'Gardening');
  assert.equal(await page.locator('.exploration-review').count(),0,'no confirmation during the outbound search');
  await page.bringToFront();
  await page.locator('.exploration-review').waitFor({timeout:3000});
  assert.equal(await page.locator('.exploration-review [data-action=save-topic][data-id=Botany]').count(),1);
  assert.equal(requests.length,1,'exploration and return do not request new recommendations');
  await page.screenshot({path:resolve(output,'return-en-narrow.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>{
    const title=document.querySelector('#selected-topic-title').getBoundingClientRect();
    const copy=document.querySelector('.topic-detail-copy').getBoundingClientRect();
    return title.top>=copy.top && title.bottom<=copy.bottom;
  }),true,'the return prompt must not squash the recommendation title out of its reading area');
  await page.locator('.exploration-review [data-action=postpone-exploration]').focus();await page.keyboard.press('Enter');
  await page.locator('.exploration-review').waitFor({state:'detached'});
  assert.deepEqual((await state()).suppressed,[]);
  assert.equal((await state()).explored.length,1);
  await page.reload();await page.locator('#recommendations-title').waitFor();
  assert.equal(await page.locator('.exploration-review').count(),0,'postponement survives reopening');
  checks.push('Successful search records exploration only; focus/visibility return alone reveals confirmation; keyboard postponement persists without negative feedback or new requests');

  await page.locator('[data-focus=nav-interests]').click();
  await page.locator('[data-action=interest-overview]').click();
  const recentSave=page.locator('.interest-overview-dialog .overview-recent [data-action=save-topic][data-id=Botany]');
  await recentSave.waitFor();await recentSave.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(async()=> (await chrome.storage.local.get('state')).state.approved.some(row=>row.id==='Botany'));
  await page.getByRole('status').filter({hasText:'Interest saved.'}).waitFor();
  assert.equal((await state()).focus,'Botany');
  await page.locator('[data-action=interest-overview]').click();
  await page.locator('.interest-overview-dialog .recent-saved').filter({hasText:'Saved'}).waitFor();
  assert.equal(await page.locator('.interest-overview-dialog .overview-recent [data-action=save-topic][data-id=Botany]').count(),0);
  await page.locator('.overview-dialog-close').click();
  checks.push('Recently explored remains a working keyboard save entry after postponement; explicit save changes focus and displays saved status');

  // Queue a group through the production background; a fresh window is a return.
  await page.locator('[data-focus=nav-discover]').click();await page.locator('[data-action=recommend]').click();
  for(const topic of topics.slice(1)){
    const result=await page.evaluate(topic=>chrome.runtime.sendMessage({type:'SEARCH',topic,provider:'youtube'}),topic);
    assert.ok(!result.error,result.error);
  }
  const dashboard=await context.newPage();dashboard.on('pageerror',error=>errors.push(error.message));
  await dashboard.setViewportSize({width:1440,height:1000});
  await dashboard.goto(`${base}dashboard.html?view=discover`);
  await dashboard.locator('.exploration-review').waitFor();
  assert.equal(await dashboard.locator('.exploration-review [data-action=save-topic]').count(),3);
  await action(dashboard,{type:'SET_SETTINGS',patch:{language:'zh-CN'}});
  await dashboard.locator('.exploration-review').filter({hasText:'加入兴趣'}).waitFor();
  await dashboard.screenshot({path:resolve(output,'group-zh-wide.png'),fullPage:true});
  await dashboard.setViewportSize({width:1440,height:700});
  await dashboard.evaluate(()=>{document.querySelector('.discover-page').scrollTop=100;});
  const readingTop=await dashboard.locator('.topic-detail-copy').evaluate(element=>element.getBoundingClientRect().top);
  const selectedBefore=await dashboard.locator('.topic-detail').getAttribute('data-topic-id');
  const batchBefore=await dashboard.locator('.topic-detail').getAttribute('data-batch');
  const requestsBefore=requests.length;
  await dashboard.locator('.exploration-review [data-action=save-topic][data-id=Ecology]').click();
  await dashboard.waitForFunction(async()=> (await chrome.storage.local.get('state')).state.focus==='Ecology');
  assert.equal(await dashboard.locator('.topic-detail').getAttribute('data-topic-id'),selectedBefore);
  assert.equal(await dashboard.locator('.topic-detail').getAttribute('data-batch'),batchBefore);
  assert.ok(Math.abs(await dashboard.locator('.topic-detail-copy').evaluate(element=>element.getBoundingClientRect().top)-readingTop)<2,'saving from a group preserves the recommendation reading position');
  assert.equal(requests.length,requestsBefore,'auto-refresh off preserves the displayed batch');
  await page.bringToFront();await page.locator('.brand').click();
  assert.equal(await page.locator('.exploration-review [data-id=Ecology]').count(),0,'save synchronizes across windows');
  await dashboard.bringToFront();
  const postponedTokens=await dashboard.locator('.exploration-review [data-action=postpone-exploration]').evaluateAll(buttons=>buttons.map(button=>button.dataset.token));
  for(const token of postponedTokens){
    await dashboard.locator(`[data-action=postpone-exploration][data-token="${token}"]`).click();
  }
  await dashboard.locator('.exploration-review').waitFor({state:'detached'});
  await page.locator('.exploration-review').waitFor({state:'detached'});
  checks.push('Grouped bilingual confirmation works on Dashboard, saves synchronize across windows, and saving preserves the current recommendation and batch');
  await page.setViewportSize({width:320,height:850});await page.locator('[data-focus=nav-interests]').click();
  await page.locator('[data-action=interest-overview]').click();
  await page.waitForFunction(()=>{
    const dialog=document.querySelector('.interest-overview-dialog');
    return dialog?.open && Number(getComputedStyle(dialog).opacity)>.99;
  });
  await page.screenshot({path:resolve(output,'recent-zh-320.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  await external.close();
  await writeFile(resolve(output,'result.json'),JSON.stringify({checks,errors,requests:requests.length},null,2));
  console.log(JSON.stringify({checks,errors,requests:requests.length},null,2));
} finally {
  await close?.();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});
}
