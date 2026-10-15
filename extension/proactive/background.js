import {createProactiveCoordinator} from './coordinator.js';
import {createProactiveRegistration} from './registration.js';
import {PROACTIVE_ORIGINS} from './sites.js';

export function installProactiveRuntime({chrome,controllerPromise}){
 const coordinatorPromise=controllerPromise.then(controller=>createProactiveCoordinator({chrome,controller}));
 const registration=createProactiveRegistration({chrome,
  getState:async()=>(await controllerPromise).getState(),
  disable:async()=>(await controllerPromise).dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:false}}),
  invalidate:()=>{void coordinatorPromise.then(c=>c.invalidate()).catch(()=>{});},
 });
 const reconcile=()=>Promise.all([registration.reconcile(),coordinatorPromise.then(c=>c.reconcile())]).catch(()=>{});
 chrome.storage.onChanged?.addListener((changes,area)=>{
  if(area!=='local' || !changes.state)return;
  void coordinatorPromise.then(c=>c.reconcile()).catch(()=>{});
  if(changes.state.oldValue?.settings?.proactiveEnabled!==changes.state.newValue?.settings?.proactiveEnabled)void registration.reconcile().catch(()=>{});
 });
 chrome.permissions.onAdded.addListener(()=>{void reconcile();});
 chrome.permissions.onRemoved.addListener(()=>{void coordinatorPromise.then(c=>c.invalidate()).then(reconcile).catch(()=>{});});
 chrome.tabs.onRemoved?.addListener(id=>{void coordinatorPromise.then(c=>c.removeTab(id)).catch(()=>{});});
 chrome.runtime.onStartup.addListener(()=>{void reconcile();});
 chrome.runtime.onInstalled.addListener(()=>{void reconcile();});
 chrome.runtime.onConnect?.addListener(port=>{
  if(port.name!=='otherwise-proactive')return;
  let closed=false,unsubscribe=()=>{};
  port.onDisconnect.addListener(()=>{closed=true;unsubscribe();});
  void coordinatorPromise.then(async c=>{
   try{await c.authorize(port.sender);}catch{port.disconnect();return;}
   if(closed)return;
   unsubscribe=c.subscribe(()=>{try{port.postMessage({type:'invalidated'});}catch{unsubscribe();}});
   port.postMessage({type:'ready'});
  }).catch(()=>{try{port.disconnect();}catch{/* Already disconnected. */}});
 });
 void reconcile();
 return {
  handle:(message,sender)=>coordinatorPromise.then(c=>c.handle(message,sender)),
  async beforeEnable(){if(!await chrome.permissions.contains({origins:[...PROACTIVE_ORIGINS]}))throw new Error('Allow Google and YouTube access before enabling search-page recommendations.');},
  reconcile,
 };
}
