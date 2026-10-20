import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export async function checkTourScopes({context,base,output,catalog}) {
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const action=action=>page.evaluate(async action=>{
    const result=await chrome.runtime.sendMessage({type:'ACTION',action});
    if(result.error)throw new Error(result.error);return result.state;
  },action);
  const status=value=>page.waitForFunction(value=>document.querySelector('.galaxy-root')?.dataset.tourStatus===value,value);
  const mode=value=>page.locator('[data-tour-action="scope-mode"][value="'+value+'"]');
  const choice=id=>page.locator('[data-tour-action="scope-choice"][value='+JSON.stringify(id)+']');
  const start=()=>page.locator('[data-tour-action="start"]');
  const open=async()=>{await page.locator('[data-galaxy-action="tour"]').click();await status('ready');};
  const exit=async()=>{await page.keyboard.press('Escape');await status('idle');};
  const first=catalog.find(topic=>topic.id==='Photography'),single=catalog.find(topic=>topic.id==='Education');
  const second=catalog.find(topic=>topic.domain===first.domain&&topic.id!==first.id);
  const outside={id:'Fictional scope off-map topic',topic:'Fictional scope off-map topic',domain:'Other',description:''};
  try {
    await page.goto(base+'dashboard.html?view=map');
    await action({type:'SET_SETTINGS',patch:{tutorialSeen:true,tutorialActive:false,soundEffectsEnabled:false,galaxyTourMusic:'off',language:'en'}});
    for(const topic of [first,second,single,outside])await action({type:'ADD_INTEREST',topic});
    await page.reload();await page.locator('[data-view="map"]').click();await page.locator('.galaxy-canvas').waitFor();
    await open();assert.equal(await page.locator('[data-tour-action="scope-mode"]').count(),3,'The setup must offer all, group and category modes');
    assert.equal(await mode('all').getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('.galaxy-tour-summary').innerText(),/3 stops/);
    await mode('group').click();await status('error');assert.equal(await start().isDisabled(),true);
    assert.match(await page.locator('.galaxy-tour-error').innerText(),/group/i);
    const smallState=await action({type:'CREATE_INTEREST_GROUP',name:'One mapped topic',interestIds:[single.id,outside.id]});
    const pairState=await action({type:'CREATE_INTEREST_GROUP',name:'Visual pair',interestIds:[first.id,second.id]});
    const small=smallState.interestGroups.find(group=>group.name==='One mapped topic').id;
    const pair=pairState.interestGroups.find(group=>group.name==='Visual pair').id;
    await choice(small).check();await status('error');assert.equal(await start().isDisabled(),true);
    assert.match(await page.locator('.galaxy-tour-summary').innerText(),/1 topic/);
    assert.match(await page.locator('.galaxy-tour-skipped').innerText(),/Fictional scope/);
    await choice(pair).check();await status('ready');assert.equal(await start().isEnabled(),true);
    assert.match(await page.locator('.galaxy-tour-summary').innerText(),/3 stops/);
    await choice(small).uncheck();await status('ready');
    assert.match(await page.locator('.galaxy-tour-summary').innerText(),/2 stops/);
    await action({type:'DELETE_INTEREST_GROUP',id:pair});await status('error');
    assert.equal(await start().isDisabled(),true,'Removing the selected group must not broaden the route');
    const recreated=await action({type:'CREATE_INTEREST_GROUP',name:'Visual pair',interestIds:[first.id,second.id]});
    const pairId=recreated.interestGroups.find(group=>group.name==='Visual pair').id;
    await choice(pairId).check();await status('ready');
    const before=await page.evaluate(async()=>{const {state}=await chrome.runtime.sendMessage({type:'GET_STATE'});return {approved:state.approved,interestGroups:state.interestGroups,explored:state.explored,stats:state.stats};});
    await start().click();await status('playing');await page.locator('[data-tour-action="pause"]').click();
    for(const id of [first.id,second.id]) {
      assert.match(await page.locator('.galaxy-tour-eyebrow').innerText(),/of 2/i);
      assert.equal(await page.locator('.galaxy-tour-caption h2').innerText(),id);
      await page.locator('[data-tour-action="next"]').click();
    }
    const after=await page.evaluate(async()=>{const {state}=await chrome.runtime.sendMessage({type:'GET_STATE'});return {approved:state.approved,interestGroups:state.interestGroups,explored:state.explored,stats:state.stats};});
    assert.deepEqual(after,before);
    await exit();await open();await mode('category').click();await status('error');
    await choice(single.domain).check();await status('error');assert.equal(await start().isDisabled(),true);
    await choice('Other').check();await status('error');assert.equal(await start().isDisabled(),true);
    await choice(first.domain).check();await status('ready');
    assert.match(await page.locator('.galaxy-tour-summary').innerText(),/3 stops/);
    await choice(single.domain).uncheck();await choice('Other').uncheck();await status('ready');
    assert.match(await page.locator('.galaxy-tour-summary').innerText(),/2 stops/);
    await page.evaluate(()=>{
      document.querySelector('[data-tour-action="scope-mode"][value="all"]').click();
      document.querySelector('[data-tour-action="scope-mode"][value="group"]').click();
      document.querySelector('[data-tour-action="scope-mode"][value="category"]').click();
    });
    await status('ready');assert.equal(await mode('category').getAttribute('aria-pressed'),'true');
    assert.equal(await choice(first.domain).isChecked(),true);
    await page.setViewportSize({width:320,height:900});
    await action({type:'SET_SETTINGS',patch:{language:'zh-CN'}});
    await page.waitForFunction(()=>document.querySelector('[data-tour-action="scope-mode"][value="category"]')?.textContent==='条目分类');
    assert.ok(await page.locator('.galaxy-tour-setup').evaluate(node=>node.scrollWidth<=node.clientWidth));
    await page.screenshot({path:resolve(output,'scope-setup-320-zh.png'),fullPage:true});
    await action({type:'REMOVE_INTERESTS',ids:[second.id]});await status('error');
    assert.equal(await start().isDisabled(),true);assert.match(await page.locator('.galaxy-tour-error').innerText(),/2/);
    assert.deepEqual(errors,[]);
    return ['all, combined saved-group and combined catalog-category stop scopes; deduplication, empty/removed groups, one mapped topic and off-map filtering; race-safe replanning, passive playback and 320px Chinese setup'];
  } catch(error) {await page.screenshot({path:resolve(output,'scope-failure.png'),fullPage:true});throw error;}
  finally {await action({type:'RESET'}).catch(()=>{});await page.close();}
}
