import {cleanDiscoveryMetadata} from './core/discovery.js';
export class RecommendationResponseError extends Error {}

/** Decode the shared service envelope; each caller owns HTTP errors and cancellation. */
export async function readRecommendationResponse(response,{specific=false,seed}={}) {
  const raw=await response.text();
  if(raw.length>150000)throw new RecommendationResponseError('The service response was too large.');
  const result=JSON.parse(raw),items=cleanRecommendations(result.recommendations,specific);
  if(specific && (result.seed!==seed || !/^[a-f0-9]{64}$/.test(result.graph_sha256 || '') ||
      new Set(items.map(row=>row.discovery.concept_id)).size!==items.length)) {
    throw new RecommendationResponseError('The service returned an invalid graph concept.');
  }
  return {items,graphSha256:result.graph_sha256};
}

export function cleanRecommendations(value, specific = false) {
  if(!Array.isArray(value) || value.length>100) throw new RecommendationResponseError('The service returned an invalid recommendation list.');
  return value.map(row=>{
    if(!row || typeof row.topic!=='string' || !row.topic.trim() || row.topic.length>120 || typeof row.domain!=='string' || row.domain.length>120 || typeof row.description!=='string' || row.description.length>3000) throw new RecommendationResponseError('The service returned an invalid topic.');
    let discovery;
    if(specific){try{discovery=cleanDiscoveryMetadata(row.discovery);}catch{throw new RecommendationResponseError('The service returned an invalid graph concept.');}}
    return {id:row.topic,topic:row.topic,domain:row.domain,description:row.description,...(discovery?{discovery}:{}),
      nearest_interest:typeof row.nearest_interest==='string'?row.nearest_interest:'',
      distance:Number.isFinite(row.distance)?row.distance:null,
      boundary_offset:Number.isFinite(row.boundary_offset)?row.boundary_offset:null,
      zone:row.zone==='Familiar overlap'?'Familiar overlap':'New territory'};
  });
}
