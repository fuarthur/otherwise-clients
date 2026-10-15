// Real extension storage in a disposable profile; visual examples use offline preview data.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.OTHERWISE_PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.cache/qa/themes/browser');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(resolve(tmpdir(),'otherwise-themes-'));
const extension=resolve(root,'dist/otherwise-extension');
const checks=[],errors=[];
let context,page,failure;
async function readable(tab,selector){
  const pair=await tab.locator(selector).first().evaluate(node=>{
    const ink=getComputedStyle(node).color;
    while(node){const bg=getComputedStyle(node).backgroundColor;if(/^rgb\(/.test(bg))return {ink,bg};node=node.parentElement;}
    throw new Error('No opaque text surface.');
  });
  const luminance=color=>{
    const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{
      const s=value/255;return s<=.04045 ? s/12.92 : ((s+.055)/1.055)**2.4;
    });
    return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  };
  const a=luminance(pair.ink),b=luminance(pair.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.ok(ratio>=4.5,`${selector} text contrast ${ratio.toFixed(2)}:1: ${JSON.stringify(pair)}`);
}
async function until(predicate,message){
  const deadline=Date.now()+10_000;
  while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}
  throw new Error(message || 'Theme state did not settle.');
}
try{
  context=await chromium.launchPersistentContext(profile,{
    executablePath:process.env.OTHERWISE_CHROMIUM || chromium.executablePath(),
    headless:true,ignoreDefaultArgs:['--disable-extensions'],viewport:{width:390,height:850},reducedMotion:'reduce',
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  });
  context.on('page',tab=>tab.on('pageerror',error=>errors.push(error.message)));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const base=worker.url().replace('background.js','');
  page=await context.newPage();await page.goto(`${base}sidepanel.html?view=settings`);
  await page.locator('#settings-theme').waitFor({timeout:3000});
  const state=()=>page.evaluate(async()=>(await chrome.storage.local.get('state')).state);
  const action=action=>page.evaluate(action=>chrome.runtime.sendMessage({type:'ACTION',action}),action);
  await action({type:'SET_SETTINGS',patch:{tutorialSeen:true,tutorialActive:false}});
  assert.equal(await page.locator('#settings-theme').inputValue(),'dark');
  assert.deepEqual(await page.locator('#settings-theme option').evaluateAll(nodes=>nodes.map(node=>node.value)),['dark','light']);
  const dashboard=await context.newPage();await dashboard.goto(`${base}dashboard.html?view=settings`);
  await dashboard.locator('#settings-theme').waitFor();
  await page.locator('[data-focus="settings-connection"]').click();
  await page.locator('#endpoint').fill('https://example.org/unsaved');
  const before=await state();
  await page.locator('#settings-theme').selectOption('light');
  await until(async()=>(await state()).settings.theme==='light');
  await dashboard.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  assert.equal(await page.locator('#endpoint').inputValue(),'https://example.org/unsaved');
  const after=await state();
  assert.equal(after.settings.endpoint,before.settings.endpoint,'An appearance change must not save unrelated drafts');
  assert.equal(after.generation,before.generation,'Appearance must not invalidate requests');
  assert.deepEqual(after.recommendationBatch,before.recommendationBatch);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');
  assert.equal(await dashboard.locator('#settings-theme').inputValue(),'light');
  await page.reload();await page.locator('#settings-theme').waitFor();
  assert.equal(await page.locator('#settings-theme').inputValue(),'light');
  for(const colorScheme of ['dark','light']){
    await page.emulateMedia({colorScheme});
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light','The manual choice wins over the system scheme');
  }
  // Delay the app module to inspect the cached palette before profile loading.
  await page.route('**/ui/app.js',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue();});
  await page.reload({waitUntil:'commit'});
  await page.locator('.boot-state').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light','Reload paints the saved palette before the app starts');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');
  await page.locator('#settings-theme').waitFor();await page.unroute('**/ui/app.js');
  checks.push('Manual selection saves immediately, preserves other drafts, synchronizes both surfaces, survives reload and wins over the system scheme; cached first paint matches');

  await dashboard.locator('#settings-theme').selectOption('dark');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.locator('[data-language]').selectOption('zh-CN');
  await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  assert.equal(await page.locator('label[for="settings-theme"]').innerText(),'外观\n深色\n浅色');
  await page.locator('#settings-theme').selectOption('light');
  await dashboard.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  checks.push('Both directions synchronize immediately and the appearance choices are translated');

  // Keep an actual mounted map while a second window changes the shared preference.
  await dashboard.locator('[data-focus="nav-map"]').click();
  await dashboard.locator('.galaxy-root[data-topic-count]').waitFor();
  await dashboard.locator('.galaxy-search').fill('psychology');
  await dashboard.locator('.galaxy-search').press('Enter');
  await dashboard.locator('.galaxy-detail[data-selected-id="psychology"]').waitFor();
  const oldZoom=Number(await dashboard.locator('.galaxy-canvas').getAttribute('data-zoom'));
  await dashboard.locator('[data-galaxy-action="zoom-in"]').click();
  await dashboard.waitForFunction(before=>Number(document.querySelector('.galaxy-canvas')?.dataset.zoom)>before,oldZoom);
  await dashboard.evaluate(()=>{window.themeCanvas=document.querySelector('.galaxy-canvas');});
  const camera=await dashboard.locator('.galaxy-canvas').evaluate(node=>({x:node.dataset.centerX,y:node.dataset.centerY,zoom:node.dataset.zoom}));
  await page.locator('#settings-theme').selectOption('dark');
  await dashboard.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.equal(await dashboard.evaluate(()=>window.themeCanvas===document.querySelector('.galaxy-canvas')),true,'The map stays mounted');
  assert.deepEqual(await dashboard.locator('.galaxy-canvas').evaluate(node=>({x:node.dataset.centerX,y:node.dataset.centerY,zoom:node.dataset.zoom})),camera);
  assert.equal(await dashboard.locator('.galaxy-detail').getAttribute('data-selected-id'),'psychology');
  checks.push('A theme change from another window preserves the map canvas, camera and selected topic');

  const preview=await context.newPage();
  await preview.goto(`${base}dashboard.html?preview=1&view=discover`);
  await preview.locator('#selected-topic-title').waitFor();
  const batch=await preview.locator('.last-updated').innerText();
  const title=await preview.locator('#selected-topic-title').innerText();
  await preview.evaluate(async()=>{const api=await import('./dev-preview.js');await api.dispatch({type:'SET_SETTINGS',patch:{theme:'light'}});});
  assert.equal(await preview.locator('#selected-topic-title').innerText(),title);
  assert.equal(await preview.locator('.last-updated').innerText(),batch);
  checks.push('Changing appearance preserves the current recommendation and batch');

  // All popup surfaces inherit the current palette, including dialogs in the map.
  await preview.locator('.topic-search > summary').click();
  await readable(preview,'.topic-search [data-provider="google"]');
  await preview.locator('#selected-topic-title').click();
  await preview.locator('[data-focus="nav-interests"]').click();
  await preview.locator('[data-group-action="create"]').click();
  await preview.locator('.interest-group-dialog').waitFor();
  await readable(preview,'.interest-group-dialog h2');
  await readable(preview,'.interest-group-dialog .primary');
  await preview.screenshot({path:resolve(output,'light-en-group-dialog.png')});
  await preview.keyboard.press('Escape');
  await preview.locator('[data-focus="nav-map"]').click();
  await preview.locator('.galaxy-search').fill('psychology');await preview.locator('.galaxy-search').press('Enter');
  await preview.locator('.galaxy-detail[data-selected-id="psychology"]').waitFor();
  await readable(preview,'.galaxy-description');await readable(preview,'.galaxy-controls button');
  await preview.locator('[data-galaxy-action="view-options"]').click();
  await preview.locator('.galaxy-options-dialog').waitFor();
  await readable(preview,'.galaxy-options-dialog h2');await readable(preview,'.galaxy-geometry-note');
  await preview.screenshot({path:resolve(output,'light-en-map-options.png')});
  await preview.keyboard.press('Escape');
  await preview.locator('[data-map-view="focus"]').click();
  await preview.locator('.focus-root[data-seed-id="psychology"]').waitFor();
  await preview.locator('[data-focus-action="get-ideas"]').click();
  await preview.locator('.focus-candidate-list [data-focus-select]').first().waitFor();
  await preview.locator('.focus-neighbor-list [data-focus-select]').first().click();
  await preview.locator('.focus-description').waitFor();
  await preview.evaluate(()=>{window.themeFocusCanvas=document.querySelector('.focus-background');});
  const candidates=await preview.locator('.focus-candidate-list').innerText();
  const focusId=await preview.locator('.focus-root').getAttribute('data-selected-id');
  for(const theme of ['dark','light']){
    await preview.evaluate(async theme=>{const api=await import('./dev-preview.js');await api.dispatch({type:'SET_SETTINGS',patch:{theme}});},theme);
    assert.equal(await preview.evaluate(()=>window.themeFocusCanvas===document.querySelector('.focus-background')),true);
    assert.equal(await preview.locator('.focus-candidate-list').innerText(),candidates);
    assert.equal(await preview.locator('.focus-root').getAttribute('data-selected-id'),focusId);
    for(const selector of ['.focus-title','.focus-disclosure','.focus-description','.focus-domain','.focus-detail-distance','.focus-map-controls button','[data-focus-action="get-ideas"]'])await readable(preview,selector);
    for(const width of [320,1280]){
      await preview.setViewportSize({width,height:850});
      assert.equal(await preview.evaluate(()=>document.documentElement.scrollWidth),width);
      await preview.screenshot({path:resolve(output,`${theme}-en-focus-${width}.png`)});
    }
  }
  checks.push('Light menus, group and map dialogs are readable; Focus retains its canvas, recommendation batch and selection across theme changes; representative text meets 4.5:1 contrast in both palettes');

  for(const theme of ['dark','light'])for(const language of ['en','zh-CN']){
    await preview.evaluate(async({theme,language})=>{const api=await import('./dev-preview.js');await api.dispatch({type:'SET_SETTINGS',patch:{theme,language}});},{theme,language});
    for(const [width,height] of [[320,600],[390,850],[1280,850]]){
      await preview.setViewportSize({width,height});
      for(const view of ['interests','discover','map','settings']){
        await preview.locator(`[data-focus="nav-${view}"]`).click();
        if(view==='map'){
          await preview.locator('[data-map-view="galaxy"]').click();
          await preview.locator('.galaxy-root[data-topic-count]').waitFor();
        }
        const colors=await preview.evaluate(()=>{
          const body=getComputedStyle(document.body);
          return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,background:body.backgroundColor,ink:body.color};
        });
        assert.equal(colors.scrollWidth,width,`${theme}/${language}/${view} fits ${width}px`);
        if(theme==='light')assert.equal(colors.background,'rgb(245, 246, 242)','Every page uses the light palette');
        if(width===1280 && view==='discover'){
          for(const selector of ['#selected-topic-title','.topic-description','.topic-detail .eyebrow','.topic-search > summary','.topic-row-domain'])await readable(preview,selector);
        }
        if(width===390 || (width===1280 && language==='en'))await preview.screenshot({path:resolve(output,`${theme}-${language}-${view}-${width}.png`)});
      }
    }
  }
  // Preview uses its own cache; it must not change the real extension preference.
  assert.equal((await state()).settings.theme,'dark');
  await page.reload();await page.locator('#settings-theme').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  checks.push('Dark/light × English/Chinese × 320/390/1280px have no horizontal overflow across all four pages; preview preference stays isolated');
  assert.deepEqual(errors,[]);
}catch(error){failure=error;if(page)await page.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});}
finally{
  await writeFile(resolve(output,'results.json'),JSON.stringify({checks,errors,failure:failure?.stack},null,2));
  await context?.close();await rm(profile,{recursive:true,force:true});
}
if(failure)throw failure;
console.log(JSON.stringify({checks,errors},null,2));
