import {createStatsUI} from './stats.js';
import {escapeHtml as escape} from './html.js';
import {createTimeZoneSettings} from './stats-timezone.js';
import {summarizeStats} from '../core/stats.js';
import {createInterestInput, interestInputView} from './interest-input.js';
import {hiddenText, hiddenTopicsView, hiddenTopicsPage, dismissUndoView} from './hidden-topics.js';
import {createInterestGroupsUI} from './interest-groups.js';
import {groupInterests,recommendationInterests} from '../core/interest-groups.js';
import {connectionStatusView} from './connection-status.js';
import {checkConnection, subscribeConnectionInvalidation, suggestInterestGroups} from '../bridge.js';
import {backupText, backupSettingsView, downloadBackup, readBackupFile, backupError, reviewBackup} from './backup.js';
import {GALAXY_LAYOUT_DEFAULTS, GALAXY_LAYOUT_BOUNDS, normalizeGalaxyLayoutOptions} from '../core/galaxy-layout-options.js';
import { getState, dispatch, importBackup, importHistory, recommend, search, subscribe, openDashboard, requestFocus, cancelFocus, subscribeFocusInvalidation, subscribeGalaxyLayoutInvalidation, requestGalaxyLayout, pollGalaxyLayout } from '../bridge.js';
import { normalizeLanguage, translate, translateError } from './i18n.js';
import { paginate, PAGE_SIZE, recommendationCursor } from './pagination.js';
import { icon } from './icons.js';
import {savedInterestPage, togglePageSelection} from './saved-interests.js';
import {reviewPanelHeight, candidateDraftView, bindCandidateDraft} from './candidate-review.js';
import {discoverySession} from './discovery-session.js';
import {summarizeInterests} from './interest-overview.js';
import { createMapWorkspace } from './map-workspace.js';
import { galaxyLoader } from './galaxy-data.js';
import { RECOMMENDATION_DEFAULTS, RECOMMENDATION_BOUNDS, normalizeRecommendationOptions } from '../core/recommendation-options.js';
import {discoveryControls, graphDetails, savedFeedbackView} from './discovery.js';
import {gettingStartedGuide, guideProgress} from './getting-started.js';
import {LOCAL_ENDPOINT, hasServiceConnection} from '../core/connection.js';
import {createSoundEffects} from './sound-effects.js';
import {createUIMotion} from './motion.js';
import {openDialog, closeDialog} from './dialog-motion.js';
import {attachActionPopovers} from './action-popovers.js';
import {createStatusFeedback} from './status-feedback.js';
import {THEMES,normalizeThemeId} from '../core/themes.js';
import {applyTheme} from './themes.js';
const VIEWS = ['interests', 'discover', 'map', 'stats', 'settings'];
const GUIDE_VIEWS = ['interests', 'discover', 'map'];
const INTEREST_TABS = ['saved', 'review'];

const app = document.querySelector('#app');
const motion = createUIMotion();
const statusFeedback = createStatusFeedback(app);
const params = new URLSearchParams(location.search);
const preview = params.get('preview') === '1';
const dashboard = document.body.classList.contains('dashboard');
const initialView = VIEWS.includes(params.get('view')) ? params.get('view') : 'discover';
const ui = {
  explorationReady: true, explorationAway: false,
  review: {mode:'draft',query:'',composing:false,limits:{},hiddenLimit:12,backgroundOpen:false},
  manualSubmitted:false, manualComposing:false, hiddenQuery:'', hiddenPage:1, hiddenComposing:false, connectionStatus:null,
  view: initialView, manual: '', days: '30', interestTab: params.get('interests') === 'review' ? 'review' : 'saved', reviewScroll: {page:'draft', top:0}, recommendationPage: 1,
  interestQuery: '', interestGroup: 'all', interestComposing: false, interestPage: 1, interestManaging: false, interestSelected: new Set(), interestExpanded: new Set(),
  discoveryBatch: null, recommendationBatchToken: null, topicScroll: null, browserScroll: null, interestScroll: null,
  galaxyView: null, settingsDraft: null, settingsDirty: false, settingsSaved: false,
  advancedOptionsOpen: false, openGalaxyLayout: false, openGalaxyDomain: null,
  recommendationId: null, recommendationIndex: 0, recommendationView: dashboard ? 'cards' : 'single',
  openSections: new Set(),
  feedbackOpen: false, feedbackPage: 1, guideOpen: false, guideError: false, guideChecked: false, guideAutomatic: false, guideStep: 0, guideReplay: false,
  pending: new Set(), expandedDescriptions: new Set(), error: null, announcement: '', loaded: false,
};
let interestInput = null, interestInputPromise = null, interestInputFailed = false;
const subjectDomains = {names:null,failed:false};
let subjectDomainsPromise;
let connectionSequence = 0, unsubscribeConnection;
let state = null;
let mapWorkspace;
let unsubscribeFocus;
let unsubscribeGalaxyLayout;
let galaxyAssets;
let galaxyLoading = false;
let galaxyError = false;
let unsubscribe;
let preferenceSequence = 0;
const soundEffects = createSoundEffects({
  getSettings: () => state?.settings,
  isCurrentFocus: id => ui.view === 'map' && mapWorkspace?.getViewState().view === 'focus' && mapWorkspace.getViewState().centerId === id,
});

const arr = value => Array.isArray(value) ? value : [];
const topicId = topic => topic?.id || topic?.topic || '';
const topicTitle = topic => topic?.topic || topic?.id || '';
const busy = key => ui.pending.has(key);
const disabled = value => value ? ' disabled' : '';
const checked = value => value ? ' checked' : '';
const getTopic = id => [...arr(state?.approved), ...discoveryItems(), ...arr(state?.explored), ...arr(state?.candidates)].find(topic => topicId(topic) === id);
const isApproved = id => arr(state?.approved).some(topic => topicId(topic) === id);
const language = () => normalizeLanguage(state?.settings?.language);
const t = (key, values) => translate(language(), key, values);
const text = (key, values) => escape(t(key, values));
const interestGroupsUI = createInterestGroupsUI({
  getState:()=>state,getLanguage:language,
  onFilter:id=>{ui.interestGroup=id;ui.interestPage=1;ui.interestSelected.clear();render();},
  onDispatch:async action=>{const next=await run('groups',()=>dispatch(action),'groupsSaved');return next && !next.lastError ? next : null;},
  onScope:async ids=>{const next=await run('groups',()=>dispatch({type:'SET_RECOMMENDATION_GROUPS',ids}),'groupScopeSaved');return next && !next.lastError ? next : null;},
  onRecommend:async ids=>{
    const next=await run('groups',()=>dispatch({type:'SET_RECOMMENDATION_GROUPS',ids,deferRefresh:true}));
    if(!next || next.lastError)return;
    navigate('discover');return run('recommend',recommend,'ideasReady');
  },
  onSuggest:suggestInterestGroups,
});
const statsUI = createStatsUI({getState:()=>state,getLanguage:language,getDomainCatalog:()=>subjectDomains,onChange:()=>render(),onRetryFields:()=>ensureSubjectDomains(true),
  onOpenField:domain=>{if(subjectDomains.names?.includes(domain)){ui.openGalaxyDomain=domain;navigate('map');}},
  onExplore:()=>navigate(state?.approved?.length?'discover':'interests')});
const timeZoneSettings = createTimeZoneSettings({getState:()=>state,getLanguage:language,onChange:()=>render(),onSave:patch=>run('stats-timezone',()=>dispatch({type:'SET_SETTINGS',patch}),'statsTimezoneSaved')});
let statsClaiming=false, statsDay=null, statsToastTimer, statsRefreshing=false;
async function maybeCelebrateStats() {
  if (!state?.stats || statsClaiming || document.visibilityState!=='visible') return;
  const summary=summarizeStats(state);
  if (!summary.pending.length) return;
  statsClaiming=true;
  const salt=state.salt,startedAt=state.stats.startedAt;
  try {
    const response=await dispatch({type:'CLAIM_STATS',salt,startedAt,ids:summary.pending});
    if (state.salt!==salt || state.stats?.startedAt!==startedAt || document.visibilityState!=='visible') return;
    const message=statsUI.celebration(response.statsCelebration||[]);
    if (!message) return;
    document.querySelector('.stats-celebration')?.remove();clearTimeout(statsToastTimer);
    const toast=document.createElement('div');toast.className='stats-celebration';toast.setAttribute('role','status');toast.textContent=`✦ ${message}`;document.body.append(toast);
    statsToastTimer=setTimeout(()=>toast.remove(),5000);
  } catch { /* A failed acknowledgement remains eligible on the next visible update. */ }
  finally {statsClaiming=false;}
}
async function refreshStatsDate() {
  if (!ui.loaded || document.visibilityState!=='visible') return;
  const summary=summarizeStats(state),day=`${summary.timeZone}:${summary.today}`;
  if(state.stats && state.stats.timeZone!==summary.timeZone){
    if(statsRefreshing)return;
    statsRefreshing=true;
    try {applyState(await getState());statsDay=day;}
    catch { /* Retry timezone acknowledgement on the next visible update. */ }
    finally {statsRefreshing=false;}
  } else if(['stats','settings'].includes(ui.view) && day!==statsDay){
    statsDay=day;render();
  }
  void maybeCelebrateStats();
}
const statsClock=setInterval(refreshStatsDate,30000);
window.addEventListener('focus',refreshStatsDate);
document.addEventListener('visibilitychange',refreshStatsDate);
const interestPage = () => savedInterestPage(groupInterests(state,ui.interestGroup), ui.interestQuery, ui.interestPage, dashboard);
const discoveryItems = () => arr(ui.discoveryBatch?.items ?? state?.recommendations);

function syncDiscoverySession(next) {
  const batch = discoverySession(ui.discoveryBatch, next, ui.view === 'discover');
  if (ui.view === 'discover' && (batch?.token ?? null) !== ui.recommendationBatchToken) {
    ui.recommendationPage = 1; ui.recommendationId = null; ui.recommendationIndex = 0;
    ui.recommendationBatchToken = batch?.token ?? null;
  }
  ui.discoveryBatch = batch;
}

function manualChoicesView() {
  return interestInputView(interestInput,ui.manual,{language:language(),approved:state?.approved || [],pending:busy('add'),failed:interestInputFailed,submitted:ui.manualSubmitted});
}
function updateManualChoices() {
  const host=app.querySelector('#manual-interest-choices'); if(!host)return;
  host.innerHTML=manualChoicesView();
  host.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',onAction));
}
async function ensureInterestInput(retry=false) {
  if(interestInput)return interestInput;
  if(retry){interestInputPromise=null;interestInputFailed=false;}
  if(!interestInputPromise) interestInputPromise=(async()=>{
    try {
      const responses=await Promise.all(['catalog.json','interest-input.json'].map(name=>fetch(new URL(`../${name}`,import.meta.url),{credentials:'omit',redirect:'error'})));
      if(responses.some(response=>!response.ok))throw new Error('Unavailable topic choices.');
      const [catalog,asset]=await Promise.all(responses.map(response=>response.json()));
      interestInput=createInterestInput(catalog,asset);interestInputFailed=false;
    } catch {interestInputFailed=true;}
    updateManualChoices();return interestInput;
  })();
  return interestInputPromise;
}
async function ensureSubjectDomains(retry=false) {
  if(subjectDomains.names)return;
  if(retry){subjectDomainsPromise=null;subjectDomains.failed=false;}
  if(!subjectDomainsPromise)subjectDomainsPromise=(async()=>{
    try {
      const response=await fetch(new URL('../subject-domains.json',import.meta.url),{credentials:'omit',redirect:'error'});
      if(!response.ok)throw new Error('Unavailable subject fields.');
      const names=await response.json();
      if(!Array.isArray(names)||!names.length||names.some(name=>typeof name!=='string'||!name.trim())||new Set(names).size!==names.length)throw new Error('Invalid subject fields.');
      subjectDomains.names=names;subjectDomains.failed=false;
    } catch {subjectDomains.failed=true;}
    if(ui.view==='stats')render();
  })();
  return subjectDomainsPromise;
}
async function saveManualInterest(topic) {
  const input=ui.manual.trim();
  const next=await run('add',()=>dispatch({type:'ADD_INTEREST',topic}),'interestSaved',{sound:true});
  if(next && !next.lastError && ui.manual.trim()===input){ui.manual='';ui.manualSubmitted=false;render();app.querySelector('#manual-interest')?.focus();}
}
function connectionDraftChanged() {
  return Boolean(ui.settingsDraft && (ui.settingsDraft.endpoint!==state.settings.endpoint || ui.settingsDraft.accessToken!==state.settings.accessToken));
}
function clearConnectionStatus(redraw=true) {
  connectionSequence++;ui.connectionStatus=null;ui.pending.delete('connection');if(redraw && ui.loaded)render();
}
async function testSavedConnection() {
  if(busy('connection') || connectionDraftChanged())return;
  const request=++connectionSequence;ui.pending.add('connection');ui.connectionStatus=null;render();
  try {const result=await checkConnection();if(request===connectionSequence)ui.connectionStatus=result?.status==='invalidated'?null:result;}
  catch {if(request===connectionSequence)ui.connectionStatus={status:'unreachable'};}
  finally {if(request===connectionSequence){ui.pending.delete('connection');render();}}
}

function snapshotSettings() {
  const settings = state?.settings || {};
  return {
    endpoint: settings.endpoint || LOCAL_ENDPOINT, accessToken: settings.accessToken || '',
    blockedDomains: arr(settings.blockedDomains).join('\n'),
    recommendationOptions: normalizeRecommendationOptions(settings.recommendationOptions),
    galaxyLayoutOptions: normalizeGalaxyLayoutOptions(settings.galaxyLayoutOptions),
    galaxyShowDomainLabels: settings.galaxyShowDomainLabels !== false, galaxyShowInterestLabels: settings.galaxyShowInterestLabels !== false,
  };
}

function applyState(next) {
  if (!next || typeof next !== 'object') return;
  applyTheme(next.settings?.theme);
  if (state && (state.salt !== next.salt || state.settings.language !== next.settings.language)) statusFeedback.clear();
  if (state && (state.salt !== next.salt || state.settings.endpoint !== next.settings.endpoint || state.settings.accessToken !== next.settings.accessToken)) clearConnectionStatus(false);
  syncDiscoverySession(next);
  if (state?.salt && state.salt !== next.salt) {
    ui.explorationReady = true; ui.explorationAway = false;
    soundEffects.reset(); statsUI.reset(); timeZoneSettings.reset(); document.querySelector('.stats-celebration')?.remove();
    mapWorkspace?.destroy(); mapWorkspace = null; ui.galaxyView = null; ui.openGalaxyDomain = null;
    ui.feedbackPage = 1; ui.feedbackOpen = false; ui.guideChecked = false;
    ui.recommendationId = null; ui.recommendationIndex = 0;
    ui.hiddenQuery = ''; ui.hiddenPage = 1; ui.manualSubmitted = false;
    ui.interestComposing = false; ui.interestQuery = ''; ui.interestGroup = 'all'; ui.interestPage = 1; ui.interestManaging = false;
    ui.interestSelected.clear(); ui.interestExpanded.clear();
    ui.interestTab = 'saved'; ui.reviewScroll = {page:'draft', top:0};
    ui.review = {mode:'draft',query:'',composing:false,limits:{},hiddenLimit:12,backgroundOpen:false};
    const url = new URL(location.href); url.searchParams.delete('interests'); history.replaceState(null, '', url);
  }
  state = next;
  if (!['all','ungrouped'].includes(ui.interestGroup) && !state.interestGroups?.some(group=>group.id===ui.interestGroup)) ui.interestGroup='all';
  soundEffects.syncSettings();
  ui.loaded = true;
  if (!ui.guideChecked) {
    ui.guideChecked = true;
    const progress = guideProgress(state);
    ui.guideOpen = !preview && progress.active;
    ui.guideAutomatic = ui.guideOpen; ui.guideError = false;
    ui.guideReplay = false;
    ui.guideStep = progress.step;
    if (ui.guideOpen && ui.view !== 'settings') {
      ui.view = progress.step === 0 ? 'interests' : 'discover';
      const url = new URL(location.href); url.searchParams.set('view', ui.view); history.replaceState(null, '', url);
      syncDiscoverySession(state);
    }
  } else if (ui.guideAutomatic && state.settings.tutorialSeen) {
    ui.guideOpen = false; ui.guideAutomatic = false;
  }
  const progress = guideProgress(state, discoveryItems());
  if (ui.guideOpen && ui.guideStep === 2 && progress.completed[2]) ui.guideStep = 3;
  if (ui.guideOpen && ui.guideStep === 3 && progress.step < 3) ui.guideStep = progress.step;
  const interests = new Set(arr(state.approved).map(topicId));
  ui.interestSelected = new Set([...ui.interestSelected].filter(id => interests.has(id)));
  ui.interestExpanded = new Set([...ui.interestExpanded].filter(id => interests.has(id)));
  ui.interestPage = interestPage().page;
  ui.recommendationPage = paginate(discoveryItems(), ui.recommendationPage).page;
  if (!ui.settingsDirty) ui.settingsDraft = snapshotSettings();
  render();
  queueMicrotask(maybeCelebrateStats);
}

async function run(key, operation, announcement, {sound = false, data} = {}) {
  if (busy(key)) return;
  const before = state, origin = ui.view, beforeBatch = ui.recommendationBatchToken, actionToken = soundEffects.captureAction();
  let savedId, completed = false;
  ui.pending.add(key);
  ui.error = null;
  statusFeedback.clear();
  render();
  try {
    const next = await operation();
    completed = Boolean(next && !next.lastError);
    if (next) applyState(next);
    if (announcement && !next?.lastError) ui.announcement = announcement;
    if (sound && next && ui.view === origin) {
      if (!next.lastError && before?.salt === next.salt) {
        const previousIds = new Set(arr(before.approved).map(topicId));
        savedId = arr(next.approved).find(topic => !previousIds.has(topicId(topic)))?.id;
      }
      void soundEffects.saved(before, next, {data, actionToken, mapVisible: ui.view === 'map' && mapWorkspace?.getViewState().view === 'galaxy'}).catch(() => {});
    }
    return next;
  } catch (error) {
    ui.error = error?.message || 'Something went wrong. Please try again.';
  } finally {
    ui.pending.delete(key);
    render();
    if (completed && ui.view === origin && before?.salt === state?.salt
      && ['interestSaved','selectedSaved','settingsSaved','importReady'].includes(announcement)) statusFeedback.show(t(announcement));
    if (savedId && ui.view === origin && isApproved(savedId)) {
      const detail = [...app.querySelectorAll('.topic-detail')].find(element => element.dataset.topicId === savedId);
      motion.saved(detail?.querySelector('.saved-label'));
    }
    if (key === 'recommend' && completed && ui.recommendationBatchToken !== beforeBatch && ui.view === origin && ui.view === 'discover') motion.results(app);
  }
}

function languageSelect(id) {
  return `<label class="language-control" for="${id}"><span>Language / 语言</span><select id="${id}" data-language data-focus="${id}" aria-label="Language / 语言"><option value="en"${language() === 'en' ? ' selected' : ''}>English</option><option value="zh-CN"${language() === 'zh-CN' ? ' selected' : ''}>简体中文</option></select></label>`;
}

function render({transition = false} = {}) {
  // Keep the live input connected while an IME owns its composition.
  if (ui.interestComposing && document.activeElement?.id === 'saved-interest-search') return;
  if (ui.review.composing && document.activeElement?.id === 'candidate-search') return;
  const previousNavigation = transition ? motion.captureNavigation(app) : null;
  motion.cancel();
  ui.interestComposing = false;
  document.querySelector('.interest-overview-dialog')?.close();
  const discoverPage = app.querySelector('.discover-page');
  const previousCopy = discoverPage?.querySelector('.topic-detail-copy');
  const discoverPosition = discoverPage ? {top:discoverPage.scrollTop,
    id:previousCopy?.closest('.topic-detail').dataset.topicId,
    token:previousCopy?.closest('.topic-detail').dataset.batch,
    copyTop:previousCopy ? previousCopy.getBoundingClientRect().top - discoverPage.getBoundingClientRect().top : null} : null;
  const detailCopy = app.querySelector('.topic-detail-copy');
  if (detailCopy) ui.topicScroll = {id:detailCopy.closest('.topic-detail').dataset.topicId, token:detailCopy.closest('.topic-detail').dataset.batch, top:detailCopy.scrollTop};
  const browserList = app.querySelector('.topic-list');
  if (browserList) ui.browserScroll = {page:Number(browserList.dataset.page), token:browserList.dataset.batch, top:browserList.scrollTop};
  const savedList = app.querySelector('.saved-interest-list');
  if (savedList) ui.interestScroll = {page:Number(savedList.dataset.page), query:savedList.dataset.query, top:savedList.scrollTop};
  const guideVisible = ui.loaded && ui.guideOpen && GUIDE_VIEWS.includes(ui.view);
  const reviewList = app.querySelector('.candidate-list');
  if (reviewList) ui.reviewScroll = {page:reviewList.dataset.page, top:reviewList.scrollTop};
  const focused = document.activeElement;
  const focusKey = focused?.dataset?.focus;
  const selection = focused && 'selectionStart' in focused ? [focused.selectionStart, focused.selectionEnd] : null;
  const recommendationIds = new Set(discoveryItems().map(topicId));
  ui.expandedDescriptions = new Set([...ui.expandedDescriptions].filter(id => recommendationIds.has(id)));
  // Native toggle events are queued; capture the live state before replacing the DOM.
  app.querySelectorAll('[data-description]').forEach(details => {
    const id = details.dataset.description;
    if (!details.isConnected || !recommendationIds.has(id)) return;
    details.open ? ui.expandedDescriptions.add(id) : ui.expandedDescriptions.delete(id);
  });
  const advancedOptions = app.querySelector('#recommendation-advanced');
  if (advancedOptions?.isConnected) ui.advancedOptionsOpen = advancedOptions.open;
  app.querySelectorAll('[data-disclosure]').forEach(details => {
    details.open ? ui.openSections.add(details.dataset.disclosure) : ui.openSections.delete(details.dataset.disclosure);
  });
  // Keeping the connected ancestor chain preserves browser fullscreen during state updates.
  const mountedMapContainer = app.querySelector('#galaxy-container');
  const retainMap = ui.view === 'map' && ui.loaded && !galaxyError && Boolean(mountedMapContainer && mapWorkspace?.element.isConnected && mapWorkspace.element.parentElement === mountedMapContainer);
  if (mapWorkspace) { mapWorkspace.setActive(ui.view === 'map'); if (!retainMap) mapWorkspace.element.remove(); }
  if(ui.loaded && ui.view==='stats')void ensureSubjectDomains();
  const error = ui.error || state?.lastError;
  document.documentElement.lang = language();
  document.title = t('title');
  app.setAttribute('aria-busy', String(!ui.loaded));
  const shell = `<div class="app-shell">
    <header class="app-header"><span class="brand">OtherWise<span class="brand-star" aria-hidden="true">✦</span></span>
      <div class="header-tools"><span class="connection-label${error ? ' has-error' : ''}">${text(!ui.loaded ? 'opening' : error ? 'attention' : preview ? 'demo' : 'local')}</span><button type="button" class="settings-button quiet" data-action="view" data-view="settings" data-focus="nav-settings" aria-label="${text('settings')}"${ui.view === 'settings' ? ' aria-current="page"' : ''}>${icon('settings')}</button></div>
    </header>
    <div class="workspace"><nav class="main-nav" aria-label="${text('mainNavigation')}"><span class="main-nav-indicator" aria-hidden="true"></span>${['discover','interests','map','stats'].map(view => `<button type="button" data-action="view" data-view="${view}" data-focus="nav-${view}"${ui.view === view ? ' aria-current="page"' : ''}>${icon({discover:'compass',interests:'bookmark',map:'orbit',stats:'stats'}[view])}<span>${text(view)}</span></button>`).join('')}${!dashboard ? `<button type="button" class="dashboard-link" data-action="open-dashboard" aria-label="${text('openDashboard')}" title="${text('openDashboard')}"><span>${text('openDashboard')}</span><span aria-hidden="true" class="dashboard-arrow">↗</span></button>` : ''}<div class="nav-footer">${icon('shield')}<span>${text('local')}</span></div></nav><div class="workspace-content">
    ${preview ? `<details class="demo-notice"><summary>${text('demo')}</summary><p>${text('demoNotice')}</p></details>` : ''}
    ${error ? `<div class="error-banner" role="alert"><p><strong>${text('errorHeading')}</strong><br>${escape(translateError(language(), error))}</p><button type="button" class="quiet" data-action="clear-error" aria-label="${text('dismissError')}">×</button></div>` : ''}
    ${ui.loaded ? dismissUndoView(state,{language:language(),pending:busy('hidden')}) : ''}
    ${ui.loaded && ui.guideOpen && ui.view === 'settings' ? `<div class="guide-resume"><p>${text('guideResumeHelp')}</p><button type="button" data-guide-action="resume" data-focus="guide-resume">${text('guideResume')}</button></div>` : ''}
    <div class="page-layout${guideVisible ? ' has-guide' : ''}"><main id="main-view">${!ui.loaded ? loadingView() : ui.view === 'settings' ? settingsView() : ui.view === 'map' ? mapView() : ui.view === 'interests' ? interestsView() : ui.view === 'stats' ? statsUI.view() : discoverView()}</main>
    ${guideVisible ? gettingStartedGuide({text,view:ui.view,step:ui.guideStep,progress:guideProgress(state,discoveryItems()),busy:busy('guide'),working:busy('recommend') || busy(`search:${ui.recommendationId}:google`) || busy(`search:${ui.recommendationId}:youtube`),seen:ui.guideReplay,error:ui.guideError,requestError:error ? translateError(language(),error) : null,connectionReady:hasServiceConnection(state.settings),empty:state.lastUpdated != null && !discoveryItems().length,currentTopic:recommendationCursor(discoveryItems(),ui.recommendationId,ui.recommendationIndex).topic}) : ''}</div>
    </div></div>
    <div class="sr-only" role="status" aria-live="polite">${ui.announcement ? text(ui.announcement) : ''}</div>
  </div>`;
  if (retainMap) refreshMapShell(shell); else app.innerHTML = shell;
  bindEvents();
  if (ui.view === 'stats') statsUI.bind(app);
  statusFeedback.bind();
  fitReviewPanel();
  const nextCopy = app.querySelector('.topic-detail-copy');
  if (nextCopy && nextCopy.closest('.topic-detail').dataset.topicId === ui.topicScroll?.id && nextCopy.closest('.topic-detail').dataset.batch === ui.topicScroll.token) nextCopy.scrollTop = ui.topicScroll.top;
  const nextDiscoverPage = app.querySelector('.discover-page');
  if (nextDiscoverPage && discoverPosition) {
    const sameTopic = nextCopy && nextCopy.closest('.topic-detail').dataset.topicId === discoverPosition.id && nextCopy.closest('.topic-detail').dataset.batch === discoverPosition.token;
    nextDiscoverPage.scrollTop = sameTopic && discoverPosition.top > 0 && discoverPosition.copyTop !== null
      ? nextCopy.getBoundingClientRect().top - nextDiscoverPage.getBoundingClientRect().top - discoverPosition.copyTop
      : discoverPosition.top;
  }
  const nextBrowser = app.querySelector('.topic-list');
  if (nextBrowser && ui.browserScroll?.page === ui.recommendationPage && ui.browserScroll.token === ui.recommendationBatchToken) nextBrowser.scrollTop = ui.browserScroll.top;
  const nextSavedList = app.querySelector('.saved-interest-list');
  if (nextSavedList && ui.interestScroll?.page === ui.interestPage && ui.interestScroll.query === ui.interestQuery) nextSavedList.scrollTop = ui.interestScroll.top;
  const nextReviewList = app.querySelector('.candidate-list');
  if (nextReviewList && nextReviewList.dataset.page === ui.reviewScroll.page) nextReviewList.scrollTop = ui.reviewScroll.top;
  if (ui.view === 'map' && ui.loaded) drawMap();
  if (focused?.isConnected && mapWorkspace?.element.contains(focused)) focused.focus({preventScroll:true});
  if (focusKey) {
    let target = [...app.querySelectorAll('[data-focus]')].find(element => element.dataset.focus === focusKey);
    // A boundary button becomes disabled after paging. Keep keyboard focus nearby.
    if (target?.disabled && focusKey.startsWith('candidate-')) target = app.querySelector('.inbox-pagination button:not(:disabled)') || app.querySelector('#candidate-review-status');
    if (target?.disabled && focusKey.startsWith('recommendation-page-')) target = app.querySelector('.recommendation-pagination button:not(:disabled)') || app.querySelector('#recommendations-title');
    if (target?.disabled && ['topic-prev','topic-next'].includes(focusKey)) target = app.querySelector('.single-pagination button:not(:disabled)') || app.querySelector('#selected-topic-title');
    if (target?.disabled && focusKey.startsWith('interest-page-')) target = app.querySelector('.saved-interest-pagination button:not(:disabled)') || app.querySelector('#saved-interest-status');
    if ((!target || target.disabled) && focusKey.startsWith('interest-')) target = app.querySelector('.saved-interest-title') || app.querySelector('#saved-interest-search') || app.querySelector('#interests-title');
    if (!target && focusKey === 'open-discover') target = app.querySelector('#recommendations-title');
    if ((!target || target.disabled) && /^(hidden-|clear-dismiss-undo|undo-dismiss)/.test(focusKey)) target = app.querySelector('#hidden-topics-title') || app.querySelector('#recommendations-title') || app.querySelector('[data-focus=nav-interests]');
    if (!target && focusKey.startsWith('interest-choice-')) target = app.querySelector('#manual-interest');
    if (!target && focusKey === 'open-interests') target = app.querySelector('#manual-interest');
    if (!target && focusKey.startsWith('stats-day-')) target = app.querySelector('[data-stats-day][aria-current="date"]') || app.querySelector('#stats-panel');
    if (!target && focusKey.startsWith('exploration-')) target = app.querySelector('#exploration-review-title') || app.querySelector('#recommendations-title');
    if (!target && focusKey.startsWith('recent-save:')) target = app.querySelector('[data-focus=interest-overview]') || app.querySelector('#interests-title');
    if ((!target || target.disabled) && /^(save-topic:|recommendation-dismiss:|topic-row:|topic-more:|search-menu:)/.test(focusKey)) target = app.querySelector('#selected-topic-title') || app.querySelector('#recommendations-title');
    if (!target && focusKey.startsWith('search:')) target = app.querySelector('.topic-search summary') || app.querySelector('#recommendations-title');
    if ((!target || target.disabled) && focusKey.startsWith('guide-')) target = app.querySelector('#guide-heading');
    if (target?.closest('details:not([open])') && target.tagName !== 'SUMMARY') target = target.closest('details').querySelector('summary');
    if (!target && (focusKey.startsWith('graph-') || focusKey.startsWith('undo-feedback:') || focusKey.startsWith('clear-concept-feedback:'))) target = app.querySelector('#recommendations-title');
    if ((!target || target.disabled) && (focusKey.startsWith('candidate-') || focusKey.startsWith('dismiss:'))) target = app.querySelector('#candidate-review-status');
    if (target) {
      target.focus({ preventScroll: true });
      if (selection && typeof target.setSelectionRange === 'function' && target.type !== 'number') {
        try { target.setSelectionRange(...selection); } catch { /* A non-text input has no selection. */ }
      }
    }
  }
  motion.placeNavigation(app, previousNavigation);
  motion.notices(app, {error, undo:state?.interestUndo?.token, pending:ui.pending.size > 0});
  if (transition) motion.enter(app.querySelector('#main-view'));
}

/** Replace shell siblings, never the ancestors of a mounted map/fullscreen target. */
function refreshMapShell(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const incoming = template.content;
  const regions = [
    ['.app-header', '.app-shell'], ['.demo-notice', '.workspace-content', '.page-layout'],
    ['.main-nav', '.workspace'], ['.error-banner', '.workspace-content', '.page-layout'],
    ['.dismissal-undo', '.workspace-content', '.page-layout'],
    ['.welcome-guide', '.page-layout'], ['.app-footer', '.workspace-content'],
    ['.app-shell > .sr-only', '.app-shell'], ['.galaxy-page > .view-heading', '.galaxy-page'],
  ];
  for (const [selector, parentSelector, beforeSelector] of regions) {
    const previous = app.querySelector(selector), next = incoming.querySelector(selector);
    if (previous && next) previous.replaceWith(next);
    else if (previous) previous.remove();
    else if (next) app.querySelector(parentSelector).insertBefore(next, beforeSelector ? app.querySelector(beforeSelector) : null);
  }
  app.querySelector('.page-layout').className = incoming.querySelector('.page-layout').className;
}

function loadingView() {
  return `<section class="empty-state"><h1>${text('headline')}</h1><p>${text('loadingInterests')}</p>${ui.error ? `<button type="button" data-action="reload">${text('retry')}</button>` : ''}</section>`;
}

function interestsView() {
  const approved = arr(state.approved);
  const candidates = arr(state.candidates);
  return `<section class="interests-page"><div class="view-heading interest-heading"><div><h1>${text('myInterests')}</h1><p>${text(ui.interestTab === 'review' ? 'inboxHelp' : 'interestHint')}</p></div><button type="button" class="quiet interest-overview-trigger" data-action="interest-overview" data-focus="interest-overview">${icon('grid')}${text('interestOverviewShort')}</button></div>
    <div class="interest-page-actions"><button type="button" class="primary" data-action="import" data-focus="candidate-import"${disabled(busy('import'))}>${icon('download')}${text(busy('import') ? 'reviewing' : 'reviewBrowsingShort')}</button></div>
    <div class="interests-workspace"><div class="interest-library"><div class="interests-tabs" role="tablist" aria-label="${text('interestSections')}">${INTEREST_TABS.map(tab => `<button type="button" role="tab" id="interests-tab-${tab}" aria-controls="interests-${tab}-panel" aria-selected="${ui.interestTab === tab}" tabindex="${ui.interestTab === tab ? 0 : -1}" data-action="interests-tab" data-interest-tab="${tab}" data-focus="interests-tab-${tab}">${text(tab === 'saved' ? 'savedTab' : 'reviewTab')}<span class="interest-tab-count">${tab === 'saved' ? approved.length : candidates.length}</span></button>`).join('')}</div>
    <div class="interest-tab-panel" id="interests-saved-panel" role="tabpanel" aria-labelledby="interests-tab-saved"${ui.interestTab !== 'saved' ? ' hidden' : ''}>${ui.interestTab === 'saved' ? `
      <form class="manual-form" id="manual-form"><label class="sr-only" for="manual-interest">${text('addInterest')}</label><input id="manual-interest" data-focus="manual-interest" name="interest" placeholder="${text('interestPlaceholder')}" maxlength="120" value="${escape(ui.manual)}" autocomplete="off" aria-describedby="manual-interest-choices"><button class="primary" data-focus="add-interest" type="submit"${disabled(busy('add'))}>${text(busy('add') ? 'saving' : 'add')}</button></form>
      <div id="manual-interest-choices">${manualChoicesView()}</div>
      ${interestGroupsUI.interestsView(ui.interestGroup)}
      ${savedInterestsView(groupInterests(state,ui.interestGroup))}
      ${approved.length ? `<div class="page-actions"><button type="button" class="primary" data-action="view" data-target-view="discover" data-focus="open-discover">${text('openDiscover')}${icon('arrow')}</button></div>` : ''}` : ''}</div>
    <div class="interest-tab-panel" id="interests-review-panel" role="tabpanel" aria-labelledby="interests-tab-review"${ui.interestTab !== 'review' ? ' hidden' : ''}>${ui.interestTab === 'review' ? inboxView() : ''}</div></div><aside class="interest-overview" aria-label="${text('interestOverview')}">${interestOverviewView()}</aside></div></section>`;
}

function interestOverviewView() {
  const summary = summarizeInterests(state);
  return `<section class="overview-section"><div class="overview-heading"><span class="overview-star" aria-hidden="true">✦</span><h2>${text('interestOverview')}</h2></div><p class="overview-intro">${text('interestOverviewHelp')}</p>
    <div class="overview-metrics"><div><strong>${summary.savedCount}</strong><span>${text('overviewSaved')}</span></div><div><strong>${summary.exploredCount}</strong><span>${text('overviewExplored')}</span></div></div>
    <h3>${text('overviewDomains')}<span>${summary.domainCount}</span></h3>
    ${summary.domains.length ? `<ul class="overview-domains">${summary.domains.map(row => `<li><div><span>${escape(row.name)}</span><span>${row.count}</span></div><div class="overview-track" aria-hidden="true"><i style="width:${row.count / Math.max(1,summary.savedCount) * 100}%"></i></div></li>`).join('')}</ul>` : `<p class="muted small">${text('overviewNoDomains')}</p>`}
    ${summary.otherClassifiedCount ? `<p class="overview-note">${text('overviewOther',{count:summary.otherClassifiedCount})}</p>` : ''}${summary.unclassifiedCount ? `<p class="overview-note">${text('overviewCustom',{count:summary.unclassifiedCount})}</p>` : ''}</section>
    <section class="overview-section overview-recent"><h3>${text('recentExploration')}</h3>${summary.recent.length ? `<p class="muted small">${text('recentSaveHelp')}</p><ol>${summary.recent.map(row => `<li><span class="overview-recent-dot" aria-hidden="true"></span><div><strong>${escape(topicTitle(row))}</strong><span>${escape(row.domain || t('newDirection'))}${Number.isFinite(row.at) ? ` · ${escape(formatTime(row.at))}` : ''}</span>${isApproved(topicId(row)) ? `<span class="recent-saved">${icon('check')}${text('savedCompact')}</span>` : `<button type="button" class="quiet recent-save" data-action="save-topic" data-id="${escape(topicId(row))}" data-focus="recent-save:${escape(topicId(row))}"${disabled(busy(`save:${topicId(row)}`))}>${icon('bookmark')}${text(busy(`save:${topicId(row)}`) ? 'saving' : 'explorationJoin')}</button>`}</div></li>`).join('')}</ol>` : `<p class="muted small">${text('recentExplorationEmpty')}</p>`}</section>
    <button type="button" class="overview-map-link quiet" data-action="view" data-target-view="map">${icon('orbit')}${text('overviewOpenMap')}${icon('arrow')}</button>`;
}

function interestOverviewDialog(trigger) {
  const dialog = document.createElement('dialog');
  dialog.className = 'interest-overview-dialog'; dialog.setAttribute('aria-label',t('interestOverview'));
  dialog.innerHTML = `<form method="dialog"><button type="submit" class="quiet overview-dialog-close" aria-label="${text('closeInterestOverview')}">×</button></form>${interestOverviewView()}`;
  dialog.querySelector('[data-action="view"]').addEventListener('click', () => { closeDialog(dialog); navigate('map'); });
  dialog.querySelectorAll('[data-action="save-topic"]').forEach(button => button.addEventListener('click', onAction));
  dialog.addEventListener('close', () => {dialog.remove();if (trigger.isConnected) trigger.focus({preventScroll:true});}, {once:true});
  document.body.append(dialog); openDialog(dialog);
}

function fitReviewPanel() {
  const panel = app.querySelector('.review-workspace');
  if (panel) panel.style.height = `${reviewPanelHeight(window.innerHeight, panel.getBoundingClientRect().top + window.scrollY)}px`;
}

function selectInterestTab(tab) {
  if (!INTEREST_TABS.includes(tab)) return;
  const changed = tab !== ui.interestTab;
  ui.interestTab = tab;
  const url = new URL(location.href);
  if (tab === 'review') url.searchParams.set('interests', 'review'); else url.searchParams.delete('interests');
  history.replaceState(null, '', url);
  render();
  if (changed) motion.reveal(app.querySelector('.interest-tab-panel:not([hidden])'));
  document.getElementById(`interests-tab-${tab}`)?.focus({preventScroll:true});
}

function savedInterestsView(approved) {
  const page = interestPage();
  ui.interestPage = page.page;
  const allSelected = page.items.length > 0 && page.items.every(topic => ui.interestSelected.has(topicId(topic)));
  const pending = busy('interests');
  const undo = state.interestUndo;
  return `<section class="section saved-interests" aria-labelledby="interests-title">
    <h2 class="sr-only" id="interests-title" data-focus="interests-title" tabindex="-1">${text('savedInterests')} <span class="count">${approved.length}</span></h2>
    ${approved.length ? `<div class="saved-interest-toolbar"><label class="saved-interest-search" for="saved-interest-search">${icon('search')}<span class="sr-only">${text('searchInterests')}</span><input type="search" id="saved-interest-search" data-focus="interest-search" aria-label="${text('searchInterests')}" placeholder="${text('searchInterests')}" value="${escape(ui.interestQuery)}" autocomplete="off" spellcheck="false">${ui.interestQuery ? `<button type="button" class="quiet" data-action="interest-clear-search" data-focus="interest-clear-search" aria-label="${text('clearInterestSearch')}">×</button>` : ''}</label><button type="button" class="quiet" data-action="interest-manage" data-focus="interest-manage" aria-pressed="${ui.interestManaging}"${disabled(pending)}>${text(ui.interestManaging ? 'finishManaging' : 'manageSavedInterests')}</button></div>
    ${ui.interestManaging ? `<div class="saved-interest-management"><button type="button" class="quiet" data-action="interest-select-page" data-focus="interest-select-page"${disabled(pending || !page.total)}>${text(allSelected ? 'deselectInterestPage' : 'selectInterestPage')}</button><span class="saved-interest-selection" role="status">${text('selectedInterestCount',{count:ui.interestSelected.size})}</span><button type="button" class="danger" data-action="interest-remove-selected" data-focus="interest-remove-selected"${disabled(pending || !ui.interestSelected.size)}>${text('removeSelectedInterests',{count:ui.interestSelected.size})}</button></div>` : ''}
    ${page.total ? `<ul class="saved-interest-list" data-page="${page.page}" data-query="${escape(ui.interestQuery)}">${page.items.map((topic,index) => {
      const id = topicId(topic), title = topicTitle(topic);
      const expanded = ui.interestExpanded.has(id);
      const titleId = `saved-interest-name-${page.start + index}`;
      return `<li class="saved-interest-row${expanded ? ' is-expanded' : ''}${ui.interestManaging ? ' is-managing' : ''}${ui.interestSelected.has(id) ? ' is-selected' : ''}">${ui.interestManaging ? `<label class="saved-interest-choice"><input type="checkbox" data-saved-interest="${escape(id)}" data-focus="interest-select:${escape(id)}"${checked(ui.interestSelected.has(id))}${disabled(pending)}><span class="saved-interest-name">${escape(title)}</span></label>` : `<button type="button" class="saved-interest-title" data-action="interest-expand" data-id="${escape(id)}" data-focus="interest-title:${escape(id)}" aria-expanded="${expanded}" aria-controls="${titleId}" title="${escape(title)}"><span id="${titleId}" class="saved-interest-name">${escape(title)}</span></button>`}<button type="button" class="quiet saved-interest-remove" data-action="remove" data-id="${escape(id)}" data-focus="interest-remove:${escape(id)}" aria-label="${text('removeInterest',{topic:title})}"${disabled(pending)}>×</button></li>`;
    }).join('')}</ul>` : `<div class="saved-interest-empty"><p>${text('noMatchingInterests')}</p><button type="button" class="quiet" data-action="interest-clear-search" data-focus="interest-clear-search">${text('clearInterestSearch')}</button></div>`}
    <div class="saved-interest-footer"><p id="saved-interest-status" data-focus="interest-page-status" tabindex="-1" role="status" aria-live="polite">${text('savedInterestRange',{start:page.start,end:page.end,total:page.total})}</p><nav class="saved-interest-pagination" aria-label="${text('savedInterestPagination')}"><button type="button" class="quiet" data-action="interest-prev" data-focus="interest-page-prev" aria-label="${text('previous')}"${disabled(page.page === 1)}>${icon('chevron')}</button><span aria-hidden="true">${page.page} / ${page.pageCount}</span><button type="button" class="quiet" data-action="interest-next" data-focus="interest-page-next" aria-label="${text('next')}"${disabled(page.page === page.pageCount)}>${icon('chevron')}</button></nav></div>` : `<p class="muted small">${text('firstInterest')}</p>`}
    ${undo ? `<div class="interest-undo"><span role="status">${text(undo.topics.length === 1 ? 'removedOneInterest' : 'removedInterestCount',{count:undo.topics.length})}</span><button type="button" class="quiet" data-action="interest-undo" data-token="${escape(undo.token)}" data-focus="interest-undo"${disabled(pending)}>${text('undoInterestRemoval')}</button><button type="button" class="quiet interest-undo-dismiss" data-action="interest-dismiss-undo" data-token="${escape(undo.token)}" data-focus="interest-dismiss-undo" aria-label="${text('dismissInterestUndo')}"${disabled(pending)}>×</button></div>` : ''}
  </section>`;
}

function explorationReviewView() {
  if (!ui.explorationReady || [...ui.pending].some(key => key.startsWith('search:'))) return '';
  const rows = arr(state?.explorationPrompts).slice().reverse().filter(row => !isApproved(row.id) && getTopic(row.id));
  if (!rows.length) return '';
  const rowView = row => `<li class="exploration-review-row"><strong>${escape(topicTitle(getTopic(row.id)))}</strong><div class="exploration-review-actions"><button type="button" class="save" data-action="save-topic" data-id="${escape(row.id)}" data-focus="exploration-save:${escape(row.token)}"${disabled(busy(`save:${row.id}`))}>${icon('bookmark')}${text(busy(`save:${row.id}`) ? 'saving' : 'explorationJoin')}</button><button type="button" class="quiet" data-action="postpone-exploration" data-token="${escape(row.token)}" data-focus="exploration-postpone:${escape(row.token)}"${disabled(busy(`save:${row.id}`) || busy(`postpone:${row.token}`))}>${text('explorationPostpone')}</button></div></li>`;
  return `<section class="exploration-review" aria-labelledby="exploration-review-title"><h2 id="exploration-review-title" data-focus="exploration-review-title" tabindex="-1">${text('explorationReviewHeading')}</h2><p>${text('explorationReviewHelp')}</p><p class="exploration-save-effect">${text(state.settings.mode === 'global' ? 'explorationSaveEffectGlobal' : 'explorationSaveEffectPath')}</p><ul>${rows.slice(0,3).map(rowView).join('')}</ul>${rows.length > 3 ? `<details data-disclosure="exploration-review-more"${ui.openSections.has('exploration-review-more') ? ' open' : ''}><summary data-focus="exploration-review-more">${text('explorationMore',{count:rows.length - 3})}</summary><ul>${rows.slice(3).map(rowView).join('')}</ul></details>` : ''}</section>`;
}

async function exploreTopic(topic, provider, context) {
  ui.explorationReady = false;
  ui.explorationAway = document.visibilityState !== 'visible' || !document.hasFocus();
  return run(`search:${topicId(topic)}:${provider}`, () => search(topic, provider, context), 'explorationRecorded');
}

function discoverView() {
  const approved = arr(state.approved);
  const items = discoveryItems();
  const batch = ui.discoveryBatch;
  const updatedAt = batch?.updatedAt ?? state.lastUpdated;
  const cursor = recommendationCursor(items, ui.recommendationId, ui.recommendationIndex);
  ui.recommendationId = cursor.id; ui.recommendationIndex = cursor.index;
  const page = paginate(items, Math.floor(cursor.index / PAGE_SIZE) + 1);
  ui.recommendationPage = page.page;
  const mode = batch?.mode || state.settings?.mode || 'path';
  const batchFocus = batch?.focus || state.focus || topicTitle(approved.at(-1));
  const single = ui.recommendationView === 'single';
  const specific = (batch?.kind || state.settings?.recommendationKind) === 'specific';
  return `<section class="discover-page" aria-labelledby="recommendations-title"><div class="view-heading discover-heading"><div><h1 id="recommendations-title" data-focus="recommendations-title" tabindex="-1">${text('discover')}</h1><p>${text('discoverSubtitle')}</p></div><button type="button" class="refresh-button${items.length ? ' quiet' : ' primary'}" data-action="recommend" aria-busy="${busy('recommend') || busy('feedback')}"${disabled(!approved.length || busy('recommend') || busy('feedback'))}>${icon('refresh')}<span>${text(busy('recommend') || busy('feedback') ? 'finding' : items.length ? 'refreshIdeas' : 'findIdeas')}</span></button></div>
    ${explorationReviewView()}
    ${interestGroupsUI.discoverView()}
    <div class="discovery-context"><span>${approved.length ? mode === 'path' ? text('startingFrom',{topic:batchFocus}) : text('discoverySeeds',{count:batch?.seedCount ?? recommendationInterests(state).length}) : text('firstHelp')}</span><details class="discovery-adjust" data-disclosure="discovery-adjust"${ui.openSections.has('discovery-adjust') ? ' open' : ''}><summary>${text('adjust')}</summary><div class="disclosure-body">${discoveryControls(state,{text})}<label class="field"><span>${text('discoveryMode')}</span><select id="discovery-mode" data-focus="discovery-mode"><option value="path"${mode === 'path' ? ' selected' : ''}>${text('followPath')}</option><option value="global"${mode === 'global' ? ' selected' : ''}>${text('acrossInterests')}</option></select></label><p class="muted small">${mode === 'path' ? text('pathNote', {topic:batchFocus}) : text('globalNote')}</p><div class="adjust-actions"><button type="button" class="quiet" data-action="view" data-target-view="interests" data-focus="open-interests">${text('manageInterests')}</button><button type="button" class="quiet" data-action="view" data-view="settings">${text('adjustRecommendations')}</button></div><p class="muted small">${text('recommendationBatchHelp')}</p></div></details></div>
    <div class="discover-viewbar"><div class="view-switch" role="group" aria-label="${text('recommendationLayout')}">${[['cards','browse','grid'],['single','singleView','single']].map(([value,label,symbol]) => `<button type="button" data-action="recommendation-view" data-value="${value}" data-focus="recommendation-view-${value}" aria-pressed="${(value === 'single') === single}">${icon(symbol)}${text(label)}</button>`).join('')}</div>${items.length ? `<span class="muted small">${text('topicCount',{count:items.length})}</span>` : ''}</div>
    ${items.length ? single ? `<div class="single-discovery">${topicDetailView(cursor.topic, true)}<nav class="single-pagination" aria-label="${text('topicNavigation')}"><button type="button" class="quiet" data-action="topic-prev" data-focus="topic-prev"${disabled(cursor.index === 0)}>${icon('chevron')}<span>${text('previous')}</span></button><span role="status">${cursor.index + 1} / ${cursor.total}</span><button type="button" class="quiet" data-action="topic-next" data-focus="topic-next"${disabled(cursor.index === cursor.total - 1)}><span>${text('next')}</span>${icon('chevron')}</button></nav></div>` : `<div class="discovery-workbench"><div class="topic-browser"><nav class="topic-list" data-page="${page.page}" data-batch="${escape(ui.recommendationBatchToken)}" aria-label="${text('recommendedTopics')}">${page.items.map(topic => `<button type="button" class="topic-row" data-action="select-topic" data-id="${escape(topicId(topic))}" data-focus="topic-row:${escape(topicId(topic))}"${topicId(topic) === cursor.id ? ' aria-current="true"' : ''}><span class="topic-row-title">${escape(topicTitle(topic))}</span><span class="topic-row-domain">${escape(topic.domain || t('newDirection'))}</span>${icon('chevron')}</button>`).join('')}</nav>${page.pageCount > 1 ? `<nav class="recommendation-pagination" aria-label="${text('recommendationPagination')}"><button type="button" class="quiet" data-action="recommendation-prev" data-focus="recommendation-page-prev"${disabled(page.page === 1)} aria-label="${text('previous')}">${icon('chevron')}</button><span class="page-status" role="status">${page.page} / ${page.pageCount}</span><button type="button" class="quiet" data-action="recommendation-next" data-focus="recommendation-page-next"${disabled(page.page === page.pageCount)} aria-label="${text('next')}">${icon('chevron')}</button></nav>` : ''}</div>${topicDetailView(cursor.topic)}</div>` : `<div class="empty-state"><div class="empty-symbol" aria-hidden="true">✧</div><h2>${text(approved.length ? 'newRoom' : 'smallBeginning')}</h2><p>${text(approved.length ? 'findHelp' : 'firstHelp')}</p>${!approved.length ? `<button type="button" class="primary" data-action="view" data-target-view="interests" data-focus="open-interests">${text('addInterest')}</button>` : ''}</div>`}
    ${specific && items.length ? `<p class="concept-reserve">${text('reservationCount',{achieved:items[0].discovery?.exploration_achieved||0,target:items[0].discovery?.exploration_target||0})}</p>` : ''}
    ${specific && updatedAt != null && !items.length ? `<p class="muted small">${text('specificEmpty')}</p>` : ''}
    ${specific ? savedFeedbackView(state,ui.feedbackPage,ui.feedbackOpen,{text,escape,busy:busy('feedback')}) : ''}
    ${updatedAt != null ? `<p class="last-updated">${text('updated', { time: formatTime(updatedAt) })}</p>` : ''}</section>`;
}

function inboxView() {
  return candidateDraftView(state,ui.review,{language:language(),pending:busy('candidate-edit') || busy('approve')});
}

function reviewBrowsingDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'history-review-dialog';
  dialog.setAttribute('aria-labelledby', 'history-review-title');
  dialog.setAttribute('aria-describedby', 'history-review-privacy');
  dialog.innerHTML = `<form method="dialog"><h2 id="history-review-title">${text('reviewBrowsing')}</h2><p id="history-review-privacy">${text('introPrivacy')}</p><label class="field" for="history-days"><span>${text('historyPeriod')}</span><select id="history-days" autofocus><option value="7"${ui.days === '7' ? ' selected' : ''}>${text('historyDays', {days:7})}</option><option value="30"${ui.days === '30' ? ' selected' : ''}>${text('historyDays', {days:30})}</option></select></label><div class="dialog-actions"><button type="submit" value="cancel">${text('cancelHistoryReview')}</button><button type="submit" class="primary" value="import">${text('reviewBrowsingShort')}</button></div></form>`;
  dialog.addEventListener('submit', event => {
    if (event.submitter?.value !== 'import') return;
    event.preventDefault();
    ui.days = dialog.querySelector('select').value;
    closeDialog(dialog, 'import');
    // Request optional history permission within the explicit submit gesture.
    void run('import', () => importHistory(Number(ui.days)), 'importReady').then(next => {
      if (next && !next.lastError && ui.view === 'interests') selectInterestTab('review');
    });
  });
  dialog.addEventListener('close', () => { ui.days = dialog.querySelector('select').value; dialog.remove(); }, {once:true});
  document.body.append(dialog);
  openDialog(dialog);
}

function descriptionView(topic) {
  const description = topic.description || t('explorePace');
  if (description.length <= 220) return `<p class="topic-description">${escape(description)}</p>`;
  const id = topicId(topic);
  return `<details class="description-details" data-description="${escape(id)}"${ui.expandedDescriptions.has(id) ? ' open' : ''}><summary data-focus="description-${escape(id)}"><span class="description-preview">${escape(description.slice(0, 220).trimEnd())}… </span><span class="description-more">${text('readMore')}</span><span class="description-less">${text('readLess')}</span></summary><p class="topic-description">${escape(description)}</p></details>`;
}

function topicDetailView(topic, single = false) {
  const id = topicId(topic);
  const saved = isApproved(id);
  const graph = graphDetails(topic,{text,escape});
  return `<article class="topic-detail${single ? ' is-single' : ''}" data-topic-id="${escape(id)}" data-batch="${escape(ui.recommendationBatchToken)}" aria-labelledby="selected-topic-title"><div class="topic-detail-copy"><p class="eyebrow">${escape(topic.domain || t('newDirection'))}</p><h2 id="selected-topic-title" data-focus="selected-topic-title" tabindex="-1">${escape(topicTitle(topic))}</h2>${descriptionView(topic)}${topic.nearest_interest ? `<p class="related">${text('connectionFrom', { topic: topic.nearest_interest })}</p>` : ''}${graph ? `<details class="topic-source" data-disclosure="source:${escape(id)}"${ui.openSections.has(`source:${id}`) ? ' open' : ''}><summary>${text('sourceDetails')}</summary>${graph}</details>` : ''}</div><div class="topic-actions"><details class="topic-search" data-action-popover><summary class="primary" data-focus="search-menu:${escape(id)}">${icon('search')}<span>${text('searchTopic')}</span>${icon('chevron')}</summary><div class="topic-action-menu" role="group" aria-label="${text('searchWith')}">${searchButtons(topic)}</div></details>${saved ? `<span class="saved-label">${icon('check')}${text('savedCompact')}</span>` : `<button type="button" class="save" data-action="save-topic" data-id="${escape(id)}" data-focus="save-topic:${escape(id)}"${disabled(busy(`save:${id}`))}>${icon('bookmark')}${text('saveCompact')}</button>`}<details class="topic-more" data-action-popover><summary data-focus="topic-more:${escape(id)}" aria-label="${text('moreTopicActions')}">${icon('more')}</summary><div class="topic-action-menu"><button type="button" data-action="dismiss" data-id="${escape(id)}" data-focus="recommendation-dismiss:${escape(id)}">${text('notForMe')}</button></div></details></div></article>`;
}

function recommendationOptionField(key, draft) {
  const { min, max, integer } = RECOMMENDATION_BOUNDS[key];
  const id = `recommendation-${key}`;
  return `<label class="field recommendation-option"><span>${text(`option_${key}`)}</span><input id="${id}" name="${key}" data-recommendation-option="${key}" type="number" min="${min}" max="${max}" step="${integer ? '1' : 'any'}" required aria-describedby="${id}-help" data-focus="${id}" value="${escape(draft[key])}"><small id="${id}-help">${text(`optionHelp_${key}`)}</small></label>`;
}

function recommendationSettingsView(draft) {
  return settingsSection('settings-recommendations', 'recommendationSettings', `${recommendationOptionField('limit', draft)}<details id="recommendation-advanced"${ui.advancedOptionsOpen ? ' open' : ''}><summary data-focus="recommendation-advanced-summary">${text('advancedRecommendations')}</summary><p class="muted small">${text('recommendationDistanceHelp')}</p><div class="recommendation-option-grid">${Object.keys(RECOMMENDATION_DEFAULTS).filter(key => key !== 'limit').map(key => recommendationOptionField(key, draft)).join('')}</div></details><p class="muted small">${text('recommendationSettingsHelp')}</p><button type="button" class="quiet" data-action="reset-recommendation-options">${text('resetRecommendationDefaults')}</button>`, 'recommendation-settings');
}

function galaxySettingsView(draft) {
  return settingsSection('settings-galaxy', 'galaxyLayoutSettings', `<p class="muted small">${text('galaxyLayoutSettingsHelp')}</p><div class="recommendation-option-grid">${Object.keys(GALAXY_LAYOUT_DEFAULTS).map(key => {
    const {min,max,integer} = GALAXY_LAYOUT_BOUNDS[key], id = `galaxy-layout-${key}`;
    return `<label class="field recommendation-option"><span>${text(`galaxyOption_${key}`)}</span><input id="${id}" name="${key}" data-galaxy-option="${key}" type="number" min="${min}" max="${max}" step="${integer ? '1' : 'any'}" required aria-describedby="${id}-help" data-focus="${id}" value="${escape(draft.galaxyLayoutOptions[key])}"><small id="${id}-help">${text(`galaxyOptionHelp_${key}`)}</small></label>`;
  }).join('')}</div>${[['galaxyShowDomainLabels','galaxy-show-domain-labels'],['galaxyShowInterestLabels','galaxy-show-interest-labels']].map(([key,id]) => `<label class="toggle-row"><input id="${id}" name="${key}" type="checkbox" data-galaxy-label="${key}" data-focus="${id}"${checked(draft[key])}><span><strong>${text(key)}</strong></span></label>`).join('')}<div class="galaxy-settings-actions"><button type="button" class="quiet" data-action="reset-galaxy-options">${text('restoreGalaxyB')}</button><button type="button" data-action="open-galaxy-layout">${text('openGalaxyLayout')}</button></div><p class="muted small">${text('galaxyLayoutSaveHelp')}</p>`, 'galaxy-settings');
}

function settingsSection(key, title, body, classes = '') {
  const symbol = {'settings-sound':'sound','settings-discovery':'compass','settings-recommendations':'settings','settings-galaxy':'orbit','settings-connection':'connection','settings-exclusions':'shield','settings-data':'shield','settings-guide':'help'}[key] || 'settings';
  return `<details class="settings-group disclosure ${classes}" data-disclosure="${key}"${ui.openSections.has(key) ? ' open' : ''}><summary data-focus="${key}">${icon(symbol)}<span>${text(title)}</span>${icon('chevron')}</summary><div class="disclosure-body">${body}</div></details>`;
}

function searchButtons(topic) {
  const id = topicId(topic);
  return `<button type="button" data-action="search" data-id="${escape(id)}" data-provider="google"${disabled(busy(`search:${id}:google`))}>Google <span aria-hidden="true">↗</span></button><button type="button" data-action="search" data-id="${escape(id)}" data-provider="youtube"${disabled(busy(`search:${id}:youtube`))}>YouTube <span aria-hidden="true">↗</span></button>`;
}

function settingsView() {
  const settings = state.settings || {};
  const draft = ui.settingsDraft || snapshotSettings();
  return `<section class="settings"><div class="view-heading"><h1>${text('settings')}</h1></div>
    <div class="settings-preferences">
      <label class="language-control" for="settings-theme"><span>${text('appearance')}</span><select id="settings-theme" data-focus="settings-theme" aria-describedby="theme-help">${THEMES.map(theme=>`<option value="${escape(theme.id)}"${normalizeThemeId(settings.theme)===theme.id ? ' selected' : ''}>${text(theme.label)}</option>`).join('')}</select></label>
      <p id="theme-help" class="muted small">${text('themeHelp')}</p>
      <div class="settings-language-row">${languageSelect('settings-language')}</div>
    </div>
    <div class="settings-section">${settingsSection('settings-stats-timezone','statsTimezoneSettings',timeZoneSettings.view(busy('stats-timezone')))}${settingsSection('settings-sound', 'soundEffects', `<label class="toggle-row"><input id="sound-effects-enabled" type="checkbox" aria-describedby="sound-effects-help" data-focus="sound-effects-enabled"${checked(settings.soundEffectsEnabled)}${disabled(busy('sound-enabled'))}><span><strong>${text('soundEffectsEnabled')}</strong><small id="sound-effects-help">${text('soundEffectsHelp')}</small></span></label><label class="field" for="sound-effects-volume"><span>${text('soundEffectsVolume')} · <output id="sound-effects-volume-value" for="sound-effects-volume">${Math.round((settings.soundEffectsVolume ?? .2) * 100)}%</output></span><input id="sound-effects-volume" type="range" min="0" max="100" step="5" value="${Math.round((settings.soundEffectsVolume ?? .2) * 100)}" data-focus="sound-effects-volume"${disabled(busy('sound-volume'))}></label><div class="actions" role="group" aria-label="${text('soundEffectsPreview')}">${['save', 'explore', 'bloom'].map(kind => `<button type="button" class="quiet" data-action="preview-sound" data-sound="${kind}" data-focus="preview-sound-${kind}"${disabled(settings.soundEffectsVolume === 0)}>${text(`soundPreview_${kind}`)}</button>`).join('')}</div><p class="muted small">${text('soundPreviewHelp')}</p>`)}
    ${settingsSection('settings-discovery','discovery',`<label class="field"><span>${text('connections')}</span><select id="settings-mode" data-focus="settings-mode" aria-label="${text('connections')}"><option value="path"${settings.mode !== 'global' ? ' selected' : ''}>${text('followLatest')}</option><option value="global"${settings.mode === 'global' ? ' selected' : ''}>${text('exploreAll')}</option></select><small>${text('modeHelp')}</small></label>
    <label class="toggle-row"><input id="browsing-enabled" type="checkbox" aria-label="${text('browsingEnabled')}" aria-describedby="browsing-help" data-focus="browsing-enabled"${checked(settings.browsingEnabled)}${disabled(busy('browsing'))}><span><strong>${text('browsingEnabled')}</strong><small id="browsing-help">${text('browsingHelp')}</small></span></label>
    <label class="toggle-row"><input id="proactive-enabled" type="checkbox" aria-label="${text('proactiveTitle')}" aria-describedby="proactive-help" data-focus="proactive-enabled"${checked(settings.proactiveEnabled)}${disabled(busy('proactive'))}><span><strong>${text('proactiveTitle')}</strong><small id="proactive-help">${text('proactiveHelp')}</small></span></label>
    <label class="toggle-row"><input id="auto-refresh" type="checkbox" aria-label="${text('autoRefresh')}" aria-describedby="refresh-help" data-focus="auto-refresh"${checked(settings.autoRefresh)}${disabled(busy('auto-refresh'))}><span><strong>${text('autoRefresh')}</strong><small id="refresh-help">${text('refreshHelp')}</small></span></label>
    <label class="toggle-row"><input id="galaxy-exploration-mode" type="checkbox" aria-describedby="exploration-mode-help" data-focus="galaxy-exploration-mode"${checked(settings.galaxyExplorationMode)}${disabled(busy('galaxy-exploration'))}><span><strong>${text('galaxyExplorationMode')}</strong><small id="exploration-mode-help">${text('galaxyExplorationHelp')}</small></span></label>`)}
    </div><form class="settings-form" id="settings-form" novalidate><div class="settings-section">${recommendationSettingsView(draft.recommendationOptions)}${galaxySettingsView(draft)}${settingsSection('settings-connection','serviceConnection',`<p class="muted small">${text('localServiceHelp')}</p><button type="button" data-action="connect-local" data-focus="connect-local"${disabled(busy('settings'))}>${text('connectLocal')}</button>${connectionStatusView(ui.connectionStatus,{language:language(),pending:busy('connection'),dirty:connectionDraftChanged()})}<p class="muted small">${text('serviceHelp')}</p><label class="field"><span>${text('serviceAddress')}</span><input id="endpoint" name="endpoint" type="url" aria-label="${text('serviceAddress')}" aria-describedby="endpoint-help" data-focus="endpoint" value="${escape(draft.endpoint)}" placeholder="https://your-demo-address" spellcheck="false" autocomplete="off" required><small id="endpoint-help">${text('endpointHelp')}</small></label><label class="field"><span>${text('teamCode')}</span><input id="access-token" name="accessToken" type="password" aria-label="${text('teamCode')}" aria-describedby="token-help" data-focus="access-token" value="${escape(draft.accessToken)}" placeholder="${text('codePlaceholder')}" autocomplete="off" spellcheck="false"><small id="token-help">${text('codeHelp')}</small></label>`)}
    ${settingsSection('settings-exclusions','excludedWebsites',`<p class="muted small">${text('excludedHelp')}</p><label class="field"><span>${text('domainsToSkip')}</span><textarea id="blocked-domains" name="blockedDomains" aria-label="${text('domainsToSkip')}" aria-describedby="domains-help" data-focus="blocked-domains" spellcheck="false">${escape(draft.blockedDomains)}</textarea><small id="domains-help">${text('domainsHelp')}</small></label>`)}
    </div><div class="actions"><button class="primary" data-focus="save-settings" type="submit"${disabled(busy('settings'))}>${text(busy('settings') ? 'saving' : 'saveSettings')}</button><span class="muted" role="status">${ui.settingsDirty ? text('unsaved') : ui.settingsSaved ? text('settingsSaved') : ''}</span></div></form>
    <div class="settings-section"><details class="settings-group disclosure" data-disclosure="settings-backup"${ui.openSections.has('settings-backup') ? ' open' : ''}><summary data-focus="settings-backup">${icon('download')}<span>${backupText(language(),'title')}</span>${icon('chevron')}</summary><div class="disclosure-body">${backupSettingsView(language(),ui.settingsDirty,busy('backup'))}</div></details>
    <details class="settings-group disclosure" data-disclosure="settings-hidden"${ui.openSections.has('settings-hidden')?' open':''}><summary data-focus="settings-hidden">${icon('eyeOff')}<span>${escape(hiddenText(language(),'title'))} (${arr(state.suppressed).length})</span>${icon('chevron')}</summary><div class="disclosure-body">${hiddenTopicsView(state,{language:language(),query:ui.hiddenQuery,page:ui.hiddenPage,pending:busy('hidden')})}</div></details>
    ${settingsSection('settings-data','localData',`<p class="muted small">${text('localDataHelp')}</p><div class="data-actions"><button type="button" data-action="clear-derived">${text('clearBrowsing')}</button><button type="button" class="danger" data-action="reset">${text('reset')}</button></div><p class="privacy-note">${text('privacy')}</p>`)}
    ${settingsSection('settings-guide','guideTitle',`<p class="muted small">${text('guideReplayHelp')}</p><button type="button" data-action="open-guide" data-focus="open-guide">${text('showGuide')}</button>`)}</div></section>`;
}

function mapView() {
  return `<section class="galaxy-page"><div class="view-heading"><h1>${text('map')}</h1><p>${text('galaxyIntro')}</p></div>
    <div id="galaxy-container">${galaxyError ? `<div class="empty-state" role="alert"><p>${text('galaxyUnavailable')}</p><button type="button" data-action="retry-galaxy">${text('retry')}</button></div>` : !galaxyAssets ? `<p class="muted" role="status">${text('galaxyLoading')}</p>` : ''}</div></section>`;
}

function drawMap() {
  const container = document.querySelector('#galaxy-container');
  if (!container || galaxyError) return;
  if (!galaxyAssets) {
    if (!galaxyLoading) {
      galaxyLoading = true;
      galaxyLoader.load().then(assets => { galaxyAssets = assets; }).catch(() => { galaxyError = true; }).finally(() => {
        galaxyLoading = false;
        if (ui.view === 'map') render();
      });
    }
    return;
  }
  try {
    if (!mapWorkspace) mapWorkspace = createMapWorkspace({ ...galaxyAssets, state, language: language(), viewState: ui.galaxyView,
      presentation: dashboard ? 'dashboard' : 'sidebar', preview, requestFocus, cancelFocus, requestGalaxyLayout, pollGalaxyLayout,
      onGalaxySettings: async patch => {
        const next = await dispatch({type:'SET_SETTINGS',patch});
        if(Object.keys(patch).some(key=>JSON.stringify(next.settings[key])!==JSON.stringify(patch[key]))) throw new Error(next.lastError || 'The Galaxy settings could not be saved.');
        applyState(next); return next;
      },
      onSave: (topic, {data} = {}) => run(`save:${topicId(topic)}`, () => dispatch({type:'ADD_INTEREST', topic}), 'interestSaved', {sound: true, data}),
      onExplore: topic => topic ? soundEffects.enterFocus(topic) : soundEffects.stop(),
      onDismiss: id => run(`dismiss:${id}`, () => dispatch({type:'DISMISS', id}), 'topicDismissed'),
      onCustomFocus: focusMapTopic,
      onSearch: exploreTopic,
      onOpenInterests: () => navigate('interests'),
      onSettings: () => { navigate('settings'); revealField(document.querySelector('#endpoint')); },
    });
    if (mapWorkspace.element.parentElement !== container) container.append(mapWorkspace.element);
    mapWorkspace.update({state, language: language()});
    mapWorkspace.setActive(true);
    if(ui.openGalaxyDomain){const domain=ui.openGalaxyDomain;ui.openGalaxyDomain=null;mapWorkspace.openGalaxyDomain(domain);}
    if (ui.openGalaxyLayout) { ui.openGalaxyLayout = false; mapWorkspace.openGalaxyLayoutEditor(); }
  } catch {
    galaxyError = true;
    render();
  }
}

async function focusMapTopic(id) {
  const next = await run('focus', async () => {
    const focused = await dispatch({type:'SET_FOCUS', id});
    if (focused?.lastError || focused?.settings?.mode === 'path') return focused;
    return dispatch({type:'SET_SETTINGS', patch:{mode:'path'}});
  }, 'focusChanged');
  if (next && !next.lastError) { navigate('discover'); document.querySelector('#recommendations-title')?.focus(); }
}

function bindEvents() {
  interestGroupsUI.bind(app);
  app.querySelectorAll('[data-disclosure]').forEach(details => details.addEventListener('toggle', event => {
    if (!event.target.isConnected) return;
    event.target.open ? ui.openSections.add(event.target.dataset.disclosure) : ui.openSections.delete(event.target.dataset.disclosure);
  }));
  app.querySelectorAll('[data-guide-action]').forEach(button=>button.addEventListener('click',async()=>{
    if (busy('guide')) return;
    const action=button.dataset.guideAction;
    if (action === 'resume') {navigate(ui.guideStep === 0 ? 'interests' : 'discover');document.getElementById('guide-heading')?.focus({preventScroll:true});return;}
    if (action === 'connection') {ui.openSections.add('settings-connection');navigate('settings');revealField(document.getElementById('endpoint'));return;}
    if (action === 'request') {await run('recommend',recommend,'ideasReady');return;}
    if (action === 'search') {const topic=getTopic(button.dataset.id);if(topic)await exploreTopic(topic,button.dataset.provider);return;}
    if (action === 'recover') {ui.guideStep=guideProgress(state,discoveryItems()).step;navigate(ui.guideStep === 0 ? 'interests' : 'discover');return;}
    if (action === 'map') {if(await finishGuide())navigate('map');return;}
    if (action === 'focus-interest') {navigate('interests');selectInterestTab('saved');document.getElementById('manual-interest')?.focus();return;}
    if (action==='next' || action==='back') {
      if (action === 'next' && !guideProgress(state,discoveryItems()).completed[ui.guideStep]) return;
      ui.guideStep=Math.max(0,Math.min(3,ui.guideStep+(action==='next'?1:-1)));
      navigate(ui.guideStep === 0 ? 'interests' : 'discover');
      document.getElementById('guide-heading')?.focus({preventScroll:true});
    } else void finishGuide();
  }));
  app.querySelectorAll('[data-guide-example]').forEach(button=>button.addEventListener('click',()=>{
    ui.manual=button.dataset.guideExample;navigate('interests');selectInterestTab('saved');document.getElementById('manual-interest')?.focus();
  }));
  document.getElementById('recommendation-kind')?.addEventListener('change', event => run('kind', () => dispatch({type:'SET_SETTINGS',patch:{recommendationKind:event.target.value}}), 'kindSaved'));
  document.getElementById('discovery-exploration')?.addEventListener('change', event => run('exploration-share', () => dispatch({type:'SET_SETTINGS',patch:{discoveryExploration:Number(event.target.value)}}), 'shareSaved'));
  document.getElementById('discovery-feedback-panel')?.addEventListener('toggle', event => {if(event.target.isConnected)ui.feedbackOpen=event.target.open;});
  app.querySelectorAll('[data-language]').forEach(select => select.addEventListener('change', event => {
    const nextLanguage = normalizeLanguage(event.target.value);
    void run(`language:${++preferenceSequence}`, () => dispatch({ type: 'SET_SETTINGS', patch: { language: nextLanguage } }), 'languageSaved');
  }));
  document.getElementById('settings-theme')?.addEventListener('change',event=>{
    const theme=normalizeThemeId(event.target.value);
    void run(`theme:${++preferenceSequence}`,()=>dispatch({type:'SET_SETTINGS',patch:{theme}}),'themeSaved');
  });
  timeZoneSettings.bind(app);
  app.querySelectorAll('[data-description]').forEach(details => details.addEventListener('toggle', event => {
    // Ignore queued toggle events from a detached render.
    if (!event.target.isConnected) return;
    const id = event.target.dataset.description;
    event.target.open ? ui.expandedDescriptions.add(id) : ui.expandedDescriptions.delete(id);
  }));
  app.querySelectorAll('[data-action]:not([data-review-action])').forEach(button => {
    const { action, id = '', provider = '', view = '' } = button.dataset;
    if (!button.dataset.focus) button.dataset.focus = `${action}:${id}:${provider}:${view}`;
    button.addEventListener('click', onAction);
  });
  const interestSearch = document.querySelector('#saved-interest-search');
  const updateInterestSearch = event => {
    if (!event.target.isConnected) return;
    ui.interestQuery = event.target.value; ui.interestPage = 1;
    if (!event.isComposing && !ui.interestComposing) render();
  };
  interestSearch?.addEventListener('compositionstart', () => { ui.interestComposing = true; });
  interestSearch?.addEventListener('compositionend', event => { ui.interestComposing = false; updateInterestSearch(event); });
  interestSearch?.addEventListener('input', updateInterestSearch);
  interestSearch?.addEventListener('keydown', event => {
    if (event.isComposing || ui.interestComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); ui.interestQuery = ''; ui.interestPage = 1; render(); }
  });
  app.querySelectorAll('[data-saved-interest]').forEach(input => input.addEventListener('change', event => { const id = event.target.dataset.savedInterest; event.target.checked ? ui.interestSelected.add(id) : ui.interestSelected.delete(id); render(); }));
  const manualInput = document.querySelector('#manual-interest');
  manualInput?.addEventListener('compositionstart',()=>{ui.manualComposing=true;});
  manualInput?.addEventListener('compositionend',event=>{ui.manualComposing=false;ui.manual=event.target.value;updateManualChoices();});
  manualInput?.addEventListener('input', event => { ui.manual = event.target.value; ui.manualSubmitted=false; if(!event.isComposing && !ui.manualComposing) updateManualChoices(); });
  manualInput?.addEventListener('keydown',event=>{if(event.key==='ArrowDown' && !event.isComposing){const first=app.querySelector('#manual-interest-choices button:not(:disabled)');if(first){event.preventDefault();first.focus();}}});
  const hiddenSearch=app.querySelector('#hidden-topic-search');
  hiddenSearch?.addEventListener('compositionstart',()=>{ui.hiddenComposing=true;});
  hiddenSearch?.addEventListener('compositionend',event=>{ui.hiddenComposing=false;ui.hiddenQuery=event.target.value;ui.hiddenPage=1;render();});
  hiddenSearch?.addEventListener('input',event=>{ui.hiddenQuery=event.target.value;ui.hiddenPage=1;if(!event.isComposing && !ui.hiddenComposing)render();});
  document.querySelector('#manual-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (ui.manualComposing) return;
    const topic = ui.manual.trim();
    if (!topic) { document.querySelector('#manual-interest')?.focus(); return; }
    await ensureInterestInput();
    if (!interestInput || ui.manual.trim() !== topic) return;
    if (interestInput.query(topic).requiresChoice) {ui.manualSubmitted=true;updateManualChoices();app.querySelector('#manual-interest-choices button:not(:disabled)')?.focus();return;}
    await saveManualInterest(topic);
  });
  app.querySelectorAll('[data-interest-tab]').forEach(tab => tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = INTEREST_TABS.indexOf(event.currentTarget.dataset.interestTab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? INTEREST_TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + INTEREST_TABS.length) % INTEREST_TABS.length;
    selectInterestTab(INTEREST_TABS[next]);
  }));
  app.querySelector('#recommendation-advanced')?.addEventListener('toggle', event => { if (event.target.isConnected) ui.advancedOptionsOpen = event.target.open; });
  bindCandidateDraft(app,{state,ui:ui.review,render,pending:busy('candidate-edit') || busy('approve'),
    edit:(operation,ids)=>run('candidate-edit',()=>dispatch({type:'REVIEW_CANDIDATES',operation,ids}),'draftUpdated'),
    confirm:()=>run('approve',()=>dispatch({type:'CONFIRM_CANDIDATE_DRAFT'}),'selectedSaved',{sound:true})});
  for (const id of ['discovery-mode', 'settings-mode']) document.getElementById(id)?.addEventListener('change', event => run('mode', () => dispatch({ type: 'SET_SETTINGS', patch: { mode: event.target.value } }), 'modeSaved'));
  document.getElementById('browsing-enabled')?.addEventListener('change', event => run('browsing', () => dispatch({ type: 'SET_SETTINGS', patch: { browsingEnabled: event.target.checked } }), 'browsingSaved'));
  document.getElementById('galaxy-exploration-mode')?.addEventListener('change', event => run('galaxy-exploration', () => dispatch({ type: 'SET_SETTINGS', patch: { galaxyExplorationMode: event.target.checked } }), 'explorationModeSaved'));
  document.getElementById('proactive-enabled')?.addEventListener('change', event => run('proactive', () => dispatch({type:'SET_SETTINGS',patch:{proactiveEnabled:event.target.checked}}), 'settingsSaved'));
  document.getElementById('auto-refresh')?.addEventListener('change', event => run('auto-refresh', () => dispatch({ type: 'SET_SETTINGS', patch: { autoRefresh: event.target.checked } }), 'refreshSaved'));
  document.getElementById('sound-effects-enabled')?.addEventListener('change', event => {
    const soundEffectsEnabled = event.target.checked;
    if (!soundEffectsEnabled) soundEffects.stop();
    void run('sound-enabled', () => dispatch({type: 'SET_SETTINGS', patch: {soundEffectsEnabled}}), 'settingsSaved');
  });
  document.getElementById('sound-effects-volume')?.addEventListener('input', event => {
    document.getElementById('sound-effects-volume-value').textContent = `${event.target.value}%`;
  });
  document.getElementById('sound-effects-volume')?.addEventListener('change', event => {
    const soundEffectsVolume = Number(event.target.value) / 100;
    if (soundEffectsVolume === 0) soundEffects.stop();
    void run('sound-volume', () => dispatch({type: 'SET_SETTINGS', patch: {soundEffectsVolume}}), 'settingsSaved');
  });
  app.querySelectorAll('#settings-form input, #settings-form textarea').forEach(input => input.addEventListener('input', event => {
    const option = event.target.dataset.recommendationOption;
    const galaxyOption = event.target.dataset.galaxyOption;
    const galaxyLabel = event.target.dataset.galaxyLabel;
    if (galaxyOption) ui.settingsDraft.galaxyLayoutOptions[galaxyOption] = event.target.value;
    else if (galaxyLabel) ui.settingsDraft[galaxyLabel] = event.target.checked;
    else if (option) ui.settingsDraft.recommendationOptions[option] = event.target.value;
    else ui.settingsDraft[event.target.name] = event.target.value;
    ui.settingsDirty = true;
    ui.settingsSaved = false;
    const status = document.querySelector('.settings-form .actions [role="status"]');
    if (status) status.textContent = t('unsaved');
    if (['endpoint','accessToken'].includes(event.target.name)) {
      const button=app.querySelector('[data-action=check-connection]'); if(button)button.disabled=busy('connection') || connectionDraftChanged();
      const note=app.querySelector('#connection-check-draft');if(note)note.hidden=!connectionDraftChanged();
    }
    const backupImport = document.querySelector('[data-action="backup-import"]');
    if (backupImport) backupImport.disabled = true;
    const backupNote = document.querySelector('#backup-draft-note');
    if (backupNote) backupNote.hidden = false;
  }));
  document.querySelector('#settings-form')?.addEventListener('submit', saveSettings);
  document.querySelector('#backup-file')?.addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file || ui.settingsDirty || busy('backup')) return;
    try {
      const backup = await readBackupFile(file);
      reviewBackup({backup,language:language(),onExport:async () => downloadBackup(await getState()),onImport:async (backup,mode) => {
        ui.pending.add('backup');
        try {
          const next = await importBackup(backup,mode);
          mapWorkspace?.destroy(); mapWorkspace = null; ui.galaxyView = null;
          ui.settingsDirty = false; ui.settingsSaved = false; ui.error = null;
          ui.interestSelected.clear(); ui.expandedDescriptions.clear();
          ui.feedbackPage = 1; ui.recommendationPage = 1;
          ui.announcement = 'backupImported'; applyState(next);
        } finally {ui.pending.delete('backup');render();}
      }});
    } catch(error) {ui.error = backupError(language(),error);render();}
  });
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const invalid = [...form.querySelectorAll('input, textarea')].find(input => !input.checkValidity());
  if (invalid) {
    revealField(invalid);
    invalid.reportValidity();
    return;
  }
  const draft = structuredClone(ui.settingsDraft);
  const recommendationOptions = Object.fromEntries(Object.entries(draft.recommendationOptions).map(([key, value]) => [key, Number(value)]));
  let galaxyLayoutOptions;
  try { galaxyLayoutOptions = normalizeGalaxyLayoutOptions(Object.fromEntries(Object.entries(draft.galaxyLayoutOptions).map(([key,value])=>[key,Number(value)])),{strict:true}); }
  catch { ui.error = 'Enter valid Galaxy layout settings. Minimum distance must not exceed spread.'; render(); revealField(document.querySelector('#galaxy-layout-min_dist')); return; }
  const domains = [...new Set(draft.blockedDomains.split(/[\n,]+/).map(domain => domain.trim().toLowerCase()).filter(Boolean))];
  if (domains.some(domain => !/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) || domain.includes('..'))) {
    ui.error = 'Enter domain names without https://, paths, or spaces. Use one domain per line.';
    render();
    revealField(document.querySelector('#blocked-domains'));
    return;
  }
  const next = await run('settings', () => dispatch({ type: 'SET_SETTINGS', patch: { endpoint: draft.endpoint.trim(), accessToken: draft.accessToken.trim(), blockedDomains: domains, recommendationOptions, galaxyLayoutOptions, galaxyShowDomainLabels: draft.galaxyShowDomainLabels, galaxyShowInterestLabels: draft.galaxyShowInterestLabels } }), 'settingsSaved');
  if (!next || next.lastError) revealField(document.querySelector('#endpoint'));
  if (next && !next.lastError && JSON.stringify(ui.settingsDraft) === JSON.stringify(draft)) {
    ui.settingsDirty = false;
    ui.settingsSaved = true;
    ui.settingsDraft = snapshotSettings();
    render();
  }
}

function revealField(field) {
  if (!field) return;
  for (let parent = field.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName !== 'DETAILS') continue;
    parent.open = true;
    if (parent.dataset.disclosure) ui.openSections.add(parent.dataset.disclosure);
    if (parent.id === 'recommendation-advanced') ui.advancedOptionsOpen = true;
  }
  field.focus();
}

function selectRecommendation(index, reveal = false) {
  const cursor = recommendationCursor(discoveryItems(), null, index);
  const changed = cursor.id !== ui.recommendationId;
  const direction = Math.sign(cursor.index - ui.recommendationIndex);
  ui.recommendationId = cursor.id; ui.recommendationIndex = cursor.index;
  ui.recommendationPage = Math.floor(cursor.index / PAGE_SIZE) + 1;
  render();
  if (changed) motion.topic(app.querySelector(ui.recommendationView === 'single' ? '.topic-detail' : '.topic-detail-copy'), ui.recommendationView === 'single' ? direction : 0);
  if (reveal && matchMedia('(max-width: 620px)').matches) {
    document.querySelector('#selected-topic-title')?.focus({preventScroll:true});
  }
}

async function onAction(event) {
  const button = event.currentTarget;
  const { action, id, provider } = button.dataset;
  if (action === 'retry-interest-input') { await ensureInterestInput(true); return; }
  if (action === 'choose-interest') {
    if (!interestInput?.query(ui.manual).choices.some(choice=>choice.id===id && choice.available)) return;
    const topic=interestInput.select(id,state.approved); if(topic)await saveManualInterest(topic); return;
  }
  if (action === 'check-connection') { await testSavedConnection(); return; }
  if (action === 'hidden-prev' || action === 'hidden-next') { const page=hiddenTopicsPage(state,{query:ui.hiddenQuery,page:ui.hiddenPage});ui.hiddenPage=page.page+(action==='hidden-next'?1:-1);render();return; }
  if (action === 'hidden-clear-search') {ui.hiddenQuery='';ui.hiddenPage=1;render();app.querySelector('#hidden-topic-search')?.focus();return;}
  if (['restore-hidden','undo-dismiss','clear-dismiss-undo'].includes(action)) {
    const change=action==='restore-hidden'?{type:'RESTORE_HIDDEN',ids:[id]}:{type:action==='undo-dismiss'?'UNDO_DISMISS':'CLEAR_DISMISS_UNDO',token:button.dataset.token};
    await run('hidden',()=>dispatch(change)); return;
  }
  if (action === 'preview-sound') { await soundEffects.preview(button.dataset.sound); return; }
  if (action === 'connect-local') {
    const next = await run('settings', () => dispatch({type: 'SET_SETTINGS', patch: {endpoint: LOCAL_ENDPOINT, accessToken: ''}}), 'localServiceSaved');
    if (next) {
      ui.settingsDraft = {...(ui.settingsDraft || snapshotSettings()), endpoint: LOCAL_ENDPOINT, accessToken: ''};
      ui.settingsDirty = JSON.stringify(ui.settingsDraft) !== JSON.stringify(snapshotSettings());
      ui.settingsSaved = !ui.settingsDirty;
      render();
    }
    return;
  }
  if (action === 'open-dashboard') { await run('dashboard', () => openDashboard('discover')); return; }
  if (action === 'retry-galaxy') { galaxyError = false; galaxyAssets = null; galaxyLoader.invalidate(); render(); return; }
  if (action === 'recommendation-view') {
    const nextView = button.dataset.value === 'single' ? 'single' : 'cards';
    const changed = nextView !== ui.recommendationView;
    ui.recommendationView = nextView;
    ui.announcement = 'layoutChanged';
    render();
    if (changed) motion.reveal(app.querySelector('.single-discovery, .discovery-workbench'));
    return;
  }
  if (action === 'select-topic') { selectRecommendation(discoveryItems().findIndex(topic => topicId(topic) === id), true); return; }
  if (action === 'topic-prev' || action === 'topic-next') { selectRecommendation(ui.recommendationIndex + (action === 'topic-next' ? 1 : -1)); return; }
  if (action === 'view') { navigate(button.dataset.view || button.dataset.targetView); return; }
  if (action === 'open-guide') {
    const next=await run('guide',()=>dispatch({type:'SET_SETTINGS',patch:{tutorialSeen:false,tutorialActive:true}}));
    if(!next || next.settings.tutorialSeen || !next.settings.tutorialActive)return;
    ui.guideOpen=true;ui.guideAutomatic=true;ui.guideReplay=true;ui.guideError=false;ui.error=null;ui.guideStep=0;
    navigate('interests');document.getElementById('guide-heading')?.focus({preventScroll:true});return;
  }
  if (action === 'clear-error') { ui.error = null; if (state?.lastError) await run('clear-error', () => dispatch({ type: 'CLEAR_ERROR' })); else render(); return; }
  if (action === 'reload') { const next = await run('reload', getState); if (next && !unsubscribe) unsubscribe = subscribe(applyState); return; }
  if (action === 'interest-overview') { interestOverviewDialog(button); return; }
  if (action === 'interests-tab') { selectInterestTab(button.dataset.interestTab); return; }
  if (action === 'backup-import') {document.querySelector('#backup-file')?.click();return;}
  if (action === 'backup-export') {
    await run('backup',async () => {downloadBackup(await getState());},'backupExported');return;
  }
  if (action === 'import') { reviewBrowsingDialog(); return; }
  if (action === 'recommendation-prev' || action === 'recommendation-next') {
    const page = paginate(discoveryItems(), ui.recommendationPage + (action === 'recommendation-next' ? 1 : -1));
    selectRecommendation((page.page - 1) * PAGE_SIZE, true); return;
  }
  if (action === 'open-galaxy-layout') { ui.openGalaxyLayout = true; navigate('map'); return; }
  if (action === 'reset-galaxy-options') {
    ui.settingsDraft.galaxyLayoutOptions = {...GALAXY_LAYOUT_DEFAULTS};
    ui.settingsDirty = true; ui.settingsSaved = false; render(); return;
  }
  if (action === 'reset-recommendation-options') {
    ui.settingsDraft.recommendationOptions = { ...RECOMMENDATION_DEFAULTS };
    ui.settingsDirty = true;
    ui.settingsSaved = false;
    render(); return;
  }
  if (action === 'interest-manage') { ui.interestManaging = !ui.interestManaging; ui.interestSelected.clear(); render(); return; }
  if (action === 'interest-expand') { ui.interestExpanded.has(id) ? ui.interestExpanded.delete(id) : ui.interestExpanded.add(id); render(); return; }
  if (action === 'interest-clear-search') { ui.interestQuery = ''; ui.interestPage = 1; render(); document.getElementById('saved-interest-search')?.focus(); return; }
  if (action === 'interest-prev' || action === 'interest-next') {
    ui.interestPage = savedInterestPage(groupInterests(state,ui.interestGroup), ui.interestQuery, ui.interestPage + (action === 'interest-next' ? 1 : -1), dashboard).page;
    render(); motion.reveal(app.querySelector('.saved-interest-list')); return;
  }
  if (action === 'interest-select-page') { ui.interestSelected = togglePageSelection(ui.interestSelected, interestPage().items); render(); return; }
  if (action === 'remove' || action === 'interest-remove-selected') {
    const ids = action === 'remove' ? [id] : [...ui.interestSelected];
    if (ids.length) await run('interests', () => dispatch({type:'REMOVE_INTERESTS',ids}), 'interestsRemoved');
    return;
  }
  if (action === 'interest-undo' || action === 'interest-dismiss-undo') {
    await run('interests', () => dispatch({type:action === 'interest-undo' ? 'UNDO_REMOVE_INTERESTS' : 'CLEAR_INTEREST_UNDO',token:button.dataset.token}), action === 'interest-undo' ? 'interestsRestored' : undefined);
    return;
  }
  if (action === 'dismiss') { await run(`dismiss:${id}`, () => dispatch({ type: 'DISMISS', id }), 'topicDismissed'); return; }
  if (action === 'postpone-exploration') {
    const token = button.dataset.token;
    await run(`postpone:${token}`, () => dispatch({type:'POSTPONE_EXPLORATION',tokens:[token]}), 'explorationPostponed');
    return;
  }
  if (action === 'save-topic') { const topic = getTopic(id); if (topic) await run(`save:${id}`, () => dispatch({ type: 'ADD_INTEREST', topic }), 'interestSaved', {sound: true}); return; }
  if (action === 'set-focus') { await focusMapTopic(id); return; }
  if (action === 'search') { const topic = getTopic(id); if (topic) await exploreTopic(topic, provider); return; }
  if (action === 'recommend') { await run('recommend', recommend, 'ideasReady'); return; }
  if (action === 'feedback-prev' || action === 'feedback-next') { ui.feedbackPage=paginate(Object.entries(state.discovery.feedback),ui.feedbackPage+(action==='feedback-next'?1:-1)).page;render();return; }
  if (action === 'undo-feedback' || action === 'clear-concept-feedback') {
    const next=await run('feedback',()=>dispatch(action==='undo-feedback'?{type:'UNDO_DISCOVERY_FEEDBACK'}:{type:'CLEAR_CONCEPT_FEEDBACK',conceptId:button.dataset.conceptId}),'feedbackChanged');
    if(next){render();}return;
  }
  if(action==='clear-feedback'){
    if(!await confirmDialog(t('clearAllFeedback'),t('clearFeedbackDescription'),t('clearAllFeedback')))return;
    const next=await run('feedback',()=>dispatch({type:'CLEAR_DISCOVERY_FEEDBACK'}),'feedbackCleared');
    if(next && !next.lastError){ui.feedbackPage=1;render();}return;
  }
  if (action === 'clear-derived' || action === 'reset') {
    const reset = action === 'reset';
    const confirmed = await confirmDialog(t(reset ? 'startOver' : 'confirmClear'), t(reset ? 'resetDescription' : 'clearDescription'), t(reset ? 'reset' : 'clearBrowsing'));
    if (!confirmed) return;
    const next = await run(action, () => dispatch({ type: reset ? 'RESET' : 'CLEAR_DERIVED' }), reset ? 'resetDone' : 'clearDone');
    if (reset && next && !next.lastError) { mapWorkspace?.destroy(); mapWorkspace = null; ui.manual = ''; ui.settingsDirty = false; ui.settingsSaved = false; ui.settingsDraft = snapshotSettings(); ui.galaxyView = null; ui.expandedDescriptions.clear(); ui.feedbackPage = 1; ui.recommendationPage = 1; navigate('interests'); }
  }
}

function navigate(view) {
  if (!VIEWS.includes(view)) return;
  statusFeedback.clear();
  const changed = view !== ui.view;
  if (view !== ui.view) soundEffects.stop();
  ui.view=view;
  syncDiscoverySession(state);
  if (view==='settings' && !ui.settingsDirty) ui.settingsDraft=snapshotSettings();
  const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);
  render({transition:changed});window.scrollTo(0,0);
}

async function finishGuide() {
  ui.guideError=false;
  const next=await run('guide',()=>dispatch({type:'SET_SETTINGS',patch:{tutorialSeen:true,tutorialActive:false}}));
  if (!next?.settings?.tutorialSeen || next.settings.tutorialActive) {ui.guideError=true;render();return false;}
  ui.guideOpen=false;ui.guideAutomatic=false;
  render();
  document.querySelector(`[data-focus="nav-${ui.view}"]`)?.focus({preventScroll:true});
  return true;
}

function confirmDialog(title, description, label) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'confirmation-title');
    dialog.setAttribute('aria-describedby', 'confirmation-description');
    dialog.innerHTML = `<h2 id="confirmation-title">${escape(title)}</h2><p id="confirmation-description">${escape(description)}</p><div class="dialog-actions"><button type="button" data-choice="cancel" autofocus>${text('keepData')}</button><button type="button" class="danger" data-choice="confirm">${escape(label)}</button></div>`;
    document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog, 'cancel'); });
    dialog.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => closeDialog(dialog, button.dataset.choice)));
    dialog.addEventListener('close', () => { const result = dialog.returnValue === 'confirm'; dialog.remove(); resolve(result); }, { once: true });
    openDialog(dialog);
  });
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? t('recently') : date.toLocaleString(language(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

try {
  applyState(await getState());
  unsubscribe = subscribe(applyState);
  unsubscribeFocus = subscribeFocusInvalidation(() => mapWorkspace?.invalidateFocus());
  unsubscribeGalaxyLayout = subscribeGalaxyLayoutInvalidation(() => mapWorkspace?.invalidateGalaxyLayout());
  unsubscribeConnection = subscribeConnectionInvalidation(()=>clearConnectionStatus());
  void ensureInterestInput();
} catch (error) {
  ui.error = error?.message || 'Could not open your saved interests. Please try again.';
  render();
}
window.addEventListener('resize', fitReviewPanel);
window.addEventListener('pagehide', () => { clearInterval(statsClock);clearTimeout(statsToastTimer); motion.destroy(); soundEffects.stop(); unsubscribe?.(); unsubscribeFocus?.(); unsubscribeGalaxyLayout?.(); unsubscribeConnection?.(); connectionSequence++; mapWorkspace?.destroy(); });
function resumeExplorationReview() {
  const changed = !ui.explorationReady;
  ui.explorationReady = true; ui.explorationAway = false;
  if (changed && ui.loaded && ui.view === 'discover' && arr(state?.explorationPrompts).length) render();
}
window.addEventListener('blur', () => {ui.explorationAway = true; soundEffects.stop();});
window.addEventListener('focus', () => {if (ui.explorationAway) resumeExplorationReview();});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {ui.explorationAway = true; soundEffects.stop();}
  else if (ui.explorationAway) resumeExplorationReview();
});
// A side panel can remain visible while another tab has focus. Explicit interaction
// is also a return, without inspecting that tab or replacing a clicked control.
for (const event of ['click','keydown']) document.addEventListener(event, () => {
  if (ui.explorationReady) return;
  ui.explorationReady = true; ui.explorationAway = false;
  setTimeout(() => {
    if (ui.explorationReady && ui.loaded && ui.view === 'discover' && arr(state?.explorationPrompts).length && !app.querySelector('.exploration-review')) render();
  }, 0);
}, {capture:true});
app.addEventListener('click', event => {
  const summary = event.target.closest('summary');
  const details = summary?.parentElement;
  if (details?.tagName !== 'DETAILS') return;
  if (details.hasAttribute('data-action-popover')) return;
  const content = [...details.children].filter(element => element.tagName !== 'SUMMARY');
  if (details.open) content.forEach(element => motion.exit(element));
  else queueMicrotask(() => { if (details.isConnected && details.open) content.forEach(element => motion.reveal(element)); });
}, {capture:true});
attachActionPopovers(app, {reveal: element => motion.reveal(element), exit: element => motion.exit(element)});
