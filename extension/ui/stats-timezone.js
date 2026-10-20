import {effectiveTimeZone,reportingTimeZone} from '../core/stats.js';
import {translate} from './i18n.js';
import {escapeHtml as escape} from './html.js';

const supported=Intl.supportedValuesOf?.('timeZone') || ['America/Chicago','America/New_York','America/Los_Angeles','Europe/London','Asia/Shanghai','Asia/Tokyo','Australia/Sydney'];

export function createTimeZoneSettings({getState,getLanguage,onChange,onSave}) {
 let query='';
 const t=key=>escape(translate(getLanguage(),key));
 return {
  view(pending=false) {
   const state=getState(),automatic=state.settings.statsFollowSystemTimeZone!==false;
   const current=effectiveTimeZone(state),selected=state.settings.statsTimeZone;
   const zones=[...new Set(['UTC',...supported,selected,reportingTimeZone()])].filter(Boolean).sort();
   const matches=zones.filter(zone=>zone.replaceAll('_',' ').toLowerCase().includes(query.trim().replaceAll('_',' ').toLowerCase()));
   const disabled=pending?' disabled':'';
   return `<label class="toggle-row"><input id="stats-follow-system-timezone" type="checkbox" data-focus="stats-follow-system-timezone" aria-describedby="stats-timezone-help"${automatic?' checked':''}${disabled}><span><strong>${t('statsFollowSystemTimeZone')}</strong><small id="stats-timezone-help">${t('statsTimezoneHelp')}</small></span></label>
    <p class="muted small" data-stats-effective-timezone>${t('statsEffectiveTimeZone')}: <b>${escape(current)}</b></p>
    ${automatic?'':`<label class="field" for="stats-timezone-search"><span>${t('statsTimezoneSearch')}</span><input id="stats-timezone-search" type="search" data-focus="stats-timezone-search" value="${escape(query)}" placeholder="${t('statsTimezoneSearchHint')}" autocomplete="off" spellcheck="false"${disabled}></label>
    <label class="field" for="stats-timezone"><span>${t('statsManualTimeZone')}</span><select id="stats-timezone" data-focus="stats-timezone"${disabled}>${!matches.includes(selected)?`<option value="" selected disabled>${t(matches.length?'statsTimezoneChoose':'statsTimezoneNoMatches')}</option>`:''}${matches.map(zone=>`<option value="${escape(zone)}"${zone===selected?' selected':''}>${escape(zone.replaceAll('_',' '))}</option>`).join('')}</select></label>`}`;
  },
  bind(root) {
   root.querySelector('#stats-follow-system-timezone')?.addEventListener('change',event=>{
    query='';void onSave({statsFollowSystemTimeZone:event.target.checked});
   });
   const search=root.querySelector('#stats-timezone-search');
   search?.addEventListener('input',event=>{query=event.target.value;if(!event.isComposing)onChange();});
   search?.addEventListener('compositionend',event=>{query=event.target.value;onChange();});
   root.querySelector('#stats-timezone')?.addEventListener('change',event=>{
    query='';void onSave({statsFollowSystemTimeZone:false,statsTimeZone:event.target.value});
   });
  },
  reset(){query='';},
 };
}
