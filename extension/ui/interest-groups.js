import {openDialog, closeDialog} from './dialog-motion.js';
import {icon} from './icons.js';

const copy = {
  title:['Interest groups','兴趣分组'],
  manage:['Manage interest groups','管理兴趣分组'],
  help:['Organize saved interests. An interest can belong to more than one group.','整理已保存的兴趣。同一个兴趣可以属于多个分组。'],
  all:['All interests','所有兴趣'], ungrouped:['Ungrouped','未分组'], browse:['Browse a group','浏览分组'],
  create:['New group','新建分组'], suggest:['Suggest groups','自动分组建议'], edit:['Edit group','编辑分组'],
  recommend:['Recommend from this group','根据此分组推荐'],
  noGroups:['Create a group, or preview automatic grouping suggestions. New saved interests stay ungrouped.','可以新建分组，或预览自动分组建议。新保存的兴趣会留在「未分组」中。'],
  emptyGroup:['Add interests to this group before requesting recommendations.','请先向此分组添加兴趣，再获取推荐。'],
  empty:['Empty','空分组'], interestCount:['{count} interests','{count} 个兴趣'],
  name:['Group name','分组名称'], nameHelp:['Up to 80 characters.','最多 80 个字符。'],
  nameError:['Enter a group name of 1–80 characters, without control characters.','请输入 1–80 个字符的分组名称，且不含控制字符。'],
  duplicateName:['A group with that name already exists. Choose another name.','已存在同名分组，请使用其他名称。'],
  members:['Group interests','分组兴趣'], search:['Search saved interests','搜索已保存的兴趣'],
  selected:['{count} selected','已选 {count} 个'], noInterests:['Save interests before asking for automatic groups.','请先保存兴趣，再获取自动分组建议。'],
  noMembers:['No saved interests yet. You can save an empty group.','还没有保存的兴趣。你可以先保存一个空分组。'],
  noMatches:['No matching interests.','没有匹配的兴趣。'], selectMatches:['Select matching interests','选择匹配的兴趣'],
  clearMatches:['Clear matching interests','取消选择匹配的兴趣'],
  previous:['Previous','上一页'], next:['Next','下一页'], range:['{start}–{end} of {total}','第 {start}–{end} 项，共 {total} 项'],
  pages:['Interest pages','兴趣分页'], groupPages:['Group pages','分组分页'],
  cancel:['Cancel','取消'], close:['Close','关闭'], save:['Save group','保存分组'], saving:['Saving…','正在保存…'],
  remove:['Delete group','删除分组'], removePrompt:['Delete this group? Your saved interests will stay.','要删除此分组吗？已保存的兴趣会保留。'],
  keep:['Keep group','保留分组'], failed:['Could not save this change. Please try again.','无法保存此修改，请重试。'],
  changed:['This group or profile changed in another window. Close and reopen the editor to review the latest version.','此分组或个人资料已在其他窗口中更改。请关闭并重新打开编辑器，查看最新内容。'],
  protected:['Editing an automatic group makes it a manual group. Future automatic suggestions will keep it.','修改自动分组后，它会成为手动分组。之后的自动分组建议会保留它。'],
  scopeTitle:['Recommendation interests','推荐使用的兴趣'], choose:['Choose groups','选择分组'],
  scopeHelp:['Selected groups use all their interests together. Recommendations can cross subject areas.','所选分组的兴趣会合并使用，推荐仍可跨越学科领域。'],
  scopeSave:['Use this selection','使用此选择'], scopeSearch:['Search groups','搜索分组'],
  noGroupMatches:['No matching groups.','没有匹配的分组。'],
  scopeEmpty:['Select a group with saved interests, or choose All interests.','请选择包含已保存兴趣的分组，或选择「所有兴趣」。'],
  noScopeGroups:['Create groups on the Interests page to choose a narrower scope.','请先在「兴趣」页面创建分组，再选择推荐范围。'],
  scopeSummary:['{groups} · {count} interests','{groups} · {count} 个兴趣'],
  moreGroups:['and {count} more groups','另有 {count} 个分组'],
  loadingTitle:['Suggest interest groups','获取兴趣分组建议'], loading:['Finding related interests…','正在查找相关的兴趣…'],
  loadingHelp:['You can close this window while the service works. No groups change until you apply the preview.','服务处理期间可以关闭此窗口。只有确认应用预览后，分组才会改变。'],
  previewTitle:['Review suggested groups','确认分组建议'],
  previewHelp:['Edit names or memberships before applying. Applying replaces previous automatic groups and preserves manual groups.','可以先修改名称或成员，再应用建议。应用时会更新之前的自动分组，并保留手动分组。'],
  edited:['Edited · kept as a manual group','已修改 · 将保留为手动分组'],
  automatic:['Automatic group','自动分组'],
  editMembers:['Edit interests','编辑兴趣'],
  moreMembers:['+{count} more','另有 {count} 个'], noSummary:['No interests selected.','未选择兴趣。'],
  apply:['Apply suggestions','应用分组建议'], applying:['Applying…','正在应用…'],
  reload:['Reload suggestions','重新获取建议'], retry:['Retry','重试'],
  suggestFailed:['Could not suggest groups. Check your service connection and retry.','无法获取分组建议。请检查服务连接后重试。'],
  stale:['Your saved interests, profile or connection changed. Reload suggestions before applying.','已保存的兴趣、个人资料或连接已更改。请重新获取建议后再应用。'],
  invalidSuggestions:['The service returned incomplete grouping suggestions. Please retry.','服务返回的分组建议不完整，请重试。'],
};

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
const validName = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80 && !/[\x00-\x1f\x7f]/.test(value);
const rowId = row => row?.id || row?.topic;
const approvedRows = state => [...new Map((Array.isArray(state?.approved) ? state.approved : []).filter(row => typeof rowId(row) === 'string').map(row => [rowId(row),row])).values()];
const groupsOf = state => Array.isArray(state?.interestGroups) ? state.interestGroups : [];
const idsOf = group => Array.isArray(group?.interestIds) ? group.interestIds : [];
const memberCount = (group, saved) => [...new Set(idsOf(group))].reduce((count,id) => count + Number(saved.has(id)),0);
const groupSignature = group => group && JSON.stringify([group.name,[...new Set(idsOf(group))].sort(),group.source || 'manual']);
const selectedScope = state => state?.recommendationGroupIds == null ? null : state.recommendationGroupIds;
const pageOf = (rows, page, size = 12) => {
  const total = rows.length, pages = Math.max(1,Math.ceil(total / size));
  page = Math.max(1,Math.min(pages,page));
  const offset = (page - 1) * size;
  return {items:rows.slice(offset,offset + size),total,page,pages,start:total ? offset + 1 : 0,end:Math.min(total,offset + size)};
};
const scopeMembers = (state, ids) => {
  const approved = approvedRows(state);
  if (ids == null) return approved;
  const selected = new Set(ids), members = new Set(groupsOf(state).filter(group => selected.has(group.id)).flatMap(idsOf));
  return approved.filter(row => members.has(rowId(row)));
};
let dialogSequence = 0;

/** Scoped controls own only data-group-* events; recommendation requests remain in the app. */
export function createInterestGroupsUI({getState,getLanguage = () => 'en',onFilter = () => {},onDispatch = async () => null,onScope = () => {},onRecommend = () => {},onSuggest = async () => {throw new Error('Unavailable');}}) {
  const bound = new WeakSet(), dialogs = new Set();
  let latestRoot;
  const text = (key, values = {}) => {
    const chinese = getLanguage() === 'zh-CN';
    let template = copy[key]?.[chinese ? 1 : 0] || key;
    if (!chinese && values.count === 1) template = template.replace('{count} interests','{count} interest');
    return template.replace(/\{(\w+)\}/g,(match,name) => Object.hasOwn(values,name) ? String(values[name]) : match);
  };
  const t = (key, values) => escape(text(key,values));
  // Generation also changes for unrelated recommendations. These fields identify the
  // actual inputs to semantic grouping without discarding previews after manual edits.
  const profileSignature = () => {const state = getState();return JSON.stringify([state?.salt,state?.settings?.endpoint,state?.settings?.accessToken,getLanguage()]);};
  const suggestionSignature = () => JSON.stringify([profileSignature(),approvedRows(getState()).map(rowId)]);
  const button = (action, label, extra = '') => `<button type="button" data-group-action="${action}" data-group-focus="group-${action}" data-focus="group-${action}"${extra}>${label}</button>`;

  function interestsView(activeGroup = 'all') {
    const state = getState(), approved = approvedRows(state), groups = groupsOf(state), saved = new Set(approved.map(rowId));
    const selected = groups.find(group => group.id === activeGroup);
    if (!selected && activeGroup !== 'ungrouped') activeGroup = 'all';
    const assigned = new Set(groups.flatMap(idsOf));
    const options = [['all',text('all'),approved.length],['ungrouped',text('ungrouped'),approved.filter(row => !assigned.has(rowId(row))).length],...groups.map(group => [group.id,group.name,memberCount(group,saved)])];
    const count = selected ? memberCount(selected,saved) : 0;
    return `<section class="interest-groups" aria-labelledby="interest-groups-title">
      <div class="interest-group-toolbar"><label class="interest-group-browse"><span class="sr-only" id="interest-groups-title">${t('title')} · ${t('browse')}</span><select data-group-filter data-group-focus="group-filter" data-focus="group-filter">${options.map(([id,name,total]) => `<option value="${escape(id)}"${id === activeGroup ? ' selected' : ''}>${escape(name)} · ${total}</option>`).join('')}</select></label>
      ${button('create','+',` class="interest-group-create" aria-label="${t('create')}" title="${t('create')}"`)}
      <details class="interest-group-tools" data-action-popover><summary data-focus="group-tools" aria-label="${t('manage')}" title="${t('manage')}">${icon('more')}</summary><div class="action-popover-panel" role="group" aria-label="${t('manage')}"><p class="popover-label">${t('title')}</p>${button('suggest',t('suggest'),approved.length ? '' : ' disabled')}${selected ? `${button('edit',t('edit'),` data-group-id="${escape(selected.id)}"`)}${button('recommend',t('recommend'),` data-group-id="${escape(selected.id)}"${count ? '' : ' disabled'}`)}` : ''}<p class="interest-group-help muted small">${t('help')}${groups.length ? '' : ` ${t('noGroups')}`}</p></div></details></div>
      ${selected && !count ? `<p class="interest-group-empty muted small">${t('emptyGroup')}</p>` : ''}
      <p class="interest-groups-status small" role="status" hidden></p>
    </section>`;
  }

  function discoverView() {
    const state = getState(), scope = selectedScope(state), groups = groupsOf(state);
    const selected = scope == null ? [] : groups.filter(group => scope.includes(group.id));
    const names = selected.slice(0,3).map(group => group.name);
    if (selected.length > 3) names.push(text('moreGroups',{count:selected.length - 3}));
    const count = scopeMembers(state,scope).length;
    const label = scope == null ? text('all') : names.join(' · ');
    return `<section class="interest-groups-scope" aria-labelledby="interest-group-scope-title"><div class="interest-group-scope-copy"><h3 id="interest-group-scope-title">${t('scopeTitle')}</h3><p class="interest-group-scope-summary" title="${t('scopeSummary',{groups:label || text('choose'),count})}">${t('scopeSummary',{groups:label || text('choose'),count})}</p>${scope == null || count ? '' : `<p class="interest-group-scope-warning small" role="status">${t('scopeEmpty')}</p>`}<p class="interest-groups-status small" role="status" hidden></p></div>${button('scope',t('choose'))}</section>`;
  }

  function restoreFocus(trigger) {
    const focusVisible = node => (node?.closest?.('details:not([open])')?.querySelector('summary') || node)?.focus();
    if (trigger?.isConnected) {focusVisible(trigger);return;}
    const doc = latestRoot?.ownerDocument;
    const key = trigger?.dataset?.groupFocus;
    const candidates = doc?.querySelectorAll('[data-group-focus]') || latestRoot?.querySelectorAll('[data-group-focus]') || [];
    const target = [...candidates].find(node => key && node.dataset.groupFocus === key && !node.disabled)
      || [...candidates].find(node => ['group-filter','group-create','group-scope'].includes(node.dataset.groupFocus) && !node.disabled);
    focusVisible(target);
  }

  function mount(title, html, trigger) {
    const doc = latestRoot?.ownerDocument || document, dialog = doc.createElement('dialog');
    const id = `interest-group-dialog-${++dialogSequence}`;
    dialog.className = 'interest-group-dialog'; dialog.setAttribute('aria-labelledby',id);
    dialog.innerHTML = `<div class="interest-group-dialog-heading"><h2 id="${id}">${t(title)}</h2><button type="button" class="quiet interest-group-close" data-group-action="close" aria-label="${t('close')}">×</button></div>${html}`;
    const record = {dialog,refresh() {},onClose() {}};
    dialogs.add(record);
    dialog.querySelector('[data-group-action="close"]').addEventListener('click',() => closeDialog(dialog));
    dialog.addEventListener('close',() => {record.onClose();dialogs.delete(record);dialog.remove();restoreFocus(trigger);},{once:true});
    doc.body.append(dialog); openDialog(dialog);
    return record;
  }

  function showError(dialog, key) {
    const node = dialog.querySelector('[data-group-error]');
    if (node) {node.textContent = text(key);node.hidden = false;}
  }
  function clearError(dialog) {const node = dialog.querySelector('[data-group-error]');if (node) node.hidden = true;}
  function inlineNotice(key) {
    const node = latestRoot?.querySelector?.('.interest-groups-status');
    if (node) {node.textContent = text(key);node.hidden = false;}
  }
  function pagination(result, label) {
    return `<div class="interest-group-pagination"><span class="muted small" role="status" aria-live="polite">${t('range',result)}</span><nav aria-label="${t(label)}"><button type="button" class="quiet" data-group-action="previous"${result.page === 1 ? ' disabled' : ''}>${t('previous')}</button><button type="button" class="quiet" data-group-action="next"${result.page === result.pages ? ' disabled' : ''}>${t('next')}</button></nav></div>`;
  }
  function preserveControlFocus(container) {
    const active = container.ownerDocument.activeElement;
    if (!container.contains(active)) return () => {};
    const key = ['groupMember','groupScopeId','groupAction'].find(name => typeof active.dataset?.[name] === 'string');
    const value = active.dataset?.[key];
    return () => {if (key) [...container.querySelectorAll('[data-group-member],[data-group-scope-id],[data-group-action]')].find(node => node.dataset[key] === value && !node.disabled)?.focus();};
  }
  function bindPagination(container, move) {
    for (const [action,delta] of [['previous',-1],['next',1]]) container.querySelector(`[data-group-action="${action}"]`)?.addEventListener('click',() => {
      move(delta);
      const target = container.querySelector(`[data-group-action="${action}"]:not(:disabled)`)
        || container.querySelector('[data-group-action="previous"]:not(:disabled),[data-group-action="next"]:not(:disabled)');
      target?.focus();
    });
  }

  function openEditor(trigger, {group = null,isFresh = () => true,onSave,onDelete} = {}) {
    const initialProfile = profileSignature(), original = groupSignature(group);
    const selected = new Set(idsOf(group)), helpId = `interest-group-name-help-${dialogSequence + 1}`;
    let query = '', page = 1, pending = false, changed = false, blocked = false;
    const record = mount(group ? 'edit' : 'create',`<form data-group-form novalidate>
      <label class="field"><span>${t('name')}</span><input data-group-name type="text" maxlength="80" value="${escape(group?.name || '')}" autocomplete="off" autofocus aria-describedby="${helpId}"><small id="${helpId}">${t('nameHelp')}</small></label>
      ${group?.source === 'semantic' ? `<p class="muted small interest-group-protection">${t('protected')}</p>` : ''}
      <fieldset class="interest-group-members"><legend>${t('members')} <span data-group-selected class="muted small"></span></legend><label class="interest-group-search"><span class="sr-only">${t('search')}</span><input data-group-search type="search" placeholder="${t('search')}" autocomplete="off"></label><div class="interest-groups-actions interest-group-selection-tools"><button type="button" class="quiet" data-group-action="select-matches">${t('selectMatches')}</button><button type="button" class="quiet" data-group-action="clear-matches">${t('clearMatches')}</button></div><div data-group-members-page></div></fieldset>
      <p data-group-error class="interest-group-error" role="alert" hidden></p>
      ${onDelete ? `<div class="interest-group-delete-confirm" data-group-delete-confirm hidden><p>${t('removePrompt')}</p><div class="interest-groups-actions"><button type="button" data-group-action="keep">${t('keep')}</button><button type="button" class="danger" data-group-action="confirm-delete">${t('remove')}</button></div></div>` : ''}
      <div class="dialog-actions">${onDelete ? `<button type="button" class="danger interest-group-delete" data-group-action="delete">${t('remove')}</button>` : ''}<button type="button" data-group-action="cancel">${t('cancel')}</button><button type="submit" class="primary" data-group-action="save">${t('save')}</button></div>
    </form>`,trigger);
    const {dialog} = record, form = dialog.querySelector('[data-group-form]');
    const nameInput = dialog.querySelector('[data-group-name]'), save = dialog.querySelector('[data-group-action="save"]');
    const currentRows = () => approvedRows(getState());
    const matchingRows = () => {const words = normalize(query).split(/\s+/).filter(Boolean);return currentRows().filter(row => words.every(word => normalize(row.topic || rowId(row)).includes(word)));};
    const fresh = () => initialProfile === profileSignature() && isFresh() && (!group?.id || groupSignature(groupsOf(getState()).find(row => row.id === group.id)) === original);
    function renderMembers() {
      const rows = currentRows(), matches = matchingRows(), result = pageOf(matches,page);
      page = result.page;
      dialog.querySelector('[data-group-selected]').textContent = text('selected',{count:rows.filter(row => selected.has(rowId(row))).length});
      const list = dialog.querySelector('[data-group-members-page]');
      const restore = preserveControlFocus(list);
      list.innerHTML = `${result.total ? `<ul class="interest-group-checklist">${result.items.map(row => `<li><label><input type="checkbox" data-group-member="${escape(rowId(row))}"${selected.has(rowId(row)) ? ' checked' : ''}><span class="interest-group-member-name">${escape(row.topic || rowId(row))}</span></label></li>`).join('')}</ul>${pagination(result,'pages')}` : `<p class="muted small" role="status">${t(rows.length ? 'noMatches' : 'noMembers')}</p>`}`;
      list.querySelectorAll('[data-group-member]').forEach(node => node.addEventListener('change',() => {
        changed = true;
        if (node.checked) selected.add(node.dataset.groupMember); else selected.delete(node.dataset.groupMember);
        dialog.querySelector('[data-group-selected]').textContent = text('selected',{count:currentRows().filter(row => selected.has(rowId(row))).length});
        clearError(dialog);
      }));
      bindPagination(list,delta => {page += delta;renderMembers();});
      dialog.querySelector('[data-group-action="select-matches"]').disabled = pending || blocked || !matches.length;
      dialog.querySelector('[data-group-action="clear-matches"]').disabled = pending || blocked || !matches.length;
      restore();
    }
    function busy(value) {
      pending = value;
      form.querySelectorAll('input,button').forEach(node => node.disabled = value);
      save.textContent = text(value ? 'saving' : 'save');
      if (!value) {save.disabled = blocked;renderMembers();}
    }
    function ensureFresh() {
      if (!fresh()) {blocked = true;showError(dialog,'changed');save.disabled = true;return false;}
      return true;
    }
    record.refresh = () => {if (!pending && dialog.open) {if (ensureFresh()) renderMembers();}};
    nameInput.addEventListener('input',() => {changed = true;if (!blocked) clearError(dialog);});
    dialog.querySelector('[data-group-search]').addEventListener('input',event => {query = event.target.value;page = 1;renderMembers();});
    for (const [action,choose] of [['select-matches',true],['clear-matches',false]]) dialog.querySelector(`[data-group-action="${action}"]`).addEventListener('click',() => {changed = true;matchingRows().forEach(row => choose ? selected.add(rowId(row)) : selected.delete(rowId(row)));renderMembers();});
    dialog.querySelector('[data-group-action="cancel"]').addEventListener('click',() => closeDialog(dialog));
    if (onDelete) {
      const confirm = dialog.querySelector('[data-group-delete-confirm]');
      dialog.querySelector('[data-group-action="delete"]').addEventListener('click',() => {confirm.hidden = false;confirm.querySelector('[data-group-action="keep"]').focus();});
      confirm.querySelector('[data-group-action="keep"]').addEventListener('click',() => {confirm.hidden = true;dialog.querySelector('[data-group-action="delete"]').focus();});
      confirm.querySelector('[data-group-action="confirm-delete"]').addEventListener('click',async () => {
        if (pending || !ensureFresh()) return;
        busy(true);
        try {if (await onDelete() === false) throw new Error('Failed');closeDialog(dialog);}
        catch {busy(false);showError(dialog,'failed');}
      });
    }
    form.addEventListener('submit',async event => {
      event.preventDefault();
      if (pending || !ensureFresh()) return;
      if (!validName(nameInput.value)) {showError(dialog,'nameError');nameInput.focus();return;}
      if ((!group || group.id) && groupsOf(getState()).some(row => row.id !== group?.id && normalize(row.name) === normalize(nameInput.value))) {showError(dialog,'duplicateName');nameInput.focus();return;}
      const value = {name:nameInput.value.trim(),interestIds:currentRows().map(rowId).filter(id => selected.has(id)),changed};
      busy(true);
      try {if (await onSave(value) === false) throw new Error('Failed');closeDialog(dialog);}
      catch {busy(false);showError(dialog,'failed');}
    });
    renderMembers(); nameInput.focus();
    return record;
  }

  function editStoredGroup(trigger, id = null) {
    const group = id ? groupsOf(getState()).find(row => row.id === id) : null;
    if (id && !group) {inlineNotice('changed');return;}
    openEditor(trigger,{group,
      onSave:async value => (await onDispatch({type:id ? 'UPDATE_INTEREST_GROUP' : 'CREATE_INTEREST_GROUP',...(id ? {id} : {}),name:value.name,interestIds:value.interestIds})) != null,
      onDelete:id ? async () => {const result = await onDispatch({type:'DELETE_INTEREST_GROUP',id});if (result == null) return false;onFilter('all');return true;} : null,
    });
  }

  function openScope(trigger) {
    const initialProfile = profileSignature();
    let selection = selectedScope(getState()) == null ? null : new Set(selectedScope(getState())), query = '', page = 1, pending = false;
    const record = mount('choose',`<form data-group-scope-form><p class="muted small">${t('scopeHelp')}</p><label class="interest-group-all"><input type="checkbox" data-group-all><strong>${t('all')}</strong></label><label class="interest-group-search"><span class="sr-only">${t('scopeSearch')}</span><input type="search" data-group-scope-search placeholder="${t('scopeSearch')}" autocomplete="off"></label><div data-group-scope-page></div><p class="small interest-group-scope-total" data-group-scope-total role="status" aria-live="polite"></p><p data-group-error class="interest-group-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" data-group-action="cancel">${t('cancel')}</button><button type="submit" class="primary" data-group-action="scope-save">${t('scopeSave')}</button></div></form>`,trigger);
    const {dialog} = record, all = dialog.querySelector('[data-group-all]');
    const count = () => scopeMembers(getState(),selection == null ? null : [...selection]).length;
    function summary() {all.checked = selection == null;dialog.querySelector('[data-group-scope-total]').textContent = text('interestCount',{count:count()});}
    function render() {
      const groups = groupsOf(getState()), saved = new Set(approvedRows(getState()).map(rowId));
      const result = pageOf(groups.filter(group => normalize(group.name).includes(normalize(query))),page);
      page = result.page;
      const list = dialog.querySelector('[data-group-scope-page]');
      const restore = preserveControlFocus(list);
      list.innerHTML = result.total ? `<ul class="interest-group-checklist">${result.items.map(group => {const count = memberCount(group,saved);return `<li><label><input type="checkbox" data-group-scope-id="${escape(group.id)}"${selection?.has(group.id) ? ' checked' : ''}><span><strong>${escape(group.name)}</strong><small class="muted">${t(count ? 'interestCount' : 'empty',{count})}</small></span></label></li>`;}).join('')}</ul>${pagination(result,'groupPages')}` : `<p class="muted small">${t(groups.length ? 'noGroupMatches' : 'noScopeGroups')}</p>`;
      list.querySelectorAll('[data-group-scope-id]').forEach(node => node.addEventListener('change',() => {selection ??= new Set();if (node.checked) selection.add(node.dataset.groupScopeId);else selection.delete(node.dataset.groupScopeId);summary();clearError(dialog);}));
      bindPagination(list,delta => {page += delta;render();});
      summary();restore();
    }
    all.addEventListener('change',() => {selection = all.checked ? null : new Set();render();clearError(dialog);});
    dialog.querySelector('[data-group-scope-search]').addEventListener('input',event => {query = event.target.value;page = 1;render();});
    dialog.querySelector('[data-group-action="cancel"]').addEventListener('click',() => closeDialog(dialog));
    record.refresh = () => {if (!pending && dialog.open) {if (initialProfile !== profileSignature()) {showError(dialog,'changed');dialog.querySelector('[data-group-action="scope-save"]').disabled = true;} else render();}};
    dialog.querySelector('[data-group-scope-form]').addEventListener('submit',async event => {
      event.preventDefault();
      if (pending) return;
      if (initialProfile !== profileSignature()) {showError(dialog,'changed');return;}
      const existing = new Set(groupsOf(getState()).map(group => group.id));
      const ids = selection == null ? null : [...selection].filter(id => existing.has(id));
      if (ids !== null && !scopeMembers(getState(),ids).length) {showError(dialog,'scopeEmpty');return;}
      pending = true;
      const save = dialog.querySelector('[data-group-action="scope-save"]');save.disabled = true;
      try {if (await onScope(ids) === null) throw new Error('Failed');closeDialog(dialog);}
      catch {pending = false;save.disabled = false;showError(dialog,'failed');}
    });
    render(); all.focus();
  }

  function openSuggestions(trigger) {
    if (!approvedRows(getState()).length) {inlineNotice('noInterests');return;}
    let phase = 'loading', drafts = [], page = 1, pending = false, stale = false, request = 0, signature = suggestionSignature(), errorKey = 'suggestFailed';
    const record = mount('loadingTitle','<div data-group-suggestions></div>',trigger), {dialog} = record;
    const content = dialog.querySelector('[data-group-suggestions]');
    const isFresh = () => !stale && signature === suggestionSignature();
    function invalidate() {
      if (phase === 'error' && stale) return;
      stale = true; pending = false; phase = 'error'; errorKey = 'stale'; request++;render();
    }
    record.onClose = () => {request++;};
    record.refresh = () => {if (!pending && !isFresh()) invalidate();};
    function summary(group) {
      const selected = new Set(group.interestIds), rows = approvedRows(getState()).filter(row => selected.has(rowId(row)));
      return rows.length ? `${rows.slice(0,3).map(row => escape(row.topic || rowId(row))).join(' · ')}${rows.length > 3 ? ` · ${t('moreMembers',{count:rows.length - 3})}` : ''}` : t('noSummary');
    }
    function render() {
      dialog.querySelector('h2').textContent = text(phase === 'preview' ? 'previewTitle' : 'loadingTitle');
      if (phase === 'loading') content.innerHTML = `<div class="interest-group-loading" role="status"><p>${t('loading')}</p><p class="muted small">${t('loadingHelp')}</p></div><div class="dialog-actions"><button type="button" data-group-action="cancel">${t('cancel')}</button></div>`;
      else if (phase === 'error') content.innerHTML = `<p data-group-error class="interest-group-error" role="alert">${t(errorKey)}</p><div class="dialog-actions"><button type="button" data-group-action="cancel">${t('cancel')}</button><button type="button" class="primary" data-group-action="retry">${t(stale ? 'reload' : 'retry')}</button></div>`;
      else {
        const result = pageOf(drafts.map((group,index) => ({group,index})),page,6);page = result.page;
        content.innerHTML = `<p class="muted small">${t('previewHelp')}</p><div class="interest-group-suggestion-list">${result.items.map(({group,index}) => `<article class="interest-group-suggestion"><label class="interest-group-suggestion-name"><span>${t('name')}</span><input type="text" maxlength="80" data-group-suggestion-name="${index}" value="${escape(group.name)}" autocomplete="off"></label><p class="muted small">${t('interestCount',{count:group.interestIds.length})}</p><p class="interest-group-suggestion-members small">${summary(group)}</p><div class="interest-group-suggestion-footer"><small class="muted" data-group-source="${index}">${t(group.source === 'manual' ? 'edited' : 'automatic')}</small><button type="button" data-group-action="suggest-edit" data-group-index="${index}" data-group-focus="group-suggest-edit-${index}">${t('editMembers')}</button></div></article>`).join('')}</div>${pagination(result,'groupPages')}<p data-group-error class="interest-group-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" data-group-action="reload">${t('reload')}</button><button type="button" data-group-action="cancel">${t('cancel')}</button><button type="button" class="primary" data-group-action="apply">${t(pending ? 'applying' : 'apply')}</button></div>`;
        content.querySelectorAll('[data-group-suggestion-name]').forEach(node => node.addEventListener('input',() => {const index = Number(node.dataset.groupSuggestionName);drafts[index].name = node.value;drafts[index].source = 'manual';content.querySelector(`[data-group-source="${index}"]`).textContent = text('edited');clearError(dialog);}));
        content.querySelectorAll('[data-group-action="suggest-edit"]').forEach(node => node.addEventListener('click',() => {
          if (!isFresh()) {invalidate();return;}
          const index = Number(node.dataset.groupIndex), group = drafts[index];
          openEditor(node,{group:{name:group.name,interestIds:group.interestIds},isFresh,
            onSave:async value => {if (!isFresh()) {invalidate();return false;}drafts[index] = {name:value.name,interestIds:value.interestIds,source:value.changed ? 'manual' : group.source};render();return true;},
          });
        }));
        bindPagination(content,delta => {page += delta;render();});
        content.querySelector('[data-group-action="reload"]').addEventListener('click',load);
        content.querySelector('[data-group-action="apply"]').addEventListener('click',async () => {
          if (pending) return;
          if (!isFresh()) {invalidate();return;}
          const invalid = drafts.findIndex(group => !validName(group.name));
          if (invalid !== -1) {page = Math.floor(invalid / 6) + 1;render();showError(dialog,'nameError');content.querySelector(`[data-group-suggestion-name="${invalid}"]`)?.focus();return;}
          const groups = drafts.map(group => ({name:group.name.trim(),interest_ids:[...group.interestIds],source:group.source}));
          pending = true;render();content.querySelectorAll('input,button').forEach(node => node.disabled = true);
          try {if (await onDispatch({type:'ADD_INTEREST_GROUPS',groups}) == null) throw new Error('Failed');closeDialog(dialog);}
          catch {pending = false;render();showError(dialog,'failed');}
        });
      }
      content.querySelector('[data-group-action="cancel"]').addEventListener('click',() => closeDialog(dialog));
      content.querySelector('[data-group-action="retry"]')?.addEventListener('click',load);
    }
    function validate(result) {
      const saved = new Set(approvedRows(getState()).map(rowId)), seen = new Set();
      if (!Array.isArray(result?.groups) || !result.groups.length) return null;
      const groups = [];
      for (const group of result.groups) {
        if (!validName(group?.name) || !Array.isArray(group?.interest_ids)) return null;
        for (const id of group.interest_ids) {if (!saved.has(id) || seen.has(id)) return null;seen.add(id);}
        groups.push({name:group.name.trim(),interestIds:[...group.interest_ids],source:'semantic'});
      }
      return seen.size === saved.size ? groups : null;
    }
    async function load() {
      if (pending) return;
      if (!approvedRows(getState()).length) {phase = 'error';errorKey = 'noInterests';render();return;}
      const token = ++request;signature = suggestionSignature();stale = false;phase = 'loading';render();
      try {
        const result = await onSuggest();
        if (!dialog.open || token !== request) return;
        if (!isFresh()) {invalidate();return;}
        const groups = validate(result);
        if (!groups) {phase = 'error';errorKey = 'invalidSuggestions';render();return;}
        drafts = groups;page = 1;phase = 'preview';render();
      } catch {
        if (!dialog.open || token !== request) return;
        if (!isFresh()) {invalidate();return;}
        phase = 'error';errorKey = 'suggestFailed';render();
      }
    }
    load();
  }

  function bind(root) {
    latestRoot = root;
    for (const record of [...dialogs]) record.refresh();
    root.querySelectorAll('[data-group-filter]').forEach(node => {
      if (bound.has(node)) return;bound.add(node);
      node.addEventListener('change',() => onFilter(node.value));
    });
    root.querySelectorAll('[data-group-action]').forEach(node => {
      if (bound.has(node)) return;bound.add(node);
      node.addEventListener('click',async event => {
        event.preventDefault();if (node.disabled) return;
        switch (node.dataset.groupAction) {
          case 'create': editStoredGroup(node);break;
          case 'edit': editStoredGroup(node,node.dataset.groupId);break;
          case 'suggest': openSuggestions(node);break;
          case 'scope': openScope(node);break;
          case 'recommend': {
            const id = node.dataset.groupId;
            if (!scopeMembers(getState(),[id]).length) {inlineNotice('emptyGroup');return;}
            try {await onRecommend([id]);} catch {inlineNotice('failed');}
            break;
          }
        }
      });
    });
  }
  return {interestsView,discoverView,bind};
}
