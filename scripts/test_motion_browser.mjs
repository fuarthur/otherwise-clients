// Real page checks use an isolated browser profile and the fictional preview state.
import {launchExtension} from './browser-test-helpers.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.cache/qa/ui-motion');await mkdir(output,{recursive:true});
const checks=[],errors=[],metrics={};
let context,base,close;
try {
  ({context, base, close}=await launchExtension({extension:resolve(root,'dist/otherwise-extension'),profilePrefix:'otherwise-motion-',viewport:{width:390,height:850}}));

  base+='sidepanel.html';
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'?preview=1');await page.locator('[data-focus="nav-settings"]').waitFor();
  const navigation=await page.evaluate(()=>{
    document.querySelector('[data-view="interests"]').click();
    const main=document.getElementById('main-view');
    return {visible:Boolean(main.querySelector('.interests-page')),frames:main.getAnimations().flatMap(animation=>animation.effect.getKeyframes())};
  });
  assert.equal(navigation.visible,true,'Navigation updates the destination immediately');
  assert.ok(navigation.frames.some(frame=>Number(frame.opacity)<1),'The incoming page has a short visual transition');
  checks.push('navigation updates immediately and animates only its incoming content');
  const selectedNavigation=await page.evaluate(()=>{
    document.querySelector('[data-view="discover"]').click();
    const selected=document.querySelector('.main-nav [aria-current="page"]');
    const marker=document.querySelector('.main-nav-indicator');
    if(!marker)return null;
    const {x,y,width,height}=selected.getBoundingClientRect();
    const target=marker.getAnimations()[0]?.effect.getKeyframes().at(-1);
    return {x,y,width,height,marker:{left:marker.offsetLeft,top:marker.offsetTop,width:marker.offsetWidth,height:marker.offsetHeight},animated:Boolean(target)};
  });
  assert.ok(selectedNavigation,'A visible selection marker connects the navigation choices');
  assert.equal(selectedNavigation.animated,true,'The selection marker moves between choices');
  assert.ok(Math.abs(selectedNavigation.width-selectedNavigation.marker.width)<1);
  assert.ok(Math.abs(selectedNavigation.height-selectedNavigation.marker.height)<1);
  checks.push('the navigation marker moves to the selected control');
  const paging=await page.evaluate(()=>{
    const before=document.querySelector('#selected-topic-title').textContent;
    document.querySelector('[data-action="topic-next"]').click();
    const next=document.querySelector('#selected-topic-title').textContent;
    const forward=document.querySelector('.topic-detail').getAnimations()[0];
    const forwardFrame=forward?.effect.getKeyframes()[0];
    document.querySelector('[data-action="topic-prev"]').click();
    const backward=document.querySelector('.topic-detail').getAnimations()[0];
    return {before,next,restored:document.querySelector('#selected-topic-title').textContent,forward:forwardFrame?.transform,backward:backward?.effect.getKeyframes()[0].transform,interrupted:forward?.playState};
  });
  assert.notEqual(paging.before,paging.next);
  assert.equal(paging.restored,paging.before);
  assert.match(paging.forward||'',/translateX\([1-9]/,'Next enters from the right');
  assert.match(paging.backward||'',/translateX\(-/,'Previous enters from the left');
  assert.equal(paging.interrupted,'idle','A rapid second action cancels the previous effect');
  checks.push('topic paging responds immediately, follows direction and cancels interrupted motion');
  const layouts=await page.evaluate(()=>{
    const before=document.querySelector('#selected-topic-title').textContent;
    document.querySelector('[data-value="cards"]').click();
    const browse=document.querySelector('.discovery-workbench');
    const frames=browse.getAnimations().flatMap(animation=>animation.effect.getKeyframes());
    const selected=document.querySelector('#selected-topic-title').textContent;
    document.querySelectorAll('.topic-row')[1].click();
    const detail=document.querySelector('.topic-detail-copy');
    return {before,selected,frames,detailFrames:detail.getAnimations().flatMap(animation=>animation.effect.getKeyframes()),wholePage:document.getElementById('main-view').getAnimations().length};
  });
  assert.equal(layouts.selected,layouts.before,'Changing Discover layout keeps the current topic');
  assert.ok(layouts.frames.some(frame=>Number(frame.opacity)<1),'Layout changes animate the local workspace');
  assert.ok(layouts.detailFrames.some(frame=>Number(frame.opacity)<1),'Browse selection animates its detail content');
  assert.equal(layouts.wholePage,0,'Local selection does not replay page entry');
  checks.push('Discover layout keeps selection and Browse animates only the detail');
  await page.locator('[data-action="save-topic"]').click();
  await page.locator('.saved-label').waitFor();
  const saving=await page.evaluate(()=>({
    frames:document.querySelector('.saved-label').getAnimations().flatMap(animation=>animation.effect.getKeyframes()),
    pageAnimations:document.getElementById('main-view').getAnimations().length,
    selected:document.querySelector('#selected-topic-title').textContent,
  }));
  assert.ok(saving.frames.some(frame=>frame.transform?.includes('scale(')),'A successful save has its own confirmation effect');
  assert.equal(saving.pageAnimations,0,'Saving does not replay page entry');
  assert.equal(saving.selected,'Landscape architecture');
  await page.evaluate(async()=>{
    const api=await import('./dev-preview.js');
    await api.dispatch({type:'SET_SETTINGS',patch:{language:'zh-CN'}});
  });
  assert.equal(await page.locator('.saved-label').evaluate(element=>element.getAnimations().length),0,'A later background update does not replay the save effect');
  checks.push('save feedback is local, retains selection and does not replay on background updates');
  const loading=await page.evaluate(()=>{
    document.querySelector('[data-action="recommend"]').click();
    const button=document.querySelector('[data-action="recommend"]');
    return {busy:button.getAttribute('aria-busy'),animation:getComputedStyle(button.querySelector('.ui-icon')).animationName};
  });
  assert.equal(loading.busy,'true','The request exposes its actual loading state');
  assert.notEqual(loading.animation,'none','A loading icon provides visual feedback');
  await page.waitForFunction(()=>document.querySelector('[data-action="recommend"]')?.getAttribute('aria-busy')==='false');
  const results=await page.evaluate(()=>({
    animatedRows:[...document.querySelectorAll('.topic-row')].filter(element=>element.getAnimations().some(animation=>animation.effect.getKeyframes().some(frame=>Number(frame.opacity)<1))).length,
    pageAnimations:document.getElementById('main-view').getAnimations().length,
  }));
  assert.ok(results.animatedRows>0,'Fresh results enter as a short local group');
  assert.equal(results.pageAnimations,0);
  checks.push('actual request loading and fresh result arrival have local feedback');
  const modal=await page.evaluate(()=>{
    document.querySelector('[data-view="interests"]').click();
    document.querySelector('[data-action="interest-overview"]').click();
    const dialog=document.querySelector('.interest-overview-dialog');
    return {open:dialog.open,frames:dialog.getAnimations().flatMap(animation=>animation.effect.getKeyframes())};
  });
  assert.equal(modal.open,true);
  assert.ok(modal.frames.some(frame=>Number(frame.opacity)<1),'The native dialog has a short entry effect');
  const closing=await page.evaluate(()=>{
    const dialog=document.querySelector('.interest-overview-dialog');
    const backdropOpacity=Number(getComputedStyle(dialog,'::backdrop').opacity);
    dialog.querySelector('[type="submit"]').click();
    const ghosts=[...document.querySelectorAll('[data-ui-motion-ghost]')];
    const shade=ghosts.find(element=>element.style.background);
    return {open:dialog.open,ghosts:ghosts.length,inert:ghosts.every(element=>element.inert && element.getAttribute('aria-hidden')==='true'),backdropOpacity,exitOpacity:Number(shade?.getAnimations()[0]?.effect.getKeyframes()[0].opacity)};
  });
  assert.equal(closing.open,false,'Native close takes effect immediately');
  assert.ok(closing.ghosts>0,'The outgoing visual can finish independently of the native dialog');
  assert.equal(closing.inert,true,'The outgoing visual cannot receive input or duplicate accessible controls');
  assert.ok(closing.exitOpacity<=closing.backdropOpacity+.01,'Closing during entry does not flash a darker backdrop');
  await page.waitForFunction(()=>!document.querySelector('[data-ui-motion-ghost]'));
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.focus),'interest-overview');
  checks.push('native dialogs animate while closing immediately, restoring focus and cleaning up inert exit visuals');
  const interests=await page.evaluate(()=>{
    document.querySelector('[data-interest-tab="review"]').click();
    const panel=document.querySelector('.interest-tab-panel:not([hidden])');
    return {selected:panel.id,frames:panel.getAnimations().flatMap(animation=>animation.effect.getKeyframes()),pageAnimations:document.getElementById('main-view').getAnimations().length};
  });
  assert.equal(interests.selected,'interests-review-panel');
  assert.ok(interests.frames.some(frame=>Number(frame.opacity)<1),'Interest tabs have a local transition');
  assert.equal(interests.pageAnimations,0);
  checks.push('interest tabs transition locally without replaying page entry');
  await page.evaluate(async()=>{
    const api=await import('./dev-preview.js');
    const seenAt=Date.now();
    const candidates=Array.from({length:25},(_,index)=>({id:'Motion candidate '+index,topic:'Motion candidate '+index,domain:'Fixture field'}));
    await api.dispatch({type:'INGEST',observations:candidates.map(topic=>({sourceHash:'motion-candidate-'+topic.id,host:'example.org',seenAt,source:'Chrome',topicIds:[topic.id],topics:[topic]}))});
    for(let index=0;index<22;index++)await api.dispatch({type:'ADD_INTEREST',topic:'Motion interest '+index});
  });
  const interestPages=await page.evaluate(()=>{
    document.querySelector('[data-action="candidate-next"]').click();
    const review=document.querySelector('.candidate-list').getAnimations().length;
    document.querySelector('[data-interest-tab="saved"]').click();
    document.querySelector('[data-action="interest-next"]').click();
    return {review,saved:document.querySelector('.saved-interest-list').getAnimations().length,page:document.getElementById('main-view').getAnimations().length};
  });
  assert.ok(interestPages.review>0 && interestPages.saved>0,'Review and saved-interest pagination animate their own lists');
  assert.equal(interestPages.page,0);
  checks.push('review and saved-interest pagination transition locally');
  await page.locator('[data-view="discover"]').click();
  await page.locator('[data-action="recommend"]').click();
  const openingMenu=await page.evaluate(async()=>{
    const details=document.querySelector('.topic-search');
    details.querySelector('summary').click();await Promise.resolve();
    const menu=details.querySelector('.topic-action-menu');
    return {open:details.open,frames:menu.getAnimations().flatMap(animation=>animation.effect.getKeyframes())};
  });
  assert.equal(openingMenu.open,true);
  assert.ok(openingMenu.frames.some(frame=>Number(frame.opacity)<1),'Search menus have a short entry effect');
  const closingMenu=await page.evaluate(()=>{
    const details=document.querySelector('.topic-search');details.querySelector('summary').click();
    return {open:details.open,ghosts:document.querySelectorAll('[data-ui-motion-ghost]').length};
  });
  assert.equal(closingMenu.open,false);
  assert.ok(closingMenu.ghosts>0,'Menu close takes effect immediately while an inert visual fades out');
  await page.waitForFunction(()=>!document.querySelector('[data-ui-motion-ghost]'));
  checks.push('search menus animate only on explicit interaction and close immediately');
  await page.locator('[data-view="interests"]').click();
  await page.locator('.saved-interest-remove').first().click();
  await page.locator('.interest-undo').waitFor();
  const undo=await page.locator('.interest-undo').evaluate(element=>element.getAnimations().flatMap(animation=>animation.effect.getKeyframes()));
  assert.ok(undo.some(frame=>Number(frame.opacity)<1),'A new undo notice has local arrival feedback');
  await page.evaluate(async()=>{
    const api=await import('./dev-preview.js');await api.dispatch({type:'SET_SETTINGS',patch:{language:'en'}});
  });
  assert.equal(await page.locator('.interest-undo').evaluate(element=>element.getAnimations().length),0,'Background updates do not replay the undo notice');
  await page.locator('[data-focus="nav-settings"]').click();
  await page.locator('#backup-file').setInputFiles({name:'bad-backup.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await page.locator('.error-banner').waitFor();
  const errorNotice=await page.locator('.error-banner').evaluate(element=>({frames:element.getAnimations().flatMap(animation=>animation.effect.getKeyframes()),page:document.getElementById('main-view').getAnimations().length}));
  assert.ok(errorNotice.frames.some(frame=>Number(frame.opacity)<1),'A real backup validation error has local arrival feedback');
  assert.equal(errorNotice.page,0,'Error feedback does not replay the whole page');
  checks.push('error and undo notices animate once per event and remain immediately usable');
  await page.locator('[data-disclosure="settings-recommendations"] > summary').click();
  const advanced=await page.evaluate(async()=>{
    const details=document.querySelector('#recommendation-advanced');
    details.querySelector('summary').click();await Promise.resolve();
    return {open:details.open,frames:details.querySelector('.recommendation-option-grid').getAnimations().flatMap(animation=>animation.effect.getKeyframes())};
  });
  assert.equal(advanced.open,true);
  assert.ok(advanced.frames.some(frame=>Number(frame.opacity)<1),'Advanced settings also receive explicit disclosure feedback');
  await page.evaluate(async()=>{
    const api=await import('./dev-preview.js');await api.dispatch({type:'SET_SETTINGS',patch:{language:'zh-CN'}});
  });
  assert.equal(await page.locator('#recommendation-advanced').getAttribute('open'),'');
  assert.equal(await page.locator('.recommendation-option-grid').first().evaluate(element=>element.getAnimations().length),0,'Restoring an open disclosure does not replay it');
  checks.push('advanced disclosures animate explicit interactions and stay quiet when restored');
  await page.locator('[data-view="discover"]').click();
  const feedback=await page.evaluate(async()=>{
    const api=await import('./dev-preview.js');
    await api.dispatch({type:'SET_SETTINGS',patch:{recommendationKind:'specific'}});await api.recommend();
    const details=document.querySelector('#discovery-feedback-panel');
    details.querySelector('summary').click();await Promise.resolve();
    return {open:details.open,frames:details.querySelector('button').getAnimations().flatMap(animation=>animation.effect.getKeyframes())};
  });
  assert.equal(feedback.open,true);
  assert.ok(feedback.frames.some(frame=>Number(frame.opacity)<1),'Saved feedback content also receives explicit disclosure feedback');
  const feedbackClosing=await page.evaluate(()=>{
    const details=document.querySelector('#discovery-feedback-panel');details.querySelector('summary').click();
    return {open:details.open,ghosts:document.querySelectorAll('[data-ui-motion-ghost]').length};
  });
  assert.equal(feedbackClosing.open,false);assert.ok(feedbackClosing.ghosts>0);
  await page.waitForFunction(()=>!document.querySelector('[data-ui-motion-ghost]'));
  await page.evaluate(async()=>{
    const api=await import('./dev-preview.js');await api.dispatch({type:'SET_SETTINGS',patch:{recommendationKind:'broad'}});await api.recommend();
  });
  checks.push('saved feedback disclosures animate entry and exit without delaying their native toggle');
  await page.setViewportSize({width:390,height:320});
  await page.locator('[data-view="interests"]').click();
  await page.locator('[data-action="interest-overview"]').click();
  await page.waitForFunction(()=>document.querySelector('.interest-overview-dialog').getAnimations().length===0 && document.getElementById('main-view').getAnimations().length===0);
  const scrolledDialog=page.locator('.interest-overview-dialog');
  const scrollTop=await scrolledDialog.evaluate(element=>{element.scrollTop=element.scrollHeight;return element.scrollTop;});
  assert.ok(scrollTop>0,'The narrow overview actually overflows and has been scrolled');
  const clip=await scrolledDialog.boundingBox();
  const beforeExit=await page.screenshot({clip,path:resolve(output,'scrolled-dialog-before.png')});
  await page.evaluate(()=>{
    document.querySelector('.interest-overview-dialog [type="submit"]').click();
    // Freeze just the outgoing presentation at its first frame for a visual comparison.
    document.querySelectorAll('[data-ui-motion-ghost]').forEach(element=>element.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=0;}));
  });
  const afterExit=await page.screenshot({clip,path:resolve(output,'scrolled-dialog-exit.png')});
  const changedPixels=await page.evaluate(async images=>{
    const decode=async source=>{const image=new Image();image.src=source;await image.decode();return image;};
    const [before,after]=await Promise.all(images.map(decode));
    const canvas=document.createElement('canvas');canvas.width=before.width;canvas.height=before.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(before,0,0);const first=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(after,0,0);const second=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let changed=0;for(let index=0;index<first.length;index+=4)if(Math.max(...[0,1,2].map(channel=>Math.abs(first[index+channel]-second[index+channel])))>30)changed++;
    return changed/(canvas.width*canvas.height);
  },[beforeExit,afterExit].map(buffer=>'data:image/png;base64,'+buffer.toString('base64')));
  metrics.scrolledExitChangedPixels=changedPixels;
  assert.ok(changedPixels<.03,`Closing a scrolled dialog keeps its visible content (${(changedPixels*100).toFixed(1)}% changed pixels)`);
  await page.evaluate(()=>document.querySelectorAll('[data-ui-motion-ghost]').forEach(element=>element.getAnimations().forEach(animation=>animation.cancel())));
  await page.waitForFunction(()=>!document.querySelector('[data-ui-motion-ghost]'));
  await page.setViewportSize({width:390,height:850});
  await page.locator('[data-focus="nav-settings"]').click();
  checks.push('a scrolled dialog preserves its visible exit content; cancelled snapshots clean up');
  const interrupted=await page.evaluate(()=>{
    document.querySelector('[data-view="discover"]').click();
    const first=document.getElementById('main-view').getAnimations()[0];
    document.querySelector('[data-view="interests"]').click();
    document.querySelector('[data-focus="nav-settings"]').click();
    return {first:first.playState,settings:Boolean(document.querySelector('#main-view > .settings'))};
  });
  assert.equal(interrupted.first,'idle');
  assert.equal(interrupted.settings,true,'Rapid navigation keeps the final destination');
  await page.evaluate(()=>{
    document.querySelector('[data-view="interests"]').click();
    window.interruptedEntry=document.getElementById('main-view').getAnimations()[0];
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>window.interruptedEntry.playState==='idle');
  const reduced=await page.evaluate(async()=>{
    document.querySelector('[data-view="discover"]').click();
    const entry=document.getElementById('main-view').getAnimations().length;
    document.querySelector('[data-action="recommend"]').click();
    const spinner=getComputedStyle(document.querySelector('.refresh-button > .ui-icon')).animationName;
    await Promise.resolve();await Promise.resolve();
    document.querySelector('[data-view="interests"]').click();
    document.querySelector('[data-action="interest-overview"]').click();
    const dialog=document.querySelector('.interest-overview-dialog');
    const animations=dialog.getAnimations().length,backdrop=getComputedStyle(dialog,'::backdrop').animationName;
    dialog.querySelector('[type="submit"]').click();
    return {entry,spinner,animations,backdrop,ghosts:document.querySelectorAll('[data-ui-motion-ghost]').length};
  });
  assert.deepEqual(reduced,{entry:0,spinner:'none',animations:0,backdrop:'none',ghosts:0});
  checks.push('rapid navigation honors the last action; live reduced motion cancels effects and suppresses new animation');
  await page.emulateMedia({reducedMotion:'no-preference'});
  for (const width of [320,390,1100]) {
    await page.setViewportSize({width,height:850});
    await page.locator('[data-view="discover"]').click();
    await page.waitForFunction(()=>document.querySelector('.main-nav-indicator').getAnimations().length===0);
    const geometry=await page.evaluate(()=>{
      const target=document.querySelector('.main-nav [aria-current="page"]').getBoundingClientRect();
      const marker=document.querySelector('.main-nav-indicator').getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth>innerWidth,delta:Math.max(...['left','top','width','height'].map(key=>Math.abs(target[key]-marker[key])))};
    });
    assert.equal(geometry.overflow,false,`No horizontal overflow at ${width}px`);
    assert.ok(geometry.delta<1,`The navigation marker stays aligned at ${width}px`);
    if(width===390)await page.screenshot({path:resolve(output,'sidepanel-390.png')});
  }
  const dashboard=await context.newPage();dashboard.on('pageerror',error=>errors.push(error.message));
  await dashboard.setViewportSize({width:1100,height:850});
  await dashboard.goto(base.replace('sidepanel.html','dashboard.html')+'?preview=1');
  await dashboard.locator('[data-view="interests"]').click();
  assert.ok(await dashboard.locator('#main-view').evaluate(element=>element.getAnimations().length)>0,'Dashboard uses the same page transition');
  await dashboard.locator('[data-view="discover"]').click();
  await dashboard.waitForFunction(()=>document.getElementById('main-view').getAnimations().length===0);
  await dashboard.screenshot({path:resolve(output,'dashboard-1100.png')});
  checks.push('320/390/1100px navigation alignment and overflow checks pass; both surfaces share motion');
  assert.deepEqual(errors,[]);
} finally {
  await writeFile(resolve(output,'results.json'),JSON.stringify({checks,errors,metrics},null,2));
  await close?.();
}
console.log(JSON.stringify({checks,errors},null,2));
