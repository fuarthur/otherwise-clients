import {escapeHtml as escape} from './html.js';

const key = value => String(value ?? '').toLowerCase().replace(/[\s_\-\u2010-\u2015]+/gu,' ').trim();
const baseTitle = value => value.replace(/\s*\([^()]+\)$/u,'');

/** Local input choices only. No embeddings, recommendations, or invented senses. */
export function createInterestInput(catalog, asset) {
  if (!Array.isArray(catalog) || asset?.schemaVersion !== 1 || !Array.isArray(asset.senses)) throw new Error('Invalid interest input resources.');
  const byId = new Map(catalog.map(row => [row.id || row.topic, row]));
  const groups = [], owned = new Set();
  for (const sense of asset.senses) {
    if (typeof sense.id !== 'string' || typeof sense.label !== 'string' || typeof sense.description !== 'string' || !Array.isArray(sense.catalogIds) || !Array.isArray(sense.aliases) || sense.aliases.some(a=>typeof a!=='string')) throw new Error('Invalid interest meaning.');
    const catalogIds = sense.catalogIds.filter(id=>byId.has(id));
    if (catalogIds.length !== sense.catalogIds.length || catalogIds.some(id=>owned.has(id))) throw new Error('Interest meanings do not match the catalog.');
    catalogIds.forEach(id=>owned.add(id));
    groups.push({...sense,catalogIds,available:catalogIds.length>0});
  }
  for (const [id,row] of byId) {
    if (!owned.has(id)) groups.push({id:`catalog:${id}`,label:row.topic,description:row.description,catalogIds:[id],aliases:[row.topic,baseTitle(row.topic)],available:true});
  }
  const choices = new Map();
  for (const group of groups) {
    if (choices.has(group.id)) throw new Error('Duplicate interest meaning.');
    group.keys = [...new Set([group.label,...group.aliases, ...group.catalogIds.map(baseTitle)].map(key).filter(Boolean))];
    choices.set(group.id,group);
  }
  return {
    query(value, limit=6) {
      const phrase=key(value);
      if (!phrase) return {requiresChoice:false,choices:[]};
      const exact=[],prefix=[],inside=[];
      for (const group of groups) {
        if (group.keys.includes(phrase)) exact.push(group);
        else if (phrase.length>=2 && group.keys.some(alias=>alias.startsWith(phrase))) prefix.push(group);
        else if (phrase.length>=3 && group.keys.some(alias=>alias.includes(` ${phrase}`))) inside.push(group);
      }
      return {requiresChoice:exact.some(group=>group.available),choices:[...exact,...prefix,...inside].slice(0,limit)};
    },
    select(id, approved=[]) {
      const group=choices.get(id);
      if (!group?.available) return null;
      const existing=approved.find(row=>group.catalogIds.includes(row.id || row.topic));
      return {...byId.get(existing?.id || existing?.topic || group.catalogIds[0])};
    },
  };
}

const copy = {
  title:['Choose the meaning you intend','选择你想表达的含义'],
  suggestions:['Matching topics','匹配的主题'],
  confirm:['Check the description, then choose a topic. A matching name may mean something else.','请确认说明后选择主题。同一个名称可能有不同含义。'],
  other:['None of these? Add a few words to describe your interest.','都不是？请补充几个词，说明你的兴趣。'],
  missing:['Not in this catalog. Describe this interest in your own words.','当前目录未收录，请用自己的表述描述这个兴趣。'],
  custom:['Save your wording as a custom interest. Recommendation quality may vary.','将你的表述保存为自定义兴趣，推荐效果可能有所不同。'],
  loading:['Loading topic choices…','正在加载主题选项…'],
  failed:['Topic choices could not load. Retry before saving an interest.','无法加载主题选项，请重试后保存兴趣。'],
  retry:['Retry topic choices','重新加载主题选项'],
  saved:['Already saved','已保存'],
};
export const interestInputText = (language,name) => copy[name][language === 'zh-CN' ? 1 : 0];
export function interestInputView(index, value, {language='en', approved=[], pending=false, failed=false, submitted=false}={}) {
  const t=name=>interestInputText(language,name);
  if (!index) return `<p class="muted small" role="status">${t(failed?'failed':'loading')}</p>${failed?`<button type="button" data-action="retry-interest-input">${t('retry')}</button>`:''}`;
  if (!value.trim()) return '';
  const result=index.query(value), saved=new Set(approved.map(row=>row.id || row.topic));
  return `<div class="interest-input-choices"><p class="small${submitted && result.requiresChoice?' input-choice-required':''}" role="status">${t(result.requiresChoice?'confirm':result.choices.length?'suggestions':'custom')}</p>${result.choices.length?`<ul class="interest-choice-list" aria-label="${t('title')}">${result.choices.map((row,i)=>`<li>${row.available?`<button type="button" class="interest-choice" data-action="choose-interest" data-id="${escape(row.id)}" data-focus="interest-choice-${i}"${pending?' disabled':''}><strong>${escape(row.label)}</strong><span>${escape(row.description)}</span>${row.catalogIds.some(id=>saved.has(id))?`<small>${t('saved')}</small>`:''}</button>`:`<div class="interest-choice unavailable"><strong>${escape(row.label)}</strong><span>${escape(row.description)}</span><small>${t('missing')}</small></div>`}</li>`).join('')}</ul>`:''}${result.requiresChoice?`<p class="muted small">${t('other')}</p>`:''}</div>`;
}
