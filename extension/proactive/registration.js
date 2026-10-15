import {PROACTIVE_ORIGINS} from './sites.js';
const SCRIPT_ID='otherwise-proactive';
export function createProactiveRegistration({chrome,getState,disable,invalidate}){
 let queue=Promise.resolve(),epoch=0;
 async function sync(version){
  if(!chrome.scripting)return;
  let enabled=(await getState()).settings.proactiveEnabled===true;
  const granted=await chrome.permissions.contains({origins:[...PROACTIVE_ORIGINS]});
  if(version!==epoch)return;
  if(enabled && !granted){await disable();enabled=false;}
  const existing=(await chrome.scripting.getRegisteredContentScripts({ids:[SCRIPT_ID]})).length>0;
  if(version!==epoch)return;
  if(!enabled || !granted){
   invalidate();
   if(existing)await chrome.scripting.unregisterContentScripts({ids:[SCRIPT_ID]});
   return;
  }
  if(existing)return;
  await chrome.scripting.registerContentScripts([{id:SCRIPT_ID,matches:[...PROACTIVE_ORIGINS],js:['proactive/content.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true}]);
  if(version!==epoch){await chrome.scripting.unregisterContentScripts({ids:[SCRIPT_ID]});return;}
  const tabs=await chrome.tabs.query({url:[...PROACTIVE_ORIGINS]});
  for(const tab of tabs){
   if(version!==epoch)break;
   if(Number.isInteger(tab.id) && !tab.incognito)await chrome.scripting.executeScript({target:{tabId:tab.id},files:['proactive/content.js']}).catch(()=>{});
  }
 }
 return {reconcile(){const version=++epoch;const next=queue.then(()=>sync(version));queue=next.catch(()=>{});return next;},dispose(){epoch++;invalidate();}};
}
