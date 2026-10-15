const copy = {
  title:['Hidden topics','已隐藏的主题'],
  help:['Restore topics to let them appear in future recommendations and browsing suggestions. Restoring does not save them as interests.','恢复后，主题可以再次出现在推荐和浏览建议中。恢复不会将其保存为兴趣。'],
  search:['Search hidden topics','搜索已隐藏的主题'],
  clearSearch:['Clear search','清除搜索'],
  restore:['Restore','恢复'],
  restoreTopic:['Restore {topic}','恢复「{topic}」'],
  empty:['No hidden topics.','还没有隐藏的主题。'],
  noMatches:['No hidden topics match your search.','没有符合搜索条件的已隐藏主题。'],
  count:['{count} hidden topics','已隐藏 {count} 个主题'],
  range:['{start}–{end} of {total}','第 {start}–{end} 个，共 {total} 个'],
  pagination:['Hidden topic pages','已隐藏主题分页'],
  previous:['Previous','上一页'],
  next:['Next','下一页'],
  hidden:['Hidden: {topic}','已隐藏「{topic}」'],
  undo:['Undo','撤销'],
  dismissUndo:['Dismiss undo message','关闭撤销提示'],
  restored:['Topic restored.','主题已恢复。'],
};

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120 && !/[\x00-\x1f\x7f]/.test(value);
const disabled = value => value ? ' disabled' : '';
const focusKey = id => `hidden-restore-${Array.from(id, char => char.codePointAt(0).toString(16)).join('-')}`;

export function hiddenText(language, key, values = {}) {
  const template = copy[key]?.[language === 'zh-CN' ? 1 : 0] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}

export function hiddenTopicsPage(state, {query = '', page = 1} = {}) {
  const hidden = [...new Set((Array.isArray(state?.suppressed) ? state.suppressed : []).filter(validId))];
  const search = typeof query === 'string' ? query.trim().normalize('NFKC').toLowerCase() : '';
  const matching = search ? hidden.filter(id => id.normalize('NFKC').toLowerCase().includes(search)) : hidden;
  const total = matching.length, pageCount = Math.max(1, Math.ceil(total / 10));
  page = Math.min(pageCount, Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1));
  const offset = (page - 1) * 10;
  return {items:matching.slice(offset, offset + 10), total, hiddenCount:hidden.length, page, pageCount,
    start:total ? offset + 1 : 0, end:Math.min(offset + 10, total)};
}

export function hiddenTopicsView(state, {language = 'en', query = '', page = 1, pending = false} = {}) {
  const t = (key, values) => escape(hiddenText(language, key, values));
  const result = hiddenTopicsPage(state, {query, page});
  return `<section class="section hidden-topics" aria-labelledby="hidden-topics-title">
    <div class="section-heading"><h2 id="hidden-topics-title" data-focus="hidden-topics-title" tabindex="-1">${t('title')}<span class="count" aria-label="${t('count',{count:result.hiddenCount})}">${result.hiddenCount}</span></h2></div>
    <p class="muted small">${t('help')}</p>
    ${result.hiddenCount ? `<label class="field hidden-topic-search" for="hidden-topic-search"><span>${t('search')}</span><input type="search" id="hidden-topic-search" data-focus="hidden-topic-search" value="${escape(typeof query === 'string' ? query : '')}" placeholder="${t('search')}" autocomplete="off" spellcheck="false"></label>
      ${result.total ? `<ul class="hidden-topic-list" data-page="${result.page}">${result.items.map(id => `<li class="hidden-topic-row"><span class="hidden-topic-name">${escape(id)}</span><button type="button" class="quiet" data-action="restore-hidden" data-id="${escape(id)}" data-focus="${focusKey(id)}" aria-label="${t('restoreTopic',{topic:id})}"${disabled(pending)}>${t('restore')}</button></li>`).join('')}</ul>` : `<p class="muted small" role="status">${t('noMatches')}</p><button type="button" class="quiet" data-action="hidden-clear-search" data-focus="hidden-clear-search">${t('clearSearch')}</button>`}
      <div class="hidden-topic-footer"><p class="muted small" data-focus="hidden-page-status" tabindex="-1" role="status" aria-live="polite">${t('range',result)}</p><nav class="hidden-topic-pagination" aria-label="${t('pagination')}"><button type="button" class="quiet" data-action="hidden-prev" data-focus="hidden-page-prev"${disabled(pending || result.page === 1)}>${t('previous')}</button><span aria-hidden="true">${result.page} / ${result.pageCount}</span><button type="button" class="quiet" data-action="hidden-next" data-focus="hidden-page-next"${disabled(pending || result.page === result.pageCount)}>${t('next')}</button></nav></div>` : `<p class="muted small" role="status">${t('empty')}</p>`}
  </section>`;
}

export function dismissUndoView(state, {language = 'en', pending = false} = {}) {
  const undo = state?.dismissalUndo;
  if (!undo || !validId(undo.id) || !/^[a-f\d]{64}$/.test(undo.token) || !state.suppressed?.includes(undo.id)) return '';
  const t = (key, values) => escape(hiddenText(language, key, values));
  return `<div class="dismissal-undo interest-undo"><span role="status">${t('hidden',{topic:undo.id})}</span><button type="button" class="quiet" data-action="undo-dismiss" data-token="${undo.token}" data-focus="undo-dismiss"${disabled(pending)}>${t('undo')}</button><button type="button" class="quiet interest-undo-dismiss" data-action="clear-dismiss-undo" data-token="${undo.token}" data-focus="clear-dismiss-undo" aria-label="${t('dismissUndo')}"${disabled(pending)}>×</button></div>`;
}
