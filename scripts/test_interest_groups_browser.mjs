// Production extension in a disposable profile, with fictional interests/service.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.OTHERWISE_PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.cache/qa/interest-groups');await mkdir(output,{recursive:true});
const temp=await mkdtemp(resolve(tmpdir(),'otherwise-group-browser-'));
const extension=resolve(temp,'extension');await cp(resolve(root,'dist/otherwise-extension'),extension,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json'),'utf8'));
manifest.host_permissions=['http://127.0.0.1/*'];
manifest.optional_host_permissions=manifest.optional_host_permissions.filter(value=>value!=='http://127.0.0.1/*');
await writeFile(resolve(extension,'manifest.json'),JSON.stringify(manifest));
const requests=[],errors=[],checks=[];
const server=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;
  const body=JSON.parse(raw);requests.push({path:request.url,body});
  response.setHeader('Content-Type','application/json');
  if(request.url==='/api/interest-groups') {
    const last=body.keywords.at(-1);
    response.end(JSON.stringify({groups:[
      {name:'First topics',interest_ids:body.keywords.slice(0,2)},
      {name:'More topics',interest_ids:body.keywords.slice(2,-1)},
      {name:'Latest topic',interest_ids:[last]},
    ]}));
  } else response.end(JSON.stringify({recommendations:[
    {topic:'Fixture interest 050',domain:'Fixture',description:'An already saved interest outside the requested groups.'},
    {topic:'A new direction',domain:'Fixture',description:'A fictional recommendation for testing.'},
  ]}));
});
let context,page;
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  context=await chromium.launchPersistentContext(resolve(temp,'profile'),{
    executablePath:process.env.OTHERWISE_CHROMIUM || chromium.executablePath(),headless:true,
    ignoreDefaultArgs:['--disable-extensions'],viewport:{width:390,height:850},
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  });
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const base=worker.url().replace('background.js','');page=await context.newPage();
  page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  const action=action=>page.evaluate(action=>chrome.runtime.sendMessage({type:'ACTION',action}),action);
  const state=()=>page.evaluate(async()=> (await chrome.storage.local.get('state')).state);
  const dialog=()=>page.locator('dialog').last();
  const groupAction=async name=>{
    const control=page.locator(`[data-group-action="${name}"]`).first();
    if (!await control.isVisible()) await page.locator('.interest-group-tools > summary').click();
    await control.click();
  };
  await page.goto(`${base}sidepanel.html?view=interests`);await page.locator('#manual-interest').waitFor();
  await action({type:'SET_SETTINGS',patch:{tutorialSeen:true,tutorialActive:false,endpoint:`http://127.0.0.1:${server.address().port}`,language:'zh-CN'}});
  const imported=await page.evaluate(async()=>{
    const {createState}=await import('./core/index.js');const {createBackup}=await import('./core/backup.js');
    const source=createState();source.settings.language='zh-CN';
    source.approved=Array.from({length:600},(_,i)=>({id:`Fixture interest ${String(i).padStart(3,'0')}`,topic:`Fixture interest ${String(i).padStart(3,'0')}`,domain:'Custom',description:'',addedAt:Date.now()}));
    source.baseline=source.approved.map(row=>row.id);source.focus=source.approved.at(-1).id;
    return chrome.runtime.sendMessage({type:'IMPORT_BACKUP',backup:createBackup(source),mode:'replace'});
  });
  assert.equal(imported.error,undefined);assert.equal(imported.state.approved.length,600);
  await page.waitForFunction(()=>document.querySelector('#interests-title .count')?.textContent==='600');
  await page.locator('#manual-interest').fill('Brand new hobby');await page.locator('[data-focus=add-interest]').click();
  await page.waitForFunction(async()=> (await chrome.storage.local.get('state')).state.approved.length===601);
  const createGroup=async(name,ids)=>{
    await page.locator('[data-group-action=create]').click();
    await dialog().locator('[data-group-name]').fill(name);
    for(const id of ids){await dialog().locator('[data-group-search]').fill(id);await dialog().locator(`[data-group-member="${id}"]`).check();}
    await dialog().locator('[data-group-action=save]').click();await page.locator('dialog').waitFor({state:'detached'});
  };
  await createGroup('我的研究',['Fixture interest 000','Fixture interest 001']);
  await createGroup('另一个方向',['Fixture interest 001','Fixture interest 002']);
  const manual=(await state()).interestGroups;assert.equal(manual.length,2);
  // A reducer validation error must keep the real app's editor open.
  await page.locator('[data-group-action=create]').click();await dialog().locator('[data-group-name]').fill('我的研究');
  await dialog().locator('[data-group-action=save]').click();
  await dialog().locator('[data-group-error]:visible').waitFor();assert.equal((await state()).interestGroups.length,2);
  await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
  await page.locator('[data-group-filter]').selectOption('ungrouped');
  await page.locator('#saved-interest-search').fill('Brand new hobby');
  await page.getByRole('button',{name:'Brand new hobby',exact:true}).waitFor();
  assert.equal((await state()).interestGroups.some(row=>row.interestIds.includes('Brand new hobby')),false);
  await page.locator('[data-focus=nav-discover]').click();await page.locator('[data-group-action=scope]').click();
  for(const group of manual)await dialog().locator(`[data-group-scope-id="${group.id}"]`).check();
  await dialog().locator('[data-group-action=scope-save]').click();await page.locator('dialog').waitFor({state:'detached'});
  assert.equal(requests.length,0,'scope selection itself does not fetch with auto-refresh disabled');
  await page.locator('[data-action=recommend]').click();await page.locator('.topic-detail[data-topic-id="A new direction"]').waitFor();
  assert.deepEqual(requests[0].body.keywords,['Fixture interest 000','Fixture interest 001','Fixture interest 002']);
  assert.equal(requests[0].body.mode,'global');assert.equal((await state()).recommendations.length,1);
  await page.setViewportSize({width:320,height:600});
  assert.equal(await page.evaluate(()=>{
    const title=document.querySelector('#selected-topic-title').getBoundingClientRect();
    const copy=document.querySelector('.topic-detail-copy').getBoundingClientRect();
    return title.top>=copy.top && title.bottom<=copy.bottom;
  }),true,'group controls must leave the recommendation title readable on a short side panel');
  await page.setViewportSize({width:390,height:850});
  await page.reload();await page.locator('[data-group-action=scope]').waitFor();
  assert.deepEqual((await state()).recommendationGroupIds,manual.map(row=>row.id));
  const overview=await context.newPage();await overview.goto(`${base}dashboard.html?view=discover`);
  await overview.locator('.interest-group-scope-summary').waitFor();
  assert.match(await overview.locator('.interest-group-scope-summary').innerText(),/我的研究/);
  assert.match(await overview.locator('.interest-group-scope-summary').innerText(),/3/);await overview.close();
  checks.push('601 interests, real manual overlapping groups, duplicate-name error remains editable, ungrouped new interests, scoped deduplicated recommendations and remembered scope across windows');
  await page.locator('[data-focus=nav-interests]').click();await groupAction('suggest');
  await dialog().locator('[data-group-action=apply]').waitFor();assert.equal((await state()).interestGroups.length,2);
  await dialog().locator('[data-group-suggestion-name="1"]').fill('用户修改的自动建议');
  await dialog().locator('[data-group-action=apply]').click();await page.locator('dialog').waitFor({state:'detached'});
  let groups=(await state()).interestGroups;
  assert.ok(manual.every(group=>groups.some(row=>row.id===group.id && row.name===group.name)));
  assert.equal(groups.find(row=>row.name==='用户修改的自动建议').source,'manual');
  const automatic=groups.find(row=>row.source==='semantic');assert.ok(automatic);
  await page.locator('[data-group-filter]').selectOption(automatic.id);await groupAction('edit');
  await dialog().locator('[data-group-name]').fill('手动保护的组');await dialog().locator('[data-group-action=save]').click();
  await page.locator('dialog').waitFor({state:'detached'});assert.equal((await state()).interestGroups.find(row=>row.id===automatic.id).source,'manual');
  const protectedGroups=(await state()).interestGroups;
  await groupAction('suggest');await dialog().locator('[data-group-action=apply]').waitFor();
  await dialog().locator('[data-group-action=apply]').click();await page.locator('dialog').waitFor({state:'detached'});
  groups=(await state()).interestGroups;
  assert.equal(groups.length,protectedGroups.length);assert.ok(groups.some(row=>row.id===automatic.id && row.name==='手动保护的组'));
  const backup=await page.evaluate(async()=>{const {createBackup,parseBackup}=await import('./core/backup.js');return parseBackup(JSON.stringify(createBackup((await chrome.storage.local.get('state')).state)));});
  assert.equal(backup.version,3);assert.equal(backup.data.approved.length,601);assert.deepEqual(backup.data.interestGroups,groups);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:850});
    await page.locator('[data-focus=nav-discover]').click();await page.locator('[data-group-action=scope]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await dialog().evaluate(node=>node.scrollWidth<=node.clientWidth),true);
    await page.screenshot({path:resolve(output,`scope-${width}-zh.png`),fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
    await page.locator('[data-focus=nav-interests]').click();
  }
  checks.push('semantic preview, no pre-apply writes, preview edits protected, automatic refresh preserves manual edits, version 3 backup, 320/390px Chinese layouts');
  assert.deepEqual(errors,[]);await writeFile(resolve(output,'checks.json'),JSON.stringify({checks,errors,requests:requests.map(row=>({path:row.path,keywords:row.body.keywords.length}))},null,2));
  console.log(JSON.stringify({checks,errors}));
} catch(error) {
  await page?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});
  await writeFile(resolve(output,'failure.json'),JSON.stringify({error:error.stack,errors,requests:requests.map(row=>({path:row.path,keywords:row.body.keywords?.length})),dialogs:await page?.locator('dialog').allTextContents()},null,2));
  throw error;
} finally {
  await context?.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});
}
