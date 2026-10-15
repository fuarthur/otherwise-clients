import {cleanDiscoveryMetadata} from './core/discovery.js';
export class RecommendationResponseError extends Error {}
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
