const fields=['selected','skipped','ignored','restored'];
export const CANDIDATE_ACTIONS=new Set(['REVIEW_CANDIDATES','CONFIRM_CANDIDATE_DRAFT']);
export const emptyCandidateReview=()=>({initialized:false,selected:[],skipped:[],ignored:[],restored:[],undo:null});

export function rankedCandidates(candidates) {
  return [...candidates].sort((a,b)=>(b.contentCount??b.count)-(a.contentCount??a.count) ||
    (b.siteCount??1)-(a.siteCount??1) || b.lastSeen-a.lastSeen || a.topic.localeCompare(b.topic));
}

function draftSuggestion(candidates,review) {
  const eligible=rankedCandidates(candidates.filter(row=>!review.ignored.includes(row.id) &&
    (!row.backgroundReason || review.restored.includes(row.id))));
  const selected=[],domains=new Map();
  // Give different fields room first, then fill the small proposal.
  for(const row of eligible)if((domains.get(row.domain)||0)<2 && selected.length<6) {
    selected.push(row.id);domains.set(row.domain,(domains.get(row.domain)||0)+1);
  }
  for(const row of eligible)if(selected.length<6 && !selected.includes(row.id))selected.push(row.id);
  return selected;
}

export function normalizeCandidateReview(value,candidates,{seed=true}={}) {
  const ids=new Set(candidates.map(row=>row.id)),review=emptyCandidateReview();
  review.initialized=value?.initialized===true;
  const clean=input=>Array.isArray(input)?[...new Set(input.filter(id=>ids.has(id)))]:[];
  for(const field of fields)review[field]=clean(value?.[field]);
  review.selected=review.selected.filter(id=>!review.ignored.includes(id) &&
    (!candidates.find(row=>row.id===id)?.backgroundReason || review.restored.includes(id)));
  review.skipped=review.skipped.filter(id=>!review.selected.includes(id) && !review.ignored.includes(id));
  if(ids.size && value?.undo && fields.every(field=>Array.isArray(value.undo[field]))) {
    review.undo=Object.fromEntries(fields.map(field=>[field,clean(value.undo[field])]));
  }
  if(seed && !review.initialized && candidates.length) {
    review.initialized=true;review.selected=draftSuggestion(candidates,review);
  }
  return review;
}

export function editCandidateReview(value,candidates,action) {
  const review=normalizeCandidateReview(value,candidates);
  if(action.operation==='undo') {
    return review.undo?normalizeCandidateReview({...review,...review.undo,undo:null},candidates):review;
  }
  if(!['select','remove','ignore','skip','restore','restart','resume'].includes(action.operation))return review;
  const available=new Map(candidates.map(row=>[row.id,row]));
  const ids=[...new Set((Array.isArray(action.ids)?action.ids:[]).filter(id=>available.has(id)))];
  if(!['restart','resume'].includes(action.operation) && !ids.length)return review;
  const before=Object.fromEntries(fields.map(field=>[field,[...review[field]]]));
  if(action.operation==='resume')review.skipped=[];
  else if(action.operation==='restart') {
    review.selected=draftSuggestion(candidates,review);review.skipped=[];
  } else for(const id of ids) {
    if(action.operation==='select' && available.get(id).backgroundReason && !review.restored.includes(id))continue;
    for(const field of ['selected','skipped','ignored'])review[field]=review[field].filter(value=>value!==id);
    if(action.operation==='select') {
      review.selected.push(id);
      // Explicit choices win if later title evidence is classified differently.
      if(!review.restored.includes(id))review.restored.push(id);
    }
    if(action.operation==='remove' || action.operation==='skip')review.skipped.push(id);
    if(action.operation==='ignore')review.ignored.push(id);
    if(action.operation==='restore' && !review.restored.includes(id))review.restored.push(id);
  }
  if(fields.some(field=>JSON.stringify(before[field])!==JSON.stringify(review[field])))review.undo=before;
  return review;
}

export function candidateReviewLists(candidates,review) {
  const selected=new Set(review.selected),ignored=new Set(review.ignored),restored=new Set(review.restored),skipped=new Set(review.skipped);
  const ranked=rankedCandidates(candidates);
  const hidden=ranked.filter(row=>ignored.has(row.id) || row.backgroundReason && !restored.has(row.id));
  const hiddenIds=new Set(hidden.map(row=>row.id));
  const active=ranked.filter(row=>!hiddenIds.has(row.id));
  return {draft:active.filter(row=>selected.has(row.id)),active,hidden,queue:active.filter(row=>!selected.has(row.id) && !skipped.has(row.id))};
}
