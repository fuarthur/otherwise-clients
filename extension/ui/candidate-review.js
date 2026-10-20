import {paginate} from './pagination.js';
import {candidateReviewLists} from '../core/candidate-draft.js';
import {escapeHtml as escape} from './html.js';
import {reviewText} from './candidate-review-i18n.js';

export function candidateReviewPage(items, page, desktop = false) {
  return paginate(items, page, desktop ? 8 : 5);
}

export function reviewPanelHeight(viewportHeight, panelTop) {
  return Math.max(260, Math.min(680, viewportHeight - panelTop - 28));
}

export function candidateDraftView(state,ui,{language='en',pending=false}={}) {
  const review=state.candidateReview,lists=candidateReviewLists(state.candidates,review);
  const t=(key,values)=>escape(reviewText(language,key,values));
  const button=(action,label,extra='',disabled=false)=>`<button type="button" data-review-action="${action}" data-focus="candidate-${action}:${extra.match(/data-(?:id|mode|domain)="([^"]*)"/)?.[1]||''}" ${extra}${disabled?' disabled':''}${pending?' aria-disabled="true"':''}>${label}</button>`;
  const support=row=>t('support',{pages:row.count,sites:row.siteCount??1});
  const empty=(title,help)=>`<div class="draft-empty"><h3>${t(title)}</h3><p class="muted">${t(help)}</p></div>`;
  const selected=new Set(review.selected);
  let content='';
  if(!state.candidates.length)content=empty('noCandidates','noCandidatesHelp');
  else if(ui.mode==='draft') {
    content=lists.draft.length?`<div class="draft-list">${lists.draft.map(row=>`<div class="draft-row">
      <div><strong>${escape(row.topic)}</strong><span class="muted small">${escape(row.domain)} · ${support(row)}</span></div>
      ${button('remove','×',`data-id="${escape(row.id)}" aria-label="${t('remove',{topic:row.topic})}"`)}</div>`).join('')}</div>`:empty('emptyDraft','emptyHelp');
    content+=`<div class="draft-secondary">${button('mode',t('groups'),'data-mode="groups"')}${button('mode',t('cards'),'data-mode="cards"')}</div>`;
  } else if(ui.mode==='groups') {
    const query=ui.query.trim().toLocaleLowerCase(),rows=lists.active.filter(row=>`${row.topic} ${row.domain}`.toLocaleLowerCase().includes(query));
    const groups=new Map();
    for(const row of rows){const domain=row.domain||'Other';if(!groups.has(domain))groups.set(domain,[]);groups.get(domain).push(row);}
    content=`<label class="sr-only" for="candidate-search">${t('search')}</label><input id="candidate-search" data-focus="candidate-search" type="search" placeholder="${t('search')}" value="${escape(ui.query)}" autocomplete="off">`;
    if(!groups.size)content+=`<p class="draft-empty muted">${t('noMatch')}</p>`;
    for(const [domain,items] of groups) {
      const count=items.filter(row=>selected.has(row.id)).length,limit=ui.limits[domain]||8;
      content+=`<section class="draft-category"><header><h3>${escape(domain)}</h3><span class="muted small">${t('selectedGroup',{selected:count,count:items.length})}</span></header>
      <div class="draft-category-control">${button('category',t(count===items.length?'clearGroup':'selectGroup'),`data-domain="${escape(domain)}"`)}</div>
      <div class="draft-chips">${items.slice(0,limit).map(row=>`<label class="draft-chip${selected.has(row.id)?' is-selected':''}"><input type="checkbox" data-review-candidate="${escape(row.id)}" data-focus="candidate-choice:${escape(row.id)}"${selected.has(row.id)?' checked':''}${pending?' aria-disabled="true"':''}><span>${escape(row.topic)}</span></label>`).join('')}</div>
      ${items.length>limit?button('more',t('more',{count:items.length-limit}),`data-domain="${escape(domain)}"`):''}</section>`;
    }
  } else {
    const row=lists.queue[0];
    content=row?`<div class="draft-card-area"><p class="muted small">${t('queue',{count:lists.queue.length})}</p>
      <div class="candidate-swipe-card" role="button" tabindex="${pending?-1:0}" data-review-card="${escape(row.id)}" data-focus="candidate-card" aria-label="${escape(row.topic)} · ${t('skip')}" aria-describedby="candidate-card-help" aria-disabled="${pending}">
      <p class="eyebrow">${escape(row.domain)}</p><h3>${escape(row.topic)}</h3>${row.description?`<p class="draft-card-description">${escape(row.description)}</p>`:''}<p class="muted small">${support(row)}</p><span class="draft-swipe-label" aria-hidden="true"></span></div>
      <div class="draft-card-actions">${button('ignore',t('ignore'),`data-id="${escape(row.id)}"`)}${button('skip',t('skip'),`data-id="${escape(row.id)}"`)}${button('select',t('add'),`data-id="${escape(row.id)}" class="primary"`)}</div>
      <p class="muted small" id="candidate-card-help">${t('cardHelp')}<br>${t('cardSwipe')}</p></div>`:
      `${empty('queueDone','queueDoneHelp')}<div class="draft-secondary">${button('mode',t('draftLink'),'data-mode="draft"')}${review.skipped.length?button('resume',t('resume')):''}</div>`;
  }
  if(lists.hidden.length)content+=`<details class="draft-folded" data-disclosure="candidate-background"${ui.backgroundOpen?' open':''}><summary>${t('folded',{count:lists.hidden.length})}</summary><p class="muted small">${t('foldedHelp')}</p>${lists.hidden.slice(0,ui.hiddenLimit).map(row=>`<div class="draft-background-row"><div><strong>${escape(row.topic)}</strong><span class="muted small">${t(review.ignored.includes(row.id)?'ignored':row.backgroundReason)}</span></div>${button('restore',t('restore'),`data-id="${escape(row.id)}"`)}</div>`).join('')}${lists.hidden.length>ui.hiddenLimit?button('more-hidden',t('more',{count:lists.hidden.length-ui.hiddenLimit})):''}</details>`;
  return `<section class="candidate-inbox review-workspace interest-draft-workspace" aria-label="${t('draft')}" aria-busy="${pending}">
    <header class="draft-heading"><div><h2>${t('draft')}</h2><p class="muted small">${t('help')}</p></div><span class="draft-unsaved" id="candidate-review-status" data-focus="candidate-review-status" tabindex="-1" role="status">${t('unsaved',{count:review.selected.length})}</span></header>
    <nav class="draft-modes" aria-label="${t('draft')}">${['draft','groups','cards'].map(mode=>button('mode',t(mode),`data-mode="${mode}" aria-pressed="${ui.mode===mode}"`)).join('')}</nav>
    <div class="candidate-list draft-body" data-page="${escape(ui.mode)}" tabindex="0">${content}</div>
    <footer class="review-footer draft-footer"><div class="draft-footer-tools">${button('undo',t('undo'),'',!review.undo)}${button('restart',t('restart'),'',!lists.active.length)}</div>
    <button type="button" class="primary" data-review-action="confirm" data-action="approve" data-focus="candidate-approve"${!review.selected.length||pending?' disabled':''}>${t('confirm',{count:review.selected.length})}</button></footer></section>`;
}

export function bindCandidateDraft(root,{state,ui,render,edit,confirm,pending=false}) {
  root.querySelectorAll('[data-review-action]').forEach(button=>button.addEventListener('click',async()=>{
    if(pending)return;
    const {reviewAction:action,id,mode,domain}=button.dataset;
    if(action==='mode'){ui.mode=mode;render();return;}
    if(action==='more'){ui.limits[domain]=(ui.limits[domain]||8)+16;render();return;}
    if(action==='more-hidden'){ui.hiddenLimit+=16;render();return;}
    if(action==='confirm'){await confirm();return;}
    if(action==='category') {
      const query=ui.query.trim().toLocaleLowerCase();
      const items=candidateReviewLists(state.candidates,state.candidateReview).active.filter(row=>(row.domain||'Other')===domain && `${row.topic} ${row.domain}`.toLocaleLowerCase().includes(query));
      await edit(items.every(row=>state.candidateReview.selected.includes(row.id))?'remove':'select',items.map(row=>row.id));return;
    }
    await edit(action,id?[id]:[]);
  }));
  root.querySelectorAll('[data-review-candidate]').forEach(input=>{
    input.addEventListener('click',event=>{if(pending)event.preventDefault();});
    input.addEventListener('change',()=>{if(!pending)void edit(input.checked?'select':'remove',[input.dataset.reviewCandidate]);});
  });
  const search=root.querySelector('#candidate-search');
  search?.addEventListener('compositionstart',()=>{ui.composing=true;});
  search?.addEventListener('compositionend',()=>{ui.composing=false;ui.query=search.value;render();});
  search?.addEventListener('input',event=>{ui.query=search.value;if(!event.isComposing && !ui.composing)render();});
  const folded=root.querySelector('.draft-folded');
  folded?.addEventListener('toggle',()=>{if(folded.isConnected)ui.backgroundOpen=folded.open;});
  const card=root.querySelector('[data-review-card]');
  if(!card || pending)return;
  const decide=operation=>edit(operation,[card.dataset.reviewCard]);
  card.addEventListener('keydown',event=>{
    if(event.isComposing || event.altKey || event.metaKey || event.ctrlKey)return;
    const operation={ArrowUp:'select',ArrowDown:'ignore',ArrowRight:'skip',Enter:'skip',' ':'skip'}[event.key];
    if(operation){event.preventDefault();void decide(operation);}
  });
  let origin=null,suppressClick=false;
  card.addEventListener('pointerdown',event=>{
    if(!event.isPrimary || event.button!==0)return;
    origin={x:event.clientX,y:event.clientY,id:event.pointerId};suppressClick=false;card.setPointerCapture(event.pointerId);
  });
  card.addEventListener('pointermove',event=>{
    if(!origin || event.pointerId!==origin.id)return;
    const dy=event.clientY-origin.y;
    card.style.transform=`translateY(${Math.max(-90,Math.min(90,dy))}px) rotate(${dy/40}deg)`;
    card.dataset.direction=dy<-40?'up':dy>40?'down':'';
    card.querySelector('.draft-swipe-label').textContent=Math.abs(dy)>40?reviewText(state.settings.language,dy<0?'add':'ignore'):'';
  });
  const reset=()=>{origin=null;card.style.transform='';card.dataset.direction='';card.querySelector('.draft-swipe-label').textContent='';};
  card.addEventListener('pointerup',event=>{
    if(!origin || event.pointerId!==origin.id)return;
    const dy=event.clientY-origin.y,dx=event.clientX-origin.x;
    suppressClick=Math.abs(dy)>8 || Math.abs(dx)>8;
    reset();
    if(Math.abs(dy)>60 && Math.abs(dy)>Math.abs(dx))void decide(dy<0?'select':'ignore');
  });
  card.addEventListener('pointercancel',()=>{suppressClick=true;reset();});
  card.addEventListener('lostpointercapture',()=>{if(origin)reset();});
  card.addEventListener('click',()=>{if(!suppressClick)void decide('skip');suppressClick=false;});
}
