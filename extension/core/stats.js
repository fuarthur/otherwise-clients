/** Local exploration metrics. Calendar days use the selected reporting timezone. */
const DAY = 86400000;
const rows = value => Array.isArray(value) ? value : [];
const validId = id => typeof id === 'string' && id.trim().length > 0 && id.length <= 120 && !/[\x00-\x1f\x7f]/.test(id);
export function validTimeZone(value) {
  if (typeof value !== 'string' || value.length > 100) return false;
  try { new Intl.DateTimeFormat('en',{timeZone:value}); return true; } catch { return false; }
}
export function reportingTimeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
export function effectiveTimeZone(state) {
  if (state?.settings?.statsFollowSystemTimeZone !== false) return reportingTimeZone();
  return validTimeZone(state.settings.statsTimeZone) ? state.settings.statsTimeZone : reportingTimeZone();
}
function calendarFormatter(timeZone) { return new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}); }
function dayNumber(at, formatter) {
  const parts = Object.fromEntries(formatter.formatToParts(at).map(p=>[p.type,p.value]));
  return Math.floor(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day))/DAY);
}
const dateKey = day => new Date(day*DAY).toISOString().slice(0,10);
function validEvents(state, now) {
  return rows(state?.explored).filter(row=>row && validId(row.id) && Number.isSafeInteger(row.at) && row.at>=0 && row.at<=now);
}
export const MILESTONES = Object.freeze([
  {id:'first-1',track:'first',target:1,metric:'total'},
  ...[10,50,100].map(target=>({id:`breadth-${target}`,track:'breadth',target,metric:'total'})),
  ...[3,7,30].map(target=>({id:`streak-${target}`,track:'streak',target,metric:'longestStreak'})),
]);
export function validStatsSnapshot(value) {
  if (!value || typeof value!=='object' || Array.isArray(value) ||
      Object.keys(value).some(key=>!['version','startedAt','timeZone','baselineIds','excludedIds','acknowledged'].includes(key)) ||
      value.version!==1 || !Number.isSafeInteger(value.startedAt) || value.startedAt<0 || value.startedAt>8640000000000000 || !validTimeZone(value.timeZone)) return false;
  return ['baselineIds','excludedIds','acknowledged'].every(key=>Array.isArray(value[key]) &&
    new Set(value[key]).size===value[key].length && value[key].every(id=>key==='acknowledged'?MILESTONES.some(m=>m.id===id):validId(id)));
}
export function initializeStats(state, now=Date.now(), timeZone=effectiveTimeZone(state)) {
  return {version:1,startedAt:now,timeZone:validTimeZone(timeZone)?timeZone:'UTC',
    baselineIds:[...new Set(rows(state.approved).map(row=>row.id).filter(validId))],
    excludedIds:[...new Set(validEvents(state,now).map(row=>row.id))],acknowledged:[]};
}
export function acknowledgeHistory(state, now=Date.now()) {
  if(state.stats)state.stats.acknowledged=[...new Set([...state.stats.acknowledged,...summarizeStats(state,{now}).milestones.filter(row=>row.unlocked).map(row=>row.id)])];
}
export function syncStatsTimeZone(state, now=Date.now()) {
  const timeZone=effectiveTimeZone(state);
  if (state.stats && state.stats.timeZone!==timeZone) {
    state.stats.timeZone=timeZone;
    acknowledgeHistory(state,now);
  }
}
export function summarizeStats(state, {now=Date.now(),period=7}={}) {
  period=period===30?30:7;
  const timeZone=effectiveTimeZone(state);
  const formatter=calendarFormatter(timeZone),today=dayNumber(now,formatter);
  const events=validEvents(state,now), first=new Map(), days=new Map();
  for (const row of events) {
    if (!first.has(row.id) || first.get(row.id).at>row.at) first.set(row.id,row);
    const day=dayNumber(row.at,formatter);
    if (!days.has(day)) days.set(day,new Set());
    days.get(day).add(row.id);
  }
  let streak=0, cursor=days.has(today)?today:today-1;
  while (days.has(cursor--)) streak++;
  let longestStreak=0,run=0,previous=-Infinity;
  for (const day of [...days.keys()].sort((a,b)=>a-b)) { run=day===previous+1?run+1:1;longestStreak=Math.max(longestStreak,run);previous=day; }
  const calendar=Array.from({length:period},(_,i)=>{const day=today-period+1+i;return {date:dateKey(day),count:days.get(day)?.size||0,today:day===today};});
  const domains=new Map();
  for (const row of first.values()) {
    const domain=typeof row.domain==='string'?row.domain.trim():'';
    if(domain && domain.toLowerCase()!=='custom')domains.set(domain,(domains.get(domain)||0)+1);
  }
  const snapshot=validStatsSnapshot(state?.stats)?state.stats:null;
  const excluded=new Set([...(snapshot?.baselineIds||[]),...(snapshot?.excludedIds||[])]);
  const growthIds=snapshot?[...new Set(events.filter(row=>row.at>=snapshot.startedAt && !excluded.has(row.id)).map(row=>row.id))]:[];
  const baseline=snapshot?.baselineIds.length||0;
  const milestones=MILESTONES.map(row=>({...row,value:row.metric==='total'?first.size:longestStreak,unlocked:(row.metric==='total'?first.size:longestStreak)>=row.target}));
  return {growth:{count:growthIds.length,ids:growthIds,baseline,percent:baseline?Math.round(growthIds.length/baseline*100):null,startedAt:snapshot?.startedAt??null},
    milestones,pending:snapshot && snapshot.timeZone===timeZone?milestones.filter(row=>row.unlocked && !snapshot.acknowledged.includes(row.id)).map(row=>row.id):[],total:first.size,streak,longestStreak,timeZone,today:dateKey(today),period,calendar,
    activeDays:calendar.filter(day=>day.count>0).length,dailyAverage:calendar.reduce((sum,day)=>sum+day.count,0)/period,
    domains:[...domains].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)),
    recent:[...first.values()].sort((a,b)=>b.at-a.at).slice(0,3)};
}
