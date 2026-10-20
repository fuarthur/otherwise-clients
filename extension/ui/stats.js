import {summarizeStats} from '../core/stats.js';
import {icon} from './icons.js';
import {openDialog,closeDialog} from './dialog-motion.js';
import {escapeHtml as escape} from './html.js';
import {summarizeInterests} from './interest-overview.js';
const copy={
 title:['Your progress','探索足迹'],overview:['Overview','总览'],activity:['Activity','活动'],achievements:['Achievements','成就'],
 topics:['Topics explored','已探索主题'],growth:['Exploration growth','探索版图增长'],newTopics:['New topics','新探索主题'],since:['Since','起点'],
 streak:['Day streak','连续探索'],longest:['Longest streak','最长连续纪录'],days:['days','天'],daily:['Topics / day','日均探索主题'],active:['Active days','活跃天数'],
 explore:['Keep exploring','继续探索'],start:['Start exploring','开始探索'],empty:['Your first discovery starts here.','从第一次探索开始。'],setup:['Save an interest to find your first ideas.','保存一个兴趣，发现第一个新方向。'],
 topicUnit:['topics','个主题'],next:['Next milestone','下一里程碑'],complete:['All milestones reached','全部里程碑已达成'],first:['First step','第一步'],breadth:['New horizons','拓宽视野'],streakTrack:['Keep exploring','坚持探索'],
 unlocked:['Unlocked','已解锁'],locked:['In progress','进行中'],record:['Personal best','个人最佳'],domains:['Fields explored','探索领域'],recent:['First discoveries','最近新发现'],
 none:['Your discoveries will appear here.','你的探索将出现在这里。'],info:['How these numbers work','统计说明'],close:['Close','关闭'],
 range7:['7 days','7 天'],range30:['30 days','30 天'],period:['Activity period','活动周期'],today:['Today','今天'],
 earned:['Milestone unlocked','成就解锁'],all:['View milestones','查看里程碑'],
 fields:['Fields','领域'],topFields:['Top interest fields','兴趣最多的领域'],savedInterests:['Saved interests','已保存兴趣'],
 fieldShare:['Share of all saved interests','占全部兴趣的比例'],unclassified:['Unclassified','未分类'],noFields:['No classified interests yet.','还没有已分类的兴趣。'],
 fieldsLoading:['Loading fields…','正在加载领域…'],fieldsFailed:['Fields could not load.','无法加载领域。'],retryFields:['Retry fields','重新加载领域'],
 fieldsExplanation:['Fields count your currently saved interests, using each topic’s own catalog field. Percentages use all saved interests, including unclassified topics. Custom topics with a known field count in that field; other topics are unclassified. Top fields show up to three nonempty catalog fields. Selecting a field opens the Galaxy with that field highlighted; custom topics remain in View options.',
 '领域按当前已保存兴趣及各词条自带的大分类统计；百分比的分母包含全部兴趣，包括未分类词条。自定义词条有有效领域就计入对应领域，其余归入未分类。Top3 最多显示三个非空领域。点击领域可在星图中高亮该领域；自定义词条仍在「视图选项」列表中。'],
 explanation:[
 'An exploration means a Google or YouTube topic search opened through OtherWise. Each topic counts once per day; the daily average includes zero-activity days across the selected 7 or 30 days. A revisit can maintain your streak. Growth compares first-time topics since tracking began with the saved interests at that starting point; it does not measure expertise or semantic distance. Previously explored and imported-only topics are excluded from growth. With no starting interests, only a count is shown.',
 '探索指通过 OtherWise 成功打开主题的 Google 或 YouTube 搜索。同一主题每天只计一次；日均值按所选 7 或 30 天计算，包含没有探索的日期。重访旧主题也能延续连续纪录。版图增长是开始统计后的首次探索主题数，相对于起点已保存兴趣数的增长，不代表知识水平或语义距离。以前探索过的主题与仅由备份导入的主题不计入增长。起点没有兴趣时只显示数量。'],
 timezone:['Calendar timezone','统计时区'],baseline:['Starting interests','起点兴趣'],detail:['new topics / starting interests','新主题 / 起点兴趣'],
};
export function statsText(language,key){return copy[key]?.[language==='zh-CN'?1:0]??key;}
const tabs=['overview','activity','achievements','fields'];
export function createStatsUI({getState,getLanguage,getDomainCatalog=()=>({names:[]}),onChange,onExplore,onOpenField,onRetryFields}) {
 const params=new URLSearchParams(location.search);
 let tab=tabs.includes(params.get('stats'))?params.get('stats'):'overview',period=7,selectedDay=null;
 const t=key=>statsText(getLanguage(),key),e=key=>escape(t(key));
 const number=(value,digits=0)=>new Intl.NumberFormat(getLanguage(),{maximumFractionDigits:digits}).format(value);
 const date=(value,options={month:'short',day:'numeric'})=>new Intl.DateTimeFormat(getLanguage(),{...options,timeZone:'UTC'}).format(new Date(typeof value==='string'?`${value}T12:00:00Z`:value));
 const milestoneLabel=row=>`${row.target} ${row.track==='streak'?t('days'):row.target===1 && getLanguage()!=='zh-CN'?'topic':t('topicUnit')}`;
 function progress(row){return `<progress max="${row.target}" value="${Math.min(row.value,row.target)}" aria-label="${escape(milestoneLabel(row))}"></progress>`;}
 const interestSummary=()=>{const {names}=getDomainCatalog();return names?summarizeInterests(getState(),{domainNames:names}):null;};
 const share=(count,total)=>total?count/total*100:0;
 const percent=(count,total)=>new Intl.NumberFormat(getLanguage(),{style:'percent',maximumFractionDigits:1}).format(share(count,total)/100);
 function fieldRow(row,summary,bars=false){return `<li><button type="button" class="stats-field-row" data-stats-field="${escape(row.name)}" data-focus="stats-field-${escape(row.name)}"><span class="stats-field-name">${escape(row.name)}</span><span class="stats-field-metrics"><b data-stats-field-count>${number(row.count)}</b><span data-stats-field-share>${percent(row.count,summary.savedCount)}</span>${icon('chevron')}</span>${bars?`<span class="stats-field-bar" aria-hidden="true"><i style="width:${share(row.count,summary.savedCount)}%"></i></span>`:''}</button></li>`;}
 function fieldsStatus(){return `<p class="stats-empty" role="status">${e(getDomainCatalog().failed?'fieldsFailed':'fieldsLoading')}</p>${getDomainCatalog().failed?`<button type="button" data-stats-retry-fields data-focus="stats-retry-fields">${e('retryFields')}</button>`:''}`;}
 function topFields(summary){return `<section class="stats-top-fields" aria-labelledby="stats-top-fields-title"><h2 id="stats-top-fields-title">${e('topFields')}</h2>${summary?`${summary.domainCount?`<ul class="stats-field-list">${summary.domains.filter(row=>row.count>0).slice(0,3).map(row=>fieldRow(row,summary)).join('')}</ul><p class="stats-field-caption">${e('fieldShare')}</p>`:`<p class="stats-empty">${e('noFields')}</p>`}`:fieldsStatus()}</section>`;}
 function fields(summary){return summary?`<div class="stats-fields-heading"><h2>${e('savedInterests')}</h2><strong>${number(summary.savedCount)}</strong><p class="stats-field-caption">${e('fieldShare')}</p></div><ul class="stats-field-list stats-field-distribution">${summary.domains.map(row=>fieldRow(row,summary,true)).join('')}</ul>${summary.unclassifiedCount?`<div class="stats-unclassified" data-stats-unclassified><span>${e('unclassified')}</span><span class="stats-field-metrics"><b>${number(summary.unclassifiedCount)}</b> <span>${percent(summary.unclassifiedCount,summary.savedCount)}</span></span></div>`:''}`:fieldsStatus();}
 function overview(s,summary){
  const week=s.calendar.slice(-7),next=s.milestones.find(row=>!row.unlocked);
  return `<div class="stats-overview"><div class="stats-hero"><span class="stats-eyebrow">${e('topics')}</span><strong class="stats-total" data-stats-total>${number(s.total)}</strong><div class="stats-growth"><strong>${s.growth.percent===null?number(s.growth.count):`+${number(s.growth.percent)}%`}</strong><span>${e(s.growth.percent===null?'newTopics':'growth')}</span></div>${s.growth.startedAt!==null?`<span class="stats-date">${e('since')} ${new Intl.DateTimeFormat(getLanguage(),{year:'numeric',month:'short',day:'numeric',timeZone:s.timeZone}).format(s.growth.startedAt)}</span>`:''}</div>
  <div class="stats-habit"><div class="stats-streak-number"><span aria-hidden="true">✦</span><strong>${number(s.streak)}</strong><span>${e('streak')}</span></div><div class="stats-week">${week.map(day=>`<span class="stats-week-day${day.count?' is-active':''}${day.today?' is-today':''}" aria-label="${escape(`${date(day.date)} · ${day.count} ${t('topics')}`)}"><span>${date(day.date,{weekday:'narrow'})}</span><b aria-hidden="true">${day.count?'✓':'·'}</b></span>`).join('')}</div></div>
  ${topFields(summary)}
  <div class="stats-next"><div><span>${e(next?'next':'complete')}</span><strong>${next?escape(milestoneLabel(next)):'✦'}</strong></div>${next?progress(next):''}</div>
  ${!s.total?`<p class="stats-empty">${e(getState()?.approved?.length?'empty':'setup')}</p>`:''}<button type="button" class="primary stats-explore" data-stats-explore data-focus="stats-explore">${e(s.total?'explore':'start')}${icon('arrow')}</button></div>`;
 }
 function activity(s){
  const startDay=new Date(`${s.calendar[0].date}T12:00:00Z`).getUTCDay(),pad=(startDay+6)%7;
  const max=Math.max(1,...s.calendar.map(day=>day.count));
  const detail=s.calendar.find(day=>day.date===selectedDay)||s.calendar.at(-1);
  return `<div class="stats-period" role="group" aria-label="${e('period')}">${[7,30].map(value=>`<button type="button" data-stats-period="${value}" data-focus="stats-period-${value}" aria-pressed="${period===value}">${e(`range${value}`)}</button>`).join('')}</div><div class="stats-activity-metrics"><div><strong data-stats-average>${number(s.dailyAverage,1)}</strong><span>${e('daily')}</span></div><div><strong>${number(s.activeDays)}<small> / ${period}</small></strong><span>${e('active')}</span></div></div>
  <div class="stats-calendar" aria-label="${e('activity')}">${Array.from({length:7},(_,i)=>`<span class="stats-weekday">${date(`2026-10-${12+i}`,{weekday:'narrow'})}</span>`).join('')}${'<span aria-hidden="true"></span>'.repeat(pad)}${s.calendar.map(day=>`<button type="button" class="stats-day${day.today?' is-today':''}" data-stats-day="${day.date}" data-focus="stats-day-${day.date}" data-count="${day.count}" data-level="${day.count?Math.max(1,Math.ceil(day.count/max*3)):0}" aria-label="${escape(`${date(day.date)} · ${day.count} ${t('topics')}`)}"${day.today?' aria-current="date"':''}>${Number(day.date.slice(-2))}</button>`).join('')}</div>
  <p class="stats-calendar-detail" aria-live="polite">${detail.today?e('today'):date(detail.date)} · ${detail.count} ${e('topics')}</p><div class="stats-footprints"><div><h2>${e('domains')} <span>${s.domains.length}</span></h2>${s.domains.length?`<ul>${s.domains.slice(0,3).map(row=>`<li><span>${escape(row.name)}</span><b>${row.count}</b></li>`).join('')}</ul>`:`<p>${e('none')}</p>`}</div><div><h2>${e('recent')}</h2>${s.recent.length?`<ul>${s.recent.map(row=>`<li><span>${escape(row.topic||row.id)}</span></li>`).join('')}</ul>`:`<p>${e('none')}</p>`}</div></div>`;
 }
 function achievements(s){return `<div class="stats-record"><span>${e('record')}</span><strong>${number(s.longestStreak)} <small>${e('days')}</small></strong><span>${e('longest')}</span></div><div class="stats-tracks">${['first','breadth','streak'].map(track=>{
  const items=s.milestones.filter(row=>row.track===track),unlocked=items.filter(row=>row.unlocked).at(-1),next=items.find(row=>!row.unlocked),row=next||unlocked;
  return `<button type="button" class="stats-track${unlocked?' is-unlocked':''}" data-stats-track="${track}" data-focus="stats-track-${track}" aria-label="${escape(`${t(track==='streak'?'streakTrack':track)} · ${t('all')}`)}"><span class="stats-medal" aria-hidden="true">${unlocked?'✦':'◇'}</span><span class="stats-track-copy"><strong>${e(track==='streak'?'streakTrack':track)}</strong><span>${unlocked?`${e('unlocked')} · ${escape(milestoneLabel(unlocked))}`:e('locked')}</span>${next?`<span class="stats-track-target">${number(Math.min(row.value,row.target))} / ${number(row.target)}</span>${progress(row)}`:`<span>${e('complete')}</span>`}</span>${icon('chevron')}</button>`;
 }).join('')}</div>`;}
 function dialog(title,body){
  const node=document.createElement('dialog');node.className='stats-dialog';node.setAttribute('aria-labelledby','stats-dialog-title');
  node.innerHTML=`<h2 id="stats-dialog-title">${escape(title)}</h2>${body}<form method="dialog"><button class="primary" autofocus>${e('close')}</button></form>`;
  document.body.append(node);node.addEventListener('close',()=>node.remove(),{once:true});openDialog(node);
 }
 return {
  view(){const s=summarizeStats(getState(),{period}),summary=tab==='overview'||tab==='fields'?interestSummary():null;return `<section class="stats-page"><div class="stats-heading"><h1>${e('title')}</h1><button type="button" class="stats-info quiet" data-stats-info data-focus="stats-info" aria-label="${e('info')}">${icon('info')}</button></div><div class="stats-tabs" role="tablist" aria-label="${e('title')}">${tabs.map(id=>`<button type="button" role="tab" id="stats-tab-${id}" aria-selected="${tab===id}" tabindex="${tab===id?0:-1}" aria-controls="stats-panel" data-stats-tab="${id}" data-focus="stats-tab-${id}">${e(id)}</button>`).join('')}</div><div id="stats-panel" data-focus="stats-panel" role="tabpanel" tabindex="0" aria-labelledby="stats-tab-${tab}">${tab==='overview'?overview(s,summary):tab==='activity'?activity(s):tab==='fields'?fields(summary):achievements(s)}</div></section>`;},
  bind(root){
   const select=id=>{tab=id;const url=new URL(location.href);url.searchParams.set('stats',tab);history.replaceState(null,'',url);onChange();root.querySelector(`#stats-tab-${tab}`)?.focus({preventScroll:true});};
   root.querySelectorAll('[data-stats-tab]').forEach(button=>{
    button.addEventListener('click',()=>select(button.dataset.statsTab));
    button.addEventListener('keydown',event=>{let i=tabs.indexOf(tab);if(event.key==='ArrowRight')i=(i+1)%tabs.length;else if(event.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;else if(event.key==='Home')i=0;else if(event.key==='End')i=tabs.length-1;else return;event.preventDefault();select(tabs[i]);});
   });
   root.querySelectorAll('[data-stats-period]').forEach(button=>button.addEventListener('click',()=>{period=Number(button.dataset.statsPeriod);onChange();}));
   root.querySelector('[data-stats-explore]')?.addEventListener('click',onExplore);
   root.querySelectorAll('[data-stats-field]').forEach(button=>button.addEventListener('click',()=>onOpenField?.(button.dataset.statsField)));
   root.querySelector('[data-stats-retry-fields]')?.addEventListener('click',onRetryFields);
   root.querySelector('[data-stats-info]')?.addEventListener('click',()=>{
    const s=summarizeStats(getState(),{period});dialog(t('info'),`<p>${e('explanation')}</p><p>${e('fieldsExplanation')}</p><p>${e('timezone')}: ${escape(s.timeZone)}</p>${s.growth.startedAt!==null?`<p>${number(s.growth.count)} / ${number(s.growth.baseline)} · ${e('detail')}</p>`:''}`);
   });
   root.querySelectorAll('[data-stats-day]').forEach(button=>{
    const show=()=>{selectedDay=button.dataset.statsDay;root.querySelector('.stats-calendar-detail').textContent=`${date(button.dataset.statsDay)} · ${button.dataset.count} ${t('topics')}`;};
    for(const event of ['focus','pointerenter','click'])button.addEventListener(event,show);
   });
   root.querySelectorAll('[data-stats-track]').forEach(button=>button.addEventListener('click',()=>{
    const track=button.dataset.statsTrack,s=summarizeStats(getState());
    dialog(t(track==='streak'?'streakTrack':track),`<ul class="stats-tier-list">${s.milestones.filter(row=>row.track===track).map(row=>`<li><strong>${escape(milestoneLabel(row))}</strong><span>${e(row.unlocked?'unlocked':'locked')}</span>${progress(row)}</li>`).join('')}</ul>`);
   }));
  },
  reset(){tab='overview';period=7;selectedDay=null;const url=new URL(location.href);url.searchParams.delete('stats');history.replaceState(null,'',url);document.querySelectorAll('.stats-dialog').forEach(node=>closeDialog(node));},
  celebration(ids){const s=summarizeStats(getState()),row=s.milestones.filter(row=>ids.includes(row.id)).at(-1);return row?`${t('earned')} · ${milestoneLabel(row)}`:'';},
 };
}
