import {getProactiveSite,isProactiveSender,PROACTIVE_ORIGINS} from './sites.js';
const TTL=30*60000, BACKOFF=60000, SESSION='proactiveSession';
const hidden=(enabled=false,language='en')=>({enabled,language,cards:[],batchId:null});
const validToken=value=>typeof value==='string' && /^[a-f\d-]{36}$/.test(value);
function validMessage(message){
 if(!message || typeof message!=='object' || Array.isArray(message))return false;
 if(['PROACTIVE_GET','PROACTIVE_DISMISS','PROACTIVE_OPEN_APP'].includes(message.type))return Object.keys(message).length===1;
 return message.type==='PROACTIVE_OPEN' && Object.keys(message).length===3 && validToken(message.batchId) && validToken(message.cardId);
}
export function createProactiveCoordinator({chrome,controller,clock=Date.now}){
 let cache=null,pending=null,key=null,epoch=0,retryAt=0,writeQueue=Promise.resolve();
 const dismissed=new Set(),listeners=new Set();
 const ready=(async()=>{
  await chrome.storage.session?.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const saved=(await chrome.storage.session?.get(SESSION))?.[SESSION];
  if(!saved)return;
  for(const id of saved.dismissed||[])if(Number.isInteger(id))dismissed.add(id);
  if(saved.cache && validToken(saved.cache.batchId) && Array.isArray(saved.cache.items) && saved.cache.items.length<=3 && Array.isArray(saved.cache.issuedTabs) && saved.cache.expiresAt>clock())cache=saved.cache;
  key=cache?.profileKey||null;
 })();
 function persist(){
  const value=structuredClone({cache,dismissed:[...dismissed]});
  const next=writeQueue.then(()=>chrome.storage.session?.set({[SESSION]:value}));writeQueue=next.catch(()=>{});return next;
 }
 function notify(){for(const listener of listeners){try{listener();}catch{/* Detached content is already gone. */}}}
 function invalidate(){epoch++;pending?.abort.abort();pending=null;cache=null;retryAt=0;notify();void ready.then(persist).catch(()=>{});}
 async function reconcile(){
  await ready;const next=await controller.getProactiveProfileKey();
  if(key!==next){key=next;invalidate();}
 }
 async function authorize(sender){
  if(!isProactiveSender(sender,chrome.runtime.id))throw new Error('This request is not permitted.');
  const state=await controller.getState();
  if(!state.settings.proactiveEnabled || !await chrome.permissions.contains({origins:[...PROACTIVE_ORIGINS]}))throw new Error('This request is not permitted.');
  if(chrome.tabs.get){
   const tab=await chrome.tabs.get(sender.tab.id);
   if(tab.incognito || getProactiveSite(tab.url)!==getProactiveSite(sender.url))throw new Error('The page changed.');
  }
  return state;
 }
 async function batch(){
  await reconcile();
  if(cache?.profileKey===key && cache.expiresAt>clock())return cache;
  if(pending?.key===key)return pending.promise;
  if(clock()<retryAt)return null;
  const version=epoch,requestKey=key,abort=new AbortController();
  const task={key:requestKey,abort};pending=task;
  task.promise=(async()=>{
   try{
    const result=await controller.getProactiveRecommendations({signal:abort.signal});
    if(version!==epoch || abort.signal.aborted || result.profileKey!==requestKey)return null;
    cache={profileKey:requestKey,batchId:crypto.randomUUID(),expiresAt:clock()+TTL,issuedTabs:[],items:result.items.slice(0,3).map(item=>({cardId:crypto.randomUUID(),item}))};
    await persist();return cache;
   }catch{
    if(version===epoch)retryAt=clock()+BACKOFF;
    return null;
   }finally{if(pending===task)pending=null;}
  })();
  return task.promise;
 }
 async function handle(message,sender){
  if(!validMessage(message))throw new Error('Invalid recommendation action.');
  await ready;await authorize(sender);
  const tabId=sender.tab.id;
  if(message.type==='PROACTIVE_DISMISS'){dismissed.add(tabId);await persist();return hidden();}
  if(dismissed.has(tabId))return hidden();
  if(message.type==='PROACTIVE_OPEN_APP'){
   await chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html?view=discover')});return {ok:true};
  }
  if(message.type==='PROACTIVE_GET'){
   const result=await batch();
   const state=await authorize(sender);
   if(dismissed.has(tabId))return hidden();
   if(!result || result!==cache || result.profileKey!==await controller.getProactiveProfileKey())return hidden(true,state.settings.language);
   if(!result.issuedTabs.includes(tabId)){result.issuedTabs.push(tabId);await persist();}
   const latest=await authorize(sender),profileKey=await controller.getProactiveProfileKey();
   if(dismissed.has(tabId) || result!==cache || result.profileKey!==profileKey)return hidden();
   return {enabled:true,language:latest.settings.language,cards:result.items.map(({cardId,item})=>({cardId,topic:item.topic,description:item.description})),batchId:result.batchId};
  }
  await reconcile();
  if(!cache || cache.expiresAt<=clock() || cache.batchId!==message.batchId || !cache.issuedTabs.includes(tabId))throw new Error('This recommendation is no longer available.');
  const found=cache.items.find(row=>row.cardId===message.cardId);
  if(!found)throw new Error('This recommendation is no longer available.');
  await controller.openProactiveRecommendation({item:found.item,profileKey:cache.profileKey,provider:getProactiveSite(sender.url)});
  return {ok:true};
 }
 return {handle,invalidate,reconcile,authorize,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
  async removeTab(id){await ready;dismissed.delete(id);if(cache)cache.issuedTabs=cache.issuedTabs.filter(tabId=>tabId!==id);await persist();}};
}
