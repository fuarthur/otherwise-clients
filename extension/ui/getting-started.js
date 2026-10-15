export function guideProgress(state, items = state?.recommendations || []) {
  const interest = state?.approved?.[0] || null;
  const searched = (state?.explored || []).find(row => items.some(topic => (topic.id || topic.topic) === row.id) && row.at >= (state?.recommendationBatch?.updatedAt ?? state?.lastUpdated ?? 0)) || null;
  const completed = [Boolean(interest), Boolean(interest && items.length), Boolean(interest && items.length && searched)];
  const incomplete = completed.indexOf(false);
  return {completed, step:incomplete < 0 ? 3 : incomplete, active:Boolean(state?.settings?.tutorialActive && !state.settings.tutorialSeen), interest, searched, count:items.length};
}

const attribute = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function gettingStartedGuide({text, view, step, progress = guideProgress(), busy, working, seen, error, requestError, connectionReady, empty, currentTopic}) {
  const disabled = busy ? ' disabled' : '';
  const button = (action, label, primary = true, extra = '', pending = false) => `<button type="button" class="${primary ? 'primary' : 'quiet'}" data-guide-action="${action}" data-focus="guide-${action}${action === 'search' ? `-${label}` : ''}"${extra}${busy || pending ? ' disabled' : ''}>${text(label)}</button>`;
  const task = ['save','ideas','search','complete'][step];
  let content = '', actions = '';
  if (step === 0) {
    content = progress.completed[0] ? `<p class="guide-success" role="status">${text('guideInterestReady',{topic:progress.interest.topic})}</p>` : `<div class="guide-examples"><p>${text('guideExamples')}</p>${['Photography','Gardening'].map(example => `<button type="button" data-guide-example="${example}" data-focus="guide-example-${example}"${disabled}>${example}</button>`).join('')}</div><p class="guide-expected">${text('guideExpected_save')}</p>`;
    actions = button(progress.completed[0] ? 'next' : 'focus-interest', progress.completed[0] ? 'guideSaveNext' : 'guideEnterInterest');
  } else if (step === 1) {
    content = progress.completed[1] ? `<p class="guide-success" role="status">${text('guideIdeasReady',{count:progress.count})}</p>` : `${!connectionReady ? `<p class="guide-connection">${text('guideConnectionHelp')}</p>` : ''}${requestError ? `<div class="guide-recovery" role="status"><p>${text('guideRequestError',{error:requestError})}</p><p>${text('guideRequestRecovery')}</p></div>` : ''}${empty ? `<p class="guide-empty" role="status">${text('guideEmptyIdeas')}</p>` : ''}<p class="guide-expected">${text('guideExpected_ideas')}</p>`;
    actions = !progress.completed[0] ? button('recover','guideBackToInterest') : progress.completed[1] ? button('next','guideChooseTopic') : view !== 'discover' ? button('resume','guideSaveNext') : !connectionReady ? button('connection','guideConnection') : button('request',working ? 'finding' : requestError || empty ? 'guideRetryIdeas' : 'findIdeas',true,'',working);
    if (connectionReady || progress.completed[1]) actions += button('connection','guideConnection',false);
  } else if (step === 2) {
    if (!progress.completed[1]) {
      content = `<p class="guide-recovery">${text('guideNeedIdeas')}</p>`;
      actions = button('recover',progress.completed[0] ? 'guideBackToIdeas' : 'guideBackToInterest');
    } else if (progress.completed[2]) {
      content = `<p class="guide-success" role="status">${text('guideSearchReady',{topic:progress.searched.topic})}</p>`;
      actions = button('next','guideSeeCompletion');
    } else {
      content = currentTopic ? `<p class="guide-selected">${text('guideSelectedTopic',{topic:currentTopic.topic})}</p>` : '';
      actions = view === 'discover' && currentTopic ? button('search','guideSearchGoogle',true,` data-provider="google" data-id="${attribute(currentTopic.id || currentTopic.topic)}"`,working) + button('search','guideSearchYouTube',false,` data-provider="youtube" data-id="${attribute(currentTopic.id || currentTopic.topic)}"`,working) : button('resume','guideChooseTopic');
      content += `<p class="guide-expected">${text('guideExpected_search')}</p>`;
    }
  } else {
    content = `<p class="guide-success" role="status">${text('guideSearchReady',{topic:progress.searched?.topic || ''})}</p><p class="guide-expected">${text('guideCompleteHint')}</p>`;
    actions = button('finish','guideContinue') + button('map','guideOpenMap',false);
  }
  return `<aside class="welcome-guide" id="welcome-guide" data-guide-step="${step}" aria-labelledby="guide-heading" aria-describedby="guide-body">
    <div class="guide-progress"><p class="eyebrow">${step === 3 ? text('guideCompleteLabel') : text('guideStep',{step:step+1,total:3})}</p></div>
    <ol class="guide-checklist">${['save','ideas','search'].map((name,index) => `<li${index === step ? ' aria-current="step"' : ''} class="${progress.completed[index] ? 'is-done' : ''}"><span class="guide-number" aria-hidden="true">${progress.completed[index] ? '✓' : index+1}</span><span>${text(`guideTask_${name}`)}</span>${progress.completed[index] ? `<span class="sr-only">${text('guideDone')}</span>` : ''}</li>`).join('')}</ol>
    <h2 id="guide-heading" data-focus="guide-heading" tabindex="-1">${text(`guideHeading_${task}`)}</h2><p id="guide-body">${text(`guideBody_${task}`)}</p>
    ${content}${error ? `<p role="alert">${text('guideSaveError')}</p>` : ''}
    <div class="guide-task-actions">${actions}</div><p class="guide-privacy muted small">${text('guidePrivacy')}</p>
    <div class="guide-actions">${button('skip',seen ? 'guideClose' : 'guideSkip',false)}${step > 0 && step < 3 ? button('back','guideBack',false) : ''}</div>
  </aside>`;
}
