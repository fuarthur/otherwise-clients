import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.OTHERWISE_PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.cache/qa/stats');await mkdir(output,{recursive:true});
const profile=await mkdtemp(resolve(tmpdir(),'otherwise-stats-'));
let context;const errors=[],checks=[];
try {
 const extension=resolve(root,'dist/otherwise-extension');
 context=await chromium.launchPersistentContext(profile,{executablePath:process.env.OTHERWISE_CHROMIUM || chromium.executablePath(),headless:true,ignoreDefaultArgs:['--disable-extensions'],viewport:{width:1280,height:850},reducedMotion:'reduce',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const base=worker.url().replace('background.js','');
 const requests=[];context.on('request',r=>{if(/https?:.*\/api\//.test(r.url()))requests.push(r.url());});
 const page=await context.newPage();await page.goto(`${base}dashboard.html?view=settings`);
 await page.evaluate(()=>chrome.runtime.sendMessage({type:'ACTION',action:{type:'SET_SETTINGS',patch:{tutorialActive:false,tutorialSeen:true}}}));
 await page.locator('[data-focus="nav-stats"]').click({timeout:3000});
 assert.equal(await page.locator('[data-stats-total]').innerText(),'0');
 await page.getByRole('tab',{name:'Activity',exact:true}).click();
 assert.equal(await page.locator('[role="tabpanel"]').count(),1);
 await page.getByRole('tab',{name:'Activity',exact:true}).press('ArrowRight');
 assert.equal(await page.getByRole('tab',{name:'Achievements',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('tab',{name:'Achievements',exact:true}).press('Home');
 await page.locator('[data-stats-info]').click();await page.getByRole('dialog').waitFor();
 await page.getByRole('dialog').press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 checks.push('Empty state, three exclusive tabs, keyboard arrows and info dialog');
 // Explicit fictional fixture, imported via the public backup API in this disposable profile.
 await page.evaluate(async()=>{
  const {createState,reduceState}=await import('./core/index.js');
  const {createBackup}=await import('./core/backup.js');
  const now=Date.now(),day=86400000;let state=createState(now-8*day);
  for(let i=0;i<8;i++)state=reduceState(state,{type:'ADD_INTEREST',topic:`Seed ${i}`},now-8*day);
  for(let i=0;i<12;i++)state=reduceState(state,{type:'EXPLORE',topic:{id:`Topic ${i}`,topic:`Topic ${i}`,domain:['Science','Design','Nature'][i%3],description:''}},now-(6-i%7)*day);
  const response=await chrome.runtime.sendMessage({type:'IMPORT_BACKUP',backup:createBackup(state),mode:'replace'});
  if(response.error)throw Error(response.error);
 });
 await page.waitForFunction(()=>document.querySelector('[data-stats-total]')?.textContent==='12');
 assert.match(await page.locator('.stats-growth').innerText(),/150%/);
 assert.equal(await page.locator('.stats-celebration').count(),0,'Import does not replay achievements');
 await page.locator('.stats-heading h1').click();
 await page.screenshot({path:resolve(output,'overview-desktop-dark.png'),fullPage:true});
 const statsWidth=(await page.locator('.stats-page').boundingBox()).width;
 await page.getByRole('tab',{name:'Activity',exact:true}).click();
 assert.equal(await page.locator('[data-stats-average]').innerText(),'1.7');
 await page.locator('[data-stats-period="30"]').click();
 assert.equal(await page.locator('[data-stats-day]').count(),30);
 const dayCell=page.locator('[data-stats-day]').nth(5),key=await dayCell.getAttribute('data-stats-day');
 await dayCell.focus();
 await page.evaluate(()=>chrome.runtime.sendMessage({type:'ACTION',action:{type:'SET_SETTINGS',patch:{theme:'light'}}}));
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.statsDay),key,'Background updates preserve calendar focus');
 await page.screenshot({path:resolve(output,'activity-desktop-light.png'),fullPage:true});
 await page.getByRole('tab',{name:'Achievements',exact:true}).click();
 assert.ok(Math.abs((await page.locator('.stats-page').boundingBox()).width-statsWidth)<1,'Subtabs keep a stable page width');
 await page.locator('[data-stats-track="breadth"]').click();
 assert.equal(await page.locator('.stats-tier-list li').count(),3);
 await page.getByRole('dialog').press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 await page.screenshot({path:resolve(output,'achievements-desktop-light.png'),fullPage:true});
 checks.push('Seeded growth, fixed daily average, 30-day calendar, focus preservation, milestone details');
 const panel=await context.newPage();await panel.goto(`${base}sidepanel.html?view=stats`);
 await panel.setViewportSize({width:320,height:850});
 await panel.locator('[data-stats-total]').waitFor();
 for(const theme of ['dark','light']){
  await panel.evaluate(theme=>chrome.runtime.sendMessage({type:'ACTION',action:{type:'SET_SETTINGS',patch:{theme,language:'zh-CN'}}}),theme);
  await panel.waitForFunction(theme=>document.documentElement.dataset.theme===theme && document.documentElement.lang==='zh-CN',theme);
  for(const tab of ['overview','activity','achievements']){
   await panel.locator(`[data-stats-tab="${tab}"]`).click();
   if(tab==='activity')await panel.locator('[data-stats-period="30"]').click();
   assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${theme} ${tab} 320px overflow`);
   const bottom=await panel.locator('.stats-page').evaluate(el=>el.getBoundingClientRect().bottom);
   assert.ok(bottom<=850,`${theme} ${tab} should fit reference height; bottom=${bottom}`);
   await panel.screenshot({path:resolve(output,`${tab}-panel-${theme}.png`),fullPage:true});
  }
 }
 await panel.reload();await panel.locator('[data-stats-tab="achievements"][aria-selected="true"]').waitFor();
 // Independently check a desktop viewport at 200%; 320 CSS px was checked above.
 await panel.setViewportSize({width:1280,height:900});
 await panel.evaluate(()=>document.body.style.zoom='2');
 for(const tab of ['overview','activity','achievements']){
  await panel.locator(`[data-stats-tab="${tab}"]`).click();
  assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`200% zoom ${tab} does not cause horizontal overflow`);
 }
 await panel.locator('[data-stats-info]').click();await panel.getByRole('dialog').waitFor();
 await panel.getByRole('dialog').press('Escape');
 checks.push('Both palettes, Chinese, 320px panels, URL restoration and zoom reflow');
 assert.equal(requests.length,0,'Stats never requests recommendations');
 // Successful exploration after reset earns once; no real search traffic leaves this fixture.
 await context.route('https://www.google.com/**',route=>route.fulfill({body:'<title>Test search</title>'}));
 await page.bringToFront();
 await page.evaluate(async()=>{
  for(const action of [{type:'RESET'},{type:'SET_SETTINGS',patch:{tutorialActive:false,tutorialSeen:true}},{type:'ADD_INTEREST',topic:'Gardening'}])await chrome.runtime.sendMessage({type:'ACTION',action});
 });
 await page.locator('[data-focus="nav-stats"]').click();
 await page.evaluate(()=>chrome.runtime.sendMessage({type:'SEARCH',topic:'Gardening',provider:'google'}));
 await page.bringToFront();await page.locator('.stats-celebration').waitFor({timeout:5000});
 const winners=await Promise.all([page,panel].map(p=>p.locator('.stats-celebration').count()));
 assert.equal(winners.reduce((a,b)=>a+b,0),1);
 await page.reload();await page.locator('[data-stats-total]').waitFor();
 assert.equal(await page.locator('.stats-celebration').count(),0);
 checks.push('Live successful search counts and celebrates exactly once across windows; reload does not replay');
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({checks,errors},null,2));
} finally {await context?.close();await rm(profile,{recursive:true,force:true});}
