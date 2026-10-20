// Real extension storage/controller, fictional browsing, temporary profile only.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {launchExtension} from './browser-test-helpers.mjs';
import {createState,prepareObservation,reduceState} from '../extension/core/index.js';

const output=resolve('.cache/qa/interest-draft');
await mkdir(output,{recursive:true});
const temp=await mkdtemp(resolve(tmpdir(),'otherwise-draft-')),extension=resolve(temp,'extension');
const errors=[],checks=[];
let close,debugPage;
try {
  await cp(resolve('dist/otherwise-extension'),extension,{recursive:true});
  const manifestPath=resolve(extension,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.permissions.push('history');
  manifest.optional_permissions=manifest.optional_permissions.filter(permission=>permission!=='history');
  await writeFile(manifestPath,JSON.stringify(manifest));
  const topics=['Illinois','Machine learning','Photography','Basketball',...Array.from({length:35},(_,i)=>`Subject ${String(i+1).padStart(2,'0')}`)].map((topic,i)=>({id:topic,topic,domain:['Computing','Art & design','Sports'][i%3],description:'Fictional subject for the browsing review check.'}));
  let initial=createState();
  Object.assign(initial.settings,{tutorialSeen:true,tutorialActive:false,language:'zh-CN'});
  const options={salt:initial.salt,blockedDomains:[]};
  const observations=await Promise.all(topics.slice(1).map((topic,i)=>prepareObservation({
    url:`https://example.org/subject/${i}`,title:`${topic.topic} introduction`,lastVisitTime:Date.now()},topics,options)));
  observations.push(await prepareObservation({url:'https://illinois.edu/registration',title:'Registration | University of Illinois Urbana-Champaign'},topics,options));
  initial=reduceState(initial,{type:'INGEST',observations});
  await writeFile(resolve(extension,'fixture-state.json'),JSON.stringify(initial));
  const background=resolve(extension,'background.js');
  const source=await readFile(background,'utf8');
  const readState="readState:async()=> (await chrome.storage.local.get('state')).state,";
  assert.ok(source.includes(readState));
  await writeFile(background,source.replace(readState,`readState:async()=>{
    const existing=(await chrome.storage.local.get('state')).state;
    if(existing)return existing;
    const state=await(await fetch(chrome.runtime.getURL('fixture-state.json'))).json();
    await chrome.storage.local.set({state});return state;
  },`));
  const launched=await launchExtension({extension,profilePrefix:'otherwise-draft-browser-',viewport:{width:390,height:850}});
  close=launched.close;
  const {context,base}=launched;
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  debugPage=page;
  await page.goto(`${base}sidepanel.html?view=interests&interests=review`);
  const get=()=>page.evaluate(async()=> (await chrome.storage.local.get('state')).state);
  const until=async predicate=>{const end=Date.now()+10000;while(Date.now()<end){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Timed out waiting for review state.');};
  const click=async(action,extra='')=>{await page.locator(`[data-review-action="${action}"]${extra}`).first().click();await until(async()=>!(await page.locator('.interest-draft-workspace').getAttribute('aria-busy')==='true'));};
  const mode=mode=>click('mode',`[data-mode="${mode}"]`);
  await page.locator('.draft-row').first().waitFor();
  assert.equal((await get()).approved.length,0);
  assert.equal((await get()).candidateReview.selected.length,6);
  assert.equal((await get()).candidateReview.selected.includes('Illinois'),false);
  const first=(await get()).candidateReview.selected[0];
  await click('remove',`[data-id="${first}"]`);
  await until(async()=>!(await get()).candidateReview.selected.includes(first));
  await mode('groups');
  await page.locator('#candidate-search').fill(first);
  await page.locator(`[data-review-candidate="${first}"]`).check();
  await until(async()=>(await get()).candidateReview.selected.includes(first));
  await page.locator('#candidate-search').fill('');
  await page.locator('[data-review-action="category"]').first().click();
  await until(async()=>(await get()).candidateReview.selected.length>6);
  await click('undo');
  await until(async()=>(await get()).candidateReview.selected.length===6);
  const keyboardChoice=page.locator('[data-review-candidate]:not(:checked)').nth(8);
  const keyboardId=await keyboardChoice.getAttribute('data-review-candidate');
  await keyboardChoice.focus();
  await keyboardChoice.evaluate(input=>input.scrollIntoView({block:'center'}));
  const scrollBefore=await page.locator('.draft-body').evaluate(body=>body.scrollTop);
  await keyboardChoice.press('Space');
  await until(async()=>(await get()).candidateReview.selected.includes(keyboardId));
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.reviewCandidate),keyboardId,'Keyboard focus remains on the edited choice');
  assert.ok(Math.abs(await page.locator('.draft-body').evaluate(body=>body.scrollTop)-scrollBefore)<3,'Editing retains review scroll');
  await click('undo');
  checks.push('Draft remains unsaved; category selection shares state and can be undone');

  await mode('cards');
  let card=page.locator('[data-review-card]'),id=await card.getAttribute('data-review-card');
  await card.press('ArrowDown');
  await until(async()=>(await get()).candidateReview.ignored.includes(id));
  assert.deepEqual((await get()).suppressed,[]);
  await click('undo');
  await until(async()=>!(await get()).candidateReview.ignored.includes(id));
  card=page.locator('[data-review-card]');id=await card.getAttribute('data-review-card');
  const bounds=await card.boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2-95,{steps:8});await page.mouse.up();
  await until(async()=>(await get()).candidateReview.selected.includes(id));
  card=page.locator('[data-review-card]');const skipped=await card.getAttribute('data-review-card');
  await card.click();await until(async()=>(await get()).candidateReview.skipped.includes(skipped));
  assert.equal((await get()).candidateReview.ignored.includes(skipped),false);
  checks.push('Card keyboard, drag, tap, skip and ignore work without global suppression');

  await page.locator('.draft-folded summary').click();
  await click('restore','[data-id="Illinois"]');
  await until(async()=>(await get()).candidateReview.restored.includes('Illinois'));
  await mode('groups');await page.locator('#candidate-search').fill('Illinois');
  await page.locator('[data-review-candidate="Illinois"]').check();
  await until(async()=>(await get()).candidateReview.selected.includes('Illinois'));
  const draftIds=(await get()).candidateReview.selected;
  await page.reload();await page.locator('.draft-row').first().waitFor();
  assert.deepEqual((await get()).candidateReview.selected,draftIds);
  const dashboard=await context.newPage();dashboard.on('pageerror',error=>errors.push(error.message));
  await dashboard.goto(`${base}dashboard.html?view=interests&interests=review`);
  await dashboard.locator('.draft-row').first().waitFor();
  await dashboard.locator('[data-review-action=remove][data-id="Illinois"]').click();
  await until(async()=>!(await get()).candidateReview.selected.includes('Illinois'));
  await until(async()=>await page.locator('.draft-row').filter({hasText:'Illinois'}).count()===0);
  checks.push('Folded background can be restored; edits survive reload and synchronize across surfaces');

  for(const width of [320,390,800]) {
    await page.setViewportSize({width,height:850});
    for(const view of ['draft','groups','cards']){
      await mode(view);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}/${view}: no horizontal overflow`);
      const footer=await page.locator('.draft-footer').boundingBox();
      assert.ok(footer.y+footer.height<=851,`${width}/${view}: confirmation remains visible`);
      if(view==='cards'){
        const body=await page.locator('.draft-body').boundingBox(),action=await page.locator('.draft-card-actions').boundingBox();
        assert.ok(action.y+action.height<=body.y+body.height+1,`${width}: card actions visible without scrolling`);
      }
      await page.screenshot({path:resolve(output,`${width}-${view}.png`)});
    }
  }
  await dashboard.setViewportSize({width:1280,height:900});
  await dashboard.screenshot({path:resolve(output,'dashboard.png')});
  checks.push('Draft, groups and cards fit 320/390/800 px side panels and dashboard');

  await mode('draft');
  const before=await get(),want=[...before.candidateReview.selected];
  await click('confirm');
  await until(async()=>(await get()).approved.length===want.length);
  assert.deepEqual((await get()).approved.map(row=>row.id).sort(),want.sort());
  assert.deepEqual((await get()).candidateReview.selected,[]);
  assert.ok((await get()).candidates.length>0);
  await page.reload();await page.locator('.draft-empty').waitFor();
  assert.deepEqual((await get()).candidateReview.selected,[]);
  assert.deepEqual((await get()).suppressed,[]);
  const response=await page.evaluate(()=>chrome.runtime.sendMessage({type:'ACTION',action:{type:'CLEAR_DERIVED'}}));
  assert.equal(response.error,undefined);
  await until(async()=>(await get()).candidates.length===0);
  assert.equal((await get()).candidateReview.initialized,false);
  assert.equal((await get()).approved.length,want.length);
  checks.push('Only explicit confirmation saves the draft, never refills; history clearing preserves saved interests');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'results.json'),JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
}catch(error){
  if(debugPage){
    await debugPage.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});
    console.error(JSON.stringify({errors,body:await debugPage.locator('body').innerText().catch(()=>''),state:await debugPage.evaluate(async()=> (await chrome.storage.local.get('state')).state).catch(()=>null)},null,2));
  }
  throw error;
}finally{
  await close?.();
  await rm(temp,{recursive:true,force:true});
}
