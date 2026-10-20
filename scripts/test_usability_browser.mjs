// Production extension UI in a disposable profile, with fictional data and a local fixture service.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchExtension} from './browser-test-helpers.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.cache/qa/usability');await mkdir(output,{recursive:true});
const temp=await mkdtemp(resolve(tmpdir(),'otherwise-usability-'));
const extension=resolve(temp,'extension');await cp(resolve(root,'dist/otherwise-extension'),extension,{recursive:true});
const manifestPath=resolve(extension,'manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
manifest.host_permissions=['http://127.0.0.1/*'];
manifest.optional_host_permissions=manifest.optional_host_permissions.filter(value=>value!=='http://127.0.0.1/*');
await writeFile(manifestPath,JSON.stringify(manifest));
let serviceMode='ready', releaseStatus;
const requests=[],checks=[],errors=[];
const topics=[{topic:'Botany',domain:'Nature',description:'Study of plants',nearest_interest:'Java (programming language)'},
  {topic:'Landscape architecture',domain:'Design',description:'Designing outdoor places',nearest_interest:'Java (programming language)'}];
const server=createServer(async(request,response)=>{
  let body='';for await(const chunk of request)body+=chunk;
  requests.push({method:request.method,path:request.url,body});
  response.setHeader('Content-Type','application/json');
  if(request.url==='/api/status'){
    if(serviceMode==='delayed')await new Promise(resolve=>{releaseStatus=resolve;});
    if(serviceMode==='unauthorized'){response.writeHead(401);response.end('{}');return;}
    if(serviceMode==='incompatible'){response.end('{"ready":true}');return;}
    response.end(JSON.stringify({schema_version:1,service:'otherwise',ready:serviceMode!=='warming',discovery_ready:!['warming','specific'].includes(serviceMode)}));
  }else if(request.url==='/api/recommend')response.end(JSON.stringify({recommendations:topics}));
  else {response.writeHead(404);response.end('{}');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const endpoint=`http://127.0.0.1:${server.address().port}`;
let context,base,close;
try{
  ({context, base, close}=await launchExtension({extension,profile:resolve(temp,'profile'),viewport:{width:390,height:850}}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}sidepanel.html?view=interests`);
  const action=(target,action)=>target.evaluate(action=>chrome.runtime.sendMessage({type:'ACTION',action}),action);
  const state=()=>page.evaluate(async()=> (await chrome.storage.local.get('state')).state);
  // Poll resolved snapshots explicitly; an async browser predicate can resolve
  // false after the runner has already accepted its truthy Promise.
  const waitForState=async predicate=>{
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
      const snapshot=await state();
      if(predicate(snapshot))return snapshot;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw new Error('The saved extension state did not reach the expected state.');
  };
  await page.locator('#manual-interest').waitFor();
  await action(page,{type:'SET_SETTINGS',patch:{tutorialSeen:true,tutorialActive:false}});
  await page.locator('#manual-interest').fill('Java');
  const languageChoice=page.locator('[data-action="choose-interest"][data-id="Q251"]');
  await languageChoice.waitFor();
  await page.locator('#manual-form [type="submit"]').click();
  assert.equal((await state()).approved.length,0,'Enter on an ambiguous word does not choose the island');
  assert.equal(await languageChoice.innerText().then(text=>text.includes('Java (programming language)')),true);
  await page.screenshot({path:resolve(output,'input-choices-en.png'),fullPage:true});
  await languageChoice.focus();await page.keyboard.press('Enter');
  await waitForState(snapshot=>snapshot.approved.some(row=>row.id==='Java (programming language)'));
  assert.equal((await state()).approved.some(row=>row.id==='Java'),false);
  await page.locator('#manual-interest').fill('analog photography weekends');
  await page.locator('#manual-form [type="submit"]').click();
  const customSaved=await waitForState(snapshot=>snapshot.approved.length===2);
  assert.equal(customSaved.approved[1].topic,'analog photography weekends');
  assert.equal(requests.length,0,'Input choices never send a service request');
  checks.push('Ambiguous Java requires an explicit keyboard-accessible meaning choice; custom wording is preserved with no network request');

  await action(page,{type:'SET_SETTINGS',patch:{endpoint,accessToken:'fictional-code'}});
  await page.locator('[data-focus=nav-settings]').click();
  await page.locator('[data-disclosure=settings-connection] > summary').click();
  const check=async(mode,status)=>{
    serviceMode=mode;await page.locator('[data-action=check-connection]').click();
    await page.waitForFunction(expected=>document.querySelector('#connection-check-status')?.dataset.status===expected,status);
  };
  for(const [mode,status] of [['ready','ready'],['warming','warming'],['specific','discovery_unavailable'],['unauthorized','unauthorized'],['incompatible','incompatible'],['ready','ready']])await check(mode,status);
  assert.ok(requests.every(row=>row.method==='GET' && row.path==='/api/status' && row.body===''));
  await page.locator('#access-token').fill('unsaved-change');
  assert.equal(await page.locator('[data-action=check-connection]').isDisabled(),true);
  await page.locator('#access-token').fill('fictional-code');
  assert.equal(await page.locator('[data-action=check-connection]').isDisabled(),false);
  checks.push('Saved-connection checks distinguish readiness/authentication/incompatible service, send no interests, and block unsaved connection drafts');

  const dashboard=await context.newPage();dashboard.on('pageerror',e=>errors.push(e.message));
  await dashboard.goto(`${base}dashboard.html?view=settings`);
  await dashboard.locator('[data-disclosure=settings-connection] > summary').click();
  await dashboard.locator('[data-action=check-connection]').click();
  await dashboard.waitForFunction(()=>document.querySelector('#connection-check-status')?.dataset.status==='ready');
  serviceMode='delayed';await page.locator('[data-action=check-connection]').click();
  await page.waitForFunction(()=>document.querySelector('#connection-check-status')?.dataset.status==='checking');
  // Changing the saved code in another surface invalidates both displayed and pending results.
  await action(dashboard,{type:'SET_SETTINGS',patch:{accessToken:'updated-fictional-code'}});
  serviceMode='ready';releaseStatus?.();
  await page.waitForFunction(()=>document.querySelector('#connection-check-status')?.dataset.status==='untested');
  await dashboard.waitForFunction(()=>document.querySelector('#connection-check-status')?.dataset.status==='untested');
  checks.push('A saved connection change from Dashboard discards a delayed check and clears both windows');

  await page.locator('[data-focus=nav-discover]').click();
  const response=await page.evaluate(()=>chrome.runtime.sendMessage({type:'RECOMMEND'}));assert.equal(response.state.recommendations.length,2);
  await page.locator('[data-action=dismiss][data-id=Botany]').waitFor({state:'attached'});
  await page.locator('.topic-more > summary').click();
  await page.locator('[data-action=dismiss][data-id=Botany]').click();
  await dashboard.locator('[data-action=undo-dismiss]').waitFor();
  assert.equal((await state()).suppressed.includes('Botany'),true);
  await dashboard.locator('[data-action=undo-dismiss]').click();
  await page.locator('.topic-more > summary').click();
  await waitForState(snapshot=>!snapshot.suppressed.includes('Botany'));
  assert.equal((await state()).recommendationBatch.items.some(row=>row.id==='Botany'),true);
  await action(page,{type:'DISMISS',id:'Botany'});
  await dashboard.reload();
  await dashboard.locator('[data-disclosure=settings-hidden] > summary').click();
  await dashboard.locator('[data-action=restore-hidden][data-id=Botany]').click();
  assert.equal((await state()).approved.some(row=>row.id==='Botany'),false);
  assert.equal((await state()).suppressed.includes('Botany'),false);
  checks.push('Dismissal undo works across windows; hidden-topic management survives reload and restores visibility without saving an interest');

  for(let i=0;i<12;i++)await action(page,{type:'DISMISS',id:`Fixture topic ${i}`});
  await action(page,{type:'SET_SETTINGS',patch:{language:'zh-CN'}});
  for(const target of [page,dashboard]){
    await target.locator('[data-focus=nav-settings]').click();
    const hidden=target.locator('[data-disclosure=settings-hidden]');
    if(!await hidden.evaluate(node=>node.open))await hidden.locator(':scope > summary').click();
    await target.locator('[data-action=hidden-next]').click();
    assert.equal(await target.locator('.hidden-topic-row').count(),2);
    await target.locator('#hidden-topic-search').fill('Fixture topic 11');
    assert.equal(await target.locator('.hidden-topic-row').count(),1);
    for(const width of target===page?[320,390]:[1100]){
      await target.setViewportSize({width,height:850});
      assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await target.screenshot({path:resolve(output,`hidden-${width}-zh.png`),fullPage:true});
    }
  }
  checks.push('Chinese hidden-topic search and pagination work on panel/Dashboard and fit 320/390/1100px');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'results.json'),JSON.stringify({passed:true,checks},null,2));
  console.log(JSON.stringify({passed:true,checks},null,2));
}finally{
  releaseStatus?.();await close?.();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});
}
