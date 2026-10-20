const rows=value=>Array.isArray(value)?value:[];

/** Window-local stop selection; transit paths still use the complete Galaxy graph. */
export function tourInterestScope(state,data,selection={}) {
  const approved=[...new Map(rows(state?.approved).filter(row=>typeof row?.id==='string'&&row.id).map(row=>[row.id,row])).values()];
  const summarize=items=>({topics:items.map(row=>row.id),count:items.filter(row=>data.byId.has(row.id)).length});
  const mode=['group','category'].includes(selection.mode)?selection.mode:'all';
  let choices=mode==='group'?rows(state?.interestGroups).map(group=>{
    const members=new Set(rows(group.interestIds));
    return {id:group.id,name:group.name,...summarize(approved.filter(row=>members.has(row.id)))};
  }):[];
  if(mode==='category') {
    const categories=new Map();
    for(const row of approved) {
      const domain=String(data.byId.get(row.id)?.domain??row.domain??'').trim();
      const id=domain.toLowerCase()==='custom'?'':domain;
      if(!categories.has(id))categories.set(id,[]);
      categories.get(id).push(row);
    }
    choices=[...categories].sort(([a],[b])=>a.localeCompare(b)).map(([id,items])=>({id,name:id,...summarize(items)}));
  }
  const selected=new Set(rows(selection.ids)),chosen=choices.filter(choice=>selected.has(choice.id));
  const members=new Set(chosen.flatMap(choice=>choice.topics));
  return {mode,ids:chosen.map(choice=>choice.id),choices,...summarize(mode==='all'?approved:approved.filter(row=>members.has(row.id)))};
}
