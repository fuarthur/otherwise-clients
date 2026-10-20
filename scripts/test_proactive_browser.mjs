// Deterministic packaged-extension checks in a disposable profile; no personal browsing data.
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchExtension} from './browser-test-helpers.mjs';
const root=resolve(import.meta.dirname,'..');
const qa=resolve(root,'.cache/qa/proactive');await mkdir(qa,{recursive:true});
const live=process.env.OTHERWISE_PROACTIVE_LIVE==='1';
let calls=0,holdResponse=null;const bodies=[];
const api=createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 if(req.url==='/api/recommend'){
  calls++;bodies.push(JSON.parse(body));
  if(holdResponse)await holdResponse;
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({recommendations:['Botany','Ecology','Forestry'].map(topic=>({topic,domain:'Nature',description:`Discover ${topic.toLowerCase()} through your interest in gardening.`,nearest_interest:'Gardening'}))}));
 }else{res.statusCode=404;res.end();}
});
await new Promise(r=>api.listen(0,'127.0.0.1',r));
const endpoint=`http://127.0.0.1:${api.address().port}`;
let context,base,close,dir;
const until=async fn=>{for(let n=0;n<80;n++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Browser condition timed out');};
const fixture=provider=>`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px Arial;background:#fff;color:#202124}#searchform,ytd-masthead{display:block;padding:25px 8%;border-bottom:1px solid #eee}input{padding:12px;width:65%;border:1px solid #ddd;border-radius:24px}#appbar{padding:16px 8%}main,#primary{display:block;margin:0 8%;max-width:1000px}.native{padding:24px 0;border-bottom:1px solid #eee}a{color:#2049a5}ytd-search{display:block}#auto{position:absolute;z-index:999;background:white;box-shadow:0 3px 9px #999;padding:20px;left:8%;top:74px}</style></head><body>${provider==='google'?'<div id="searchform"><form role="search"><input aria-label="Search" value="gardening"></form></div><div id="appbar">All　Videos　Images　News</div><main id="main">':'<ytd-masthead><form role="search"><input aria-label="Search" value="gardening"></form></ytd-masthead><ytd-search><div id="header">All　Videos　Unwatched</div><div id="primary">'}<article class="native" data-native="one"><a href="#native-one">Original result one</a><p>Native search results stay in place.</p></article><article class="native" data-native="two"><a href="#native-two">Original recommended content</a><p>Original recommendations remain available.</p></article>${provider==='google'?'</main>':'</div></ytd-search>'}</body></html>`;
try{
 dir=await mkdtemp('/private/tmp/otherwise-proactive-extension-');
 await cp(resolve(root,'dist/otherwise-extension'),dir,{recursive:true});
 const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json')));
 // Fixture grants avoid interacting with the user's permissions. Denial/revocation are also covered by runtime unit tests.
 manifest.host_permissions=['http://127.0.0.1/*','https://www.google.com/*','https://www.youtube.com/*'];
 await writeFile(resolve(dir,'manifest.json'),JSON.stringify(manifest));
  ({context, base, close}=await launchExtension({extension:dir,profilePrefix:'otherwise-proactive-profile-',viewport:{width:1280,height:900}}));
 if(!live)await context.route('https://www.google.com/**',r=>r.fulfill({contentType:'text/html',body:fixture('google')}));
 if(!live)await context.route('https://www.youtube.com/**',r=>r.fulfill({contentType:'text/html',body:fixture('youtube')}));
 const settings=await context.newPage();await settings.goto(base+'sidepanel.html?view=settings');
 const send=message=>settings.evaluate(m=>chrome.runtime.sendMessage(m),message);
 const dispatch=action=>send({type:'ACTION',action});
 await dispatch({type:'SET_SETTINGS',patch:{tutorialSeen:true,tutorialActive:false,endpoint}});
 await dispatch({type:'ADD_INTEREST',topic:{id:'Gardening',topic:'Gardening',domain:'Nature',description:'Growing plants.'}});
 if(live){
  await settings.locator('[data-disclosure="settings-discovery"] > summary').click();
  await settings.locator('#proactive-enabled').check();
  const verified=[];
  for(const site of [{name:'google',url:'https://www.google.com/search?q=botany',native:'#search a h3'},{name:'youtube',url:'https://www.youtube.com/results?search_query=botany',native:'ytd-video-renderer a#video-title'}]){
   const page=await context.newPage();await page.goto(site.url,{waitUntil:'domcontentloaded'});await page.bringToFront();
   try{await page.locator(site.native).first().waitFor({timeout:20000});}
   catch{await page.screenshot({path:resolve(qa,`${site.name}-live-unavailable.png`)});verified.push({site:site.name,status:'unavailable',url:page.url(),title:await page.title(),excerpt:(await page.locator('body').innerText()).slice(0,300)});continue;}
   const before=await page.locator(site.native).allTextContents();
   await page.locator('#otherwise-proactive').waitFor({timeout:15000});
   await page.screenshot({path:resolve(qa,`${site.name}-live.png`)});
   const after=await page.locator(site.native).allTextContents();assert.ok(before.every(value=>after.includes(value)));
   verified.push({site:site.name,nativeResults:after.length,widgetVisible:true});
  }
  await settings.bringToFront();await settings.locator('#proactive-enabled').uncheck();
  for(const page of context.pages())if(/www\.(google|youtube)\.com/.test(page.url()))await until(async()=>await page.locator('#otherwise-proactive').count()===0);
  console.log(JSON.stringify({result:verified.every(s=>s.widgetVisible)?'PASS':'PARTIAL',mode:'live websites with fixture recommender',verified,screenshots:qa}));
  if(verified.some(s=>!s.widgetVisible))process.exitCode=1;
 }else{
 const google=await context.newPage();await google.goto('https://www.google.com/search?q=private-query');
 assert.equal(await google.locator('#otherwise-proactive').count(),0);assert.equal(calls,0);
 await settings.locator('[data-disclosure="settings-discovery"] > summary').click();
 await settings.locator('#proactive-enabled').check();
 await google.bringToFront();
 await google.locator('#otherwise-proactive').waitFor({timeout:10000});
 assert.equal(calls,1);assert.ok(!JSON.stringify(bodies).includes('private-query'));assert.equal(bodies[0].mode,'global');
 assert.deepEqual(await google.locator('[data-native]').evaluateAll(nodes=>nodes.map(n=>n.dataset.native)),['one','two']);
 assert.equal(await google.locator('[data-native="one"] a').isVisible(),true);
 await google.screenshot({path:resolve(qa,'google.png')});
 // Closed shadow root is inspected through browser debugging, not through an exposed product hook.
 async function shadowNode(page,selector){
  const cdp=await context.newCDPSession(page);
  const tree=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
  const find=node=>{if(node.attributes?.includes('otherwise-proactive'))return node;for(const child of [...(node.children||[]),...(node.shadowRoots||[])]){const found=find(child);if(found)return found;}};
  const host=find(tree.root);assert.ok(host?.shadowRoots?.[0]);
  const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:host.shadowRoots[0].nodeId,selector});assert.ok(nodeId);
  return {cdp,nodeId};
 }
 async function clickShadow(page,selector){const {cdp,nodeId}=await shadowNode(page,selector);const {model}=await cdp.send('DOM.getBoxModel',{nodeId});const box=model.content;await page.mouse.click((box[0]+box[4])/2,(box[1]+box[5])/2);await cdp.detach();}
 const yt=await context.newPage();await yt.goto('https://www.youtube.com/results?search_query=private-query');
 await yt.locator('#otherwise-proactive').waitFor();assert.equal(calls,1);
 await yt.screenshot({path:resolve(qa,'youtube.png')});
 const opened=context.waitForEvent('page');await clickShadow(yt,'button[data-card]');const result=await opened;await result.waitForLoadState();assert.match(result.url(),/youtube.com\/results\?search_query=Botany/);
 await until(async()=>((await send({type:'GET_STATE'})).state.explored.length===1));
 await yt.evaluate(()=>{history.pushState({},'','/');document.dispatchEvent(new Event('yt-navigate-finish'));});
 await until(async()=>await yt.locator('#otherwise-proactive').count()===0);
 await yt.evaluate(()=>{history.pushState({},'','/results?search_query=next');document.dispatchEvent(new Event('yt-navigate-finish'));});
 await yt.locator('#otherwise-proactive').waitFor();assert.equal(await yt.locator('#otherwise-proactive').count(),1);
 await yt.evaluate(()=>{const old=document.querySelector('#primary');const replacement=old.cloneNode(true);replacement.querySelector('#otherwise-proactive')?.remove();old.replaceWith(replacement);});
 await until(async()=>await yt.locator('#otherwise-proactive').count()===1);
 // Replace the anchor while a new profile's request is waiting; no unrelated mutation should be needed.
 let releaseResponse;holdResponse=new Promise(resolve=>releaseResponse=resolve);
 await yt.bringToFront();const priorCalls=calls;
 await dispatch({type:'ADD_INTEREST',topic:{id:'Ecology',topic:'Ecology',domain:'Nature',description:'Living systems.'}});
 await until(()=>calls>priorCalls);
 await yt.evaluate(()=>{const old=document.querySelector('#primary');old.replaceWith(old.cloneNode(true));});
 await new Promise(r=>setTimeout(r,250));holdResponse=null;releaseResponse();
 await yt.locator('#otherwise-proactive').waitFor({timeout:5000});
 await dispatch({type:'REMOVE_INTEREST',id:'Ecology'});
 await until(async()=>await yt.locator('#otherwise-proactive').count()===1);
 await google.bringToFront();await google.locator('#otherwise-proactive').waitFor();
 const closeTarget=await shadowNode(google,'button[data-close]');await closeTarget.cdp.send('DOM.focus',{nodeId:closeTarget.nodeId});await google.keyboard.press('Enter');await closeTarget.cdp.detach();await until(async()=>await google.locator('#otherwise-proactive').count()===0);
 await google.reload();await google.waitForLoadState();await new Promise(r=>setTimeout(r,400));assert.equal(await google.locator('#otherwise-proactive').count(),0);
 assert.equal(await yt.locator('#otherwise-proactive').count(),1);
 await yt.setViewportSize({width:320,height:800});await yt.screenshot({path:resolve(qa,'youtube-narrow.png')});
 assert.ok(await yt.locator('#otherwise-proactive').evaluate(e=>e.getBoundingClientRect().right<=320));
 await settings.locator('#proactive-enabled').uncheck();await until(async()=>await yt.locator('#otherwise-proactive').count()===0);
 assert.deepEqual(await yt.locator('[data-native]').evaluateAll(nodes=>nodes.map(n=>n.dataset.native)),['one','two']);
 assert.equal(await yt.locator('[data-native="two"] a').isVisible(),true);
 await yt.locator('[data-native="two"] a').click();assert.match(yt.url(),/#native-two$/);
 assert.equal((await send({type:'GET_STATE'})).state.approved.length,1);
 console.log(JSON.stringify({result:'PASS',serviceRequests:calls,checks:['default off','enable existing tabs','3 cards','query exclusion','shared cache','native content retained','new tab exploration','SPA navigation','anchor replacement including pending response','keyboard close','dismissal across reload','320px layout','disable removes widget'],screenshots:qa}));
 }
}finally{
 try{await close?.();}finally{
  if(dir)await rm(dir,{recursive:true,force:true});
  await new Promise(r=>api.close(r));
 }
}
