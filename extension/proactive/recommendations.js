import {buildRequest} from '../core/index.js';
import {readRecommendationResponse} from '../recommendation-response.js';

// Only inputs that actually affect this independent all-interest surface belong here.
export function proactiveSignature(state){
 const s=state.settings;
 return JSON.stringify([state.salt,s.proactiveEnabled,state.approved.map(t=>[t.id,t.topic]),state.suppressed,
   s.endpoint,s.accessToken,s.globalLevel,s.recommendationOptions,s.recommendationKind,s.discoveryExploration,state.discovery?.feedback]);
}
export async function proactiveProfileKey(state){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(proactiveSignature(state)));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function proactiveRequest(state){
 const payload=buildRequest({...state,focus:null,recommendationGroupIds:null,settings:{...state.settings,mode:'global'},discovery:{...state.discovery,exposures:{},context:null}});
 if(state.settings.recommendationKind==='specific')payload.seed=crypto.getRandomValues(new Uint32Array(1))[0]%2**31;
 return payload;
}
export async function readProactiveResponse(response,state,payload){
 if(!response.ok)throw new Error('Recommendations are temporarily unavailable.');
 const {items}=await readRecommendationResponse(response,{specific:state.settings.recommendationKind==='specific',seed:payload.seed});
 const excluded=new Set([...state.approved.map(t=>t.id),...state.suppressed].map(s=>s.toLowerCase()));
 return items.filter(t=>{const id=t.id.toLowerCase();if(excluded.has(id))return false;excluded.add(id);return true;});
}
