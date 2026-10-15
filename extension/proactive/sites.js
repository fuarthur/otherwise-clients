export const PROACTIVE_ORIGINS=Object.freeze(['https://www.google.com/*','https://www.youtube.com/*']);
export function getProactiveSite(value){
 try{
  const url=new URL(value);
  if(url.username || url.password)return null;
  if(url.origin==='https://www.google.com' && url.pathname==='/search')return 'google';
  if(url.origin==='https://www.youtube.com' && url.pathname==='/results')return 'youtube';
 }catch{/* Untrusted URLs are ineligible. */}
 return null;
}
export function isProactiveSender(sender,extensionId){
 return sender?.id===extensionId && sender.frameId===0 && Number.isInteger(sender.tab?.id) && sender.tab.id>=0 && !sender.tab.incognito && !!getProactiveSite(sender.url);
}
