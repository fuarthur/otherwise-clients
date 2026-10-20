import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchExtension} from './browser-test-helpers.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.cache/qa/stats');await mkdir(output,{recursive:true});
let context,base,close;const errors=[],checks=[];
async function assertBackgroundFillsWindow(page,label) {
 const bounds=await page.evaluate(()=>({viewport:innerHeight,bodyBottom:document.body.getBoundingClientRect().bottom}));
 assert.ok(bounds.bodyBottom>=bounds.viewport,`${label}: page background must cover the viewport: ${JSON.stringify(bounds)}`);
}
try {
 const extension=resolve(root,'dist/otherwise-extension');
 ({context, base, close}=await launchExtension({extension,profilePrefix:'otherwise-stats-',viewport:{width:1280,height:850},reducedMotion:'reduce',ignoreDefaultArgs:['--disable-extensions','--hide-scrollbars']}));
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));

 const requests=[];context.on('request',r=>{if(/https?:.*\/api\//.test(r.url()))requests.push(r.url());});
 const page=await context.newPage();await page.goto(`${base}dashboard.html?view=settings`);
 await page.evaluate(()=>chrome.runtime.sendMessage({type:'ACTION',action:{type:'SET_SETTINGS',patch:{tutorialActive:false,tutorialSeen:true}}}));
 await page.locator('[data-focus="settings-stats-timezone"]').click();
 assert.equal(await page.locator('#stats-follow-system-timezone').isChecked(),true);
 assert.equal(await page.locator('#stats-timezone').count(),0);
 await page.locator('#stats-follow-system-timezone').uncheck();
 await page.locator('#stats-timezone').waitFor();
 await page.locator('#stats-timezone-search').fill('Shanghai');
 await page.locator('#stats-timezone').selectOption('Asia/Shanghai');
 await page.waitForFunction(()=>document.querySelector('[data-stats-effective-timezone]')?.textContent.includes('Asia/Shanghai'));
 await page.reload();
 await page.locator('[data-focus="settings-stats-timezone"]').click();
 assert.equal(await page.locator('#stats-follow-system-timezone').isChecked(),false);
 assert.equal(await page.locator('#stats-timezone').inputValue(),'Asia/Shanghai');
 await page.setViewportSize({width:320,height:850});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Timezone settings fit a narrow panel');
 await page.locator('[data-disclosure="settings-stats-timezone"]').screenshot({path:resolve(output,'timezone-settings-panel.png')});
 await page.locator('#stats-follow-system-timezone').check();
 await page.waitForFunction(()=>!document.querySelector('#stats-timezone'));
 const alternate=await page.evaluate(async()=>{
  const {summarizeStats}=await import('./core/stats.js');
  const state=await chrome.runtime.sendMessage({type:'GET_STATE'}),summary=summarizeStats(state);
  return ['UTC','America/New_York','America/Chicago','Pacific/Honolulu','Asia/Shanghai','Europe/Paris'].find(zone=>zone!==summary.timeZone && new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now())===new Intl.DateTimeFormat('en-CA',{timeZone:summary.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now()));
 });
 assert.ok(alternate,'A different timezone on the same calendar day is available');
 const cdp=await context.newCDPSession(page);
 await cdp.send('Emulation.setTimezoneOverride',{timezoneId:alternate});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.waitForFunction(zone=>document.querySelector('[data-stats-effective-timezone]')?.textContent.includes(zone),alternate);
 await cdp.send('Emulation.setTimezoneOverride',{timezoneId:''});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await cdp.detach();
 await page.setViewportSize({width:1280,height:850});
 checks.push('Automatic timezone defaults on; manual choice persists; same-day system timezone change refreshes Settings; 320px reflow');
 await page.locator('[data-focus="nav-stats"]').click({timeout:3000});
 assert.equal(await page.locator('[data-stats-total]').innerText(),'0');
 // Space-taking scrollbars on Fields must not move either header or the tab bar.
 await page.addStyleTag({content:'html::-webkit-scrollbar { width:16px; height:16px; }'});
 const headerPositions=()=>page.evaluate(()=>['.header-tools','.stats-heading','.stats-info','.stats-tabs'].map(selector=>{
  const {x,y,width,height}=document.querySelector(selector).getBoundingClientRect();return {selector,x,y,width,height};
 }));
 const initialPositions=await headerPositions();
 for(const tab of ['activity','achievements','fields','overview']){
  await page.locator(`[data-stats-tab="${tab}"]`).click();
  if(tab==='fields')await page.waitForFunction(()=>document.querySelectorAll('[data-stats-field]').length===23);
  assert.deepEqual(await headerPositions(),initialPositions,`${tab} keeps both headers and the tab bar aligned`);
 }
 checks.push('All four Stats tabs preserve the shared header, Stats heading, info button and tab bar with classic scrollbars');
 await page.setViewportSize({width:1452,height:1100});
 await page.screenshot({path:resolve(output,'overview-tall-desktop.png'),fullPage:true});
 await assertBackgroundFillsWindow(page,'Tall desktop Stats');
 await page.setViewportSize({width:1280,height:850});
 await page.getByRole('tab',{name:'Activity',exact:true}).click();
 assert.equal(await page.locator('[role="tabpanel"]').count(),1);
 await page.getByRole('tab',{name:'Activity',exact:true}).press('ArrowRight');
 assert.equal(await page.getByRole('tab',{name:'Achievements',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('tab',{name:'Achievements',exact:true}).press('Home');
 assert.equal(await page.locator('.stats-top-fields [data-stats-field]').count(),0,'An empty profile does not invent top fields');
 assert.equal(await page.getByRole('tab',{name:'Fields',exact:true}).count(),1,'Saved interests have a separate Fields tab');
 await page.getByRole('tab',{name:'Overview',exact:true}).press('End');
 assert.equal(await page.getByRole('tab',{name:'Fields',exact:true}).getAttribute('aria-selected'),'true');
 await page.waitForFunction(()=>document.querySelectorAll('[data-stats-field]').length===23);
 assert.equal(await page.locator('[data-stats-field-count]').allTextContents().then(values=>values.every(value=>value==='0')),true);
 await page.getByRole('tab',{name:'Fields',exact:true}).press('ArrowRight');
 assert.equal(await page.getByRole('tab',{name:'Overview',exact:true}).getAttribute('aria-selected'),'true');
 await page.locator('[data-stats-info]').click();await page.getByRole('dialog').waitFor();
 await page.getByRole('dialog').press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 checks.push('Empty state, four exclusive tabs, 23 zero fields, wrapping keyboard arrows and info dialog');
 // Explicit fictional fixture, imported via the public backup API in this disposable profile.
 await page.evaluate(async()=>{
  const {createState,reduceState}=await import('./core/index.js');
  const {createBackup}=await import('./core/backup.js');
  const now=Date.now(),day=86400000;let state=createState(now-8*day);
  const catalog=await fetch('./catalog.json').then(response=>response.json());
  const seeds=[...catalog.filter(row=>row.domain==='Computing & information').slice(0,4),...catalog.filter(row=>row.domain==='Biology & nature').slice(0,2),catalog.find(row=>row.domain==='Mathematics'),'My custom interest'];
  for(const topic of seeds)state=reduceState(state,{type:'ADD_INTEREST',topic},now-8*day);
  for(let i=0;i<12;i++)state=reduceState(state,{type:'EXPLORE',topic:{id:`Topic ${i}`,topic:`Topic ${i}`,domain:['Science','Design','Nature'][i%3],description:''}},now-(6-i%7)*day);
  const response=await chrome.runtime.sendMessage({type:'IMPORT_BACKUP',backup:createBackup(state),mode:'replace'});
  if(response.error)throw Error(response.error);
 });
 await page.waitForFunction(()=>document.querySelector('[data-stats-total]')?.textContent==='12');
 assert.match(await page.locator('.stats-growth').innerText(),/150%/);
 assert.equal(await page.locator('.stats-celebration').count(),0,'Import does not replay achievements');
 const topFields=page.locator('.stats-top-fields [data-stats-field]');
 assert.deepEqual(await topFields.evaluateAll(nodes=>nodes.map(node=>[node.dataset.statsField,node.querySelector('[data-stats-field-count]').textContent,node.querySelector('[data-stats-field-share]').textContent])),[
  ['Computing & information','4','50%'],['Biology & nature','2','25%'],['Mathematics','1','12.5%'],
 ]);
 await page.getByRole('tab',{name:'Fields',exact:true}).click();
 assert.equal(await page.locator('[data-stats-field]').count(),23);
 assert.equal(await page.locator('[data-stats-field="Chemistry & materials"] [data-stats-field-count]').innerText(),'0');
 assert.match(await page.locator('[data-stats-unclassified]').innerText(),/1\s+12\.5%/);
 await page.getByRole('tab',{name:'Overview',exact:true}).click();
 await page.locator('.stats-top-fields [data-stats-field="Computing & information"]').click();
 assert.equal(new URL(page.url()).searchParams.get('view'),'map','A top field opens the Galaxy');
 await page.waitForFunction(()=>document.querySelector('.galaxy-root')?.dataset.domain==='Computing & information');
 assert.equal(await page.locator('.galaxy-domain').inputValue(),'Computing & information');
 assert.equal(await page.locator('.galaxy-search').inputValue(),'');
 await page.locator('.galaxy-search').fill('computer');
 await page.locator('.galaxy-result').first().click();
 await page.locator('[data-galaxy-action="enter-focus"]').click();
 await page.locator('.map-workspace[data-view="focus"]').waitFor();
 await page.locator('[data-focus="nav-stats"]').click();
 await page.locator('.stats-top-fields [data-stats-field="Biology & nature"]').focus();
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.galaxy-root')?.dataset.domain==='Biology & nature'&&document.querySelector('.map-workspace')?.dataset.view==='galaxy');
 assert.equal(await page.locator('.galaxy-search').inputValue(),'','A field jump clears the retained search');
 assert.equal(await page.locator('.galaxy-detail[data-selected-id]').count(),0,'A field jump clears stale topic details');
 assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('galaxy-domain')),true,'Keyboard navigation lands on the selected field');
 await page.locator('[data-focus="nav-stats"]').click();
 await page.getByRole('tab',{name:'Fields',exact:true}).click();
 await page.locator('[data-stats-field="Chemistry & materials"]').click();
 await page.waitForFunction(()=>document.querySelector('.galaxy-root')?.dataset.domain==='Chemistry & materials');
 await page.locator('[data-focus="nav-stats"]').click();
 await page.getByRole('tab',{name:'Overview',exact:true}).click();
 checks.push('Saved-interest field counts and shares; lazy Galaxy jump, retained Focus/search reset, keyboard focus and zero-field jump');
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
 assert.equal(await panel.locator('.stats-tabs [role="tab"]').evaluateAll(nodes=>nodes.every(node=>{const range=document.createRange();range.selectNodeContents(node);return range.getBoundingClientRect().width<=node.getBoundingClientRect().width;})),true,'All four English tab labels fit their controls at 320px');
 await panel.screenshot({path:resolve(output,'overview-panel-en.png'),fullPage:true});
 for(const theme of ['dark','light']){
  await panel.evaluate(theme=>chrome.runtime.sendMessage({type:'ACTION',action:{type:'SET_SETTINGS',patch:{theme,language:'zh-CN'}}}),theme);
  await panel.waitForFunction(theme=>document.documentElement.dataset.theme===theme && document.documentElement.lang==='zh-CN',theme);
  for(const tab of ['overview','activity','achievements','fields']){
   await panel.locator(`[data-stats-tab="${tab}"]`).click();
   if(tab==='activity')await panel.locator('[data-stats-period="30"]').click();
   assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${theme} ${tab} 320px overflow`);
   await assertBackgroundFillsWindow(panel,`${theme} ${tab} side panel`);
   const bottom=await panel.locator('.stats-page').evaluate(el=>el.getBoundingClientRect().bottom);
   await panel.screenshot({path:resolve(output,`${tab}-panel-${theme}.png`),fullPage:true});
   if(tab!=='fields')assert.ok(bottom<=850,`${theme} ${tab} should fit reference height; bottom=${bottom}`);
  }
 }
 await page.bringToFront();
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>chrome.runtime.sendMessage({type:'ACTION',action:{type:'SET_SETTINGS',patch:{theme}}}),theme);
  await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
  for(const tab of ['overview','activity','achievements','fields']){
   await page.locator(`[data-stats-tab="${tab}"]`).click();
   for(const height of [902,1200]){
    await page.setViewportSize({width:1452,height});
    await assertBackgroundFillsWindow(page,`${theme} ${tab} desktop ${height}`);
   }
  }
  await page.locator('[data-stats-tab="overview"]').click();
  await page.screenshot({path:resolve(output,`overview-tall-desktop-${theme}.png`),fullPage:true});
 }
 checks.push('Themed background covers tall dashboard and narrow side-panel viewports in both palettes and every Stats tab');
 await panel.reload();await panel.locator('[data-stats-tab="fields"][aria-selected="true"]').waitFor();
 // Independently check a desktop viewport at 200%; 320 CSS px was checked above.
 await panel.setViewportSize({width:1280,height:900});
 await panel.evaluate(()=>document.body.style.zoom='2');
 for(const tab of ['overview','activity','achievements','fields']){
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
 // Custom interests use their own valid field; missing/unknown fields stay in the denominator.
 await page.evaluate(async()=>{
  const {createState,reduceState}=await import('./core/index.js');
  const {createBackup}=await import('./core/backup.js');
  let state=createState();
  for(const topic of [
   {id:'Custom computing',topic:'Custom computing',domain:'Computing & information',description:''},
   {id:'Custom biology',topic:'Custom biology',domain:'Biology & nature',description:''},
   {id:'Unlisted field',topic:'Unlisted field',domain:'Outside the catalog',description:''},
   'Unclassified wording',
  ])state=reduceState(state,{type:'ADD_INTEREST',topic});
  state.settings.tutorialActive=false;state.settings.tutorialSeen=true;
  const response=await chrome.runtime.sendMessage({type:'IMPORT_BACKUP',backup:createBackup(state),mode:'replace'});
  if(response.error)throw Error(response.error);
 });
 await page.waitForFunction(()=>document.querySelectorAll('.stats-top-fields [data-stats-field]').length===2);
 assert.deepEqual(await page.locator('.stats-top-fields [data-stats-field]').evaluateAll(nodes=>nodes.map(node=>node.dataset.statsField)),['Biology & nature','Computing & information'],'Tied fields sort by name without padding the Top3');
 await page.locator('[data-stats-tab="fields"]').click();
 assert.match(await page.locator('[data-stats-unclassified]').innerText(),/2\s+50%/);
 await page.evaluate(()=>chrome.runtime.sendMessage({type:'ACTION',action:{type:'REMOVE_INTERESTS',ids:['Custom biology']}}));
 await page.waitForFunction(()=>document.querySelector('[data-stats-field="Computing & information"] [data-stats-field-share]')?.textContent==='33.3%');
 assert.match(await page.locator('[data-stats-unclassified]').innerText(),/2\s+66\.7%/);
 await page.locator('[data-stats-tab="overview"]').click();
 assert.equal(await page.locator('.stats-top-fields [data-stats-field]').count(),1);
 await page.evaluate(()=>chrome.runtime.sendMessage({type:'ACTION',action:{type:'REMOVE_INTERESTS',ids:['Custom computing','Unlisted field','Unclassified wording']}}));
 await page.waitForFunction(()=>document.querySelectorAll('.stats-top-fields [data-stats-field]').length===0);
 await page.locator('[data-stats-tab="fields"]').click();
 assert.equal(await page.locator('[data-stats-field]').count(),23);
 assert.equal(await page.locator('[data-stats-field-share]').allTextContents().then(values=>values.every(value=>value==='0%')),true);
 checks.push('Valid custom fields, unknown fields, fewer than three top fields, alphabetical ties and immediate recalculation through removing the last interest');
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({checks,errors},null,2));
} finally {await close?.();}
