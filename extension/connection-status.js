import {normalizeEndpoint,hasServiceConnection,connectionHeaders} from './core/connection.js';

const MAX_STATUS_BYTES=2048;
const connectionKey=value=>JSON.stringify([value.endpoint,value.accessToken]);
class StatusDataError extends Error {}
const discardResponse=response=>{if(response.body)void response.body.cancel().catch(()=>{});};

async function readStatus(response,signal){
  const type=response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if(type!=='application/json' || Number(response.headers.get('Content-Length'))>MAX_STATUS_BYTES || !response.body){discardResponse(response);throw new StatusDataError();}
  const reader=response.body.getReader(),chunks=[];let size=0;
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_STATUS_BYTES){cancel();throw new StatusDataError();}
      chunks.push(value);
    }
  }finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let data;
  try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new StatusDataError();}
  if(!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).length!==4 ||
    data.schema_version!==1 || data.service!=='otherwise' || typeof data.ready!=='boolean' || typeof data.discovery_ready!=='boolean')throw new StatusDataError();
  return {status:!data.ready?'warming':data.discovery_ready?'ready':'discovery_unavailable',ready:data.ready,discovery_ready:data.discovery_ready};
}

/** Explicit status-only requests. Results stay in the requesting page, never storage. */
export function createConnectionStatusTransport({getConnection,hasEndpointPermission,fetchImpl=fetch}){
  let active=null,revision=0;const listeners=new Set();
  function invalidate(){
    revision++;active?.abort('invalidated');
    for(const listener of listeners){try{listener();}catch{/* One window cannot block others. */}}
  }
  const subscribeInvalidation=listener=>{listeners.add(listener);return ()=>listeners.delete(listener);};
  async function check(){
    active?.abort('invalidated');
    const controller=new AbortController(),startedRevision=revision;active=controller;
    const timer=setTimeout(()=>controller.abort('timeout'),7000);
    let abortListener;
    const interrupted=new Promise(resolve=>{
      abortListener=()=>resolve({status:controller.signal.reason});
      controller.signal.addEventListener('abort',abortListener,{once:true});
    });
    try{
      const saved=getConnection();let connection;
      try{connection={endpoint:normalizeEndpoint(saved.endpoint),accessToken:saved.accessToken};}
      catch{return {status:'missing_configuration'};}
      if(!hasServiceConnection(connection))return {status:'missing_configuration'};
      const key=connectionKey(saved);
      const current=()=>!controller.signal.aborted && revision===startedRevision && key===connectionKey(getConnection());
      const permitted=async()=>{try{return await hasEndpointPermission(connection.endpoint);}catch{return false;}};
      const inspect=(async()=>{
        const allowed=await permitted();
        if(!current())return {status:'invalidated'};
        if(!allowed)return {status:'permission_required'};
        const response=await fetchImpl(`${connection.endpoint}/api/status`,{
          method:'GET',headers:connectionHeaders(connection),credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,
        });
        if(!current())return {status:'invalidated'};
        let result;
        if(response.status!==200){
          discardResponse(response);
          result={status:({401:'unauthorized',403:'forbidden',404:'incompatible',405:'incompatible'})[response.status] || 'unreachable'};
        }else result=await readStatus(response,controller.signal);
        if(!current())return {status:'invalidated'};
        const stillAllowed=await permitted();
        if(!current())return {status:'invalidated'};
        if(!stillAllowed)return {status:'permission_required'};
        return result;
      })();
      return await Promise.race([inspect,interrupted]);
    }catch(error){
      return {status:controller.signal.aborted?controller.signal.reason:error instanceof StatusDataError?'incompatible':'unreachable'};
    }finally{
      clearTimeout(timer);controller.signal.removeEventListener('abort',abortListener);
      if(active===controller)active=null;
    }
  }
  return {check,invalidate,subscribeInvalidation};
}
